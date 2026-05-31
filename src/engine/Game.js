/**
 * Game - Main Orchestrator and Game Loop Manager
 */
import { AssetManager } from './AssetManager.js';
import { ParticleSystem } from './ParticleSystem.js';
import { AbilityTree } from './AbilityTree.js';
import { LevelManager } from './LevelManager.js';
import { AudioManager } from './AudioManager.js';
import { Player, RELICS_CATALOG, EQUIPMENT_CATALOG } from '../entities/Player.js';
import { Enemy } from '../entities/Enemy.js';
import { Companion } from '../entities/Companion.js';
import { SPELL_TYPES, SpellBook, processCombo } from './Spells.js';

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
    
    // Initialize settings fields with default values
    this.enableScreenShake = true;
    this.enableGlowEffects = true;
    this.showDamageNumbers = true;
    this.showEnemyHealthbars = true;
    this.showFloorGrid = true;
    this.lowParticleMode = false;
    this.showSpellTrails = true;
    this.isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    this.devtoolsVisible = false;
    this.customPresetIdx = 0;
    
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
    
    this.treeCanvas = document.getElementById('tree-canvas');
    this.treeCtx = this.treeCanvas.getContext('2d');
    this.resizeTreeCanvas();
    this.initTreeListeners();
    
    this.drawHTMLIcons();

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
      const key = e.key.toLowerCase();
      this.keys[key] = true;
      
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
          for (const k in this.abilityTree.nodes) {
            const node = this.abilityTree.nodes[k];
            if (node.view === this.abilityTree.currentView && !node.unlocked) {
              node.unlocked = true;
              unlockedCount++;
            }
          }
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

        if (key === ' ' || key === 'spacebar') {
          e.preventDefault();
          this.player.castSpell('utility', playerAngle);
        } else if (key === 'q') {
          this.player.castSpell('ultimate', playerAngle);
        } else if (key === 'e') {
          this.player.castSpell('extra', playerAngle);
        } else if (key === '1' && this.player.maxSpellSlots >= 6) {
          this.player.castSpell('slot6', playerAngle);
        } else if (key === '2' && this.player.maxSpellSlots >= 7) {
          this.player.castSpell('slot7', playerAngle);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
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
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.isLeftMouseDown = false;
      if (e.button === 2) this.isRightMouseDown = false;
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

    const setRenderDistanceUI = (value) => {
      this.renderDistance = parseInt(value);
      const text = `${this.renderDistance}px`;
      if (lblSettingsRender) lblSettingsRender.innerText = text;
      if (sldSettingsRender) { sldSettingsRender.value = value; updateSliderFill(sldSettingsRender); }
      // Update obstacles filter instantly when render distance changes!
      if (this.levelManager) {
        this.levelManager.generateObstacles();
      }
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
      sldSettingsRender.addEventListener('input', (e) => setRenderDistanceUI(e.target.value));
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
    setRenderDistanceUI(this.renderDistance || 1200);
    updateCheckboxesUI();

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
    const btnWiki = document.getElementById('btn-wiki');
    if (btnWiki) {
      btnWiki.addEventListener('click', () => {
        window.open('./wiki/', '_blank');
      });
    }
    const btnCreditsMenu = document.getElementById('btn-credits-menu');
    if (btnCreditsMenu) {
      btnCreditsMenu.addEventListener('click', () => {
        this.setState('CREDITS');
      });
    }
    const btnContactMenu = document.getElementById('btn-contact-menu');
    if (btnContactMenu) {
      btnContactMenu.addEventListener('click', () => {
        this.setState('CONTACT');
      });
    }

    // Play Selector Menu Buttons
    const btnStartWeaver = document.getElementById('btn-start-weaver');
    if (btnStartWeaver) {
      btnStartWeaver.addEventListener('click', () => {
        this.isTutorial = false;
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
        this.setState('MENU');
      });
    }
    const btnCloseLeaderboard = document.getElementById('btn-close-leaderboard');
    if (btnCloseLeaderboard) {
      btnCloseLeaderboard.addEventListener('click', () => {
        this.setState('MENU');
      });
    }
    const btnLeaderboardMenu = document.getElementById('btn-leaderboard-menu');
    if (btnLeaderboardMenu) {
      btnLeaderboardMenu.addEventListener('click', () => {
        this.setState('LEADERBOARD');
      });
    }
    const btnContactClose = document.getElementById('btn-contact-close');
    if (btnContactClose) {
      btnContactClose.addEventListener('click', () => {
        this.setState('MENU');
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
      }
    });

    // Score Submission
    document.getElementById('btn-submit-score').addEventListener('click', () => {
      this.submitHighScore();
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
      this.levelManager.wave++;
      this.levelManager.startNextWave();
      this.setState('PLAYING');
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

    document.querySelectorAll('[data-dev-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.devPreset;
        if (varPathInput) varPathInput.value = preset;
        if (varValueInput) {
          if (preset === 'player.shards') varValueInput.value = String(this.player?.shards ?? 0);
          else if (preset === 'player.ap') varValueInput.value = String(this.player?.ap ?? 0);
          else if (preset === 'player.xp') varValueInput.value = String(this.player?.xp ?? 0);
          else if (preset === 'player.level') varValueInput.value = String(this.player?.level ?? 1);
          else if (preset === 'player.hp') varValueInput.value = String(this.player?.hp ?? 0);
          else if (preset === 'player.mp') varValueInput.value = String(this.player?.mp ?? 0);
        }
      });
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
      `Trails: ${this.showSpellTrails ? 'on' : 'off'}`;

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
      if (key === 'mapRevealed' || key === 'theme') this.updateHUD();
      if (key === 'mapRevealed') this.drawWorldmap();
    } else if (normalizedPath === 'state') {
      this.setState(String(value));
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
      { id: 'the_glitched', name: 'The Glitched', desc: 'Enter the Limitless Backrooms.' },
      { id: 'archon_slayer', name: 'Archon Slayer', desc: 'Defeat the Aether Archon.' },
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
    card.innerHTML = `
      <button class="btn-remove-relic" title="${removeTitle}">x</button>
      <img class="inv-relic-sprite" src="${iconSrc}" alt="${item.name}" draggable="false">
      <div class="inv-relic-name">${item.name}</div>
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
          newTooltip.innerHTML = `<strong style="color:#eccc68">${item.name}</strong><br>${this._statsToString(item.stats)}<br><span style="color:#ff4757;font-size:8px;font-family:var(--font-pixel);display:block;margin-top:4px">(CLICK TO UNEQUIP)</span>`;
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
      } else {
        // Track hovered nodes
        // Convert mouse viewport coord to canvas tree space (where center is 0,0)
        const treeX = (mx - this.treeCanvas.width / 2 - this.abilityTree.panX) / this.abilityTree.zoom;
        const treeY = (my - this.treeCanvas.height / 2 - this.abilityTree.panY) / this.abilityTree.zoom;
        
        let foundNode = null;
        for (const key in this.abilityTree.nodes) {
          const node = this.abilityTree.nodes[key];
          const dist = Math.hypot(node.x - treeX, node.y - treeY);
          const radius = node.type === 'root' ? 14 : node.type === 'keystone' ? 12 : 10;
          
          if (dist < radius + 4) {
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
      if (Math.hypot(e.clientX - this.abilityTree.dragStart.x - this.abilityTree.panX, e.clientY - this.abilityTree.dragStart.y - this.abilityTree.panY) > 8) {
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

    // Reset submission panel
    document.getElementById('leaderboard-submission-box').classList.remove('hidden');
    document.getElementById('submit-status').classList.add('hidden');
    document.getElementById('player-name-input').value = '';

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
    this.state = newState;
    
    if (this.audio) this.audio.playStateChange();
    
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
      newState === 'WORLD_MAP'     ? 'panel-worldmap' :
      newState === 'LEADERBOARD'   ? 'panel-leaderboard' : ''
    );

    if (newState === 'INVENTORY') {
      this.refreshInventoryPanel();
    }
    if (newState === 'WORLD_MAP') {
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
    const overlays = ['panel-main-menu', 'panel-ability-tree', 'panel-game-over', 'panel-leaderboard', 'panel-pause', 'panel-shop', 'panel-inventory', 'panel-worldmap', 'panel-play-menu', 'panel-customize', 'panel-credits', 'panel-contact', 'panel-settings'];
    overlays.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.toggle('hidden', id !== panelId);
      }
    });
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
    this.items.push({
      x,
      y,
      type, // 'shard', 'hp', 'mp'
      value,
      radius: 6,
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
    fetch('/api/leaderboard')
      .then((res) => res.json())
      .then((data) => {
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
      })
      .catch((e) => {
        console.warn("Could not fetch leaderboard data, displaying fallback local values: ", e);
        // Fallback local display
        const body = document.getElementById('leaderboard-body');
        body.innerHTML = '<tr><td colspan="5" class="text-center">Backend leaderboard offline. Play local mode!</td></tr>';
      });
  }

  submitHighScore() {
    const input = document.getElementById('player-name-input');
    const name = input.value.trim();
    if (!name) {
      alert("Please enter a Rune Name!");
      return;
    }

    const payload = {
      name: name,
      score: this.score,
      wave: this.levelManager.wave,
      level: this.player.level
    };

    const statusEl = document.getElementById('submit-status');
    statusEl.innerText = "Submitting score to archives...";
    statusEl.classList.remove('hidden');
    
    fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then((res) => res.json())
      .then(() => {
        statusEl.innerText = "Highscore recorded! Legend saved.";
        document.getElementById('leaderboard-submission-box').classList.add('hidden');
        setTimeout(() => {
          this.setState('LEADERBOARD');
        }, 1500);
      })
      .catch((err) => {
        console.warn("API submission error: ", err);
        statusEl.innerText = "Error submitting score. Leaderboard backend is local-only.";
        statusEl.style.color = '#ff4757';
      });
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
    this.drawHTMLIcon('icon-key-hud', 'icon_key', 12);
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
  updateHUD() {
    if (this.state !== 'PLAYING') return;

    // HP / Mana values
    const hpPct = (this.player.hp / this.player.getMaxHp()) * 100;
    document.getElementById('hud-hp-fill').style.width = `${hpPct}%`;
    document.getElementById('hud-hp-text').innerText = `${Math.ceil(this.player.hp)} / ${this.player.getMaxHp()}`;

    const mpPct = (this.player.mp / this.player.getMaxMp()) * 100;
    document.getElementById('hud-mp-fill').style.width = `${mpPct}%`;
    document.getElementById('hud-mp-text').innerText = `${Math.ceil(this.player.mp)} / ${this.player.getMaxMp()}`;

    // Draw animated avatar in HUD
    const avatarCanvas = document.getElementById('hud-avatar-canvas');
    if (avatarCanvas) {
      const actx = avatarCanvas.getContext('2d');
      actx.clearRect(0, 0, avatarCanvas.width, avatarCanvas.height);
      actx.imageSmoothingEnabled = false;
      const avatarFrame = Math.floor(this.frameIndex * 4) % 3; // Cycle idle/walk frames (0, 1, 2)
      this.assets.draw(actx, 'player', avatarCanvas.width / 2, avatarCanvas.height / 2 + 1, 36, avatarFrame, 0, 1.0);
    }

    // Level & XP
    document.getElementById('hud-level-text').innerText = `Lvl ${this.player.level}`;
    const xpPct = (this.player.xp / this.player.xpNeeded) * 100;
    document.getElementById('hud-xp-fill').style.width = `${xpPct}%`;

    // Wave countdown timer formatting
    document.getElementById('hud-wave-title').innerText = `WAVE ${this.levelManager.wave}`;
    const min = Math.floor(this.levelManager.waveTimer / 60);
    const sec = Math.floor(this.levelManager.waveTimer % 60);
    document.getElementById('hud-wave-timer').innerText = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    document.getElementById('hud-enemies-left').innerText = `Enemies: ${this.enemies.length}`;

    // Shards, Keys and Ability Points indicators
    document.getElementById('hud-shards-value').innerText = this.player.shards;
    const keysValEl = document.getElementById('hud-keys-value');
    if (keysValEl) keysValEl.innerText = this.player.keys || 0;
    
    const apNotif = document.getElementById('hud-ap-notification');
    if (apNotif) {
      document.getElementById('hud-ap-value').innerText = this.player.ap;
    }

    // Show/hide extra slots based on maxSpellSlots
    const slot6El = document.getElementById('spell-slot-6');
    const slot7El = document.getElementById('spell-slot-7');
    if (slot6El) slot6El.classList.toggle('hidden', this.player.maxSpellSlots < 6);
    if (slot7El) slot7El.classList.toggle('hidden', this.player.maxSpellSlots < 7);

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
      const tooltip = slotEl.querySelector('.tooltip');
      const cdOverlay = document.getElementById(`cooldown-${slot.id}`);

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
        
        // Cooldown height overlay scaling
        const activeCD = this.player.spellCooldowns[slot.element];
        const maxCD = this.player.getSpellCooldown(spellId);
        
        if (activeCD > 0 && maxCD > 0) {
          const cdPct = (activeCD / maxCD) * 100;
          cdOverlay.style.height = `${cdPct}%`;
        } else {
          cdOverlay.style.height = '0%';
        }
      } else {
        slotEl.className = 'spell-slot locked';
        const iconCtx = canvas.getContext('2d');
        iconCtx.clearRect(0, 0, 32, 32);
        tooltip.innerText = 'Spell slot locked. Research nodes in the Runic Web to equip magic.';
        cdOverlay.style.height = '0%';
      }
    });

    // Render HUD rune strip — shows equipped runes
    const invContainer = document.getElementById('inventory-container');
    if (invContainer) {
      const runes = this.player.equippedRunes || [];
      const maxSlots = this.player.maxRuneSlots || 6;
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
          tooltip.innerHTML = `<strong>${rune.name}</strong><br>${rune.desc}`;
        } else {
          slotEl.classList.add('empty');
          tooltip.innerHTML = 'Empty Rune Slot';
        }
      }
    }

    // Bottom visual XP bar
    const bottomXpBar = document.getElementById('hud-bottom-xp-bar');
    if (bottomXpBar) {
      bottomXpBar.classList.remove('hidden');
      const bottomXpFill = document.getElementById('hud-bottom-xp-fill');
      const bottomXpText = document.getElementById('hud-bottom-xp-text');
      if (bottomXpFill) {
        bottomXpFill.style.width = `${xpPct}%`;
      }
      if (bottomXpText) {
        bottomXpText.innerText = `XP: ${Math.ceil(this.player.xp)} / ${this.player.xpNeeded}`;
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

    // Prevent huge jumps when tabbing out
    if (dt > 0.1) dt = 0.1;
    this.frameIndex += dt;

    // Enforce tutorial guide visibility every frame — 
    // the guide can ONLY be visible when isTutorial is true
    const tutorialGuide = document.getElementById('tutorial-guide');
    if (tutorialGuide) {
      tutorialGuide.classList.toggle('hidden', !this.isTutorial);
    }

    if (this.state === 'PLAYING') {
      // Update music based on region theme and boss status
      if (this.audio && this.audio.initialized) {
        const isBoss = this.enemies && this.enemies.some(e => e.type === 'archon');
        const theme = this.levelManager ? this.levelManager.theme : 'dungeon';
        this.audio.updateMusicForTheme(theme, isBoss);
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
    this.player.vx = 0;
    this.player.vy = 0;
    if (this.keys['w'] || this.keys['arrowup']) this.player.vy -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) this.player.vy += 1;
    if (this.keys['a'] || this.keys['arrowleft']) this.player.vx -= 1;
    if (this.keys['d'] || this.keys['arrowright']) this.player.vx += 1;
    
    // Normalize diagonal velocity vectors
    if (this.player.vx !== 0 && this.player.vy !== 0) {
      const len = Math.hypot(this.player.vx, this.player.vy);
      this.player.vx /= len;
      this.player.vy /= len;
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
          const dist = Math.hypot(dx, dy);
          if (dist < ae.radius && dist > 0.001) {
            const pullForce = (1.0 - dist / ae.radius) * 160;
            enemy.x += (dx / dist) * pullForce * enemyDt;
            enemy.y += (dy / dist) * pullForce * enemyDt;
          }
        });

        // Pull player into vortex center
        const pDx = ae.x - this.player.x;
        const pDy = ae.y - this.player.y;
        const pDist = Math.hypot(pDx, pDy);
        if (pDist < ae.radius && pDist > 0.001) {
          const pullForce = (1.0 - pDist / ae.radius) * 70;
          this.player.x += (pDx / pDist) * pullForce * dt;
          this.player.y += (pDy / pDist) * pullForce * dt;
        }

        // Pull player fire projectiles and ignite singularity (Supernova Combo!)
        if (this.player.modifiers.supernovaEnabled) {
          for (let p = this.projectiles.length - 1; p >= 0; p--) {
            const proj = this.projectiles[p];
            if (proj.isPlayerOwned && proj.element === SPELL_TYPES.FIRE) {
              const dist = Math.hypot(proj.x - ae.x, proj.y - ae.y);
              if (dist < ae.radius) {
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
          this.enemies.forEach((enemy) => {
            if (enemy.dead) return;
            const dist = Math.hypot(enemy.x - ae.x, enemy.y - ae.y);
            if (dist <= ae.radius) enemy.takeDamage(5, false, this);
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
          this.enemies.forEach((enemy) => {
            if (enemy.dead) return;
            const dist = Math.hypot(enemy.x - ae.x, enemy.y - ae.y);
            if (dist <= ae.radius) {
              enemy.takeDamage(6, false, this);
              if (!enemy.dead) enemy.applyStatus(SPELL_TYPES.FIRE, 3.0);
            }
          });
        }
      }

      else if (ae.type === 'ice_trail') {
        this.enemies.forEach((enemy) => {
          if (enemy.dead) return;
          const dist = Math.hypot(enemy.x - ae.x, enemy.y - ae.y);
          if (dist <= ae.radius) {
            enemy.applyStatus(SPELL_TYPES.FROST, 1.5);
          }
        });
        
        const pDist = Math.hypot(this.player.x - ae.x, this.player.y - ae.y);
        if (pDist <= ae.radius) {
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
        this.enemies.forEach((enemy) => {
          if (enemy.type !== 'warden') {
            const dist = Math.hypot(enemy.x - ae.x, enemy.y - ae.y);
            if (dist <= ae.radius) {
              enemy.applyStatus(SPELL_TYPES.FROST, 0.4); // apply brief freezing slow
            }
          }
        });
      }

      else if (ae.type === 'frost_slow') {
        // Slow down enemies in zone
        this.enemies.forEach((enemy) => {
          const dist = Math.hypot(enemy.x - ae.x, enemy.y - ae.y);
          if (dist <= ae.radius) {
            enemy.applyStatus(SPELL_TYPES.FROST, 0.4);
          }
        });

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
          this.updateHUD();
        }
      }
    }

    // Update Particles
    this.particles.update(dt);

    // Keep HUD synchronized
    this.updateHUD();
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

    // Render floor details / grid sand texture
    this.drawFloorGrid();

    // Draw active area effect circles (e.g. fire/steam clouds)
    this.areaEffects.forEach((ae) => {
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
      let assetKey = 'item_shard';
      if (item.type === 'hp') assetKey = 'item_hp';
      else if (item.type === 'mp') assetKey = 'item_mp';
      else if (item.type === 'relic') assetKey = item.value.sprite;
      this.assets.draw(this.ctx, assetKey, item.x - this.camera.x, item.y - this.camera.y, 16);
    });

    // Draw Obstacles (Pillars, walls)
    this.levelManager.draw(this.ctx, this.camera);

    // Draw Player wizard
    this.player.draw(this.ctx, this.assets, this.frameIndex);

    // Draw Enemies AI characters
    this.enemies.forEach((enemy) => {
      if (!enemy.dead) enemy.draw(this.ctx, this.assets);
    });

    // Draw Companions
    if (this.companions) {
      this.companions.forEach((comp) => comp.draw(this.ctx, this.assets));
    }

    // Draw spell projectiles
    this.projectiles.forEach((proj) => {
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

    // Underground Caverns limited light mechanic
    if (this.levelManager && this.levelManager.theme === 'underground') {
      this.drawUndergroundDarkness();
    }

    this.ctx.restore();

    // Draw Boss Health Bar on top-center if Boss active
    const boss = this.enemies.find((enemy) => enemy.type === 'archon');
    if (boss) {
      this.drawBossHealthBar(boss);
    }

    if (this.state === 'PLAYING') {
      this.drawMinimap();
    }
  }

  drawUndergroundDarkness() {
    this.ctx.save();
    
    // Center at player coordinates (world space)
    const px = this.player.x;
    const py = this.player.y;
    
    // Pulsate the lantern light radius slightly
    const time = Date.now() * 0.003;
    const pulsate = Math.sin(time) * 4;
    const lightRadius = 140 + pulsate;
    
    // Viewport coordinates in world space
    const vx = this.camera.x - 200;
    const vy = this.camera.y - 200;
    const vw = this.canvas.width + 400;
    const vh = this.canvas.height + 400;
    
    // Create radial gradient overlay
    const grad = this.ctx.createRadialGradient(px, py, 25, px, py, lightRadius);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.5, 'rgba(5, 5, 12, 0.45)');
    grad.addColorStop(0.85, 'rgba(5, 5, 12, 0.94)');
    grad.addColorStop(1, 'rgba(5, 5, 12, 0.99)');
    
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(vx, vy, vw, vh);
    
    this.ctx.restore();
  }

  drawFloorGrid() {
    this.levelManager.drawFloor(this.ctx, this.camera, this.canvas.width, this.canvas.height);
  }


  drawBossHealthBar(boss) {
    const bw = 240;
    const bh = 10;
    const bx = (this.canvas.width - bw) / 2;
    const by = 48; // offset below wave timer
    
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
    const scale = Math.min(scaleX, scaleY);
    
    const offsetX = (w - lvl.tileWidth * scale) / 2;
    const offsetY = (h - lvl.tileHeight * scale) / 2;
    
    ctx.save();
    ctx.translate(offsetX, offsetY);
    
    for (let tx = 0; tx < lvl.tileWidth; tx++) {
      for (let ty = 0; ty < lvl.tileHeight; ty++) {
        const explored = lvl.exploredGrid[tx][ty];
        const rx = tx * scale;
        const ry = ty * scale;
        
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
          ctx.fillRect(rx, ry, scale + 0.5, scale + 0.5);
        } else {
          ctx.fillStyle = '#000000';
          ctx.fillRect(rx, ry, scale + 0.5, scale + 0.5);
        }
      }
    }
    
    // Draw shrines (blocky squares)
    lvl.shrines.forEach(shrine => {
      const tx = Math.floor(shrine.x / 40);
      const ty = Math.floor(shrine.y / 40);
      if (lvl.exploredGrid[tx][ty]) {
        ctx.fillStyle = '#70a1ff';
        const sz = Math.max(5, Math.round(scale * 1.5));
        ctx.fillRect(tx * scale + scale / 2 - sz / 2, ty * scale + scale / 2 - sz / 2, sz, sz);
      }
    });
    
    // Draw chests (blocky squares)
    lvl.chests.forEach(chest => {
      const tx = Math.floor(chest.x / 40);
      const ty = Math.floor(chest.y / 40);
      if (lvl.exploredGrid[tx][ty]) {
        ctx.fillStyle = '#eccc68';
        const sz = Math.max(5, Math.round(scale * 1.5));
        ctx.fillRect(tx * scale + scale / 2 - sz / 2, ty * scale + scale / 2 - sz / 2, sz, sz);
      }
    });
    
    // Draw player (blocky bordered square)
    const pTx = Math.floor(this.player.x / 40);
    const pTy = Math.floor(this.player.y / 40);
    ctx.fillStyle = '#ffffff';
    const psz = Math.max(6, Math.round(scale * 1.8));
    ctx.fillRect(pTx * scale + scale / 2 - psz / 2, pTy * scale + scale / 2 - psz / 2, psz, psz);
    ctx.strokeStyle = '#eccc68';
    ctx.lineWidth = 1;
    ctx.strokeRect(pTx * scale + scale / 2 - psz / 2, pTy * scale + scale / 2 - psz / 2, psz, psz);
    
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
        
        if (!this.companions.some(c => c.type === 1)) {
          this.companions.push(new Companion(this, 1, this.player));
        }
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

    if (this.abilityTree.isPlayerTree2Completed()) {
      if (!this.player.unlockedCompanion2) {
        this.player.unlockedCompanion2 = true;
        this.uiNotifyCombo("COMPANION 2 UNLOCKED!", "time");
        this.particles.spawnText(this.player.x, this.player.y - 35, "CHRONO GRIFFIN UNLOCKED!", { color: '#ff9f43', fontSize: 13, fontPixel: true, life: 3.0 });
        
        const tabBtn = document.getElementById('tab-companion2');
        if (tabBtn) tabBtn.classList.remove('hidden');
        
        if (!this.companions.some(c => c.type === 2)) {
          this.companions.push(new Companion(this, 2, this.player));
        }
      }
    }
  }
}
