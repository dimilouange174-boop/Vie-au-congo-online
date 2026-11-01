const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { promisify } = require('util');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const { neon } = require('@neondatabase/serverless');
const scrypt = promisify(crypto.scrypt);

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
async function ensureSaveTable() {
  if (!sql) throw new Error('DATABASE_URL manquante');
  await sql`
    CREATE TABLE IF NOT EXISTS game_saves (
      username TEXT PRIMARY KEY,
      save_data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false }, maxHttpBufferSize: 1e5, pingTimeout: 20000, pingInterval: 25000 });
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('ERREUR: définis JWT_SECRET avec une chaîne aléatoire d’au moins 32 caractères.');
  process.exit(1);
}
fs.mkdirSync(DATA_DIR, { recursive: true });
const emptyDb = () => ({ users: [], publicMessages: [], directMessages: [] });
let db;
try { db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : emptyDb(); }
catch (e) { console.error('db.json est illisible; sauvegarde-le et répare-le avant de redémarrer.', e); process.exit(1); }
function saveDb() { const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, DB_FILE); }
const cleanText = (v, max = 500) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const validName = v => /^[A-Za-z0-9_]{3,20}$/.test(v);
const publicUser = u => ({ username: u.username, createdAt: u.createdAt });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Trop de tentatives. Attends quelques minutes avant de réessayer.' } });
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use('/api/login', authLimiter); app.use('/api/register', authLimiter);
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/jeu.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'jeu.html'));
});

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html']
}));
app.get('/health', (req, res) => res.json({ ok: true, service: 'VIE AU CONGO Online', players: online.size }));
async function hashPassword(password) { const salt = crypto.randomBytes(16).toString('hex'); const hash = await scrypt(password, salt, 64); return { salt, hash: hash.toString('hex') }; }
async function checkPassword(password, salt, expected) { const got = await scrypt(password, salt, 64); const exp = Buffer.from(expected, 'hex'); return exp.length === got.length && crypto.timingSafeEqual(exp, got); }
function issueToken(u) { return jwt.sign({ sub: u.username }, JWT_SECRET, { expiresIn: '7d', issuer: 'vie-au-congo', audience: 'vac-game' }); }
function readToken(req) { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; }
function verifyToken(token) { const p = jwt.verify(token, JWT_SECRET, { issuer: 'vie-au-congo', audience: 'vac-game' }); const u = db.users.find(x => x.username.toLowerCase() === String(p.sub).toLowerCase()); if (!u) throw new Error('Compte introuvable'); return u; }
app.post('/api/register', async (req, res) => {
  try {
    const username = cleanText(req.body.username, 20), password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!validName(username)) return res.status(400).json({ error: 'Nom invalide : 3 à 20 caractères, lettres sans accent, chiffres ou _.' });
    if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Le mot de passe doit contenir entre 8 et 128 caractères.' });
    if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: 'Ce nom de joueur est déjà utilisé.' });
    if (db.users.length >= 10000) return res.status(503).json({ error: 'Le serveur a atteint sa limite de comptes.' });
    const pw = await hashPassword(password); const u = { username, salt: pw.salt, passwordHash: pw.hash, createdAt: new Date().toISOString() };
    db.users.push(u); saveDb(); return res.status(201).json({ token: issueToken(u), username: u.username });
  } catch (e) { console.error('register', e); return res.status(500).json({ error: 'Erreur lors de la création du compte.' }); }
});
app.post('/api/login', async (req, res) => {
  try {
    const username = cleanText(req.body.username, 20), password = typeof req.body.password === 'string' ? req.body.password : '';
    const u = db.users.find(x => x.username.toLowerCase() === username.toLowerCase());
    if (!u || !(await checkPassword(password, u.salt, u.passwordHash))) return res.status(401).json({ error: 'Nom de joueur ou mot de passe incorrect.' });
    return res.json({ token: issueToken(u), username: u.username });
  } catch (e) { console.error('login', e); return res.status(500).json({ error: 'Erreur lors de la connexion.' }); }
});
app.get('/api/me', (req, res) => { try { const u = verifyToken(readToken(req)); res.json({ username: u.username, createdAt: u.createdAt }); } catch { res.status(401).json({ error: 'Session expirée. Reconnecte-toi.' }); } });
app.get('/api/save', async (req, res) => {
  try {
    const u = verifyToken(readToken(req));
    await ensureSaveTable();

    const rows = await sql`
      SELECT save_data
      FROM game_saves
      WHERE username = ${u.username}
    `;

    res.json({ save: rows.length ? rows[0].save_data : null });
  } catch (e) {
    console.error('load save', e);
    res.status(500).json({ error: 'Impossible de charger la sauvegarde.' });
  }
});

app.put('/api/save', async (req, res) => {
  try {
    const u = verifyToken(readToken(req));
    await ensureSaveTable();

    const save = req.body && req.body.save;

    if (!save || typeof save !== 'object' || Array.isArray(save)) {
      return res.status(400).json({ error: 'Sauvegarde invalide.' });
    }

    await sql`
      INSERT INTO game_saves (username, save_data, updated_at)
      VALUES (${u.username}, ${JSON.stringify(save)}::jsonb, NOW())
      ON CONFLICT (username)
      DO UPDATE SET
        save_data = EXCLUDED.save_data,
        updated_at = NOW()
    `;

    res.json({ ok: true });
  } catch (e) {
    console.error('save game', e);
    res.status(500).json({ error: 'Impossible d’enregistrer la sauvegarde.' });
  }
});

const online = new Map(); // username lower-case -> socket ID
const socketUser = new Map();
function sendOnlineList() { const list = [...online.values()].map(x => ({ username: x.username })); io.emit('online:list', list); }
function addSystemMessage(text) { return { from: 'Système', text, time: new Date().toISOString() }; }
io.use((socket, next) => {
  try { const token = socket.handshake.auth && socket.handshake.auth.token; const u = verifyToken(token || ''); socket.data.user = publicUser(u); next(); }
  catch { next(new Error('Authentification requise. Connecte-toi à ton compte.')); }
});
io.on('connection', socket => {
  const user = socket.data.user; const key = user.username.toLowerCase();
  // Une seule session active par compte; la nouvelle connexion remplace l’ancienne.
  const previous = online.get(key); if (previous && previous.id !== socket.id) previous.socket.disconnect(true);
  online.set(key, { username: user.username, id: socket.id, socket }); socketUser.set(socket.id, key);
  socket.emit('chat:history', db.publicMessages.slice(-100)); sendOnlineList();
    // ---------- Synchronisation du monde 3D ----------
  socket.on('world:join', payload => {
    const city = cleanText(payload && payload.city, 24);
    const place = cleanText(payload && payload.place, 32);

    if (!/^[a-z0-9_-]+$/i.test(city) || !/^[a-z0-9_-]+$/i.test(place)) return;

    const room = `world:${city}:${place}`;

    if (socket.data.worldRoom && socket.data.worldRoom !== room) {
      socket.to(socket.data.worldRoom).emit('player:leave', {
        username: user.username
      });
      socket.leave(socket.data.worldRoom);
    }

    socket.join(room);
    socket.data.worldRoom = room;

    const players = [...(io.sockets.adapter.rooms.get(room) || [])]
      .filter(id => id !== socket.id)
      .map(id => io.sockets.sockets.get(id)?.data.worldPosition)
      .filter(Boolean);

    socket.emit('world:players', players);
  });

  socket.on('player:move', payload => {
    const room = socket.data.worldRoom;
    if (!room || !payload) return;

    const x = Number(payload.x);
    const z = Number(payload.z);
    const rotation = Number(payload.rotation);

    if (![x, z, rotation].every(Number.isFinite)) return;
    if (Math.abs(x) > 1000 || Math.abs(z) > 1000) return;

    const player = {
  username: user.username,
  x,
  z,
  rotation,
  skin: cleanText(payload.skin, 20),
  shirt: cleanText(payload.shirt, 20),
  pants: cleanText(payload.pants, 20),
  shoes: cleanText(payload.shoes, 20),
  hair: cleanText(payload.hair, 20),
  hs: Number(payload.hs) || 0,
  acc: Number(payload.acc) || 0
};

    socket.data.worldPosition = player;
    socket.to(room).emit('player:move', player);
  });
  socket.on('chat:send', payload => {
    const now = Date.now(); if (socket.data.lastPublic && now - socket.data.lastPublic < 900) return socket.emit('server:error', 'Attends un instant avant d’envoyer un autre message.'); socket.data.lastPublic = now;
    const text = cleanText(payload && payload.text, 500); if (!text) return;
    const m = { from: user.username, text, time: new Date().toISOString() }; db.publicMessages.push(m); db.publicMessages = db.publicMessages.slice(-500); saveDb(); io.emit('chat:message', m);
  });
  socket.on('dm:send', payload => {
    const now = Date.now(); if (socket.data.lastDM && now - socket.data.lastDM < 700) return socket.emit('server:error', 'Attends un instant avant d’envoyer un autre message.'); socket.data.lastDM = now;
    const to = cleanText(payload && payload.to, 20), text = cleanText(payload && payload.text, 500);
    if (!validName(to) || !text) return socket.emit('server:error', 'Destinataire ou message invalide.');
    const target = db.users.find(x => x.username.toLowerCase() === to.toLowerCase()); if (!target) return socket.emit('server:error', 'Ce joueur n’existe pas. Vérifie son nom exact.');
    if (target.username.toLowerCase() === key) return socket.emit('server:error', 'Tu ne peux pas t’envoyer un message à toi-même.');
    const m = { from: user.username, to: target.username, text, time: new Date().toISOString() }; db.directMessages.push(m); db.directMessages = db.directMessages.slice(-3000); saveDb();
    socket.emit('dm:message', m); const targetOnline = online.get(target.username.toLowerCase()); if (targetOnline) targetOnline.socket.emit('dm:message', m);
  });
  socket.on('dm:history', payload => {
    const other = cleanText(payload && payload.with, 20); if (!validName(other)) return socket.emit('server:error', 'Nom de joueur invalide.');
    const exists = db.users.some(x => x.username.toLowerCase() === other.toLowerCase()); if (!exists) return socket.emit('server:error', 'Ce joueur n’existe pas.');
    const messages = db.directMessages.filter(m => (m.from.toLowerCase() === key && m.to.toLowerCase() === other.toLowerCase()) || (m.to.toLowerCase() === key && m.from.toLowerCase() === other.toLowerCase())).slice(-100);
    socket.emit('dm:history', messages);
  });
    socket.on('disconnect', () => {
    if (socket.data.worldRoom) {
      socket.to(socket.data.worldRoom).emit('player:leave', {
        username: user.username
      });
    }

    const k = socketUser.get(socket.id);
    socketUser.delete(socket.id);

    if (k && online.get(k)?.id === socket.id) {
      online.delete(k);
    }

    sendOnlineList();
  });
});
server.listen(PORT, '0.0.0.0', () => console.log(`VIE AU CONGO Online lancé sur le port ${PORT}`));
