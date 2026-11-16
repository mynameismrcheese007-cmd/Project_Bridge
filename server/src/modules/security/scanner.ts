/**
 * Security audit for uploaded projects (FR02, FR13, NFR-S4).
 *
 * Projects carry no source code, so the ways a malicious upload can hurt someone are: text that
 * tries to run (script or HTML payloads, download-and-run commands), links that lead to malware or
 * phishing, and image files that hide something besides the picture. Every check here is a fixed
 * rule over the content itself, so the same content always gets the same verdict, and nothing is
 * sent to an outside service.
 *
 * Verdicts: WELL (no findings), SUSPICIOUS (an Admin should look before approving), DANGEROUS
 * (approval needs an explicit override with a reason).
 */

export type Severity = 'SUSPICIOUS' | 'DANGEROUS';
export type Verdict = 'WELL' | Severity;

export interface Finding {
  /** Stable rule name, e.g. SCRIPT_TAG. */
  code: string;
  severity: Severity;
  /** Which part of the project: title, summary, problem, overview, tags, demoUrl, image. */
  field: string;
  /** Plain explanation for the Admin. */
  message: string;
  /** A short piece of the matching text, so the Admin can find it. Never more than 80 characters. */
  excerpt?: string;
}

export interface AuditResult {
  verdict: Verdict;
  findings: Finding[];
}

export interface ScannableContent {
  title: string;
  summary: string;
  problem: string;
  overview: string;
  tags: string[];
  demoUrl: string | null;
}

// ---------------------------------------------------------------- Text rules

interface TextRule {
  code: string;
  severity: Severity;
  pattern: RegExp;
  message: string;
}

const TEXT_RULES: TextRule[] = [
  { code: 'SCRIPT_TAG', severity: 'DANGEROUS', pattern: /<\s*script\b/i, message: 'Contains a <script> tag.' },
  { code: 'EMBEDDED_FRAME', severity: 'DANGEROUS', pattern: /<\s*(iframe|object|embed|frameset)\b/i, message: 'Embeds another page or plug-in (iframe, object or embed).' },
  { code: 'HTML_EVENT_HANDLER', severity: 'DANGEROUS', pattern: /<[a-z][^>]*\son[a-z]+\s*=/i, message: 'An HTML tag with an event handler (onload=, onerror=, …) that would run code.' },
  { code: 'SCRIPT_URI', severity: 'DANGEROUS', pattern: /\b(javascript|vbscript)\s*:/i, message: 'A javascript: or vbscript: link, which runs code when clicked.' },
  { code: 'HTML_DATA_URI', severity: 'DANGEROUS', pattern: /data:\s*(text\/html|application\/(x-)?javascript|image\/svg\+xml)/i, message: 'A data: link carrying HTML, script or SVG.' },
  {
    code: 'DOWNLOAD_AND_RUN',
    severity: 'DANGEROUS',
    pattern: /\b(curl|wget|iwr|invoke-webrequest)\b[^\n|]{0,200}\|\s*(sudo\s+)?(ba|z)?sh\b|\b(curl|wget)\b[^\n]{0,200}\|\s*(python3?|perl|ruby|node)\b|\biex\s*\(|\binvoke-expression\b|\bcertutil\b[^\n]{0,60}-urlcache|\bmshta\b|\bregsvr32\b[^\n]{0,60}\/i:/i,
    message: 'A command that downloads something and runs it straight away.',
  },
  { code: 'ENCODED_POWERSHELL', severity: 'DANGEROUS', pattern: /\bpowershell(\.exe)?\b[^\n]{0,80}\s-(e|enc|encodedcommand)\s+[A-Za-z0-9+/=]{20,}/i, message: 'A PowerShell command with a hidden (encoded) payload.' },
  { code: 'DESTRUCTIVE_COMMAND', severity: 'DANGEROUS', pattern: /\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(--no-preserve-root\s+)?\/(\s|$|\*)|:\(\)\s*\{\s*:\|:&\s*\};:|\bformat\s+c:/i, message: 'A command that would wipe a computer.' },
  { code: 'CRYPTO_MINER', severity: 'DANGEROUS', pattern: /\b(coinhive|cryptoloot|xmrig|minergate)\b|stratum\+tcp:\/\//i, message: 'Mentions a cryptocurrency miner or mining pool.' },
  { code: 'CREDENTIAL_FORM', severity: 'SUSPICIOUS', pattern: /<\s*form\b|<\s*input\b[^>]*type\s*=\s*["']?password/i, message: 'Contains an HTML form or password field, as used in phishing.' },
  { code: 'OTHER_HTML', severity: 'SUSPICIOUS', pattern: /<\s*(a|img|svg|link|meta|style|base)\b[^>]*>/i, message: 'Contains HTML markup. It is shown as plain text, but it has no place in a project description.' },
  { code: 'OBFUSCATED_CODE', severity: 'SUSPICIOUS', pattern: /\b(eval|atob|unescape)\s*\(|String\.fromCharCode\s*\(|(\\x[0-9a-f]{2}){8,}|(\\u[0-9a-f]{4}){8,}|(%[0-9a-f]{2}){12,}/i, message: 'Looks like hidden or obfuscated code (eval, atob, long escape sequences).' },
  { code: 'LONG_ENCODED_BLOB', severity: 'SUSPICIOUS', pattern: /[A-Za-z0-9+/]{200,}={0,2}/, message: 'A very long encoded block (base64-like), which can hide a payload.' },
  { code: 'HIDDEN_CHARACTERS', severity: 'SUSPICIOUS', pattern: /[\u202A-\u202E\u2066-\u2069\u200B-\u200F\u2060\uFEFF]/, message: 'Invisible or text-direction control characters, which can disguise what text really says.' },
];

function excerpt(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 15);
  const piece = text.slice(start, Math.min(text.length, index + Math.max(length, 1) + 15));
  // Shown to an Admin as text; control characters are made visible rather than passed on.
  const visible = piece.replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069\u200B-\u200F\u2060\uFEFF]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return visible.length > 80 ? `${visible.slice(0, 77)}...` : visible;
}

export function scanText(field: string, text: string): Finding[] {
  if (!text) return [];
  const findings: Finding[] = [];
  for (const rule of TEXT_RULES) {
    const m = rule.pattern.exec(text);
    if (m) findings.push({ code: rule.code, severity: rule.severity, field, message: rule.message, excerpt: excerpt(text, m.index, m[0].length) });
  }
  // Every link written into the text gets the same checks as the demo link.
  const links = text.match(/\bhttps?:\/\/[^\s<>"'()]+/gi) ?? [];
  for (const link of [...new Set(links)].slice(0, 50)) findings.push(...scanUrl(field, link));
  return findings;
}

// ---------------------------------------------------------------- Link rules

const EXECUTABLE_EXT = /\.(exe|msi|bat|cmd|com|scr|pif|ps1|vbs|vbe|js|jse|wsf|hta|cpl|jar|apk|dmg|pkg|app|deb|rpm|sh|run|bin|dll|lnk|iso|img)$/i;
const ARCHIVE_EXT = /\.(zip|rar|7z|tar|gz|tgz|bz2|xz)$/i;
const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'ow.ly', 'cutt.ly', 'rb.gy', 'shorturl.at', 'tiny.cc', 'buff.ly', 'rebrand.ly', 'v.gd', 'bl.ink', 'lnkd.in', 's.id']);
const TUNNEL_OR_DYNAMIC_DNS = /(^|\.)(ngrok\.io|ngrok-free\.app|ngrok\.app|trycloudflare\.com|serveo\.net|localtunnel\.me|loca\.lt|duckdns\.org|no-ip\.(com|org|biz)|ddns\.net|hopto\.org|zapto\.org|sytes\.net)$/i;

function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
}

function isPrivateHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '[::1]'
  );
}

export function scanUrl(field: string, raw: string): Finding[] {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return [{ code: 'UNREADABLE_LINK', severity: 'SUSPICIOUS', field, message: 'A link that cannot be read as a web address.', excerpt: excerpt(raw, 0, raw.length) }];
  }
  const findings: Finding[] = [];
  const add = (code: string, severity: Severity, message: string) => findings.push({ code, severity, field, message, excerpt: excerpt(raw, 0, raw.length) });
  const host = url.hostname.toLowerCase();
  const path = decodeURIComponentSafe(url.pathname);

  if (!['https:', 'http:'].includes(url.protocol)) add('UNSAFE_LINK_SCHEME', 'DANGEROUS', `A link using ${url.protocol}, not a web page.`);
  else if (url.protocol === 'http:' && field === 'demoUrl') add('INSECURE_LINK', 'SUSPICIOUS', 'The demo link is not HTTPS.');
  if (url.username || url.password) add('LINK_WITH_CREDENTIALS', 'DANGEROUS', 'A link with a user name or password in it, a common phishing trick.');
  if (EXECUTABLE_EXT.test(path)) add('EXECUTABLE_DOWNLOAD', 'DANGEROUS', 'A link straight to a program or installer download.');
  else if (ARCHIVE_EXT.test(path)) add('ARCHIVE_DOWNLOAD', 'SUSPICIOUS', 'A link straight to an archive download.');
  if (isPrivateHost(host)) add('PRIVATE_ADDRESS', 'SUSPICIOUS', 'A link to a local or private network address that others cannot reach.');
  else if (isIpLiteral(host)) add('IP_ADDRESS_LINK', 'SUSPICIOUS', 'A link to a bare IP address instead of a domain name.');
  if (host.split('.').some((label) => label.startsWith('xn--'))) add('LOOKALIKE_DOMAIN', 'SUSPICIOUS', 'An internationalised (punycode) domain, which can imitate a well-known site.');
  if (SHORTENERS.has(host)) add('SHORTENED_LINK', 'SUSPICIOUS', 'A shortened link that hides where it really goes.');
  if (TUNNEL_OR_DYNAMIC_DNS.test(host)) add('TUNNEL_OR_DYNAMIC_DNS', 'SUSPICIOUS', 'A tunnel or dynamic-DNS address, often used for short-lived or personal machines.');
  if (url.port && !['80', '443'].includes(url.port)) add('UNUSUAL_PORT', 'SUSPICIOUS', `A link on an unusual port (${url.port}).`);
  return findings;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ---------------------------------------------------------------- Image rules

/** Byte patterns that have no place inside a picture. */
const HIDDEN_PAYLOADS: Array<{ code: string; pattern: RegExp; message: string }> = [
  { code: 'IMAGE_HIDES_SCRIPT', pattern: /<\s*script\b|<\s*iframe\b|javascript:/i, message: 'The image file contains HTML or script code.' },
  { code: 'IMAGE_HIDES_SERVER_CODE', pattern: /<\?php|<%@|<%=|eval\s*\(\s*(base64_decode|gzinflate|\$_(GET|POST|REQUEST))/i, message: 'The image file contains server-side code (a "web shell" hidden in a picture).' },
  { code: 'IMAGE_HIDES_PROGRAM', pattern: /\x7fELF[\x01\x02][\x01\x02]|#!\/bin\/(ba)?sh|#!\/usr\/bin\/env\s/, message: 'The image file contains a program or shell script.' },
];

/**
 * A Windows program starts with "MZ" and names, at byte 0x3C, where its "PE" header is. Following
 * that pointer is exact and takes linear time even on a crafted file full of "MZ" pairs.
 */
function hasWindowsProgram(data: Buffer): boolean {
  const pe = Buffer.from('PE\0\0', 'latin1');
  for (let at = data.indexOf(pe), checked = 0; at >= 0 && checked < 64; at = data.indexOf(pe, at + 1), checked++) {
    for (let mz = data.lastIndexOf('MZ', at, 'latin1'), tries = 0; mz >= 0 && at - mz <= 1024 && tries < 64; mz = data.lastIndexOf('MZ', mz - 1, 'latin1'), tries++) {
      if (mz + 0x40 <= data.length && mz + data.readUInt32LE(mz + 0x3c) === at) return true;
      if (mz === 0) break;
    }
  }
  return false;
}

/** Where a PNG, JPEG or WebP really ends; anything after that is hidden cargo. */
function imageEnd(ext: string, data: Buffer): number | null {
  if (ext === 'png') {
    const at = data.lastIndexOf(Buffer.from('IEND'));
    return at < 0 ? null : at + 8; // chunk type + CRC
  }
  if (ext === 'jpg') {
    const at = data.lastIndexOf(Buffer.from([0xff, 0xd9]));
    return at < 0 ? null : at + 2;
  }
  if (ext === 'webp') {
    return data.length >= 8 ? Math.min(data.length, data.readUInt32LE(4) + 8) : null;
  }
  return null;
}

export function scanImage(ext: string, data: Buffer): Finding[] {
  const findings: Finding[] = [];
  const end = imageEnd(ext, data);
  if (end === null) {
    findings.push({ code: 'IMAGE_MALFORMED', severity: 'DANGEROUS', field: 'image', message: 'The image file is damaged or not a complete picture.' });
  } else if (data.length - end > 16) {
    findings.push({ code: 'IMAGE_TRAILING_DATA', severity: 'DANGEROUS', field: 'image', message: `The file carries ${data.length - end} extra bytes after the picture ends, a way to smuggle files inside images.` });
  }
  // latin1 keeps one character per byte, so the patterns can scan binary safely.
  const bytes = data.toString('latin1');
  for (const rule of HIDDEN_PAYLOADS) {
    if (rule.pattern.test(bytes)) findings.push({ code: rule.code, severity: 'DANGEROUS', field: 'image', message: rule.message });
  }
  if (hasWindowsProgram(data) && !findings.some((f) => f.code === 'IMAGE_HIDES_PROGRAM')) {
    findings.push({ code: 'IMAGE_HIDES_PROGRAM', severity: 'DANGEROUS', field: 'image', message: 'The image file contains a Windows program.' });
  }
  return findings;
}

// ---------------------------------------------------------------- Whole project

export function verdictOf(findings: Finding[]): Verdict {
  if (findings.some((f) => f.severity === 'DANGEROUS')) return 'DANGEROUS';
  if (findings.length > 0) return 'SUSPICIOUS';
  return 'WELL';
}

/** Scans everything an Admin is asked to approve. Duplicate findings are reported once. */
export function auditContent(content: ScannableContent): AuditResult {
  const findings = [
    ...scanText('title', content.title),
    ...scanText('summary', content.summary),
    ...scanText('problem', content.problem),
    ...scanText('overview', content.overview),
    ...scanText('tags', content.tags.join(' ')),
    ...(content.demoUrl ? scanUrl('demoUrl', content.demoUrl) : []),
  ];
  const seen = new Set<string>();
  const unique = findings.filter((f) => {
    const key = `${f.field}:${f.code}:${f.excerpt ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Most serious first.
  unique.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'DANGEROUS' ? -1 : 1));
  return { verdict: verdictOf(unique), findings: unique };
}
