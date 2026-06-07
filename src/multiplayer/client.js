// Multiplayer client manager (MVP)
// Exposes a class MultiplayerManager with methods to create/join rooms via the signaling server.

export class MultiplayerManager {
  constructor(game, opts = {}) {
    this.game = game;
    this.signalingUrl = opts.signalingUrl || `${location.protocol}//${location.hostname}:${opts.signalingPort || 8081}`;
    this.roomCode = null;
    this.clientId = null;
    this.isHost = false;

    this.ws = null;
    this.peers = new Map(); // peerId -> { pc, dc }

    this.ably = null;
    this.ablyChannel = null;

    this.onStateSnapshot = opts.onStateSnapshot || (() => {});
    this.onPeerJoin = opts.onPeerJoin || (() => {});
    this.onPeerLeave = opts.onPeerLeave || (() => {});
    this.onStatusChange = opts.onStatusChange || (() => {}); // status updates for UI
  }

  async reserveCode(code, ttl = 1800) {
    // Try Ably presence-based reservation first (if available on Vercel token endpoint)
    try {
      const ablyToken = await this._fetchAblyToken();
      if (ablyToken && typeof Ably !== 'undefined') {
        // but Ably is not globally imported — attempt dynamic import
      }
    } catch (e) { /* ignore, fallback to HTTP */ }

    // Fallback: server reserve endpoint
    const url = this.signalingUrl.replace(/\/+$/, '') + '/api/rooms/reserve';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, ttl, owner: this.clientId || null }),
      });
      const j = await res.json();
      return j;
    } catch (e) {
      console.warn('reserve failure', e);
      return { ok: false, reason: 'network' };
    }
  }

  async createRoom(code = null) {
    // generate simple 6-char code if not provided
    code = code || this._generateCode(6);
    const attemptLimit = 8;
    for (let attempt = 0; attempt < attemptLimit; attempt++) {
      const tryCode = attempt === 0 ? code : this._generateCode(6);
      const r = await this.reserveCode(tryCode);
      if (r.ok) {
        this.roomCode = tryCode.toUpperCase();
        this.isHost = true;
        this.onStatusChange({ type: 'room_created', code: this.roomCode, roomId: r.roomId });
        await this._connectWS();
        // Host ready
        console.log('[multiplayer] room created', this.roomCode, r.roomId);
        return { ok: true, code: this.roomCode, roomId: r.roomId };
      } else if (r.reason === 'conflict') {
        continue; // try another
      } else {
        return { ok: false, reason: r.reason };
      }
    }
    return { ok: false, reason: 'no_code' };
  }

  async joinRoom(code) {
    if (!code) return { ok: false, reason: 'missing_code' };
    this.roomCode = code.toUpperCase();
    this.isHost = false;
    this.onStatusChange({ type: 'joining', code: this.roomCode });
    await this._connectWS();
    // After WS connected, create offer to establish P2P with host (host will reply)
    // Peer will create a peer connection and datachannel, then createOffer and broadcast.
    return { ok: true };
  }

  leaveRoom() {
    // Close all peers
    for (const [peerId, entry] of this.peers) {
      try { entry.dc && entry.dc.close(); } catch (e) {}
      try { entry.pc && entry.pc.close(); } catch (e) {}
    }
    this.peers.clear();
    if (this.ws) this.ws.close();
    this.ws = null;
    if (this.isHost && this.roomCode) {
      // release via API
      fetch(this.signalingUrl.replace(/\/+$/, '') + '/api/rooms/release', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: this.roomCode })
      }).catch(()=>{});
    }
    this.roomCode = null;
    this.clientId = null;
    this.isHost = false;
  }

  async _connectWS() {
    if (!this.roomCode) throw new Error('no room code');
    // Prefer Ably realtime channel for signaling if available
    if (await this._tryInitAblyChannel(this.roomCode)) {
      this.onStatusChange({ type: 'signaling', transport: 'ably' });
      return;
    }

    const wsUrl = (this.signalingUrl.replace(/^http/, 'ws') ) + `/?room=${encodeURIComponent(this.roomCode)}`;
    this.ws = new WebSocket(wsUrl);
    this.ws.addEventListener('open', () => {
      console.log('[multiplayer] ws open');
      this.onStatusChange({ type: 'ws_open', code: this.roomCode, isHost: this.isHost });
    });
    this.ws.addEventListener('message', async (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      await this._handleWSMessage(msg);
    });
    this.ws.addEventListener('close', () => {
      console.log('[multiplayer] ws closed');
      this.onStatusChange({ type: 'ws_closed', code: this.roomCode });
    });
    this.ws.addEventListener('error', (e) => {
      console.warn('[multiplayer] ws error', e);
      this.onStatusChange({ type: 'ws_error', error: e });
    });
  }

  sendWS(msg) {
    if (this.ablyChannel) {
      try { this.ablyChannel.publish('signal', msg); } catch (e) { console.warn('ably publish failed', e); }
      return;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  async _handleWSMessage(msg) {
    // If using Ably channel, messages come via _handleAblyMessage
    if (this.ablyChannel) return;

    const { type } = msg;
    if (type === 'WS_CONNECTED') {
      this.clientId = msg.clientId;
      console.log('[multiplayer] assigned clientId', this.clientId);
      // If joining as peer, proactively create offer
      if (!this.isHost) {
        // create peer connection and datachannel then createOffer
        await this._createOfferForHost();
      }
      return;
    }

    // WebRTC relay messages: OFFER, ANSWER, ICE
    if (type === 'OFFER') {
      // only host should respond
      if (!this.isHost) return;
      const from = msg.from;
      const sdp = msg.p && msg.p.sdp;
      console.log('[multiplayer] OFFER from', from);
      // Create RTCPeerConnection for this peer
      const pc = this._createPeerConnection(from);
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        // send answer targeted to peer
        this.sendWS({ type: 'ANSWER', to: from, p: { sdp: pc.localDescription.sdp } });
      } catch (e) { console.warn('offer handling failed', e); }
      return;
    }

    if (type === 'ANSWER') {
      if (this.isHost) return; // host doesn't expect answers
      const sdp = msg.p && msg.p.sdp;
      const from = msg.from;
      console.log('[multiplayer] ANSWER from', from);
      const entry = this.peers.get(from);
      if (entry && entry.pc) {
        await entry.pc.setRemoteDescription({ type: 'answer', sdp });
      }
      return;
    }

    if (type === 'ICE') {
      const candidate = msg.p && msg.p.cand;
      const from = msg.from;
      // route candidate to appropriate pc
      const entry = this.peers.get(from);
      if (entry && entry.pc && candidate) {
        try { await entry.pc.addIceCandidate(candidate); } catch (e) { console.warn('addIce failed', e); }
      }
      return;
    }

    // Other application-layer messages can be broadcast via datachannels; ignore here
  }

  _createPeerConnection(peerId) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const entry = { pc, dc: null };
    this.peers.set(peerId, entry);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        // route via Ably if available
        if (this.ablyChannel) this.ablyChannel.publish('signal', { type: 'ICE', to: peerId, p: { cand: ev.candidate } });
        else this.sendWS({ type: 'ICE', to: peerId, p: { cand: ev.candidate } });
      }
    };

    pc.ondatachannel = (ev) => {
      console.log('[multiplayer] ondatachannel from', peerId);
      const dc = ev.channel;
      entry.dc = dc;
      this._installDataChannelHandlers(dc, peerId);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        console.log('[multiplayer] peer connected', peerId);
        this.onPeerJoin(peerId);
        this.onStatusChange({ type: 'peer_connected', peerId });
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
        console.log('[multiplayer] peer left', peerId);
        this.peers.delete(peerId);
        this.onPeerLeave(peerId);
        this.onStatusChange({ type: 'peer_disconnected', peerId });
      }
    };

    return pc;
  }

  _installDataChannelHandlers(dc, peerId) {
    dc.onopen = () => console.log('[multiplayer] datachannel open', peerId);
    dc.onclose = () => console.log('[multiplayer] datachannel close', peerId);
    dc.onmessage = (ev) => {
      try { const msg = JSON.parse(ev.data); this._handleDataMessage(msg, peerId); } catch (e) {}
    };
  }

  _handleDataMessage(msg, peerId) {
    const { t, p } = msg;
    if (t === 'STATE_SNAPSHOT') {
      this.onStateSnapshot(p);
    } else if (t === 'INPUT') {
      // host will receive inputs from peers
      if (this.isHost) {
        // apply/queue inputs (integration with game loop needed)
        // For MVP just log
        // TODO: validate inputs and apply to authoritative state
        console.log('[multiplayer] input from', peerId, p);
      }
    }
  }

  async _createOfferForHost() {
    // create pc with wildcard peerId 'host' until answer arrives from host with from==hostClientId
    const tempPeerId = 'HOST';
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const dc = pc.createDataChannel('game');
    const entry = { pc, dc };
    this.peers.set(tempPeerId, entry);
    this._installDataChannelHandlers(dc, tempPeerId);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        if (this.ablyChannel) this.ablyChannel.publish('signal', { type: 'ICE', p: { cand: ev.candidate } });
        else this.sendWS({ type: 'ICE', p: { cand: ev.candidate } });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') console.log('[multiplayer] connected to host');
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // Broadcast OFFER (host will respond with ANSWER targeted to our clientId)
    if (this.ablyChannel) this.ablyChannel.publish('signal', { type: 'OFFER', p: { sdp: pc.localDescription.sdp } });
    else this.sendWS({ type: 'OFFER', p: { sdp: pc.localDescription.sdp } });
  }

  // Send game-level message to all connected datachannels
  broadcastData(msg) {
    const s = JSON.stringify(msg);
    for (const [peerId, entry] of this.peers) {
      if (entry.dc && entry.dc.readyState === 'open') entry.dc.send(s);
    }
  }

  // ---------------- ABLY INTEGRATION ----------------
  async _fetchAblyToken() {
   try {
     const res = await fetch('/api/ably/token', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
     if (!res.ok) return null;
     const tokenRequest = await res.json();
     return tokenRequest;
   } catch (e) { console.warn('fetchAblyToken failed', e); return null; }
  }

  async _tryInitAblyChannel(code) {
   // attempt to initialize Ably realtime channel for this room code
   try {
     const tokenRequest = await this._fetchAblyToken();
     if (!tokenRequest) return false;
     const Ably = (await import('ably')).Realtime;
     this.ably = new Ably({ token: tokenRequest.token });
     const channelName = `rooms:${code}`;
     this.ablyChannel = this.ably.channels.get(channelName);

     // subscribe to signaling messages
     this.ablyChannel.subscribe('signal', (msg) => {
       try { this._handleAblyMessage(msg.data); } catch (e) { console.warn('handle ably signal failed', e); }
     });

     // presence handling
     const members = await new Promise((resolve) => this.ablyChannel.presence.get((err, members) => resolve(members)));
     // if there is an owner present, we consider room reserved
     const ownerPresent = members && members.find && members.find(m => (m.data && m.data.owner));
     if (!ownerPresent && this.isHost) {
       // enter presence as owner
       this.ablyChannel.presence.enter({ owner: true, createdAt: Date.now(), clientId: tokenRequest.clientId || null }, (err) => { if (err) console.warn('presence enter failed', err); });
     }

     // subscribe to presence updates
     this.ablyChannel.presence.subscribe((presMsg) => {
       // presMsg.action: enter/leave/update
       this.onStatusChange({ type: 'presence', action: presMsg.action, member: presMsg });
     });

     // subscribe to generic messages for relay
     this.ablyChannel.subscribe((msg) => {
       // ignore non-signal messages
     });

     // publish WS_CONNECTED equivalent for client flow
     this.onStatusChange({ type: 'ABLY_CONNECTED', channel: channelName });
     return true;
   } catch (e) {
     console.warn('init ably failed', e);
     this.ably = null;
     this.ablyChannel = null;
     return false;
   }
  }

  _handleAblyMessage(data) {
   // data is the payload sent by another peer
   // emulate _handleWSMessage flow for Ably-based signaling
   const msg = data;
   const type = msg.type;
   if (type === 'OFFER') {
     if (!this.isHost) return;
     const from = msg.from || null;
     const sdp = msg.p && msg.p.sdp;
     const pc = this._createPeerConnection(from || `peer-${Date.now()}`);
     (async () => {
       try {
         await pc.setRemoteDescription({ type: 'offer', sdp });
         const answer = await pc.createAnswer();
         await pc.setLocalDescription(answer);
         this.ablyChannel.publish('signal', { type: 'ANSWER', to: from, p: { sdp: pc.localDescription.sdp } });
       } catch (e) { console.warn('offer handling failed', e); }
     })();
     return;
   }

   if (type === 'ANSWER') {
     if (this.isHost) return;
     const sdp = msg.p && msg.p.sdp;
     const from = msg.from;
     const entry = this.peers.get(from);
     if (entry && entry.pc) entry.pc.setRemoteDescription({ type: 'answer', sdp }).catch(e => console.warn('setRemoteDescription failed', e));
     return;
   }

   if (type === 'ICE') {
     const candidate = msg.p && msg.p.cand;
     const from = msg.from;
     const entry = this.peers.get(from);
     if (entry && entry.pc && candidate) entry.pc.addIceCandidate(candidate).catch(e => console.warn('addIce failed', e));
     return;
   }
  }

  // Save minimal room state to file
  saveRoomToFile(filename = null) {
    const data = {
      protocol_version: 1,
      roomCode: this.roomCode,
      createdAt: Date.now(),
      players: [],
      meta: { note: 'minimal snapshot' }
    };
    // Collect players from game if available
    if (this.game && this.game.player) {
      data.players.push({ id: 'host', x: this.game.player.x, y: this.game.player.y, hp: this.game.player.hp || null });
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const name = filename || `room_${this.roomCode || 'unknown'}.json`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // Load room from file (File object) and return parsed JSON
  async loadRoomFromFile(file) {
    const txt = await file.text();
    try { const j = JSON.parse(txt); return { ok: true, data: j }; } catch (e) { return { ok: false, reason: 'parse' }; }
  }

  _generateCode(len = 6) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
}
