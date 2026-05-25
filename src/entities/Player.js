/**
 * Player - The wizard entity controlled by the user
 */
import { SpellBook, SPELL_TYPES } from '../engine/Spells.js';

export const RELICS_CATALOG = [
  // Elemental damage
  { id: 'relic_fire',      name: 'Phoenix Feather',  desc: '+25% Fire Damage',           sprite: 'relic_feather', stats: { fireDamage: 0.25 } },
  { id: 'relic_frost',     name: 'Glacial Core',     desc: '+25% Frost Damage',          sprite: 'relic_core',    stats: { frostDamage: 0.25 } },
  { id: 'relic_lightning', name: 'Storm Ring',       desc: '+25% Lightning Damage',      sprite: 'relic_ring',    stats: { lightningDamage: 0.25 } },
  { id: 'relic_void',      name: 'Void Shard',       desc: '+25% Void Damage',           sprite: 'relic_core',    stats: { voidDamage: 0.25 } },
  { id: 'relic_time',      name: 'Hourglass Charm',  desc: '+20% Cooldown Reduction',    sprite: 'relic_ring',    stats: { cooldownReduction: 0.20 } },
  // Movement & defense
  { id: 'relic_boots',     name: 'Aether Boots',     desc: '+20% Move Speed',            sprite: 'relic_boots',   stats: { speed: 0.20 } },
  { id: 'relic_shield',    name: 'Runic Shield',     desc: '+15% Dmg Reduction',         sprite: 'relic_shield',  stats: { damageReduction: 0.15 } },
  { id: 'relic_heart',     name: 'Stone Heart',      desc: '+40 Max HP',                 sprite: 'relic_feather', stats: { maxHp: 40 } },
  // Mana & offense
  { id: 'relic_mana',      name: 'Sapphire Amulet',  desc: '+30 Max Mana',               sprite: 'relic_amulet',  stats: { maxMp: 30 } },
  { id: 'relic_regen',     name: 'Verdant Talisman', desc: '+0.8 HP Regen/s',            sprite: 'relic_amulet',  stats: { healthRegen: 0.8 } },
  { id: 'relic_crit',      name: 'Assassin\'s Eye',  desc: '+10% Crit Chance',           sprite: 'relic_ring',    stats: { critChance: 0.10 } },
  { id: 'relic_cast',      name: 'Quicksilver Orb',  desc: '+20% Cast Speed',            sprite: 'relic_core',    stats: { castSpeed: 0.20 } },
  { id: 'relic_alldmg',    name: 'Warlord\'s Crest', desc: '+15% All Spell Damage',      sprite: 'relic_shield',  stats: { allDamage: 0.15 } },
  { id: 'relic_mpregen',   name: 'Mana Conduit',     desc: '+0.6 Mana Regen/s',          sprite: 'relic_amulet',  stats: { manaRegen: 0.6 } },
  { id: 'relic_xp',        name: 'Scholar\'s Lens',  desc: '+20% XP Gain',               sprite: 'relic_boots',   stats: { xpGain: 0.20 } },
];

export const EQUIPMENT_CATALOG = [
  // Weapons
  { id: 'equip_wand_novice', name: 'Novice Wand', type: 'weapon', desc: '+10% Cast Speed', sprite: 'equip_wand', stats: { castSpeed: 0.10 } },
  { id: 'equip_staff_fire', name: 'Pyromancer Staff', type: 'weapon', desc: '+30% Fire Damage', sprite: 'equip_staff', stats: { fireDamage: 0.30 } },
  { id: 'equip_wand_mana', name: 'Mana Scepter', type: 'weapon', desc: '+40 Max MP, +0.3 Mana Regen', sprite: 'equip_wand', stats: { maxMp: 40, manaRegen: 0.3 } },
  
  // Helmets
  { id: 'equip_hood_apprentice', name: 'Apprentice Hood', type: 'helmet', desc: '+15 Max MP, +10% Cast Speed', sprite: 'equip_hat', stats: { maxMp: 15, castSpeed: 0.10 } },
  { id: 'equip_crown_mage', name: 'Archmage Crown', type: 'helmet', desc: '+15% Cooldown Reduction', sprite: 'equip_hat', stats: { cooldownReduction: 0.15 } },

  // Armors
  { id: 'equip_robe_student', name: 'Student Robe', type: 'chestplate', desc: '+20 Max HP', sprite: 'equip_robe', stats: { maxHp: 20 } },
  { id: 'equip_robe_runic', name: 'Runic Mail', type: 'chestplate', desc: '+15% Damage Reduction, +25 Max HP', sprite: 'equip_robe', stats: { damageReduction: 0.15, maxHp: 25 } },

  // Boots
  { id: 'equip_boots_leather', name: 'Traveler Boots', type: 'boots', desc: '+15% Move Speed', sprite: 'equip_boots', stats: { speed: 0.15 } },
  { id: 'equip_boots_wizard', name: 'Levitation Boots', type: 'boots', desc: '+25% Move Speed', sprite: 'equip_boots', stats: { speed: 0.25 } },

  // Rings / Accessories
  { id: 'equip_ring_gold', name: 'Golden Band', type: 'ring', desc: '+10% XP Gain', sprite: 'relic_ring', stats: { xpGain: 0.10 } },
  { id: 'equip_ring_crit', name: 'Slayer Ring', type: 'ring', desc: '+10% Crit Chance', sprite: 'relic_ring', stats: { critChance: 0.10 } }
];

export class Player {
  constructor(game, x, y) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = 12; // Collision box size
    
    // Default base stats
    this.level = 1;
    this.xp = 0;
    this.xpNeeded = 50;
    this.ap = 0; // Ability Points for upgrading tree
    this.shards = 0; // Currency collected
    
    this.baseHp = 100;
    this.baseMp = 50;
    this.baseSpeed = 160;
    
    this.hp = this.baseHp;
    this.mp = this.baseMp;

    // Permanent upgrades from the Runic Shop
    this.shopMaxHp = 0;
    this.shopMaxMp = 0;
    this.shopManaRegen = 0;

    // Relics Inventory
    this.inventory = [];
    this.maxInventorySlots = 4; // starts at 4, can be purchased up to 10
    this.equipment = {
      helmet: null,
      chestplate: null,
      boots: null,
      weapon: null,
      ring: null
    };
    
    // Spell slot system
    // customSpellMap overrides auto-assignment when set by the player
    // null entries = use auto-assignment for that slot
    this.customSpellMap = {
      primary: null, secondary: null, utility: null, ultimate: null, extra: null,
      slot6: null, slot7: null
    };
    this.maxSpellSlots = 5; // starts at 5, upgradeable to 7 via shop

    // Volt Shield active timers
    this.voltShieldTimer = 0;
    this.voltShieldDamageTimer = 0;
    
    // Spell configurations (Slots mapping to spell IDs in SpellBook)
    this.spellSlots = {
      primary: 'fireball', // LMB
      secondary: null,    // RMB (unlocked via tree)
      utility: null,      // Space (unlocked via tree)
      ultimate: null,     // Q (unlocked via tree)
      extra: null         // E (unlocked via tree)
    };
    
    // Timers
    this.spellCooldowns = {
      primary: 0, secondary: 0, utility: 0, ultimate: 0, extra: 0,
      slot6: 0, slot7: 0
    };
    
    this.dashCooldownTimer = 0;
    this.iframeTimer = 0;

    // Buff durations (Shrine temporary boosts)
    this.buffs = {
      haste: 0,
      mana: 0,
      damage: 0
    };

    // Companion Orbiting Wisp variables
    this.wispAngle = 0;
    this.wispShootTimer = 0;
    this.dashSpeedBoostTimer = 0;
    
    // Modifiers dictionary populated from unlocked ability tree nodes
    this.modifiers = {
      maxHp: 0,
      maxMp: 0,
      manaRegen: 0.8, // mana regen per sec
      healthRegen: 0.2, // hp regen per sec
      speed: 1.0, // multiplier
      cooldownReduction: 0,
      castSpeed: 1.0, // multiplier
      critChance: 0.05,
      damageReduction: 0,
      xpGain: 1.0,
      
      // Elements damage boost multipliers
      fireDamage: 1.0,
      frostDamage: 1.0,
      lightningDamage: 1.0,
      voidDamage: 1.0,
      timeDamage: 1.0,
      allDamage: 1.0,
      
      // Spell special upgrades
      fireballExplode: false,
      frostPierce: false,
      freezeOnChill: false,
      teslaJumps: 0,
      teslaManaGain: 0,
      supernovaEnabled: false,
      chronoDashSlow: false,
      dashSpeedBoost: 0,
      lightningDash: false,
      dashDistance: 1.0,

      // Wisp companion upgrades
      unlockWisp: false,
      wispCount: 1,        // number of wisps orbiting
      wispDamage: 0,       // bonus wisp damage
      wispRange: 0,        // bonus tracking range
      wispSpeed: 0,        // bonus wisp fire rate (−seconds)

      // New spell upgrade flags
      meteorDoubleStrike: false,  // Fire: meteor hits twice
      iceNovaFreeze: false,       // Frost: nova fully freezes instead of chills
      stormCallAoe: false,        // Lightning: storm call also chains from each target
      shadowBlinkDmg: false,      // Void: blink explosion deals extra damage
      timeWarpHaste: false        // Time: time warp also grants 3s speed boost
    };

    // Rebirth / prestige system
    this.rebirthCount = 0;
    // Permanent cross-rebirth bonuses (additive multipliers, survived across all resets)
    this.rebirthBonuses = {
      xpGain:          0,   // +X% XP per rebirth
      shardGain:       0,   // +X% shard drops per rebirth
      startingAp:      0,   // bonus AP at game start
      damageBonus:     0,   // +X% all damage
      healthBonus:     0,   // +X flat max HP
    };

    // Load local save progress if existing
    this.loadGameState();
  }

  /**
   * Parse ability tree to compute modifiers
   */
  recalculateModifiers(tree) {
    // Reset modifiers to default base values
    this.modifiers = {
      maxHp: 0,
      maxMp: 0,
      manaRegen: 0.8,
      healthRegen: 0.2,
      speed: 1.0,
      cooldownReduction: 0,
      castSpeed: 1.0,
      critChance: 0.05,
      damageReduction: 0,
      xpGain: 1.0,
      fireDamage: 1.0,
      frostDamage: 1.0,
      lightningDamage: 1.0,
      voidDamage: 1.0,
      timeDamage: 1.0,
      allDamage: 1.0,
      fireballExplode: false,
      frostPierce: false,
      freezeOnChill: false,
      teslaJumps: 0,
      teslaManaGain: 0,
      supernovaEnabled: false,
      chronoDashSlow: false,
      dashSpeedBoost: 0,
      lightningDash: false,
      dashDistance: 1.0,
      unlockWisp: false,
      wispCount: 1,
      wispDamage: 0,
      wispRange: 0,
      wispSpeed: 0,
      meteorDoubleStrike: false,
      iceNovaFreeze: false,
      stormCallAoe: false,
      shadowBlinkDmg: false,
      timeWarpHaste: false
    };

    // Check unlocked spells tracker
    const unlockedSpellIds = new Set(['fireball']); // fireball is default

    // Sum up values from all unlocked nodes in the Ability Tree
    for (const key in tree.nodes) {
      const node = tree.nodes[key];
      if (node.unlocked && node.stats) {
        for (const statKey in node.stats) {
          const value = node.stats[statKey];
          
          if (statKey === 'unlockSpell') {
            unlockedSpellIds.add(value);
          } else if (typeof value === 'boolean') {
            this.modifiers[statKey] = this.modifiers[statKey] || value;
          } else {
            this.modifiers[statKey] += value;
          }
        }
      }
    }

    // Store unlocked spell ids for the remap panel to reference
    this.unlockedSpellIds = unlockedSpellIds;

    // ── Auto-assignment (default, element-per-slot) ─────────────────────────
    const autoSlots = {
      primary: 'fireball', secondary: null, utility: null, ultimate: null,
      extra: null, slot6: null, slot7: null
    };

    if (unlockedSpellIds.has('meteor_strike'))   autoSlots.primary   = 'meteor_strike';
    else if (unlockedSpellIds.has('flame_wave')) autoSlots.primary   = 'flame_wave';

    if (unlockedSpellIds.has('ice_nova'))           autoSlots.secondary = 'ice_nova';
    else if (unlockedSpellIds.has('blizzard_orb'))  autoSlots.secondary = 'blizzard_orb';
    else if (unlockedSpellIds.has('frost_spike'))   autoSlots.secondary = 'frost_spike';

    if (unlockedSpellIds.has('storm_call'))         autoSlots.extra     = 'storm_call';
    else if (unlockedSpellIds.has('volt_shield'))   autoSlots.extra     = 'volt_shield';
    else if (unlockedSpellIds.has('tesla_bolt'))    autoSlots.extra     = 'tesla_bolt';

    if (unlockedSpellIds.has('time_warp'))          autoSlots.utility   = 'time_warp';
    else if (unlockedSpellIds.has('chrono_shift'))  autoSlots.utility   = 'chrono_shift';
    else if (unlockedSpellIds.has('aether_dash'))   autoSlots.utility   = 'aether_dash';

    if (unlockedSpellIds.has('shadow_blink'))       autoSlots.ultimate  = 'shadow_blink';
    else if (unlockedSpellIds.has('void_pull'))     autoSlots.ultimate  = 'void_pull';

    // ── Apply custom overrides (only if the spell is actually unlocked) ──────
    this.spellSlots = { ...autoSlots };
    for (const slot in this.customSpellMap) {
      const id = this.customSpellMap[slot];
      if (id && (unlockedSpellIds.has(id) || id === 'fireball')) {
        this.spellSlots[slot] = id;
      }
    }

    // Add permanent shop upgrades
    this.modifiers.maxHp += this.shopMaxHp || 0;
    this.modifiers.maxMp += this.shopMaxMp || 0;
    this.modifiers.manaRegen += this.shopManaRegen || 0;

    // Apply rebirth permanent bonuses
    if (this.rebirthCount > 0) {
      this.modifiers.xpGain    += this.rebirthBonuses.xpGain    || 0;
      this.modifiers.allDamage += this.rebirthBonuses.damageBonus || 0;
      this.modifiers.maxHp     += this.rebirthBonuses.healthBonus || 0;
      // shardGain is used directly in Game.js when collecting shards
    }

    // Add inventory relics stats (relics in bag are passives, gear is not)
    this.inventory.forEach((item) => {
      const isRelic = !item.type;
      if (isRelic && item.stats) {
        for (const statKey in item.stats) {
          const value = item.stats[statKey];
          this.modifiers[statKey] += value;
        }
      }
    });

    // Add equipped gear stats
    if (this.equipment) {
      for (const slot in this.equipment) {
        const item = this.equipment[slot];
        if (item && item.stats) {
          for (const statKey in item.stats) {
            const value = item.stats[statKey];
            this.modifiers[statKey] += value;
          }
        }
      }
    }

    // Apply HP/Mana additions
    const oldMaxHp = this.getMaxHp();
    const oldMaxMp = this.getMaxMp();
    
    const hpRatio = this.hp / oldMaxHp;
    const mpRatio = this.mp / oldMaxMp;

    this.hp = Math.round(hpRatio * this.getMaxHp());
    this.mp = Math.round(mpRatio * this.getMaxMp());
    
    this.game.updateHUD();
  }

  getMaxHp() {
    return this.baseHp + (this.modifiers.maxHp || 0);
  }

  getMaxMp() {
    return this.baseMp + (this.modifiers.maxMp || 0);
  }

  getSpeed() {
    let multiplier = this.modifiers.speed;
    
    // Temporal Speed dash trigger
    if (this.modifiers.dashSpeedBoost && this.dashSpeedBoostTimer > 0) {
      multiplier += 1.0; 
    }

    // Haste Shrine Buff
    if (this.buffs.haste > 0) {
      multiplier += 0.5; // +50% speed
    }

    // Check if player is standing in a frost_slow or void singularity zone
    if (this.game && this.game.areaEffects) {
      for (const ae of this.game.areaEffects) {
        if (ae.type === 'frost_slow' || ae.type === 'singularity') {
          const dist = Math.hypot(this.x - ae.x, this.y - ae.y);
          if (dist <= ae.radius) {
            multiplier *= 0.5; // 50% slow down
            break; // only apply slow once
          }
        }
      }
    }

    return this.baseSpeed * multiplier;
  }

  getSpellCooldown(spellId) {
    const spell = SpellBook[spellId];
    if (!spell) return 0;
    
    const cdr = Math.min(0.6, this.modifiers.cooldownReduction || 0);
    return spell.cooldown * (1.0 - cdr);
  }

  applyBuff(type, duration) {
    if (type in this.buffs) {
      this.buffs[type] = Math.max(this.buffs[type], duration);
      
      const labelMap = {
        haste: "RUNIC ACCELERATION! (+50% Speed)",
        mana: "AETHER FLOW! (+10 Mana/sec)",
        damage: "WRATH OF THE RUNES! (2x Damage)"
      };

      const colorMap = {
        haste: '#ff9f43',
        mana: '#10ac84',
        damage: '#ff4757'
      };

      this.game.particles.spawnText(this.x, this.y - 45, labelMap[type], {
        color: colorMap[type],
        fontSize: 10,
        fontPixel: true,
        life: 2.0
      });
    }
  }

  gainXp(amount) {
    const totalGained = amount * (this.modifiers.xpGain || 1.0);
    this.xp += totalGained;
    
    this.game.particles.spawn(this.x, this.y, {
      vx: (Math.random() - 0.5) * 40,
      vy: -60 - Math.random() * 20,
      color: '#d859ff',
      size: 3,
      life: 0.5
    });

    if (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      this.ap++; 
      this.xpNeeded = Math.round(this.xpNeeded * 1.20 + 10);
      
      this.hp = this.getMaxHp();
      this.mp = this.getMaxMp();

      this.game.particles.spawnText(this.x, this.y - 45, `LEVEL UP! Lvl ${this.level}`, {
        color: '#f1c40f',
        fontSize: 14,
        fontPixel: true,
        life: 2.0
      });
      
      this.game.particles.createExplosion(this.x, this.y, '#f1c40f', 25, 140, 4);
      this.game.screenShake = 10;
       if (this.game.audio) this.game.audio.playLevelUp();
    }
    this.game.updateHUD();
  }

  takeDamage(amount, game) {
    if (this.iframeTimer > 0) return; // Immune during dash
    
    const dr = Math.min(0.75, this.modifiers.damageReduction || 0);
    const finalDamage = Math.max(1, Math.round(amount * (1.0 - dr)));
    
    this.hp -= finalDamage;
    this.game.screenShake = 8;
    this.iframeTimer = 0.4; // 0.4s brief invulnerability frames
    
    if (this.game.audio) this.game.audio.playHurt();

    this.game.particles.spawnText(this.x, this.y - 20, `-${finalDamage}`, {
      color: '#ff4757',
      fontSize: 13,
      weight: 'bold'
    });

    if (this.hp <= 0) {
      this.hp = 0;
      if (this.game.audio) this.game.audio.playDeath();
      this.game.gameOver();
    }
    this.game.updateHUD();
  }

  castSpell(slotName, angle) {
    const spellId = this.spellSlots[slotName];
    if (!spellId) return;

    const spell = SpellBook[spellId];
    if (!spell) return;

    if (this.spellCooldowns[slotName] > 0) return;

    if (this.mp < spell.manaCost) {
      this.game.particles.spawnText(this.x, this.y - 20, "OUT OF MANA", {
        color: '#70a1ff',
        fontSize: 10,
        fontPixel: true,
        life: 0.8
      });
      return;
    }

    this.mp -= spell.manaCost;
    if (this.game.audio) this.game.audio.playShoot();
    
    // Cast spell
    spell.cast(this, angle, this.game);

    // Apply speed boost timer on Chrono Dash
    if (spellId === 'aether_dash' && this.modifiers.dashSpeedBoost) {
      this.dashSpeedBoostTimer = 3.0; // 3 seconds speed boost
    }

    this.spellCooldowns[slotName] = this.getSpellCooldown(spellId);
    this.game.updateHUD();
  }

  update(dt) {
    // Regenerate HP and Mana
    const hpReg = (this.modifiers.healthRegen || 0.2) * dt;
    this.hp = Math.min(this.getMaxHp(), this.hp + hpReg);
    
    // Mana Shrine Buff adds extra +10 mana regen
    const manaBuffAddition = this.buffs.mana > 0 ? 10.0 : 0.0;
    const mpReg = ((this.modifiers.manaRegen || 0.8) + manaBuffAddition) * dt;
    this.mp = Math.min(this.getMaxMp(), this.mp + mpReg);
    
    // Timers ticks
    if (this.iframeTimer > 0) this.iframeTimer -= dt;
    if (this.dashSpeedBoostTimer > 0) this.dashSpeedBoostTimer -= dt;

    // Volt Shield active ticks
    if (this.voltShieldTimer > 0) {
      this.voltShieldTimer -= dt;

      const ORB_COUNT    = 3;
      const ORBIT_R      = 80;
      const ORB_R        = 14;
      const SPIN_SPEED   = 2.2;
      const ZAP_DMG      = 25;
      const ZAP_COOLDOWN = 0.5;

      if (!this.voltShieldHitCooldowns) this.voltShieldHitCooldowns = {};

      // Tick down hit cooldowns
      for (const k in this.voltShieldHitCooldowns) {
        this.voltShieldHitCooldowns[k] -= dt;
        if (this.voltShieldHitCooldowns[k] <= 0) delete this.voltShieldHitCooldowns[k];
      }

      // Take ONE snapshot of the live enemy array for the entire shield update.
      // This snapshot is used for ALL three orbs so kills inside the loop
      // never affect iteration of subsequent orbs or the snapshot itself.
      const enemySnapshot = this.game.enemies.filter(e => !e.dead);

      // Collect deferred chain-lightning requests — fire them all AFTER the orb
      // loop so they cannot trigger takeDamage while we are still iterating.
      const chainQueue = [];

      for (let i = 0; i < ORB_COUNT; i++) {
        const orbAngle = this.voltShieldTimer * SPIN_SPEED * -1 + (i / ORB_COUNT) * Math.PI * 2;
        const ox = this.x + Math.cos(orbAngle) * ORBIT_R;
        const oy = this.y + Math.sin(orbAngle) * ORBIT_R;

        // Orb glow particles
        this.game.particles.spawn(ox, oy, {
          vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12,
          color: Math.random() < 0.5 ? '#fff200' : '#ffe066',
          size: Math.random() * 3 + 3, life: 0.08, glow: true
        });
        if (Math.random() < 0.4) {
          this.game.particles.spawn(ox, oy, {
            vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
            color: '#ffffff', size: 1.5, life: 0.12, glow: true
          });
        }

        for (const enemy of enemySnapshot) {
          // Re-check .dead — a previous orb in this same frame may have killed it
          if (enemy.dead) continue;

          if (enemy._vsId === undefined) {
            enemy._vsId = (Player._vsIdCounter = (Player._vsIdCounter || 0) + 1);
          }
          const hitKey = `${i}_${enemy._vsId}`;
          if (this.voltShieldHitCooldowns[hitKey]) continue;

          const d = Math.hypot(enemy.x - ox, enemy.y - oy);
          if (d <= ORB_R + enemy.radius) {
            const dmg = ZAP_DMG + Math.round((this.modifiers.lightningDamage || 0) * ZAP_DMG);
            enemy.takeDamage(dmg, false, this.game);
            this.voltShieldHitCooldowns[hitKey] = ZAP_COOLDOWN;
            this.game.particles.createExplosion(ox, oy, '#fff200', 6, 50, 1.5);
            if (!enemy.dead) {
              enemy.applyStatus(SPELL_TYPES.LIGHTNING, 2.5);
              // Queue chain lightning — do NOT call it here
              chainQueue.push({ x: ox, y: oy, dmg: Math.round(dmg * 0.5) });
            }
          }
        }
      }

      // Fire deferred chain lightning now that all orb iteration is done
      for (const { x, y, dmg } of chainQueue) {
        this.game.triggerChainLightning(x, y, dmg, 2, 120);
      }
    }

    // Buffs ticks down
    for (const key in this.buffs) {
      if (this.buffs[key] > 0) {
        this.buffs[key] -= dt;
        if (this.buffs[key] < 0) this.buffs[key] = 0;
      }
    }

    // Runic Wisp shooting companion
    if (this.modifiers.unlockWisp) {
      this.wispAngle += dt * (3.5 + (this.modifiers.wispSpeed || 0) * 0.5);
      this.wispShootTimer += dt;
      const fireRate = Math.max(0.3, 1.2 - (this.modifiers.wispSpeed || 0) * 0.2);
      if (this.wispShootTimer >= fireRate) {
        this.wispShootTimer = 0;
        const wispCount = Math.max(1, Math.round(1 + (this.modifiers.wispCount || 0)));
        for (let w = 0; w < wispCount; w++) {
          this.wispShootNearestEnemy(w, wispCount);
        }
      }
    }

    // CD timer ticks
    for (const key in this.spellCooldowns) {
      if (this.spellCooldowns[key] > 0) {
        this.spellCooldowns[key] -= dt;
        if (this.spellCooldowns[key] < 0) this.spellCooldowns[key] = 0;
      }
    }
    
    // Movement integration
    this.x += this.vx * this.getSpeed() * dt;
    this.y += this.vy * this.getSpeed() * dt;

    // Boundary check inside Arena level
    const lvl = this.game.levelManager;
    this.x = Math.max(this.radius + 40, Math.min(lvl.width - this.radius - 40, this.x));
    this.y = Math.max(this.radius + 40, Math.min(lvl.height - this.radius - 40, this.y));

    // Handle collision with stone pillar obstacles
    lvl.obstacles.forEach((obs) => {
      if (obs.type === 'pillar') {
        const dx = this.x - obs.x;
        const dy = this.y - obs.y;
        const dist = Math.hypot(dx, dy);
        const minDist = this.radius + obs.radius;
        if (dist < minDist) {
          const angle = Math.atan2(dy, dx);
          this.x = obs.x + Math.cos(angle) * minDist;
          this.y = obs.y + Math.sin(angle) * minDist;
        }
      }
    });
  }

  wispShootNearestEnemy(wispIndex = 0, totalWisps = 1) {
    const trackRange = 220 + (this.modifiers.wispRange || 0) * 40;
    let nearest = null;
    let minDist = trackRange;

    // Each additional wisp targets a different enemy (offset by index in sorted list)
    const sorted = [...this.game.enemies].filter(e => !e.dead).sort((a, b) =>
      Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y)
    );
    const target = sorted[wispIndex % sorted.length] || null;
    nearest = target && Math.hypot(target.x - this.x, target.y - this.y) < trackRange ? target : null;

    if (nearest) {
      const wAngle = Math.atan2(nearest.y - this.y, nearest.x - this.x);
      const wispRadius = 30;
      // Space wisps evenly in orbit
      const orbitOffset = (wispIndex / totalWisps) * Math.PI * 2;
      const wx = this.x + Math.cos(this.wispAngle + orbitOffset) * wispRadius;
      const wy = this.y + Math.sin(this.wispAngle + orbitOffset) * wispRadius;

      const dmg = 8 + Math.round((this.modifiers.wispDamage || 0) * 8);
      
      this.game.spawnProjectile(wx, wy, wAngle, {
        element: 'lightning',
        damage: dmg,
        speed: 320,
        radius: 4,
        sprite: 'proj_lightning',
        id: 'wisp_shot'
      }, true);
      
      this.game.particles.spawn(wx, wy, {
        vx: Math.cos(wAngle) * 50,
        vy: Math.sin(wAngle) * 50,
        color: '#fff200',
        size: 2,
        life: 0.2,
        glow: true
      });
    }
  }

  /**
   * Returns how many bonus AP points the player starts with after rebirths
   */
  getRebirthStartingAp() {
    return this.rebirthBonuses.startingAp || 0;
  }

  /**
   * Perform a Rebirth — resets most progression but awards permanent bonuses.
   * Can only rebirth if the player has reached level 10+.
   */
  performRebirth() {
    const MIN_LEVEL = 10;
    if (this.level < MIN_LEVEL) return false;

    this.rebirthCount += 1;

    // Calculate incremental bonuses for this rebirth
    this.rebirthBonuses.xpGain      += 0.15;  // +15% XP per rebirth
    this.rebirthBonuses.shardGain   += 0.15;  // +15% shards per rebirth
    this.rebirthBonuses.startingAp  += 2;     // +2 free AP to start
    this.rebirthBonuses.damageBonus += 0.05;  // +5% all damage per rebirth
    this.rebirthBonuses.healthBonus += 10;    // +10 max HP per rebirth

    // Hard reset level, XP, AP, shop upgrades, inventory, tree
    this.level         = 1;
    this.xp            = 0;
    this.xpNeeded      = 50;
    this.ap            = this.rebirthBonuses.startingAp; // free starting AP
    this.shards        = Math.floor(this.shards * 0.3);  // keep 30% of shards
    this.shopMaxHp     = 0;
    this.shopMaxMp     = 0;
    this.shopManaRegen = 0;
    this.inventory     = [];
    this.equipment     = {
      helmet: null,
      chestplate: null,
      boots: null,
      weapon: null,
      ring: null
    };

    // Reset ability tree
    const tree = this.game.abilityTree;
    for (const key in tree.nodes) {
      if (key !== 'root') {
        tree.nodes[key].unlocked = false;
      }
    }

    this.recalculateModifiers(tree);
    this.hp = this.getMaxHp();
    this.mp = this.getMaxMp();

    // Reset LevelManager for a fresh map on next start
    if (this.game.levelManager) {
      this.game.levelManager.fullTileGrid = null;
      this.game.levelManager.wave = 1;
      this.game.levelManager.spawnedSpecialRooms = new Set();
      this.game.levelManager.mapRevealed = false;
    }

    this.saveGameState();

    return true;
  }

  saveGameState() {
    const progress = {
      level: this.level,
      xp: this.xp,
      xpNeeded: this.xpNeeded,
      ap: this.ap,
      shards: this.shards,
      shopMaxHp: this.shopMaxHp,
      shopMaxMp: this.shopMaxMp,
      shopManaRegen: this.shopManaRegen,
      inventory: this.inventory.map(r => r.id),
      equipment: {
        helmet: this.equipment?.helmet?.id || null,
        chestplate: this.equipment?.chestplate?.id || null,
        boots: this.equipment?.boots?.id || null,
        weapon: this.equipment?.weapon?.id || null,
        ring: this.equipment?.ring?.id || null
      },
      treeNodes: {},
      rebirthCount: this.rebirthCount,
      rebirthBonuses: this.rebirthBonuses,
      maxInventorySlots: this.maxInventorySlots,
      customSpellMap: this.customSpellMap,
      maxSpellSlots: this.maxSpellSlots,
    };

    for (const key in this.game.abilityTree.nodes) {
      progress.treeNodes[key] = this.game.abilityTree.nodes[key].unlocked;
    }

    localStorage.setItem('aetherweaver_save', JSON.stringify(progress));
  }

  loadGameState() {
    try {
      const data = localStorage.getItem('aetherweaver_save');
      if (data) {
        const progress = JSON.parse(data);
        this.level = progress.level || 1;
        this.xp = progress.xp || 0;
        this.xpNeeded = progress.xpNeeded || 50;
        this.ap = progress.ap || 0;
        this.shards = progress.shards || 0;
        this.shopMaxHp = progress.shopMaxHp || 0;
        this.shopMaxMp = progress.shopMaxMp || 0;
        this.shopManaRegen = progress.shopManaRegen || 0;
        this.rebirthCount = progress.rebirthCount || 0;
        this.maxInventorySlots = progress.maxInventorySlots || 4;
        this.maxSpellSlots = progress.maxSpellSlots || 5;
        if (progress.customSpellMap) {
          this.customSpellMap = { ...this.customSpellMap, ...progress.customSpellMap };
        }
        if (progress.rebirthBonuses) {
          this.rebirthBonuses = { ...this.rebirthBonuses, ...progress.rebirthBonuses };
        }
        
        const findItem = (id) => {
          return RELICS_CATALOG.find(r => r.id === id) || EQUIPMENT_CATALOG.find(e => e.id === id);
        };

        if (progress.inventory) {
          this.inventory = progress.inventory
            .map(id => findItem(id))
            .filter(Boolean);
        }

        if (progress.equipment) {
          this.equipment = {
            helmet: progress.equipment.helmet ? findItem(progress.equipment.helmet) : null,
            chestplate: progress.equipment.chestplate ? findItem(progress.equipment.chestplate) : null,
            boots: progress.equipment.boots ? findItem(progress.equipment.boots) : null,
            weapon: progress.equipment.weapon ? findItem(progress.equipment.weapon) : null,
            ring: progress.equipment.ring ? findItem(progress.equipment.ring) : null
          };
        }

        if (progress.treeNodes) {
          for (const key in progress.treeNodes) {
            if (this.game.abilityTree && this.game.abilityTree.nodes[key]) {
              this.game.abilityTree.nodes[key].unlocked = progress.treeNodes[key];
            }
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load local storage save: ", e);
    }
  }

  draw(ctx, assetManager, frameIndex) {
    // Draw trail shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.arc(this.x - this.game.camera.x, this.y - this.game.camera.y + 6, this.radius - 2, 0, Math.PI * 2);
    ctx.fill();

    const worldMouse = this.game.getWorldMouse();
    const mx = worldMouse.x;
    const isFacingLeft = mx < this.x;
    
    let fIdx = 0;
    if (Math.hypot(this.vx, this.vy) > 0.01) {
      fIdx = 1 + (Math.floor(frameIndex * 6) % 2);
    }

    ctx.save();
    
    // Draw Volt Shield orbs (drawn before player so player renders on top)
    if (this.voltShieldTimer > 0) {
      const ORB_COUNT  = 3;
      const ORBIT_R    = 80;
      const SPIN_SPEED = 2.2;
      const cx = this.x - this.game.camera.x;
      const cy = this.y - this.game.camera.y;

      // Orbit ring hint
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 226, 0, 0.12)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, ORBIT_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      for (let i = 0; i < ORB_COUNT; i++) {
        const orbAngle = this.voltShieldTimer * SPIN_SPEED * -1 + (i / ORB_COUNT) * Math.PI * 2;
        const ox = cx + Math.cos(orbAngle) * ORBIT_R;
        const oy = cy + Math.sin(orbAngle) * ORBIT_R;

        // Glow
        ctx.save();
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#fff200';
        ctx.fillStyle = '#fff200';
        ctx.beginPath();
        ctx.arc(ox, oy, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Inner bright core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ox, oy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw buffs indicator rings under player
    if (this.buffs.damage > 0) {
      ctx.strokeStyle = 'rgba(255, 71, 87, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.x - this.game.camera.x, this.y - this.game.camera.y, this.radius + 3, 0, Math.PI*2);
      ctx.stroke();
    }
    if (this.buffs.haste > 0) {
      ctx.strokeStyle = 'rgba(255, 159, 67, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.x - this.game.camera.x, this.y - this.game.camera.y, this.radius + 5, 0, Math.PI*2);
      ctx.stroke();
    }

    if (isFacingLeft) {
      ctx.translate(this.x - this.game.camera.x, this.y - this.game.camera.y);
      ctx.scale(-1, 1);
      assetManager.draw(ctx, 'player', 0, 0, 32, fIdx, 0, this.iframeTimer > 0 ? 0.6 : 1.0);
    } else {
      assetManager.draw(ctx, 'player', this.x - this.game.camera.x, this.y - this.game.camera.y, 32, fIdx, 0, this.iframeTimer > 0 ? 0.6 : 1.0);
    }
    ctx.restore();

    // Draw Wisp(s) if unlocked
    if (this.modifiers.unlockWisp) {
      const wispRadius = 30;
      const count = Math.max(1, Math.round(1 + (this.modifiers.wispCount || 0)));
      for (let w = 0; w < count; w++) {
        const orbitOffset = (w / count) * Math.PI * 2;
        const wx = this.x + Math.cos(this.wispAngle + orbitOffset) * wispRadius - this.game.camera.x;
        const wy = this.y + Math.sin(this.wispAngle + orbitOffset) * wispRadius - this.game.camera.y;
        
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.arc(wx, wy + 4, 3, 0, Math.PI*2);
        ctx.fill();

        assetManager.draw(ctx, 'item_wisp', wx, wy, 12, this.game.frameIndex * 4);
      }
    }
  }
}
