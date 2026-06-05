/**
 * TwitchManager — Twitch IRC chat integration for viewer interactions
 * Connects to Twitch chat via WebSocket, parses commands, manages cooldowns
 */
export class TwitchManager {
  constructor(game) {
    this.game = game;
    this.ws = null;
    this.channel = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 2000;

    // Command queue & rate limiting
    this.commandQueue = [];
    this.maxQueueSize = 5;
    this.globalCooldowns = {};
    this.userCooldowns = {};

    // Chat feed (for HUD display)
    this.chatFeed = []; // { username, command, text, color, time }
    this.maxFeedSize = 10;
    this.chatFontSize = 10;

    // Voting system
    this.voteActive = false;
    this.votes = {};       // { option: count }
    this.voterSet = new Set(); // prevent double-voting
    this.voteTimer = 0;
    this.voteOptions = [];
    this.voteCallback = null;
    this.voteDuration = 20;

    // Last custom redemption ID seen
    this.lastRedeemId = '';

    // Custom announcement templates (no emojis!)
    this.msgWaveStart = '[Aetherweaver] Wave {wave} has started! Spawn monsters with !spawn, curse the wizard with !curse, or trigger a !meteor!';
    this.msgVoteStart = '[Aetherweaver] VOTE STARTED! Options: {options}. Type "!vote <option>" in chat to participate! Time limit: {duration} seconds.';
    this.msgVoteEnd = '[Aetherweaver] Vote finished! Option "{winner}" won with {votes} votes ({total} total voters).';

    // Command definitions with cooldowns (seconds)
    this.commands = {
      'spawn':     { cooldown: 10, enabled: true, desc: 'Spawn an enemy', bits: 0, redeemId: '' },
      'heal':      { cooldown: 30, enabled: true, desc: 'Heal the player', bits: 0, redeemId: '' },
      'curse':     { cooldown: 20, enabled: true, desc: 'Spawn mini slimes', bits: 0, redeemId: '' },
      'buff':      { cooldown: 45, enabled: true, desc: 'Random buff', bits: 0, redeemId: '' },
      'meteor':    { cooldown: 60, enabled: true, desc: 'Meteor event', bits: 0, redeemId: '' },
      'vote':      { cooldown: 0,  enabled: true, desc: 'Vote on events', bits: 0, redeemId: '' },
      'gg':        { cooldown: 3,  enabled: true, desc: 'GG celebration', perUser: true, bits: 0, redeemId: '' },
      'backrooms': { cooldown: 120, enabled: true, desc: 'Backrooms chance', bits: 0, redeemId: '' },
    };

    this.enableAnnouncements = true;
    this.isAnonymous = true;

    // Load settings from localStorage
    this.loadSettings();
  }

  /**
   * Connect to Twitch IRC
   */
  connect(channelName) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.disconnect();
    }

    this.channel = channelName.toLowerCase().replace('#', '');
    console.log(`[Twitch] Connecting to #${this.channel}...`);

    // Check if we have a matching OAuth token for write access
    const savedToken = localStorage.getItem('twitch_oauth_token');
    const savedUserStr = localStorage.getItem('twitch_oauth_user');
    let oauthUser = null;
    if (savedUserStr) {
      try {
        oauthUser = JSON.parse(savedUserStr);
      } catch (e) {}
    }

    const useOAuth = savedToken && oauthUser && oauthUser.login && oauthUser.login.toLowerCase() === this.channel;
    this.isAnonymous = !useOAuth;

    try {
      this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

      this.ws.onopen = () => {
        this.ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
        if (useOAuth) {
          console.log(`[Twitch] Logging in with OAuth as ${oauthUser.login}...`);
          this.ws.send(`PASS oauth:${savedToken}`);
          this.ws.send(`NICK ${oauthUser.login}`);
        } else {
          console.log(`[Twitch] Logging in anonymously...`);
          const anonId = Math.floor(Math.random() * 99999);
          this.ws.send(`NICK justinfan${anonId}`);
        }
        this.ws.send(`JOIN #${this.channel}`);
        console.log(`[Twitch] Connected and joined #${this.channel}`);
        this.connected = true;
        this.reconnectAttempts = 0;
        this.addFeedMessage('SYSTEM', 'connected', `Connected to #${this.channel}${useOAuth ? ' (Bot Enabled)' : ' (Read-Only)'}`, '#4ecdc4');
        if (this.game && this.game.updateTwitchStatus) this.game.updateTwitchStatus();
      };

      this.ws.onmessage = (event) => {
        this.handleRawMessage(event.data);
      };

      this.ws.onclose = () => {
        console.log('[Twitch] Connection closed');
        this.connected = false;
        if (this.game && this.game.updateTwitchStatus) this.game.updateTwitchStatus();
        this.attemptReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[Twitch] WebSocket error:', err);
        this.connected = false;
        if (this.game && this.game.updateTwitchStatus) this.game.updateTwitchStatus();
      };
    } catch (e) {
      console.error('[Twitch] Failed to create WebSocket:', e);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.channel = null;
    this.addFeedMessage('SYSTEM', 'disconnected', 'Disconnected from Twitch', '#ff6b6b');
    if (this.game && this.game.updateTwitchStatus) this.game.updateTwitchStatus();
  }

  sendMessage(message) {
    if (!this.enableAnnouncements) return;
    if (this.ws && this.connected && this.channel && !this.isAnonymous) {
      console.log(`[Twitch Bot] Sending message to #${this.channel}: ${message}`);
      this.ws.send(`PRIVMSG #${this.channel} :${message}`);
    } else {
      console.log(`[Twitch Bot] Cannot send message (connected: ${this.connected}, anonymous: ${this.isAnonymous})`);
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts || !this.channel) return;
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
    console.log(`[Twitch] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    setTimeout(() => {
      if (!this.connected && this.channel) {
        this.connect(this.channel);
      }
    }, delay);
  }

  /**
   * Parse raw IRC messages
   */
  handleRawMessage(raw) {
    const lines = raw.split('\r\n');
    for (const line of lines) {
      if (!line) continue;

      let tags = {};
      let parseLine = line;
      if (line.startsWith('@')) {
        const firstSpace = line.indexOf(' ');
        if (firstSpace !== -1) {
          const tagsPart = line.substring(1, firstSpace);
          parseLine = line.substring(firstSpace + 1);
          const tagPairs = tagsPart.split(';');
          for (const pair of tagPairs) {
            const eqIdx = pair.indexOf('=');
            if (eqIdx !== -1) {
              const k = pair.substring(0, eqIdx);
              const v = pair.substring(eqIdx + 1);
              tags[k] = v;
            }
          }
        }
      }

      // Respond to PING to stay connected
      if (parseLine.startsWith('PING')) {
        this.ws.send('PONG :tmi.twitch.tv');
        return;
      }

      // Parse PRIVMSG (chat messages)
      const privmsgMatch = parseLine.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
      if (privmsgMatch) {
        const username = privmsgMatch[1];
        const message = privmsgMatch[2].trim();
        this.handleChatMessage(username, message, tags);
      }
    }
  }

  /**
   * Process a chat message for commands
   */
  handleChatMessage(username, message, tags = {}) {
    if (this.game.isTutorial) return;

    // Check custom reward redemption
    const redeemId = tags['custom-reward-id'];
    if (redeemId) {
      console.log(`[Twitch] Custom reward redeemed: ${redeemId} by ${username}`);
      this.lastRedeemId = redeemId;
      const lastRedeemEl = document.getElementById('twitch-last-redeem-id');
      if (lastRedeemEl) {
        lastRedeemEl.value = redeemId;
      }
      if (this.game && this.game.player) {
        this.game.particles.spawnText(this.game.player.x, this.game.player.y - 80, `REDEMPTION: ${username}!`, {
          color: '#a970ff', fontSize: 11, fontPixel: true, life: 2.0
        });
      }

      for (const [cmdName, cmdDef] of Object.entries(this.commands)) {
        if (cmdDef.enabled && cmdDef.redeemId && cmdDef.redeemId === redeemId) {
          const parts = message.toLowerCase().split(/\s+/);
          const args = parts;
          this.commandQueue.push({ cmd: cmdName, username, args, time: Date.now() });
          const colors = {
            spawn: '#ff6b6b', heal: '#2ecc71', curse: '#e74c3c',
            buff: '#a55eea', meteor: '#f39c12', gg: '#4ecdc4', backrooms: '#dbbf85'
          };
          this.addFeedMessage(username, cmdName, `[REDEEM] ${message}`, colors[cmdName] || '#9146FF');
          return;
        }
      }
    }

    const isCommand = message.startsWith('!');
    if (isCommand) {
      const parts = message.substring(1).toLowerCase().split(/\s+/);
      const cmdName = parts[0];
      const args = parts.slice(1);

      const cmdDef = this.commands[cmdName];
      if (cmdDef && cmdDef.enabled) {
        const now = Date.now();
        const userKey = `user_${username}`;
        
        // Check per-user global cooldown (3s between any commands)
        if (this.userCooldowns[userKey] && now - this.userCooldowns[userKey] < 3000) return;

        // Check command-specific cooldown
        if (cmdDef.perUser) {
          const perUserKey = `${cmdName}_${username}`;
          if (this.globalCooldowns[perUserKey] && now - this.globalCooldowns[perUserKey] < cmdDef.cooldown * 1000) return;
          this.globalCooldowns[perUserKey] = now;
        } else if (cmdDef.cooldown > 0) {
          if (this.globalCooldowns[cmdName] && now - this.globalCooldowns[cmdName] < cmdDef.cooldown * 1000) return;
          this.globalCooldowns[cmdName] = now;
        }

        this.userCooldowns[userKey] = now;

        // Handle vote command specially
        if (cmdName === 'vote') {
          this.handleVote(username, args);
          return;
        }

        // Queue the command
        if (this.commandQueue.length >= this.maxQueueSize) {
          this.commandQueue.shift(); // Drop oldest
        }
        this.commandQueue.push({ cmd: cmdName, username, args, time: now });

        // Add to chat feed
        const colors = {
          spawn: '#ff6b6b', heal: '#2ecc71', curse: '#e74c3c',
          buff: '#a55eea', meteor: '#f39c12', gg: '#4ecdc4', backrooms: '#dbbf85'
        };
        this.addFeedMessage(username, cmdName, message, colors[cmdName] || '#fff');
        return;
      }
    }

    // Add normal message to feed (username colored by Twitch color tag if present)
    const userColor = tags.color || '#a970ff';
    this.addFeedMessage(username, 'chat', message, userColor);
  }

  /**
   * Handle vote commands
   */
  handleVote(username, args) {
    if (!this.voteActive) return;
    if (this.voterSet.has(username)) return; // Already voted
    const choice = args[0];
    if (!choice || !this.voteOptions.includes(choice)) return;

    this.voterSet.add(username);
    this.votes[choice] = (this.votes[choice] || 0) + 1;
    this.addFeedMessage(username, 'vote', `voted for ${choice}`, '#7d5fff');
  }

  /**
   * Start a vote with given options and duration
   */
  startVote(options, durationSeconds, callback) {
    if (this.game.isTutorial) return;
    this.voteActive = true;
    this.voteOptions = options;
    this.votes = {};
    for (const opt of options) this.votes[opt] = 0;
    this.voterSet.clear();
    this.voteTimer = durationSeconds;
    this.voteCallback = callback;
    this.addFeedMessage('SYSTEM', 'vote', `VOTE STARTED! Type !vote ${options.join('/')}`, '#7d5fff');
    
    const optionsStr = options.map(o => o.toUpperCase()).join(', ');
    const msg = this.msgVoteStart
      .replace('{options}', optionsStr)
      .replace('{duration}', Math.ceil(durationSeconds));
    this.sendMessage(msg);
  }

  /**
   * End the current vote and call callback with winner
   */
  endVote() {
    if (!this.voteActive) return null;
    this.voteActive = false;

    let winner = null;
    let maxVotes = 0;
    for (const [opt, count] of Object.entries(this.votes)) {
      if (count > maxVotes) {
        maxVotes = count;
        winner = opt;
      }
    }

    const result = { winner, votes: { ...this.votes }, totalVoters: this.voterSet.size };
    this.addFeedMessage('SYSTEM', 'vote', `${winner ? winner.toUpperCase() + ' wins!' : 'No votes'} (${result.totalVoters} voters)`, '#7d5fff');
    
    const msg = this.msgVoteEnd
      .replace('{winner}', winner ? winner.toUpperCase() : 'NONE')
      .replace('{votes}', maxVotes)
      .replace('{total}', result.totalVoters);
    this.sendMessage(msg);

    if (this.voteCallback) {
      this.voteCallback(result);
      this.voteCallback = null;
    }
    return result;
  }

  /**
   * Process queued commands (called from Game.update)
   */
  update(dt) {
    // Process vote timer
    if (this.voteActive) {
      this.voteTimer -= dt;
      if (this.voteTimer <= 0) {
        this.endVote();
      }
    }

    // Fade old feed messages
    const now = Date.now();
    const oldLength = this.chatFeed.length;
    this.chatFeed = this.chatFeed.filter(msg => now - msg.time < 8000);

    if (this.chatFeed.length > 0) {
      this.updateHTMLChat();
    } else if (oldLength > 0) {
      const chatContainer = document.getElementById('hud-twitch-chat');
      if (chatContainer) chatContainer.innerHTML = '';
    }

    // Process one command per frame from queue
    if (this.commandQueue.length > 0) {
      const cmd = this.commandQueue.shift();
      this.executeCommand(cmd);
    }
  }

  /**
   * Execute a game command
   */
  executeCommand(cmd) {
    const game = this.game;
    if (!game || game.state !== 'PLAYING') return;

    const player = game.player;
    if (!player) return;

    switch (cmd.cmd) {
      case 'spawn': {
        // Spawn an enemy near the player
        const angle = Math.random() * Math.PI * 2;
        const dist = 300 + Math.random() * 200;
        const ex = player.x + Math.cos(angle) * dist;
        const ey = player.y + Math.sin(angle) * dist;
        const types = ['slime', 'skeleton', 'horror'];
        const spawnType = cmd.args[0] && types.includes(cmd.args[0]) ? cmd.args[0] : types[Math.floor(Math.random() * types.length)];
        game.spawnEnemy(ex, ey, spawnType);
        game.particles.spawnText(player.x, player.y - 60, `${cmd.username} spawned ${spawnType}!`, {
          color: '#ff6b6b', fontSize: 11, fontPixel: true
        });
        if (game.audio) game.audio.playUnlock();
        break;
      }

      case 'heal': {
        const healAmt = Math.min(10, player.maxHp - player.hp);
        player.hp = Math.min(player.maxHp, player.hp + 10);
        game.particles.spawnText(player.x, player.y - 60, `${cmd.username} healed +${healAmt} HP!`, {
          color: '#2ecc71', fontSize: 12, fontPixel: true
        });
        if (game.audio) game.audio.playCollect();
        game.updateHUD();
        break;
      }

      case 'curse': {
        // Spawn 3 mini slimes on the player
        for (let i = 0; i < 3; i++) {
          const angle = (i / 3) * Math.PI * 2;
          game.spawnEnemy(player.x + Math.cos(angle) * 80, player.y + Math.sin(angle) * 80, 'slime_mini');
        }
        game.particles.spawnText(player.x, player.y - 60, `${cmd.username} cursed you!`, {
          color: '#e74c3c', fontSize: 12, fontPixel: true
        });
        if (game.audio) game.audio.playHurt();
        break;
      }

      case 'buff': {
        const buffs = ['damage', 'haste', 'mana'];
        const buff = buffs[Math.floor(Math.random() * buffs.length)];
        const duration = 10;
        if (buff === 'damage') player.buffs.damage = Math.max(player.buffs.damage, duration);
        else if (buff === 'haste') player.buffs.haste = Math.max(player.buffs.haste, duration);
        else player.mp = Math.min(player.maxMp, player.mp + 20);
        game.particles.spawnText(player.x, player.y - 60, `${cmd.username} gave ${buff} buff!`, {
          color: '#a55eea', fontSize: 12, fontPixel: true
        });
        if (game.audio) game.audio.playLevelUp();
        break;
      }

      case 'meteor': {
        // Trigger a visual meteor event
        const mx = player.x + (Math.random() - 0.5) * 400;
        const my = player.y + (Math.random() - 0.5) * 400;
        // Damage enemies in radius
        game.enemies.forEach(e => {
          const dist = Math.hypot(e.x - mx, e.y - my);
          if (dist < 150) {
            e.hp -= 30;
            e.kbX += (e.x - mx) / dist * 8;
            e.kbY += (e.y - my) / dist * 8;
          }
        });
        // Meteor explosion particles
        for (let i = 0; i < 20; i++) {
          game.particles.spawn(mx, my, {
            color: i % 2 === 0 ? '#f39c12' : '#e74c3c',
            speed: 60 + Math.random() * 100,
            life: 0.6 + Math.random() * 0.4,
            size: 3 + Math.random() * 4,
          });
        }
        game.particles.spawnText(mx, my - 20, `* ${cmd.username}'s METEOR!`, {
          color: '#f39c12', fontSize: 14, fontPixel: true
        });
        if (game.audio) game.audio.playExplosion();
        break;
      }

      case 'gg': {
        game.particles.spawnText(
          player.x + (Math.random() - 0.5) * 200,
          player.y - 40 + (Math.random() - 0.5) * 100,
          `GG ${cmd.username}!`,
          { color: '#4ecdc4', fontSize: 10, fontPixel: true }
        );
        break;
      }

      case 'backrooms': {
        // 5% chance to trigger backrooms
        if (Math.random() < 0.05) {
          if (game.levelManager && game.levelManager.activateBackroomsSecret) {
            game.levelManager.activateBackroomsSecret();
            game.particles.spawnText(player.x, player.y - 60, `${cmd.username} opened THE BACKROOMS!`, {
              color: '#dbbf85', fontSize: 14, fontPixel: true
            });
          }
        } else {
          game.particles.spawnText(player.x, player.y - 60, `${cmd.username} tried the backrooms... nothing happened`, {
            color: '#dbbf85', fontSize: 10, fontPixel: true
          });
        }
        break;
      }
    }
  }

  /**
   * Add message to the visual chat feed
   */
  addFeedMessage(username, command, text, color) {
    this.chatFeed.push({
      username,
      command,
      text,
      color: color || '#fff',
      time: Date.now()
    });
    if (this.chatFeed.length > this.maxFeedSize) {
      this.chatFeed.shift();
    }
    this.updateHTMLChat();
  }

  /**
   * Render/update the HTML-based chat overlay
   */
  updateHTMLChat() {
    const chatContainer = document.getElementById('hud-twitch-chat');
    if (!chatContainer) return;

    chatContainer.innerHTML = '';
    const now = Date.now();

    for (let i = 0; i < this.chatFeed.length; i++) {
      const msg = this.chatFeed[i];
      const age = now - msg.time;
      const alpha = age > 6000 ? Math.max(0, 1 - (age - 6000) / 2000) : 1;
      if (alpha <= 0) continue;

      const msgEl = document.createElement('div');
      msgEl.className = 'twitch-chat-msg';
      msgEl.style.fontSize = `${this.chatFontSize}px`;
      msgEl.style.opacity = alpha;

      const userSpan = document.createElement('span');
      userSpan.style.color = msg.color || '#fff';
      userSpan.style.fontWeight = 'bold';
      userSpan.innerText = msg.username;

      const textSpan = document.createElement('span');
      textSpan.innerText = `: ${msg.text}`;
      textSpan.style.color = '#dfe7ff';

      msgEl.appendChild(userSpan);
      msgEl.appendChild(textSpan);
      chatContainer.appendChild(msgEl);
    }
  }

  /**
   * Draw the in-game canvas-based vote bar overlay (called from Game.draw)
   */
  drawOverlay(ctx, canvasWidth, canvasHeight) {
    // Vote bar (if active)
    if (this.voteActive && this.voteOptions.length > 0) {
      ctx.save();
      this.drawVoteBar(ctx, canvasWidth);
      ctx.restore();
    }
  }

  /**
   * Draw the vote bar overlay (top of screen)
   */
  drawVoteBar(ctx, canvasWidth) {
    const barY = 32;
    const barW = Math.min(500, canvasWidth - 60);
    const barX = (canvasWidth - barW) / 2;
    const barH = 36;

    ctx.globalAlpha = 0.9;

    // Background
    ctx.fillStyle = 'rgba(10, 10, 30, 0.85)';
    ctx.fillRect(barX - 4, barY - 4, barW + 8, barH + 24);
    ctx.strokeStyle = '#7d5fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX - 4, barY - 4, barW + 8, barH + 24);

    // Title + timer
    ctx.fillStyle = '#7d5fff';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText(`VOTE! (${Math.ceil(this.voteTimer)}s)`, barX, barY + 10);

    // Vote bars
    const totalVotes = Object.values(this.votes).reduce((a, b) => a + b, 0) || 1;
    const optColors = { fire: '#e74c3c', frost: '#3498db', void: '#8e44ad', lightning: '#f1c40f', dungeon: '#95a5a6', gardens: '#2ecc71', underground: '#e67e22', pool: '#3498db', volcanic: '#e74c3c', void_rift: '#9b59b6' };
    let ox = barX;
    const segW = barW / this.voteOptions.length;

    for (const opt of this.voteOptions) {
      const count = this.votes[opt] || 0;
      const pct = count / totalVotes;
      const color = optColors[opt] || '#4ecdc4';

      // Bar background
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(ox + 2, barY + 16, segW - 4, 12);

      // Fill
      ctx.fillStyle = color;
      ctx.fillRect(ox + 2, barY + 16, (segW - 4) * pct, 12);

      // Label
      ctx.fillStyle = '#fff';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText(`${opt} (${count})`, ox + 4, barY + 26);

      ox += segW;
    }
  }

  // ── Settings persistence ──────────────────────────────────────────

  loadSettings() {
    try {
      const saved = localStorage.getItem('twitch_settings');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.channel) this.channel = data.channel;
        if (data.enableAnnouncements !== undefined) this.enableAnnouncements = data.enableAnnouncements;
        if (data.chatFontSize !== undefined) this.chatFontSize = data.chatFontSize;
        if (data.voteDuration !== undefined) this.voteDuration = data.voteDuration;
        if (data.msgWaveStart !== undefined) this.msgWaveStart = data.msgWaveStart;
        if (data.msgVoteStart !== undefined) this.msgVoteStart = data.msgVoteStart;
        if (data.msgVoteEnd !== undefined) this.msgVoteEnd = data.msgVoteEnd;
        if (data.commands) {
          for (const [key, val] of Object.entries(data.commands)) {
            if (this.commands[key]) {
              this.commands[key].enabled = val.enabled !== false;
              if (val.cooldown !== undefined) this.commands[key].cooldown = val.cooldown;
              if (val.bits !== undefined) this.commands[key].bits = val.bits;
              if (val.redeemId !== undefined) this.commands[key].redeemId = val.redeemId;
              else if (val.points !== undefined) this.commands[key].redeemId = val.points ? String(val.points) : ''; // fallback
            }
          }
        }
        if (data.autoConnect && data.channel) {
          // Auto-connect on load
          setTimeout(() => this.connect(data.channel), 1000);
        }
      }
    } catch (e) {
      console.warn('[Twitch] Failed to load settings:', e);
    }
  }

  saveSettings() {
    try {
      const data = {
        channel: this.channel,
        autoConnect: this.connected,
        enableAnnouncements: this.enableAnnouncements,
        chatFontSize: this.chatFontSize,
        voteDuration: this.voteDuration,
        msgWaveStart: this.msgWaveStart,
        msgVoteStart: this.msgVoteStart,
        msgVoteEnd: this.msgVoteEnd,
        commands: {}
      };
      for (const [key, val] of Object.entries(this.commands)) {
        data.commands[key] = {
          enabled: val.enabled,
          cooldown: val.cooldown,
          bits: val.bits || 0,
          redeemId: val.redeemId || ''
        };
      }
      localStorage.setItem('twitch_settings', JSON.stringify(data));
    } catch (e) {
      console.warn('[Twitch] Failed to save settings:', e);
    }
  }

  /**
   * Get connection status for UI
   */
  getStatus() {
    return {
      connected: this.connected,
      channel: this.channel,
      feedCount: this.chatFeed.length,
      queueSize: this.commandQueue.length,
      voteActive: this.voteActive,
      votes: this.votes,
      voteTimer: this.voteTimer
    };
  }
}
