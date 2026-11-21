import bcrypt from 'bcryptjs';
import type { Prisma, User } from '@prisma/client';
import { config } from '../../config.js';
import { BLOCKED_STATUSES, toAuthUser, type AuthUser } from '../../domain.js';
import { audit as writeAudit } from '../../lib/audit.js';
import { HttpError } from '../../lib/errors.js';
import { getGoogleVerifier } from '../../lib/google.js';
import { getMailer } from '../../lib/mailer.js';
import { prisma, TX_OPTIONS } from '../../lib/prisma.js';
import { hashToken, randomToken } from '../../lib/tokens.js';

// Compared against when the email is unknown, so response time does not reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('projectbridge-dummy-password', 4);

function audit(action: string, targetId: string | null, actorId: string | null = targetId, reason?: string) {
  return writeAudit({ action, actorId, targetType: 'User', targetId, reason });
}

function assertNotBlocked(user: User): void {
  if (BLOCKED_STATUSES.includes(user.status)) {
    const state = user.status === 'BANNED' ? 'banned' : 'suspended';
    throw new HttpError(
      403,
      'ACCOUNT_DISABLED',
      `This account has been ${state}. Contact the ProjectBridge administrators if you believe this is a mistake.`,
    );
  }
}

async function refuseIfBlocked(user: User): Promise<void> {
  if (BLOCKED_STATUSES.includes(user.status)) await audit('LOGIN_BLOCKED', user.id, user.id, user.status);
  assertNotBlocked(user);
}

/** Starts a server-side session; the returned secret goes into the session cookie. */
async function createSession(user: User, client: Prisma.TransactionClient = prisma): Promise<{ token: string; user: AuthUser }> {
  const token = randomToken();
  await client.session.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + config.sessionTtlMs) },
  });
  return { token, user: toAuthUser(user) };
}

function invalidCredentials(): HttpError {
  return new HttpError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
}

function linkAlreadyUsed(): HttpError {
  return new HttpError(400, 'INVALID_TOKEN', 'This link has already been used.');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function emailTaken(): HttpError {
  return new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.', {
    email: 'An account with this email already exists. Try signing in or resetting your password.',
  });
}

function invalidVerifyLink(): HttpError {
  return new HttpError(400, 'INVALID_TOKEN', 'This verification link is invalid or has expired. Sign up again or ask for a new link.');
}

/** Mails a new one-time link for a pending sign-up; the address must be proven before an account exists. */
async function sendVerifyLink(email: string, name: string, token: string): Promise<boolean> {
  const link = `${config.appUrl}/verify-email?token=${token}`;
  const { sent } = await getMailer().send({
    to: email,
    subject: 'Confirm your email for ProjectBridge',
    text: `Hi ${name},\n\nConfirm your email to finish creating your ProjectBridge account:\n${link}\n\nThis link expires in 24 hours. If you did not sign up, ignore this email and no account will be created.`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>Confirm your email to finish creating your ProjectBridge account:</p><p><a href="${link}">Confirm my email</a></p><p>This link expires in 24 hours. If you did not sign up, ignore this email and no account will be created.</p>`,
  });
  return sent;
}

/**
 * FR01: starts a sign-up. No account exists until the emailed link is used, so nobody can hold an
 * address they cannot read. Signing up again with the same address replaces the earlier pending
 * sign-up and its link.
 */
export async function register(input: { name: string; email: string; password: string }): Promise<void> {
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw emailTaken();
  const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
  const token = randomToken();
  const pending = { name: input.name, passwordHash, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + config.verifyTokenTtlMs) };
  await prisma.pendingRegistration.upsert({ where: { email: input.email }, create: { email: input.email, ...pending }, update: pending });
  // The pending sign-up stays, so "Send a new link" can try again once mail works.
  if (!(await sendVerifyLink(input.email, input.name, token))) {
    throw new HttpError(502, 'MAIL_FAILED', 'We could not send the confirmation email. Please try again in a few minutes.');
  }
}

/** Mails a fresh link for a pending sign-up. Always succeeds from the caller's view, so it cannot probe for addresses. */
export async function resendVerification(email: string): Promise<void> {
  const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
  if (!pending) return;
  const token = randomToken();
  await prisma.pendingRegistration.update({
    where: { id: pending.id },
    data: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + config.verifyTokenTtlMs) },
  });
  await sendVerifyLink(email, pending.name, token);
}

/** Uses a sign-up link: creates the Uploader with the details from sign-up and signs them in. */
export async function verifyEmail(token: string) {
  const pending = await prisma.pendingRegistration.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!pending || pending.expiresAt <= new Date()) throw invalidVerifyLink();
  const session = await prisma.$transaction(async (tx) => {
    // Conditional, so two clicks on one link cannot both create the account.
    const now = new Date();
    const { count } = await tx.pendingRegistration.deleteMany({ where: { id: pending.id, tokenHash: pending.tokenHash, expiresAt: { gt: now } } });
    if (count === 0) throw invalidVerifyLink();
    // Google sign-in may have created the account for this address in the meantime.
    if (await tx.user.findUnique({ where: { email: pending.email } })) throw emailTaken();
    const user = await tx.user.create({
      data: { name: pending.name, email: pending.email, passwordHash: pending.passwordHash, role: 'UPLOADER', status: 'ACTIVE', emailVerifiedAt: now },
    });
    // Committed together, so a Google link that can see this account also removes its session.
    return createSession(user, tx);
  }, TX_OPTIONS);
  await audit('USER_REGISTERED', session.user.id);
  return session;
}

function emailUnverified(): HttpError {
  return new HttpError(403, 'EMAIL_UNVERIFIED', 'Please confirm your email first. Use the link we sent you, or ask for a new one.');
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  const pending = user ? null : await prisma.pendingRegistration.findUnique({ where: { email } });
  // Google-only accounts have no password, so they fail here exactly like a wrong password.
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? pending?.passwordHash ?? DUMMY_HASH);
  // Only the person who chose the password learns that the sign-up is waiting for its link.
  if (pending && passwordOk) throw emailUnverified();
  if (!user?.passwordHash || !passwordOk) {
    await audit('LOGIN_FAILED', user?.id ?? null, null, user ? 'wrong password' : 'unknown email');
    throw invalidCredentials();
  }
  await refuseIfBlocked(user);

  const verifiedHash = user.passwordHash;
  const session = await prisma.$transaction(async (tx) => {
    // Locks the user row, so a Google link or password reset either commits later and removes this
    // session, or commits first and this matches nothing. Writing updatedAt back keeps it unchanged.
    const { count } = await tx.user.updateMany({
      where: { id: user.id, passwordHash: verifiedHash },
      data: { updatedAt: user.updatedAt },
    });
    return count === 0 ? null : createSession(user, tx);
  }, TX_OPTIONS);
  if (!session) {
    await audit('LOGIN_FAILED', user.id, null, 'password changed during sign-in');
    throw invalidCredentials();
  }
  await audit('LOGIN_SUCCEEDED', user.id);
  return session;
}

/**
 * Links Google to an account found by email. Accounts made before sign-up links existed never proved
 * their address, so whoever registered it may not be its owner: their password, sessions and unused
 * reset links all go. The Google user can get a password back through forgot-password, which mails
 * that address. The user row comes first, as in every transaction here, so a sign-up, password
 * sign-in or reset in flight either commits first and is cleared here, or runs afterwards and finds
 * its password or link gone.
 */
async function linkGoogle(existing: User, googleId: string): Promise<User> {
  const userId = existing.id;
  const [user] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { googleId, passwordHash: null, emailVerifiedAt: existing.emailVerifiedAt ?? new Date() } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.emailToken.deleteMany({ where: { userId, type: 'RESET', usedAt: null } }),
  ]);
  return user;
}

/**
 * Signs in with a Google ID token. The account is found by Google ID, otherwise linked by
 * email (Google has verified the address), otherwise created as a new Uploader.
 */
export async function loginWithGoogle(credential: string) {
  if (!config.googleClientId) {
    throw new HttpError(503, 'GOOGLE_DISABLED', 'Google sign-in is not configured on this server.');
  }
  const identity = await getGoogleVerifier()(credential);
  if (!identity) {
    await audit('LOGIN_FAILED', null, null, 'invalid Google token');
    throw new HttpError(401, 'INVALID_GOOGLE_TOKEN', 'Google sign-in failed. Please try again.');
  }
  if (!identity.emailVerified) {
    throw new HttpError(403, 'GOOGLE_EMAIL_UNVERIFIED', 'Your Google account email is not verified.');
  }

  let user = await prisma.user.findUnique({ where: { googleId: identity.sub } });
  let action = 'LOGIN_GOOGLE';
  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email: identity.email } });
    if (byEmail) {
      // Before any write, so a blocked account stays exactly as it was.
      await refuseIfBlocked(byEmail);
      user = await linkGoogle(byEmail, identity.sub);
      action = 'GOOGLE_LINKED';
    } else {
      // Google has proven the address, so any sign-up still waiting for its link is dropped.
      [, user] = await prisma.$transaction([
        prisma.pendingRegistration.deleteMany({ where: { email: identity.email } }),
        prisma.user.create({
          data: { name: identity.name.slice(0, 80), email: identity.email, googleId: identity.sub, role: 'UPLOADER', emailVerifiedAt: new Date() },
        }),
      ]);
      action = 'USER_REGISTERED_GOOGLE';
    }
  }
  await refuseIfBlocked(user);
  await audit(action, user.id);
  return createSession(user);
}

export async function logout(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

/**
 * Changes the password of the signed-in account after checking the current one. Other sessions and
 * unused reset links end with the old password; the session making the change is kept.
 */
export async function changePassword(user: AuthUser, sessionId: string, currentPassword: string, newPassword: string): Promise<void> {
  const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!record.passwordHash) {
    throw new HttpError(400, 'NO_PASSWORD', 'You sign in with Google and have no password yet. Use the emailed link to set one.');
  }
  if (!(await bcrypt.compare(currentPassword, record.passwordHash))) {
    await audit('PASSWORD_CHANGE_FAILED', user.id);
    throw new HttpError(400, 'WRONG_PASSWORD', 'Your current password is not correct.', { currentPassword: 'Your current password is not correct.' });
  }
  if (await bcrypt.compare(newPassword, record.passwordHash)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Choose a password different from your current one.', { newPassword: 'Choose a password different from your current one.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
  await prisma.$transaction(async (tx) => {
    // Conditional on the hash just checked, so a reset or Google link committed meanwhile wins.
    const { count } = await tx.user.updateMany({ where: { id: user.id, passwordHash: record.passwordHash }, data: { passwordHash } });
    if (count === 0) throw new HttpError(409, 'PASSWORD_CHANGED', 'Your password was changed elsewhere just now. Sign in again to continue.');
    await tx.session.deleteMany({ where: { userId: user.id, id: { not: sessionId } } });
    await tx.emailToken.deleteMany({ where: { userId: user.id, type: 'RESET', usedAt: null } });
    await writeAudit({ action: 'PASSWORD_CHANGED', actorId: user.id, targetType: 'User', targetId: user.id }, tx);
  }, TX_OPTIONS);
}

/** Always succeeds from the caller's view so it cannot be used to probe for accounts. */
export async function forgotPassword(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || BLOCKED_STATUSES.includes(user.status)) return;

  const token = randomToken();
  await prisma.$transaction([
    // The user row goes first, as in linkGoogle, so the two cannot deadlock. Writing updatedAt back keeps it unchanged.
    prisma.user.update({ where: { id: user.id }, data: { updatedAt: user.updatedAt } }),
    // A new link replaces any earlier unused one.
    prisma.emailToken.deleteMany({ where: { userId: user.id, type: 'RESET', usedAt: null } }),
    prisma.emailToken.create({
      data: {
        userId: user.id,
        type: 'RESET',
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + config.resetTokenTtlMs),
      },
    }),
  ]);
  const link = `${config.appUrl}/reset-password?token=${token}`;
  await getMailer().send({
    to: user.email,
    subject: 'Reset your ProjectBridge password',
    text: `Hi ${user.name},\n\nUse this link to choose a new password:\n${link}\n\nThis link expires in 1 hour. If you did not ask for a reset, ignore this email; your password is unchanged.`,
    html: `<p>Hi ${escapeHtml(user.name)},</p><p>Use this link to choose a new password:</p><p><a href="${link}">Reset my password</a></p><p>This link expires in 1 hour. If you did not ask for a reset, ignore this email; your password is unchanged.</p>`,
  });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const record = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!record || record.type !== 'RESET' || record.usedAt || record.expiresAt <= new Date()) {
    throw new HttpError(400, 'INVALID_TOKEN', 'This password reset link is invalid or has expired. Please request a new one.');
  }
  // A blocked account's link is used up, and nothing else on the account changes.
  if (BLOCKED_STATUSES.includes(record.user.status)) {
    const { count } = await prisma.emailToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) throw linkAlreadyUsed();
    assertNotBlocked(record.user);
  }

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  await prisma.$transaction(async (tx) => {
    // The user row goes first, as in linkGoogle, so the two cannot deadlock.
    // Using the emailed link also proves the address.
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash, emailVerifiedAt: record.user.emailVerifiedAt ?? new Date() } });
    // Conditional update so two simultaneous requests cannot both use the same token. No match also
    // covers a link cancelled while hashing above, and throwing rolls the new password back.
    const now = new Date();
    const { count } = await tx.emailToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count === 0) throw linkAlreadyUsed();
    // Sign out every device that used the old password.
    await tx.session.deleteMany({ where: { userId: record.userId } });
  }, TX_OPTIONS);
  await audit('PASSWORD_RESET', record.userId);
}
