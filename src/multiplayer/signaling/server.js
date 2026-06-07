#!/usr/bin/env node
// Minimal signaling server: HTTP reserve endpoint + WebSocket relay
// Usage: node server.js [PORT]

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8081;

// In-memory reservation map: code -> { roomId, owner, expiresAt }
const reservations = new Map();
// Active websocket connections by room: code -> Map(clientId -> ws)
const roomSockets = new Map();

function cleanupExpired() {
  const now = Date.now();
  for (const [code, entry] of reservations) {
    if (entry.expiresAt <= now) reservations.delete(code);
  }
}
setInterval(cleanupExpired, 60 * 1000);

// Reserve API: POST /api/rooms/reserve { code, ttl }
app.post('/api/rooms/reserve', (req, res) => {
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

  const roomId = `r_${uuidv4().slice(0,8)}`;
  reservations.set(upCode, { roomId, owner: owner || null, expiresAt: now + ttl * 1000 });
  console.log(`[reserve] code=${upCode} roomId=${roomId} owner=${owner}`);
  return res.json({ ok: true, roomId });
});

app.post('/api/rooms/release', (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ ok: false });
  const upCode = code.toUpperCase();
  reservations.delete(upCode);
  return res.json({ ok: true });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const room = (url.searchParams.get('room') || '').toUpperCase();
  const clientId = url.searchParams.get('clientId') || uuidv4().slice(0,8);

  if (!room) {
    ws.send(JSON.stringify({ type: 'ERR', reason: 'missing_room' }));
    ws.close();
    return;
  }

  if (!roomSockets.has(room)) roomSockets.set(room, new Map());
  const sockets = roomSockets.get(room);
  sockets.set(clientId, ws);
  console.log(`[ws] connected ${clientId} -> ${room}`);

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    // Relay messages: { type, to, payload }
    const { to } = msg;
    if (to) {
      const target = sockets.get(to);
      if (target && target.readyState === WebSocket.OPEN) {
        target.send(JSON.stringify(Object.assign({}, msg, { from: clientId })));
      }
    } else {
      // broadcast to others in room
      for (const [peerId, peerWs] of sockets) {
        if (peerId === clientId) continue;
        if (peerWs.readyState === WebSocket.OPEN) peerWs.send(JSON.stringify(Object.assign({}, msg, { from: clientId })));
      }
    }
  });

  ws.on('close', () => {
    sockets.delete(clientId);
    console.log(`[ws] closed ${clientId} from ${room}`);
    if (sockets.size === 0) roomSockets.delete(room);
  });

  ws.on('error', (err) => console.warn('ws err', err));

  // Send ack with assigned clientId
  ws.send(JSON.stringify({ type: 'WS_CONNECTED', clientId }));
});

server.listen(PORT, () => console.log(`Signaling server listening on ${PORT}`));
