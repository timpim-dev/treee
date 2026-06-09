// Multiplayer client manager — P2P via WebRTC with signaling relay

export class MultiplayerManager {
  constructor(game, opts = {}) {
    this.game = game;
    this.signalingUrl = opts.signalingUrl || `${location.protocol}//${location.hostname}:${opts.signalingPort || 8081}`;
    this.roomCode = null;
    this.clientId = null;
    this.isHost = false;
    this.connected = false;

    this.ws = null;
    this.peers = new Map();

    this.ably = null;
    this.ablyChannel = null;

    this.peerMeta = new Map();
    this.bannedUsers = new Set();
    this.pendingJoinRequests = new Map();

    this.onStateSnapshot = opts.onStateSnapshot || (() => {});
    this.onPeerJoin = opts.onPeerJoin || (() => {});
    this.onPeerLeave = opts.onPeerLeave || (() => {});
    this.onStatusChange = opts.onStatusChange || (() => {});
    this.onJoinRequest = opts.onJoinRequest || (() => {});
    this.onPeerMetaUpdate = opts.onPeerMetaUpdate || (() => {});

    // Expose debug handle on window for browser devtools inspection
    window.__mpDebug = {
      get manager() { return game.multiplayer; },
      get state() {
        const m = game.multiplayer;
        return {
          signalingUrl: m.signalingUrl,
          roomCode: m.roomCode,
          clientId: m.clientId,
          isHost: m.isHost,
          connected: m.connected,
          wsState: m.ws ? ['CONNECTING','OPEN','CLOSING','CLOSED'][m.ws.readyState] : 'null',
          ablyConnected: !!(m.ably && m.ablyChannel),
          peers: m.peers.size,
          peerIds: Array.from(m.peers.keys()),
        };
      },
      dump() { console.table(this.state); },
    };
    console.log('[MP] MultiplayerManager created. Debug via window.__mpDebug.dump()');
  }

  /** Allow multiplayer for all players. Twitch connection only required in streaming mode. */
  isConnectionAllowed() {
    return true;
  }

  async reserveCode(code, ttl = 1800) {
    const url = this.signalingUrl.replace(/\/+$/, '') + '/api/rooms/reserve';
    console.log(`[MP] reserveCode → POST ${url}`, { code, ttl });
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, ttl, owner: this.clientId || null }),
      });
      const json = await res.json();
      console.log(`[MP] reserveCode ← HTTP ${res.status}`, json);
      return json;
    } catch (e) {
      console.error('[MP] reserveCode failed (network/parse error)', e);
      return { ok: false, reason: 'network' };
    }
  }

  async createRoom(code = null) {
    code = code || this._generateCode(6);
    console.log(`[MP] createRoom — signalingUrl: ${this.signalingUrl}`);
    const attemptLimit = 8;
    for (let attempt = 0; attempt < attemptLimit; attempt++) {
      const tryCode = attempt === 0 ? code : this._generateCode(6);
      console.log(`[MP] createRoom attempt ${attempt + 1}/${attemptLimit} — code: ${tryCode}`);
      const r = await this.reserveCode(tryCode);
      if (r.ok) {
        this.roomCode = tryCode.toUpperCase();
        this.isHost = true;
        console.log(`[MP] createRoom reserved OK — code: ${this.roomCode}, roomId: ${r.roomId}`);
        this.onStatusChange({ type: 'room_created', code: this.roomCode, roomId: r.roomId });
        console.log('[MP] createRoom → _connectWS...');
        await this._connectWS();
        console.log('[MP] createRoom complete');
        return { ok: true, code: this.roomCode, roomId: r.roomId };
      } else if (r.reason === 'conflict') {
        console.warn(`[MP] createRoom conflict on ${tryCode}, retrying...`);
        continue;
      } else {
        console.error(`[MP] createRoom failed — reason: ${r.reason}`);
        return { ok: false, reason: r.reason };
      }
    }
    console.error('[MP] createRoom exhausted all attempts');
    return { ok: false, reason: 'no_code' };
  }

  async joinRoom(code, meta = {}) {
    if (!code) return { ok: false, reason: 'missing_code' };
    this.roomCode = code.toUpperCase();
    this.isHost = false;
    this._joinMeta = meta;
    console.log(`[MP] joinRoom — code: ${this.roomCode}, meta:`, meta);
    this.onStatusChange({ type: 'joining', code: this.roomCode });
    console.log('[MP] joinRoom → _connectWS...');
    await this._connectWS();
    console.log('[MP] joinRoom _connectWS returned');
    return { ok: true };
  }

  leaveRoom() {
    for (const [, entry] of this.peers) {
      try { entry.dc && entry.dc.close(); } catch (e) {}
      try { entry.pc && entry.pc.close(); } catch (e) {}
    }
    this.peers.clear();
    this.peerMeta.clear();
    if (this.ws) this.ws.close();
    this.ws = null;
    if (this.ablyChannel) {
      try { this.ablyChannel.unsubscribe(); } catch (e) {}
    }
    if (this.ably) {
      try { this.ably.close(); } catch (e) {}
    }
    this.ably = null;
    this.ablyChannel = null;
    if (this.isHost && this.roomCode) {
      fetch(this.signalingUrl.replace(/\/+$/, '') + '/api/rooms/release', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: this.roomCode })
      }).catch(() => {});
    }
    this.roomCode = null;
    this.clientId = null;
    this.isHost = false;
    this.connected = false;
    this._joinMeta = null;
  }

  kickPeer(peerId) {
    if (!this.isHost) return false;
    this._sendToPeer(peerId, { t: 'KICK', p: { reason: 'kicked' } });
    this._closePeer(peerId);
    return true;
  }

  banUser(username, peerId = null) {
    if (!this.isHost || !username) return false;
    const uname = username.toLowerCase();
    this.bannedUsers.add(uname);
    if (peerId) this.kickPeer(peerId);
    this.broadcastData({ t: 'BAN_SYNC', p: { banned: Array.from(this.bannedUsers) } });
    return true;
  }

  unbanUser(username) {
    if (!this.isHost || !username) return false;
    this.bannedUsers.delete(username.toLowerCase());
    this.broadcastData({ t: 'BAN_SYNC', p: { banned: Array.from(this.bannedUsers) } });
    return true;
  }

  isBanned(username) {
    return username && this.bannedUsers.has(username.toLowerCase());
  }

  acceptJoinRequest(requestId) {
    const req = this.pendingJoinRequests.get(requestId);
    if (!req) return null;
    this.pendingJoinRequests.delete(requestId);
    return req;
  }

  rejectJoinRequest(requestId) {
    this.pendingJoinRequests.delete(requestId);
  }

  _closePeer(peerId) {
    const entry = this.peers.get(peerId);
    if (entry) {
      try { entry.dc && entry.dc.close(); } catch (e) {}
      try { entry.pc && entry.pc.close(); } catch (e) {}
      this.peers.delete(peerId);
    }
    this.peerMeta.delete(peerId);
    this.onPeerLeave(peerId);
    this.onStatusChange({ type: 'peer_disconnected', peerId });
  }

  _sendToPeer(peerId, msg) {
    const entry = this.peers.get(peerId);
    if (entry && entry.dc && entry.dc.readyState === 'open') {
      entry.dc.send(JSON.stringify(msg));
    }
  }

  _getPeerEntry(fromId) {
    return this.peers.get(fromId) || this.peers.get('HOST') || null;
  }

  async _connectWS() {
    if (!this.roomCode) throw new Error('no room code');
    console.log(`[MP] _connectWS — room: ${this.roomCode}, isHost: ${this.isHost}`);

    console.log('[MP] _connectWS → trying Ably...');
    if (await this._tryInitAblyChannel(this.roomCode)) {
      this.connected = true;
      console.log('[MP] _connectWS — using Ably transport');
      this.onStatusChange({ type: 'signaling', transport: 'ably' });
      if (this.isHost) {
        console.log('[MP] _connectWS — CLAIM_HOST via Ably');
        this.sendWS({ type: 'CLAIM_HOST' });
      } else {
        console.log('[MP] _connectWS — creating offer for host via Ably');
        await this._createOfferForHost();
      }
      return;
    }

    const wsUrl = (this.signalingUrl.replace(/^http/, 'ws')) + `/?room=${encodeURIComponent(this.roomCode)}`;
    console.log(`[MP] _connectWS — Ably unavailable, falling back to WebSocket: ${wsUrl}`);
    this.ws = new WebSocket(wsUrl);
    this.ws.addEventListener('open', () => {
      console.log('[MP] ws open');
      this.onStatusChange({ type: 'ws_open', code: this.roomCode, isHost: this.isHost });
    });
    this.ws.addEventListener('message', async (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      console.log('[MP] ws ←', msg.type, msg);
      await this._handleWSMessage(msg);
    });
    this.ws.addEventListener('close', (ev) => {
      console.warn(`[MP] ws closed — code: ${ev.code}, reason: "${ev.reason}", clean: ${ev.wasClean}`);
      this.connected = false;
      this.onStatusChange({ type: 'ws_closed', code: this.roomCode });
    });
    this.ws.addEventListener('error', (e) => {
      console.error('[MP] ws error', e);
      this.onStatusChange({ type: 'ws_error', error: e });
    });
  }

  sendWS(msg) {
    const payload = Object.assign({}, msg, { from: this.clientId });
    if (this.ablyChannel) {
      try { this.ablyChannel.publish('signal', payload); } catch (e) { console.warn('ably publish failed', e); }
      return;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  async _handleWSMessage(msg) {
    if (this.ablyChannel && msg.type !== 'WS_CONNECTED') {
      // Ably messages handled via _handleAblyMessage when subscribed
    }

    const { type } = msg;
    if (type === 'WS_CONNECTED') {
      this.clientId = msg.clientId;
      this.connected = true;
      console.log('[MP] WS_CONNECTED — clientId:', this.clientId, '| isHost:', this.isHost);
      if (this.isHost) {
        this.sendWS({ type: 'CLAIM_HOST' });
      } else {
        console.log('[MP] WS_CONNECTED — creating offer for host...');
        await this._createOfferForHost();
      }
      return;
    }

    if (type === 'JOIN_REQUEST' && this.isHost) {
      const username = (msg.p && msg.p.username) || msg.username || 'viewer';
      if (this.isBanned(username)) {
        this.sendWS({ type: 'JOIN_REJECT', to: msg.from, p: { reason: 'banned' } });
        return;
      }
      const requestId = `jr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.pendingJoinRequests.set(requestId, { username, from: msg.from, ts: Date.now() });
      this.onJoinRequest({ requestId, username, from: msg.from });
      return;
    }

    if (type === 'OFFER') {
      if (!this.isHost) return;
      const from = msg.from;
      const sdp = msg.p && msg.p.sdp;
      const displayName = (msg.p && msg.p.displayName) || from;
      const twitchUser = (msg.p && msg.p.twitchUser) || null;
      console.log(`[MP] OFFER from ${from} — displayName: ${displayName}`);
      if (twitchUser && this.isBanned(twitchUser)) {
        console.warn(`[MP] OFFER rejected — banned user: ${twitchUser}`);
        this.sendWS({ type: 'JOIN_REJECT', to: from, p: { reason: 'banned' } });
        return;
      }
      const pc = this._createPeerConnection(from);
      this.peerMeta.set(from, { displayName, twitchUser, joinedAt: Date.now() });
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log(`[MP] ANSWER → ${from}`);
        this.sendWS({ type: 'ANSWER', to: from, p: { sdp: pc.localDescription.sdp } });
      } catch (e) { console.error('[MP] offer handling failed', e); }
      return;
    }

    if (type === 'ANSWER') {
      if (this.isHost) return;
      const sdp = msg.p && msg.p.sdp;
      const from = msg.from;
      console.log(`[MP] ANSWER from ${from}`);
      const entry = this._getPeerEntry(from);
      if (entry && entry.pc) {
        await entry.pc.setRemoteDescription({ type: 'answer', sdp });
        if (this.peers.has('HOST') && from !== 'HOST') {
          const hostEntry = this.peers.get('HOST');
          this.peers.delete('HOST');
          this.peers.set(from, hostEntry);
          console.log(`[MP] migrated HOST → ${from}`);
        }
      }
      return;
    }

    if (type === 'ICE') {
      const candidate = msg.p && msg.p.cand;
      const from = msg.from;
      console.log(`[MP] ICE from ${from}`, candidate && candidate.type);
      const entry = this._getPeerEntry(from);
      if (entry && entry.pc && candidate) {
        try { await entry.pc.addIceCandidate(candidate); } catch (e) { console.warn('[MP] addIceCandidate failed', e); }
      }
      return;
    }

    if (type === 'JOIN_REJECT' && !this.isHost) {
      this.onStatusChange({ type: 'join_rejected', reason: (msg.p && msg.p.reason) || 'rejected' });
      this.leaveRoom();
      return;
    }
  }

  async _createPeerConnection(peerId) {
    const iceServers = await this._getIceServers();
    console.log(`[MP] _createPeerConnection — peerId: ${peerId}`);
    const pc = new RTCPeerConnection({ iceServers: iceServers || [{ urls: 'stun:stun.l.google.com:19302' }] });
    const entry = { pc, dc: null, meta: {} };
    this.peers.set(peerId, entry);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        console.log(`[MP] ICE candidate → ${peerId}`, ev.candidate.type, ev.candidate.protocol);
        this.sendWS({ type: 'ICE', to: peerId, p: { cand: ev.candidate } });
      } else {
        console.log(`[MP] ICE gathering complete for ${peerId}`);
      }
    };

    pc.onicegatheringstatechange = () => console.log(`[MP] ICE gathering state: ${pc.iceGatheringState} (${peerId})`);
    pc.oniceconnectionstatechange = () => console.log(`[MP] ICE connection state: ${pc.iceConnectionState} (${peerId})`);
    pc.onsignalingstatechange = () => console.log(`[MP] signaling state: ${pc.signalingState} (${peerId})`);

    pc.ondatachannel = (ev) => {
      console.log('[MP] ondatachannel from', peerId);
      const dc = ev.channel;
      entry.dc = dc;
      this._installDataChannelHandlers(dc, peerId);
    };

    pc.onconnectionstatechange = () => {
      console.log(`[MP] connection state: ${pc.connectionState} (${peerId})`);
      if (pc.connectionState === 'connected') {
        this.onPeerJoin(peerId);
        this.onPeerMetaUpdate(this.getPeerList());
        this.onStatusChange({ type: 'peer_connected', peerId });
        if (this.isHost) {
          this._sendToPeer(peerId, { t: 'BAN_SYNC', p: { banned: Array.from(this.bannedUsers) } });
          this._sendToPeer(peerId, { t: 'SYNC_REQUEST', p: {} });
        }
      } else if (['disconnected', 'closed', 'failed'].includes(pc.connectionState)) {
        console.warn(`[MP] peer ${peerId} left (${pc.connectionState})`);
        this._closePeer(peerId);
        this.onPeerMetaUpdate(this.getPeerList());
      }
    };

    return pc;
  }

  _installDataChannelHandlers(dc, peerId) {
    dc.onopen = () => {
      console.log('[multiplayer] datachannel open', peerId);
      if (!this.isHost && this._joinMeta) {
        dc.send(JSON.stringify({ t: 'PEER_ANNOUNCE', p: this._joinMeta }));
      }
    };
    dc.onclose = () => console.log('[multiplayer] datachannel close', peerId);
    dc.onmessage = (ev) => {
      try { const msg = JSON.parse(ev.data); this._handleDataMessage(msg, peerId); } catch (e) {}
    };
  }

  _handleDataMessage(msg, peerId) {
    const { t, p } = msg;
    if (t === 'STATE_SNAPSHOT') {
      this.onStateSnapshot(p);
    } else if (t === 'SYNC_RESPONSE' && !this.isHost) {
      this.onStateSnapshot(p);
      if (this.game && typeof this.game._onWorldSync === 'function') {
        this.game._onWorldSync(p);
      }
    } else if (t === 'SYNC_REQUEST' && this.isHost) {
      const snap = this._buildWorldSnapshot();
      this._sendToPeer(peerId, { t: 'SYNC_RESPONSE', p: snap });
    } else if (t === 'PEER_ANNOUNCE' && this.isHost && p) {
      this.peerMeta.set(peerId, { displayName: p.displayName || peerId, twitchUser: p.twitchUser, joinedAt: Date.now() });
      this.onPeerMetaUpdate(this.getPeerList());
    } else if (t === 'INPUT') {
      if (this.isHost) {
        try {
          if (this.game && typeof this.game._onRemoteInput === 'function') {
            this.game._onRemoteInput(peerId, p);
          }
        } catch (e) { console.warn('forward input failed', e); }
      }
    } else if (t === 'KICK' && !this.isHost) {
      this.onStatusChange({ type: 'kicked', reason: (p && p.reason) || 'kicked' });
      this.leaveRoom();
    } else if (t === 'BAN_SYNC') {
      if (p && Array.isArray(p.banned)) {
        this.bannedUsers = new Set(p.banned.map(u => u.toLowerCase()));
      }
    }
  }

  getPeerList() {
    return Array.from(this.peerMeta.entries()).map(([id, meta]) => ({
      id,
      displayName: meta.displayName || id,
      twitchUser: meta.twitchUser || null,
    }));
  }

  async _createOfferForHost() {
    const tempPeerId = 'HOST';
    console.log('[MP] _createOfferForHost — creating RTCPeerConnection...');
    const iceServers = await this._getIceServers();
    const pc = new RTCPeerConnection({ iceServers: iceServers || [{ urls: 'stun:stun.l.google.com:19302' }] });
    const dc = pc.createDataChannel('game');
    const entry = { pc, dc, meta: {} };
    this.peers.set(tempPeerId, entry);
    this._installDataChannelHandlers(dc, tempPeerId);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        console.log('[MP] ICE candidate → HOST', ev.candidate.type, ev.candidate.protocol);
        this.sendWS({ type: 'ICE', p: { cand: ev.candidate } });
      } else {
        console.log('[MP] ICE gathering complete for HOST');
      }
    };

    pc.onicegatheringstatechange = () => console.log(`[MP] ICE gathering state: ${pc.iceGatheringState} (HOST)`);
    pc.oniceconnectionstatechange = () => console.log(`[MP] ICE connection state: ${pc.iceConnectionState} (HOST)`);

    pc.onconnectionstatechange = () => {
      console.log(`[MP] connection state: ${pc.connectionState} (HOST)`);
      if (pc.connectionState === 'connected') {
        this.onStatusChange({ type: 'host_connected' });
        if (this.game && typeof this.game._onJoinedAsViewer === 'function') {
          this.game._onJoinedAsViewer();
        }
      }
    };

    const meta = this._joinMeta || {};
    console.log('[MP] _createOfferForHost — creating offer...');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log('[MP] _createOfferForHost — offer created, sending to host');
    this.sendWS({ type: 'OFFER', p: { sdp: pc.localDescription.sdp, displayName: meta.displayName, twitchUser: meta.twitchUser } });
  }

  broadcastData(msg) {
    const s = JSON.stringify(msg);
    for (const [, entry] of this.peers) {
      if (entry.dc && entry.dc.readyState === 'open') entry.dc.send(s);
    }
  }

  _buildWorldSnapshot() {
    const g = this.game;
    if (!g) return {};
    return {
      t: Date.now(),
      wave: g.levelManager ? g.levelManager.wave : 1,
      player: g.player ? { x: g.player.x, y: g.player.y, hp: g.player.hp, mp: g.player.mp } : null,
      enemies: (g.enemies || []).slice(0, 150).map(e => ({ id: e.id || null, type: e.type, x: e.x, y: e.y, hp: e.hp })),
      projectiles: (g.projectiles || []).slice(0, 200).map(p => ({ id: p.id || null, x: p.x, y: p.y, vx: p.vx, vy: p.vy })),
    };
  }

  saveRoomToFile(filename = null) {
    const g = this.game;
    const snap = this._buildWorldSnapshot();
    const data = {
      protocol_version: 1,
      roomCode: this.roomCode,
      createdAt: Date.now(),
      wave: snap.wave,
      player: snap.player,
      enemies: snap.enemies,
      projectiles: snap.projectiles,
      peers: this.getPeerList(),
      banned: Array.from(this.bannedUsers),
      meta: { note: 'World snapshot — excludes inventory, ability tree, and progression' }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const name = filename || `room_${this.roomCode || 'unknown'}_${Date.now()}.json`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  async loadRoomFromFile(file) {
    const txt = await file.text();
    try {
      const j = JSON.parse(txt);
      if (this.game && typeof this.game._applyRoomExport === 'function') {
        this.game._applyRoomExport(j);
      }
      return { ok: true, data: j };
    } catch (e) {
      return { ok: false, reason: 'parse' };
    }
  }

  async _fetchAblyToken() {
    console.log('[MP] _fetchAblyToken → POST /api/ably/token');
    try {
      const res = await fetch('/api/ably/token', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      console.log(`[MP] _fetchAblyToken ← HTTP ${res.status}`);
      if (!res.ok) return null;
      const json = await res.json();
      console.log('[MP] _fetchAblyToken — token payload keys:', Object.keys(json));
      return json;
    } catch (e) {
      console.error('[MP] _fetchAblyToken failed', e);
      return null;
    }
  }

  async _tryInitAblyChannel(code) {
    console.log('[MP] _tryInitAblyChannel — fetching token from /api/ably/token...');
    try {
      const tokenRequest = await this._fetchAblyToken();
      if (!tokenRequest) {
        console.warn('[MP] _tryInitAblyChannel — no token returned, Ably unavailable');
        return false;
      }
      console.log('[MP] _tryInitAblyChannel — token received, importing Ably...');
      const Ably = (await import('ably')).Realtime;
      this.ably = new Ably({ token: tokenRequest.token });
      const channelName = `rooms:${code}`;
      this.ablyChannel = this.ably.channels.get(channelName);
      this.clientId = tokenRequest.clientId || `ably_${Date.now()}`;
      console.log(`[MP] _tryInitAblyChannel — Ably channel: ${channelName}, clientId: ${this.clientId}`);

      this.ablyChannel.subscribe('signal', (msg) => {
        console.log('[MP] ably signal ←', msg.data && msg.data.type, msg.data);
        try { this._handleAblyMessage(msg.data); } catch (e) { console.warn('[MP] handle ably signal failed', e); }
      });

      if (this.isHost) {
        this.ablyChannel.presence.enter({ owner: true, createdAt: Date.now(), clientId: this.clientId });
      }

      this.connected = true;
      this.onStatusChange({ type: 'ABLY_CONNECTED', channel: channelName, clientId: this.clientId });
      console.log('[MP] _tryInitAblyChannel — Ably ready');
      return true;
    } catch (e) {
      console.error('[MP] _tryInitAblyChannel failed', e);
      this.ably = null;
      this.ablyChannel = null;
      return false;
    }
  }

  _handleAblyMessage(data) {
    this._handleWSMessage(data);
  }

  async _getIceServers() {
    console.log('[MP] _getIceServers → GET /api/turn');
    try {
      const res = await fetch('/api/turn');
      console.log(`[MP] _getIceServers ← HTTP ${res.status}`);
      if (!res.ok) return null;
      const j = await res.json();
      console.log('[MP] _getIceServers — servers:', j.iceServers);
      return j.iceServers || null;
    } catch (e) {
      console.warn('[MP] _getIceServers failed, using fallback STUN', e);
      return null;
    }
  }

  _generateCode(len = 6) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
}
