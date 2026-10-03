// Küchenplaner-Server: Benutzerkonten, Sitzungen und gespeicherte Planungen.
// Start: node server/index.ts  (Node >= 22.18, nutzt eingebautes SQLite + Type Stripping)

import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLibrary, type Resolution, type Source } from './library.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.DATA_DIR ?? join(ROOT, 'data');
const PORT = Number(process.env.PORT ?? 3001);
const SESSION_DAYS = 30;
const SESSION_COOKIE = 'kp_session';
const SECURE_COOKIE = process.env.COOKIE_SECURE === '1';
/** Hinter einem Reverse Proxy (Zoraxy): echte Client-IP aus X-Forwarded-For übernehmen */
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(DATA_DIR, 'kuechenplaner.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    thumbnail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
// Migration: Kontostatus (active = darf das Tool nutzen, pending = wartet auf Freigabe)
if (!(db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).some((c) => c.name === 'status')) {
  db.exec(`ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending'))`);
}
// Migration: Freigabe-Link je Planung (nur lesender Showroom)
if (!(db.prepare('PRAGMA table_info(projects)').all() as { name: string }[]).some((c) => c.name === 'share_token')) {
  db.exec('ALTER TABLE projects ADD COLUMN share_token TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_share ON projects(share_token) WHERE share_token IS NOT NULL');
}

// Systemeinstellungen (vom Administrator änderbar)
interface Settings {
  registrationEnabled: boolean;
  requireApproval: boolean;
}
const SETTING_DEFAULTS: Settings = { registrationEnabled: true, requireApproval: false };

function getSettings(): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) if (r.key in out) (out as any)[r.key] = r.value === '1';
  return out;
}

function setSetting(key: keyof Settings, value: boolean) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value ? '1' : '0');
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen

function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(pw: string, stored: string) {
  const [alg, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(pw, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(expected, actual);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  status: 'active' | 'pending';
  password_hash: string;
  created_at: string;
}

const publicUser = (u: UserRow) => ({ id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, createdAt: u.created_at });

function parseCookies(header: string | undefined) {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(res: Response, token: string | null) {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (SECURE_COOKIE) attrs.push('Secure');
  if (token) attrs.push(`Max-Age=${SESSION_DAYS * 86400}`);
  else attrs.push('Max-Age=0');
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token ?? ''}; ${attrs.join('; ')}`);
}

function createSession(res: Response, userId: number) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, expires);
  setSessionCookie(res, token);
}

declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
      sessionHash?: string;
    }
  }
}

function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) {
    const h = sha256(token);
    const row = db
      .prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`)
      .get(h, new Date().toISOString()) as UserRow | undefined;
    if (row) {
      req.user = row;
      req.sessionHash = h;
    }
  }
  next();
}

function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Bitte anmelden.' });
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Nur für Administratoren.' });
  next();
}

// einfache Bremse gegen Passwort-Raten: max. 10 Fehlversuche pro 15 Min. je IP + E-Mail
const failures = new Map<string, { count: number; until: number }>();
function tooManyAttempts(key: string) {
  const f = failures.get(key);
  return !!f && f.count >= 10 && f.until > Date.now();
}
function noteFailure(key: string) {
  const f = failures.get(key);
  if (!f || f.until < Date.now()) failures.set(key, { count: 1, until: Date.now() + 15 * 60_000 });
  else f.count++;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ---------------------------------------------------------------------------

const app = express();
app.disable('x-powered-by');
if (TRUST_PROXY) app.set('trust proxy', 1);

// einfache Sicherheits-Header
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Gesundheitscheck für Docker
app.get('/healthz', (_req, res) => {
  db.prepare('SELECT 1').get();
  res.type('text').send('ok');
});
app.use(express.json({ limit: '60mb' }));
app.use(loadUser);

// Nur JSON-Anfragen für schreibende API-Aufrufe (erschwert CSRF über einfache Formulare)
app.use('/api', (req, res, next) => {
  if ((req.method === 'POST' || req.method === 'PUT') && !req.is('application/json')) return res.status(415).json({ error: 'JSON erwartet.' });
  next();
});

// --- Konto ---

app.get('/api/auth/me', (req, res) => {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  const st = getSettings();
  res.json({
    user: req.user ? publicUser(req.user) : null,
    firstUser: count === 0,
    // das erste Konto (Administrator) kann immer angelegt werden
    registrationEnabled: count === 0 || st.registrationEnabled,
    requireApproval: count > 0 && st.requireApproval,
  });
});

app.post('/api/auth/register', (req, res) => {
  const email = str(req.body?.email).toLowerCase();
  const name = str(req.body?.name, 80) || email.split('@')[0];
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' });
  if (password.length < 8) return res.status(400).json({ error: 'Das Passwort muss mindestens 8 Zeichen haben.' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'Diese E-Mail ist bereits registriert.' });

  const passwordHash = hashPassword(password);
  // Der erste Benutzer wird Administrator (atomar in einer Transaktion)
  db.exec('BEGIN IMMEDIATE');
  let user: UserRow;
  try {
    const count = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
    const st = getSettings();
    if (count > 0 && !st.registrationEnabled) {
      db.exec('ROLLBACK');
      return res.status(403).json({ error: 'Die Registrierung ist derzeit deaktiviert.' });
    }
    const role = count === 0 ? 'admin' : 'user';
    const status = count > 0 && st.requireApproval ? 'pending' : 'active';
    const r = db.prepare('INSERT INTO users (email, name, password_hash, role, status) VALUES (?, ?, ?, ?, ?)').run(email, name, passwordHash, role, status);
    db.exec('COMMIT');
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid) as unknown as UserRow;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  if (user.status === 'pending') {
    return res.status(201).json({ user: null, pending: true, message: 'Dein Konto wurde angelegt und muss noch von einem Administrator freigegeben werden.' });
  }
  createSession(res, user.id);
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const email = str(req.body?.email).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const key = `${req.ip}|${email}`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    noteFailure(key);
    return res.status(401).json({ error: 'E-Mail oder Passwort ist falsch.' });
  }
  failures.delete(key);
  if (user.status === 'pending') return res.status(403).json({ error: 'Dein Konto wurde noch nicht von einem Administrator freigegeben.' });
  createSession(res, user.id);
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.sessionHash) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.sessionHash);
  setSessionCookie(res, null);
  res.json({ ok: true });
});

app.post('/api/auth/password', requireUser, (req, res) => {
  const current = typeof req.body?.current === 'string' ? req.body.current : '';
  const next = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!verifyPassword(current, req.user!.password_hash)) return res.status(400).json({ error: 'Aktuelles Passwort ist falsch.' });
  if (next.length < 8) return res.status(400).json({ error: 'Das neue Passwort muss mindestens 8 Zeichen haben.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user!.id);
  // alle anderen Sitzungen beenden
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(req.user!.id, req.sessionHash!);
  res.json({ ok: true });
});

// --- Planungen ---

const projectMeta = (p: any) => ({ id: p.id, name: p.name, thumbnail: p.thumbnail, createdAt: p.created_at, updatedAt: p.updated_at, shareToken: p.share_token ?? null });

app.get('/api/projects', requireUser, (req, res) => {
  const rows = db.prepare('SELECT id, name, thumbnail, created_at, updated_at, share_token FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(req.user!.id);
  res.json({ projects: rows.map(projectMeta) });
});

app.get('/api/projects/:id', requireUser, (req, res) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user!.id) as any;
  if (!row) return res.status(404).json({ error: 'Planung nicht gefunden.' });
  res.json({ ...projectMeta(row), data: JSON.parse(row.data) });
});

function validProject(data: unknown) {
  return !!data && typeof data === 'object' && Array.isArray((data as any).walls) && Array.isArray((data as any).items);
}
const thumb = (v: unknown) => (typeof v === 'string' && v.startsWith('data:image/') && v.length < 400_000 ? v : null);

app.post('/api/projects', requireUser, (req, res) => {
  const { data } = req.body ?? {};
  if (!validProject(data)) return res.status(400).json({ error: 'Ungültige Planung.' });
  const name = str(req.body.name, 120) || 'Unbenannte Küche';
  const r = db
    .prepare('INSERT INTO projects (user_id, name, data, thumbnail) VALUES (?, ?, ?, ?)')
    .run(req.user!.id, name, JSON.stringify(data), thumb(req.body.thumbnail));
  const row = db.prepare('SELECT id, name, thumbnail, created_at, updated_at FROM projects WHERE id = ?').get(r.lastInsertRowid);
  res.status(201).json(projectMeta(row));
});

app.put('/api/projects/:id', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(id, req.user!.id);
  if (!existing) return res.status(404).json({ error: 'Planung nicht gefunden.' });
  const { data } = req.body ?? {};
  const name = str(req.body?.name, 120);
  if (data !== undefined && !validProject(data)) return res.status(400).json({ error: 'Ungültige Planung.' });
  db.prepare(
    `UPDATE projects SET
       name = COALESCE(?, name),
       data = COALESCE(?, data),
       thumbnail = COALESCE(?, thumbnail),
       updated_at = datetime('now')
     WHERE id = ?`,
  ).run(name || null, data !== undefined ? JSON.stringify(data) : null, thumb(req.body?.thumbnail), id);
  const row = db.prepare('SELECT id, name, thumbnail, created_at, updated_at FROM projects WHERE id = ?').get(id);
  res.json(projectMeta(row));
});

// --- Teilen (nur ansehen, ohne Anmeldung) ---

app.post('/api/projects/:id/share', requireUser, (req, res) => {
  const row = db.prepare('SELECT id, share_token FROM projects WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user!.id) as any;
  if (!row) return res.status(404).json({ error: 'Planung nicht gefunden.' });
  let token: string = row.share_token;
  if (!token) {
    token = randomBytes(18).toString('base64url');
    db.prepare('UPDATE projects SET share_token = ? WHERE id = ?').run(token, row.id);
  }
  res.json({ token });
});

app.delete('/api/projects/:id/share', requireUser, (req, res) => {
  const r = db.prepare('UPDATE projects SET share_token = NULL WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user!.id);
  if (!r.changes) return res.status(404).json({ error: 'Planung nicht gefunden.' });
  res.json({ ok: true });
});

app.get('/api/shared/:token', (req, res) => {
  const token = String(req.params.token);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return res.status(404).json({ error: 'Link ungültig.' });
  const row = db.prepare('SELECT name, data, updated_at FROM projects WHERE share_token = ?').get(token) as any;
  if (!row) return res.status(404).json({ error: 'Dieser Link ist nicht (mehr) gültig.' });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ name: row.name, updatedAt: row.updated_at, data: JSON.parse(row.data) });
});

app.delete('/api/projects/:id', requireUser, (req, res) => {
  const r = db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user!.id);
  if (!r.changes) return res.status(404).json({ error: 'Planung nicht gefunden.' });
  res.json({ ok: true });
});

// --- Administration ---

app.get('/api/admin/users', requireUser, requireAdmin, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.status, u.created_at,
              (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS projects
       FROM users u ORDER BY u.status = 'pending' DESC, u.created_at`,
    )
    .all() as any[];
  res.json({
    users: rows.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, createdAt: u.created_at, projects: u.projects })),
  });
});

app.get('/api/admin/settings', requireUser, requireAdmin, (_req, res) => {
  const pending = (db.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'pending'").get() as { n: number }).n;
  res.json({ settings: getSettings(), pending });
});

app.put('/api/admin/settings', requireUser, requireAdmin, (req, res) => {
  for (const key of Object.keys(SETTING_DEFAULTS) as (keyof Settings)[]) {
    const v = req.body?.[key];
    if (v === undefined) continue;
    if (typeof v !== 'boolean') return res.status(400).json({ error: `Ungültiger Wert für ${key}.` });
    setSetting(key, v);
  }
  res.json({ settings: getSettings() });
});

function adminCount() {
  return (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'").get() as { n: number }).n;
}

app.put('/api/admin/users/:id', requireUser, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { role, status } = req.body ?? {};
  if (role !== undefined && role !== 'admin' && role !== 'user') return res.status(400).json({ error: 'Ungültige Rolle.' });
  if (status !== undefined && status !== 'active' && status !== 'pending') return res.status(400).json({ error: 'Ungültiger Status.' });
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!target) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
  const losesAdmin = target.role === 'admin' && target.status === 'active' && (role === 'user' || status === 'pending');
  if (losesAdmin && adminCount() <= 1) return res.status(400).json({ error: 'Es muss mindestens ein aktiver Administrator bleiben.' });
  if (role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  if (status) {
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
    // gesperrte Konten sofort abmelden
    if (status === 'pending') db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', requireUser, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) return res.status(400).json({ error: 'Das eigene Konto kann hier nicht gelöscht werden.' });
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!target) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

// --- Online-Materialbibliotheken (Poly Haven, ambientCG) ---

const library = createLibrary(DATA_DIR);

app.get('/api/library/search', requireUser, async (req, res) => {
  const source = (req.query.source === 'ambientcg' ? 'ambientcg' : 'polyhaven') as Source;
  try {
    res.json(await library.search(source, str(req.query.q, 100), Number(req.query.limit) || 48, Number(req.query.offset) || 0));
  } catch (e) {
    res.status(502).json({ error: `Bibliothek nicht erreichbar: ${(e as Error).message}` });
  }
});

app.post('/api/library/import', requireUser, async (req, res) => {
  try {
    res.json(await library.importTexture(req.body?.source as Source, String(req.body?.id ?? ''), (req.body?.res ?? '2k') as Resolution));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// importierte Texturen (unveränderlich je Quelle/ID/Auflösung)
app.use('/library', express.static(library.root, { maxAge: '30d', immutable: true, index: false }));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Nicht gefunden.' }));

// Fehlerbehandlung
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Planung zu groß (max. 60 MB).' });
  console.error(err);
  res.status(500).json({ error: 'Interner Serverfehler.' });
});

// Produktionsbetrieb: gebautes Frontend ausliefern
const dist = join(ROOT, 'dist');
if (existsSync(dist)) {
  // Seiten nie aus dem Browser-Cache verwenden (sonst läuft nach Updates alter Programmcode);
  // die gehashten Dateien unter /assets dürfen dagegen dauerhaft gecacht werden.
  app.use(
    express.static(dist, {
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        else if (path.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(join(dist, 'index.html'));
  });
}

// abgelaufene Sitzungen regelmäßig entfernen
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString()), 3600_000).unref();

app.listen(PORT, () => console.log(`Küchenplaner-Server läuft auf http://localhost:${PORT}`));
