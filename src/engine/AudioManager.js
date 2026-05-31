/**
 * AudioManager - File-based audio using BrowserQuest assets
 * Music tracks loop and cycle across gameplay; SFX are one-shots.
 */
export class AudioManager {
  constructor() {
    this.isMuted = false;
    this.initialized = false;

    // Master volume levels
    this.musicVolume = 0.35;
    this.sfxVolume   = 0.55;

    // Active music element
    this._musicEl = null;
    this._musicIndex = 0;

    // Music playlist — varied enough that cycling feels intentional
    this._playlist = [
      'audio/music/forest.ogg',
      'audio/music/cave.ogg',
      'audio/music/lavaland.ogg',
      'audio/music/freezingland.ogg',
      'audio/music/desert.ogg',
      'audio/music/temple.ogg',
      'audio/music/boss.ogg',
    ];

    // SFX pool: keyed name → one or more paths (picks randomly if multiple)
    this._sfx = {
      shoot:       ['audio/sounds/fireball.ogg',       'audio/sounds/skill-flame.ogg'],
      hit:         ['audio/sounds/hit1.ogg',           'audio/sounds/hit2.ogg'],
      hurt:        ['audio/sounds/hurt.ogg'],
      collect:     ['audio/sounds/loot.ogg'],
      levelup:     ['audio/sounds/levelup.ogg'],
      buy:         ['audio/sounds/chest.ogg'],
      click:       ['audio/sounds/lever.ogg'],
      unlock:      ['audio/sounds/skill-magic.ogg'],
      statechange: ['audio/sounds/npc.ogg'],
      rebirth:     ['audio/sounds/revive.ogg'],
      teleport:    ['audio/sounds/teleport.ogg'],
      freeze:      ['audio/sounds/skill-cold.ogg',     'audio/sounds/iceball.ogg'],
      lightning:   ['audio/sounds/skill-lightning.ogg'],
      explosion:   ['audio/sounds/magic-blast.ogg'],
      kill:        ['audio/sounds/kill1.ogg',          'audio/sounds/kill2.ogg'],
      death:       ['audio/sounds/death.ogg'],
    };
  }

  // ─────────────────────────────────────────────
  // Init (call on first user interaction)
  // ─────────────────────────────────────────────
  init() {
    if (this.initialized) return;
    this.initialized = true;
    this._startMusic();
  }

  // ─────────────────────────────────────────────
  // Mute toggle
  // ─────────────────────────────────────────────
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this._musicEl) {
      this._musicEl.muted = this.isMuted;
    }
    return this.isMuted;
  }

  setMusicVolume(vol) {
    this.musicVolume = vol;
    if (this._musicEl) {
      this._musicEl.volume = this.isMuted ? 0 : this.musicVolume;
    }
  }

  setSfxVolume(vol) {
    this.sfxVolume = vol;
  }

  // ─────────────────────────────────────────────
  // Music
  // ─────────────────────────────────────────────
  _startMusic() {
    this.updateMusicForTheme('dungeon', false);
  }

  updateMusicForTheme(theme, isBoss) {
    if (!this.initialized) return;

    let track = 'audio/music/temple.ogg'; // default for dungeon
    if (isBoss) {
      track = 'audio/music/boss.ogg';
    } else {
      if (theme === 'gardens') track = 'audio/music/forest.ogg';
      else if (theme === 'underground') track = 'audio/music/cave.ogg';
      else if (theme === 'pool') track = 'audio/music/freezingland.ogg';
      else if (theme === 'backrooms') track = 'audio/music/desert.ogg';
    }
    
    // Check if it's already playing the correct track
    if (this._musicEl && this._currentTrackSrc === track && !this._musicEl.paused) {
      return; // Already playing
    }
    
    this._currentTrackSrc = track;
    this.playTrack(track);
  }

  playTrack(src) {
    if (this._musicEl) {
      this._musicEl.pause();
      this._musicEl.onended = null;
    }
    
    const el = new Audio(src);
    el.volume = this.isMuted ? 0 : this.musicVolume;
    el.muted = this.isMuted;
    el.loop = true; // Loop the region's music
    
    el.onerror = () => {
      const mp3 = src.replace('.ogg', '.mp3');
      if (!el._triedMp3 && mp3 !== src) {
        el._triedMp3 = true;
        el.src = mp3;
        el.load();
        el.play().catch(() => {});
      }
    };
    
    this._musicEl = el;
    el.play().catch(() => {});
  }

  // ─────────────────────────────────────────────
  // SFX helper
  // ─────────────────────────────────────────────
  _playSfx(key, volumeScale = 1.0) {
    if (!this.initialized || this.isMuted) return;
    const paths = this._sfx[key];
    if (!paths || paths.length === 0) return;

    const src = paths[Math.floor(Math.random() * paths.length)];
    // Fresh Audio element each time so rapid SFX don't cut each other off
    const el = new Audio(src);
    el.volume = Math.min(1, this.sfxVolume * volumeScale);

    el.onerror = () => {
      const mp3 = src.replace('.ogg', '.mp3');
      if (!el._triedMp3 && mp3 !== src) {
        el._triedMp3 = true;
        el.src = mp3;
        el.load();
        el.play().catch(() => {});
      }
    };

    el.play().catch(() => {});
  }

  // ─────────────────────────────────────────────
  // Public SFX API — same surface as old AudioManager
  // ─────────────────────────────────────────────
  playShoot()       { this._playSfx('shoot',       0.7); }
  playHit()         { this._playSfx('hit',          0.8); }
  playHurt()        { this._playSfx('hurt',         1.0); }
  playCollect()     { this._playSfx('collect',      0.9); }
  playLevelUp()     { this._playSfx('levelup',      1.0); }
  playBuy()         { this._playSfx('buy',          0.9); }
  playClick()       { this._playSfx('click',        0.6); }
  playUnlock()      { this._playSfx('unlock',       1.0); }
  playStateChange() { this._playSfx('statechange',  0.7); }
  playRebirth()     { this._playSfx('rebirth',      1.0); }

  // Bonus SFX for spells — call these from Game.js where appropriate
  playTeleport()    { this._playSfx('teleport',     0.9); }
  playFreeze()      { this._playSfx('freeze',       0.8); }
  playLightning()   { this._playSfx('lightning',    0.8); }
  playExplosion()   { this._playSfx('explosion',    0.9); }
  playKill()        { this._playSfx('kill',         0.6); }
  playDeath()       { this._playSfx('death',        1.0); }

  // ─────────────────────────────────────────────
  // Stubs — old procedural API (no-ops, kept so nothing crashes)
  // ─────────────────────────────────────────────
  playTone()  {}
  playNoise() {}
}
