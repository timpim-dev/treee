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

    this.onStateSnapshot = opts.onStateSnapshot || (() => {});
    this.onPeerJoin = opts.onPeerJoin || (() => {});
    this.onPeerLeave = opts.onPeerLeave || (() => {});
    this.onStatusChange = opts.onStatusChange || (() => {}); // status updates for UI
  }

  async reserveCode(code, ttl = 1800) {
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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  async _handleWSMessage(msg) {
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
        this.sendWS({ type: 'ICE', to: peerId, p: { cand: ev.candidate } });
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
    // But server will set msg.from when host replies; we'll use one anonymous pc keyed by host when ANSWER arrives with from.
    const tempPeerId = 'HOST';
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const dc = pc.createDataChannel('game');
    const entry = { pc, dc };
    this.peers.set(tempPeerId, entry);
    this._installDataChannelHandlers(dc, tempPeerId);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) this.sendWS({ type: 'ICE', p: { cand: ev.candidate } });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') console.log('[multiplayer] connected to host');
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // Broadcast OFFER (host will respond with ANSWER targeted to our clientId)
    this.sendWS({ type: 'OFFER', p: { sdp: pc.localDescription.sdp } });
  }

  // Send game-level message to all connected datachannels
  broadcastData(msg) {
    const s = JSON.stringify(msg);
    for (const [peerId, entry] of this.peers) {
      if (entry.dc && entry.dc.readyState === 'open') entry.dc.send(s);
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
