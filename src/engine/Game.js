/**
 * Game - Main Orchestrator and Game Loop Manager
 */
import { AssetManager } from './AssetManager.js';
import { ParticleSystem } from './ParticleSystem.js';
import { AbilityTree } from './AbilityTree.js';
import { LevelManager } from './LevelManager.js';
import { MultiplayerManager } from '../multiplayer/client.js';
import { AudioManager } from './AudioManager.js';
import { Player, RELICS_CATALOG, EQUIPMENT_CATALOG } from '../entities/Player.js';
import { Enemy } from '../entities/Enemy.js';
import { Companion } from '../entities/Companion.js';
import { SPELL_TYPES, SpellBook, processCombo } from './Spells.js';
import { TwitchManager } from './TwitchManager.js';
import { PocketBaseClient } from './PocketBaseClient.js';
import { StoryLevels } from './StoryLevels.js';

export class Game {
  constructor() {
    // 1. Setup Canvas
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
    
    // 2. Instantiate Systems
    this.assets = new AssetManager();
    this.particles = new ParticleSystem();
    this.audio = new AudioManager();
    this.abilityTree = new AbilityTree(this);
    this.levelManager = new LevelManager(this);
    
    // PocketBase & Twitch Manager setup
    this.pbClient = new PocketBaseClient();
    this.twitchManager = new TwitchManager(this);
    
    // Initialize settings fields with default values
    this.enableScreenShake = true;
    this.enableGlowEffects = true;
    this.showDamageNumbers = true;
    this.showEnemyHealthbars = true;
    this.showFloorGrid = true;
    this.lowParticleMode = false;
    this.showSpellTrails = true;
    this.isStoryMode = false;
    this.isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    this.devtoolsVisible = false;
    this.customPresetIdx = 0;
    this.nextThemeOverride = null;
    this.frameCount = 0;
    
    // Multiplayer helpers
    this.remotePlayers = new Map(); // other players seen from snapshots
    this._mpHostInterval = null;
    this._remoteInputQueue = []; // inputs received by host from peers (to be applied in host game loop)
    this.isMultiplayerViewer = false; // true when joined as viewer (no host inventory sync)
    this._viewerSaveBackup = null; // backup of viewer SP state while in MP session

    // Dev overlay flags
    this.devShowHitboxes = false;
    this.devShowPaths = false;
    this.devShowFps = false;
    this.devShowGrid = false;
    this._fpsHistory = [];
    this._lastFpsTime = 0;
    this._renderFallbackWarned = false;
    
    // Worldmap zoom/drag state
    this.mapZoom = 1.0;
    this.mapPanX = 0;
    this.mapPanY = 0;
    this._mapDragging = false;
    this._mapDragStartX = 0;
    this._mapDragStartY = 0;
    
    // Load persisted settings
    this.loadSettings();
    
    // Unlock AudioContext on first user interaction
    const unlockAudio = () => {
      this.audio.init();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    
    // Player spawn centered on the active starting sector
    const spawnPoint = this.levelManager.getSpawnPoint();
    this.player = new Player(this, spawnPoint.x, spawnPoint.y);
    this.abilityTree.panX = 0;
    this.abilityTree.panY = 0;
    this.player.recalculateModifiers(this.abilityTree);
    
    // Camera
    this.camera = { x: this.player.x - this.canvas.width / 2, y: this.player.y - this.canvas.height / 2 };
    
    // 3. Entity Registers
    this.projectiles = [];
    this.enemies = [];
    this.companions = [];
    this.items = [];
    this.areaEffects = [];
    
    // 4. Inputs state
    this.keys = {};
    this.mouseX = 0;
    this.mouseY = 0;
    this.isLeftMouseDown = false;
    this.isRightMouseDown = false;
    
    // 5. Game State Parameters
    this.state = 'MENU'; // 'MENU', 'PLAYING', 'UPGRADE_TREE', 'GAME_OVER', 'PAUSED'
    this.gameZoom = 1.0;
    this.score = 0;
    this.kills = 0;
    this.isTutorial = false;
    this.renderDistance = 1200;
    
    // Frame clocks
    this.lastTime = 0;
    this.frameIndex = 0;
    this.screenShake = 0;
    this.timeDilationTimer = 0; // Chrono dilation active indicator
    
    // 6. Bind Listeners
    this.initInputListeners();
    this.initUIListeners();
    this.updateHUD();
    this.initDevtoolsUI();
    // Multiplayer UI helpers
    this.initMultiplayerUI = function() {
      if (document.getElementById('mp-modal')) return; // already init

      // Add HUD button if HUD is available
      const hudRight = document.getElementById('hud-right-controls');
      if (hudRight && !document.getElementById('btn-multiplayer')) {
        const btn = document.createElement('button');
        btn.id = 'btn-multiplayer';
        btn.className = 'hud-btn';
        btn.innerText = 'Multiplayer';
        btn.addEventListener('click', () => this._openMultiplayerModal());
        hudRight.appendChild(btn);
      }

      const modal = document.createElement('div');
      modal.id = 'mp-modal';
      modal.style.cssText = `
        display:none; position:fixed; left:50%; top:50%;
        transform:translate(-50%,-50%); z-index:9999;
        background:#080a14; border:6px double #fff;
        box-shadow:8px 8px 0 rgba(0,0,0,0.8);
        padding:30px 36px; min-width:400px; max-width:480px;
        width:90vw; font-family:'Press Start 2P',monospace;
      `;
      modal.innerHTML = `
        <div style="text-align:center; margin-bottom:20px;">
          <div style="font-size:18px; color:#fff; text-shadow:4px 4px 0 #7d5fff; letter-spacing:2px; margin-bottom:6px;">MULTIPLAYER</div>
          <div style="width:80px; height:4px; background:#fff; margin:0 auto;"></div>
        </div>

        <!-- HOST section -->
        <div id="mp-section-host" style="margin-bottom:20px;">
          <div style="font-size:7px; color:#a4b0be; letter-spacing:1px; margin-bottom:12px;">HOST A ROOM</div>
          <button id="mp-create-btn" style="
            width:100%; background:#111424; border:4px solid #fff; color:#fff;
            font-family:'Press Start 2P',monospace; font-size:9px; padding:12px;
            cursor:pointer; box-shadow:4px 4px 0 #7d5fff; letter-spacing:1px;
          ">CREATE ROOM</button>
          <div id="mp-room-info" style="display:none; margin-top:14px; padding:12px; background:rgba(125,95,255,0.1); border:2px dashed rgba(125,95,255,0.5); text-align:center;">
            <div style="font-size:7px; color:#a4b0be; margin-bottom:6px;">ROOM CODE</div>
            <div id="mp-room-code" style="font-size:20px; color:#fff; letter-spacing:6px; text-shadow:0 0 10px rgba(125,95,255,0.6); margin-bottom:10px;"></div>
            <button id="mp-copy-link" style="
              background:#111424; border:3px solid #7d5fff; color:#7d5fff;
              font-family:'Press Start 2P',monospace; font-size:7px; padding:6px 12px;
              cursor:pointer; box-shadow:3px 3px 0 #5b3cc4;
            ">COPY INVITE LINK</button>
          </div>
        </div>

        <div style="border-top:1px dashed rgba(255,255,255,0.15); margin:16px 0;"></div>

        <!-- JOIN section -->
        <div id="mp-section-join" style="margin-bottom:20px;">
          <div style="font-size:7px; color:#a4b0be; letter-spacing:1px; margin-bottom:12px;">JOIN A ROOM</div>
          <div style="display:flex; gap:8px;">
            <input id="mp-join-input" placeholder="ENTER CODE" style="
              flex:1; background:rgba(5,8,18,0.9); border:2px solid rgba(181,126,255,0.45);
              color:#fff; font-family:'Press Start 2P',monospace; font-size:9px;
              padding:10px 12px; outline:none; letter-spacing:3px; text-transform:uppercase;
            ">
            <button id="mp-join-btn" style="
              background:#111424; border:4px solid #fff; color:#fff;
              font-family:'Press Start 2P',monospace; font-size:8px; padding:10px 14px;
              cursor:pointer; box-shadow:3px 3px 0 #7d5fff; white-space:nowrap;
            ">JOIN</button>
          </div>
        </div>

        <!-- Status -->
        <div id="mp-status" style="font-size:7px; color:#a4b0be; text-align:center; min-height:16px; margin-bottom:14px; letter-spacing:1px;"></div>

        <!-- Host panel (players in room) -->
        <div id="mp-host-panel" style="display:none; border-top:1px dashed rgba(255,255,255,0.15); padding-top:14px; margin-bottom:14px;">
          <div style="font-size:7px; color:#7d5fff; letter-spacing:1px; margin-bottom:8px;">PLAYERS IN ROOM</div>
          <div id="mp-peer-list" style="font-size:8px; max-height:100px; overflow-y:auto;"></div>
          <div id="mp-banned-list" style="font-size:7px; color:#a4b0be; margin-top:6px;"></div>
        </div>

        <!-- Actions row -->
        <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
          <button id="mp-leave-btn" style="
            background:#111424; border:4px solid #ff4757; color:#ff4757;
            font-family:'Press Start 2P',monospace; font-size:7px; padding:8px 14px;
            cursor:pointer; box-shadow:3px 3px 0 #c0392b;
          ">LEAVE</button>
          <button id="mp-close-btn" style="
            background:#111424; border:4px solid #a4b0be; color:#a4b0be;
            font-family:'Press Start 2P',monospace; font-size:7px; padding:8px 14px;
            cursor:pointer; box-shadow:3px 3px 0 #636e72;
          ">CLOSE</button>
        </div>
      `;
      document.body.appendChild(modal);

      // Join request popup
      const joinPopup = document.createElement('div');
      joinPopup.id = 'mp-join-request-popup';
      joinPopup.style.cssText = `
        display:none; position:fixed; top:20px; right:20px; z-index:10000;
        background:#080a14; border:6px double #a55eea;
        box-shadow:6px 6px 0 rgba(0,0,0,0.8); padding:18px 22px;
        min-width:260px; font-family:'Press Start 2P',monospace;
      `;
      joinPopup.innerHTML = `
        <div style="font-size:9px; color:#a55eea; letter-spacing:1px; margin-bottom:10px;">JOIN REQUEST</div>
        <div id="mp-join-req-user" style="font-size:8px; color:#fff; margin-bottom:14px;"></div>
        <div style="display:flex; gap:8px;">
          <button id="mp-join-accept" style="
            flex:1; background:#111424; border:3px solid #2ecc71; color:#2ecc71;
            font-family:'Press Start 2P',monospace; font-size:7px; padding:8px;
            cursor:pointer; box-shadow:3px 3px 0 #27ae60;
          ">ACCEPT</button>
          <button id="mp-join-deny" style="
            flex:1; background:#111424; border:3px solid #ff4757; color:#ff4757;
            font-family:'Press Start 2P',monospace; font-size:7px; padding:8px;
            cursor:pointer; box-shadow:3px 3px 0 #c0392b;
          ">DENY</button>
        </div>
      `;
      document.body.appendChild(joinPopup);
      this._joinRequestPopup = joinPopup;
      this._pendingJoinRequestUI = null;

      this._openMultiplayerModal = () => {
        modal.style.display = 'block';
        this._updateHostPanel();
      };
      this._closeMultiplayerModal = () => { modal.style.display = 'none'; };

      // Hover effects
      modal.querySelectorAll('button').forEach(b => {
        b.addEventListener('mouseenter', () => { b.style.transform = 'translate(2px,2px)'; });
        b.addEventListener('mouseleave', () => { b.style.transform = ''; });
      });

      modal.querySelector('#mp-close-btn').addEventListener('click', () => this._closeMultiplayerModal());
      modal.querySelector('#mp-leave-btn').addEventListener('click', () => {
        if (this.multiplayer) this.multiplayer.leaveRoom();
        this._restoreViewerSaveAfterLeave();
        this._setMpStatus('LEFT ROOM');
        this._stopHostBroadcast();
        this.remotePlayers.clear();
        modal.querySelector('#mp-room-info').style.display = 'none';
        this._updateHostPanel();
      });

      modal.querySelector('#mp-create-btn').addEventListener('click', async () => {
        this._setMpStatus('CREATING ROOM...');
        const r = await this.multiplayer.createRoom(null); // always random
        if (r.ok) {
          this.isMultiplayerViewer = false;
        } else {
          this._setMpStatus('FAILED: ' + (r.reason || 'unknown').toUpperCase());
        }
      });

      modal.querySelector('#mp-join-btn').addEventListener('click', async () => {
        const code = modal.querySelector('#mp-join-input').value.trim().toUpperCase();
        if (!code) return this._setMpStatus('ENTER A ROOM CODE');
        this._setMpStatus('JOINING...');
        const twitchUser = this.twitchManager.channel || null;
        const r = await this.multiplayer.joinRoom(code, { displayName: twitchUser || 'player', twitchUser });
        if (!r.ok) this._setMpStatus('FAILED: ' + (r.reason || 'unknown').toUpperCase());
      });

      modal.querySelector('#mp-copy-link').addEventListener('click', () => {
        const el = modal.querySelector('#mp-share-link-val');
        if (!el || !el.value) return;
        el.select ? el.select() : null;
        navigator.clipboard.writeText(el.value).catch(() => {
          const tmp = document.createElement('textarea');
          tmp.value = el.value;
          document.body.appendChild(tmp);
          tmp.select();
          document.execCommand('copy');
          document.body.removeChild(tmp);
        });
        this._setMpStatus('LINK COPIED!');
      });

      // Hidden input to hold share link value
      const shareLinkInput = document.createElement('input');
      shareLinkInput.id = 'mp-share-link-val';
      shareLinkInput.type = 'hidden';
      modal.appendChild(shareLinkInput);

      joinPopup.querySelector('#mp-join-accept').addEventListener('click', () => this._acceptJoinRequestUI());
      joinPopup.querySelector('#mp-join-deny').addEventListener('click', () => this._denyJoinRequestUI());

      this._setMpStatus = (txt) => {
        const el = modal.querySelector('#mp-status');
        if (el) el.textContent = txt;
      };
      this._setMpLink = (url) => {
        const el = modal.querySelector('#mp-share-link-val');
        if (el) el.value = url || '';
      };
      this._setMpPeers = (list) => { /* handled by _updateHostPanel */ };

      this._updateHostPanel = () => {
        const panel = modal.querySelector('#mp-host-panel');
        const listEl = modal.querySelector('#mp-peer-list');
        const bannedEl = modal.querySelector('#mp-banned-list');
        if (!panel || !this.multiplayer || !this.multiplayer.isHost) {
          if (panel) panel.style.display = 'none';
          return;
        }
        panel.style.display = 'block';
        const peers = this.multiplayer.getPeerList();
        listEl.innerHTML = peers.length === 0
          ? '<div style="color:#a4b0be; font-size:7px;">NO PLAYERS CONNECTED</div>'
          : peers.map(p => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px dashed rgba(255,255,255,0.1);">
              <span style="font-size:7px; color:#fff;">${p.displayName || p.id}</span>
              <span style="display:flex; gap:6px;">
                <button data-kick="${p.id}" style="font-family:'Press Start 2P',monospace; font-size:6px; padding:3px 7px; background:#111424; border:2px solid #a4b0be; color:#a4b0be; cursor:pointer;">KICK</button>
                <button data-ban="${p.id}" data-user="${p.twitchUser || p.displayName}" style="font-family:'Press Start 2P',monospace; font-size:6px; padding:3px 7px; background:#111424; border:2px solid #ff4757; color:#ff4757; cursor:pointer;">BAN</button>
              </span>
            </div>`).join('');
        listEl.querySelectorAll('[data-kick]').forEach(btn => {
          btn.addEventListener('click', () => {
            this.multiplayer.kickPeer(btn.getAttribute('data-kick'));
            this._updateHostPanel();
          });
        });
        listEl.querySelectorAll('[data-ban]').forEach(btn => {
          btn.addEventListener('click', () => {
            const user = btn.getAttribute('data-user');
            const pid = btn.getAttribute('data-ban');
            if (user) this.multiplayer.banUser(user, pid);
            this._updateHostPanel();
          });
        });
        const banned = Array.from(this.multiplayer.bannedUsers);
        bannedEl.textContent = banned.length ? 'BANNED: ' + banned.join(', ') : '';
      };

      this.multiplayer.onStatusChange = (s) => {
        if (!s || !s.type) return;
        if (s.type === 'room_created') {
          const url = location.origin + '/?join=' + encodeURIComponent(s.code.toLowerCase());
          this._setMpLink(url);
          const codeEl = modal.querySelector('#mp-room-code');
          if (codeEl) codeEl.textContent = s.code;
          const roomInfo = modal.querySelector('#mp-room-info');
          if (roomInfo) roomInfo.style.display = 'block';
          this._setMpStatus('ROOM READY — SHARE THE CODE!');
          if (this.multiplayer && this.multiplayer.isHost) this._startHostBroadcast();
          this._updateHostPanel();
        } else if (s.type === 'joining') {
          this._setMpStatus('JOINING ' + (s.code || '') + '...');
        } else if (s.type === 'host_connected') {
          this._setMpStatus('CONNECTED!');
        } else if (s.type === 'join_rejected') {
          this._setMpStatus('DENIED: ' + (s.reason || 'rejected').toUpperCase());
        } else if (s.type === 'kicked') {
          this._setMpStatus('YOU WERE KICKED');
          this.remotePlayers.clear();
          this._restoreViewerSaveAfterLeave();
        } else if (s.type === 'ws_open') {
          this._setMpStatus('');
        } else if (s.type === 'ws_closed') {
          this._setMpStatus('DISCONNECTED');
          this._stopHostBroadcast();
        } else if (s.type === 'ws_error') {
          this._setMpStatus('CONNECTION ERROR');
        } else if (s.type === 'peer_connected' || s.type === 'peer_disconnected') {
          this._updateHostPanel();
        }
      };

      this.multiplayer.onJoinRequest = (req) => {
        this._showJoinRequestPopup(req);
      };

      this.multiplayer.onPeerMetaUpdate = () => {
        this._updateHostPanel();
      };

      this.multiplayer.onStateSnapshot = (snap) => {
        try { this._applySnapshot(snap); } catch (e) { console.warn('apply snapshot failed', e); }
      };
    };

    
    this.treeCanvas = document.getElementById('tree-canvas');
    this.treeCtx = this.treeCanvas.getContext('2d');
    this.resizeTreeCanvas();
    this.initTreeListeners();
    
    this.drawHTMLIcons();
    this.initTwitchUIListeners();
    this.updateTwitchStatus();

    // Multiplayer manager — init before URL auto-join
    try {
      this.multiplayer = new MultiplayerManager(this, {
        signalingUrl: window.__SIGNALING_URL || (location.origin),
      });
      this.initMultiplayerUI();
    } catch (e) {
      console.warn('Multiplayer init failed', e);
    }

    // Check for Twitch URL parameter ?channel=username and ?join=slug
    const urlParams = new URLSearchParams(window.location.search);
    const channelParam = urlParams.get('channel');
    if (channelParam && this.twitchManager.enabled !== false) {
      console.log(`[Twitch] Auto-connecting to channel from URL parameter: ${channelParam}`);
      this.twitchManager.connect(channelParam);
      this.pbClient.getStreamerBySlug(channelParam).then(res => {
        if (res.success && res.record && res.record.settings) {
          console.log(`[PocketBase] Loaded remote settings for streamer: ${res.record.twitch_name}`);
          const settings = res.record.settings;
          
          if (settings.chatFontSize !== undefined) this.twitchManager.chatFontSize = settings.chatFontSize;
          if (settings.voteDuration !== undefined) this.twitchManager.voteDuration = settings.voteDuration;
          if (settings.msgWaveStart !== undefined) this.twitchManager.msgWaveStart = settings.msgWaveStart;
          if (settings.msgVoteStart !== undefined) this.twitchManager.msgVoteStart = settings.msgVoteStart;
          if (settings.msgVoteEnd !== undefined) this.twitchManager.msgVoteEnd = settings.msgVoteEnd;
          
          if (settings.commands) {
            for (const [key, val] of Object.entries(settings.commands)) {
              if (this.twitchManager.commands[key]) {
                this.twitchManager.commands[key].enabled = val.enabled !== false;
                if (val.cooldown !== undefined) this.twitchManager.commands[key].cooldown = val.cooldown;
                if (val.bits !== undefined) this.twitchManager.commands[key].bits = val.bits;
                if (val.points !== undefined) this.twitchManager.commands[key].points = val.points;
              }
            }
          }
          this.twitchManager.saveSettings();
          this.updateTwitchStatus();
        }
      }).catch(e => {
        console.warn('[PocketBase] Failed to fetch remote settings for channel parameter:', e);
      });
    }

    // Auto-join multiplayer room via ?join=slug (streamer URLs map to room codes)
    const joinParam = urlParams.get('join');
    if (joinParam) {
      // Auto-connect to streamer chat so viewer is "connected" for multiplayer
      if (this.twitchManager.enabled !== false && !this.twitchManager.connected) {
        this.twitchManager.connect(joinParam);
      }
    }
    if (joinParam && this.multiplayer) {
      try {
        const roomCode = joinParam.toUpperCase();
        const twitchUser = (this.twitchManager && this.twitchManager.channel) ? this.twitchManager.channel : null;
        console.log(`[Multiplayer] Auto-joining room from URL parameter: ${joinParam} -> ${roomCode}`);
        const doJoin = () => {
          this.multiplayer.joinRoom(roomCode, {
            displayName: twitchUser || 'player',
            twitchUser: twitchUser,
          }).then(res => {
            if (!res.ok) console.warn('Auto-join failed', res);
            else if (this.state === 'MENU') this._setMpStatus('Joined room ' + roomCode + ' — start playing!');
          }).catch(e => console.warn('Auto-join error', e));
        };
        setTimeout(doJoin, 1500);
      } catch (e) {
        console.warn('Failed to process join URL param', e);
      }
    }

    this.initKeybinds();
    this.initPlayerAccountUI();
    this.initLevelBuilderUI();
    this.initStoryModeUI();
    this.parseTwitchOAuthHash();
    this.parsePlayerOAuthRedirect();

    // Start rendering loops
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.resizeTreeCanvas();
    });
    
    // Kick off animation loop
    requestAnimationFrame((time) => this.loop(time));
  }

  resizeCanvas() {
    const scale = 2; // Balanced pixelation: scale factor set to 2
    this.canvas.width = Math.ceil(window.innerWidth / scale);
    this.canvas.height = Math.ceil(window.innerHeight / scale);
    this.ctx.imageSmoothingEnabled = false; // Disable smoothing to keep pixels sharp
  }

  resizeTreeCanvas() {
    const container = document.getElementById('tree-canvas-container');
    if (container && this.treeCanvas) {
      this.treeCanvas.width = container.clientWidth;
      this.treeCanvas.height = container.clientHeight;
      this.treeCtx.imageSmoothingEnabled = false; // Disable smoothing
    }
  }

  getWorldMouse() {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    return {
      x: (this.mouseX - cx) / this.gameZoom + cx + this.camera.x,
      y: (this.mouseY - cy) / this.gameZoom + cy + this.camera.y
    };
  }

  // ----------------------------------------------------
  // INPUT LISTENERS
  // ----------------------------------------------------
  initInputListeners() {
    window.addEventListener('keydown', (e) => {
      const rawKey = e.key;
      
      // Controls remapping interception
      if (this.remappingAction) {
        e.preventDefault();
        if (rawKey === 'Escape') {
          this.remappingAction = null;
          this.renderKeybindList();
          return;
        }
        
        const newKey = rawKey.toLowerCase();
        this.keybinds[this.remappingAction] = newKey;
        this.remappingAction = null;
        
        localStorage.setItem('aetherweaver_keybinds', JSON.stringify(this.keybinds));
        if (this.audio) this.audio.playBuy();
        this.renderKeybindList();
        return;
      }

      const key = rawKey.toLowerCase();
      this.keys[key] = true;
      // send local input to host if in multiplayer
      if (this.state === 'PLAYING' && this.multiplayer) {
        try { this._sendLocalInput({ type: 'key', key, down: true, ts: Date.now() }); } catch (e) {}
      }
      
      // Debug cheats
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        if (key === '[') {
          this.player.ap += 100;
          const treeApEl = document.getElementById('tree-ap');
          if (treeApEl) treeApEl.innerText = this.player.ap;
          this.particles.spawnText(this.player.x, this.player.y - 30, "+100 AP (CHEAT)", {
            color: '#f1c40f',
            fontSize: 12,
            fontPixel: true
          });
          this.updateHUD();
          this.player.saveGameState();
        }
        if (key === ']') {
          let unlockedCount = 0;
          // Unlock ALL nodes across ALL views
          for (const k in this.abilityTree.nodes) {
            const node = this.abilityTree.nodes[k];
            if (!node.unlocked) {
              node.unlocked = true;
              unlockedCount++;
            }
          }
          // Force-unlock companion progression flags
          this.player.unlockedCompanion1 = true;
          this.player.unlockedCompanion2 = true;
          this.player.completedCompanion1Tree = true;
          this.player.completedCompanion2Tree = true;
          
          if (unlockedCount > 0) {
            this.player.recalculateModifiers(this.abilityTree);
            this.checkProgressionOnUnlock();
            this.player.saveGameState();
            
            const treeApEl = document.getElementById('tree-ap');
            if (treeApEl) treeApEl.innerText = this.player.ap;
            this.particles.spawnText(this.player.x, this.player.y - 30, `UNLOCKED ${unlockedCount} NODES (CHEAT)`, {
              color: '#f1c40f',
              fontSize: 12,
              fontPixel: true
            });
            this.updateHUD();
            console.log(`[CHEAT] Unlocked ${unlockedCount} nodes across all views. Companion flags set.`);
            
            const canvas = this.treeCanvas;
            if (canvas) {
              const ctx = canvas.getContext('2d');
              this.abilityTree.draw(canvas, ctx);
            }
          }
        }
      }
      
      // State transitions via buttons
      if (key === 'escape' || key === 'p') {
        if (this.isCustomLevel && (this.state === 'PLAYING' || this.state === 'PAUSED')) {
          e.preventDefault();
          this.setState('LEVEL_BUILDER');
          return;
        }
        if (this.isStoryMode && (this.state === 'PLAYING' || this.state === 'PAUSED')) {
          e.preventDefault();
          this.setState('STORY_CHAPTERS');
          return;
        }
        if (this.state === 'PLAYING') {
          this.setState('PAUSED');
        } else if (this.state === 'PAUSED') {
          this.setState('PLAYING');
        } else if (this.state === 'SETTINGS') {
          this.setState(this.settingsPrevState || 'MENU');
        } else if (this.state === 'UPGRADE_TREE' || this.state === 'INVENTORY' || this.state === 'WORLD_MAP') {
          this.setState('PLAYING');
        }
      }

      if (key === 'm' || key === 'tab') {
        if (this.state === 'PLAYING') {
          e.preventDefault();
          this.setState('WORLD_MAP');
        } else if (this.state === 'WORLD_MAP') {
          e.preventDefault();
          this.setState('PLAYING');
        }
      }

      if (e.ctrlKey && e.shiftKey && key === 'b') {
        const code = window.prompt('Backrooms access code:');
        if (code && code.trim() === 'violet-hallway' && this.levelManager && this.levelManager.activateBackroomsSecret) {
          this.levelManager.activateBackroomsSecret();
          this.particles.spawnText(this.player.x, this.player.y - 40, 'SECRET UNLOCKED', {
            color: '#ffeaa7',
            fontSize: 12,
            fontPixel: true,
            life: 2.5
          });
        }
      }

      if (this.isLocalDev && key === 'f3') {
        e.preventDefault();
        this.toggleDevtools();
      }

      if (key === 'i') {
        if (this.state === 'PLAYING') {
          e.preventDefault();
          this._prevStateBeforeInventory = this.state;
          this.setState('INVENTORY');
          this.refreshInventoryPanel();
        } else if (this.state === 'INVENTORY') {
          e.preventDefault();
          this._closeInventory();
        }
      }
      
      // Quick skills hotkeys triggers
      if (this.state === 'PLAYING') {
        const worldMouse = this.getWorldMouse();
        const playerAngle = Math.atan2(
          worldMouse.y - this.player.y,
          worldMouse.x - this.player.x
        );

        const checkBind = (action) => {
          const bind = this.keybinds[action];
          if (bind === ' ' || bind === 'space' || bind === 'spacebar') {
            return key === ' ' || key === 'spacebar' || key === 'space';
          }
          return key === bind;
        };

        if (checkBind('cast_utility')) {
          e.preventDefault();
          this.player.castSpell('utility', playerAngle);
        } else if (checkBind('cast_ultimate')) {
          this.player.castSpell('ultimate', playerAngle);
        } else if (checkBind('cast_extra')) {
          this.player.castSpell('extra', playerAngle);
        } else if (checkBind('cast_slot6') && this.player.maxSpellSlots >= 6) {
          this.player.castSpell('slot6', playerAngle);
        } else if (checkBind('cast_slot7') && this.player.maxSpellSlots >= 7) {
          this.player.castSpell('slot7', playerAngle);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys[k] = false;
      if (this.state === 'PLAYING' && this.multiplayer) {
        try { this._sendLocalInput({ type: 'key', key: k, down: false, ts: Date.now() }); } catch (e) {}
      }
    });

    // Add blur listener to reset input keys so player doesn't stick move on focus lose
    window.addEventListener('blur', () => {
      this.keys = {};
      this.isLeftMouseDown = false;
      this.isRightMouseDown = false;
    });

    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      // Map mouse coordinates to match the virtual canvas downscaled dimensions
      this.mouseX = (e.clientX - rect.left) / (rect.width / this.canvas.width);
      this.mouseY = (e.clientY - rect.top) / (rect.height / this.canvas.height);
    });

    window.addEventListener('mousedown', (e) => {
      if (this.state !== 'PLAYING') return;
      if (e.button === 0) this.isLeftMouseDown = true;
      if (e.button === 2) this.isRightMouseDown = true;
      if (this.multiplayer) {
        try { this._sendLocalInput({ type: 'mouse', button: e.button, down: true, x: this.mouseX, y: this.mouseY, ts: Date.now() }); } catch (err) {}
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.isLeftMouseDown = false;
      if (e.button === 2) this.isRightMouseDown = false;
      if (this.multiplayer) {
        try { this._sendLocalInput({ type: 'mouse', button: e.button, down: false, x: this.mouseX, y: this.mouseY, ts: Date.now() }); } catch (err) {}
      }
    });

    // Disable context menu on right click inside game screen
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Mouse wheel zoom handler
    window.addEventListener('wheel', (e) => {
      if (this.state !== 'PLAYING') return;
      const zoomSpeed = 0.05;
      if (e.deltaY < 0) {
        this.gameZoom = Math.min(1.5, this.gameZoom + zoomSpeed);
      } else {
        this.gameZoom = Math.max(0.6, this.gameZoom - zoomSpeed);
      }
    }, { passive: true });
  }

  // ----------------------------------------------------
  // HTML UI CLICKS LISTENERS
  // ----------------------------------------------------
  initUIListeners() {
    // Settings Navigation Buttons
    const btnSettingsMenu = document.getElementById('btn-settings-menu');
    const btnSettingsPause = document.getElementById('btn-settings-pause');
    const btnCloseSettings = document.getElementById('btn-close-settings');

    if (btnSettingsMenu) {
      btnSettingsMenu.addEventListener('click', () => {
        this.settingsPrevState = 'MENU';
        this.setState('SETTINGS');
      });
    }
    if (btnSettingsPause) {
      btnSettingsPause.addEventListener('click', () => {
        this.settingsPrevState = 'PAUSED';
        this.setState('SETTINGS');
      });
    }
    if (btnCloseSettings) {
      btnCloseSettings.addEventListener('click', () => {
        this.setState(this.settingsPrevState || 'MENU');
      });
    }

    // Mute Button Binding in Settings
    const toggleMuteAll = () => {
      const isMuted = this.audio.toggleMute();
      const text = isMuted ? "UNMUTE AUDIO" : "MUTE AUDIO";
      const settingsMute = document.getElementById('btn-settings-mute');
      if (settingsMute) settingsMute.innerText = text;

      const boxes = document.querySelectorAll('.volume-controls-box');
      boxes.forEach(box => box.classList.toggle('muted', isMuted));
      this.saveSettings();
    };
    const settingsMuteBtn = document.getElementById('btn-settings-mute');
    if (settingsMuteBtn) {
      settingsMuteBtn.addEventListener('click', () => toggleMuteAll());
    }

    // Volume & Render Sliders Binding
    const sldSettingsMusic = document.getElementById('sld-settings-music');
    const sldSettingsSfx = document.getElementById('sld-settings-sfx');
    const sldSettingsRender = document.getElementById('sld-settings-render');

    const lblSettingsMusic = document.getElementById('lbl-settings-music-val');
    const lblSettingsSfx = document.getElementById('lbl-settings-sfx-val');
    const lblSettingsRender = document.getElementById('lbl-settings-render-val');

    const updateSliderFill = (slider) => {
      if (!slider) return;
      const min = slider.min || 0;
      const max = slider.max || 100;
      const val = slider.value;
      const percentage = (val - min) / (max - min) * 100;
      slider.style.background = `linear-gradient(to right, var(--color-aether) ${percentage}%, #080a14 ${percentage}%)`;
    };

    const setMusicVolumeUI = (value) => {
      const vol = parseFloat(value) / 100;
      this.audio.setMusicVolume(vol);
      
      const percentText = `${Math.round(value)}%`;
      if (lblSettingsMusic) lblSettingsMusic.innerText = percentText;
      if (sldSettingsMusic) { sldSettingsMusic.value = value; updateSliderFill(sldSettingsMusic); }
      this.saveSettings();
    };

    const setSfxVolumeUI = (value) => {
      const vol = parseFloat(value) / 100;
      this.audio.setSfxVolume(vol);

      const percentText = `${Math.round(value)}%`;
      if (lblSettingsSfx) lblSettingsSfx.innerText = percentText;
      if (sldSettingsSfx) { sldSettingsSfx.value = value; updateSliderFill(sldSettingsSfx); }
      this.saveSettings();
    };

    // Bind event listeners
    if (sldSettingsMusic) {
      sldSettingsMusic.addEventListener('input', (e) => setMusicVolumeUI(e.target.value));
    }
    if (sldSettingsSfx) {
      sldSettingsSfx.addEventListener('input', (e) => setSfxVolumeUI(e.target.value));
    }
    if (sldSettingsRender) {
      sldSettingsRender.addEventListener('input', (e) => this.setRenderDistance(e.target.value));
    }

    // Checkboxes bindings
    const chkSettingsShake = document.getElementById('chk-settings-shake');
    const chkSettingsGlow = document.getElementById('chk-settings-glow');
    const chkSettingsDamage = document.getElementById('chk-settings-damage');
    const chkSettingsHealthbars = document.getElementById('chk-settings-healthbars');
    const chkSettingsFloor = document.getElementById('chk-settings-floor');
    const chkSettingsParticles = document.getElementById('chk-settings-particles');
    const chkSettingsTrails = document.getElementById('chk-settings-trails');

    const updateCheckboxesUI = () => {
      if (chkSettingsShake) chkSettingsShake.checked = this.enableScreenShake;
      if (chkSettingsGlow) chkSettingsGlow.checked = this.enableGlowEffects;
      if (chkSettingsDamage) chkSettingsDamage.checked = this.showDamageNumbers;
      if (chkSettingsHealthbars) chkSettingsHealthbars.checked = this.showEnemyHealthbars;
      if (chkSettingsFloor) chkSettingsFloor.checked = this.showFloorGrid;
      if (chkSettingsParticles) chkSettingsParticles.checked = this.lowParticleMode;
      if (chkSettingsTrails) chkSettingsTrails.checked = this.showSpellTrails;
    };

    if (chkSettingsShake) {
      chkSettingsShake.addEventListener('change', (e) => {
        this.enableScreenShake = e.target.checked;
        this.saveSettings();
      });
    }
    if (chkSettingsGlow) {
      chkSettingsGlow.addEventListener('change', (e) => {
        this.enableGlowEffects = e.target.checked;
        if (this.particles) this.particles.enableGlowEffects = this.enableGlowEffects;
        this.saveSettings();
      });
    }
    if (chkSettingsDamage) {
      chkSettingsDamage.addEventListener('change', (e) => {
        this.showDamageNumbers = e.target.checked;
        this.saveSettings();
      });
    }
    if (chkSettingsHealthbars) {
      chkSettingsHealthbars.addEventListener('change', (e) => {
        this.showEnemyHealthbars = e.target.checked;
        this.saveSettings();
      });
    }
    if (chkSettingsFloor) {
      chkSettingsFloor.addEventListener('change', (e) => {
        this.showFloorGrid = e.target.checked;
        this.saveSettings();
      });
    }
    if (chkSettingsParticles) {
      chkSettingsParticles.addEventListener('change', (e) => {
        this.lowParticleMode = e.target.checked;
        if (this.particles) this.particles.lowParticleMode = this.lowParticleMode;
        this.saveSettings();
      });
    }
    if (chkSettingsTrails) {
      chkSettingsTrails.addEventListener('change', (e) => {
        this.showSpellTrails = e.target.checked;
        this.saveSettings();
      });
    }

    // Initialize values from AudioManager and Settings
    if (this.audio) {
      const initialMusicValue = Math.round(this.audio.musicVolume * 100);
      const initialSfxValue = Math.round(this.audio.sfxVolume * 100);
      setMusicVolumeUI(initialMusicValue);
      setSfxVolumeUI(initialSfxValue);
      
      // Update initial mute status text
      const settingsMute = document.getElementById('btn-settings-mute');
      if (settingsMute) {
        settingsMute.innerText = this.audio.isMuted ? "UNMUTE AUDIO" : "MUTE AUDIO";
      }
      const boxes = document.querySelectorAll('.volume-controls-box');
      boxes.forEach(box => box.classList.toggle('muted', this.audio.isMuted));
    }
    this.setRenderDistance(this.renderDistance || 1200);
    updateCheckboxesUI();

    // Minecraft-style Settings Tabs Switching
    const settingsTabs = document.querySelectorAll('.settings-tab-btn');
    settingsTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        if (this.audio) this.audio.playClick();
        settingsTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const tabId = tab.getAttribute('data-tab');
        document.querySelectorAll('.settings-tab-pane').forEach(pane => {
          pane.classList.add('hidden');
        });
        const targetPane = document.getElementById(`settings-tab-${tabId}`);
        if (targetPane) targetPane.classList.remove('hidden');

        if (tabId === 'controls') {
          const lbl = document.getElementById('lbl-detected-layout');
          if (lbl) lbl.innerText = this.detectedLayout;
          this.renderKeybindList();
        }
      });
    });

    // Keybind Reset button
    const btnResetKeybinds = document.getElementById('btn-reset-keybinds');
    if (btnResetKeybinds) {
      btnResetKeybinds.addEventListener('click', () => {
        if (this.detectedLayout === 'AZERTY') {
          this.keybinds = {
            move_up: 'z',
            move_down: 's',
            move_left: 'q',
            move_right: 'd',
            cast_utility: ' ',
            cast_ultimate: 'a',
            cast_extra: 'e',
            cast_slot6: '1',
            cast_slot7: '2'
          };
        } else {
          this.keybinds = {
            move_up: 'w',
            move_down: 's',
            move_left: 'a',
            move_right: 'd',
            cast_utility: ' ',
            cast_ultimate: 'q',
            cast_extra: 'e',
            cast_slot6: '1',
            cast_slot7: '2'
          };
        }
        this.remappingAction = null;
        localStorage.setItem('aetherweaver_keybinds', JSON.stringify(this.keybinds));
        this.renderKeybindList();
        if (this.audio) this.audio.playBuy();
      });
    }

    // Main Menu Buttons
    const btnPlayMenu = document.getElementById('btn-play-menu');
    if (btnPlayMenu) {
      btnPlayMenu.addEventListener('click', () => {
        this.setState('PLAY_MENU');
        this.drawGameModePreviews();
      });
    }
    const btnCustomizeMenu = document.getElementById('btn-customize-menu');
    if (btnCustomizeMenu) {
      btnCustomizeMenu.addEventListener('click', () => {
        this.setState('CUSTOMIZE');
        // Find matching preset index for current player hueShift
        const currentHue = this.player.hueShift || 0;
        const presets = [
          { name: 'Aether Blue', hue: 0 },
          { name: 'Void Purple', hue: 50 },
          { name: 'Pyro Red', hue: 135 },
          { name: 'Chrono Orange', hue: 175 },
          { name: 'Verdant Green', hue: 255 },
          { name: 'Frost Cyan', hue: 315 }
        ];
        const matchIdx = presets.findIndex(p => p.hue === currentHue);
        this.customPresetIdx = matchIdx !== -1 ? matchIdx : 0;
        this.player.hueShift = presets[this.customPresetIdx].hue;
        document.getElementById('customize-preset-name').innerText = presets[this.customPresetIdx].name;
      });
    }
    const btnCommunityHub = document.getElementById('btn-community-hub');
    if (btnCommunityHub) {
      btnCommunityHub.addEventListener('click', () => {
        this.setState('COMMUNITY_HUB');
      });
    }
    const btnCommunityBack = document.getElementById('btn-community-back');
    if (btnCommunityBack) {
      btnCommunityBack.addEventListener('click', () => {
        this.setState('MENU');
      });
    }
    const btnCommunityLeaderboard = document.getElementById('btn-community-leaderboard');
    if (btnCommunityLeaderboard) {
      btnCommunityLeaderboard.addEventListener('click', () => {
        this.setState('LEADERBOARD');
      });
    }
    const btnCommunityStreamers = document.getElementById('btn-community-streamers');
    if (btnCommunityStreamers) {
      btnCommunityStreamers.addEventListener('click', () => {
        window.open('./streamers/', '_blank');
      });
    }
    const btnCommunityWiki = document.getElementById('btn-community-wiki');
    if (btnCommunityWiki) {
      btnCommunityWiki.addEventListener('click', () => {
        window.open('./wiki/', '_blank');
      });
    }
    const btnCommunityCredits = document.getElementById('btn-community-credits');
    if (btnCommunityCredits) {
      btnCommunityCredits.addEventListener('click', () => {
        this.setState('CREDITS');
      });
    }
    const btnCommunityContact = document.getElementById('btn-community-contact');
    if (btnCommunityContact) {
      btnCommunityContact.addEventListener('click', () => {
        this.setState('CONTACT');
      });
    }

    // Play Selector Menu Buttons
    const btnStartWeaver = document.getElementById('btn-start-weaver');
    if (btnStartWeaver) {
      btnStartWeaver.addEventListener('click', () => {
        this.isTutorial = false;
        this.isStoryMode = false;
        document.getElementById('tutorial-guide').classList.add('hidden');
        this.startNewGame();
      });
    }
    const btnStartTutorial = document.getElementById('btn-start-tutorial');
    if (btnStartTutorial) {
      btnStartTutorial.addEventListener('click', () => {
        this.startTutorial();
      });
    }
    const btnPlayBack = document.getElementById('btn-play-back');
    if (btnPlayBack) {
      btnPlayBack.addEventListener('click', () => {
        this.setState('MENU');
      });
    }

    const btnStartMultiplayer = document.getElementById('btn-start-multiplayer');
    if (btnStartMultiplayer) {
      btnStartMultiplayer.addEventListener('click', () => {
        if (!this._openMultiplayerModal) {
          try { this.initMultiplayerUI(); } catch(e) { console.warn('initMultiplayerUI failed', e); }
        }
        if (this._openMultiplayerModal) this._openMultiplayerModal();
      });
    }

    // Customize Selector Buttons
    const presets = [
      { name: 'Aether Blue', hue: 0 },
      { name: 'Void Purple', hue: 50 },
      { name: 'Pyro Red', hue: 135 },
      { name: 'Chrono Orange', hue: 175 },
      { name: 'Verdant Green', hue: 255 },
      { name: 'Frost Cyan', hue: 315 }
    ];
    const btnPrevPreset = document.getElementById('btn-prev-preset');
    if (btnPrevPreset) {
      btnPrevPreset.addEventListener('click', () => {
        this.customPresetIdx = (this.customPresetIdx - 1 + presets.length) % presets.length;
        this.player.hueShift = presets[this.customPresetIdx].hue;
        document.getElementById('customize-preset-name').innerText = presets[this.customPresetIdx].name;
        if (this.audio) this.audio.playClick();
      });
    }
    const btnNextPreset = document.getElementById('btn-next-preset');
    if (btnNextPreset) {
      btnNextPreset.addEventListener('click', () => {
        this.customPresetIdx = (this.customPresetIdx + 1) % presets.length;
        this.player.hueShift = presets[this.customPresetIdx].hue;
        document.getElementById('customize-preset-name').innerText = presets[this.customPresetIdx].name;
        if (this.audio) this.audio.playClick();
      });
    }
    const btnSaveCustomize = document.getElementById('btn-save-customize');
    if (btnSaveCustomize) {
      btnSaveCustomize.addEventListener('click', () => {
        this.player.hueShift = presets[this.customPresetIdx].hue;
        this.player.saveGameState();
        if (this.audio) this.audio.playBuy();
        this.setState('MENU');
      });
    }

    // Credits/Contact/How-To back buttons
    const btnCreditsClose = document.getElementById('btn-credits-close');
    if (btnCreditsClose) {
      btnCreditsClose.addEventListener('click', () => {
        this.setState(this.menuPrevState || 'MENU');
      });
    }
    const btnCloseLeaderboard = document.getElementById('btn-close-leaderboard');
    if (btnCloseLeaderboard) {
      btnCloseLeaderboard.addEventListener('click', () => {
        this.setState(this.menuPrevState || 'MENU');
      });
    }
    const btnContactClose = document.getElementById('btn-contact-close');
    if (btnContactClose) {
      btnContactClose.addEventListener('click', () => {
        this.setState(this.menuPrevState || 'MENU');
      });
    }
    // Tutorial Finish button listener
    const btnFinishTutorial = document.getElementById('btn-finish-tutorial');
    if (btnFinishTutorial) {
      btnFinishTutorial.addEventListener('click', () => {
        this.endTutorial();
      });
    }
    
    // Ability Tree Button in HUD
    document.getElementById('btn-open-tree-hud').addEventListener('click', () => {
      this.setState('UPGRADE_TREE');
    });
    document.getElementById('btn-close-tree').addEventListener('click', () => {
      this.setState('PLAYING');
    });

    // Pause Menu Buttons
    document.getElementById('btn-resume-game').addEventListener('click', () => {
      this.setState('PLAYING');
    });
    document.getElementById('btn-pause-tree').addEventListener('click', () => {
      this.setState('UPGRADE_TREE');
    });
    document.getElementById('btn-pause-menu').addEventListener('click', () => {
      this.setState('MENU');
    });

    // Game Over Buttons
    document.getElementById('btn-restart-game').addEventListener('click', () => {
      this.startNewGame();
    });
    document.getElementById('btn-go-to-menu').addEventListener('click', () => {
      this.setState('MENU');
    });
    const btnGameOverAccount = document.getElementById('btn-gameover-account');
    if (btnGameOverAccount) {
      btnGameOverAccount.addEventListener('click', () => {
        this.setState('PLAYER_ACCOUNT');
        this.updatePlayerAccountUI();
      });
    }

    // Rebirth Button
    document.getElementById('btn-rebirth').addEventListener('click', () => {
      const success = this.player.performRebirth();
      if (success) {
        if (this.audio) this.audio.playRebirth();
        // Update game-over screen to reflect new rebirth count
        document.getElementById('rebirth-panel').classList.add('hidden');
        this.particles.spawnText(
          this.player.x, this.player.y - 50,
          `REBIRTH ${this.player.rebirthCount}! AETHER REBORN`, {
            color: '#c39aff', fontSize: 14, fontPixel: true, life: 3.0
          }
        );
        if (this.twitchManager && this.twitchManager.connected) {
          this.twitchManager.sendMessage(`[Aetherweaver] Streamer has achieved Rebirth ${this.player.rebirthCount}! Aether reborn! Permanent bonuses unlocked!`);
        }
      }
    });

    // Runic Shop Buttons
    document.getElementById('btn-buy-hp').addEventListener('click', () => {
      if (this.player.shards >= 15) {
        if (this.player.hp >= this.player.getMaxHp()) {
          this.particles.spawnText(this.player.x, this.player.y - 20, "ALREADY FULL HP", { color: '#ff4757', fontSize: 10, fontPixel: true });
          return;
        }
        this.player.shards -= 15;
        this.player.hp = Math.min(this.player.getMaxHp(), this.player.hp + 50);
        this.player.saveGameState();
        this.updateHUD();
        const shopShards = document.getElementById('shop-shards-value');
        if (shopShards) shopShards.innerText = this.player.shards;
        this.particles.spawnText(this.player.x, this.player.y - 20, "+50 HP", { color: '#ff4757', fontSize: 10, fontPixel: true });
      } else {
        this.particles.spawnText(this.player.x, this.player.y - 20, "NEED SHARDS", { color: '#ff4757', fontSize: 10, fontPixel: true });
      }
    });

    document.getElementById('btn-buy-mp').addEventListener('click', () => {
      if (this.player.shards >= 15) {
        if (this.player.mp >= this.player.getMaxMp()) {
          this.particles.spawnText(this.player.x, this.player.y - 20, "ALREADY FULL MANA", { color: '#70a1ff', fontSize: 10, fontPixel: true });
          return;
        }
        this.player.shards -= 15;
        this.player.mp = Math.min(this.player.getMaxMp(), this.player.mp + 30);
        this.player.saveGameState();
        this.updateHUD();
        const shopShards = document.getElementById('shop-shards-value');
        if (shopShards) shopShards.innerText = this.player.shards;
        this.particles.spawnText(this.player.x, this.player.y - 20, "+30 MANA", { color: '#70a1ff', fontSize: 10, fontPixel: true });
      } else {
        this.particles.spawnText(this.player.x, this.player.y - 20, "NEED SHARDS", { color: '#ff4757', fontSize: 10, fontPixel: true });
      }
    });

    document.getElementById('btn-buy-vit').addEventListener('click', () => {
      if (this.player.shards >= 40) {
        this.player.shards -= 40;
        this.player.shopMaxHp += 15;
        this.player.hp += 15; // also heal by 15
        this.player.recalculateModifiers(this.abilityTree);
        this.player.saveGameState();
        this.updateHUD();
        const shopShards = document.getElementById('shop-shards-value');
        if (shopShards) shopShards.innerText = this.player.shards;
        this.particles.spawnText(this.player.x, this.player.y - 20, "+15 MAX HP", { color: '#ff4757', fontSize: 10, fontPixel: true });
      } else {
        this.particles.spawnText(this.player.x, this.player.y - 20, "NEED SHARDS", { color: '#ff4757', fontSize: 10, fontPixel: true });
      }
    });

    document.getElementById('btn-buy-mana').addEventListener('click', () => {
      if (this.player.shards >= 40) {
        this.player.shards -= 40;
        this.player.shopMaxMp += 10;
        this.player.shopManaRegen += 0.3;
        this.player.mp += 10; // also heal by 10
        this.player.recalculateModifiers(this.abilityTree);
        this.player.saveGameState();
        this.updateHUD();
        const shopShards = document.getElementById('shop-shards-value');
        if (shopShards) shopShards.innerText = this.player.shards;
        this.particles.spawnText(this.player.x, this.player.y - 20, "+10 MAX MP & REGEN", { color: '#70a1ff', fontSize: 10, fontPixel: true });
      } else {
        this.particles.spawnText(this.player.x, this.player.y - 20, "NEED SHARDS", { color: '#ff4757', fontSize: 10, fontPixel: true });
      }
    });

    document.getElementById('btn-buy-relic').addEventListener('click', () => {
      if (this.player.shards >= 50) {
        this.player.shards -= 50;
        const combinedPool = [...RELICS_CATALOG, ...EQUIPMENT_CATALOG];
        const item = combinedPool[Math.floor(Math.random() * combinedPool.length)];
        const isGear = !!item.type;
        if (isGear) {
          this.player.gearStorage.push(item);
          this.particles.spawnText(this.player.x, this.player.y - 20, `GEAR: ${item.name} (check Gear tab)`, { color: '#eccc68', fontSize: 9, fontPixel: true });
        } else {
          this.player.runeStorage.push(item);
          this.particles.spawnText(this.player.x, this.player.y - 20, `RUNE: ${item.name}`, { color: '#a55eea', fontSize: 10, fontPixel: true });
        }
        this.player.recalculateModifiers(this.abilityTree);
        this.player.saveGameState();
        this.updateHUD();
        const shopShards = document.getElementById('shop-shards-value');
        if (shopShards) shopShards.innerText = this.player.shards;
      } else {
        this.particles.spawnText(this.player.x, this.player.y - 20, "NEED SHARDS", { color: '#ff4757', fontSize: 10, fontPixel: true });
      }
    });

    document.getElementById('btn-start-next-wave').addEventListener('click', () => {
      if (this.twitchManager && this.twitchManager.connected && this.twitchManager.voteActive) {
        this.waitingForVoteToStartNextWave = true;
        const waitingMsg = document.getElementById('twitch-vote-waiting-msg');
        if (waitingMsg) {
          waitingMsg.style.display = 'block';
          waitingMsg.innerText = `Waiting for Twitch vote to finish... (${Math.ceil(this.twitchManager.voteTimer)}s remaining)`;
        }
      } else {
        this.startNextWaveFromShop();
      }
    });

    // ── Inventory Panel ──────────────────────────────────────────────────
    document.getElementById('hud-inventory').addEventListener('click', () => {
      this._prevStateBeforeInventory = this.state;
      this.setState('INVENTORY');
      this.refreshInventoryPanel();
    });

    document.getElementById('btn-close-inventory').addEventListener('click', () => {
      this._closeInventory();
    });
    document.getElementById('btn-inv-back').addEventListener('click', () => {
      this._closeInventory();
    });

    // Inventory tab switching
    document.querySelectorAll('.inv-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._invActiveTab = btn.dataset.tab;
        this.refreshInventoryPanel();
      });
    });


    // ── Spell Remap Panel ────────────────────────────────────────────────
    document.getElementById('btn-pause-spellmap').addEventListener('click', () => {
      this._prevStateBeforeInventory = this.state;
      this._invActiveTab = 'spells';
      this.setState('INVENTORY');
      this.refreshInventoryPanel();
    });
    document.getElementById('btn-spellmap-reset').addEventListener('click', () => {
      this.player.customSpellMap = { primary:null,secondary:null,utility:null,ultimate:null,extra:null,slot6:null,slot7:null };
      this.player.recalculateModifiers(this.abilityTree);
      this.player.saveGameState();
      this.refreshSpellmapPanel();
      this.updateHUD();
      if (this.audio) this.audio.playClick();
    });
    document.getElementById('btn-spellmap-buy-slot').addEventListener('click', () => {
      const cur = this.player.maxSpellSlots;
      if (cur >= 7) return;
      const cost = cur === 5 ? 80 : 120;
      if (this.player.shards < cost) {
        this.particles.spawnText(this.player.x, this.player.y - 20, 'NOT ENOUGH SHARDS', { color: '#ff4757', fontSize: 10, fontPixel: true });
        return;
      }
      this.player.shards -= cost;
      this.player.maxSpellSlots++;
      this.player.recalculateModifiers(this.abilityTree);
      this.player.saveGameState();
      if (this.audio) this.audio.playBuy();
      this.refreshSpellmapPanel();
      this.updateHUD();
    });

    // (inv-slot purchase removed — storage is now unlimited)

    // ── World Map Panel ──────────────────────────────────────────────────
    const toggleMapFn = () => {
      if (this.state === 'PLAYING') {
        this.setState('WORLD_MAP');
      } else if (this.state === 'WORLD_MAP') {
        this.setState('PLAYING');
      }
    };
    
    document.getElementById('btn-toggle-worldmap').addEventListener('click', toggleMapFn);
    document.getElementById('minimap-canvas').addEventListener('click', toggleMapFn);
    
    document.getElementById('btn-close-worldmap').addEventListener('click', () => this.setState('PLAYING'));
    document.getElementById('btn-close-worldmap-btn').addEventListener('click', () => this.setState('PLAYING'));
    
    document.getElementById('btn-reveal-map').addEventListener('click', () => {
      const cost = 150;
      const lvl = this.levelManager;
      if (lvl.mapRevealed) {
        this.particles.spawnText(this.player.x, this.player.y - 20, "MAP ALREADY UNLOCKED", { color: '#ff4757', fontSize: 10, fontPixel: true });
        return;
      }
      if (this.player.shards < cost) {
        this.particles.spawnText(this.player.x, this.player.y - 20, "NOT ENOUGH SHARDS", { color: '#ff4757', fontSize: 10, fontPixel: true });
        return;
      }
      
      this.player.shards -= cost;
      lvl.mapRevealed = true;
      
      // Unfog all tiles in the level
      for (let x = 0; x < lvl.fullTileWidth; x++) {
        for (let y = 0; y < lvl.fullTileHeight; y++) {
          lvl.exploredGrid[x][y] = true;
        }
      }
      
      this.player.saveGameState();
      if (this.audio) this.audio.playBuy();
      this.updateHUD();
      this.drawWorldmap();
      
      const revealBtn = document.getElementById('btn-reveal-map');
      if (revealBtn) {
        revealBtn.innerText = "MAP UNLOCKED";
        revealBtn.disabled = true;
      }
      
      this.particles.spawnText(this.player.x, this.player.y - 20, "MAP UNLOCKED!", { color: '#eccc68', fontSize: 10, fontPixel: true });
    });

    // ── Worldmap Zoom & Drag ──────────────────────────────────────────────
    const mapCanvas = document.getElementById('worldmap-canvas');
    const mapContainer = document.querySelector('.worldmap-canvas-container');
    if (mapContainer && mapCanvas) {
      mapContainer.style.cursor = 'grab';
      mapContainer.style.overflow = 'hidden';

      mapContainer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this._mapDragging = true;
        this._mapDragStartX = e.clientX - this.mapPanX;
        this._mapDragStartY = e.clientY - this.mapPanY;
        mapContainer.style.cursor = 'grabbing';
      });

      window.addEventListener('mousemove', (e) => {
        if (!this._mapDragging || this.state !== 'WORLD_MAP') return;
        this.mapPanX = e.clientX - this._mapDragStartX;
        this.mapPanY = e.clientY - this._mapDragStartY;
        this.drawWorldmap();
      });

      window.addEventListener('mouseup', () => {
        if (this._mapDragging) {
          this._mapDragging = false;
          mapContainer.style.cursor = 'grab';
        }
      });

      mapContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = 1.15;
        const oldZoom = this.mapZoom;
        if (e.deltaY < 0) {
          this.mapZoom = Math.min(8.0, this.mapZoom * zoomFactor);
        } else {
          this.mapZoom = Math.max(0.5, this.mapZoom / zoomFactor);
        }
        // Zoom toward mouse position
        const rect = mapCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const zoomRatio = this.mapZoom / oldZoom;
        this.mapPanX = mx - zoomRatio * (mx - this.mapPanX);
        this.mapPanY = my - zoomRatio * (my - this.mapPanY);
        this.drawWorldmap();
      });
    }
  }

  initTwitchUIListeners() {
    const btnTwitchSetupMenu = document.getElementById('btn-twitch-setup-menu');
    const btnCloseTwitch = document.getElementById('btn-close-twitch');
    const btnTwitchConnect = document.getElementById('btn-twitch-connect');
    const chkTwitchAutoconnect = document.getElementById('chk-twitch-autoconnect');
    const inputTwitchChannel = document.getElementById('twitch-channel-input');
    const twitchStatusLbl = document.getElementById('twitch-status-lbl');
    
    // PocketBase elements
    const pbUsername = document.getElementById('pb-username');
    const pbPassword = document.getElementById('pb-password');
    const btnPbLogin = document.getElementById('btn-pb-login');
    const btnPbSaveSettings = document.getElementById('btn-pb-save-settings');
    const btnPbLogout = document.getElementById('btn-pb-logout');
    const pbLoggedInSection = document.getElementById('pb-logged-in-section');
    const pbLoginSection = document.getElementById('pb-login-section');
    const pbLoggedInUsername = document.getElementById('pb-logged-in-username');
    const pbStatusMsg = document.getElementById('pb-status-msg');

    const populateTwitchSettingsUI = () => {
      const chkTwitchEnabled = document.getElementById('chk-twitch-enabled');
      if (chkTwitchEnabled) {
        chkTwitchEnabled.checked = this.twitchManager.enabled !== false;
      }

      const isTwitchActive = this.twitchManager.enabled !== false;
      
      const chkAnnounce = document.getElementById('chk-twitch-announcements');
      if (chkAnnounce) {
        chkAnnounce.checked = this.twitchManager.enableAnnouncements;
        chkAnnounce.disabled = !isTwitchActive;
        chkAnnounce.parentElement.style.opacity = isTwitchActive ? '1' : '0.5';
      }

      const inputs = [
        'twitch-chat-size',
        'twitch-vote-duration',
        'twitch-msg-wave',
        'twitch-msg-vote',
        'twitch-msg-winner'
      ];
      inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.disabled = !isTwitchActive;
          el.style.opacity = isTwitchActive ? '1' : '0.5';
        }
      });
      
      const btnTwitchLoginOauth = document.getElementById('btn-twitch-login-oauth');
      if (btnTwitchLoginOauth) {
        btnTwitchLoginOauth.disabled = !isTwitchActive;
        btnTwitchLoginOauth.style.opacity = isTwitchActive ? '1' : '0.5';
        btnTwitchLoginOauth.style.pointerEvents = isTwitchActive ? 'auto' : 'none';
      }

      const chatSizeInput = document.getElementById('twitch-chat-size');
      if (chatSizeInput) chatSizeInput.value = this.twitchManager.chatFontSize || 10;

      const voteDurInput = document.getElementById('twitch-vote-duration');
      if (voteDurInput) voteDurInput.value = this.twitchManager.voteDuration || 20;

      const msgWaveInput = document.getElementById('twitch-msg-wave');
      if (msgWaveInput) msgWaveInput.value = this.twitchManager.msgWaveStart || '';

      const msgVoteInput = document.getElementById('twitch-msg-vote');
      if (msgVoteInput) msgVoteInput.value = this.twitchManager.msgVoteStart || '';

      const msgWinnerInput = document.getElementById('twitch-msg-winner');
      if (msgWinnerInput) msgWinnerInput.value = this.twitchManager.msgVoteEnd || '';

      // Populate commands list
      const listContainer = document.getElementById('twitch-commands-list');
      if (listContainer) {
        listContainer.innerHTML = '';
        listContainer.style.opacity = isTwitchActive ? '1' : '0.5';
        listContainer.style.pointerEvents = isTwitchActive ? 'auto' : 'none';
        
        for (const [cmdName, cmdDef] of Object.entries(this.twitchManager.commands)) {
          const row = document.createElement('div');
          row.className = 'devtools-row';
          row.style.margin = '4px 0';
          row.style.fontSize = '8px';
          row.style.display = 'flex';
          row.style.alignItems = 'center';
          row.style.justifyContent = 'space-between';
          row.style.borderBottom = '1px dashed rgba(255,255,255,0.05)';
          row.style.paddingBottom = '4px';
          row.style.flexWrap = 'nowrap';

          row.innerHTML = `
            <span style="width: 80px; font-family: var(--font-mono); color: #fff;">!${cmdName}</span>
            <label class="setting-toggle" style="width: 50px; display: flex; justify-content: center; margin: 0; cursor: pointer;">
              <input type="checkbox" class="cmd-enabled" data-cmd="${cmdName}" ${cmdDef.enabled ? 'checked' : ''} ${!isTwitchActive ? 'disabled' : ''}>
              <span class="checkbox-custom"></span>
            </label>
            <input type="number" class="cmd-cooldown devtools-input" data-cmd="${cmdName}" min="0" max="600" value="${cmdDef.cooldown}" ${!isTwitchActive ? 'disabled' : ''} style="width: 60px; text-align: center; margin: 0 5px; padding: 4px; font-size: 8px;">
            <input type="number" class="cmd-bits devtools-input" data-cmd="${cmdName}" min="0" max="100000" value="${cmdDef.bits || 0}" ${!isTwitchActive ? 'disabled' : ''} style="width: 60px; text-align: center; margin: 0 5px; padding: 4px; font-size: 8px;">
            <input type="text" class="cmd-redeem devtools-input" data-cmd="${cmdName}" value="${cmdDef.redeemId || ''}" placeholder="Reward ID" ${!isTwitchActive ? 'disabled' : ''} style="width: 140px; text-align: center; margin-left: 5px; padding: 4px; font-size: 8px;">
          `;
          listContainer.appendChild(row);
        }
      }
    };

    const updateTwitchUI = () => {
      if (this.twitchManager.enabled === false) {
        twitchStatusLbl.innerText = "DISABLED";
        twitchStatusLbl.style.color = '#7f8c8d';
        twitchStatusLbl.style.textShadow = 'none';
        if (btnTwitchConnect) btnTwitchConnect.innerText = "CONNECT";
      } else if (this.twitchManager.connected) {
        twitchStatusLbl.innerText = `CONNECTED TO #${this.twitchManager.channel.toUpperCase()}`;
        twitchStatusLbl.style.color = '#2ecc71';
        twitchStatusLbl.style.textShadow = '0 0 5px rgba(46,204,113,0.5)';
        if (btnTwitchConnect) btnTwitchConnect.innerText = "DISCONNECT";
      } else {
        twitchStatusLbl.innerText = "DISCONNECTED";
        twitchStatusLbl.style.color = '#ff6b6b';
        twitchStatusLbl.style.textShadow = '0 0 5px rgba(255,107,107,0.5)';
        if (btnTwitchConnect) btnTwitchConnect.innerText = "CONNECT";
      }

      if (this.twitchManager.channel) {
        if (inputTwitchChannel) inputTwitchChannel.value = this.twitchManager.channel;
      }

      // PocketBase status
      const pbSection = document.getElementById('pb-login-section')?.parentElement;
      if (this.pbClient.isAuthenticated()) {
        if (pbSection) pbSection.style.display = 'block';
        if (pbLoginSection) pbLoginSection.classList.add('hidden');
        if (pbLoggedInSection) pbLoggedInSection.classList.remove('hidden');
        if (pbLoggedInUsername) pbLoggedInUsername.innerText = this.pbClient.record.username || this.pbClient.record.email || 'Streamer';
      } else {
        if (pbSection) pbSection.style.display = 'none';
        if (pbLoginSection) pbLoginSection.classList.add('hidden');
        if (pbLoggedInSection) pbLoggedInSection.classList.add('hidden');
      }

      // Wire the "Allow viewers to join" checkbox to signaling API and PocketBase settings
      const chkAllowJoins = document.getElementById('chk-twitch-allow-joins');
      const joinModeRow = document.getElementById('mp-join-mode-row');
      const selJoinMode = document.getElementById('sel-multiplayer-join-mode');
      if (chkAllowJoins) {
        try {
          const settings = (this.pbClient && this.pbClient.record && this.pbClient.record.settings) || {};
          const currentAllow = settings.multiplayerAllowJoins || false;
          chkAllowJoins.checked = !!currentAllow;
          if (joinModeRow) joinModeRow.style.display = currentAllow ? 'block' : 'none';
          if (selJoinMode) selJoinMode.value = settings.multiplayerJoinMode || 'free';
        } catch (e) { chkAllowJoins.checked = false; }

        chkAllowJoins.addEventListener('change', async (e) => {
          const enable = !!e.target.checked;
          if (joinModeRow) joinModeRow.style.display = enable ? 'block' : 'none';
          const slug = (this.pbClient && this.pbClient.record && (this.pbClient.record.slug || this.pbClient.record.twitch_name)) || (this.twitchManager && this.twitchManager.channel) || null;
          const signalingUrl = (this.multiplayer && this.multiplayer.signalingUrl) || (window.__SIGNALING_URL || (location.protocol + '//' + location.hostname + ':8081'));
          const joinMode = (selJoinMode && selJoinMode.value) || 'free';
          if (!slug) {
            alert('Cannot determine streamer slug. Log in to PocketBase first.');
            chkAllowJoins.checked = false;
            if (joinModeRow) joinModeRow.style.display = 'none';
            return;
          }

          if (enable) {
            try {
              const url = signalingUrl.replace(/\/+$/, '') + '/api/rooms/reserve-for-streamer';
              const body = { code: (slug || '').toUpperCase(), owner: slug, ttl: 3600 };
              let res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
              let j;
              if (res.ok) {
                j = await res.json();
              } else if (res.status === 404) {
                const fallback = signalingUrl.replace(/\/+$/, '') + '/api/rooms/reserve';
                res = await fetch(fallback, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                j = await res.json();
              } else {
                j = await res.json().catch(() => ({ ok: false, reason: 'unknown' }));
              }

              const newSettings = Object.assign({}, this.pbClient.record.settings || {}, {
                multiplayerAllowJoins: true,
                multiplayerRoomCode: (slug || '').toUpperCase(),
                multiplayerJoinMode: joinMode,
              });
              await this.pbClient.saveSettings(newSettings);

              if (j && j.ok) {
                alert('!join enabled. Room: ' + (slug || '').toUpperCase() + ' (' + joinMode + ' mode)');
              } else if (j && j.reason === 'conflict') {
                alert('Room already reserved — !join still enabled.');
              } else {
                throw new Error(j && j.reason ? j.reason : 'reserve_failed');
              }

              // Auto-host streamer's singleplayer game as MP room
              this._ensureStreamerHosting((slug || '').toUpperCase());
            } catch (err) {
              console.warn('reserve for streamer failed', err);
              alert('Failed to enable !join: ' + (err && err.message ? err.message : String(err)));
              chkAllowJoins.checked = false;
              if (joinModeRow) joinModeRow.style.display = 'none';
            }
          } else {
            try {
              const releaseUrl = signalingUrl.replace(/\/+$/, '') + '/api/rooms/release';
              await fetch(releaseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: (slug || '').toUpperCase() }) });
              const newSettings = Object.assign({}, this.pbClient.record.settings || {}, { multiplayerAllowJoins: false });
              await this.pbClient.saveSettings(newSettings);
              if (this.multiplayer && this.multiplayer.isHost) this.multiplayer.leaveRoom();
              alert('!join disabled and room released.');
            } catch (err) {
              console.warn('release failed', err);
              alert('Failed to release room: ' + (err && err.message ? err.message : String(err)));
              chkAllowJoins.checked = true;
            }
          }
        });

        if (selJoinMode) {
          selJoinMode.addEventListener('change', async () => {
            if (!this.pbClient || !this.pbClient.isAuthenticated()) return;
            const joinMode = selJoinMode.value || 'free';
            const newSettings = Object.assign({}, this.pbClient.record.settings || {}, { multiplayerJoinMode: joinMode });
            await this.pbClient.saveSettings(newSettings);
          });
        }
      }

      populateTwitchSettingsUI();
    };

    // Hide manual connection elements and streamer auth settings to enforce "just make it a log in with twitch button"
    const manualRow = document.getElementById('twitch-channel-input')?.parentElement;
    if (manualRow) manualRow.style.display = 'none';
    if (btnTwitchConnect) btnTwitchConnect.style.display = 'none';
    const autoconnectRow = document.getElementById('chk-twitch-autoconnect')?.parentElement?.parentElement;
    if (autoconnectRow) autoconnectRow.style.display = 'none';

    // Hook up chk-twitch-enabled master switch
    const chkTwitchEnabled = document.getElementById('chk-twitch-enabled');
    if (chkTwitchEnabled) {
      chkTwitchEnabled.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        this.twitchManager.enabled = isEnabled;
        if (!isEnabled) {
          this.twitchManager.disconnect();
        }
        this.saveTwitchManagerSettings();
        updateTwitchUI();
        this.updateTwitchStatus();
      });
    }

    // Hook up the Login with Twitch OAuth button
    const btnTwitchLoginOauth = document.getElementById('btn-twitch-login-oauth');
    if (btnTwitchLoginOauth) {
      btnTwitchLoginOauth.addEventListener('click', () => {
        const clientID = '1zu1g6sz69tae512pzy7dp57uowmvk'; // public Twitch client id
        const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
        const twitchAuthUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientID}&redirect_uri=${redirectUri}&response_type=token&scope=chat:read+chat:edit+user:read:email`;
        window.location.href = twitchAuthUrl;
      });
    }

    const chkTwitchAnnouncements = document.getElementById('chk-twitch-announcements');
    if (chkTwitchAnnouncements) {
      chkTwitchAnnouncements.addEventListener('change', (e) => {
        this.twitchManager.enableAnnouncements = e.target.checked;
        this.saveTwitchManagerSettings();
      });
    }

    const chatSizeInput = document.getElementById('twitch-chat-size');
    if (chatSizeInput) {
      chatSizeInput.addEventListener('input', (e) => {
        this.twitchManager.chatFontSize = parseInt(e.target.value) || 10;
        this.saveTwitchManagerSettings();
      });
    }

    const voteDurInput = document.getElementById('twitch-vote-duration');
    if (voteDurInput) {
      voteDurInput.addEventListener('input', (e) => {
        this.twitchManager.voteDuration = parseInt(e.target.value) || 20;
        this.saveTwitchManagerSettings();
      });
    }

    const msgWaveInput = document.getElementById('twitch-msg-wave');
    if (msgWaveInput) {
      msgWaveInput.addEventListener('input', (e) => {
        this.twitchManager.msgWaveStart = e.target.value;
        this.saveTwitchManagerSettings();
      });
    }

    const msgVoteInput = document.getElementById('twitch-msg-vote');
    if (msgVoteInput) {
      msgVoteInput.addEventListener('input', (e) => {
        this.twitchManager.msgVoteStart = e.target.value;
        this.saveTwitchManagerSettings();
      });
    }

    const msgWinnerInput = document.getElementById('twitch-msg-winner');
    if (msgWinnerInput) {
      msgWinnerInput.addEventListener('input', (e) => {
        this.twitchManager.msgVoteEnd = e.target.value;
        this.saveTwitchManagerSettings();
      });
    }

    const listContainer = document.getElementById('twitch-commands-list');
    if (listContainer) {
      listContainer.addEventListener('change', (e) => {
        const target = e.target;
        const cmdName = target.getAttribute('data-cmd');
        if (!cmdName) return;

        if (target.classList.contains('cmd-enabled')) {
          this.twitchManager.commands[cmdName].enabled = target.checked;
        } else if (target.classList.contains('cmd-cooldown')) {
          this.twitchManager.commands[cmdName].cooldown = parseInt(target.value) || 0;
        } else if (target.classList.contains('cmd-bits')) {
          this.twitchManager.commands[cmdName].bits = parseInt(target.value) || 0;
        }
        this.saveTwitchManagerSettings();
      });
      listContainer.addEventListener('input', (e) => {
        const target = e.target;
        const cmdName = target.getAttribute('data-cmd');
        if (!cmdName) return;

        if (target.classList.contains('cmd-redeem')) {
          this.twitchManager.commands[cmdName].redeemId = target.value.trim();
          this.saveTwitchManagerSettings();
        }
      });
    }

    if (btnTwitchSetupMenu) {
      btnTwitchSetupMenu.addEventListener('click', () => {
        this.setState('TWITCH');
        updateTwitchUI();
      });
    }

    if (btnCloseTwitch) {
      btnCloseTwitch.addEventListener('click', () => {
        this.setState('SETTINGS');
      });
    }

    if (btnPbLogout) {
      btnPbLogout.addEventListener('click', () => {
        this.pbClient.logout();
        localStorage.removeItem('twitch_oauth_token');
        localStorage.removeItem('twitch_oauth_user');
        this.twitchManager.disconnect();
        if (pbStatusMsg) pbStatusMsg.innerText = "Logged out.";
        updateTwitchUI();
        this.updateTwitchStatus();
      });
    }
  }

  initDevtoolsUI() {
    const toggleBtn = document.getElementById('btn-devtools-toggle');
    const panel = document.getElementById('panel-devtools');

    if (toggleBtn) {
      toggleBtn.classList.toggle('hidden', !this.isLocalDev);
    }

    if (!this.isLocalDev || !panel) return;

    const closeBtn = document.getElementById('btn-close-devtools');
    const rebuildBtn = document.getElementById('btn-devtools-rebuild');
    const respawnBtn = document.getElementById('btn-devtools-respawn');
    const revealBtn = document.getElementById('btn-devtools-reveal');
    const refreshBtn = document.getElementById('btn-devtools-refresh');
    const trailsBtn = document.getElementById('btn-devtools-trails');
    const applyVarBtn = document.getElementById('btn-devtools-apply-var');
    const loadPresetBtn = document.getElementById('btn-devtools-load-preset');
    const presetSelect = document.getElementById('dev-var-preset');
    const varPathInput = document.getElementById('dev-var-path');
    const varValueInput = document.getElementById('dev-var-value');

    if (toggleBtn) toggleBtn.addEventListener('click', () => this.toggleDevtools());
    if (closeBtn) closeBtn.addEventListener('click', () => this.toggleDevtools(false));
    if (rebuildBtn) rebuildBtn.addEventListener('click', () => this.rebuildWorldForDebug());
    if (respawnBtn) respawnBtn.addEventListener('click', () => this.respawnForDebug());
    if (revealBtn) revealBtn.addEventListener('click', () => this.revealNearbyForDebug());
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
      if (this.levelManager) this.levelManager.generateObstacles();
      this.updateDevtoolsPanel();
    });
    if (trailsBtn) trailsBtn.addEventListener('click', () => {
      this.showSpellTrails = !this.showSpellTrails;
      this.saveSettings();
      this.updateDevtoolsPanel();
    });
    if (applyVarBtn) {
      applyVarBtn.addEventListener('click', () => {
        this.applyDevtoolsVariable();
      });
    }
    if (loadPresetBtn) {
      loadPresetBtn.addEventListener('click', () => {
        const presetPath = presetSelect?.value || 'player.shards';
        if (varPathInput) varPathInput.value = presetPath;
        if (varValueInput) {
          const value = this._getDevtoolsPresetValue(presetPath);
          varValueInput.value = value;
        }
      });
    }

    document.querySelectorAll('[data-dev-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.devPreset;
        if (varPathInput) varPathInput.value = preset;
        if (varValueInput) varValueInput.value = this._getDevtoolsPresetValue(preset);
      });
    });

    const applyThemeBtn = document.getElementById('btn-devtools-apply-theme');
    const nextThemeSelect = document.getElementById('dev-next-theme');
    if (applyThemeBtn && nextThemeSelect) {
      applyThemeBtn.addEventListener('click', () => {
        const val = nextThemeSelect.value || null;
        this.nextThemeOverride = val;
        this.updateDevtoolsPanel();
        if (this.player) {
          this.particles.spawnText(this.player.x, this.player.y - 40, `Set Next: ${val || 'Random'}`, {
            color: '#7d5fff',
            fontSize: 12,
            fontPixel: true
          });
        }
      });
    }

    // ── Dev overlay toggle checkboxes ──
    const devCheckboxes = [
      { id: 'dev-show-hitboxes', prop: 'devShowHitboxes' },
      { id: 'dev-show-paths',    prop: 'devShowPaths' },
      { id: 'dev-show-fps',      prop: 'devShowFps' },
      { id: 'dev-show-grid',     prop: 'devShowGrid' },
    ];
    devCheckboxes.forEach(({ id, prop }) => {
      const cb = document.getElementById(id);
      if (cb) {
        cb.checked = this[prop];
        cb.addEventListener('change', () => {
          this[prop] = cb.checked;
          console.log(`[DEV] ${prop} = ${cb.checked}`);
        });
      }
    });

    this.updateDevtoolsPanel();
  }

  toggleDevtools(force) {
    if (!this.isLocalDev) return;
    this.devtoolsVisible = typeof force === 'boolean' ? force : !this.devtoolsVisible;

    const panel = document.getElementById('panel-devtools');
    if (panel) panel.classList.toggle('hidden', !this.devtoolsVisible);

    const toggleBtn = document.getElementById('btn-devtools-toggle');
    if (toggleBtn) toggleBtn.classList.toggle('active', this.devtoolsVisible);

    if (this.devtoolsVisible) {
      this.updateDevtoolsPanel();
    }
  }

  updateDevtoolsPanel() {
    if (!this.isLocalDev) return;
    const info = document.getElementById('devtools-info');
    if (!info) return;

    const lvl = this.levelManager;
    const spawn = lvl?.getSpawnPoint ? lvl.getSpawnPoint() : { x: 0, y: 0 };
    const px = this.player?.x ?? 0;
    const py = this.player?.y ?? 0;
    const sx = lvl ? Math.max(0, Math.min((lvl.maxSectorCols || 1) - 1, Math.floor(px / 2000))) : 0;
    const sy = lvl ? Math.max(0, Math.min((lvl.maxSectorRows || 1) - 1, Math.floor(py / 2000))) : 0;
    const bounds = lvl?.getNearbyTileBounds ? lvl.getNearbyTileBounds() : null;
    const visibleSectors = bounds ? '3x3' : 'n/a';
    const obstacleCount = lvl?.obstacles?.length || 0;
    const allObstacleCount = lvl?.allObstacles?.length || 0;
    const explored = lvl?.exploredGrid ? lvl.exploredGrid.reduce((sum, col) => sum + col.filter(Boolean).length, 0) : 0;

    info.textContent =
      `State: ${this.state}\n` +
      `Player: ${px.toFixed(1)}, ${py.toFixed(1)}\n` +
      `Spawn: ${spawn.x.toFixed(1)}, ${spawn.y.toFixed(1)}\n` +
      `Sector: ${sx}, ${sy}\n` +
      `Theme: ${lvl?.theme || 'n/a'}\n` +
      `Map revealed: ${!!lvl?.mapRevealed}\n` +
      `Nearby render: ${visibleSectors}\n` +
      `Obstacles: ${obstacleCount} / ${allObstacleCount}\n` +
      `Explored tiles: ${explored}\n` +
      `Trails: ${this.showSpellTrails ? 'on' : 'off'}\n` +
      `Next Region: ${this.nextThemeOverride || 'Random'}`;

    const trailsBtn = document.getElementById('btn-devtools-trails');
    if (trailsBtn) trailsBtn.innerText = this.showSpellTrails ? 'TRAILS: ON' : 'TRAILS: OFF';
  }

  rebuildWorldForDebug() {
    if (!this.levelManager || !this.player) return;
    this.levelManager.preGenerateFullMaze();
    this.levelManager.generateObstacles();
    const spawn = this.levelManager.getSpawnPoint();
    this.player.x = spawn.x;
    this.player.y = spawn.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.camera = { x: this.player.x - this.canvas.width / 2, y: this.player.y - this.canvas.height / 2 };
    this.updateHUD();
    this.updateDevtoolsPanel();
    if (this.audio) this.audio.playClick();
  }

  respawnForDebug() {
    if (!this.levelManager || !this.player) return;
    const spawn = this.levelManager.getSpawnPoint();
    this.player.x = spawn.x;
    this.player.y = spawn.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.camera = { x: this.player.x - this.canvas.width / 2, y: this.player.y - this.canvas.height / 2 };
    this.updateHUD();
    this.updateDevtoolsPanel();
  }

  revealNearbyForDebug() {
    const lvl = this.levelManager;
    if (!lvl || !lvl.exploredGrid || !this.player) return;

    const sectorSize = 50;
    const currentSx = Math.max(0, Math.min(lvl.maxSectorCols - 1, Math.floor(this.player.x / 2000)));
    const currentSy = Math.max(0, Math.min(lvl.maxSectorRows - 1, Math.floor(this.player.y / 2000)));

    for (let sx = currentSx - 1; sx <= currentSx + 1; sx++) {
      for (let sy = currentSy - 1; sy <= currentSy + 1; sy++) {
        if (sx < 0 || sy < 0 || sx >= lvl.maxSectorCols || sy >= lvl.maxSectorRows) continue;
        const startTx = sx * sectorSize;
        const startTy = sy * sectorSize;
        for (let tx = startTx; tx < startTx + sectorSize; tx++) {
          for (let ty = startTy; ty < startTy + sectorSize; ty++) {
            if (lvl.exploredGrid[tx] && lvl.exploredGrid[tx][ty] !== undefined) {
              lvl.exploredGrid[tx][ty] = true;
            }
          }
        }
      }
    }

    lvl.mapRevealed = true;
    this.updateHUD();
    this.drawWorldmap();
    this.updateDevtoolsPanel();
    if (this.audio) this.audio.playClick();
  }

  applyDevtoolsVariable() {
    const pathInput = document.getElementById('dev-var-path');
    const valueInput = document.getElementById('dev-var-value');
    if (!pathInput || !valueInput) return;

    const rawPath = pathInput.value.trim();
    if (!rawPath) return;
    const normalizedPath = this._normalizeDevtoolsPath(rawPath);

    const rawValue = valueInput.value.trim();
    const value = this._parseDevtoolsValue(rawValue);

    const resolved = this._resolveDevtoolsTarget(normalizedPath);
    if (!resolved) {
      this.particles.spawnText(this.player.x, this.player.y - 20, 'DEV VAR PATH INVALID', {
        color: '#ff4757',
        fontSize: 10,
        fontPixel: true
      });
      return;
    }

    const { target, key } = resolved;
    target[key] = value;

    if (normalizedPath === 'player.shards') this.player.shards = this._coerceNumber(value, this.player.shards);
    if (normalizedPath === 'player.ap') this.player.ap = this._coerceNumber(value, this.player.ap);
    if (normalizedPath === 'player.xp') this.player.xp = this._coerceNumber(value, this.player.xp);
    if (normalizedPath === 'player.level') this.player.level = this._coerceNumber(value, this.player.level);

    if (normalizedPath.startsWith('player.')) {
      this.player.recalculateModifiers(this.abilityTree);
      this.player.saveGameState();
      this.updateHUD();
    } else if (normalizedPath.startsWith('levelManager.')) {
      this.player.saveGameState();
      if (key === 'mapRevealed' || key === 'theme' || key === 'wave') this.updateHUD();
      if (key === 'mapRevealed') this.drawWorldmap();
      if (key === 'wave') this.updateHUD();
    } else if (normalizedPath === 'state') {
      this.setState(String(value));
    } else if (normalizedPath === 'renderDistance') {
      this.setRenderDistance(value);
      this.updateHUD();
    } else if (normalizedPath === 'showSpellTrails') {
      this.saveSettings();
    } else {
      this.updateHUD();
    }

    this.updateDevtoolsPanel();
    if (this.audio) this.audio.playClick();
  }

  _normalizeDevtoolsPath(path) {
    if (path === 'gems') return 'player.shards';
    if (path === 'ap') return 'player.ap';
    if (path === 'xp') return 'player.xp';
    if (path === 'level') return 'player.level';
    if (path === 'hp') return 'player.hp';
    if (path === 'mp') return 'player.mp';
    return path;
  }

  _getDevtoolsPresetValue(path) {
    const normalizedPath = this._normalizeDevtoolsPath(path);
    if (normalizedPath === 'player.shards') return String(this.player?.shards ?? 0);
    if (normalizedPath === 'player.ap') return String(this.player?.ap ?? 0);
    if (normalizedPath === 'player.xp') return String(this.player?.xp ?? 0);
    if (normalizedPath === 'player.level') return String(this.player?.level ?? 1);
    if (normalizedPath === 'player.hp') return String(this.player?.hp ?? 0);
    if (normalizedPath === 'player.mp') return String(this.player?.mp ?? 0);
    if (normalizedPath === 'levelManager.wave') return String(this.levelManager?.wave ?? 1);
    if (normalizedPath === 'levelManager.mapRevealed') return String(!!this.levelManager?.mapRevealed);
    if (normalizedPath === 'showSpellTrails') return String(!!this.showSpellTrails);
    if (normalizedPath === 'renderDistance') return String(this.renderDistance ?? 1200);
    if (normalizedPath === 'state') return String(this.state || 'MENU');
    const resolved = this._resolveDevtoolsTarget(normalizedPath);
    if (!resolved) return '';
    const value = resolved.target[resolved.key];
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  _resolveDevtoolsTarget(path) {
    const parts = path.split('.').map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return null;

    let root;
    let index = 0;
    if (parts[0] === 'game') {
      root = this;
      index = 1;
    } else if (parts[0] === 'player') {
      root = this.player;
      index = 1;
    } else if (parts[0] === 'levelManager') {
      root = this.levelManager;
      index = 1;
    } else if (parts[0] === 'audio') {
      root = this.audio;
      index = 1;
    } else if (parts[0] === 'camera') {
      root = this.camera;
      index = 1;
    } else if (parts[0] === 'particles') {
      root = this.particles;
      index = 1;
    } else if (parts[0] === 'gems' || parts[0] === 'ap' || parts[0] === 'xp' || parts[0] === 'level') {
      root = this.player;
      index = 0;
    } else {
      root = this;
      index = 0;
    }

    if (!root) return null;
    let target = root;
    for (let i = index; i < parts.length - 1; i++) {
      const key = parts[i];
      if (target[key] === undefined || target[key] === null) return null;
      target = target[key];
    }

    const key = parts[parts.length - 1];
    if (target === undefined || target === null || !(key in target)) return null;
    return { target, key };
  }

  _parseDevtoolsValue(raw) {
    if (raw === '') return '';
    const lower = raw.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    if (lower === 'null') return null;
    if (lower === 'undefined') return undefined;
    if (!Number.isNaN(Number(raw)) && raw.trim() !== '') return Number(raw);
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  _coerceNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  _invSlotCost() {
    // 60 shards for slot 5, +30 each after
    return 60 + (this.player.maxInventorySlots - 4) * 30;
  }



  refreshSpellmapPanel() {
    const p = this.player;
    const SpellBook = this._getSpellBook();
    const unlocked = p.unlockedSpellIds || new Set(['fireball']);

    // Update header
    document.getElementById('spellmap-slots-info').innerText =
      `Slots: ${p.maxSpellSlots} / 7`;
    const buyBtn = document.getElementById('btn-spellmap-buy-slot');
    const costEl  = document.getElementById('spellmap-slot-cost');
    if (p.maxSpellSlots >= 7) {
      buyBtn.disabled = true;
      buyBtn.textContent = 'MAX SLOTS';
    } else {
      buyBtn.disabled = false;
      const cost = p.maxSpellSlots === 5 ? 80 : 120;
      if (costEl) costEl.innerText = cost;
    }

    // Element colour map
    const elemColor = { fire:'#ff4757', frost:'#10ac84', lightning:'#f1c40f',
                        void:'#a55eea', time:'#ff9f43' };

    // Helper: render a spell icon to a data-URL
    const iconUrl = (id) => {
      const c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      const cx = c.getContext('2d'); cx.imageSmoothingEnabled = false;
      this.assets.draw(cx, `icon_${id}`, 16, 16, 32);
      return c.toDataURL();
    };

    // ── Palette (all unlocked spells) ────────────────────────────────────
    const palette = document.getElementById('spellmap-palette');
    palette.innerHTML = '';
    let selectedSpellId = null;

    const allSpellIds = Array.from(unlocked).concat(
      [...unlocked].includes('fireball') ? [] : ['fireball']
    );
    // Ensure fireball is always available
    if (!allSpellIds.includes('fireball')) allSpellIds.unshift('fireball');

    allSpellIds.forEach(id => {
      const spell = SpellBook[id];
      if (!spell) return;
      const card = document.createElement('div');
      card.className = 'sm-spell-card';
      card.dataset.spellId = id;
      card.draggable = true;
      const col = elemColor[spell.element] || '#aaa';
      card.innerHTML = `
        <img class="sm-spell-icon" src="${iconUrl(id)}" draggable="false">
        <div class="sm-spell-name">${spell.name}</div>
        <div class="sm-spell-elem" style="color:${col}">${spell.element}</div>
      `;

      // Drag start
      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('spellId', id);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));

      // Click-to-select
      card.addEventListener('click', () => {
        if (selectedSpellId === id) {
          selectedSpellId = null;
          card.classList.remove('selected');
        } else {
          palette.querySelectorAll('.sm-spell-card').forEach(c => c.classList.remove('selected'));
          selectedSpellId = id;
          card.classList.add('selected');
        }
      });
      palette.appendChild(card);
    });

    // ── Slot targets ─────────────────────────────────────────────────────
    const slotDefs = [
      { id: 'primary',   key: 'LMB',   label: 'Primary' },
      { id: 'secondary', key: 'RMB',   label: 'Secondary' },
      { id: 'utility',   key: 'Space', label: 'Utility' },
      { id: 'ultimate',  key: 'Q',     label: 'Ultimate' },
      { id: 'extra',     key: 'E',     label: 'Extra' },
      { id: 'slot6',     key: '1',     label: 'Slot 6',  minSlots: 6 },
      { id: 'slot7',     key: '2',     label: 'Slot 7',  minSlots: 7 },
    ];

    const slotsContainer = document.getElementById('spellmap-slots');
    slotsContainer.innerHTML = '';

    slotDefs.forEach(def => {
      const locked = def.minSlots && p.maxSpellSlots < def.minSlots;
      const currentId = p.spellSlots[def.id];
      const currentSpell = currentId ? SpellBook[currentId] : null;

      const row = document.createElement('div');
      row.className = 'sm-slot' + (locked ? ' slot-locked' : '');
      row.dataset.slotId = def.id;

      const iconData = currentId ? iconUrl(currentId) : '';
      const col = currentSpell ? (elemColor[currentSpell.element] || '#aaa') : '#555';
      row.innerHTML = `
        <div class="sm-slot-key">${locked ? 'LOCKED' : def.key}</div>
        ${currentId
          ? `<img class="sm-slot-icon" src="${iconData}" draggable="false">`
          : `<div class="sm-slot-icon" style="border:2px dashed #333;border-radius:2px;"></div>`
        }
        <div class="sm-slot-info">
          <div class="sm-slot-name" style="color:${col}">${currentSpell ? currentSpell.name : (locked ? 'LOCKED' : '— empty —')}</div>
          <div class="sm-slot-desc">${def.label}${locked ? ` (unlock at ${def.minSlots} slots)` : ''}</div>
        </div>
        ${currentId && !locked ? `<button class="sm-slot-clear" data-slot="${def.id}" title="Clear slot">x</button>` : ''}
      `;

      if (!locked) {
        // Drop target
        row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('drag-over'); });
        row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
        row.addEventListener('drop', e => {
          e.preventDefault();
          row.classList.remove('drag-over');
          const spellId = e.dataTransfer.getData('spellId');
          this._assignSpellToSlot(def.id, spellId);
        });

        // Click-to-assign (when a palette card is selected)
        row.addEventListener('click', e => {
          if (e.target.classList.contains('sm-slot-clear')) return;
          if (selectedSpellId) {
            this._assignSpellToSlot(def.id, selectedSpellId);
            selectedSpellId = null;
            palette.querySelectorAll('.sm-spell-card').forEach(c => c.classList.remove('selected'));
          }
        });
      }
      slotsContainer.appendChild(row);
    });

    // Wire clear buttons
    slotsContainer.querySelectorAll('.sm-slot-clear').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const slotId = btn.dataset.slot;
        this._assignSpellToSlot(slotId, null);
      });
    });
  }

  _assignSpellToSlot(slotId, spellId) {
    this.player.customSpellMap[slotId] = spellId;
    this.player.recalculateModifiers(this.abilityTree);
    this.player.saveGameState();
    if (this.audio) this.audio.playClick();
    this.refreshSpellmapPanel();
    this.updateHUD();
  }

  _getSpellBook() {
    return SpellBook;
  }

  unlockAchievement(id) {
    if (!this.player.earnedAchievements) this.player.earnedAchievements = [];
    if (this.player.earnedAchievements.includes(id)) return;
    
    this.player.earnedAchievements.push(id);
    this.player.saveGameState();
    
    // Spawn floating notification!
    const names = {
      first_weave: "First Weave",
      pyromancer: "Pyromancer",
      cryomancer: "Cryomancer",
      time_bender: "Time Bender",
      relic_collector: "Runic Collector",
      armored_up: "Armored Up",
      flora_explorer: "Flora Explorer",
      spelunker: "Spelunker",
      abyssal_diver: "Abyssal Diver",
      the_glitched: "The Glitched",
      archon_slayer: "Archon Slayer",
      ap_master: "AP Master"
    };
    const title = names[id] || id;
    
    this.particles.spawnText(this.player.x, this.player.y - 45, `ACHIEVEMENT UNLOCKED: ${title}!`, {
      color: '#ffa502',
      fontSize: 11,
      fontPixel: true,
      life: 2.5
    });
    
    if (this.audio) this.audio.playUnlock();
    this.updateHUD();
  }

  refreshAchievementsPanel() {
    const grid = document.getElementById('inv-achievements-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const list = [
      { id: 'first_weave', name: 'First Weave', desc: 'Successfully complete Wave 1.' },
      { id: 'pyromancer', name: 'Pyromancer', desc: 'Deal 1,000 total Fire damage.' },
      { id: 'cryomancer', name: 'Cryomancer', desc: 'Freeze 50 enemies.' },
      { id: 'time_bender', name: 'Time Bender', desc: 'Cast Chrono Dash 20 times.' },
      { id: 'relic_collector', name: 'Runic Collector', desc: 'Have 5 runes in storage.' },
      { id: 'armored_up', name: 'Armored Up', desc: 'Equip gear in all 5 slots.' },
      { id: 'flora_explorer', name: 'Flora Explorer', desc: 'Visit the Harmonious Gardens.' },
      { id: 'spelunker', name: 'Spelunker', desc: 'Explore the Deep Caverns.' },
      { id: 'abyssal_diver', name: 'Abyssal Diver', desc: 'Plunge into the Triton Pools.' },
      { id: 'pyroclastic_survivor', name: 'Pyroclastic Survivor', desc: 'Survive the Volcanic Core.' },
      { id: 'void_walker', name: 'Void Walker', desc: 'Venture into the Void Rift.' },
      { id: 'the_glitched', name: 'The Glitched', desc: 'Enter the Limitless Backrooms.' },
      { id: 'archon_slayer', name: 'Archon Slayer', desc: 'Defeat the Aether Archon.' },
      { id: 'titan_slayer', name: 'Titan Slayer', desc: 'Defeat the Volcanic Titan.' },
      { id: 'behemoth_slayer', name: 'Void Conqueror', desc: 'Defeat the Void Behemoth.' },
      { id: 'ap_master', name: 'AP Master', desc: 'Spend 10 AP in the Ability Web.' }
    ];

    const earned = this.player.earnedAchievements || [];
    const countEl = document.getElementById('inv-achievements-count');
    if (countEl) countEl.innerText = `${earned.length}/${list.length}`;

    list.forEach(ach => {
      const hasUnlocked = earned.includes(ach.id);
      const card = document.createElement('div');
      card.className = 'achievement-card' + (hasUnlocked ? ' unlocked' : ' locked');
      card.style.background = hasUnlocked ? 'linear-gradient(135deg, #121824, #1b2234)' : '#04060c';
      card.style.border = hasUnlocked ? '3px double #eccc68' : '3px double #2f3640';
      card.style.padding = '8px';
      card.style.display = 'flex';
      card.style.alignItems = 'center';
      card.style.gap = '8px';

      const icon = hasUnlocked ? 'OPEN' : 'LOCKED';
      const color = hasUnlocked ? '#eccc68' : '#747d8c';
      card.innerHTML = `
        <div style="font-family:var(--font-pixel);font-size:8px;color:${color};text-align:center;line-height:1.2;min-width:36px;">${icon}</div>
        <div style="text-align: left;">
          <strong style="color:${color}; font-family:var(--font-pixel); font-size:9px; display:block; margin-bottom:2px;">${ach.name}</strong>
          <span style="color:#a4b0be; font-size:8px; line-height:1.2; font-family:var(--font-pixel);">${ach.desc}</span>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  _closeInventory() {
    const prev = this._prevStateBeforeInventory || 'PLAYING';
    // Don't play stateChange sfx when returning to playing (too noisy)
    this.state = prev;
    document.getElementById('hud').classList.toggle('hidden', prev !== 'PLAYING');
    this.showPanel(
      prev === 'SHOP'         ? 'panel-shop' :
      prev === 'PAUSED'       ? 'panel-pause' :
      prev === 'UPGRADE_TREE' ? 'panel-ability-tree' :
      ''
    );
  }

  // Helper: render a stat object into a human-readable string
  _statsToString(stats) {
    if (!stats) return '';
    return Object.entries(stats).map(([stat, val]) => {
      const sign = val >= 0 ? '+' : '';
      const isPercent = stat.toLowerCase().includes('damage') || ['speed','cooldownReduction','castSpeed','critChance','damageReduction','xpGain'].includes(stat);
      const displayVal = isPercent ? Math.round(val * 100) : val;
      const label = stat.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
      return `${sign}${displayVal}${isPercent ? '%' : ''} ${label}`;
    }).join(' · ');
  }

  _makeItemCard(item, { onRemove, onClick, removeTitle = 'Drop', clickHint = '' } = {}) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    this.assets.draw(cx, item.sprite, 16, 16, 32);
    const iconSrc = c.toDataURL();

    const card = document.createElement('div');
    card.className = 'inv-relic-card' + (item.type ? ' gear-item' : '');
    if (onClick) card.style.cursor = 'pointer';
    if (item.rarityColor) {
      card.style.borderColor = item.rarityColor + '77';
      card.style.boxShadow = `0 0 6px ${item.rarityColor}33`;
    }
    card.innerHTML = `
      <button class="btn-remove-relic" title="${removeTitle}">x</button>
      <img class="inv-relic-sprite" src="${iconSrc}" alt="${item.name}" draggable="false">
      <div class="inv-relic-name" style="color: ${item.rarityColor || '#ffffff'};">${item.name}</div>
      <div class="inv-relic-desc">${item.desc}${clickHint ? `<div class="inv-click-hint">${clickHint}</div>` : ''}</div>
    `;
    card.querySelector('.btn-remove-relic').addEventListener('click', (e) => {
      e.stopPropagation();
      if (onRemove) onRemove();
    });
    if (onClick) {
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-remove-relic')) return;
        onClick();
      });
    }
    return card;
  }

  refreshInventoryPanel() {
    if (this.player.runeStorage.length >= 5) {
      this.unlockAchievement('relic_collector');
    }
    if (this.player.equipment.helmet && this.player.equipment.chestplate && this.player.equipment.boots && this.player.equipment.weapon && this.player.equipment.ring) {
      this.unlockAchievement('armored_up');
    }

    // Update shard count in header
    document.getElementById('inv-shards-value').innerText = this.player.shards;
    this.drawHTMLIcon('icon-shard-inv', 'item_shard', 12);

    // ── TAB SWITCHING ──────────────────────────────────────────────────────
    // Determine active tab (default: runes)
    if (!this._invActiveTab) this._invActiveTab = 'runes';
    const activeTab = this._invActiveTab;
    document.querySelectorAll('.inv-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === activeTab);
    });
    document.querySelectorAll('.inv-tab-pane').forEach(pane => {
      pane.classList.toggle('hidden', pane.dataset.tab !== activeTab);
    });

    // ── RUNES TAB ──────────────────────────────────────────────────────────
    if (activeTab === 'runes') {
      const equippedRunes = this.player.equippedRunes;
      const maxSlots      = this.player.maxRuneSlots;

      // ── Equipped rune slots ─────────────────────────────────────────────
      const equippedGrid = document.getElementById('inv-equipped-rune-grid');
      if (equippedGrid) {
        equippedGrid.innerHTML = '';
        for (let i = 0; i < maxSlots; i++) {
          const rune = equippedRunes[i];
          if (rune) {
            const card = this._makeItemCard(rune, {
              removeTitle: 'Unequip rune',
              clickHint: 'CLICK TO UNEQUIP',
              onClick: () => {
                this.player.equippedRunes.splice(i, 1);
                this.player.runeStorage.push(rune);
                this.player.recalculateModifiers(this.abilityTree);
                this.player.saveGameState();
                if (this.audio) this.audio.playClick();
                this.refreshInventoryPanel();
                this.updateHUD();
              },
              onRemove: () => {
                this.player.equippedRunes.splice(i, 1);
                this.player.runeStorage.push(rune);
                this.player.recalculateModifiers(this.abilityTree);
                this.player.saveGameState();
                if (this.audio) this.audio.playClick();
                this.refreshInventoryPanel();
                this.updateHUD();
              }
            });
            card.classList.add('rune-equipped');
            equippedGrid.appendChild(card);
          } else {
            // Empty slot
            const empty = document.createElement('div');
            empty.className = 'inv-relic-card empty-slot rune-empty-slot';
            empty.innerHTML = `<div class="inv-slot-label">RUNE SLOT ${i + 1}</div>`;
            equippedGrid.appendChild(empty);
          }
        }
      }

      // ── Rune storage ────────────────────────────────────────────────────
      const runeGrid = document.getElementById('inv-rune-grid');
      if (runeGrid) {
        runeGrid.innerHTML = '';
        const runes = this.player.runeStorage;
        if (runes.length === 0) {
          runeGrid.innerHTML = '<div class="inv-empty-msg">No runes in storage.<br>Defeat enemies and open chests!</div>';
        } else {
          runes.forEach((item, idx) => {
            const isFull = equippedRunes.length >= maxSlots;
            const card = this._makeItemCard(item, {
              removeTitle: 'Discard rune',
              clickHint: isFull ? 'SLOTS FULL — UNEQUIP ONE FIRST' : 'CLICK TO EQUIP',
              onClick: () => {
                if (this.player.equippedRunes.length >= this.player.maxRuneSlots) {
                  this.particles.spawnText(this.player.x, this.player.y - 20, 'RUNE SLOTS FULL', { color: '#ff4757', fontSize: 10, fontPixel: true });
                  return;
                }
                this.player.runeStorage.splice(idx, 1);
                this.player.equippedRunes.push(item);
                this.player.recalculateModifiers(this.abilityTree);
                this.player.saveGameState();
                if (this.audio) this.audio.playBuy();
                this.refreshInventoryPanel();
                this.updateHUD();
              },
              onRemove: () => {
                this.player.runeStorage.splice(idx, 1);
                this.player.recalculateModifiers(this.abilityTree);
                this.player.saveGameState();
                if (this.audio) this.audio.playClick();
                this.refreshInventoryPanel();
                this.updateHUD();
              }
            });
            if (isFull) card.style.opacity = '0.6';
            runeGrid.appendChild(card);
          });
        }
      }

      const runeCount = document.getElementById('inv-rune-count');
      if (runeCount) runeCount.innerText = `${equippedRunes.length}/${maxSlots} equipped, ${this.player.runeStorage.length} in storage`;
    }

    // ── GEAR TAB ───────────────────────────────────────────────────────────
    if (activeTab === 'gear') {
      // Gear storage list
      const gearGrid = document.getElementById('inv-gear-grid');
      if (gearGrid) {
        gearGrid.innerHTML = '';
        const gearItems = this.player.gearStorage;
        if (gearItems.length === 0) {
          gearGrid.innerHTML = '<div class="inv-empty-msg">No gear in storage.<br>Open chests to find equipment!</div>';
        } else {
          gearItems.forEach((item, idx) => {
            const card = this._makeItemCard(item, {
              removeTitle: 'Drop gear',
              clickHint: 'CLICK TO EQUIP',
              onClick: () => this.equipGearFromStorage(idx),
              onRemove: () => {
                this.player.gearStorage.splice(idx, 1);
                this.player.saveGameState();
                if (this.audio) this.audio.playClick();
                this.refreshInventoryPanel();
              }
            });
            gearGrid.appendChild(card);
          });
        }
      }
      const gearCount = document.getElementById('inv-gear-count');
      if (gearCount) gearCount.innerText = this.player.gearStorage.length;

      // Equipped paper doll
      const equipSlots = ['helmet', 'chestplate', 'boots', 'weapon', 'ring'];
      equipSlots.forEach((slot) => {
        const slotEl = document.getElementById(`equip-slot-${slot}`);
        const canvas = document.getElementById(`equip-canvas-${slot}`);
        const tooltip = document.getElementById(`tooltip-equip-${slot}`);
        if (!slotEl || !canvas || !tooltip) return;

        const item = this.player.equipment[slot];

        // Replace element to clear old listeners, then get fresh canvas from the new node
        const newSlotEl = slotEl.cloneNode(true);
        slotEl.parentNode.replaceChild(newSlotEl, slotEl);
        const newCanvas = newSlotEl.querySelector('.equip-slot-canvas');
        const newTooltip = newSlotEl.querySelector('.tooltip');
        if (!newCanvas || !newTooltip) return;
        const ctx = newCanvas.getContext('2d');
        ctx.clearRect(0, 0, newCanvas.width, newCanvas.height);
        ctx.imageSmoothingEnabled = false;

        if (item) {
          newSlotEl.classList.add('filled');
          this.assets.draw(ctx, item.sprite, 16, 16, 32);
          newTooltip.innerHTML = `<strong style="color:${item.rarityColor || '#eccc68'}">${item.name}</strong><br>${this._statsToString(item.stats)}<br><span style="color:#ff4757;font-size:8px;font-family:var(--font-pixel);display:block;margin-top:4px">(CLICK TO UNEQUIP)</span>`;
          newSlotEl.addEventListener('click', () => this.unequipGear(slot));
        } else {
          newSlotEl.classList.remove('filled');
          const label = slot === 'chestplate' ? 'ROBE' : slot.toUpperCase();
          newTooltip.innerHTML = `<strong style="color:#57606f">EMPTY ${label} SLOT</strong>`;
        }
      });
    }

    // ── SPELLS TAB ─────────────────────────────────────────────────────────
    if (activeTab === 'spells') {
      this.refreshSpellmapPanel();
    }

    // ── ACHIEVEMENTS TAB ───────────────────────────────────────────────────
    if (activeTab === 'achievements') {
      this.refreshAchievementsPanel();
    }

    // Refresh the player preview on gear tab
    this.drawInventoryPlayer();
  }

  // Equip a piece of gear from gearStorage by index
  equipGearFromStorage(idx) {
    const gear = this.player.gearStorage[idx];
    if (!gear || !gear.type) return;

    const slot = gear.type;
    const prevGear = this.player.equipment[slot];

    // Remove the new gear from storage
    this.player.gearStorage.splice(idx, 1);
    // If there was something in the slot, put it back in storage
    if (prevGear) {
      this.player.gearStorage.push(prevGear);
    }
    this.player.equipment[slot] = gear;

    this.player.recalculateModifiers(this.abilityTree);
    this.player.saveGameState();
    if (this.audio) this.audio.playBuy();
    this.refreshInventoryPanel();
    this.updateHUD();
    this.particles.spawnText(this.player.x, this.player.y - 20, `EQUIPPED: ${gear.name}`, {
      color: '#eccc68', fontSize: 10, fontPixel: true
    });
  }

  // Keep old equipGear as alias (called from chest GUI)
  equipGear(idx) {
    this.equipGearFromStorage(idx);
  }

  unequipGear(slot) {
    const gear = this.player.equipment[slot];
    if (!gear) return;
    this.player.equipment[slot] = null;
    // Always goes back to gear storage — no bag-full issue
    this.player.gearStorage.push(gear);
    this.player.recalculateModifiers(this.abilityTree);
    this.player.saveGameState();
    if (this.audio) this.audio.playClick();
    this.refreshInventoryPanel();
    this.updateHUD();
    this.particles.spawnText(this.player.x, this.player.y - 20, `UNEQUIPPED: ${gear.name}`, {
      color: '#a55eea', fontSize: 10, fontPixel: true
    });
  }

  drawInventoryPlayer() {
    const canvas = document.getElementById('inv-player-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    // Center coordinates for drawing the player sprite inside the 48x48 canvas
    const px = canvas.width / 2;
    const py = canvas.height / 2;

    // Cycle idle animation frame
    const fIdx = Math.floor(this.frameIndex * 3) % 2; // 0 or 1 for idle breathing effect!

    ctx.save();
    if (this.player && this.player.hueShift) {
      ctx.filter = `hue-rotate(${this.player.hueShift}deg)`;
    }
    
    // Draw trail shadow at feet
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(px - 10, py + 10, 20, 4);

    // Draw player base sprite
    this.assets.draw(ctx, 'player', px, py, 32, fIdx, 0);

    // Overlay equipped gear sprites on the player mini-preview
    // Helmet
    const helmet = this.player.equipment.helmet;
    if (helmet) {
      this.assets.draw(ctx, helmet.sprite, px, py - 10, 16);
    }
    
    // Robe
    const robe = this.player.equipment.chestplate;
    if (robe) {
      this.assets.draw(ctx, robe.sprite, px, py + 2, 16);
    }
    
    // Boots
    const boots = this.player.equipment.boots;
    if (boots) {
      this.assets.draw(ctx, boots.sprite, px, py + 11, 16);
    }

    // Weapon
    const weapon = this.player.equipment.weapon;
    if (weapon) {
      this.assets.draw(ctx, weapon.sprite, px - 11, py + 2, 16);
    }

    // Ring
    const ring = this.player.equipment.ring;
    if (ring) {
      this.assets.draw(ctx, ring.sprite, px + 11, py + 2, 10);
    }

    ctx.restore();
  }


  // ----------------------------------------------------
  // ABILITY TREE MOUSE INTERACTION (Pan / Zoom)
  // ----------------------------------------------------
  initTreeListeners() {
    const container = document.getElementById('tree-canvas-container');
    
    container.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.abilityTree.isDragging = true;
      this.abilityTree.hasDragged = false;
      this.abilityTree._clickStartX = e.clientX;
      this.abilityTree._clickStartY = e.clientY;
      this.abilityTree.dragStart.x = e.clientX - this.abilityTree.panX;
      this.abilityTree.dragStart.y = e.clientY - this.abilityTree.panY;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.state !== 'UPGRADE_TREE') return;
      
      const rect = this.treeCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (this.abilityTree.isDragging) {
        this.abilityTree.panX = e.clientX - this.abilityTree.dragStart.x;
        this.abilityTree.panY = e.clientY - this.abilityTree.dragStart.y;
        // Track if we've actually dragged (moved > 8px from click start)
        if (Math.hypot(e.clientX - this.abilityTree._clickStartX, e.clientY - this.abilityTree._clickStartY) > 8) {
          this.abilityTree.hasDragged = true;
        }
      } else {
        // Track hovered nodes
        // Convert mouse viewport coord to canvas tree space (where center is 0,0)
        // Scale client coords to canvas buffer coords for alignment
        const scaleRatioX = this.treeCanvas.width / rect.width;
        const scaleRatioY = this.treeCanvas.height / rect.height;
        const cmx = mx * scaleRatioX;
        const cmy = my * scaleRatioY;
        const treeX = (cmx - this.treeCanvas.width / 2 - this.abilityTree.panX) / this.abilityTree.zoom;
        const treeY = (cmy - this.treeCanvas.height / 2 - this.abilityTree.panY) / this.abilityTree.zoom;
        
        let foundNode = null;
        const visibleNodes = this.abilityTree.getVisibleNodes();
        for (const key in visibleNodes) {
          const node = visibleNodes[key];
          const dist = Math.hypot(node.x - treeX, node.y - treeY);
          const baseRadius = node.type === 'root'     ? 20
                           : node.type === 'keystone' ? 17
                           : node.type === 'major' || node.type === 'unlock' ? 13
                           : 10;
          const viewScale = (node.view === 'companion1' || node.view === 'companion2') ? 1.3 : 1.0;
          const r = Math.round(baseRadius * viewScale);
          
          if (dist < r + 4) {
            foundNode = node;
            break;
          }
        }
        
        this.hoveredNode = foundNode;
        this.updateTreeTooltip(mx, my);
      }
    });

    window.addEventListener('mouseup', () => {
      this.abilityTree.isDragging = false;
    });

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = 1.1;
      if (e.deltaY < 0) {
        // Zoom in
        this.abilityTree.zoom = Math.min(this.abilityTree.maxZoom, this.abilityTree.zoom * zoomFactor);
      } else {
        // Zoom out
        this.abilityTree.zoom = Math.max(this.abilityTree.minZoom, this.abilityTree.zoom / zoomFactor);
      }
    });

    container.addEventListener('click', (e) => {
      // Don't register click if dragging occurred
      if (this.abilityTree.hasDragged) {
        this.abilityTree.hasDragged = false;
        return;
      }
      
      if (this.hoveredNode) {
        const unlocked = this.abilityTree.unlockNode(this.hoveredNode.id);
        if (unlocked) {
          this.updateHUD();
          // Update tree stats display
          document.getElementById('tree-shards').innerText = this.player.shards;
          document.getElementById('tree-ap').innerText = this.player.ap;
          
          // Re-trigger tooltip update
          const rect = this.treeCanvas.getBoundingClientRect();
          this.updateTreeTooltip(e.clientX - rect.left, e.clientY - rect.top);
        }
      }
    });

    // Control buttons inside canvas
    document.getElementById('btn-tree-zoom-in').addEventListener('click', () => {
      this.abilityTree.zoom = Math.min(this.abilityTree.maxZoom, this.abilityTree.zoom * 1.2);
    });
    document.getElementById('btn-tree-zoom-out').addEventListener('click', () => {
      this.abilityTree.zoom = Math.max(this.abilityTree.minZoom, this.abilityTree.zoom / 1.2);
    });
    document.getElementById('btn-tree-reset').addEventListener('click', () => {
      this.abilityTree.zoom = 1.0;
      this.abilityTree.panX = 0;
      this.abilityTree.panY = 0;
    });
    
    // Tab switching for the Aether Web views
    const tabContainer = document.getElementById('tree-tabs');
    if (tabContainer) {
      tabContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.tree-tab-btn');
        if (!btn) return;
        const view = btn.getAttribute('data-view');
        if (view) {
          this.abilityTree.currentView = view;
          this.abilityTree.zoom = 1.0;
          this.abilityTree.panX = 0;
          this.abilityTree.panY = 0;
          
          tabContainer.querySelectorAll('.tree-tab-btn').forEach(b => {
            b.classList.toggle('active', b === btn);
          });
          
          const canvas = this.treeCanvas;
          if (canvas) {
            const ctx = canvas.getContext('2d');
            this.abilityTree.draw(canvas, ctx);
          }
        }
      });
    }
    
    document.getElementById('btn-refund-tree').addEventListener('click', () => {
      // Refunding costs 10 shards as penalty
      if (this.player.shards >= 10) {
        this.player.shards -= 10;
        const refundedPoints = this.abilityTree.refundAll();
        this.player.ap += refundedPoints;
        this.player.recalculateModifiers(this.abilityTree);
        
        document.getElementById('tree-shards').innerText = this.player.shards;
        document.getElementById('tree-ap').innerText = this.player.ap;
        this.updateHUD();
        
        if (this.audio) this.audio.playBuy();
        this.player.saveGameState();
        
        this.particles.spawnText(this.player.x, this.player.y - 30, `REFUNDED ${refundedPoints} AP`, {
          color: '#ff9f43',
          fontSize: 12,
          fontPixel: true
        });
      } else {
        alert("Refunding requires 10 Aether Shards!");
      }
    });
  }

  updateTreeTooltip(mouseX, mouseY) {
    const tooltip = document.getElementById('tree-tooltip');
    
    if (!this.hoveredNode) {
      tooltip.classList.add('hidden');
      return;
    }

    tooltip.classList.remove('hidden');
    tooltip.style.left = `${mouseX + 15}px`;
    tooltip.style.top = `${mouseY + 15}px`;

    // Populate data
    document.getElementById('node-tooltip-title').innerText = this.hoveredNode.name;
    document.getElementById('node-tooltip-type').innerText = this.hoveredNode.type.toUpperCase();
    document.getElementById('node-tooltip-desc').innerText = this.hoveredNode.desc;
    document.getElementById('node-tooltip-cost').innerText = `Cost: ${this.hoveredNode.cost} AP`;

    const statusEl = document.getElementById('node-tooltip-status');
    if (this.hoveredNode.unlocked) {
      statusEl.className = 'node-status-unlocked';
      statusEl.innerText = 'UNLOCKED';
    } else if (this.abilityTree.isUnlockable(this.hoveredNode)) {
      statusEl.className = 'node-status-unlockable';
      statusEl.innerText = 'UNLOCKABLE';
    } else {
      statusEl.className = 'node-status-locked';
      statusEl.innerText = 'LOCKED (Prerequisite paths required / Insufficient AP)';
    }
  }

  // ----------------------------------------------------
  // GAME FLOW & STATE CONTROL
  // ----------------------------------------------------
  startNewGame() {
    // Always reset tutorial state when starting a real game
    this.isTutorial = false;
    const tg = document.getElementById('tutorial-guide');
    if (tg) tg.classList.add('hidden');

    this.projectiles = [];
    this.enemies = [];
    this.companions = [];
    this.items = [];
    this.areaEffects = [];
    this.score = 0;
    this.kills = 0;
    this.timeDilationTimer = 0;
    
    // Reset LevelManager to Wave 1
    this.levelManager = new LevelManager(this);
    
    // Reset player transient states but preserve stats & inventory progression
    const spawnPoint = this.levelManager.getSpawnPoint();
    this.player.x = spawnPoint.x;
    this.player.y = spawnPoint.y;
    
    // Spawn custom level enemies if any exist
    if (this.levelManager.customEnemySpawns) {
      this.levelManager.customEnemySpawns.forEach(sp => {
        this.spawnEnemy(sp.x, sp.y, sp.type);
      });
    }
    
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.hp = this.player.getMaxHp();
    this.player.mp = this.player.getMaxMp();
    this.player.iframeTimer = 0;
    this.player.dashCooldownTimer = 0;
    this.player.voltShieldTimer = 0;
    this.player.voltShieldDamageTimer = 0;
    this.player.wispAngle = 0;
    this.player.wispShootTimer = 0;
    this.player.dashSpeedBoostTimer = 0;
    this.player.spellCooldowns = {
      primary: 0,
      secondary: 0,
      utility: 0,
      ultimate: 0,
      extra: 0
    };
    this.player.buffs = {
      haste: 0,
      mana: 0,
      damage: 0
    };
    
    this.player.recalculateModifiers(this.abilityTree);
    this.player.saveGameState();
    
    // Center camera on the player
    this.camera = { x: this.player.x - this.canvas.width / 2, y: this.player.y - this.canvas.height / 2 };
    
    // Wave 1 start
    this.levelManager.startNextWave();
    
    this.updateHUD();
    
    this.setState('PLAYING');
    if (this.twitchManager && this.twitchManager.connected) {
      this.twitchManager.sendMessage(`[Aetherweaver] A new run has started! Wave 1 is active! Help or hinder the streamer in chat using commands: !heal, !spawn, !curse, !buff, !meteor, !gg`);
    }
  }

  gameOver() {
    // Clean up tutorial state if dying during tutorial
    if (this.isTutorial) {
      this.endTutorial();
      return;
    }
    this.isTutorial = false;
    const tg = document.getElementById('tutorial-guide');
    if (tg) tg.classList.add('hidden');

    this.setState('GAME_OVER');
    document.getElementById('go-waves').innerText = this.levelManager.wave;
    document.getElementById('go-kills').innerText = this.kills;
    document.getElementById('go-score').innerText = this.score;
    
    this.player.saveGameState();

    if (this.twitchManager && this.twitchManager.connected) {
      this.twitchManager.sendMessage(`[Aetherweaver] Run ended! Streamer was defeated on Wave ${this.levelManager.wave} with a final score of ${this.score}. Type !gg to console the wizard!`);
    }

    const submitStatus = document.getElementById('submit-status');
    if (submitStatus) {
      submitStatus.classList.add('hidden');
      submitStatus.innerText = '';
    }

    const loginNote = document.querySelector('#deathscreen-login-box .deathscreen-login-note');
    if (loginNote) {
      loginNote.innerText = this.pbClient.isPlayerAuthenticated()
        ? 'You are logged in. Open Player Account to review your cloud profile.'
        : 'Google login is coming soon.';
    }

    // Show rebirth panel if player is eligible (level 10+)
    const rebirthPanel = document.getElementById('rebirth-panel');
    const rebirthPreview = document.getElementById('rebirth-preview');
    if (this.player.level >= 10) {
      const nextRebirth = this.player.rebirthCount + 1;
      rebirthPreview.innerHTML =
        `Rebirth <strong style="color:#c39aff">#${nextRebirth}</strong> grants: ` +
        `<span style="color:#f1c40f">+2 Starting AP</span> · ` +
        `<span style="color:#ff4757">+5% Damage</span> · ` +
        `<span style="color:#10ac84">+15% XP & Shards</span> · ` +
        `<span style="color:#2ed573">+10 Max HP</span>` +
        (this.player.rebirthCount > 0 ? `<br><span style="color:#b39dff">Current Rebirths: ${this.player.rebirthCount}</span>` : '');
      rebirthPanel.classList.remove('hidden');
    } else {
      rebirthPanel.classList.add('hidden');
    }
  }

  setState(newState) {
    console.log(`[State] Changing state to: ${newState}`);
    const prevState = this.state;
    this.state = newState;
    
    if (newState === 'LEADERBOARD' || newState === 'CREDITS' || newState === 'CONTACT') {
      this.menuPrevState = (prevState === 'COMMUNITY_HUB') ? 'COMMUNITY_HUB' : 'MENU';
    }
    
    if (this.audio) this.audio.playStateChange();
    
    if (newState === 'SHOP') {
      if (this.twitchManager && this.twitchManager.connected && !this.isTutorial) {
        const currentSx = Math.max(0, Math.min(this.levelManager.maxSectorCols - 1, Math.floor(this.player.x / 2000)));
        const currentSy = Math.max(0, Math.min(this.levelManager.maxSectorRows - 1, Math.floor(this.player.y / 2000)));
        const currentTheme = this.levelManager.sectorThemes[`${currentSx},${currentSy}`] || 'dungeon';
        
        const allThemes = ['dungeon', 'gardens', 'underground', 'pool', 'volcanic', 'void_rift'];
        const otherThemes = allThemes.filter(t => t !== currentTheme);
        const shuffle = otherThemes.sort(() => 0.5 - Math.random());
        const voteOptions = shuffle.slice(0, 3);
        const duration = this.twitchManager.voteDuration || 20;
        
        this.waitingForVoteToStartNextWave = false;
        
        this.twitchManager.startVote(voteOptions, duration, (result) => {
          console.log(`[Twitch Vote] Result: ${result.winner} with ${result.votes[result.winner] || 0} votes`);
          if (result.winner) {
            const sx = Math.max(0, Math.min(this.levelManager.maxSectorCols - 1, Math.floor(this.player.x / 2000)));
            const sy = Math.max(0, Math.min(this.levelManager.maxSectorRows - 1, Math.floor(this.player.y / 2000)));
            this.levelManager.sectorThemes[`${sx},${sy}`] = result.winner;
            this.levelManager.theme = result.winner;
            
            const colors = { dungeon: '#95a5a6', gardens: '#2ecc71', underground: '#e67e22', pool: '#3498db', volcanic: '#e74c3c', void_rift: '#a55eea' };
            this.particles.spawnText(this.player.x, this.player.y - 80, `CHAT CHOSE ${result.winner.toUpperCase()} THEME!`, {
              color: colors[result.winner] || '#fff',
              fontSize: 11,
              fontPixel: true,
              life: 3.5
            });
          }
          
          const waitingMsg = document.getElementById('twitch-vote-waiting-msg');
          const statusLbl = document.getElementById('shop-twitch-vote-status');
          if (waitingMsg) waitingMsg.style.display = 'none';
          if (statusLbl) statusLbl.style.display = 'none';
          
          if (this.waitingForVoteToStartNextWave) {
            this.waitingForVoteToStartNextWave = false;
            this.startNextWaveFromShop();
          }
        });
      }
    }

    if (newState === 'MENU') {
      if (this.isTutorial) {
        this.endTutorial();
        return;
      }
      this.isTutorial = false;
      const tg = document.getElementById('tutorial-guide');
      if (tg) tg.classList.add('hidden');
    }

    if (newState === 'PLAYING') {
      const tg = document.getElementById('tutorial-guide');
      if (tg && !this.isTutorial) {
        tg.classList.add('hidden');
      }
    }
    
    // Keep HUD visible during inventory/worldmap so stats are readable
    document.getElementById('hud').classList.toggle('hidden',
      newState !== 'PLAYING' && newState !== 'INVENTORY' && newState !== 'WORLD_MAP');
    
    this.showPanel(
      newState === 'MENU'          ? 'panel-main-menu' :
      newState === 'PLAY_MENU'     ? 'panel-play-menu' :
      newState === 'CUSTOMIZE'     ? 'panel-customize' :
      newState === 'CREDITS'       ? 'panel-credits' :
      newState === 'CONTACT'       ? 'panel-contact' :
      newState === 'UPGRADE_TREE'  ? 'panel-ability-tree' :
      newState === 'GAME_OVER'     ? 'panel-game-over' :
      newState === 'PAUSED'        ? 'panel-pause' :
      newState === 'SHOP'          ? 'panel-shop' :
      newState === 'INVENTORY'     ? 'panel-inventory' :
      newState === 'SETTINGS'      ? 'panel-settings' :
      newState === 'TWITCH'        ? 'panel-twitch' :
      newState === 'WORLD_MAP'     ? 'panel-worldmap' :
      newState === 'LEVEL_BUILDER' ? 'panel-level-builder' :
      newState === 'STORY_CHAPTERS'? 'panel-story-chapters' :
      newState === 'PLAYER_ACCOUNT'? 'panel-player-account' :
      newState === 'LEADERBOARD'   ? 'panel-leaderboard' :
      newState === 'COMMUNITY_HUB' ? 'panel-community-hub' : ''
    );

    if (newState === 'INVENTORY') {
      this.refreshInventoryPanel();
    }
    if (newState === 'WORLD_MAP') {
      // Reset zoom/pan to default centered view
      this.mapZoom = 1.0;
      this.mapPanX = 0;
      this.mapPanY = 0;
      const btn = document.getElementById('btn-reveal-map');
      if (btn) {
        if (this.levelManager.mapRevealed) {
          btn.innerText = "MAP UNLOCKED";
          btn.disabled = true;
        } else {
          btn.innerText = "REVEAL MAP (150 Shards)";
          btn.disabled = false;
        }
      }
      this.drawWorldmap();
    }

    if (newState === 'LEADERBOARD') {
      this.fetchLeaderboard();
    }

    if (newState === 'UPGRADE_TREE') {
      this.resizeTreeCanvas();
      document.getElementById('tree-shards').innerText = this.player.shards;
      document.getElementById('tree-ap').innerText = this.player.ap;
      const rebirthBadge = document.getElementById('tree-rebirth-badge');
      const rebirthCountEl = document.getElementById('tree-rebirth-count');
      if (this.player.rebirthCount > 0) {
        rebirthBadge.classList.remove('hidden');
        if (rebirthCountEl) rebirthCountEl.innerText = this.player.rebirthCount;
      } else {
        rebirthBadge.classList.add('hidden');
      }
      
      // Manage tree tabs visibility depending on unlocked companions
      const treeTabs = document.getElementById('tree-tabs');
      if (treeTabs) {
        const unlockedAny = this.player.unlockedCompanion1 || this.player.unlockedCompanion2;
        treeTabs.classList.toggle('hidden', !unlockedAny);
        
        const tab1 = document.getElementById('tab-companion1');
        if (tab1) tab1.classList.toggle('hidden', !this.player.unlockedCompanion1);
        
        const tab2 = document.getElementById('tab-companion2');
        if (tab2) tab2.classList.toggle('hidden', !this.player.unlockedCompanion2);
        
        // Highlight active tab
        const tabBtns = treeTabs.querySelectorAll('.tree-tab-btn');
        tabBtns.forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-view') === this.abilityTree.currentView);
        });
      }
    }
    if (newState === 'SHOP') {
      this.drawShopItems();
      const shopShards = document.getElementById('shop-shards-value');
      if (shopShards) {
        shopShards.innerText = this.player.shards;
      }
    }
  }

  showPanel(panelId) {
    const overlays = ['panel-main-menu', 'panel-ability-tree', 'panel-game-over', 'panel-leaderboard', 'panel-pause', 'panel-shop', 'panel-inventory', 'panel-worldmap', 'panel-play-menu', 'panel-customize', 'panel-credits', 'panel-contact', 'panel-settings', 'panel-twitch', 'panel-level-builder', 'panel-story-chapters', 'panel-player-account', 'panel-community-hub'];
    overlays.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.toggle('hidden', id !== panelId);
      }
    });
  }

  // Multiplayer host broadcasting and client input helpers
  _startHostBroadcast(intervalMs = 200) {
    if (this._mpHostInterval) return;
    this._mpHostInterval = setInterval(() => {
      if (!this.multiplayer || !this.multiplayer.isHost) return;
      if (this.state !== 'PLAYING') return;
      // Build minimal authoritative snapshot
      const snap = {
        t: Date.now(),
        player: { x: this.player.x, y: this.player.y, hp: this.player.hp, mp: this.player.mp },
        players: Array.from(this.remotePlayers.entries()).map(([id, pl]) => ({ id, x: pl.x, y: pl.y, hp: pl.hp || null })),
        enemies: this.enemies.slice(0, 100).map(e => ({ id: e.id || null, x: e.x, y: e.y, hp: e.hp || null })),
        projectiles: this.projectiles.slice(0, 200).map(p => ({ id: p.id || null, x: p.x, y: p.y, vx: p.vx, vy: p.vy }))
      };
      try { this.multiplayer.broadcastData({ t: 'STATE_SNAPSHOT', p: snap }); } catch (e) { console.warn('broadcast snapshot failed', e); }
    }, intervalMs);
  }

  _stopHostBroadcast() {
    if (this._mpHostInterval) { clearInterval(this._mpHostInterval); this._mpHostInterval = null; }
  }

  _applySnapshot(snap) {
    if (!snap) return;
    const now = Date.now();
    // Update remote players (host)
    if (snap.player) {
      // single-host snapshot; store host as "host" entry with interpolation fields
      const prev = this.remotePlayers.get('host') || {};
      const prevX = prev.targetX !== undefined ? prev.targetX : (prev.x !== undefined ? prev.x : snap.player.x);
      const prevY = prev.targetY !== undefined ? prev.targetY : (prev.y !== undefined ? prev.y : snap.player.y);
      this.remotePlayers.set('host', {
        prevX, prevY,
        targetX: snap.player.x, targetY: snap.player.y,
        hp: snap.player.hp,
        startTs: now,
        duration: 220,
        lastSeen: now
      });
    }
    // Update players positions (other players) for visualization with simple interpolation
    if (Array.isArray(snap.players)) {
      for (const sp of snap.players) {
        if (!sp || !sp.id) continue;
        const existing = this.remotePlayers.get(sp.id) || {};
        const prevX = existing.targetX !== undefined ? existing.targetX : (existing.x !== undefined ? existing.x : sp.x);
        const prevY = existing.targetY !== undefined ? existing.targetY : (existing.y !== undefined ? existing.y : sp.y);
        this.remotePlayers.set(sp.id, {
          prevX, prevY,
          targetX: sp.x, targetY: sp.y,
          hp: sp.hp !== undefined ? sp.hp : existing.hp,
          startTs: now,
          duration: 220,
          lastSeen: now
        });
      }
    }

    // Update enemies positions locally for visualization (non-authoritative client-side interpolation could be added)
    if (Array.isArray(snap.enemies)) {
      for (const se of snap.enemies) {
        const existing = this.enemies.find(e => e.id === se.id);
        if (existing) {
          existing.x = se.x; existing.y = se.y; if (se.hp !== undefined) existing.hp = se.hp;
        } else {
          // lightweight enemy placeholder if not present
          this.enemies.push({ id: se.id || `e${Date.now()}`, x: se.x, y: se.y, hp: se.hp || 0, draw: () => {} });
        }
      }
    }
    // Projectiles: naive sync
    if (Array.isArray(snap.projectiles)) {
      // Replace local projectiles with snapshot for now (could be improved)
      this.projectiles = snap.projectiles.map(p => ({ id: p.id || null, x: p.x, y: p.y, vx: p.vx, vy: p.vy, life: 1 }));
    }
  }

  _onRemoteInput(peerId, inp) {
    // Host: validate and queue remote inputs for processing in game update loop
    if (!this.multiplayer || !this.multiplayer.isHost) return;
    try {
      // Simple validation: ensure peerId exists and input has type
      if (!peerId || !inp || !inp.type) return;
      this._remoteInputQueue.push({ peerId, inp, recvTs: Date.now() });
    } catch (e) { console.warn('queue remote input failed', e); }
  }

  _sendLocalInput(payload) {
    try {
      if (!this.multiplayer || !this.multiplayer.connected) return;
      if (!this.multiplayer.roomCode) return;
      // Viewers send to host; host doesn't echo own input
      if (this.multiplayer.isHost) return;
      const entry = this.multiplayer._getPeerEntry(this.multiplayer.clientId) || this.multiplayer.peers.get('HOST');
      if (entry && entry.dc && entry.dc.readyState === 'open') {
        entry.dc.send(JSON.stringify({ t: 'INPUT', p: payload }));
      }
    } catch (e) { console.warn('send input failed', e); }
  }

  /** Streamer receives !join from chat — free mode posts link, whitelist shows popup */
  handleJoinCommand(username) {
    if (!this.pbClient || !this.pbClient.isAuthenticated()) return;
    const settings = (this.pbClient.record && this.pbClient.record.settings) || {};
    if (!settings.multiplayerAllowJoins) return;

    const slug = (this.pbClient.record.slug || this.pbClient.record.twitch_name || this.twitchManager.channel || '').toLowerCase();
    const roomCode = (settings.multiplayerRoomCode || slug).toUpperCase();
    const joinMode = settings.multiplayerJoinMode || 'free';
    const joinUrl = `${location.origin}/?join=${encodeURIComponent(slug)}`;

    if (this.multiplayer && this.multiplayer.isBanned(username)) {
      this.twitchManager.sendMessage(`@${username} you are banned from this room.`);
      return;
    }

    if (joinMode === 'whitelist') {
      const requestId = `chat_${Date.now()}_${username}`;
      this._showJoinRequestPopup({ requestId, username, from: null, source: 'chat' });
      return;
    }

    // Free mode: post room link immediately
    this.twitchManager.sendMessage(`@${username} Join ${slug}'s room! Code: ${roomCode} — ${joinUrl}`);
    this._ensureStreamerHosting(roomCode);
  }

  _ensureStreamerHosting(roomCode) {
    if (!this.multiplayer) return;
    if (this.multiplayer.isHost && this.multiplayer.roomCode === roomCode) return;
    this.multiplayer.createRoom(roomCode).then(r => {
      if (r.ok) {
        this.isMultiplayerViewer = false;
        console.log('[Multiplayer] Streamer auto-hosting room', roomCode);
      }
    }).catch(e => console.warn('auto-host failed', e));
  }

  _showJoinRequestPopup(req) {
    if (!this._joinRequestPopup) return;
    this._pendingJoinRequestUI = req;
    const userEl = this._joinRequestPopup.querySelector('#mp-join-req-user');
    if (userEl) userEl.innerText = `${req.username} wants to join your game!`;
    this._joinRequestPopup.style.display = 'block';
    if (this.audio) this.audio.playUnlock();
  }

  _acceptJoinRequestUI() {
    const req = this._pendingJoinRequestUI;
    if (!req) return;
    this._joinRequestPopup.style.display = 'none';
    this._pendingJoinRequestUI = null;

    const slug = (this.pbClient && this.pbClient.record && (this.pbClient.record.slug || this.pbClient.record.twitch_name)) || this.twitchManager.channel;
    const roomCode = ((this.pbClient && this.pbClient.record && this.pbClient.record.settings && this.pbClient.record.settings.multiplayerRoomCode) || slug || '').toUpperCase();
    const joinUrl = `${location.origin}/?join=${encodeURIComponent((slug || '').toLowerCase())}`;

    this._ensureStreamerHosting(roomCode);
    this.twitchManager.sendMessage(`@${req.username} Welcome! Join here: ${joinUrl} (Code: ${roomCode})`);

    if (req.from && this.multiplayer) {
      this.multiplayer.sendWS({ type: 'JOIN_ACCEPT', to: req.from, p: { code: roomCode, url: joinUrl } });
    }
  }

  _denyJoinRequestUI() {
    const req = this._pendingJoinRequestUI;
    this._joinRequestPopup.style.display = 'none';
    this._pendingJoinRequestUI = null;
    if (req && req.source === 'chat') {
      this.twitchManager.sendMessage(`@${req.username} your join request was denied.`);
    } else if (req && req.from && this.multiplayer) {
      this.multiplayer.sendWS({ type: 'JOIN_REJECT', to: req.from, p: { reason: 'denied' } });
    }
  }

  /** Called when viewer successfully connects to host — use base MP stats, not host progression */
  _onJoinedAsViewer() {
    this.isMultiplayerViewer = true;
    if (!this.player) return;
    // Backup viewer's singleplayer save so we can restore after leaving
    try {
      this._viewerSaveBackup = localStorage.getItem('aetherweaver_save');
    } catch (e) {}
    // Apply fresh multiplayer viewer profile (no host inventory/tree sync)
    this._applyViewerMultiplayerProfile();
  }

  _applyViewerMultiplayerProfile() {
    if (!this.player) return;
    this.player.level = 1;
    this.player.ap = 0;
    this.player.hp = 100;
    this.player.maxHp = 100;
    this.player.mp = 50;
    this.player.maxMp = 50;
    this.player.equipment = { helmet: null, chest: null, boots: null, weapon: null, offhand: null };
    this.player.equippedRunes = [];
    this.player.gearStorage = [];
    this.player.runeStorage = [];
    // Do NOT call saveGameState — viewer SP progress stays in backup
    this.updateHUD();
  }

  _restoreViewerSaveAfterLeave() {
    if (!this.isMultiplayerViewer || !this._viewerSaveBackup) return;
    try {
      localStorage.setItem('aetherweaver_save', this._viewerSaveBackup);
      if (this.player) this.player.loadGameState();
    } catch (e) {}
    this._viewerSaveBackup = null;
    this.isMultiplayerViewer = false;
  }

  _applyRoomExport(data) {
    if (!data || !this.player) return;
    if (data.wave && this.levelManager) {
      this.levelManager.wave = data.wave;
    }
    if (data.player) {
      this.player.x = data.player.x || this.player.x;
      this.player.y = data.player.y || this.player.y;
      if (data.player.hp !== undefined) this.player.hp = data.player.hp;
      if (data.player.mp !== undefined) this.player.mp = data.player.mp;
    }
    if (Array.isArray(data.enemies)) {
      this.enemies = data.enemies.map(e => {
        const enemy = new Enemy(this, e.x, e.y, e.type || 'slime');
        enemy.id = e.id;
        enemy.hp = e.hp || enemy.hp;
        return enemy;
      });
    }
    if (Array.isArray(data.projectiles)) {
      this.projectiles = data.projectiles.map(p => ({ id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, life: 1 }));
    }
    if (Array.isArray(data.banned) && this.multiplayer) {
      this.multiplayer.bannedUsers = new Set(data.banned.map(u => u.toLowerCase()));
    }
    if (data.roomCode && this.multiplayer && this.multiplayer.isHost) {
      this._setMpLink && this._setMpLink(location.origin + '/?join=' + encodeURIComponent(data.roomCode.toLowerCase()));
    }
    this.updateHUD();
  }

  _onWorldSync(snap) {
    this._applySnapshot(snap);
  }

  drawShopItems() {
    const drawItem = (canvasId, assetKey) => {
      const canvas = document.getElementById(canvasId);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        this.assets.draw(ctx, assetKey, canvas.width / 2, canvas.height / 2, canvas.width);
      }
    };
    drawItem('shop-canvas-hp', 'item_hp');
    drawItem('shop-canvas-mp', 'item_mp');
    drawItem('shop-canvas-vit', 'item_heart');
    drawItem('shop-canvas-mana', 'item_crystal');
    drawItem('shop-canvas-relic', 'item_chest_relic');
  }

  // ----------------------------------------------------
  // ENTITY SPAWNING AND ACTIONS
  // ----------------------------------------------------
  spawnProjectile(x, y, angle, spec, isPlayerOwned) {
    let finalDmg = spec.damage;
    if (isPlayerOwned) {
      if (this.player.buffs.damage > 0) {
        finalDmg *= 2; // Damage Buff active
      }
      // Apply player modifiers
      if (spec.element === SPELL_TYPES.FIRE) finalDmg *= this.player.modifiers.fireDamage;
      if (spec.element === SPELL_TYPES.FROST) finalDmg *= this.player.modifiers.frostDamage;
      if (spec.element === SPELL_TYPES.LIGHTNING) finalDmg *= this.player.modifiers.lightningDamage;
      if (spec.element === SPELL_TYPES.VOID) finalDmg *= this.player.modifiers.voidDamage;
      if (spec.element === SPELL_TYPES.TIME) finalDmg *= this.player.modifiers.timeDamage;
      finalDmg *= this.player.modifiers.allDamage;
      
      // Regional multipliers
      if (this.levelManager && this.levelManager.sectorThemes) {
        const sx = Math.max(0, Math.min(this.levelManager.maxSectorCols - 1, Math.floor(x / 2000)));
        const sy = Math.max(0, Math.min(this.levelManager.maxSectorRows - 1, Math.floor(y / 2000)));
        const localTheme = this.levelManager.sectorThemes[`${sx},${sy}`] || 'dungeon';
        if (localTheme === 'volcanic' && spec.element === SPELL_TYPES.FIRE) {
          finalDmg *= 1.5;
        }
        if (localTheme === 'void_rift' && spec.element === SPELL_TYPES.VOID) {
          finalDmg *= 1.3;
        }
      }
    }
    
    this.projectiles.push({
      x,
      y,
      vx: Math.cos(angle) * spec.speed,
      vy: Math.sin(angle) * spec.speed,
      damage: Math.round(finalDmg),
      radius: spec.radius,
      element: spec.element,
      spriteKey: spec.sprite,
      isPlayerOwned,
      life: 3.0, // 3 seconds timeout
      id: spec.id,
      shootTimer: 0,
      trail: [] // History of points for ribbon trail
    });
  }

  spawnEnemy(x, y, type) {
    let sx = x;
    let sy = y;
    if (this.levelManager) {
      for (const obs of this.levelManager.obstacles) {
        if (obs.type !== 'pillar') continue;
        const dist = Math.hypot(sx - obs.x, sy - obs.y);
        const minDistance = obs.radius + 10;
        if (dist < minDistance) {
          const angle = dist > 0.1 ? Math.atan2(sy - obs.y, sx - obs.x) : Math.random() * Math.PI * 2;
          sx = obs.x + Math.cos(angle) * (minDistance + 2);
          sy = obs.y + Math.sin(angle) * (minDistance + 2);
        }
      }
    }
    this.enemies.push(new Enemy(this, sx, sy, type));
  }

  spawnItem(x, y, type, value) {
    if (type === 'shard' || type === 'hp' || type === 'mp') {
      const stackRadius = 30;
      const existing = this.items.find(item => 
        item.type === type && 
        Math.hypot(item.x - x, item.y - y) <= stackRadius
      );
      if (existing) {
        existing.value += value;
        if (!existing.drawSize) existing.drawSize = 16;
        existing.drawSize = Math.min(28, existing.drawSize + 1);
        existing.radius = Math.min(20, existing.radius + 0.5);
        return;
      }
    }

    this.items.push({
      x,
      y,
      type, // 'shard', 'hp', 'mp'
      value,
      radius: 6,
      drawSize: 16,
      vx: (Math.random() - 0.5) * 50,
      vy: (Math.random() - 0.5) * 50,
      friction: 0.9
    });
  }

  spawnAreaEffect(x, y, radius, type, duration) {
    this.areaEffects.push({
      x,
      y,
      radius,
      type, // 'fire_pool', 'steam_cloud', 'singularity', 'chrono_slow'
      duration,
      maxDuration: duration,
      tickTimer: 0
    });
  }

  // ----------------------------------------------------
  // SPELL & COMBO TRIGGER HELPERS
  // ----------------------------------------------------
  /**
   * Remove all enemies flagged .dead this frame, then apply pending spawns.
   * Called once at the end of the update loop so no mid-iteration splice occurs.
   */
  flushDeadEnemies() {
    // Remove dead enemies (filter preserves order, no index shifting during iteration)
    this.enemies = this.enemies.filter(e => !e.dead);

    // Apply pending enemy spawns (e.g. slime splits)
    if (this.pendingEnemySpawns && this.pendingEnemySpawns.length > 0) {
      for (const s of this.pendingEnemySpawns) {
        this.spawnEnemy(s.x, s.y, s.type);
        const mini = this.enemies[this.enemies.length - 1];
        if (mini && s.kbx !== undefined) mini.applyKnockback(s.kbx, s.kby);
      }
      this.pendingEnemySpawns = [];
    }
  }

  triggerChainLightning(startX, startY, damage, maxJumps, jumpRange) {
    if (this.audio) this.audio.playLightning();

    // Work entirely from a snapshot taken right now so mid-iteration kills
    // cannot affect which enemies we visit.
    const snapshot = this.enemies.filter(e => !e.dead);

    let currentX = startX;
    let currentY = startY;
    const jumpedTargets = new Set();

    for (let j = 0; j < maxJumps; j++) {
      let nearest = null;
      let minDist = jumpRange;

      for (const enemy of snapshot) {
        if (enemy.dead || jumpedTargets.has(enemy) || enemy.isInTallGrass()) continue;
        const dist = Math.hypot(enemy.x - currentX, enemy.y - currentY);
        if (dist < minDist) { minDist = dist; nearest = enemy; }
      }

      if (!nearest) break;
      jumpedTargets.add(nearest);

      // Spawn bolt particles
      const steps = 6;
      let lx = currentX, ly = currentY;
      for (let s = 1; s <= steps; s++) {
        const ratio = s / steps;
        const tx = currentX + (nearest.x - currentX) * ratio + (Math.random() - 0.5) * 15;
        const ty = currentY + (nearest.y - currentY) * ratio + (Math.random() - 0.5) * 15;
        this.particles.spawn(lx, ly, { vx:0, vy:0, color:'#fff200', size:2, life:0.25, glow:true, shape:'spark' });
        lx = tx; ly = ty;
      }
      this.particles.spawn(lx, ly, { vx:0, vy:0, color:'#fff200', size:3, life:0.2, glow:true, shape:'spark' });

      // Skip if already killed earlier this chain
      if (nearest.dead) break;
      nearest.takeDamage(damage, false, this);
      if (!nearest.dead) nearest.applyStatus(SPELL_TYPES.LIGHTNING, 4.0);

      currentX = nearest.x;
      currentY = nearest.y;
    }
  }

  triggerAoEFreeze(x, y, radius, duration) {
    if (this.audio) this.audio.playFreeze();
    this.enemies.forEach((enemy) => {
      if (enemy.dead) return;
      const dist = Math.hypot(enemy.x - x, enemy.y - y);
      if (dist <= radius) {
        enemy.applyStatus(SPELL_TYPES.FROST, duration);
        this.particles.createExplosion(enemy.x, enemy.y, '#10ac84', 6, 40, 2);
      }
    });
  }

  uiNotifyCombo(comboName, comboClass) {
    const alertBox = document.getElementById('combo-alert-container');
    if (!alertBox) return;

    const el = document.createElement('div');
    el.className = `combo-popup ${comboClass}`;
    el.innerText = comboName;
    alertBox.appendChild(el);

    // Remove element after animation completes
    setTimeout(() => {
      el.remove();
    }, 1500);
  }

  // ----------------------------------------------------
  // LEADERBOARD INTEGRATION
  // ----------------------------------------------------
  fetchLeaderboard() {
    fetch(`${this.pbClient.baseUrl}/api/collections/ag_leaderboard/records?sort=-score&limit=10`)
      .then((res) => res.json())
      .then((data) => {
        const items = data.items || [];
        this.renderLeaderboardRows(items);
      })
      .catch((pbErr) => {
        console.warn("PocketBase leaderboard error: ", pbErr);
        const body = document.getElementById('leaderboard-body');
        body.innerHTML = '<tr><td colspan="5" class="text-center">Leaderboard offline. Please try again later.</td></tr>';
      });
  }

  renderLeaderboardRows(data) {
    const body = document.getElementById('leaderboard-body');
    body.innerHTML = '';
    data.forEach((entry, idx) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>#${idx + 1}</td>
        <td class="text-highlight">${entry.name}</td>
        <td class="text-glow">${entry.score}</td>
        <td>W${entry.wave}</td>
        <td>Lvl ${entry.level}</td>
      `;
      body.appendChild(row);
    });
  }

  submitHighScore() {
    const statusEl = document.getElementById('submit-status');
    if (statusEl) {
      statusEl.classList.remove('hidden');
      statusEl.style.color = '#f1c40f';
      statusEl.innerText = 'Open Player Account to log in and sync your legend.';
    }
    alert("Open Player Account to log in and sync your legend.");
  }

  drawHTMLIcon(canvasId, spriteKey, size = 12) {
    const canvas = document.getElementById(canvasId);
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      this.assets.draw(ctx, spriteKey, canvas.width / 2, canvas.height / 2, size);
    }
  }

  drawHTMLIcons() {
    this.drawHTMLIcon('icon-shard-hud', 'item_shard', 12);
    this.drawHTMLIcon('icon-shard-shop', 'item_shard', 12);
    this.drawHTMLIcon('icon-ap-hud', 'item_crystal', 12);
    this.drawHTMLIcon('icon-key-hud', 'icon_key', 20);
    this.drawHTMLIcon('icon-satchel-hud', 'icon_satchel', 12);
    
    // Combo lists
    this.drawHTMLIcon('combo-fire-1', 'proj_fire', 10);
    this.drawHTMLIcon('combo-fire-2', 'proj_fire', 10);
    this.drawHTMLIcon('combo-frost-1', 'proj_frost', 10);
    this.drawHTMLIcon('combo-frost-2', 'proj_frost', 10);
    this.drawHTMLIcon('combo-lightning-1', 'proj_lightning', 10);
    this.drawHTMLIcon('combo-lightning-2', 'proj_lightning', 10);
    this.drawHTMLIcon('combo-void-1', 'proj_void', 10);
    this.drawHTMLIcon('combo-time-1', 'item_wisp', 10);
    this.drawHTMLIcon('icon-mainmenu-story', 'icon_book', 24);
    this.drawHTMLIcon('icon-mainmenu-multiplayer', 'icon_sword', 24);
  }

  // ----------------------------------------------------
  // UPDATE HUD STATS DISPLAY
  // ----------------------------------------------------
  _initHudElements() {
    if (this._hudEls) return;
    this._hudEls = {
      hpFill: document.getElementById('hud-hp-fill'),
      hpText: document.getElementById('hud-hp-text'),
      mpFill: document.getElementById('hud-mp-fill'),
      mpText: document.getElementById('hud-mp-text'),
      avatarCanvas: document.getElementById('hud-avatar-canvas'),
      levelText: document.getElementById('hud-level-text'),
      xpFill: document.getElementById('hud-xp-fill'),
      bottomXpFill: document.getElementById('hud-bottom-xp-fill'),
      bottomXpText: document.getElementById('hud-bottom-xp-text'),
      waveStatus: document.getElementById('hud-wave-status'),
      waveTitle: document.getElementById('hud-wave-title'),
      waveTimer: document.getElementById('hud-wave-timer'),
      enemiesLeft: document.getElementById('hud-enemies-left'),
      shards: document.getElementById('hud-shards-value'),
      keys: document.getElementById('hud-keys-value'),
      ap: document.getElementById('hud-ap-value'),
      slot6: document.getElementById('spell-slot-6'),
      slot7: document.getElementById('spell-slot-7'),
      invContainer: document.getElementById('inventory-container'),
      bottomXpBar: document.getElementById('hud-bottom-xp-bar'),
    };
  }

  updateHUD() {
    if (this.state !== 'PLAYING') return;
    this._initHudElements();
    const els = this._hudEls;

    if (!this._hudCache) {
      this._hudCache = {
        hp: -1, maxHp: -1,
        mp: -1, maxMp: -1,
        level: -1,
        xp: -1, xpNeeded: -1,
        wave: -1,
        waveTimerSec: -1,
        enemiesCount: -1,
        shards: -1,
        keys: -1,
        ap: -1,
        maxSpellSlots: -1,
        isWaveHidden: null,
        avatarFrame: -1,
        runesStr: '',
        cooldowns: {},
        spellSlots: {},
      };
    }

    // HP / Mana values
    const hp = Math.ceil(this.player.hp);
    const maxHp = this.player.getMaxHp();
    if (this._hudCache.hp !== hp || this._hudCache.maxHp !== maxHp) {
      this._hudCache.hp = hp;
      this._hudCache.maxHp = maxHp;
      const hpPct = (hp / maxHp) * 100;
      if (els.hpFill) els.hpFill.style.width = `${hpPct}%`;
      if (els.hpText) els.hpText.innerText = `${hp} / ${maxHp}`;
    }

    const mp = Math.ceil(this.player.mp);
    const maxMp = this.player.getMaxMp();
    if (this._hudCache.mp !== mp || this._hudCache.maxMp !== maxMp) {
      this._hudCache.mp = mp;
      this._hudCache.maxMp = maxMp;
      const mpPct = (mp / maxMp) * 100;
      if (els.mpFill) els.mpFill.style.width = `${mpPct}%`;
      if (els.mpText) els.mpText.innerText = `${mp} / ${maxMp}`;
    }

    // Draw animated avatar in HUD
    const avatarFrame = Math.floor(this.frameIndex * 4) % 3;
    if (this._hudCache.avatarFrame !== avatarFrame) {
      this._hudCache.avatarFrame = avatarFrame;
      if (els.avatarCanvas) {
        const actx = els.avatarCanvas.getContext('2d');
        actx.clearRect(0, 0, els.avatarCanvas.width, els.avatarCanvas.height);
        actx.imageSmoothingEnabled = false;
        this.assets.draw(actx, 'player', els.avatarCanvas.width / 2, els.avatarCanvas.height / 2 + 1, 36, avatarFrame, 0, 1.0);
      }
    }

    // Level & XP
    const level = this.player.level;
    const xp = Math.ceil(this.player.xp);
    const xpNeeded = this.player.xpNeeded;
    const xpPct = (xp / xpNeeded) * 100;
    if (this._hudCache.level !== level) {
      this._hudCache.level = level;
      if (els.levelText) els.levelText.innerText = `Lvl ${level}`;
    }
    if (this._hudCache.xp !== xp || this._hudCache.xpNeeded !== xpNeeded) {
      this._hudCache.xp = xp;
      this._hudCache.xpNeeded = xpNeeded;
      if (els.xpFill) els.xpFill.style.width = `${xpPct}%`;
      if (els.bottomXpFill) els.bottomXpFill.style.width = `${xpPct}%`;
      if (els.bottomXpText) els.bottomXpText.innerText = `XP: ${xp} / ${xpNeeded}`;
    }

    // Wave countdown timer formatting
    const isWaveHidden = !!(this.isStoryMode || this.isTutorial);
    if (this._hudCache.isWaveHidden !== isWaveHidden) {
      this._hudCache.isWaveHidden = isWaveHidden;
      if (els.waveStatus) {
        els.waveStatus.classList.toggle('hidden', isWaveHidden);
      }
    }

    const wave = this.levelManager.wave;
    if (this._hudCache.wave !== wave) {
      this._hudCache.wave = wave;
      if (els.waveTitle) els.waveTitle.innerText = `WAVE ${wave}`;
    }

    const waveTimerSec = Math.floor(this.levelManager.waveTimer);
    if (this._hudCache.waveTimerSec !== waveTimerSec) {
      this._hudCache.waveTimerSec = waveTimerSec;
      const min = Math.floor(waveTimerSec / 60);
      const sec = Math.floor(waveTimerSec % 60);
      if (els.waveTimer) {
        els.waveTimer.innerText = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        els.waveTimer.classList.toggle('pulse-red', waveTimerSec <= 5);
      }
    }

    const enemiesCount = this.enemies.length;
    if (this._hudCache.enemiesCount !== enemiesCount) {
      this._hudCache.enemiesCount = enemiesCount;
      if (els.enemiesLeft) els.enemiesLeft.innerText = `Enemies: ${enemiesCount}`;
    }

    // Shards, Keys and Ability Points indicators
    const shards = this.player.shards;
    if (this._hudCache.shards !== shards) {
      this._hudCache.shards = shards;
      if (els.shards) els.shards.innerText = shards;
    }

    const keys = this.player.keys || 0;
    if (this._hudCache.keys !== keys) {
      this._hudCache.keys = keys;
      if (els.keys) els.keys.innerText = keys;
    }
    
    const ap = this.player.ap;
    if (this._hudCache.ap !== ap) {
      this._hudCache.ap = ap;
      if (els.ap) els.ap.innerText = ap;
    }

    // Show/hide extra slots based on maxSpellSlots
    const maxSpellSlots = this.player.maxSpellSlots;
    if (this._hudCache.maxSpellSlots !== maxSpellSlots) {
      this._hudCache.maxSpellSlots = maxSpellSlots;
      if (els.slot6) els.slot6.classList.toggle('hidden', maxSpellSlots < 6);
      if (els.slot7) els.slot7.classList.toggle('hidden', maxSpellSlots < 7);
    }

    // Hotbar Quickslots setup
    const spellSlotsMapping = [
      { element: 'primary',   id: 1, key: 'LMB'   },
      { element: 'secondary', id: 2, key: 'RMB'   },
      { element: 'utility',   id: 3, key: 'Space' },
      { element: 'ultimate',  id: 4, key: 'Q'     },
      { element: 'extra',     id: 5, key: 'E'     },
      { element: 'slot6',     id: 6, key: '1'     },
      { element: 'slot7',     id: 7, key: '2'     },
    ];

    spellSlotsMapping.forEach((slot) => {
      const spellId = this.player.spellSlots[slot.element];
      const slotEl = document.getElementById(`spell-slot-${slot.id}`);
      const canvas = document.getElementById(`spell-icon-${slot.id}`);
      const tooltip = slotEl ? slotEl.querySelector('.tooltip') : null;
      const cdOverlay = document.getElementById(`cooldown-${slot.id}`);

      if (this._hudCache.spellSlots[slot.element] !== spellId) {
        this._hudCache.spellSlots[slot.element] = spellId;
        if (slotEl && canvas && tooltip) {
          if (spellId) {
            slotEl.classList.remove('locked');
            slotEl.className = `spell-slot ${SpellBook[spellId].element}`; // add color class fire/frost/lightning
            
            // Draw icon onto canvas
            const iconCtx = canvas.getContext('2d');
            iconCtx.clearRect(0, 0, 32, 32);
            this.assets.draw(iconCtx, `icon_${spellId}`, 16, 16, 32);
            
            // Populate tooltips
            const spell = SpellBook[spellId];
            tooltip.innerHTML = `<strong>${spell.name}</strong><br>Mana: ${spell.manaCost}<br>${spell.description}`;
          } else {
            slotEl.className = 'spell-slot locked';
            const iconCtx = canvas.getContext('2d');
            iconCtx.clearRect(0, 0, 32, 32);
            tooltip.innerText = 'Spell slot locked. Research nodes in the Runic Web to equip magic.';
          }
        }
      }

      if (spellId && cdOverlay) {
        const activeCD = this.player.spellCooldowns[slot.element];
        const maxCD = this.player.getSpellCooldown(spellId);
        let cdPct = 0;
        if (activeCD > 0 && maxCD > 0) {
          cdPct = Math.round((activeCD / maxCD) * 100);
        }
        const cacheKey = `cooldown_${slot.element}`;
        if (this._hudCache.cooldowns[cacheKey] !== cdPct) {
          this._hudCache.cooldowns[cacheKey] = cdPct;
          cdOverlay.style.height = `${cdPct}%`;
        }
      } else if (cdOverlay) {
        if (this._hudCache.cooldowns[`cooldown_${slot.element}`] !== 0) {
          this._hudCache.cooldowns[`cooldown_${slot.element}`] = 0;
          cdOverlay.style.height = '0%';
        }
      }
    });

    // Render HUD rune strip — shows equipped runes
    const invContainer = els.invContainer;
    if (invContainer) {
      const runes = this.player.equippedRunes || [];
      const maxSlots = this.player.maxRuneSlots || 6;
      const runesStr = runes.map(r => r ? r.id || r.name : 'empty').join(',') + `_max_${maxSlots}`;
      if (this._hudCache.runesStr !== runesStr) {
        this._hudCache.runesStr = runesStr;
        const currentSlotCount = invContainer.querySelectorAll('.inv-slot').length;
        if (currentSlotCount !== maxSlots) {
          invContainer.innerHTML = '';
          for (let i = 0; i < maxSlots; i++) {
            invContainer.innerHTML += `<div class="inv-slot empty" id="inv-slot-${i+1}">
              <canvas class="inv-slot-canvas" id="inv-canvas-${i+1}" width="16" height="16"></canvas>
              <div class="tooltip" id="tooltip-inv-${i+1}">Empty Rune Slot</div>
            </div>`;
          }
        }
        for (let i = 0; i < maxSlots; i++) {
          const rune    = runes[i];
          const slotEl  = document.getElementById(`inv-slot-${i+1}`);
          const canvas  = document.getElementById(`inv-canvas-${i+1}`);
          const tooltip = document.getElementById(`tooltip-inv-${i+1}`);
          if (!slotEl || !canvas || !tooltip) continue;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (rune) {
            slotEl.classList.remove('empty');
            ctx.imageSmoothingEnabled = false;
            this.assets.draw(ctx, rune.sprite, canvas.width / 2, canvas.height / 2, canvas.width);
            tooltip.innerHTML = `<strong style="color:${rune.rarityColor || '#ffffff'}">${rune.name}</strong><br>${rune.desc}`;
          } else {
            slotEl.classList.add('empty');
            tooltip.innerHTML = 'Empty Rune Slot';
          }
        }
      }
    }

    // Bottom visual XP bar
    if (els.bottomXpBar) {
      if (this._hudCache.bottomXpBarShown !== true) {
        this._hudCache.bottomXpBarShown = true;
        els.bottomXpBar.classList.remove('hidden');
      }
    }
  }

  // ----------------------------------------------------
  // THE GAME LOOP
  // ----------------------------------------------------
  loop(time) {
    // Time delta step
    let dt = (time - this.lastTime) / 1000.0;
    this.lastTime = time;

    // Track FPS history
    const currentFps = dt > 0 ? Math.round(1 / dt) : 60;
    if (!this._fpsHistory) this._fpsHistory = [];
    this._fpsHistory.push(currentFps);
    if (this._fpsHistory.length > 60) this._fpsHistory.shift();

    // Prevent huge jumps when tabbing out
    if (dt > 0.1) dt = 0.1;
    this.frameIndex += dt;

    if (this.twitchManager) {
      this.twitchManager.update(dt);
    }

    if (this.state === 'SHOP') {
      this.updateShopVoteUI();
      const statusLbl = document.getElementById('shop-twitch-vote-status');
      const waitingMsg = document.getElementById('twitch-vote-waiting-msg');
      if (this.twitchManager && this.twitchManager.enabled !== false && this.twitchManager.connected && this.twitchManager.voteActive) {
        if (statusLbl) {
          statusLbl.style.display = 'block';
          statusLbl.innerText = `TWITCH VOTE ACTIVE... (${Math.ceil(this.twitchManager.voteTimer)}s remaining)`;
        }
        if (this.waitingForVoteToStartNextWave && waitingMsg) {
          waitingMsg.style.display = 'block';
          waitingMsg.innerText = `Waiting for Twitch vote to finish... (${Math.ceil(this.twitchManager.voteTimer)}s remaining)`;
        }
      } else {
        if (statusLbl) statusLbl.style.display = 'none';
        if (waitingMsg) waitingMsg.style.display = 'none';
      }
    }

    // Enforce tutorial guide visibility every frame — 
    // the guide can ONLY be visible when isTutorial is true
    const tutorialGuide = document.getElementById('tutorial-guide');
    if (tutorialGuide) {
      tutorialGuide.classList.toggle('hidden', !this.isTutorial);
    }

    if (this.state === 'PLAYING') {
      // Update music based on region theme and boss status (throttled)
      if (this.audio && this.audio.initialized) {
        this._musicCheckTimer = (this._musicCheckTimer || 0) + dt;
        if (this._musicCheckTimer >= 1.0) {
          this._musicCheckTimer = 0;
          const isBoss = this.enemies && this.enemies.some(e => e.type === 'archon' || e.type === 'volcanic_titan' || e.type === 'void_behemoth');
          const theme = this.levelManager ? this.levelManager.theme : 'dungeon';
          this.audio.updateMusicForTheme(theme, isBoss);
        }
      }

      this.update(dt);
      if (this.isTutorial) {
        this.updateTutorial(dt);
      }
      this.draw();
    } else if (this.state === 'MENU' || this.state === 'PLAY_MENU' || this.state === 'CREDITS' || this.state === 'CONTACT') {
      this.drawMenuPlayer('main-menu-player-canvas');
    } else if (this.state === 'CUSTOMIZE') {
      const presets = [
        { name: 'Aether Blue', hue: 0 },
        { name: 'Void Purple', hue: 50 },
        { name: 'Pyro Red', hue: 135 },
        { name: 'Chrono Orange', hue: 175 },
        { name: 'Verdant Green', hue: 255 },
        { name: 'Frost Cyan', hue: 315 }
      ];
      const selectedHue = presets[this.customPresetIdx || 0]?.hue || 0;
      this.drawMenuPlayer('customize-player-canvas', selectedHue);
    } else if (this.state === 'SHOP') {
      this.draw();
    } else if (this.state === 'UPGRADE_TREE') {
      this.abilityTree.draw(this.treeCanvas, this.treeCtx);
    } else if (this.state === 'WORLD_MAP') {
      this.drawWorldmap();
    } else if (this.state === 'INVENTORY') {
      this.drawInventoryPlayer();
      if (this.isTutorial) {
        this.updateTutorial(dt);
      }
    }

    if (this.isLocalDev && this.devtoolsVisible) {
      this.updateDevtoolsPanel();
    }
    
    requestAnimationFrame((t) => this.loop(t));
  }

  // ----------------------------------------------------
  // ENTITY UPDATES
  // ----------------------------------------------------
  update(dt) {
    this.frameCount++;
    this.pathfindsThisFrame = 0;

    // If host, process queued remote inputs and update remote player placeholders
    if (this.multiplayer && this.multiplayer.isHost && this._remoteInputQueue && this._remoteInputQueue.length) {
      const items = this._remoteInputQueue.splice(0, this._remoteInputQueue.length);
      for (const it of items) {
        const peerId = it.peerId;
        const inp = it.inp;
        if (!inp || !peerId) continue;
        if (inp.type === 'mouse') {
          // Convert client canvas coords to world coords
          const cx = inp.x || 0;
          const cy = inp.y || 0;
          const worldX = (cx - (this.canvas.width / 2)) / this.gameZoom + (this.canvas.width / 2) + this.camera.x;
          const worldY = (cy - (this.canvas.height / 2)) / this.gameZoom + (this.canvas.height / 2) + this.camera.y;
          const prev = this.remotePlayers.get(peerId) || {};
          this.remotePlayers.set(peerId, { x: worldX, y: worldY, hp: prev.hp || null, lastSeen: Date.now() });
        } else if (inp.type === 'key') {
          // Simple tracking: record last key for peer
          const prev = this.remotePlayers.get(peerId) || {};
          prev.lastKey = inp.key;
          prev.lastKeyDown = !!inp.down;
          prev.lastSeen = Date.now();
          this.remotePlayers.set(peerId, prev);
        }
      }
    }
    // Check Chrono Shift speed dilation (Slows enemies/projectiles by 80%)
    let enemyDt = dt;
    if (this.timeDilationTimer > 0) {
      this.timeDilationTimer -= dt;
      enemyDt = dt * 0.20; // slow down updates
      
      // Spawn timeline warp particles
      if (Math.random() < 0.25) {
        this.particles.spawn(Math.random() * this.canvas.width + this.camera.x, Math.random() * this.canvas.height + this.camera.y, {
          vx: 0, vy: 10,
          color: '#ff9f43',
          size: 1.5,
          life: 0.8,
          friction: 1.0
        });
      }
    }

    // Screen Shake decay
    if (this.screenShake > 0) {
      this.screenShake *= 0.9;
      if (this.screenShake < 0.1) this.screenShake = 0;
    }

    // Update Player controller
    let targetVx = 0;
    let targetVy = 0;
    if (this.keys[this.keybinds.move_up] || this.keys['arrowup']) targetVy -= 1;
    if (this.keys[this.keybinds.move_down] || this.keys['arrowdown']) targetVy += 1;
    if (this.keys[this.keybinds.move_left] || this.keys['arrowleft']) targetVx -= 1;
    if (this.keys[this.keybinds.move_right] || this.keys['arrowright']) targetVx += 1;
    
    // Normalize diagonal velocity vectors
    if (targetVx !== 0 && targetVy !== 0) {
      const len = Math.hypot(targetVx, targetVy);
      targetVx /= len;
      targetVy /= len;
    }

    // Slippery physics in Void Rift theme
    if (this.levelManager && this.levelManager.theme === 'void_rift') {
      const lerpSpeed = (targetVx === 0 && targetVy === 0) ? 2.5 * dt : 5.0 * dt;
      this.player.vx += (targetVx - this.player.vx) * Math.min(1, lerpSpeed);
      this.player.vy += (targetVy - this.player.vy) * Math.min(1, lerpSpeed);
    } else {
      this.player.vx = targetVx;
      this.player.vy = targetVy;
    }

    this.player.update(dt);

    // Auto cast primary/secondary mouse spells on hold
    const worldMouse = this.getWorldMouse();
    const targetAngle = Math.atan2(
      worldMouse.y - this.player.y,
      worldMouse.x - this.player.x
    );

    if (this.isLeftMouseDown) this.player.castSpell('primary', targetAngle);
    if (this.isRightMouseDown) this.player.castSpell('secondary', targetAngle);

    // Smooth Camera Follow
    const cameraSpeed = 0.08;
    const targetCamX = this.player.x - this.canvas.width / 2;
    const targetCamY = this.player.y - this.canvas.height / 2;
    this.camera.x += (targetCamX - this.camera.x) * cameraSpeed;
    this.camera.y += (targetCamY - this.camera.y) * cameraSpeed;

    // Bound Camera inside Level borders
    this.camera.x = Math.max(0, Math.min(this.levelManager.width - this.canvas.width, this.camera.x));
    this.camera.y = Math.max(0, Math.min(this.levelManager.height - this.canvas.height, this.camera.y));

    // Update Level waves and events
    this.levelManager.update(dt);

    // Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.life -= dt;
      
      // Update coordinates
      // Projectiles are slowed during Chrono Dilation if enemy-owned
      const projDt = proj.isPlayerOwned ? dt : enemyDt;
      proj.x += proj.vx * projDt;
      proj.y += proj.vy * projDt;

      // Update trail history
      if (this.showSpellTrails) {
        if (!proj.trail) proj.trail = [];
        proj.trail.unshift({ x: proj.x, y: proj.y });
        if (proj.trail.length > 12) proj.trail.pop();
      }

      // Blizzard Orb continuous shards emission
      if (proj.id === 'blizzard_orb') {
        proj.shootTimer += projDt;
        if (proj.shootTimer >= 0.2) {
          proj.shootTimer = 0;
          
          let nearest = null;
          let minDist = 150;
          this.enemies.forEach((enemy) => {
            if (enemy.isInTallGrass()) return;
            const dist = Math.hypot(enemy.x - proj.x, enemy.y - proj.y);
            if (dist < minDist) {
              minDist = dist;
              nearest = enemy;
            }
          });
          
          if (nearest) {
            const angle = Math.atan2(nearest.y - proj.y, nearest.x - proj.x);
            this.projectiles.push({
              x: proj.x,
              y: proj.y,
              vx: Math.cos(angle) * 300,
              vy: Math.sin(angle) * 300,
              damage: Math.round(proj.damage * 0.75),
              radius: 4,
              element: SPELL_TYPES.FROST,
              spriteKey: 'proj_frost_spike',
              isPlayerOwned: true,
              life: 1.5,
              id: 'blizzard_shard',
              trail: []
            });
          }
        }
      }

      // Region specific projectile mechanics
      const projSx = Math.max(0, Math.min(this.levelManager.maxSectorCols - 1, Math.floor(proj.x / 2000)));
      const projSy = Math.max(0, Math.min(this.levelManager.maxSectorRows - 1, Math.floor(proj.y / 2000)));
      const projTheme = (this.levelManager.sectorThemes && this.levelManager.sectorThemes[`${projSx},${projSy}`]) || 'dungeon';
      
      let projDestroyed = false;
      if (projTheme === 'pool') {
        if (proj.element === SPELL_TYPES.FIRE) {
          // Extinguish fireballs to steam
          this.spawnAreaEffect(proj.x, proj.y, 45, 'steam_cloud', 1.5);
          if (this.audio) this.audio.playClick();
          for (let p = 0; p < 8; p++) {
            this.particles.spawn(proj.x, proj.y, {
              vx: (Math.random() - 0.5) * 40,
              vy: (Math.random() - 0.5) * 40,
              color: '#f5f6fa',
              size: Math.random() * 5 + 3,
              life: 0.6,
              glow: false
            });
          }
          this.projectiles.splice(i, 1);
          projDestroyed = true;
        } else if (proj.element === SPELL_TYPES.FROST) {
          // Frost leaves ice trail
          if (Math.random() < 0.15) {
            this.spawnAreaEffect(proj.x, proj.y, 25, 'ice_trail', 2.0);
          }
        }
      } else if (projTheme === 'gardens' && proj.element === SPELL_TYPES.FIRE) {
        // Fire ignites tall grass
        const tx = Math.floor(proj.x / 40);
        const ty = Math.floor(proj.y / 40);
        if (tx >= 0 && tx < this.levelManager.tileWidth && ty >= 0 && ty < this.levelManager.tileHeight) {
          const hash = (tx * 17 + ty * 31) % 100;
          if (hash >= 50 && hash < 75) {
            this.spawnAreaEffect(tx * 40 + 20, ty * 40 + 20, 30, 'fire_pool', 2.0);
          }
        }
      }

      if (projDestroyed) continue;

      // Check level obstacles collisions
      let hitObstacle = false;
      this.levelManager.obstacles.forEach((obs) => {
        const dist = Math.hypot(proj.x - obs.x, proj.y - obs.y);
        if (dist <= proj.radius + obs.radius) {
          hitObstacle = true;
          
          // Explode barrel
          if (obs.type === 'explosive_barrel') {
            this.triggerExplosiveBarrel(obs);
          }
        }
      });

      const insideLevel = proj.x >= 0 && proj.x <= this.levelManager.width &&
                          proj.y >= 0 && proj.y <= this.levelManager.height;

      if (proj.life <= 0 || hitObstacle || !insideLevel) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check entity collisions
      if (proj.isPlayerOwned) {
        // Player spell vs Enemies
        for (let e = 0; e < this.enemies.length; e++) {
          const enemy = this.enemies[e];
          if (enemy.dead) continue;
          const dist = Math.hypot(proj.x - enemy.x, proj.y - enemy.y);
          
          if (dist <= proj.radius + enemy.radius) {
            // Check if projectile has already hit this enemy
            if (!proj.hitEnemies) proj.hitEnemies = new Set();
            if (proj.hitEnemies.has(enemy)) {
              continue;
            }
            proj.hitEnemies.add(enemy);

            // Apply damage & statuses combos
            const isCrit = Math.random() < this.player.modifiers.critChance;
            const finalDmg = isCrit ? Math.round(proj.damage * 2) : proj.damage;
            
            // Check elemental status combos
            processCombo(enemy, proj.element, this);
            
            if (proj.element === 'fire') {
              this.player.fireDamageDealt = (this.player.fireDamageDealt || 0) + finalDmg;
              if (this.player.fireDamageDealt >= 1000) {
                this.unlockAchievement('pyromancer');
              }
            }
            
            enemy.takeDamage(finalDmg, isCrit, this);
            enemy.applyKnockback(proj.vx * 0.25, proj.vy * 0.25);

            // Tesla Bolt Chain Lightning jumps
            if (proj.id === 'tesla_bolt') {
              const jumps = 3 + (this.player.modifiers.teslaJumps || 0);
              this.triggerChainLightning(enemy.x, enemy.y, proj.damage, jumps, 120);
              if (this.audio) this.audio.playLightning();
              if (this.player.modifiers.teslaManaGain > 0) {
                this.player.mp = Math.min(this.player.getMaxMp(), this.player.mp + this.player.modifiers.teslaManaGain);
              }
            }

            // Storm Call chain hit SFX
            if (proj.element === SPELL_TYPES.LIGHTNING && proj.id === 'wisp_shot') {
              // wisp shots are silent individually to avoid spam
            } else if (proj.element === SPELL_TYPES.LIGHTNING) {
              if (this.audio) this.audio.playLightning();
            }

            // Frost hit SFX
            if (proj.element === SPELL_TYPES.FROST && Math.random() < 0.4) {
              if (this.audio) this.audio.playFreeze();
            }

            // Fireball Explosion Keystone modifier
            if (proj.element === SPELL_TYPES.FIRE && this.player.modifiers.fireballExplode) {
              this.spawnAreaEffect(enemy.x, enemy.y, 60, 'fireball_burst', 0.1);
              this.particles.createExplosion(enemy.x, enemy.y, '#ffa502', 12, 100, 3);
              if (this.audio) this.audio.playExplosion();
            }

            // Absolute Zero keystone: Ice Nova fully freezes instead of chills
            if (proj.id === 'ice_nova_shard' && this.player.modifiers.iceNovaFreeze) {
              enemy.applyStatus(SPELL_TYPES.FROST, 3.0); // hard freeze
              this.particles.createExplosion(enemy.x, enemy.y, '#7ed6df', 6, 40, 1.5);
            }

            // Shadow Blink keystone: explosion does double damage (handled in spell cast, flag used there)
            // timeWarpHaste keystone: handled in spell cast

            // Piercing Frost Spike, Blizzard Orb, and Ice Nova check
            const isPiercing = this.player.modifiers.frostPierce
              || proj.id === 'blizzard_orb'
              || proj.id === 'ice_nova_shard';
            if (proj.element === SPELL_TYPES.FROST && isPiercing) {
              // Pierce: do not destroy, reduce life to limit total hits
              proj.life -= 0.3;
            } else {
              this.projectiles.splice(i, 1);
              break;
            }
          }
        }
      } else {
        // Enemy projectile vs Player
        const dist = Math.hypot(proj.x - this.player.x, proj.y - this.player.y);
        if (dist <= proj.radius + this.player.radius) {
          if (this.player.iframeTimer > 0) {
            // Deflect enemy projectiles during active dash frames
            this.projectiles.splice(i, 1);
            this.particles.createExplosion(proj.x, proj.y, '#ff9f43', 6, 60, 1.5);
            this.particles.spawnText(proj.x, proj.y - 12, "DEFLECTED", {
              color: '#ff9f43',
              fontSize: 8,
              fontPixel: true,
              life: 0.6
            });
          } else {
            this.player.takeDamage(proj.damage, this);
            this.projectiles.splice(i, 1);
          }
        }
      }
    }

    // Update Area Effects (Singularities, Steam clouds, slow zones)
    for (let i = this.areaEffects.length - 1; i >= 0; i--) {
      const ae = this.areaEffects[i];
      ae.duration -= dt;
      if (ae.duration <= 0) {
        this.areaEffects.splice(i, 1);
        continue;
      }

      // Pool region mechanic: Fire pools extinguish to steam
      const aeSx = Math.max(0, Math.min(this.levelManager.maxSectorCols - 1, Math.floor(ae.x / 2000)));
      const aeSy = Math.max(0, Math.min(this.levelManager.maxSectorRows - 1, Math.floor(ae.y / 2000)));
      const aeTheme = (this.levelManager.sectorThemes && this.levelManager.sectorThemes[`${aeSx},${aeSy}`]) || 'dungeon';
      if (aeTheme === 'pool' && (ae.type === 'fire_pool' || ae.type === 'fireball_burst')) {
        ae.type = 'steam_cloud';
        ae.radius *= 1.25;
        // spawn steam particles
        for (let p = 0; p < 5; p++) {
          this.particles.spawn(ae.x + (Math.random() - 0.5) * ae.radius, ae.y + (Math.random() - 0.5) * ae.radius, {
            vx: (Math.random() - 0.5) * 15,
            vy: -15 - Math.random() * 15,
            color: '#f5f6fa',
            size: Math.random() * 6 + 4,
            life: 0.5,
            glow: false
          });
        }
      }

      // Ticks damage / status effects every 0.2s
      ae.tickTimer += dt;
      const isTick = ae.tickTimer >= 0.25;
      if (isTick) ae.tickTimer = 0;

      // Effect behaviors
      if (ae.type === 'singularity') {
        // Pull enemies into vortex center
        this.enemies.forEach((enemy) => {
          if (enemy.dead) return;
          const dx = ae.x - enemy.x;
          const dy = ae.y - enemy.y;
          const distSq = dx * dx + dy * dy;
          const radiusSq = ae.radius * ae.radius;
          if (distSq < radiusSq && distSq > 0.000001) {
            const dist = Math.sqrt(distSq);
            const pullForce = (1.0 - dist / ae.radius) * 160;
            const factor = pullForce * enemyDt / dist;
            enemy.x += dx * factor;
            enemy.y += dy * factor;
          }
        });

        // Pull player into vortex center
        const pDx = ae.x - this.player.x;
        const pDy = ae.y - this.player.y;
        const pDistSq = pDx * pDx + pDy * pDy;
        const radiusSq = ae.radius * ae.radius;
        if (pDistSq < radiusSq && pDistSq > 0.000001) {
          const pDist = Math.sqrt(pDistSq);
          const pullForce = (1.0 - pDist / ae.radius) * 70;
          const factor = pullForce * dt / pDist;
          this.player.x += pDx * factor;
          this.player.y += pDy * factor;
        }

        // Pull player fire projectiles and ignite singularity (Supernova Combo!)
        if (this.player.modifiers.supernovaEnabled) {
          const radiusSq = ae.radius * ae.radius;
          for (let p = this.projectiles.length - 1; p >= 0; p--) {
            const proj = this.projectiles[p];
            if (proj.isPlayerOwned && proj.element === SPELL_TYPES.FIRE) {
              const pdx = proj.x - ae.x;
              const pdy = proj.y - ae.y;
              if (pdx * pdx + pdy * pdy < radiusSq) {
                // Ignite Nova! Remove projectile
                this.projectiles.splice(p, 1);
                
                // Explode Singularity! Replace this area effect with a supernova blast
                this.areaEffects.splice(i, 1);
                this.triggerSupernova(ae.x, ae.y);
                break;
              }
            }
          }
        }

        // Singularity visual particles
        if (Math.random() < 0.7) {
          const pAngle = Math.random() * Math.PI * 2;
          const px = ae.x + Math.cos(pAngle) * ae.radius;
          const py = ae.y + Math.sin(pAngle) * ae.radius;
          this.particles.spawn(px, py, {
            vx: -Math.cos(pAngle) * 90,
            vy: -Math.sin(pAngle) * 90,
            color: '#a55eea',
            size: 2,
            life: 0.45,
            glow: true,
            shape: 'spark'
          });
        }
      } 
      
      else if (ae.type === 'steam_cloud') {
        if (isTick) {
          const radiusSq = ae.radius * ae.radius;
          this.enemies.forEach((enemy) => {
            if (enemy.dead) return;
            const edx = enemy.x - ae.x;
            const edy = enemy.y - ae.y;
            if (edx * edx + edy * edy <= radiusSq) enemy.takeDamage(5, false, this);
          });
        }
        
        // Steam steam particle loops
        if (Math.random() < 0.2) {
          this.particles.spawn(ae.x + (Math.random() - 0.5) * ae.radius, ae.y + (Math.random() - 0.5) * ae.radius, {
            vx: (Math.random() - 0.5) * 10,
            vy: -20 - Math.random() * 20,
            color: '#f5f6fa',
            size: Math.random() * 8 + 6,
            life: 0.5
          });
        }
      }

      else if (ae.type === 'fire_pool' || ae.type === 'fireball_burst') {
        if (isTick) {
          const radiusSq = ae.radius * ae.radius;
          this.enemies.forEach((enemy) => {
            if (enemy.dead) return;
            const edx = enemy.x - ae.x;
            const edy = enemy.y - ae.y;
            if (edx * edx + edy * edy <= radiusSq) {
              enemy.takeDamage(6, false, this);
              if (!enemy.dead) enemy.applyStatus(SPELL_TYPES.FIRE, 3.0);
            }
          });
        }
      }

      else if (ae.type === 'ice_trail') {
        const radiusSq = ae.radius * ae.radius;
        if (isTick) {
          this.enemies.forEach((enemy) => {
            if (enemy.dead) return;
            const edx = enemy.x - ae.x;
            const edy = enemy.y - ae.y;
            if (edx * edx + edy * edy <= radiusSq) {
              enemy.applyStatus(SPELL_TYPES.FROST, 1.5);
            }
          });
        }
        
        const pdx = this.player.x - ae.x;
        const pdy = this.player.y - ae.y;
        if (pdx * pdx + pdy * pdy <= radiusSq) {
          this.player.onIceTrail = true;
        }

        if (Math.random() < 0.1) {
          this.particles.spawn(ae.x + (Math.random() - 0.5) * ae.radius, ae.y + (Math.random() - 0.5) * ae.radius, {
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            color: '#b2fefb',
            size: Math.random() * 2 + 1,
            life: 0.35,
            glow: true,
            shape: 'spark'
          });
        }
      }

      else if (ae.type === 'chrono_slow') {
        // Slow down enemies in zone
        if (isTick) {
          const radiusSq = ae.radius * ae.radius;
          this.enemies.forEach((enemy) => {
            if (enemy.type !== 'warden' && !enemy.dead) {
              const edx = enemy.x - ae.x;
              const edy = enemy.y - ae.y;
              if (edx * edx + edy * edy <= radiusSq) {
                enemy.applyStatus(SPELL_TYPES.FROST, 0.45); // apply brief freezing slow
              }
            }
          });
        }
      }

      else if (ae.type === 'frost_slow') {
        // Slow down enemies in zone
        if (isTick) {
          const radiusSq = ae.radius * ae.radius;
          this.enemies.forEach((enemy) => {
            if (!enemy.dead) {
              const edx = enemy.x - ae.x;
              const edy = enemy.y - ae.y;
              if (edx * edx + edy * edy <= radiusSq) {
                enemy.applyStatus(SPELL_TYPES.FROST, 0.45);
              }
            }
          });
        }

        // Spawn some frost particles on floor
        if (Math.random() < 0.15) {
          this.particles.spawn(ae.x + (Math.random() - 0.5) * ae.radius * 1.5, ae.y + (Math.random() - 0.5) * ae.radius * 1.5, {
            vx: 0,
            vy: (Math.random() - 0.5) * 5,
            color: '#7ed6df',
            size: Math.random() * 2 + 1,
            life: 0.4
          });
        }
      }
    }

    // Update Enemies AI — skip enemies already marked dead this frame
    for (let i = 0; i < this.enemies.length; i++) {
      if (!this.enemies[i].dead) {
        this.enemies[i].update(enemyDt, this.player);
      }
    }

    // Resolve pushing/bumping between active enemies in O(N^2 / 2) pairs check (no duplicate checks)
    for (let i = 0; i < this.enemies.length; i++) {
      const e1 = this.enemies[i];
      if (e1.dead) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const e2 = this.enemies[j];
        if (e2.dead) continue;
        const bdx = e1.x - e2.x;
        const bdy = e1.y - e2.y;
        const distSq = bdx * bdx + bdy * bdy;
        const minDist = e1.radius + e2.radius;
        const minDistSq = minDist * minDist;
        if (distSq < minDistSq && distSq > 0.0001) {
          const bdist = Math.sqrt(distSq);
          const push = (minDist - bdist) * 0.5;
          const factor = push / bdist;
          const px = bdx * factor;
          const py = bdy * factor;
          e1.x += px;
          e1.y += py;
          e2.x -= px;
          e2.y -= py;
        }
      }
    }

    // Update Companions (unlocked via AbilityTree)
    if (!this.companions) this.companions = [];
    if (this.player.unlockedCompanion1 && !this.companions.some(c => c.type === 1)) {
      this.companions.push(new Companion(this, 1, this.player));
    }
    if (this.player.unlockedCompanion2 && !this.companions.some(c => c.type === 2)) {
      this.companions.push(new Companion(this, 2, this.player));
    }
    if (!this.player.unlockedCompanion1 && this.companions.some(c => c.type === 1)) {
      this.companions = this.companions.filter(c => c.type !== 1);
    }
    if (!this.player.unlockedCompanion2 && this.companions.some(c => c.type === 2)) {
      this.companions = this.companions.filter(c => c.type !== 2);
    }
    this.companions.forEach(comp => comp.update(dt));

    // Flush dead enemies + process pending spawns in one safe batch
    this.flushDeadEnemies();

    // Update Loot Items & Magnets
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      
      // Decay explosion velocity forces
      item.vx *= item.friction;
      item.vy *= item.friction;
      item.x += item.vx * dt;
      item.y += item.vy * dt;

      // Magnet pull to player if close
      const dist = Math.hypot(this.player.x - item.x, this.player.y - item.y);
      const pullRange = 120;
      
      if (dist <= pullRange) {
        const pullSpeed = (1.0 - dist / pullRange) * 220 + 60;
        item.x += ((this.player.x - item.x) / dist) * pullSpeed * dt;
        item.y += ((this.player.y - item.y) / dist) * pullSpeed * dt;
      }

      // Collect item check
      if (dist < this.player.radius + item.radius) {
        let collected = true;
        if (item.type === 'shard') {
          this.player.gainXp(item.value); // shard value is xp amount
          // Apply rebirth shard bonus
          const shardBonus = 1 + (this.player.rebirthBonuses.shardGain || 0);
          this.player.shards += Math.floor(shardBonus);
          if (Math.random() < (shardBonus % 1)) this.player.shards += 1; // fractional bonus
          if (this.audio) this.audio.playCollect();
        } else if (item.type === 'hp') {
          this.player.hp = Math.min(this.player.getMaxHp(), this.player.hp + item.value);
          this.particles.spawnText(this.player.x, this.player.y - 20, `+${item.value} HP`, {
            color: '#ff4757',
            fontSize: 10,
            fontPixel: true
          });
        } else if (item.type === 'mp') {
          this.player.mp = Math.min(this.player.getMaxMp(), this.player.mp + item.value);
          this.particles.spawnText(this.player.x, this.player.y - 20, `+${item.value} MP`, {
            color: '#1e90ff',
            fontSize: 10,
            fontPixel: true
          });
        } else if (item.type === 'relic') {
          const relicData = item.value;
          const isGear = !!relicData.type; // gear has a slot type ('weapon','helmet', etc.)
          if (isGear) {
            this.player.gearStorage.push(relicData);
            this.particles.spawnText(this.player.x, this.player.y - 20, `GEAR: ${relicData.name}`, {
              color: '#eccc68', fontSize: 10, fontPixel: true
            });
          } else {
            this.player.runeStorage.push(relicData);
            this.particles.spawnText(this.player.x, this.player.y - 20, `RUNE: ${relicData.name}`, {
              color: '#a55eea', fontSize: 10, fontPixel: true
            });
          }
          this.player.recalculateModifiers(this.abilityTree);
          this.player.saveGameState();
          this.particles.createExplosion(item.x, item.y, isGear ? '#eccc68' : '#a55eea', 8, 80, 2.5);
        }
        
        if (collected) {
          if (item.type !== 'relic') {
            this.particles.createExplosion(item.x, item.y, '#eccc68', 6, 60, 2);
          }
          this.items.splice(i, 1);
        }
      }
    }

    // Update Particles
    this.particles.update(dt);

    // Keep HUD synchronized (throttled — DOM writes don't need 60fps)
    this._hudTimer = (this._hudTimer || 0) + dt;
    if (this._hudTimer >= 0.05) {
      this._hudTimer = 0;
      this.updateHUD();
    }
  }

  // ----------------------------------------------------
  // SPECIAL COMBO DYNAMICS TRIGGERS
  // ----------------------------------------------------
  triggerSupernova(x, y) {
    this.screenShake = 20;
    if (this.audio) this.audio.playExplosion();
    this.uiNotifyCombo("SUPERNOVA SINGULARITY!", "supernova");

    // Spawn massive fiery shockwave
    this.spawnAreaEffect(x, y, 180, 'fire_pool', 2.5);

    // Apply high burst critical damage to enemies caught in blast
    this.enemies.forEach((enemy) => {
      if (enemy.dead) return;
      const dist = Math.hypot(enemy.x - x, enemy.y - y);
      if (dist <= 180) {
        enemy.takeDamage(100, true, this);
        if (!enemy.dead) {
          const angle = Math.atan2(enemy.y - y, enemy.x - x);
          enemy.applyKnockback(Math.cos(angle) * 350, Math.sin(angle) * 350);
        }
      }
    });

    // Spawn rich fire particles
    const particleCount = 40;
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 220;
      this.particles.spawn(x, y, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: '#ffa502',
        size: Math.random() * 6 + 4,
        life: 0.6 + Math.random() * 0.4,
        friction: 0.92,
        glow: true
      });
    }
  }

  triggerExplosiveBarrel(obs) {
    const idx = this.levelManager.obstacles.indexOf(obs);
    if (idx !== -1) {
      this.levelManager.obstacles.splice(idx, 1);
    }
    if (this.levelManager.allObstacles) {
      const idxAll = this.levelManager.allObstacles.indexOf(obs);
      if (idxAll !== -1) {
        this.levelManager.allObstacles.splice(idxAll, 1);
      }
    }
    if (this.levelManager.fullExplosiveBarrels) {
      const idxFull = this.levelManager.fullExplosiveBarrels.indexOf(obs);
      if (idxFull !== -1) {
        this.levelManager.fullExplosiveBarrels.splice(idxFull, 1);
      }
    }

    this.screenShake = 15;
    if (this.audio) this.audio.playExplosion();
    this.particles.createExplosion(obs.x, obs.y, '#ff6348', 25, 200, 5);

    // Blast radius damage
    const radius = 100;
    
    // Player damage check
    const pdist = Math.hypot(this.player.x - obs.x, this.player.y - obs.y);
    if (pdist <= radius) {
      this.player.takeDamage(25, this);
    }

    // Enemy damage check
    this.enemies.forEach((enemy) => {
      if (enemy.dead) return;
      const dist = Math.hypot(enemy.x - obs.x, enemy.y - obs.y);
      if (dist <= radius) {
        enemy.takeDamage(80, true, this);
        if (!enemy.dead) {
          enemy.applyStatus(SPELL_TYPES.FIRE, 4.0);
          const angle = Math.atan2(enemy.y - obs.y, enemy.x - obs.x);
          enemy.applyKnockback(Math.cos(angle) * 200, Math.sin(angle) * 200);
        }
      }
    });
  }

  // ----------------------------------------------------
  // DRAW CORE COORDINATES
  // ----------------------------------------------------
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.ctx.save();

    // Center zoom viewport transformation
    if (this.gameZoom !== 1.0) {
      const cx = this.canvas.width / 2;
      const cy = this.canvas.height / 2;
      this.ctx.translate(cx, cy);
      this.ctx.scale(this.gameZoom, this.gameZoom);
      this.ctx.translate(-cx, -cy);
    }
    
    // Apply camera shake translation
    if (this.screenShake > 0 && this.enableScreenShake) {
      const dx = (Math.random() - 0.5) * this.screenShake;
      const dy = (Math.random() - 0.5) * this.screenShake;
      this.ctx.translate(dx, dy);
    }

    // Render floor details / grid sand texture.
    // Keep this isolated so a wall-layer issue does not blank the entire frame.
    try {
      this.drawFloorGrid();
    } catch (err) {
      if (!this._renderFallbackWarned) {
        console.error('[Render] Floor layer failed, continuing with sprite render:', err);
      }
      this._renderFallbackWarned = true;
    }

    // Draw Dev Grid Overlay
    if (this.devShowGrid) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      this.ctx.lineWidth = 1;
      const bounds = this.levelManager.getNearbyTileBounds();
      if (bounds) {
        for (let tx = bounds.startTx; tx <= bounds.endTx; tx++) {
          for (let ty = bounds.startTy; ty <= bounds.endTy; ty++) {
            const rx = tx * 40 - this.camera.x;
            const ry = ty * 40 - this.camera.y;
            this.ctx.strokeRect(rx, ry, 40, 40);
            
            // Draw coordinate labels very small
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            this.ctx.font = '7px sans-serif';
            this.ctx.fillText(`${tx},${ty}`, rx + 2, ry + 8);
          }
        }
      }
      this.ctx.restore();
    }

    // Draw active area effect circles (e.g. fire/steam clouds)
    const playerX = this.player.x;
    const playerY = this.player.y;
    const renderDistanceSq = this.renderDistance * this.renderDistance;

    this.areaEffects.forEach((ae) => {
      if ((ae.x - playerX) ** 2 + (ae.y - playerY) ** 2 > renderDistanceSq) return;
      const rx = ae.x - this.camera.x;
      const ry = ae.y - this.camera.y;
      
      this.ctx.save();
      if (ae.type === 'singularity') {
        this.ctx.save();
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#a55eea';
        this.drawCircle(this.ctx, rx, ry, ae.radius, null, 'rgba(165, 94, 234, 0.5)', 4);
        this.ctx.restore();
        this.drawCircle(this.ctx, rx, ry, 16, '#06070d', null, 0);
      } else if (ae.type === 'steam_cloud') {
        this.drawCircle(this.ctx, rx, ry, ae.radius, 'rgba(245, 246, 250, 0.14)', null, 0);
      } else if (ae.type === 'fire_pool') {
        this.drawCircle(this.ctx, rx, ry, ae.radius, 'rgba(255, 71, 87, 0.16)', null, 0);
      } else if (ae.type === 'chrono_slow') {
        this.drawCircle(this.ctx, rx, ry, ae.radius, 'rgba(255, 159, 67, 0.08)', 'rgba(255, 159, 67, 0.2)', 2);
      } else if (ae.type === 'frost_slow') {
        this.drawCircle(this.ctx, rx, ry, ae.radius, 'rgba(0, 210, 213, 0.08)', 'rgba(0, 210, 213, 0.2)', 2);
      } else if (ae.type === 'ice_trail') {
        this.drawPixelTrailStamp(this.ctx, rx, ry, 'rgba(178, 254, 251, 0.45)', 'rgba(72, 219, 251, 0.6)');
      }
      this.ctx.restore();
    });

    // Draw Loot Items on ground
    this.items.forEach((item) => {
      if ((item.x - playerX) ** 2 + (item.y - playerY) ** 2 > renderDistanceSq) return;
      let assetKey = 'item_shard';
      if (item.type === 'hp') assetKey = 'item_hp';
      else if (item.type === 'mp') assetKey = 'item_mp';
      else if (item.type === 'relic') assetKey = item.value.sprite;
      this.assets.draw(this.ctx, assetKey, item.x - this.camera.x, item.y - this.camera.y, item.drawSize || 16);
    });

    // Draw Obstacles (Pillars, walls)
    try {
      this.levelManager.draw(this.ctx, this.camera);
    } catch (err) {
      if (!this._renderFallbackWarned) {
        console.error('[Render] Obstacle layer failed, continuing with sprite render:', err);
      }
      this._renderFallbackWarned = true;
    }

    // Draw Player wizard
    this.player.draw(this.ctx, this.assets, this.frameIndex);

    // Draw remote players (other peers)
    try {
      const fIdx = Math.floor(this.frameIndex * 3) % 2;
      for (const [pid, pl] of this.remotePlayers.entries()) {
        if (!pl) continue;
        if (this.multiplayer && pid === this.multiplayer.localId) continue; // don't draw local player as remote
        // determine interpolated position
        let drawX = (pl.x !== undefined) ? pl.x : (pl.targetX !== undefined ? pl.targetX : null);
        let drawY = (pl.y !== undefined) ? pl.y : (pl.targetY !== undefined ? pl.targetY : null);
        if (pl.targetX !== undefined && pl.prevX !== undefined) {
          const nowT = Date.now();
          const elapsed = nowT - (pl.startTs || 0);
          const dur = pl.duration || 220;
          const t = Math.min(1, Math.max(0, elapsed / dur));
          drawX = pl.prevX + (pl.targetX - pl.prevX) * t;
          drawY = pl.prevY + (pl.targetY - pl.prevY) * t;
        }
        if (drawX === null || drawY === null) continue;
        if ((drawX - playerX) ** 2 + (drawY - playerY) ** 2 > renderDistanceSq) continue;
        const rx = drawX - this.camera.x;
        const ry = drawY - this.camera.y;
        // simple shadow
        this.ctx.fillStyle = 'rgba(0,0,0,0.22)';
        this.ctx.fillRect(rx - 10, ry + 10, 20, 4);
        // draw base player sprite
        this.assets.draw(this.ctx, 'player', rx, ry, 32, fIdx, 0);
      }
    } catch (e) {
      // Non-fatal: don't break render loop on remote draw errors
      console.warn('draw remote players failed', e);
    }

    // Draw Enemies AI characters
    this.enemies.forEach((enemy) => {
      if (enemy.dead) return;
      if ((enemy.x - playerX) ** 2 + (enemy.y - playerY) ** 2 > renderDistanceSq) return;
      enemy.draw(this.ctx, this.assets);
    });

    // Draw Companions
    if (this.companions) {
      this.companions.forEach((comp) => {
        if ((comp.x - playerX) ** 2 + (comp.y - playerY) ** 2 > renderDistanceSq) return;
        comp.draw(this.ctx, this.assets);
      });
    }

    // Draw spell projectiles
    this.projectiles.forEach((proj) => {
      if ((proj.x - playerX) ** 2 + (proj.y - playerY) ** 2 > renderDistanceSq) return;
      // Draw ribbon trail
      if (this.showSpellTrails && proj.trail && proj.trail.length > 1) {
        this.ctx.save();
        
        let color = '#fff';
        if (proj.element === SPELL_TYPES.FIRE) color = '#ff4757';
        else if (proj.element === SPELL_TYPES.FROST) color = '#7ed6df';
        else if (proj.element === SPELL_TYPES.LIGHTNING) color = '#f1c40f';
        else if (proj.element === SPELL_TYPES.VOID) color = '#a55eea';

        this.ctx.fillStyle = color;

        for (let i = 0; i < proj.trail.length - 1; i++) {
          const p1 = proj.trail[i];
          const alpha = 1.0 - (i / proj.trail.length);
          const size = Math.max(2, (proj.radius * 0.8) * alpha);
          
          // Draw a blocky "link" in the ribbon
          this.ctx.globalAlpha = alpha > 0.5 ? 0.7 : 0.3; // Discrete alpha steps
          this.ctx.fillRect(
            Math.round((p1.x - this.camera.x) / 2) * 2 - size/2, 
            Math.round((p1.y - this.camera.y) / 2) * 2 - size/2, 
            size, size
          );
        }
        this.ctx.restore();
      }

      this.assets.draw(this.ctx, proj.spriteKey, proj.x - this.camera.x, proj.y - this.camera.y, proj.radius * 2);
    });

    // Draw graphical particle impacts & damage text
    this.particles.draw(this.ctx, this.camera);

    // Draw Dev Paths Overlay (in world space)
    if (this.devShowPaths) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(231, 76, 60, 0.6)';
      this.ctx.lineWidth = 1.5;
      this.enemies.forEach(enemy => {
        if (!enemy.dead && enemy._path && enemy._path.length > 0) {
          this.ctx.beginPath();
          this.ctx.moveTo(enemy.x - this.camera.x, enemy.y - this.camera.y);
          enemy._path.forEach(wp => {
            this.ctx.lineTo(wp.x - this.camera.x, wp.y - this.camera.y);
          });
          this.ctx.stroke();

          // Small circles at waypoints
          enemy._path.forEach(wp => {
            this.drawCircle(this.ctx, wp.x - this.camera.x, wp.y - this.camera.y, 3, 'rgba(231, 76, 60, 0.8)', null, 0);
          });
        }
      });
      this.ctx.restore();
    }

    // Draw Dev Hitboxes Overlay (in world space)
    if (this.devShowHitboxes) {
      this.ctx.save();
      // Player
      this.drawCircle(this.ctx, this.player.x - this.camera.x, this.player.y - this.camera.y, this.player.radius, null, '#2ecc71', 1.5);
      // Enemies
      this.enemies.forEach(enemy => {
        if (!enemy.dead) {
          this.drawCircle(this.ctx, enemy.x - this.camera.x, enemy.y - this.camera.y, enemy.radius, null, '#e74c3c', 1.5);
        }
      });
      // Companions
      if (this.companions) {
        this.companions.forEach(comp => {
          this.drawCircle(this.ctx, comp.x - this.camera.x, comp.y - this.camera.y, comp.radius || 12, null, '#00d2d3', 1.5);
        });
      }
      // Projectiles
      this.projectiles.forEach(proj => {
        this.drawCircle(this.ctx, proj.x - this.camera.x, proj.y - this.camera.y, proj.radius, null, '#f1c40f', 1.2);
      });
      // Ground items
      this.items.forEach(item => {
        this.drawCircle(this.ctx, item.x - this.camera.x, item.y - this.camera.y, item.radius || 10, null, '#3498db', 1.2);
      });
      // Obstacles
      if (this.levelManager && this.levelManager.obstacles) {
        this.levelManager.obstacles.forEach(obs => {
          this.drawCircle(this.ctx, obs.x - this.camera.x, obs.y - this.camera.y, obs.radius, null, '#e67e22', 1.2);
        });
      }
      this.ctx.restore();
    }

    // Underground Caverns limited light mechanic
    if (this.levelManager && this.levelManager.theme === 'underground') {
      this.drawUndergroundDarkness();
    }

    this.ctx.restore();

    // Draw Boss Health Bar on top-center if Boss active
    const boss = this.enemies.find((enemy) => enemy.type === 'archon' || enemy.type === 'volcanic_titan' || enemy.type === 'void_behemoth');
    if (boss) {
      this.drawBossHealthBar(boss);
    }

    if (this.state === 'PLAYING' && this.frameCount % 8 === 0) {
      this.drawMinimap();
    }

    // Draw Dev FPS Overlay (in screen space)
    if (this.devShowFps) {
      this.ctx.save();
      this.ctx.fillStyle = '#2ecc71';
      this.ctx.font = 'bold 12px monospace';
      const avgFps = this._fpsHistory && this._fpsHistory.length > 0
        ? Math.round(this._fpsHistory.reduce((a, b) => a + b, 0) / this._fpsHistory.length)
        : 60;
      this.ctx.fillText(`FPS: ${avgFps}`, 10, 25);
      this.ctx.restore();
    }

    // Draw Twitch Chat & voting overlays
    if (this.twitchManager) {
      this.twitchManager.drawOverlay(this.ctx, this.canvas.width, this.canvas.height);
    }
  }

  drawUndergroundDarkness() {
    this.ctx.save();
    
    // Center at player coordinates in camera space
    const rx = this.player.x - this.camera.x;
    const ry = this.player.y - this.camera.y;
    
    // Pulsate the lantern light radius slightly
    const time = Date.now() * 0.003;
    const pulsate = Math.sin(time) * 4;
    const lightRadius = 140 + pulsate;
    
    // Create radial gradient overlay in camera space
    const grad = this.ctx.createRadialGradient(rx, ry, 25, rx, ry, lightRadius);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.5, 'rgba(5, 5, 12, 0.45)');
    grad.addColorStop(0.85, 'rgba(5, 5, 12, 0.94)');
    grad.addColorStop(1, 'rgba(5, 5, 12, 0.99)');
    
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(rx - 2000, ry - 2000, 4000, 4000);
    
    this.ctx.restore();
  }

  drawFloorGrid() {
    this.levelManager.drawFloor(this.ctx, this.camera, this.canvas.width, this.canvas.height);
  }


  drawBossHealthBar(boss) {
    const bw = 240;
    const bh = 10;
    const bx = (this.canvas.width - bw) / 2;
    const by = 120; // offset below wave timer and top HUD row
    
    this.ctx.save();
    
    // Background frame
    this.ctx.fillStyle = 'rgba(10, 14, 28, 0.85)';
    this.ctx.strokeStyle = 'rgba(255, 71, 87, 0.4)';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(bx, by, bw, bh);
    this.ctx.fillRect(bx, by, bw, bh);

    // HP Fill
    const fillWidth = (boss.hp / boss.maxHp) * bw;
    const grad = this.ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, '#ff4757');
    grad.addColorStop(1, '#ff6b81');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(bx, by, fillWidth, bh);

    // Text Label
    this.ctx.font = 'bold 6px "Press Start 2P", monospace';
    this.ctx.fillStyle = '#fff';
    this.ctx.textAlign = 'center';
    this.ctx.shadowBlur = 4;
    this.ctx.shadowColor = '#ff4757';
    this.ctx.fillText(`${boss.name} (${Math.round(boss.hp)} / ${boss.maxHp})`, bx + bw/2, by + 8);
    
    this.ctx.restore();
  }

  drawMinimap() {
    const canvas = document.getElementById('minimap-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const lvl = this.levelManager;
    if (!lvl || !lvl.tileGrid || !lvl.exploredGrid) return;
    
    const tileSize = 40;
    const miniCellSize = 4; // 4x4 pixels per tile on minimap
    const mapW = canvas.width;
    const mapH = canvas.height;
    
    const px = this.player.x;
    const py = this.player.y;
    
    const pTileX = px / tileSize;
    const pTileY = py / tileSize;
    
    const viewTilesX = Math.ceil(mapW / miniCellSize);
    const viewTilesY = Math.ceil(mapH / miniCellSize);
    
    const startX = Math.floor(pTileX - viewTilesX / 2);
    const startY = Math.floor(pTileY - viewTilesY / 2);
    
    ctx.save();
    
    for (let dx = 0; dx < viewTilesX; dx++) {
      for (let dy = 0; dy < viewTilesY; dy++) {
        const tx = startX + dx;
        const ty = startY + dy;
        
        const rx = dx * miniCellSize;
        const ry = dy * miniCellSize;
        
        if (tx >= 0 && tx < lvl.tileWidth && ty >= 0 && ty < lvl.tileHeight) {
          const explored = lvl.exploredGrid[tx][ty];
          if (explored) {
            const tile = lvl.tileGrid[tx][ty];
            if (tile === 1) {
              ctx.fillStyle = '#2f3640'; // Wall
            } else if (tile === 2) {
              ctx.fillStyle = '#2c1b4d'; // Special Room
            } else if (tile === 3) {
              ctx.fillStyle = '#e67e22'; // Door
            } else {
              ctx.fillStyle = '#121320'; // Floor
            }
            ctx.fillRect(rx, ry, miniCellSize, miniCellSize);
          } else {
            ctx.fillStyle = '#000000'; // Unexplored
            ctx.fillRect(rx, ry, miniCellSize, miniCellSize);
          }
        } else {
          ctx.fillStyle = '#000000'; // Out of bounds
          ctx.fillRect(rx, ry, miniCellSize, miniCellSize);
        }
      }
    }
    
    // Draw player in the middle (white cross/dot)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(mapW / 2 - 2, mapH / 2 - 2, 4, 4);
    
    const isExplored = (wx, wy) => {
      const tx = Math.floor(wx / tileSize);
      const ty = Math.floor(wy / tileSize);
      return tx >= 0 && tx < lvl.tileWidth && ty >= 0 && ty < lvl.tileHeight && lvl.exploredGrid[tx][ty];
    };
    
    // Shrines (blue dots)
    lvl.shrines.forEach(shrine => {
      if (isExplored(shrine.x, shrine.y)) {
        const sdx = (shrine.x / tileSize - pTileX) * miniCellSize + mapW / 2;
        const sdy = (shrine.y / tileSize - pTileY) * miniCellSize + mapH / 2;
        ctx.fillStyle = '#70a1ff';
        ctx.fillRect(sdx - 2, sdy - 2, 4, 4);
      }
    });
    
    // Chests (gold dots)
    lvl.chests.forEach(chest => {
      if (isExplored(chest.x, chest.y)) {
        const cdx = (chest.x / tileSize - pTileX) * miniCellSize + mapW / 2;
        const cdy = (chest.y / tileSize - pTileY) * miniCellSize + mapH / 2;
        ctx.fillStyle = '#eccc68';
        ctx.fillRect(cdx - 2, cdy - 2, 4, 4);
      }
    });

    // Enemies (red dots)
    this.enemies.forEach(enemy => {
      if (!enemy.dead && isExplored(enemy.x, enemy.y)) {
        const edx = (enemy.x / tileSize - pTileX) * miniCellSize + mapW / 2;
        const edy = (enemy.y / tileSize - pTileY) * miniCellSize + mapH / 2;
        ctx.fillStyle = '#ff4757';
        ctx.fillRect(edx - 1.5, edy - 1.5, 3, 3);
      }
    });
    
    ctx.restore();
  }

  drawWorldmap() {
    const canvas = document.getElementById('worldmap-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const lvl = this.levelManager;
    if (!lvl || !lvl.tileGrid || !lvl.exploredGrid) return;
    
    const w = canvas.width;
    const h = canvas.height;
    
    const scaleX = w / lvl.tileWidth;
    const scaleY = h / lvl.tileHeight;
    const baseScale = Math.min(scaleX, scaleY);
    const scale = baseScale * this.mapZoom;
    
    // Center offset before pan
    const baseOffsetX = (w - lvl.tileWidth * baseScale) / 2;
    const baseOffsetY = (h - lvl.tileHeight * baseScale) / 2;
    
    ctx.save();
    ctx.translate(this.mapPanX + baseOffsetX * this.mapZoom, this.mapPanY + baseOffsetY * this.mapZoom);
    ctx.scale(this.mapZoom, this.mapZoom);
    
    // Draw black background for the whole map bounds first
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, lvl.tileWidth * baseScale, lvl.tileHeight * baseScale);
    
    // 1. Find player's current sector
    const px = this.player.x;
    const py = this.player.y;
    const currentSx = Math.max(0, Math.min(lvl.maxSectorCols - 1, Math.floor(px / 2000)));
    const currentSy = Math.max(0, Math.min(lvl.maxSectorRows - 1, Math.floor(py / 2000)));
    
    // 2. Compute Euclidean distance from current sector to all unlocked sectors
    const unlockedList = Array.from(lvl.unlockedSectors);
    const sortedSectors = unlockedList.map(sectorKey => {
      const [sx, sy] = sectorKey.split(',').map(Number);
      const dist = Math.hypot(sx - currentSx, sy - currentSy);
      return { key: sectorKey, sx, sy, dist };
    }).sort((a, b) => a.dist - b.dist);
    
    // 3. When zoomed in, show more sectors; at default zoom show 3 nearest
    const maxRendered = this.mapZoom > 1.5 ? sortedSectors.length : 3;
    const nearestSectors = sortedSectors.slice(0, maxRendered);
    const nearestKeysSet = new Set(nearestSectors.map(s => s.key));
    
    // 4. Render tiles belonging to visible sectors
    nearestSectors.forEach(sec => {
      const startTx = sec.sx * 50;
      const endTx = startTx + 50;
      const startTy = sec.sy * 50;
      const endTy = startTy + 50;
      
      for (let tx = startTx; tx < endTx; tx++) {
        for (let ty = startTy; ty < endTy; ty++) {
          if (tx >= 0 && tx < lvl.tileWidth && ty >= 0 && ty < lvl.tileHeight) {
            const explored = lvl.exploredGrid[tx][ty];
            if (explored) {
              const tile = lvl.tileGrid[tx][ty];
              const rx = tx * baseScale;
              const ry = ty * baseScale;
              if (tile === 1) {
                ctx.fillStyle = '#2f3640'; // Wall
              } else if (tile === 2) {
                ctx.fillStyle = '#2c1b4d'; // Special Room
              } else if (tile === 3) {
                ctx.fillStyle = '#e67e22'; // Door
              } else {
                ctx.fillStyle = '#121320'; // Floor
              }
              ctx.fillRect(rx, ry, baseScale + 0.5, baseScale + 0.5);
            }
          }
        }
      }
    });
    
    // Draw shrines only if in rendered sectors
    lvl.shrines.forEach(shrine => {
      const tx = Math.floor(shrine.x / 40);
      const ty = Math.floor(shrine.y / 40);
      const sx = Math.floor(tx / 50);
      const sy = Math.floor(ty / 50);
      const sectorKey = `${sx},${sy}`;
      if (nearestKeysSet.has(sectorKey) && lvl.exploredGrid[tx][ty]) {
        ctx.fillStyle = '#70a1ff';
        const sz = Math.max(5, Math.round(baseScale * 1.5));
        ctx.fillRect(tx * baseScale + baseScale / 2 - sz / 2, ty * baseScale + baseScale / 2 - sz / 2, sz, sz);
      }
    });
    
    // Draw chests only if in rendered sectors
    lvl.chests.forEach(chest => {
      const tx = Math.floor(chest.x / 40);
      const ty = Math.floor(chest.y / 40);
      const sx = Math.floor(tx / 50);
      const sy = Math.floor(ty / 50);
      const sectorKey = `${sx},${sy}`;
      if (nearestKeysSet.has(sectorKey) && lvl.exploredGrid[tx][ty]) {
        ctx.fillStyle = '#eccc68';
        const sz = Math.max(5, Math.round(baseScale * 1.5));
        ctx.fillRect(tx * baseScale + baseScale / 2 - sz / 2, ty * baseScale + baseScale / 2 - sz / 2, sz, sz);
      }
    });
    
    // Draw player (blocky bordered square)
    const pTx = Math.floor(px / 40);
    const pTy = Math.floor(py / 40);
    ctx.fillStyle = '#ffffff';
    const psz = Math.max(6, Math.round(baseScale * 1.8));
    ctx.fillRect(pTx * baseScale + baseScale / 2 - psz / 2, pTy * baseScale + baseScale / 2 - psz / 2, psz, psz);
    ctx.strokeStyle = '#eccc68';
    ctx.lineWidth = 1;
    ctx.strokeRect(pTx * baseScale + baseScale / 2 - psz / 2, pTy * baseScale + baseScale / 2 - psz / 2, psz, psz);
    
    ctx.restore();
  }

  drawMenuPlayer(canvasId, hueShift) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    const px = canvas.width / 2;
    const py = canvas.height / 2;

    const fIdx = Math.floor(this.frameIndex * 4) % 3; // idle / walk animation frames

    ctx.save();
    if (hueShift !== undefined) {
      if (hueShift !== null) ctx.filter = `hue-rotate(${hueShift}deg)`;
    } else if (this.player && this.player.hueShift) {
      ctx.filter = `hue-rotate(${this.player.hueShift}deg)`;
    }
    
    // Draw trail shadow (flat blocky rect)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(px - 10, py + 14, 20, 3);

    // Draw player base sprite (scaled to 48px or 64px)
    this.assets.draw(ctx, 'player', px, py, 48, fIdx, 0);

    ctx.restore();
  }

  drawGameModePreviews() {
    const drawOnCanvas = (canvasId, drawFn) => {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      drawFn(ctx, canvas.width, canvas.height);
    };

    drawOnCanvas('canvas-mode-weaver', (ctx, w, h) => {
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#a55eea';
      ctx.save();
      this.drawCircle(ctx, w / 2, h / 2, 24, 'rgba(165, 94, 234, 0.4)', null, 0);
      ctx.restore();
      this.assets.draw(ctx, 'icon_fireball', w / 2, h / 2, 40);
    });

    drawOnCanvas('icon-mainmenu-story', (ctx, w, h) => {
      ctx.save();
      ctx.fillStyle = '#020306';
      ctx.fillRect(0, 0, w, h);
      this.assets.draw(ctx, 'icon_book', w / 2, h / 2, 40);
      ctx.restore();
    });

    drawOnCanvas('icon-mainmenu-multiplayer', (ctx, w, h) => {
      ctx.save();
      ctx.fillStyle = '#020306';
      ctx.fillRect(0, 0, w, h);
      this.assets.draw(ctx, 'icon_sword', w / 2, h / 2, 40);
      ctx.restore();
    });

    drawOnCanvas('canvas-mode-tutorial', (ctx, w, h) => {
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#2ed573';
      ctx.save();
      this.drawCircle(ctx, w / 2, h / 2, 24, 'rgba(46, 213, 115, 0.3)', null, 0);
      ctx.restore();
      this.assets.draw(ctx, 'enemy_slime', w / 2, h / 2, 32, 0);
    });
  }

  startTutorial() {
    this.isTutorial = true;
    this.isStoryMode = false;
    this.tutorialStep = 1;
    this.tutorialMovedDistance = 0;
    this.tutorialDummy = null;
    this.tutorialPrevX = 0;
    this.tutorialPrevY = 0;
    this.lastTriggeredComboClass = null;
    this.tutorialOpenedInventory = false;

    // Backup actual save state
    this.preTutorialBackup = localStorage.getItem('aetherweaver_save');
    // Disable saving by mocking player.saveGameState to a no-op
    this.player.saveGameState = () => {};

    // Reset game entities
    this.projectiles = [];
    this.enemies = [];
    this.companions = [];
    this.items = [];
    this.areaEffects = [];
    this.score = 0;
    this.kills = 0;
    this.timeDilationTimer = 0;

    // Reset player progression to blank-slate
    this.player.level = 1;
    this.player.xp = 0;
    this.player.xpNeeded = 50;
    this.player.ap = 0;
    this.player.shards = 0;
    this.player.shopMaxHp = 0;
    this.player.shopMaxMp = 0;
    this.player.shopManaRegen = 0;
    this.player.runeStorage = [];
    this.player.equippedRunes = [];
    this.player.gearStorage = [];
    this.player.equipment = { helmet: null, chestplate: null, boots: null, weapon: null, ring: null };
    this.player.maxSpellSlots = 5;
    this.player.customSpellMap = { primary:null,secondary:null,utility:null,ultimate:null,extra:null,slot6:null,slot7:null };
    this.player.rebirthCount = 0;
    this.player.rebirthBonuses = { maxHp: 0, maxMp: 0, damage: 0, speed: 0, shardMultiplier: 1 };

    // Reset ability tree upgrades (keep root node unlocked)
    if (this.abilityTree && this.abilityTree.nodes) {
      for (const key in this.abilityTree.nodes) {
        this.abilityTree.nodes[key].unlocked = (key === 'root');
      }
    }

    this.player.recalculateModifiers(this.abilityTree);

    // Set level manager to standard size
    this.levelManager = new LevelManager(this);
    this.levelManager.wave = 1;
    this.levelManager.generateObstacles();

    // Spawn player in center
    const spawnPoint = this.levelManager.getSpawnPoint();
    this.player.x = spawnPoint.x;
    this.player.y = spawnPoint.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.hp = this.player.getMaxHp();
    this.player.mp = this.player.getMaxMp();

    // Restrict spells: only fireball at start
    this.player.spellSlots.primary = 'fireball';
    this.player.spellSlots.secondary = null;
    this.player.spellSlots.utility = null;
    this.player.spellSlots.ultimate = null;
    this.player.spellSlots.extra = null;

    this.tutorialPrevX = this.player.x;
    this.tutorialPrevY = this.player.y;

    // Show Guide overlay
    const tg = document.getElementById('tutorial-guide');
    if (tg) tg.classList.remove('hidden');
    const tfbc = document.getElementById('tutorial-finish-btn-container');
    if (tfbc) tfbc.classList.add('hidden');

    this.setTutorialStep(1);

    // Center camera
    this.camera = { x: this.player.x - this.canvas.width / 2, y: this.player.y - this.canvas.height / 2 };

    this.setState('PLAYING');
    this.updateHUD();
  }

  setTutorialStep(step) {
    this.tutorialStep = step;
    const progressFill = document.getElementById('tutorial-progress-fill');
    const stepIndicator = document.getElementById('tutorial-step-indicator');
    const titleEl = document.getElementById('tutorial-title');
    const textEl = document.getElementById('tutorial-text');

    if (progressFill) progressFill.style.width = `${(step / 7) * 100}%`;
    if (stepIndicator) stepIndicator.innerText = `STEP ${step}/7`;

    // Clear old tutorial dummy if exists
    if (this.tutorialDummy) {
      this.tutorialDummy.dead = true;
      this.tutorialDummy = null;
    }

    if (step === 1) {
      if (titleEl) titleEl.innerText = "MOVE YOUR WIZARD";
      if (textEl) textEl.innerText = "Use WASD or Arrow Keys to walk around the training arena.";
      this.tutorialMovedDistance = 0;
      this.tutorialPrevX = this.player.x;
      this.tutorialPrevY = this.player.y;
    } else if (step === 2) {
      if (titleEl) titleEl.innerText = "CAST FIREBALL";
      if (textEl) textEl.innerText = "A training slime has appeared. Target it with your mouse cursor and press Left Click (LMB) to launch Fireballs.";
      
      this.spawnEnemy(this.player.x, this.player.y - 120, 'slime');
      this.tutorialDummy = this.enemies[this.enemies.length - 1];
      if (this.tutorialDummy) {
        this.tutorialDummy.isPassive = true;
        this.tutorialDummy.hp = 30;
        this.tutorialDummy.maxHp = 30;
      }
    } else if (step === 3) {
      if (titleEl) titleEl.innerText = "STEAM COMBO";
      if (textEl) textEl.innerText = "A tougher training slime has appeared. Click Right Click (RMB) to cast Frost Spike and CHILL it, then quickly Left Click (LMB) to trigger a scalding Steam Combo reaction!";
      
      // Equip Frost Spike in secondary slot
      this.player.spellSlots.secondary = 'frost_spike';
      this.updateHUD();

      // Spawn a second dummy
      this.spawnEnemy(this.player.x, this.player.y - 120, 'slime');
      this.tutorialDummy = this.enemies[this.enemies.length - 1];
      if (this.tutorialDummy) {
        this.tutorialDummy.isPassive = true;
        this.tutorialDummy.hp = 60;
        this.tutorialDummy.maxHp = 60;
      }
      this.lastTriggeredComboClass = null;
    } else if (step === 4) {
      if (titleEl) titleEl.innerText = "CHRONO DASH";
      if (textEl) textEl.innerText = "We've equipped Chrono Dash in your Utility slot. Press Spacebar while moving to dash quickly and dodge attacks.";
      
      // Equip Chrono Dash in utility slot
      this.player.spellSlots.utility = 'aether_dash';
      this.updateHUD();
    } else if (step === 5) {
      if (titleEl) titleEl.innerText = "EQUIP GEAR & RUNES";
      if (textEl) textEl.innerText = "We've placed a Rune and Pyromancer Staff in your bag. Press 'I' or click the HUD SATCHEL, click to equip them, then close the inventory.";
      
      // Pushes items to inventory
      const iceRune = RELICS_CATALOG.find(r => r.id === 'relic_frost');
      const pyStaff = EQUIPMENT_CATALOG.find(e => e.id === 'equip_staff_fire');
      if (iceRune && !this.player.runeStorage.includes(iceRune)) {
        this.player.runeStorage.push(iceRune);
      }
      if (pyStaff && !this.player.gearStorage.includes(pyStaff)) {
        this.player.gearStorage.push(pyStaff);
      }
      this.tutorialOpenedInventory = false;
    } else if (step === 6) {
      if (titleEl) titleEl.innerText = "THE AETHER WEB";
      if (textEl) textEl.innerText = "You gained 5 AP. Click the Tree (5 AP) notification at the top-right, unlock any node upgrade, then close the tree to proceed.";
      
      // Give AP points and update HUD
      this.player.ap = 5;
      this.updateHUD();
    } else if (step === 7) {
      if (titleEl) titleEl.innerText = "TUTORIAL COMPLETE";
      if (textEl) textEl.innerText = "Incredible work! You are now ready to weave runes, equip equipment, build your web, and face the onslaught. Click below to begin!";
      
      const finishBtnContainer = document.getElementById('tutorial-finish-btn-container');
      if (finishBtnContainer) {
        finishBtnContainer.classList.remove('hidden');
      }
    }
  }

  updateTutorial(dt) {
    if (this.tutorialStep === 1) {
      const distMoved = Math.hypot(this.player.x - this.tutorialPrevX, this.player.y - this.tutorialPrevY);
      this.tutorialMovedDistance += distMoved;
      this.tutorialPrevX = this.player.x;
      this.tutorialPrevY = this.player.y;
      
      if (this.tutorialMovedDistance >= 120) {
        if (this.audio) this.audio.playUnlock();
        this.setTutorialStep(2);
      }
    } 
    
    else if (this.tutorialStep === 2) {
      if (!this.tutorialDummy || this.tutorialDummy.dead || !this.enemies.includes(this.tutorialDummy)) {
        if (this.audio) this.audio.playUnlock();
        this.setTutorialStep(3);
      }
    } 
    
    else if (this.tutorialStep === 3) {
      const comboHappened = this.lastTriggeredComboClass === 'steam';
      const dummyDead = !this.tutorialDummy || this.tutorialDummy.dead || !this.enemies.includes(this.tutorialDummy);
      
      if (comboHappened || dummyDead) {
        if (this.audio) this.audio.playUnlock();
        this.setTutorialStep(4);
      }
    } 
    
    else if (this.tutorialStep === 4) {
      if (this.player.spellCooldowns.utility > 0) {
        if (this.audio) this.audio.playUnlock();
        this.setTutorialStep(5);
      }
    }

    else if (this.tutorialStep === 5) {
      if (this.state === 'INVENTORY') {
        this.tutorialOpenedInventory = true;
      }
      // Check if player has equipped a rune or a weapon, and is back in PLAYING state
      const hasEquipped = this.player.equippedRunes.length > 0 || this.player.equipment.weapon !== null;
      if (this.tutorialOpenedInventory && hasEquipped && this.state === 'PLAYING') {
        if (this.audio) this.audio.playUnlock();
        this.setTutorialStep(6);
      }
    }

    else if (this.tutorialStep === 6) {
      // Check if they unlocked any node in abilityTree and closed the tree
      let unlockedNodeCount = 0;
      if (this.abilityTree && this.abilityTree.nodes) {
        for (const key in this.abilityTree.nodes) {
          if (this.abilityTree.nodes[key].unlocked) unlockedNodeCount++;
        }
      }
      if (unlockedNodeCount > 0 && this.state === 'PLAYING') {
        if (this.audio) this.audio.playUnlock();
        this.setTutorialStep(7);
      }
    }
  }

  endTutorial() {
    if (!this.isTutorial) return;
    this.isTutorial = false;
    document.getElementById('tutorial-guide').classList.add('hidden');
    
    // Clear entities
    this.projectiles = [];
    this.enemies = [];
    this.companions = [];
    this.items = [];
    this.areaEffects = [];
    
    // Restore saveGameState method from prototype
    delete this.player.saveGameState;

    // Restore pre-tutorial save state
    if (this.preTutorialBackup) {
      localStorage.setItem('aetherweaver_save', this.preTutorialBackup);
    } else {
      localStorage.removeItem('aetherweaver_save');
    }

    // Load actual game progress back into player
    this.player.loadGameState();
    this.player.recalculateModifiers(this.abilityTree);

    // Fully heal player
    this.player.hp = this.player.getMaxHp();
    this.player.mp = this.player.getMaxMp();

    this.setState('MENU');
    this.updateHUD();
  }

  setRenderDistance(value) {
    this.renderDistance = parseInt(value);
    
    // Update HTML elements if they exist
    const lblSettingsRender = document.getElementById('lbl-settings-render-val');
    const sldSettingsRender = document.getElementById('sld-settings-render');
    
    if (lblSettingsRender) {
      lblSettingsRender.innerText = `${this.renderDistance}px`;
    }
    if (sldSettingsRender) {
      sldSettingsRender.value = value;
      // Update slider fill track visual background color
      const min = sldSettingsRender.min || 0;
      const max = sldSettingsRender.max || 100;
      const percentage = (value - min) / (max - min) * 100;
      sldSettingsRender.style.background = `linear-gradient(to right, var(--color-aether) ${percentage}%, #080a14 ${percentage}%)`;
    }

    // Update obstacles filter instantly when render distance changes!
    if (this.levelManager && this.player && this.levelManager.allObstacles) {
      const px = this.player.x;
      const py = this.player.y;
      const distCutoffSq = (this.renderDistance + 200) ** 2;
      this.levelManager.obstacles = this.levelManager.allObstacles.filter(obs => {
        const dx = obs.x - px;
        const dy = obs.y - py;
        return (dx * dx + dy * dy) <= distCutoffSq;
      });
    }

    // Redraw if game is active but state is SETTINGS/PAUSED/PLAYING
    if (this.player && this.levelManager) {
      this.draw();
    }

    this.saveSettings();
  }

  saveSettings() {
    const settings = {
      musicVolume: Math.round(this.audio ? this.audio.musicVolume * 100 : 35),
      sfxVolume: Math.round(this.audio ? this.audio.sfxVolume * 100 : 55),
      isMuted: this.audio ? this.audio.isMuted : false,
      renderDistance: this.renderDistance,
      enableScreenShake: this.enableScreenShake,
      enableGlowEffects: this.enableGlowEffects,
      showDamageNumbers: this.showDamageNumbers,
      showEnemyHealthbars: this.showEnemyHealthbars,
      showFloorGrid: this.showFloorGrid,
      lowParticleMode: this.lowParticleMode,
      showSpellTrails: this.showSpellTrails
    };
    localStorage.setItem('aetherweaver_settings', JSON.stringify(settings));
  }

  loadSettings() {
    try {
      const data = localStorage.getItem('aetherweaver_settings');
      if (data) {
        const settings = JSON.parse(data);
        if (settings.renderDistance !== undefined) this.renderDistance = settings.renderDistance;
        this.enableScreenShake = settings.enableScreenShake !== undefined ? settings.enableScreenShake : true;
        this.enableGlowEffects = settings.enableGlowEffects !== undefined ? settings.enableGlowEffects : true;
        if (this.particles) this.particles.enableGlowEffects = this.enableGlowEffects;
        this.showDamageNumbers = settings.showDamageNumbers !== undefined ? settings.showDamageNumbers : true;
        this.showEnemyHealthbars = settings.showEnemyHealthbars !== undefined ? settings.showEnemyHealthbars : true;
        this.showFloorGrid = settings.showFloorGrid !== undefined ? settings.showFloorGrid : true;
        this.lowParticleMode = settings.lowParticleMode !== undefined ? settings.lowParticleMode : false;
        if (this.particles) this.particles.lowParticleMode = this.lowParticleMode;
        this.showSpellTrails = settings.showSpellTrails !== undefined ? settings.showSpellTrails : true;

        if (this.audio) {
          if (settings.musicVolume !== undefined) this.audio.setMusicVolume(settings.musicVolume / 100);
          if (settings.sfxVolume !== undefined) this.audio.setSfxVolume(settings.sfxVolume / 100);
          if (settings.isMuted !== undefined) {
            this.audio.isMuted = settings.isMuted;
            if (this.audio._musicEl) {
              this.audio._musicEl.muted = this.audio.isMuted;
              this.audio._musicEl.volume = this.audio.isMuted ? 0 : this.audio.musicVolume;
            }
          }
        }
      } else {
        this.renderDistance = 1200;
        this.enableScreenShake = true;
        this.enableGlowEffects = true;
        if (this.particles) this.particles.enableGlowEffects = true;
        this.showDamageNumbers = true;
        this.showEnemyHealthbars = true;
        this.showFloorGrid = true;
        this.lowParticleMode = false;
        if (this.particles) this.particles.lowParticleMode = false;
        this.showSpellTrails = true;
      }
    } catch (e) {
      console.warn("Failed to load settings from localStorage:", e);
    }
  }

  drawCircle(ctx, cx, cy, radius, fillStyle, strokeStyle, strokeWidth = 2, blockSize = 2) {
    const startX = Math.floor((cx - radius) / blockSize) * blockSize;
    const endX = Math.ceil((cx + radius) / blockSize) * blockSize;
    const startY = Math.floor((cy - radius) / blockSize) * blockSize;
    const endY = Math.ceil((cy + radius) / blockSize) * blockSize;

    ctx.save();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      for (let x = startX; x <= endX; x += blockSize) {
        for (let y = startY; y <= endY; y += blockSize) {
          const dx = x + blockSize / 2 - cx;
          const dy = y + blockSize / 2 - cy;
          if (dx * dx + dy * dy <= radius * radius) {
            ctx.fillRect(x, y, blockSize, blockSize);
          }
        }
      }
    }

    if (strokeStyle) {
      ctx.fillStyle = strokeStyle;
      for (let x = startX; x <= endX; x += blockSize) {
        for (let y = startY; y <= endY; y += blockSize) {
          const dx = x + blockSize / 2 - cx;
          const dy = y + blockSize / 2 - cy;
          const distSq = dx * dx + dy * dy;
          const outerR = radius;
          const innerR = radius - strokeWidth;
          if (distSq <= outerR * outerR && distSq > innerR * innerR) {
            ctx.fillRect(x, y, blockSize, blockSize);
          }
        }
      }
    }
    ctx.restore();
  }

  drawPixelTrailStamp(ctx, cx, cy, fillStyle, strokeStyle = null) {
    ctx.save();
    ctx.fillStyle = fillStyle;
    // compact 2-pixel grain stamp
    ctx.fillRect(Math.round(cx - 3), Math.round(cy - 1), 6, 2);
    ctx.fillRect(Math.round(cx - 1), Math.round(cy - 3), 2, 6);

    if (strokeStyle) {
      ctx.fillStyle = strokeStyle;
      ctx.fillRect(Math.round(cx - 1), Math.round(cy - 1), 2, 2);
    }
    ctx.restore();
  }

  createUnlockedCompanions() {
    if (!this.companions) this.companions = [];

    if (this.player.unlockedCompanion1 && !this.companions.some(c => c.type === 1)) {
      this.companions.push(new Companion(this, 1, this.player));
    }
    if (this.player.unlockedCompanion2 && !this.companions.some(c => c.type === 2)) {
      this.companions.push(new Companion(this, 2, this.player));
    }
  }

  checkProgressionOnUnlock() {
    if (this.abilityTree.isPlayerTree1Completed()) {
      if (!this.player.unlockedCompanion1) {
        this.player.unlockedCompanion1 = true;
        this.uiNotifyCombo("COMPANION UNLOCKED!", "fire");
        this.particles.spawnText(this.player.x, this.player.y - 35, "PET DRAGON UNLOCKED!", { color: '#ff4757', fontSize: 13, fontPixel: true, life: 3.0 });
        
        const tabBtn = document.getElementById('tab-companion1');
        if (tabBtn) tabBtn.classList.remove('hidden');
        const tabsContainer = document.getElementById('tree-tabs');
        if (tabsContainer) tabsContainer.classList.remove('hidden');
        
        this.createUnlockedCompanions();
      }
    }

    if (this.abilityTree.isCompanion1TreeCompleted()) {
      if (!this.player.completedCompanion1Tree) {
        this.player.completedCompanion1Tree = true;
        
        if (!this.player.completedCompanion1TreeAwarded) {
          this.player.completedCompanion1TreeAwarded = true;
          const opRelic = {
            id: 'relic_archon_crown',
            name: 'Archon Crown',
            desc: 'LEGENDARY: +100% all Damage, +100 Max HP, +100 Max MP.',
            sprite: 'relic_ring',
            stats: { allDamage: 1.0, maxHp: 100, maxMp: 100 }
          };
          this.player.runeStorage.push(opRelic);
          this.uiNotifyCombo("LEGENDARY LOOT AWARDED!", "hybrid");
          this.particles.spawnText(this.player.x, this.player.y - 45, "LEGENDARY ARCHON CROWN RECEIVED!", { color: '#7d5fff', fontSize: 13, fontPixel: true, life: 4.0 });
        }
      }
    }

    if (this.abilityTree.isCompanion2TreeCompleted()) {
      if (!this.player.completedCompanion2Tree) {
        this.player.completedCompanion2Tree = true;
        
        if (!this.player.completedCompanion2TreeAwarded) {
          this.player.completedCompanion2TreeAwarded = true;
          const opRelic = {
            id: 'relic_griffin_hourglass',
            name: 'Griffin Hourglass',
            desc: 'LEGENDARY: +50% Cooldown Reduction, +50 Max MP, +30% Time Damage.',
            sprite: 'relic_griffin_hourglass',
            stats: { cooldownReduction: 0.50, maxMp: 50, timeDamage: 0.30 }
          };
          this.player.runeStorage.push(opRelic);
          this.uiNotifyCombo("LEGENDARY LOOT AWARDED!", "time");
          this.particles.spawnText(this.player.x, this.player.y - 45, "LEGENDARY GRIFFIN HOURGLASS RECEIVED!", { color: '#ff9f43', fontSize: 13, fontPixel: true, life: 4.0 });
        }
      }
    }

    if (this.abilityTree.isPlayerTree2Completed()) {
      if (!this.player.unlockedCompanion2) {
        this.player.unlockedCompanion2 = true;
        this.uiNotifyCombo("COMPANION 2 UNLOCKED!", "time");
        this.particles.spawnText(this.player.x, this.player.y - 35, "CHRONO GRIFFIN UNLOCKED!", { color: '#ff9f43', fontSize: 13, fontPixel: true, life: 3.0 });
        
        const tabBtn = document.getElementById('tab-companion2');
        if (tabBtn) tabBtn.classList.remove('hidden');
        const tabsContainer = document.getElementById('tree-tabs');
        if (tabsContainer) tabsContainer.classList.remove('hidden');
        
        this.createUnlockedCompanions();
      }
    }

    // Always keep companion instances in sync with progression state.
    this.createUnlockedCompanions();
  }

  // ----------------------------------------------------
  // STORY MODE, VISUAL BUILDER, PLAYER ACCOUNTS
  // ----------------------------------------------------
  
  // Twitch OAuth implicit grant redirect handler
  parseTwitchOAuthHash() {
    if (window.location.hash) {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      if (accessToken) {
        console.log('[Twitch OAuth] Access token found in URL hash. Authenticating...');
        history.replaceState(null, document.title, window.location.pathname + window.location.search);
        
        fetch('https://api.twitch.tv/helix/users', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Client-Id': '1zu1g6sz69tae512pzy7dp57uowmvk'
          }
        })
        .then(res => {
          if (!res.ok) throw new Error('Twitch user profile fetch failed');
          return res.json();
        })
        .then(data => {
          if (data.data && data.data.length > 0) {
            const user = data.data[0];
            const channel = user.login || user.display_name;
            console.log(`[Twitch OAuth] Welcome, ${channel}! Connecting to chat...`);
            
            localStorage.setItem('twitch_oauth_token', accessToken);
            localStorage.setItem('twitch_oauth_user', JSON.stringify(user));
            
            this.registerStreamerIfNeeded(user).then(() => {
              this.twitchManager.connect(channel);
              this.updateTwitchStatus();
            });

            if (this.player) {
              this.particles.spawnText(this.player.x, this.player.y - 60, `LOGGED IN AS ${channel.toUpperCase()}`, {
                color: '#9146FF', fontSize: 12, fontPixel: true
              });
            }
            
            const twitchStatusLbl = document.getElementById('twitch-status-lbl');
            if (twitchStatusLbl) {
              twitchStatusLbl.innerText = `CONNECTED TO #${channel.toUpperCase()}`;
              twitchStatusLbl.style.color = '#2ecc71';
              twitchStatusLbl.style.textShadow = '0 0 5px rgba(46,204,113,0.5)';
            }
          }
        })
        .catch(err => {
          console.error('[Twitch OAuth] Error fetching user data:', err);
        });
      }
    }
  }

  async registerStreamerIfNeeded(user) {
    const username = user.login;
    const twitchId = user.id;
    const displayName = user.display_name || username;
    const slug = username.toLowerCase();
    const email = user.email || `${slug}@twitch.tv`;
    const password = twitchId + "AetherweaverSecretSalt123!";

    console.log(`[Streamer Register] Checking if streamer exists for Twitch ID: ${twitchId}`);
    try {
      const checkRes = await fetch(
        `${this.pbClient.baseUrl}/api/collections/ag_streamers/records?filter=(twitch_id='${twitchId}')`
      );
      if (!checkRes.ok) throw new Error('Failed to query ag_streamers');
      
      const checkData = await checkRes.json();
      let record = null;
      
      if (checkData.items && checkData.items.length > 0) {
        record = checkData.items[0];
        console.log(`[Streamer Register] Streamer already registered: ${record.twitch_name}`);
      } else {
        console.log(`[Streamer Register] Registering new streamer: ${displayName}`);
        const createRes = await fetch(`${this.pbClient.baseUrl}/api/collections/ag_streamers/records`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: slug,
            email,
            password,
            passwordConfirm: password,
            twitch_id: twitchId,
            twitch_name: displayName,
            slug,
            settings: {
              commands: {}
            }
          })
        });
        
        if (!createRes.ok) {
          const errData = await createRes.json();
          console.error('[Streamer Register] Registration failed:', errData);
          throw new Error(errData.message || 'Registration failed');
        }
        
        record = await createRes.json();
        console.log(`[Streamer Register] Streamer registered successfully: ${record.twitch_name}`);
      }

      console.log(`[Streamer Register] Logging in to PocketBase...`);
      const loginRes = await this.pbClient.login(slug, password);
      if (loginRes.success) {
        console.log(`[Streamer Register] Logged in successfully to PocketBase!`);
        if (loginRes.record && loginRes.record.settings) {
          const dbSettings = loginRes.record.settings;
          
          if (dbSettings.chatFontSize !== undefined) this.twitchManager.chatFontSize = dbSettings.chatFontSize;
          if (dbSettings.voteDuration !== undefined) this.twitchManager.voteDuration = dbSettings.voteDuration;
          if (dbSettings.msgWaveStart !== undefined) this.twitchManager.msgWaveStart = dbSettings.msgWaveStart;
          if (dbSettings.msgVoteStart !== undefined) this.twitchManager.msgVoteStart = dbSettings.msgVoteStart;
          if (dbSettings.msgVoteEnd !== undefined) this.twitchManager.msgVoteEnd = dbSettings.msgVoteEnd;
          
          if (dbSettings.commands) {
            for (const [key, val] of Object.entries(dbSettings.commands)) {
              if (this.twitchManager.commands[key]) {
                this.twitchManager.commands[key].enabled = val.enabled !== false;
                if (val.cooldown !== undefined) this.twitchManager.commands[key].cooldown = val.cooldown;
                if (val.bits !== undefined) this.twitchManager.commands[key].bits = val.bits;
                if (val.points !== undefined) this.twitchManager.commands[key].points = val.points;
              }
            }
          }
          this.twitchManager.saveSettings();
        }
      } else {
        console.warn(`[Streamer Register] Login failed: ${loginRes.error}`);
      }
    } catch (err) {
      console.error('[Streamer Register] Error in registration/login flow:', err);
    }
  }

  saveTwitchManagerSettings() {
    this.twitchManager.saveSettings();
    if (this.pbClient.isAuthenticated()) {
      const commandConfig = {};
      for (const [key, val] of Object.entries(this.twitchManager.commands)) {
        commandConfig[key] = {
          enabled: val.enabled,
          cooldown: val.cooldown,
          bits: val.bits || 0,
          redeemId: val.redeemId || ''
        };
      }
      const settings = {
        chatFontSize: this.twitchManager.chatFontSize,
        voteDuration: this.twitchManager.voteDuration,
        msgWaveStart: this.twitchManager.msgWaveStart,
        msgVoteStart: this.twitchManager.msgVoteStart,
        msgVoteEnd: this.twitchManager.msgVoteEnd,
        commands: commandConfig
      };
      this.pbClient.saveSettings(settings);
    }
  }

  startNextWaveFromShop() {
    this.levelManager.wave++;
    this.levelManager.startNextWave();
    this.setState('PLAYING');
    if (this.twitchManager && this.twitchManager.connected) {
      this.twitchManager.sendMessage(`[Aetherweaver] Wave ${this.levelManager.wave} has started! Spawn monsters with !spawn, curse the wizard with !curse, or trigger a !meteor!`);
    }
  }

  updateTwitchStatus() {
    const badge = document.getElementById('hud-twitch-status-badge');
    const container = document.getElementById('hud-twitch-notification');
    const chatOverlay = document.getElementById('hud-twitch-chat');
    
    if (badge && container) {
      if (this.twitchManager && this.twitchManager.enabled !== false && this.twitchManager.connected) {
        container.style.display = 'block';
        badge.innerText = `TWITCH: #${this.twitchManager.channel.toUpperCase()}`;
        badge.style.borderColor = '#9146FF';
        badge.style.color = '#a970ff';
        badge.style.background = 'rgba(145, 70, 255, 0.15)';
        if (chatOverlay) chatOverlay.classList.remove('hidden');
      } else {
        container.style.display = 'none';
        badge.innerText = 'TWITCH: OFF';
        if (chatOverlay) chatOverlay.classList.add('hidden');
      }
    }
  }

  updateShopVoteUI() {
    const sidePanel = document.getElementById('shop-twitch-sidepanel');
    const shopContent = document.querySelector('#panel-shop .menu-content');
    
    if (this.twitchManager && this.twitchManager.enabled !== false && this.twitchManager.connected && this.twitchManager.voteActive) {
      if (sidePanel) sidePanel.style.display = 'flex';
      if (shopContent) shopContent.style.flexDirection = 'row';
      
      const timerEl = document.getElementById('shop-vote-timer');
      if (timerEl) {
        timerEl.innerText = `00:${String(Math.ceil(this.twitchManager.voteTimer)).padStart(2, '0')}`;
      }
      
      const optionsList = document.getElementById('shop-vote-options-list');
      if (optionsList) {
        // Calculate total votes to show percentages
        let totalVotes = 0;
        for (const count of Object.values(this.twitchManager.votes)) {
          totalVotes += count;
        }
        
        // Build HTML for options with progress bars using theme-specific coloring
        let html = '';
        this.twitchManager.voteOptions.forEach(opt => {
          const count = this.twitchManager.votes[opt] || 0;
          const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
          const themeColors = { dungeon: '#95a5a6', gardens: '#2ecc71', underground: '#e67e22', pool: '#3498db', volcanic: '#e74c3c', void_rift: '#a55eea' };
          const color = themeColors[opt] || '#9146ff';
          
          html += `
            <div style="border: 2px solid ${color}; background: rgba(10, 11, 22, 0.7); padding: 8px 12px; font-family: var(--font-pixel); font-size: 8px; text-align: left; position: relative; overflow: hidden; height: 34px; display: flex; align-items: center; box-shadow: 2px 2px 0 rgba(0,0,0,0.6);">
              <div style="position: absolute; top: 0; left: 0; height: 100%; width: ${pct}%; background: ${color}; opacity: 0.25; z-index: 1; transition: width 0.2s ease-out;"></div>
              <div style="position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span style="color: #fff; text-shadow: 1px 1px 0 #000; font-family: var(--font-pixel); font-size: 8px;">!vote ${opt}</span>
                <span style="color: ${color}; font-weight: bold; text-shadow: 1px 1px 0 #000; font-family: var(--font-pixel); font-size: 8px;">${count}</span>
              </div>
            </div>
          `;
        });
        optionsList.innerHTML = html;
      }
    } else {
      if (sidePanel) sidePanel.style.display = 'none';
      if (shopContent) shopContent.style.flexDirection = 'column';
    }
  }

  // Player Account Management
  initPlayerAccountUI() {
    const btnAccountMenu = document.getElementById('btn-player-account-menu');
    const btnCloseAccount = document.getElementById('btn-close-player-account');
    const btnPlayerTwitchLogin = document.getElementById('btn-player-twitch-login');
    const btnLogout = document.getElementById('btn-player-logout');
    const btnSyncNow = document.getElementById('btn-player-sync-now');
    const authStatus = document.getElementById('player-auth-status');
    const profileStatus = document.getElementById('player-profile-status');
    
    if (btnAccountMenu) {
      btnAccountMenu.addEventListener('click', () => {
        this.setState('PLAYER_ACCOUNT');
        this.updatePlayerAccountUI();
      });
    }
    
    if (btnCloseAccount) {
      btnCloseAccount.addEventListener('click', () => {
        this.setState('MENU');
      });
    }
    
    if (btnPlayerTwitchLogin) {
      btnPlayerTwitchLogin.addEventListener('click', async () => {
        if (authStatus) {
          authStatus.style.color = '#f1c40f';
          authStatus.innerText = 'CONTACTING POCKETBASE...';
        }
        
        try {
          const res = await fetch(`${this.pbClient.baseUrl}/api/collections/ag_users/auth-methods`);
          if (!res.ok) throw new Error('Failed to fetch auth methods');
          const data = await res.json();
          const twitchProvider = data.authProviders?.find(p => p.name === 'twitch');
          
          if (!twitchProvider) {
            throw new Error('Twitch OAuth provider is not configured in PocketBase!');
          }
          
          // Store PKCE credentials
          localStorage.setItem('aetherweaver_pb_oauth_state', twitchProvider.state);
          localStorage.setItem('aetherweaver_pb_oauth_verifier', twitchProvider.codeVerifier);
          
          if (authStatus) {
            authStatus.style.color = '#f1c40f';
            authStatus.innerText = 'PLEASE AUTHORIZE IN POPUP WINDOW...';
          }

          // Ensure redirect_uri points back to our own frontend (Single Page Application flow)
          let authUrl = twitchProvider.authUrl;
          const redirectUri = window.location.origin + window.location.pathname;
          try {
            const urlObj = new URL(authUrl);
            urlObj.searchParams.set('redirect_uri', redirectUri);
            authUrl = urlObj.toString();
          } catch (e) {
            console.warn('[Player Auth] Failed to parse authUrl, fallback string replacement:', e);
            if (authUrl.includes('redirect_uri=')) {
              authUrl = authUrl.replace(/redirect_uri=[^&]*/, 'redirect_uri=' + encodeURIComponent(redirectUri));
            } else {
              authUrl += (authUrl.includes('?') ? '&' : '?') + 'redirect_uri=' + encodeURIComponent(redirectUri);
            }
          }

          // Open popup window for authentication
          const width = 500;
          const height = 600;
          const left = window.screenX + (window.outerWidth - width) / 2;
          const top = window.screenY + (window.outerHeight - height) / 2;
          const popup = window.open(authUrl, 'oauth', `width=${width},height=${height},left=${left},top=${top}`);
          
          if (!popup) {
            throw new Error('Popup blocked! Please allow popups for this site.');
          }
        } catch (err) {
          console.error('[Player Auth] Twitch OAuth popup error:', err);
          if (authStatus) {
            authStatus.style.color = '#ff4757';
            authStatus.innerText = `ERROR: ${err.message.toUpperCase()}`;
          }
        }
      });
    }

    // Message listener for popup authentication callback
    if (!this._hasRegisteredPlayerOAuthListener) {
      this._hasRegisteredPlayerOAuthListener = true;
      window.addEventListener('message', async (e) => {
        // Accept messages from the PocketBase backend OR our own frontend origin (for SPA redirects)
        if (e.origin !== this.pbClient.baseUrl && e.origin !== window.location.origin) return;
        
        let data = e.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (err) {
            return;
          }
        }
        
        if (data && data.code && data.state) {
          console.log('[Player OAuth] Valid credentials message received from origin:', e.origin, 'data:', data);
          const storedState = localStorage.getItem('aetherweaver_pb_oauth_state');
          const storedVerifier = localStorage.getItem('aetherweaver_pb_oauth_verifier');
          
          if (data.state !== storedState) {
            console.error('[Player OAuth] State check failed (CSRF protection)');
            return;
          }
          
          localStorage.removeItem('aetherweaver_pb_oauth_state');
          localStorage.removeItem('aetherweaver_pb_oauth_verifier');
          
          this.setState('PLAYER_ACCOUNT');
          const authStatus = document.getElementById('player-auth-status');
          if (authStatus) {
            authStatus.style.color = '#f1c40f';
            authStatus.innerText = 'LOGGING IN WITH TWITCH...';
          }
          
          const exchangeRedirectUrl = data.redirectUrl || `${this.pbClient.baseUrl}/api/oauth2-redirect`;
          const res = await this.pbClient.loginPlayerWithOAuth2('twitch', data.code, storedVerifier, exchangeRedirectUrl);
          if (res.success) {
            if (authStatus) {
              authStatus.style.color = '#2ecc71';
              authStatus.innerText = 'LOGGED IN SUCCESSFULLY!';
            }
            await this.loadPlayerDataFromCloud();
            setTimeout(() => {
              this.updatePlayerAccountUI();
            }, 1000);
          } else {
            if (authStatus) {
              authStatus.style.color = '#ff4757';
              authStatus.innerText = `ERROR: ${res.error.toUpperCase()}`;
            }
          }
        }
      });
    }
    
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        this.pbClient.playerLogout();
        this.updatePlayerAccountUI();
      });
    }
    
    if (btnSyncNow) {
      btnSyncNow.addEventListener('click', async () => {
        if (profileStatus) {
          profileStatus.style.color = '#f1c40f';
          profileStatus.innerText = 'SYNCING TO CLOUD...';
        }
        const res = await this.syncPlayerDataToCloud();
        if (res.success) {
          if (profileStatus) {
            profileStatus.style.color = '#2ecc71';
            profileStatus.innerText = `SYNCED AT ${new Date().toLocaleTimeString()}`;
          }
        } else {
          if (profileStatus) {
            profileStatus.style.color = '#ff4757';
            profileStatus.innerText = `SYNC ERROR: ${res.error.toUpperCase()}`;
          }
        }
      });
    }
  }

  // Parse Player Twitch OAuth redirect query parameters (code, state)
  async parsePlayerOAuthRedirect() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    
    if (code && state) {
      console.log('[Player OAuth] Found auth code and state. Authenticating...');
      
      // Clean query parameters from address bar instantly
      const cleanUrl = window.location.pathname + window.location.search.replace(/[?&]code=[^&]+/, '').replace(/[?&]state=[^&]+/, '').replace(/^\?$/, '');
      history.replaceState(null, document.title, window.location.origin + cleanUrl);
      
      const storedState = localStorage.getItem('aetherweaver_pb_oauth_state');
      const storedVerifier = localStorage.getItem('aetherweaver_pb_oauth_verifier');
      
      if (state !== storedState) {
        console.error('[Player OAuth] State check failed (CSRF protection)');
        return;
      }
      
      // Clean up storage
      localStorage.removeItem('aetherweaver_pb_oauth_state');
      localStorage.removeItem('aetherweaver_pb_oauth_verifier');
      
      this.setState('PLAYER_ACCOUNT');
      const authStatus = document.getElementById('player-auth-status');
      if (authStatus) {
        authStatus.style.color = '#f1c40f';
        authStatus.innerText = 'LOGGING IN WITH TWITCH...';
      }
      
      const redirectUrl = window.location.origin + window.location.pathname;
      const res = await this.pbClient.loginPlayerWithOAuth2('twitch', code, storedVerifier, redirectUrl);
      if (res.success) {
        if (authStatus) {
          authStatus.style.color = '#2ecc71';
          authStatus.innerText = 'LOGGED IN SUCCESSFULLY!';
        }
        await this.loadPlayerDataFromCloud();
        setTimeout(() => {
          this.updatePlayerAccountUI();
        }, 1000);
      } else {
        if (authStatus) {
          authStatus.style.color = '#ff4757';
          authStatus.innerText = `ERROR: ${res.error.toUpperCase()}`;
        }
      }
    }
  }

  // Controls Keybinds system initialization
  initKeybinds() {
    this.keybinds = {
      move_up: 'w',
      move_down: 's',
      move_left: 'a',
      move_right: 'd',
      cast_utility: ' ',
      cast_ultimate: 'q',
      cast_extra: 'e',
      cast_slot6: '1',
      cast_slot7: '2'
    };
    this.detectedLayout = 'QWERTY';
    this.remappingAction = null;

    const saved = localStorage.getItem('aetherweaver_keybinds');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.keybinds = { ...this.keybinds, ...parsed };
        this.detectedLayout = localStorage.getItem('aetherweaver_layout') || 'QWERTY';
        return;
      } catch (e) {
        console.warn('Failed to parse saved keybinds:', e);
      }
    }

    // Try detecting layout map dynamically
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
      navigator.keyboard.getLayoutMap().then(layoutMap => {
        if (layoutMap.get('KeyW') === 'z' || layoutMap.get('KeyQ') === 'a') {
          this.detectedLayout = 'AZERTY';
          this.keybinds.move_up = 'z';
          this.keybinds.move_left = 'q';
          this.keybinds.cast_ultimate = 'a';
          localStorage.setItem('aetherweaver_layout', 'AZERTY');
          localStorage.setItem('aetherweaver_keybinds', JSON.stringify(this.keybinds));
          console.log('[Controls] Keyboard layout auto-detected: AZERTY. Movement keys mapped to ZQSD.');
        } else {
          this.detectedLayout = 'QWERTY';
          localStorage.setItem('aetherweaver_layout', 'QWERTY');
          localStorage.setItem('aetherweaver_keybinds', JSON.stringify(this.keybinds));
          console.log('[Controls] Keyboard layout auto-detected: QWERTY.');
        }
        const lbl = document.getElementById('lbl-detected-layout');
        if (lbl) lbl.innerText = this.detectedLayout;
        this.renderKeybindList();
      }).catch(err => {
        console.warn('[Controls] Keyboard API map failed, attempting language fallback:', err);
        this.fallbackLanguageLayoutCheck();
      });
    } else {
      this.fallbackLanguageLayoutCheck();
    }
  }

  fallbackLanguageLayoutCheck() {
    const lang = navigator.language || '';
    if (lang.startsWith('fr') || lang.startsWith('be')) {
      this.detectedLayout = 'AZERTY';
      this.keybinds.move_up = 'z';
      this.keybinds.move_left = 'q';
      this.keybinds.cast_ultimate = 'a';
      console.log('[Controls] Language check fallback: AZERTY layout chosen.');
    } else {
      this.detectedLayout = 'QWERTY';
      console.log('[Controls] Language check fallback: QWERTY layout chosen.');
    }
    localStorage.setItem('aetherweaver_layout', this.detectedLayout);
    localStorage.setItem('aetherweaver_keybinds', JSON.stringify(this.keybinds));
  }

  // Render remappable keybind elements list dynamically
  renderKeybindList() {
    const listEl = document.getElementById('settings-keybinds-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const actions = [
      { id: 'move_up', label: 'MOVE UP' },
      { id: 'move_down', label: 'MOVE DOWN' },
      { id: 'move_left', label: 'MOVE LEFT' },
      { id: 'move_right', label: 'MOVE RIGHT' },
      { id: 'cast_utility', label: 'CAST DASH' },
      { id: 'cast_ultimate', label: 'CAST ULTIMATE' },
      { id: 'cast_extra', label: 'CAST EXTRA' },
      { id: 'cast_slot6', label: 'CAST SLOT 6' },
      { id: 'cast_slot7', label: 'CAST SLOT 7' }
    ];

    const formatKey = (key) => {
      if (key === ' ') return 'SPACE';
      if (key === 'arrowup') return 'UP ARROW';
      if (key === 'arrowdown') return 'DOWN ARROW';
      if (key === 'arrowleft') return 'LEFT ARROW';
      if (key === 'arrowright') return 'RIGHT ARROW';
      return key.toUpperCase();
    };

    actions.forEach(action => {
      const row = document.createElement('div');
      row.className = 'keybind-row';
      
      const label = document.createElement('span');
      label.className = 'keybind-label';
      label.innerText = action.label;

      const btn = document.createElement('button');
      btn.className = 'keybind-btn';
      if (this.remappingAction === action.id) {
        btn.classList.add('waiting');
        btn.innerText = '> ??? <';
      } else {
        btn.innerText = formatKey(this.keybinds[action.id]);
      }

      btn.addEventListener('click', () => {
        this.remappingAction = action.id;
        this.renderKeybindList();
      });

      row.appendChild(label);
      row.appendChild(btn);
      listEl.appendChild(row);
    });
  }

  updatePlayerAccountUI() {
    const authBox = document.getElementById('player-auth-section');
    const profileBox = document.getElementById('player-profile-section');
    
    if (this.pbClient.isPlayerAuthenticated()) {
      if (authBox) authBox.classList.add('hidden');
      if (profileBox) profileBox.classList.remove('hidden');
      
      const record = this.pbClient.playerRecord;
      const progressStr = localStorage.getItem('aetherweaver_save');
      const progress = progressStr ? JSON.parse(progressStr) : {};
      
      const nickEl = document.getElementById('player-profile-nickname');
      if (nickEl) nickEl.innerText = record.nickname || record.username || 'Weaver';
      
      const emailEl = document.getElementById('player-profile-email');
      if (emailEl) emailEl.innerText = record.email || 'Cloud Account';
      
      const lvlEl = document.getElementById('prof-stat-level');
      if (lvlEl) lvlEl.innerText = record.level || progress.level || this.player?.level || 1;
      
      const rebEl = document.getElementById('prof-stat-rebirths');
      if (rebEl) rebEl.innerText = progress.rebirthCount || this.player?.rebirthCount || 0;
      
      const shdEl = document.getElementById('prof-stat-shards');
      if (shdEl) shdEl.innerText = progress.shards || this.player?.shards || 0;
      
      const chpEl = document.getElementById('prof-stat-chapter');
      if (chpEl) chpEl.innerText = record.chapter_unlocked || progress.chapterUnlocked || this.player?.chapterUnlocked || 1;
      
      const hscEl = document.getElementById('prof-stat-highscore');
      if (hscEl) hscEl.innerText = record.high_score || progress.high_score || 0;
    } else {
      if (authBox) authBox.classList.remove('hidden');
      if (profileBox) profileBox.classList.add('hidden');
    }
  }

  scheduleCloudSync() {
    if (this._cloudSyncTimer) return;
    this._cloudSyncTimer = setTimeout(async () => {
      this._cloudSyncTimer = null;
      await this.syncPlayerDataToCloud();
    }, 5000);
  }

  async syncPlayerDataToCloud() {
    if (!this.pbClient.isPlayerAuthenticated()) return { success: false, error: 'Not authenticated' };
    const data = localStorage.getItem('aetherweaver_save');
    if (!data) return { success: false, error: 'No local save data' };
    
    const progress = JSON.parse(data);
    const stats = {
      high_score: progress.high_score || 0,
      level: this.player?.level || progress.level || 1,
      wave: this.levelManager?.wave || 1,
      chapter_unlocked: this.player?.chapterUnlocked || progress.chapterUnlocked || 1,
      nickname: this.pbClient.playerRecord.nickname || this.pbClient.playerRecord.username || 'Weaver'
    };
    
    const res = await this.pbClient.savePlayerData(progress, stats);
    if (res.success) {
      console.log('[PocketBase] Auto-synced data to cloud.');
    }
    return res;
  }

  async loadPlayerDataFromCloud() {
    if (!this.pbClient.isPlayerAuthenticated() || !this.pbClient.playerRecord) return false;
    const record = this.pbClient.playerRecord;
    if (record.save_data) {
      console.log('[PocketBase] Applying cloud save data...');
      localStorage.setItem('aetherweaver_save', JSON.stringify(record.save_data));
      if (this.player) {
        this.player.loadGameState();
        this.player.recalculateModifiers(this.abilityTree);
      }
      this.updateHUD();
      return true;
    }
    return false;
  }

  // Visual Level Builder Management
  initBuilderGrid() {
    this.builderGrid = [];
    for (let x = 0; x < 50; x++) {
      this.builderGrid[x] = new Array(50).fill('.');
    }
    for (let x = 0; x < 50; x++) {
      this.builderGrid[x][0] = '#';
      this.builderGrid[x][49] = '#';
    }
    for (let y = 0; y < 50; y++) {
      this.builderGrid[0][y] = '#';
      this.builderGrid[49][y] = '#';
    }
    this.builderTheme = 'dungeon';
    this.builderActiveBrush = '1';
  }

  drawBuilderGrid() {
    const canvas = document.getElementById('builder-grid-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const tileSize = 40;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let tx = 0; tx < 50; tx++) {
      for (let ty = 0; ty < 50; ty++) {
        const char = this.builderGrid[tx][ty];
        const rx = tx * tileSize;
        const ry = ty * tileSize;
        
        ctx.fillStyle = '#121320';
        ctx.fillRect(rx, ry, tileSize, tileSize);
        ctx.strokeStyle = '#0e0f18';
        ctx.lineWidth = 1;
        ctx.strokeRect(rx, ry, tileSize, tileSize);
        
        if (char === '#') {
          ctx.fillStyle = '#2c1111';
          ctx.fillRect(rx, ry, tileSize, tileSize);
          ctx.strokeStyle = '#1a0808';
          ctx.strokeRect(rx, ry, tileSize, tileSize);
        } else if (char === 'P') {
          ctx.fillStyle = '#70a1ff';
          ctx.beginPath();
          ctx.arc(rx + 20, ry + 20, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = '8px monospace';
          ctx.fillText("P", rx + 17, ry + 23);
        } else if (char === 'C') {
          ctx.fillStyle = '#eccc68';
          ctx.fillRect(rx + 10, ry + 12, 20, 16);
          ctx.fillStyle = '#fff';
          ctx.font = '8px monospace';
          ctx.fillText("C", rx + 18, ry + 22);
        } else if (char === 'S') {
          ctx.fillStyle = '#7d5fff';
          ctx.fillRect(rx + 12, ry + 12, 16, 16);
          ctx.fillStyle = '#fff';
          ctx.font = '8px monospace';
          ctx.fillText("S", rx + 18, ry + 22);
        } else if (char === 'D') {
          ctx.fillStyle = '#ff6b6b';
          ctx.fillRect(rx + 6, ry + 6, 28, 28);
          ctx.fillStyle = '#fff';
          ctx.font = '8px monospace';
          ctx.fillText("D", rx + 18, ry + 22);
        } else if (char === 'H') {
          ctx.fillStyle = '#2ed573';
          ctx.beginPath();
          ctx.arc(rx + 20, ry + 20, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = '8px monospace';
          ctx.fillText("H", rx + 18, ry + 23);
        } else if (char === 'T') {
          ctx.fillStyle = '#10ac84';
          ctx.beginPath();
          ctx.arc(rx + 20, ry + 20, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = '8px monospace';
          ctx.fillText("T", rx + 18, ry + 23);
        } else if (char === 'L') {
          ctx.fillStyle = '#ff9f43';
          ctx.fillRect(rx + 8, ry + 8, 24, 24);
          ctx.fillStyle = '#fff';
          ctx.font = '8px monospace';
          ctx.fillText("L", rx + 18, ry + 22);
        } else if (char === 'V') {
          ctx.fillStyle = '#54a0ff';
          ctx.beginPath();
          ctx.arc(rx + 20, ry + 20, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = '8px monospace';
          ctx.fillText("V", rx + 17, ry + 23);
        } else if (char === 'B') {
          ctx.fillStyle = '#ff4757';
          ctx.fillRect(rx + 4, ry + 4, 32, 32);
          ctx.fillStyle = '#fff';
          ctx.font = '8px monospace';
          ctx.fillText("BOSS", rx + 8, ry + 22);
        } else if (char === 'e') {
          ctx.fillStyle = '#a4b0be';
          ctx.beginPath();
          ctx.arc(rx + 20, ry + 20, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#2ed573';
          ctx.font = '8px monospace';
          ctx.fillText("e", rx + 18, ry + 23);
        } else if (char === 'k') {
          ctx.fillStyle = '#a4b0be';
          ctx.beginPath();
          ctx.arc(rx + 20, ry + 20, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ff4757';
          ctx.font = '8px monospace';
          ctx.fillText("k", rx + 18, ry + 23);
        } else if (char === 'r') {
          ctx.fillStyle = '#a4b0be';
          ctx.beginPath();
          ctx.arc(rx + 20, ry + 20, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#a55eea';
          ctx.font = '8px monospace';
          ctx.fillText("r", rx + 18, ry + 23);
        }
      }
    }
  }

  initLevelBuilderUI() {
    this.initBuilderGrid();
    
    const btnBuilderMenu = document.getElementById('btn-level-builder-menu');
    const btnExit = document.getElementById('btn-builder-exit');
    const btnClear = document.getElementById('btn-builder-clear');
    const btnSave = document.getElementById('btn-builder-save');
    const btnLoad = document.getElementById('btn-builder-load');
    const btnExport = document.getElementById('btn-builder-export');
    const fileImport = document.getElementById('builder-import-file');
    const btnTest = document.getElementById('btn-builder-test');
    const themeSelect = document.getElementById('builder-theme-select');
    const canvas = document.getElementById('builder-grid-canvas');
    
    if (btnBuilderMenu) {
      btnBuilderMenu.classList.toggle('hidden', !this.isLocalDev);
      btnBuilderMenu.addEventListener('click', () => {
        this.setState('LEVEL_BUILDER');
        this.drawBuilderGrid();
      });
    }
    
    if (btnExit) {
      btnExit.addEventListener('click', () => {
        this.setState('MENU');
      });
    }
    
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (confirm("Clear the entire layout?")) {
          this.initBuilderGrid();
          this.drawBuilderGrid();
        }
      });
    }
    
    if (btnSave) {
      btnSave.addEventListener('click', () => {
        localStorage.setItem('aetherweaver_builder_save', JSON.stringify({
          grid: this.builderGrid,
          theme: this.builderTheme
        }));
        alert("Layout saved successfully to Local Slot!");
      });
    }
    
    if (btnLoad) {
      btnLoad.addEventListener('click', () => {
        const saved = localStorage.getItem('aetherweaver_builder_save');
        if (saved) {
          const data = JSON.parse(saved);
          this.builderGrid = data.grid;
          this.builderTheme = data.theme || 'dungeon';
          if (themeSelect) themeSelect.value = this.builderTheme;
          this.drawBuilderGrid();
          alert("Layout loaded successfully!");
        } else {
          alert("No saved layout found in Slot.");
        }
      });
    }
    
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        const payload = {
          grid: this.builderGrid,
          theme: this.builderTheme
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `custom_level_${this.builderTheme}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }
    
    if (fileImport) {
      fileImport.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const data = JSON.parse(evt.target.result);
            if (data.grid && Array.isArray(data.grid)) {
              this.builderGrid = data.grid;
              this.builderTheme = data.theme || 'dungeon';
              if (themeSelect) themeSelect.value = this.builderTheme;
              this.drawBuilderGrid();
              alert("Layout imported successfully!");
            } else {
              alert("Invalid layout format.");
            }
          } catch (err) {
            alert("Error reading JSON file.");
          }
        };
        reader.readAsText(file);
      });
    }
    
    if (themeSelect) {
      themeSelect.addEventListener('change', (e) => {
        this.builderTheme = e.target.value;
      });
    }
    
    const brushButtons = document.querySelectorAll('.builder-brush-btn');
    const brushLbl = document.getElementById('builder-active-brush-lbl');
    brushButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        brushButtons.forEach(b => {
          b.classList.remove('active');
          b.style.background = 'transparent';
          b.style.color = '#aaa';
        });
        btn.classList.add('active');
        btn.style.background = 'rgba(255,255,255,0.05)';
        btn.style.color = '#fff';
        
        this.builderActiveBrush = btn.getAttribute('data-brush');
        if (brushLbl) brushLbl.innerText = btn.innerText;
      });
    });
    
    let isDrawing = false;
    
    const getTileCoords = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      return {
        tx: Math.floor(x / 40),
        ty: Math.floor(y / 40)
      };
    };
    
    const paintTile = (tx, ty) => {
      if (tx <= 0 || tx >= 49 || ty <= 0 || ty >= 49) return;
      
      let char = '.';
      if (this.builderActiveBrush === '0') char = '.';
      else if (this.builderActiveBrush === '1') char = '#';
      else if (this.builderActiveBrush === 'P') {
        for (let x = 0; x < 50; x++) {
          for (let y = 0; y < 50; y++) {
            if (this.builderGrid[x][y] === 'P') this.builderGrid[x][y] = '.';
          }
        }
        char = 'P';
      }
      else if (this.builderActiveBrush === 'C') char = 'C';
      else if (this.builderActiveBrush === 'S') char = 'S';
      else if (this.builderActiveBrush === 'D') char = 'D';
      else if (this.builderActiveBrush === 'H') char = 'H';
      else if (this.builderActiveBrush === 'T') char = 'T';
      else if (this.builderActiveBrush === 'L') char = 'L';
      else if (this.builderActiveBrush === 'V') char = 'V';
      else if (this.builderActiveBrush === 'B') char = 'B';
      else if (this.builderActiveBrush === 'E_slime') char = 'e';
      else if (this.builderActiveBrush === 'E_skeleton') char = 'k';
      else if (this.builderActiveBrush === 'E_horror') char = 'r';
      else if (this.builderActiveBrush === 'eraser') char = '.';
      
      this.builderGrid[tx][ty] = char;
      this.drawBuilderGrid();
    };
    
    if (canvas) {
      canvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        const coords = getTileCoords(e);
        paintTile(coords.tx, coords.ty);
      });
      
      canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        const coords = getTileCoords(e);
        paintTile(coords.tx, coords.ty);
      });
      
      window.addEventListener('mouseup', () => {
        isDrawing = false;
      });
    }
    
    if (btnTest) {
      btnTest.addEventListener('click', () => {
        let spawnExists = false;
        for (let x = 0; x < 50; x++) {
          for (let y = 0; y < 50; y++) {
            if (this.builderGrid[x][y] === 'P') spawnExists = true;
          }
        }
        
        if (!spawnExists) {
          alert("Error: You must place a Player Spawn (P) point before testing!");
          return;
        }
        
        const layout = [];
        for (let y = 0; y < 50; y++) {
          let row = '';
          for (let x = 0; x < 50; x++) {
            row += this.builderGrid[x][y];
          }
          layout.push(row);
        }
        
        this.isStoryMode = false;
        this.isCustomLevel = true;
        this.loadedLevelLayout = layout;
        this.loadedLevelTheme = this.builderTheme;
        
        this.startNewGame();
      });
    }
  }

  // Story Mode Management
  initStoryModeUI() {
    console.log("[StoryMode] Initializing Story Mode UI event listeners...");
    const btnOpenStory = document.getElementById('btn-open-story-chapters');
    const btnCloseStory = document.getElementById('btn-close-story-chapters');
    
    if (btnOpenStory) {
      console.log("[StoryMode] Found btn-open-story-chapters button in DOM, binding click listener.");
      btnOpenStory.addEventListener('click', () => {
        console.log("[StoryMode] btn-open-story-chapters clicked!");
        this.setState('STORY_CHAPTERS');
        this.renderStoryChapters();
      });
    } else {
      console.warn("[StoryMode] btn-open-story-chapters not found in DOM!");
    }
    
    if (btnCloseStory) {
      btnCloseStory.addEventListener('click', () => {
        this.setState('PLAY_MENU');
      });
    }
  }

  renderStoryChapters() {
    const listEl = document.getElementById('story-chapters-list');
    if (!listEl) {
      console.warn("[StoryMode] story-chapters-list element not found in DOM!");
      return;
    }
    listEl.innerHTML = '';
    
    const unlockedChapter = this.player?.chapterUnlocked || 1;
    console.log(`[StoryMode] Rendering story chapters. Player's unlocked chapter: ${unlockedChapter}`);
    
    StoryLevels.forEach(level => {
      const isUnlocked = level.chapter <= unlockedChapter;
      
      const card = document.createElement('div');
      card.className = `chapter-card ${isUnlocked ? 'unlocked' : 'locked'}`;
      card.style.background = isUnlocked ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.4)';
      card.style.border = isUnlocked ? '1px solid rgba(181, 126, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)';
      card.style.padding = '12px';
      card.style.borderRadius = '4px';
      card.style.display = 'flex';
      card.style.justifyContent = 'space-between';
      card.style.alignItems = 'center';
      card.style.fontFamily = 'var(--font-pixel)';
      
      const info = document.createElement('div');
      info.style.textAlign = 'left';
      info.style.flex = '1';
      info.style.paddingRight = '12px';
      
      const title = document.createElement('h3');
      title.style.margin = '0 0 6px 0';
      title.style.fontSize = '10px';
      title.style.color = isUnlocked ? 'var(--color-aether)' : '#666';
      title.innerText = level.title;
      
      const desc = document.createElement('p');
      desc.style.margin = '0';
      desc.style.fontSize = '7px';
      desc.style.color = isUnlocked ? '#aaa' : '#444';
      desc.style.lineHeight = '1.4';
      desc.innerText = level.description;
      
      info.appendChild(title);
      info.appendChild(desc);
      
      const action = document.createElement('div');
      
      if (isUnlocked) {
        const btn = document.createElement('button');
        btn.className = 'btn-menu small';
        btn.style.margin = '0';
        btn.innerText = 'ENTER';
        btn.addEventListener('click', () => {
          this.startStoryChapter(level.chapter);
        });
        action.appendChild(btn);
      } else {
        const lockedBadge = document.createElement('span');
        lockedBadge.style.fontSize = '8px';
        lockedBadge.style.color = '#ff4757';
        lockedBadge.innerText = 'LOCKED';
        action.appendChild(lockedBadge);
      }
      
      card.appendChild(info);
      card.appendChild(action);
      listEl.appendChild(card);
    });
  }

  startStoryChapter(chapterNum) {
    const level = StoryLevels.find(l => l.chapter === chapterNum);
    if (!level) return;
    
    this.isStoryMode = true;
    this.isCustomLevel = false;
    this.storyChapter = chapterNum;
    this.loadedLevelLayout = level.map;
    this.loadedLevelTheme = level.theme;
    
    this.startNewGame();
  }

  triggerStoryWin() {
    console.log(`[STORY] Won chapter ${this.storyChapter}!`);
    const nextChapter = this.storyChapter + 1;
    if (nextChapter > this.player.chapterUnlocked) {
      this.player.chapterUnlocked = Math.min(5, nextChapter);
    }
    
    const rewardAp = this.storyChapter * 5;
    const rewardShards = this.storyChapter * 100;
    this.player.ap += rewardAp;
    this.player.shards += rewardShards;
    
    this.player.saveGameState();
    
    alert(`CHAPTER COMPLETE!\n\nUnlocked chapter: ${Math.min(5, nextChapter)}\nReward: +${rewardAp} AP, +${rewardShards} Shards!`);
    
    this.isStoryMode = false;
    this.isCustomLevel = false;
    this.setState('STORY_CHAPTERS');
  }
}
