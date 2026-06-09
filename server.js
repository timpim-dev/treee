import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cors from 'cors';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const SIGNALING_HOST = process.env.SIGNALING_HOST || 'localhost';
const SIGNALING_PORT = process.env.SIGNALING_PORT || 8081;

app.use(cors());
app.use(express.json());

// Serve static files from dist folder (after building)
app.use(express.static(path.join(__dirname, 'dist')));

const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');

// Initialize leaderboard file if it doesn't exist
if (!fs.existsSync(LEADERBOARD_FILE)) {
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify([
    { name: "AetherLord", score: 25000, wave: 18, level: 32 },
    { name: "RuneSeeker", score: 18400, wave: 14, level: 25 },
    { name: "SpellWeaver", score: 12100, wave: 10, level: 19 },
    { name: "ManaBurn", score: 8500, wave: 8, level: 14 },
    { name: "NoviceMage", score: 3200, wave: 4, level: 8 }
  ], null, 2));
}

// API: Get Leaderboard
app.get('/api/leaderboard', (req, res) => {
  try {
    const data = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
    const leaderboard = JSON.parse(data);
    res.json(leaderboard.sort((a, b) => b.score - a.score));
  } catch (err) {
    res.status(500).json({ error: "Failed to read leaderboard" });
  }
});

// API: Submit Score
app.post('/api/leaderboard', (req, res) => {
  try {
    const { name, score, wave, level } = req.body;
    if (!name || typeof score !== 'number') {
      return res.status(400).json({ error: "Invalid submission data" });
    }

    const data = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
    const leaderboard = JSON.parse(data);

    leaderboard.push({ name: name.substring(0, 15), score, wave: wave || 1, level: level || 1 });
    // Sort and keep top 10
    const sorted = leaderboard.sort((a, b) => b.score - a.score).slice(0, 10);

    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(sorted, null, 2));
    res.json({ success: true, leaderboard: sorted });
  } catch (err) {
    res.status(500).json({ error: "Failed to submit score" });
  }
});

// Proxy signaling API requests to avoid CORS issues from the browser
// All /api/rooms/* calls are forwarded to the signaling server
app.use('/api/rooms', (req, res) => {
  const options = {
    hostname: SIGNALING_HOST,
    port: SIGNALING_PORT,
    path: '/api/rooms' + req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${SIGNALING_HOST}:${SIGNALING_PORT}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[Proxy] Signaling request failed:', err.message);
    res.status(502).json({ ok: false, reason: 'signaling_unreachable' });
  });

  req.pipe(proxyReq);
});

// For any other routes, serve index.html (client-side routing support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = http.createServer(app);

// WebSocket proxy — forward /ws?room=... connections to the signaling server
// This lets the browser connect to the same origin instead of a different port (which browsers block via CORS)
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (clientWs, req) => {
  // req.url already has path stripped by WebSocketServer, only query remains
  const query = req.url.startsWith('/') ? req.url : '/' + req.url;
  const targetUrl = `ws://${SIGNALING_HOST}:${SIGNALING_PORT}${query}`;
  console.log(`[WS Proxy] new connection → ${targetUrl}`);

  const upstream = new WebSocket(targetUrl);

  upstream.on('open', () => {
    clientWs.on('message', (msg) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(msg);
    });
  });

  upstream.on('message', (msg) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(msg);
  });

  const cleanup = (label) => () => {
    console.log(`[WS Proxy] ${label} closed`);
    try { clientWs.close(); } catch (e) {}
    try { upstream.close(); } catch (e) {}
  };

  upstream.on('close', cleanup('upstream'));
  upstream.on('error', (e) => { console.error('[WS Proxy] upstream error:', e.message); cleanup('upstream error')(); });
  clientWs.on('close', cleanup('client'));
  clientWs.on('error', (e) => { console.error('[WS Proxy] client error:', e.message); });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} — signaling proxy → ${SIGNALING_HOST}:${SIGNALING_PORT}`);
});
