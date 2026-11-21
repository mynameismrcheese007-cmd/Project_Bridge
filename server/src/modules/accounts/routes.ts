import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { config } from '../../config.js';
import { toSignInView } from '../../domain.js';
import { HttpError } from '../../lib/errors.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { authEmailLimiter, loginLimiter, passwordChangeLimiter } from '../../middleware/rateLimit.js';
import { clearSessionCookie, setSessionCookie } from '../../middleware/session.js';
import { validateBody } from '../../middleware/validate.js';
import { ACCEPTED_IMAGE_TYPES } from '../projects/media.js';
import * as profile from './profile.js';
import { changePasswordSchema, emailOnlySchema, googleSchema, loginSchema, registerSchema, resetPasswordSchema, tokenOnlySchema } from './schemas.js';
import * as accounts from './service.js';

/** FR01 / UC01: account access. */
export const accountsRouter = Router();

const maxMb = config.media.maxBytes / (1024 * 1024);
const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.media.maxBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, 'INVALID_FILE', 'The cover photo must be a PNG, JPEG or WebP image.'));
  },
}).single('cover');

/** Runs the upload and turns multer's errors into the API's error shape. */
const cover: RequestHandler = (req, res, next) => {
  coverUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const tooLarge = err.code === 'LIMIT_FILE_SIZE';
      next(new HttpError(400, tooLarge ? 'FILE_TOO_LARGE' : 'INVALID_FILE', tooLarge ? `The cover photo must be at most ${maxMb} MB.` : 'Upload one image, using the "cover" field.'));
      return;
    }
    next(err);
  });
};

/**
 * Tells the client which sign-in options this server supports, so the Google button shows exactly
 * when the server accepts Google sign-ins. The client id is public by design: Google puts it in
 * every sign-in page.
 */
accountsRouter.get('/config', (_req, res) => {
  const googleClientId = config.googleClientId || null;
  res.json({ googleEnabled: googleClientId !== null, googleClientId });
});

// FR01: sign-up only mails a link; the account and its session start when the link is used.
accountsRouter.post('/register', authEmailLimiter, validateBody(registerSchema), async (req, res) => {
  await accounts.register(req.body);
  res.status(202).json({ message: 'Check your email for a link to finish creating your account.' });
});

accountsRouter.post('/verify-email', authEmailLimiter, validateBody(tokenOnlySchema), async (req, res) => {
  const { token, user } = await accounts.verifyEmail(req.body.token);
  setSessionCookie(res, token);
  res.status(201).json({ user: toSignInView(user) });
});

accountsRouter.post('/resend-verification', authEmailLimiter, validateBody(emailOnlySchema), async (req, res) => {
  await accounts.resendVerification(req.body.email);
  res.json({ message: 'If a sign-up is waiting for that email, a new link is on its way.' });
});

accountsRouter.post('/login', loginLimiter, validateBody(loginSchema), async (req, res) => {
  const { token, user } = await accounts.login(req.body.email, req.body.password);
  setSessionCookie(res, token);
  res.json({ user: toSignInView(user) });
});

accountsRouter.post('/google', loginLimiter, validateBody(googleSchema), async (req, res) => {
  const { token, user } = await accounts.loginWithGoogle(req.body.credential, req.body.acceptPolicy === true);
  setSessionCookie(res, token);
  res.json({ user: toSignInView(user) });
});

accountsRouter.post('/logout', async (req, res) => {
  if (req.sessionId) await accounts.logout(req.sessionId);
  clearSessionCookie(res);
  res.status(204).end();
});

accountsRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/** The signed-in user's own cover photo and activity statistics. Reading, so RESTRICTED accounts may too. */
accountsRouter.get('/me/profile', requireAuth, async (req, res) => {
  res.json(await profile.myProfile(req.user!));
});

// Changing one's own profile is editing, so it shares the `edit` gate: every role, not while RESTRICTED.
accountsRouter.post('/me/cover', requirePermission('edit'), cover, async (req, res) => {
  res.json(await profile.setProfileCover(req.user!, req.file));
});

accountsRouter.delete('/me/cover', requirePermission('edit'), async (req, res) => {
  await profile.removeProfileCover(req.user!);
  res.status(204).end();
});

// Securing one's own account, so a RESTRICTED account may too. This device stays signed in; every other one is signed out.
accountsRouter.post('/me/password', requireAuth, passwordChangeLimiter, validateBody(changePasswordSchema), async (req, res) => {
  await accounts.changePassword(req.user!, req.sessionId!, req.body.currentPassword, req.body.newPassword);
  res.json({ message: 'Your password has been changed. Every other device has been signed out.' });
});

accountsRouter.post('/forgot-password', authEmailLimiter, validateBody(emailOnlySchema), async (req, res) => {
  await accounts.forgotPassword(req.body.email);
  res.json({ message: 'If an account exists for that email, a password reset link is on its way.' });
});

accountsRouter.post('/reset-password', authEmailLimiter, validateBody(resetPasswordSchema), async (req, res) => {
  await accounts.resetPassword(req.body.token, req.body.password);
  clearSessionCookie(res);
  res.json({ message: 'Your password has been changed. Please sign in with the new password.' });
});
