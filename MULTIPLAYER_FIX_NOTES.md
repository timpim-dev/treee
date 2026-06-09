# Multiplayer CORS Fix Applied

## Changes Made

### 1. Fixed `server.js`
- **Bug fix**: Changed `createServer(app)` → `http.createServer(app)` (line 103)
- **WebSocket proxy**: Fixed query string forwarding - the `WebSocketServer` with `path: '/ws'` automatically strips the path prefix, so we just need to ensure the query starts with `/`

### 2. Added Helpful Error Messages for `!join` Command
When viewers type `!join` in Twitch chat, they now get clear feedback:
- "Sorry, multiplayer is not available right now (streamer not logged in)" - when streamer isn't authenticated
- "Multiplayer joins are currently disabled" - when multiplayer setting is off
- "Sorry, multiplayer system is not available" - when multiplayer system failed to initialize
- "You are banned from this multiplayer room" - when viewer is banned
- "Join request sent! Waiting for streamer approval..." - in whitelist mode
- Normal join message with code and URL - in free mode

### 3. Already Configured (Previous Session)
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

### Test !join Command

1. Start both servers
2. Connect to Twitch chat (streamer must be logged in with Player Account)
3. Enable multiplayer in Twitch settings
4. Type `!join` in chat
5. Should receive a message with room code and join URL

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
- `!join` command failed silently with no feedback to viewer

**After**:
- Client POSTs to `https://aetherweaver.felixx.dev:8080/api/rooms/reserve` (same origin)
- Express proxy forwards to port 8081 (server-to-server, no CORS)
- WebSocket connects to `wss://aetherweaver.felixx.dev:8080/ws/?room=CODE`
- Proxy forwards to `ws://localhost:8081/?room=CODE`
- `!join` command gives helpful error messages when it can't work
