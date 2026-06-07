const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');

// Simple webhook receiver that verifies HMAC using WEBHOOK_SECRET (if set)
// and calls the signaling server /api/rooms/ensure to make sure a room exists for the streamer.
// Also demonstrates how to trigger a host-start command (placeholder) after reservation.

const app = express();
const PORT = process.env.PORT || 4000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || null; // set this to secure the webhook
const SIGNALING_URL = process.env.SIGNALING_URL || 'http://localhost:8081';
const HOST_STARTER_CMD = process.env.HOST_STARTER_CMD || null; // optional: shell command to start host (e.g., docker run ...)

// Use raw body so HMAC can be verified against exact bytes
app.use(express.raw({ type: '*/*' }));

function verifySignature(rawBody, signature) {
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  // signature can be prefixed with 'sha256='
  const sig = signature.replace(/^sha256=/i, '');
  return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(sig, 'hex'));
}

app.post('/host', async (req, res) => {
  const sig = req.headers['x-signature'] || req.headers['x-hub-signature'] || '';
    console.warn('webhook signature failed');
    return res.status(401).json({ ok: false, reason: 'invalid_signature' });
  }

  let payload = {};
  try { payload = JSON.parse(req.body.toString('utf8')); } catch (e) { payload = {}; }
  // Expect payload to contain streamerSlug or roomCode
  const streamer = payload.streamerSlug || payload.streamer || null;
  const roomCode = payload.roomCode || null;

  try {
    const ensureUrl = SIGNALING_URL.replace(/\/+$/, '') + '/api/rooms/ensure';
    const body = { streamer: streamer, code: roomCode };
    const r = await fetch(ensureUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    // Optionally start host using HOST_STARTER_CMD (this is just a placeholder - implement your own runner)
    if (j.ok && HOST_STARTER_CMD) {
      console.log('Room ensured, attempting to start host using HOST_STARTER_CMD');
      // spawn a detached child process to run host starter command
      const { spawn } = require('child_process');
      const parts = HOST_STARTER_CMD.split(' ');
      const proc = spawn(parts[0], parts.slice(1), { detached: true, stdio: 'ignore' });
      proc.unref();
    }

    return res.json({ ok: true, ensured: j });
  } catch (e) {
    console.error('webhook handler error', e);
    return res.status(500).json({ ok: false, reason: 'server_error' });
  }
});

app.get('/', (req, res) => res.send('Webhook receiver alive'));

app.listen(PORT, () => console.log());
