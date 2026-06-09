# Multiplayer CORS Fix Applied

## Changes Made

### 1. Fixed `server.js`
- **Bug fix**: Changed `createServer(app)` → `http.createServer(app)` (line 103)
- **WebSocket proxy**: Fixed query string forwarding - the `WebSocketServer` with `path: '/ws'` automatically strips the path prefix, so we just need to ensure the query starts with `/`

### 2. Already Configured (Previous Session)
- HTTP proxy for `/api/rooms/*` → forwards to signaling server on port 8081
- WebSocket proxy on `/ws` → forwards to `ws://localhost:8081`
- Client uses same-origin URLs (no CORS issues)
- `ws` package already in `package.json`

## How to Test

### Start Both Servers

In **Terminal 1** (signaling server on port 8081):
```bash
npm run signaling
```

In **Terminal 2** (game server with proxy on port 8080):
```bash
npm start
```

### Test Multiplayer

1. Open browser to `http://localhost:8080`
2. Click "Multiplayer" button in HUD
3. Click "CREATE ROOM" - should generate a random code
4. Room code should display without errors
5. Copy the invite link
6. Open in another browser/tab and try joining

### Debug Logs to Check

Browser console should show:
```
[MP] createRoom — signalingUrl: http://localhost:8080
[MP] createRoom → _connectWS...
[MP] _connectWS — Ably unavailable, falling back to WebSocket: ws://localhost:8080/ws/?room=ABC123
[WS Proxy] new connection → ws://localhost:8081/?room=ABC123
```

Server console should show:
```
[WS Proxy] new connection → ws://localhost:8081/?room=ABC123
```

## What Was Fixed

**Before**: 
- Client tried to POST to `https://aetherweaver.felixx.dev:8081/api/rooms/reserve`
- Browser blocked with CORS error (different port = different origin)

**After**:
- Client POSTs to `https://aetherweaver.felixx.dev:8080/api/rooms/reserve` (same origin)
- Express proxy forwards to port 8081 (server-to-server, no CORS)
- WebSocket connects to `wss://aetherweaver.felixx.dev:8080/ws/?room=CODE`
- Proxy forwards to `ws://localhost:8081/?room=CODE`
