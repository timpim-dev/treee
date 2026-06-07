Signaling server (minimal)

Files:
- server.js : Express + ws server implementing /api/rooms/reserve and a WebSocket relay for room-based signaling.
- package.json : local dependency manifest (express, ws, uuid).

Usage (development):
cd src/multiplayer/signaling
npm install
npm start

Notes:
- Reservation is in-memory with TTL. For production, back with Redis or use Ably presence for atomic claims.
- WebSocket relay forwards JSON messages between peers in the same room. Messages should include { type, to?, payload }.
