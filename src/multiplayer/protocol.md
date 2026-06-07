Multiplayer Protocol Design (MVP)

Overview

This document defines a compact, versioned JSON protocol for peer-to-peer multiplayer using WebRTC datachannels with a minimal signaling server (or optional Ably-based signaling/presence). Host-authoritative model: the host (room creator) is authoritative for stable world state and conflict resolution. Clients send inputs; host validates and broadcasts authoritative state deltas.

Versioning

- protocol_version: 1
- Message envelope always includes: { v: <protocol_version>, t: <type>, s: <senderId>, r: <roomCode?>, p?: <payload> }

Identifiers

- senderId: short opaque client id (UUIDv4 or generated 8-12char base62) assigned by host/signaling server.
- roomCode: short human-friendly code (6 alphanum) reserved atomically via signaling/presence service.

Message Types (envelope.t)

- SIGNAL/OFFER/ANSWER/ICE: (Signaling channel only) used by signalling server to exchange SDP and ICE; not sent over game datachannel.

- ROOM_RESERVE: client -> signaling service; payload: { code }
- ROOM_RESERVE_ACK: service -> client; payload: { ok: true/false, reason }

- ROOM_CREATE: client(host) -> signaling service to create & reserve code; payload: { code, meta }
- ROOM_CREATED: service -> host; payload: { code, roomId }

- ROOM_PRESENCE: presence notifications distributed by signaling/presence (e.g., Ably) to indicate active rooms and participants; payload: { roomCode, hosts:[...], players:[...] }

- JOIN_REQUEST: client -> host via signaling then datachannel. payload: { displayName, clientMeta }
- JOIN_ACCEPT: host -> client: { accepted:true, senderId }
- JOIN_REJECT: host -> client: { accepted:false, reason }

- PEER_ANNOUNCE: peer -> host & peers via datachannel: { senderId, meta }
- PEER_JOIN / PEER_LEAVE: host -> all: { senderId }

- INPUT: client -> host: { seq: number, input: { ... } }
  - Inputs are compact (action ids, directions, timestamps). Host applies and may ACK by broadcasting state.

- STATE_SNAPSHOT: host -> all: { tick, snapshot: <compact world state> }
  - Snapshot contains positions, velocities, health, active projectiles; exclude progression data (tree, armor, runes, unlocked spells).

- STATE_DELTA: host -> all: { tick, delta: [...] }
  - Smaller diffs between snapshots. Use for bandwidth efficiency.

- SYNC_REQUEST / SYNC_RESPONSE: client->host to request full authoritative snapshot when behind.

- PING / PONG: heartbeat to detect disconnects and latency.

Wire Format Notes

- Use short keys in production to reduce bandwidth: {v:1,t:'I',s:'a3f',p:{x:...}} or binary later.
- All messages must be JSON-serializable (string) over datachannel. Consider msgpack later.
- Add a server-provided timestamp only when needed; rely on host tick counter for ordering.

Ticking & Authority

- Host maintains authoritative tick counter (tick++ every fixed interval, e.g., 60Hz or 20Hz depending on bandwidth).
- Clients submit INPUT messages with local sequence numbers and local timestamps; host validates and applies inputs and includes them in STATE_DELTA for deterministic application/order.
- On join, host issues a join snapshot and assigns senderId.

Room Code Generation & Conflict Checks

- Room codes are short (6 chars). The generator MUST check active-room conflicts by calling the signaling/presence service to atomically reserve the code before returning it to the host.

Create flow (safe reservation):
1. Host attempts to reserve desired code via signaling service: POST /reserve { code } (or presence-based atomic claim in Ably).
2. If reserve returns ok:true -> proceed; service marks code reserved with TTL (e.g., 30m) and returns roomId.
3. If ok:false due to conflict -> host tries another generated code until max attempts (e.g., 8) then fail with user-visible error.

If a signaling/presence service is not used, the server-side signaling application must implement an atomic reservation map (in-memory or Redis) to avoid collisions. Do NOT rely on purely random generation without checking.

Ably Integration (optional)

- Ably provides channels and presence; use a global channel like "rooms" or namespace "rooms:CODE".
- To reserve a code: attempt to enter presence on rooms:CODE with a special key role='owner'. If presence enter succeeds and no owner exists, reservation succeeds. Presence can be used to list active rooms and participants.
- Ably can be used purely for signaling (exchange ephemeral tokens) or presence/reservation. Avoid putting secrets in client code; use server token request when feasible.

Signaling Server (minimal)

- WebSocket server that implements:
  - /reserve endpoint or WS message ROOM_RESERVE for atomic code reservation
  - relay OFFER/ANSWER/ICE between peers (or exchange via Ably)
  - presence listing and optional TTL-based cleanup

- Prefer stateless tokens for client registration. Keep server minimal: only handles handshake and room reservations; game state remains peer-hosted.

Persistence (save/load room)

- Export JSON containing: { protocol_version, roomCode, createdAt, tick, players:[{senderId, meta, pos, health}], worldObjects:[...], metadata }.
- Do NOT include any secret tokens or player account progression fields.

Security & Privacy

- All persistent exports must be sanitized to exclude PII and progression items.
- Use optional room passwords; share password only through out-of-band invite (link with short token).
- Rate-limit reservation attempts on signaling service to prevent brute-force.

Developer Notes / API Examples

Reserve code (HTTP POST)
POST /api/rooms/reserve
Body: { code: "AB12CD", ttl: 1800 }
Response: { ok: true, roomId: "r_abc123" } or { ok: false, reason: "conflict" }

Signaling offer (via WS)
{ v:1, t: 'OFFER', s: 'client-temp-id', r: 'AB12CD', p: { target: 'host', sdp: '...base64...' } }

Datachannel game message example
{ v:1, t: 'I', s: 'c1', p: { seq: 12, input: { a: 'move', dx: 1, dy: 0 } } }

Implementation priority for MVP
1. protocol-design (this doc) — done
2. signaling-server minimal implementation (reserve API + WS relay)
3. client WebRTC integration (host/peer roles, reservation, JOIN flows)
4. UI menu (Create/Join/General)
5. Twitch !join integration (server-side webhook or bot)
6. Room persistence (export/import)


Change Log
- 2026-06-07: Initial protocol v1 draft covering messages, reservation, and Ably notes.
