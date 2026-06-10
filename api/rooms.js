import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// In-memory reservation map: code -> { roomId, owner, expiresAt }
// Persistent across function invocations on the same container instance
const reservations = global._reservations || new Map();
global._reservations = reservations;

function cleanupExpired() {
  const now = Date.now();
  for (const [code, entry] of reservations) {
    if (entry.expiresAt <= now) {
      reservations.delete(code);
    }
  }
}

const router = express.Router();

// Reserve API: POST /api/rooms/reserve { code, ttl }
router.post('/reserve', (req, res) => {
  cleanupExpired();
  const { code, ttl = 1800, owner } = req.body || {};
  if (!code || typeof code !== 'string' || code.length === 0) {
    return res.status(400).json({ ok: false, reason: 'invalid_code' });
  }
  const upCode = code.toUpperCase();
  const now = Date.now();
  const existing = reservations.get(upCode);
  if (existing && existing.expiresAt > now) {
    return res.json({ ok: false, reason: 'conflict' });
  }

  const roomId = `r_${crypto.randomUUID().slice(0, 8)}`;
  reservations.set(upCode, { roomId, owner: owner || null, expiresAt: now + ttl * 1000 });
  console.log(`[reserve] code=${upCode} roomId=${roomId} owner=${owner}`);
  return res.json({ ok: true, roomId });
});

// Reserve-for-streamer: idempotent reservation for streamer slug/code
router.post('/reserve-for-streamer', (req, res) => {
  cleanupExpired();
  const { code, ttl = 3600, owner } = req.body || {};
  if (!code || typeof code !== 'string' || code.length === 0) {
    return res.status(400).json({ ok: false, reason: 'invalid_code' });
  }
  const upCode = code.toUpperCase();
  const now = Date.now();
  const existing = reservations.get(upCode);
  if (existing && existing.expiresAt > now) {
    if (owner && existing.owner === owner) {
      existing.expiresAt = now + ttl * 1000;
      reservations.set(upCode, existing);
      console.log(`[reserve-for-streamer] extended code=${upCode} roomId=${existing.roomId} owner=${owner}`);
      return res.json({ ok: true, roomId: existing.roomId, extended: true });
    }
    return res.json({ ok: false, reason: 'conflict', roomId: existing.roomId, owner: existing.owner });
  }

  const roomId = `r_${crypto.randomUUID().slice(0, 8)}`;
  reservations.set(upCode, { roomId, owner: owner || null, expiresAt: now + ttl * 1000 });
  console.log(`[reserve-for-streamer] reserved code=${upCode} roomId=${roomId} owner=${owner}`);
  return res.json({ ok: true, roomId });
});

// Ensure endpoint: reserve and optionally notify a webhook to create host room
router.post('/ensure', async (req, res) => {
  cleanupExpired();
  const { code, ttl = 3600, owner, webhook } = req.body || {};
  if (!code || typeof code !== 'string' || code.length === 0) {
    return res.status(400).json({ ok: false, reason: 'invalid_code' });
  }
  const upCode = code.toUpperCase();
  const now = Date.now();
  const existing = reservations.get(upCode);

  if (existing && existing.expiresAt > now) {
    if (owner && existing.owner === owner) {
      existing.expiresAt = now + ttl * 1000;
      reservations.set(upCode, existing);
      console.log(`[ensure] extended existing reservation code=${upCode} owner=${owner}`);
      if (webhook) {
        notifyWebhook(webhook, { event: 'ensure_extended', code: upCode, roomId: existing.roomId, owner })
          .catch(e => console.warn('webhook notify failed', e));
      }
      return res.json({ ok: true, roomId: existing.roomId, existed: true });
    }
    console.log(`[ensure] conflict for code=${upCode} owner=${owner}, existing owner=${existing.owner}`);
    if (webhook) {
      notifyWebhook(webhook, { event: 'ensure_conflict', code: upCode, roomId: existing.roomId, owner: existing.owner })
        .catch(e => console.warn('webhook notify failed', e));
    }
    return res.json({ ok: false, reason: 'conflict', roomId: existing.roomId, owner: existing.owner });
  }

  const roomId = `r_${crypto.randomUUID().slice(0, 8)}`;
  reservations.set(upCode, { roomId, owner: owner || null, expiresAt: now + ttl * 1000 });
  console.log(`[ensure] reserved code=${upCode} roomId=${roomId} owner=${owner}`);

  if (webhook) {
    notifyWebhook(webhook, { event: 'ensure_requested', code: upCode, roomId, owner })
      .catch(e => console.warn('webhook notify failed', e));
  }

  return res.json({ ok: true, roomId, notified: !!webhook });
});

async function notifyWebhook(url, payload) {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.warn('notifyWebhook error', e);
  }
}

router.post('/release', (req, res) => {
  cleanupExpired();
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ ok: false });
  const upCode = code.toUpperCase();
  reservations.delete(upCode);
  console.log(`[release] code=${upCode}`);
  return res.json({ ok: true });
});

// Room status check
router.get('/:code/status', (req, res) => {
  cleanupExpired();
  const upCode = (req.params.code || '').toUpperCase();
  const now = Date.now();
  const entry = reservations.get(upCode);
  const active = !!(entry && entry.expiresAt > now);
  const hostOnline = active;
  return res.json({
    ok: true,
    active,
    hostOnline,
    roomId: entry ? entry.roomId : null,
    owner: entry ? entry.owner : null
  });
});

app.use('/api/rooms', router);
app.use('/', router);

export default app;
