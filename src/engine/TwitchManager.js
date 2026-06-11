/**
 * TwitchManager — Twitch IRC chat integration for viewer interactions
 * Connects to Twitch chat via WebSocket, parses commands, manages cooldowns
 */
import { SPELL_TYPES } from './Spells.js';
import { RELICS_CATALOG, EQUIPMENT_CATALOG, createScaledLootItem } from '../entities/Player.js';

// Channel owner — bypasses all cooldowns and has exclusive commands
const OWNER_USERNAME = 'felix_th3rian';

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
      'spawn':     { cooldown: 10, enabled: true,  desc: 'Spawn an enemy', bits: 0, redeemId: '' },
      'heal':      { cooldown: 30, enabled: true,  desc: 'Heal the player', bits: 0, redeemId: '' },
      'curse':     { cooldown: 20, enabled: true,  desc: 'Spawn mini slimes', bits: 0, redeemId: '' },
      'buff':      { cooldown: 45, enabled: true,  desc: 'Random buff', bits: 0, redeemId: '' },
      'meteor':    { cooldown: 60, enabled: true,  desc: 'Meteor event', bits: 0, redeemId: '' },
      'vote':      { cooldown: 0,  enabled: true,  desc: 'Vote on events', bits: 0, redeemId: '' },
      'gg':        { cooldown: 3,  enabled: true,  desc: 'GG celebration', perUser: true, bits: 0, redeemId: '' },
      'backrooms': { cooldown: 120, enabled: true, desc: 'Backrooms chance', bits: 0, redeemId: '' },
      'join':      { cooldown: 30, enabled: false,  desc: 'Join streamer multiplayer room (temporarily disabled)', bits: 0, redeemId: '' },

      // ── Owner-only commands (Felix_th3rian) ───────────────────────────────
      'nuke':      { cooldown: 0, enabled: true, ownerOnly: true, desc: '[OWNER] Kill all enemies on screen' },
      'godmode':   { cooldown: 0, enabled: true, ownerOnly: true, desc: '[OWNER] Toggle invincibility for 30s' },
      'boss':      { cooldown: 0, enabled: true, ownerOnly: true, desc: '[OWNER] Force-spawn a random boss' },
      'killme':    { cooldown: 0, enabled: true, ownerOnly: true, desc: '[OWNER] Instantly kill the player (chaos)' },
      'fullheal':  { cooldown: 0, enabled: true, ownerOnly: true, desc: '[OWNER] Restore HP and MP to max' },
      'ap':        { cooldown: 0, enabled: true, ownerOnly: true, desc: '[OWNER] Grant 100 Aether Points' },
      'chaos':     { cooldown: 0, enabled: true, ownerOnly: true, desc: '[OWNER] Spawn 10 random enemies instantly' },
      'freeze':    { cooldown: 0, enabled: true, ownerOnly: true, desc: '[OWNER] Freeze all enemies for 5s' },
      'shockwave': { cooldown: 0, enabled: true, ownerOnly: true, desc: '[OWNER] Push all enemies away with massive knockback' },
      'loot':      { cooldown: 0, enabled: true, ownerOnly: true, desc: '[OWNER] Drop 5 relics at player position' },
    };

    this.enableAnnouncements = true;
    this.isAnonymous = true;
    this.enabled = true;

    // Load settings from localStorage
    this.loadSettings();
  }

  /**
   * Connect to Twitch IRC
   */
  connect(channelName) {
    if (!this.enabled) {
      console.log('[Twitch] Connection blocked because Twitch integration is disabled.');
      return;
    }
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
    console.log(`[Twitch] handleChatMessage — user: ${username}, msg: "${message}", gameState: ${this.game && this.game.state}, isTutorial: ${this.game && this.game.isTutorial}`);
    if (this.game.isTutorial) return;

    // Check custom reward redemption
    const redeemId = tags['custom-reward-id'];    if (redeemId) {
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
      console.log(`[Twitch] Command detected: !${cmdName}`, { cmdDef: this.commands[cmdName], enabled: this.commands[cmdName]?.enabled });

      const isOwner = username.toLowerCase() === OWNER_USERNAME;

      const cmdDef = this.commands[cmdName];
      if (cmdDef && cmdDef.enabled) {
        // Owner-only commands are gated
        if (cmdDef.ownerOnly && !isOwner) {
          console.log(`[Twitch] Command !${cmdName} blocked — owner-only command`);
          return;
        }

        const now = Date.now();
        const userKey = `user_${username}`;

        if (!isOwner) {
          // Check per-user global cooldown (3s between any commands)
          if (this.userCooldowns[userKey] && now - this.userCooldowns[userKey] < 3000) {
            console.log(`[Twitch] Command !${cmdName} blocked — per-user global cooldown (${Math.round((3000 - (now - this.userCooldowns[userKey])) / 1000)}s left)`);
            return;
          }

          // Check command-specific cooldown
          if (cmdDef.perUser) {
            const perUserKey = `${cmdName}_${username}`;
            if (this.globalCooldowns[perUserKey] && now - this.globalCooldowns[perUserKey] < cmdDef.cooldown * 1000) {
              console.log(`[Twitch] Command !${cmdName} blocked — per-user cooldown`);
              return;
            }
            this.globalCooldowns[perUserKey] = now;
          } else if (cmdDef.cooldown > 0) {
            if (this.globalCooldowns[cmdName] && now - this.globalCooldowns[cmdName] < cmdDef.cooldown * 1000) {
              console.log(`[Twitch] Command !${cmdName} blocked — global cooldown (${Math.round((cmdDef.cooldown * 1000 - (now - this.globalCooldowns[cmdName])) / 1000)}s left)`);
              return;
            }
            this.globalCooldowns[cmdName] = now;
          }
        } else {
          // Owner: reset global cooldown so the owner's free use doesn't block viewers either
          console.log(`[Twitch] Owner command !${cmdName} — all cooldowns bypassed`);
        }

        this.userCooldowns[userKey] = now;

        // Handle vote command specially
        if (cmdName === 'vote') {
          this.handleVote(username, args);
          return;
        }

        // !join — handled immediately, not queued (works outside PLAYING)
        if (cmdName === 'join') {
          this.handleJoinCommand(username);
          this.addFeedMessage(username, 'join', message, '#7d5fff');
          return;
        }

        // Queue the command
        if (this.commandQueue.length >= this.maxQueueSize) {
          this.commandQueue.shift(); // Drop oldest
        }
        console.log(`[Twitch] Queuing command: !${cmdName} from ${username} — queue size: ${this.commandQueue.length + 1}`);
        this.commandQueue.push({ cmd: cmdName, username, args, isOwner, time: now });

        // Add to chat feed
        const colors = {
          spawn: '#ff6b6b', heal: '#2ecc71', curse: '#e74c3c',
          buff: '#a55eea', meteor: '#f39c12', gg: '#4ecdc4', backrooms: '#dbbf85', join: '#7d5fff',
          // Owner command colours
          nuke: '#ff4757', godmode: '#ffd32a', boss: '#ff6348', killme: '#ff4757',
          fullheal: '#2ed573', ap: '#7d5fff', chaos: '#ff6b6b', freeze: '#70a1ff',
          shockwave: '#eccc68', loot: '#a55eea',
        };
        const feedColor = isOwner ? '#ffd32a' : (colors[cmdName] || '#fff');
        this.addFeedMessage(username, cmdName, `${isOwner ? '[OWNER] ' : ''}${message}`, feedColor);
        return;
      }
    }

    // Add normal message to feed (username colored by Twitch color tag if present)
    const userColor = tags.color || '#a970ff';
    this.addFeedMessage(username, 'chat', message, userColor);
  }

  /**
   * Handle !join command from chat viewer
   */
  handleJoinCommand(username) {
    const cmdDef = this.commands['join'];
    if (!cmdDef || !cmdDef.enabled) return;
    if (!this.game || typeof this.game.handleJoinCommand !== 'function') return;
    this.game.handleJoinCommand(username);
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
    if (!game || game.state !== 'PLAYING') {
      console.warn(`[Twitch] executeCommand skipped — game.state is "${game && game.state}" (need PLAYING)`);
      return;
    }

    const player = game.player;
    if (!player) return;

    switch (cmd.cmd) {
      case 'spawn': {
        // Spawn an enemy near the player
        const angle = Math.random() * Math.PI * 2;
        const dist = 300 + Math.random() * 200;
        const ex = player.x + Math.cos(angle) * dist;
        const ey = player.y + Math.sin(angle) * dist;
        const types = ['slime', 'slime_elite', 'slime_mini', 'skeleton', 'skeleton_elite', 'horror', 'horror_elite', 'warden'];
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

      // ── OWNER-ONLY COMMANDS ─────────────────────────────────────────────────

      case 'nuke': {
        // Instantly kill every enemy on screen
        let nuked = 0;
        for (const enemy of game.enemies) {
          if (!enemy.dead) { enemy.hp = 0; enemy.die(game); nuked++; }
        }
        game.particles.spawnText(player.x, player.y - 70, `NUKE — ${nuked} enemies eliminated`, {
          color: '#ff4757', fontSize: 11, fontPixel: true, life: 2.0
        });
        if (game.audio) game.audio.playExplosion();
        // Big screen flash
        for (let i = 0; i < 30; i++) {
          game.particles.spawn(
            player.x + (Math.random() - 0.5) * 600,
            player.y + (Math.random() - 0.5) * 600,
            { color: '#ff4757', size: 4 + Math.random() * 6, life: 0.8 + Math.random() * 0.4, vx: (Math.random()-0.5)*60, vy: (Math.random()-0.5)*60, glow: true }
          );
        }
        break;
      }

      case 'godmode': {
        // 30 seconds of invincibility via godmodeTimer flag (checked in Player.takeDamage)
        player.godmodeTimer = (player.godmodeTimer || 0) + 30;
        game.particles.spawnText(player.x, player.y - 70, 'GODMODE ACTIVE — 30s', {
          color: '#ffd32a', fontSize: 11, fontPixel: true, life: 2.5
        });
        // Gold aura burst
        for (let i = 0; i < 18; i++) {
          const ga = (i / 18) * Math.PI * 2;
          game.particles.spawn(player.x + Math.cos(ga) * 30, player.y + Math.sin(ga) * 30, {
            vx: Math.cos(ga) * 40, vy: Math.sin(ga) * 40,
            color: '#ffd32a', size: 3, life: 0.8, glow: true
          });
        }
        if (game.audio) game.audio.playLevelUp();
        break;
      }

      case 'boss': {
        // Force-spawn a random boss near the player
        const bossList = ['archon', 'volcanic_titan', 'void_behemoth'];
        const bossType = cmd.args[0] && bossList.includes(cmd.args[0]) ? cmd.args[0] : bossList[Math.floor(Math.random() * bossList.length)];
        const bAngle = Math.random() * Math.PI * 2;
        const bDist = 400 + Math.random() * 150;
        game.spawnEnemy(player.x + Math.cos(bAngle) * bDist, player.y + Math.sin(bAngle) * bDist, bossType);
        game.particles.spawnText(player.x, player.y - 70, `BOSS SUMMONED: ${bossType.toUpperCase()}`, {
          color: '#ff6348', fontSize: 10, fontPixel: true, life: 2.5
        });
        if (game.audio) game.audio.playUnlock();
        break;
      }

      case 'killme': {
        // Instantly kill the player (chaos / content)
        if (player.hp > 0) {
          game.particles.spawnText(player.x, player.y - 70, 'SELF-DESTRUCT INITIATED', {
            color: '#ff4757', fontSize: 10, fontPixel: true, life: 2.0
          });
          for (let i = 0; i < 25; i++) {
            game.particles.spawn(player.x + (Math.random()-0.5)*60, player.y + (Math.random()-0.5)*60, {
              color: i % 2 === 0 ? '#ff4757' : '#ffd32a',
              size: 3 + Math.random() * 5, life: 0.6 + Math.random() * 0.5,
              vx: (Math.random()-0.5)*120, vy: (Math.random()-0.5)*120, glow: true
            });
          }
          player.hp = 0;
          game.gameOver();
        }
        break;
      }

      case 'fullheal': {
        // Restore HP and MP completely (use modifier-aware getters)
        player.hp = player.getMaxHp();
        player.mp = player.getMaxMp();
        game.particles.spawnText(player.x, player.y - 70, 'FULLY RESTORED', {
          color: '#2ed573', fontSize: 11, fontPixel: true, life: 2.0
        });
        game.particles.createExplosion(player.x, player.y, '#2ed573', 16, 80, 3);
        if (game.audio) game.audio.playCollect();
        game.updateHUD();
        break;
      }

      case 'ap': {
        // Grant Aether Points through gainXp so level-ups fire correctly
        const apAmount = parseInt(cmd.args[0]) || 100;
        const clampedAp = Math.min(apAmount, 9999);
        player.gainXp(clampedAp);
        game.particles.spawnText(player.x, player.y - 70, `+${clampedAp} AP (OWNER GRANT)`, {
          color: '#7d5fff', fontSize: 10, fontPixel: true, life: 2.0
        });
        break;
      }

      case 'chaos': {
        // Spawn 10 random enemies instantly around the player
        const chaosTypes = ['slime', 'slime_elite', 'skeleton', 'skeleton_elite', 'horror', 'horror_elite', 'warden'];
        for (let i = 0; i < 10; i++) {
          const cAngle = (i / 10) * Math.PI * 2 + Math.random() * 0.3;
          const cDist = 280 + Math.random() * 200;
          const cType = chaosTypes[Math.floor(Math.random() * chaosTypes.length)];
          game.spawnEnemy(player.x + Math.cos(cAngle) * cDist, player.y + Math.sin(cAngle) * cDist, cType);
        }
        game.particles.spawnText(player.x, player.y - 70, 'CHAOS MODE ACTIVATED', {
          color: '#ff6b6b', fontSize: 10, fontPixel: true, life: 2.5
        });
        if (game.audio) game.audio.playExplosion();
        break;
      }

      case 'freeze': {
        // Freeze all enemies for 5 seconds
        let frozenCount = 0;
        for (const enemy of game.enemies) {
          if (!enemy.dead) {
            enemy.statuses[SPELL_TYPES.FROST] = 5.0;
            frozenCount++;
          }
        }
        game.particles.spawnText(player.x, player.y - 70, `FROZEN — ${frozenCount} enemies`, {
          color: '#70a1ff', fontSize: 10, fontPixel: true, life: 2.0
        });
        if (game.audio) game.audio.playCollect();
        break;
      }

      case 'shockwave': {
        // Massive knockback on every enemy from the player position
        let shockCount = 0;
        for (const enemy of game.enemies) {
          if (!enemy.dead) {
            const sdx = enemy.x - player.x;
            const sdy = enemy.y - player.y;
            const sdist = Math.hypot(sdx, sdy) || 1;
            enemy.kbX += (sdx / sdist) * 800;
            enemy.kbY += (sdy / sdist) * 800;
            shockCount++;
          }
        }
        game.particles.createExplosion(player.x, player.y, '#eccc68', 35, 300, 5);
        game.particles.spawnText(player.x, player.y - 70, `SHOCKWAVE — ${shockCount} enemies launched`, {
          color: '#eccc68', fontSize: 10, fontPixel: true, life: 2.0
        });
        if (game.audio) game.audio.playExplosion();
        break;
      }

      case 'loot': {
        // Drop 5 random relics from the catalog
        const lootPool = [...(RELICS_CATALOG || []), ...(EQUIPMENT_CATALOG || [])];
        const lootCount = Math.min(5, lootPool.length > 0 ? 5 : 1);
        for (let i = 0; i < lootCount; i++) {
          const angle = (i / lootCount) * Math.PI * 2;
          const lx = player.x + Math.cos(angle) * 60;
          const ly = player.y + Math.sin(angle) * 60;
          if (lootPool.length > 0) {
            const relic = lootPool[Math.floor(Math.random() * lootPool.length)];
            const item = createScaledLootItem ? createScaledLootItem(relic, game.levelManager.wave) : relic;
            game.spawnItem(lx, ly, 'relic', item);
          } else {
            game.spawnItem(lx, ly, 'hp', 50);
          }
        }
        game.particles.spawnText(player.x, player.y - 70, 'LOOT SHOWER — 5 relics dropped', {
          color: '#a55eea', fontSize: 10, fontPixel: true, life: 2.0
        });
        if (game.audio) game.audio.playUnlock();
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
        if (data.enabled !== undefined) this.enabled = data.enabled;
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
        if (data.autoConnect && data.channel && this.enabled !== false) {
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
        enabled: this.enabled !== false,
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
