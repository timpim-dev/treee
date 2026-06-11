/**
 * Player - The wizard entity controlled by the user
 */
import { SpellBook, SPELL_TYPES } from '../engine/Spells.js';

export const RELICS_CATALOG = [
  // Elemental damage
  { id: 'relic_fire',      name: 'Phoenix Feather',  desc: '+25% Fire Damage',           sprite: 'relic_fire',      stats: { fireDamage: 0.25 } },
  { id: 'relic_frost',     name: 'Glacial Core',     desc: '+25% Frost Damage',          sprite: 'relic_frost',     stats: { frostDamage: 0.25 } },
  { id: 'relic_lightning', name: 'Storm Ring',       desc: '+25% Lightning Damage',      sprite: 'relic_lightning', stats: { lightningDamage: 0.25 } },
  { id: 'relic_void',      name: 'Void Shard',       desc: '+25% Void Damage',           sprite: 'relic_void',      stats: { voidDamage: 0.25 } },
  { id: 'relic_time',      name: 'Hourglass Charm',  desc: '+20% Cooldown Reduction',    sprite: 'relic_time',      stats: { cooldownReduction: 0.20 } },
  // Movement & defense
  { id: 'relic_boots',     name: 'Aether Boots',     desc: '+20% Move Speed',            sprite: 'relic_boots',     stats: { speed: 0.20 } },
  { id: 'relic_shield',    name: 'Runic Shield',     desc: '+15% Dmg Reduction',         sprite: 'relic_shield',    stats: { damageReduction: 0.15 } },
  { id: 'relic_heart',     name: 'Stone Heart',      desc: '+40 Max HP',                 sprite: 'relic_heart',     stats: { maxHp: 40 } },
  // Mana & offense
  { id: 'relic_mana',      name: 'Sapphire Amulet',  desc: '+30 Max Mana',               sprite: 'relic_mana',      stats: { maxMp: 30 } },
  { id: 'relic_regen',     name: 'Verdant Talisman', desc: '+0.8 HP Regen/s',            sprite: 'relic_regen',     stats: { healthRegen: 0.8 } },
  { id: 'relic_crit',      name: 'Assassin\'s Eye',  desc: '+10% Crit Chance',           sprite: 'relic_crit',      stats: { critChance: 0.10 } },
  { id: 'relic_cast',      name: 'Quicksilver Orb',  desc: '+20% Cast Speed',            sprite: 'relic_cast',      stats: { castSpeed: 0.20 } },
  { id: 'relic_alldmg',    name: 'Warlord\'s Crest', desc: '+15% All Spell Damage',      sprite: 'relic_alldmg',    stats: { allDamage: 0.15 } },
  { id: 'relic_mpregen',   name: 'Mana Conduit',     desc: '+0.6 Mana Regen/s',          sprite: 'relic_mpregen',   stats: { manaRegen: 0.6 } },
  { id: 'relic_xp',        name: 'Scholar\'s Lens',  desc: '+20% XP Gain',               sprite: 'relic_xp',        stats: { xpGain: 0.20 } },
];

export const EQUIPMENT_CATALOG = [
  // Weapons
  { id: 'equip_wand_novice', name: 'Novice Wand', type: 'weapon', desc: '+10% Cast Speed', sprite: 'equip_wand_novice', stats: { castSpeed: 0.10 } },
  { id: 'equip_staff_fire', name: 'Pyromancer Staff', type: 'weapon', desc: '+30% Fire Damage', sprite: 'equip_staff_fire', stats: { fireDamage: 0.30 } },
  { id: 'equip_wand_mana', name: 'Mana Scepter', type: 'weapon', desc: '+40 Max MP, +0.3 Mana Regen', sprite: 'equip_wand_mana', stats: { maxMp: 40, manaRegen: 0.3 } },
  
  // Helmets
  { id: 'equip_hood_apprentice', name: 'Apprentice Hood', type: 'helmet', desc: '+15 Max MP, +10% Cast Speed', sprite: 'equip_hood_apprentice', stats: { maxMp: 15, castSpeed: 0.10 } },
  { id: 'equip_crown_mage', name: 'Archmage Crown', type: 'helmet', desc: '+15% Cooldown Reduction', sprite: 'equip_crown_mage', stats: { cooldownReduction: 0.15 } },

  // Armors
  { id: 'equip_robe_student', name: 'Student Robe', type: 'chestplate', desc: '+20 Max HP', sprite: 'equip_robe_student', stats: { maxHp: 20 } },
  { id: 'equip_robe_runic', name: 'Runic Mail', type: 'chestplate', desc: '+15% Damage Reduction, +25 Max HP', sprite: 'equip_robe_runic', stats: { damageReduction: 0.15, maxHp: 25 } },

  // Boots
  { id: 'equip_boots_leather', name: 'Traveler Boots', type: 'boots', desc: '+15% Move Speed', sprite: 'equip_boots_leather', stats: { speed: 0.15 } },
  { id: 'equip_boots_wizard', name: 'Levitation Boots', type: 'boots', desc: '+25% Move Speed', sprite: 'equip_boots_wizard', stats: { speed: 0.25 } },

  // Rings / Accessories
  { id: 'equip_ring_gold', name: 'Golden Band', type: 'ring', desc: '+10% XP Gain', sprite: 'equip_ring_gold', stats: { xpGain: 0.10 } },
  { id: 'equip_ring_crit', name: 'Slayer Ring', type: 'ring', desc: '+10% Crit Chance', sprite: 'equip_ring_crit', stats: { critChance: 0.10 } }
];

export function createScaledLootItem(catalogItem, wave) {
  // Deep clone catalog item to avoid reference sharing
  const item = {
    ...catalogItem,
    stats: { ...catalogItem.stats }
  };
  
  // Wave stats scaling tiers: Common, Rare, Epic, Legendary
  let rarity = 'Common';
  let color = '#ffffff'; // White
  let mult = 1.0;
  
  if (wave >= 15) {
    rarity = 'Legendary';
    color = '#ff9f43'; // Orange
    mult = 1.0 + wave * 0.08;
  } else if (wave >= 10) {
    rarity = 'Epic';
    color = '#a55eea'; // Purple
    mult = 1.0 + wave * 0.06;
  } else if (wave >= 5) {
    rarity = 'Rare';
    color = '#70a1ff'; // Blue
    mult = 1.0 + wave * 0.04;
  } else {
    mult = 1.0 + wave * 0.02;
  }
  
  item.rarity = rarity;
  item.rarityColor = color;
  
  // Apply scaling multiplier to numerical stats
  const descParts = [];
  for (const statKey in item.stats) {
    const baseVal = catalogItem.stats[statKey];
    const scaledVal = baseVal * mult;
    item.stats[statKey] = scaledVal;
    
    const statName = statKey === 'fireDamage' ? 'Fire Damage' :
                     statKey === 'frostDamage' ? 'Frost Damage' :
                     statKey === 'lightningDamage' ? 'Lightning Damage' :
                     statKey === 'voidDamage' ? 'Void Damage' :
                     statKey === 'cooldownReduction' ? 'Cooldown Reduction' :
                     statKey === 'speed' ? 'Move Speed' :
                     statKey === 'damageReduction' ? 'Dmg Reduction' :
                     statKey === 'maxHp' ? 'Max HP' :
                     statKey === 'maxMp' ? 'Max Mana' :
                     statKey === 'healthRegen' ? 'HP Regen/s' :
                     statKey === 'critChance' ? 'Crit Chance' :
                     statKey === 'castSpeed' ? 'Cast Speed' :
                     statKey === 'allDamage' ? 'All Spell Damage' :
                     statKey === 'manaRegen' ? 'Mana Regen/s' :
                     statKey === 'xpGain' ? 'XP Gain' : statKey;
                     
    const isPercentage = !['maxHp', 'maxMp', 'healthRegen', 'manaRegen'].includes(statKey);
    let valStr = '';
    if (isPercentage) {
      valStr = `+${Math.round(scaledVal * 100)}%`;
    } else {
      valStr = `+${scaledVal.toFixed(1).replace(/\.0$/, '')}`;
    }
    descParts.push(`${valStr} ${statName}`);
  }
  
  item.desc = descParts.join(', ');
  item.name = `${catalogItem.name} (${rarity})`;
  return item;
}

export class Player {
  constructor(game, x, y) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.hueShift = 0;
    this.vx = 0;
    this.vy = 0;
    this.radius = 12; // Collision box size
    
    // Default base stats
    this.level = 1;
    this.xp = 0;
    this.xpNeeded = 50;
    this.ap = 0; // Ability Points for upgrading tree
    this.shards = 0; // Currency collected
    
    this.chapterUnlocked = 1;
    this.baseHp = 100;
    this.baseMp = 50;
    this.baseSpeed = 160;
    
    this.hp = this.baseHp;
    this.mp = this.baseMp;

    // Permanent upgrades from the Runic Shop
    this.shopMaxHp = 0;
    this.shopMaxMp = 0;
    this.shopManaRegen = 0;

    // Storage system — both are unlimited, no slot cap
    // runeStorage: collected runes waiting to be equipped
    // equippedRunes: active rune slots (only these apply stats), max maxRuneSlots
    // gearStorage: armor/weapons/rings that must be manually equipped to equipment slots
    this.runeStorage   = [];
    this.equippedRunes = []; // array of rune objects currently active
    this.maxRuneSlots  = 6;  // starts at 6, could be expanded later
    this.gearStorage   = [];
    // Keep inventory as a deprecated alias so any old references don't crash
    Object.defineProperty(this, 'inventory', {
      get: () => [...this.runeStorage, ...this.gearStorage],
      configurable: true
    });
    this.maxInventorySlots = 4; // kept for save compat only
    this.equipment = {
      helmet: null,
      chestplate: null,
      boots: null,
      weapon: null,
      ring: null
    };
    this.keys = 0;
    this.earnedAchievements = [];
    this.frozenEnemiesCount = 0;
    this.dashCastCount = 0;
    
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
    this.voltShieldOrbs = []; // Stores orb history for trails
    for (let i = 0; i < 3; i++) this.voltShieldOrbs[i] = { trail: [] };
    
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

    // Debuff durations
    this.debuffs = {
      frost: 0
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

    // Rewind history buffer & timer
    this.rewindHistory = [];
    this.rewindTimer = 0;

    // Companion progression flags
    this.unlockedCompanion1 = false;
    this.unlockedCompanion2 = false;
    this.completedCompanion1Tree = false;
    this.completedCompanion1TreeAwarded = false;
    this.completedCompanion2Tree = false;
    this.completedCompanion2TreeAwarded = false;

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
      timeWarpHaste: false,
      companion1_speed: 0,
      companion1_damage: 0,
      companion1_triple_shot: false,
      companion1_emperor_meteor: false,
      companion2_speed: 0,
      companion2_damage: 0,
      companion2_chain_zap: false,
      fireManaReduce: 0,
      frostPierceExtra: 0,
      voidPullRate: 0,
      hasteDurationBonus: 0,
      freezeDurationBonus: 0
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

    // Apply stats from equipped runes only (runes in storage do nothing until equipped)
    (this.equippedRunes || []).forEach((item) => {
      if (item && item.stats) {
        for (const statKey in item.stats) {
          const value = item.stats[statKey];
          if (typeof value === 'boolean') {
            this.modifiers[statKey] = this.modifiers[statKey] || value;
          } else {
            this.modifiers[statKey] += value;
          }
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

    // Check tree completions and set companion flags
    if (tree && tree.isPlayerTree1Completed && tree.isPlayerTree1Completed()) {
      this.unlockedCompanion1 = true;
    }
    if (tree && tree.isCompanion1TreeCompleted && tree.isCompanion1TreeCompleted()) {
      this.completedCompanion1Tree = true;
    }
    if (tree && tree.isPlayerTree2Completed && tree.isPlayerTree2Completed()) {
      this.unlockedCompanion2 = true;
    }
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

    // Slippery Ice Trail boost
    if (this.onIceTrail) {
      multiplier += 0.4; // +40% speed boost sliding on ice
    }

    // Frost debuff slow down
    if (this.debuffs && this.debuffs.frost > 0) {
      multiplier *= 0.5; // 50% slow
    }

    // Check if player is standing in a frost_slow or void singularity zone
    if (this.game && this.game.areaEffects) {
      for (const ae of this.game.areaEffects) {
        if (ae.type === 'frost_slow' || ae.type === 'singularity') {
          const dx = this.x - ae.x;
          const dy = this.y - ae.y;
          if (dx * dx + dy * dy <= ae.radius * ae.radius) {
            multiplier *= 0.5; // 50% slow down
            break; // only apply slow once
          }
        }
      }
    }

    // Pool water slowdown
    if (this.game.levelManager && this.game.levelManager.theme === 'pool') {
      multiplier *= 0.65; // 35% slower in pool water
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
    if (this.game.isTutorial) return;
    if (this.iframeTimer > 0) return; // Immune during dash
    if ((this.godmodeTimer || 0) > 0) return; // Owner godmode — fully immune
    
    const dr = Math.min(0.75, this.modifiers.damageReduction || 0);
    const finalDamage = Math.max(1, Math.round(amount * (1.0 - dr)));
    
    this.hp -= finalDamage;
    this.game.screenShake = 8;
    this.iframeTimer = 0.4; // 0.4s brief invulnerability frames
    
    if (this.game.audio) this.game.audio.playHurt();

    if (this.game.showDamageNumbers) {
      this.game.particles.spawnText(this.x, this.y - 20, `-${finalDamage}`, {
        color: '#ff4757',
        fontSize: 13,
        weight: 'bold'
      });
    }

    if (this.hp <= 0) {
      this.hp = 0;
      if (this.game.audio) this.game.audio.playDeath();
      this.game.gameOver();
    }
    this.game.updateHUD();
  }

  applyDebuff(type, duration) {
    if (this.debuffs && type in this.debuffs) {
      this.debuffs[type] = Math.max(this.debuffs[type], duration);
    }
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
    try {
      // Cast spell
      spell.cast(this, angle, this.game);
      console.log(`[SPELL] Cast '${spellId}' (slot: ${slotName}) | Mana: ${spell.manaCost} cost, ${this.mp.toFixed(1)} remaining | CD: ${this.getSpellCooldown(spellId).toFixed(2)}s`);

      // Apply speed boost timer on Chrono Dash
      if (spellId === 'aether_dash' && this.modifiers.dashSpeedBoost) {
        this.dashSpeedBoostTimer = 3.0; // 3 seconds speed boost
      }

      this.spellCooldowns[slotName] = this.getSpellCooldown(spellId);
      this.game.updateHUD();
    } catch (err) {
      console.warn(`Spell cast failed: ${spellId}`, err);
      // Refund mana and keep the spell available if its cast logic crashed.
      this.mp = Math.min(this.getMaxMp(), this.mp + spell.manaCost);
      this.game.particles.spawnText(this.x, this.y - 20, "SPELL FAILED", {
        color: '#ff4757',
        fontSize: 9,
        fontPixel: true,
        life: 1.0
      });
      this.game.updateHUD();
    }
  }

  update(dt) {
    // Rewind history capture (once every 0.1s)
    if (!this.rewindHistory) this.rewindHistory = [];
    this.rewindTimer = (this.rewindTimer || 0) + dt;
    if (this.rewindTimer >= 0.1) {
      this.rewindTimer = 0;
      this.rewindHistory.push({ x: this.x, y: this.y, hp: this.hp, mp: this.mp });
      if (this.rewindHistory.length > 40) {
        this.rewindHistory.shift();
      }
    }

    this.onIceTrail = false;
    
    // Volcanic heat damage mechanic (1.25 DPS, ticks as 1 damage every 0.8 seconds)
    const lvl = this.game.levelManager;
    if (lvl && lvl.theme === 'volcanic' && !this.game.isTutorial) {
      if (!this.onIceTrail) {
        this.volcanicHeatTimer = (this.volcanicHeatTimer || 0) + dt;
        if (this.volcanicHeatTimer >= 0.8) {
          this.volcanicHeatTimer = 0;
          const heatDmg = 1;
          this.hp -= heatDmg;
          if (this.game.showDamageNumbers) {
            this.game.particles.spawnText(this.x, this.y - 20, `-${heatDmg}`, {
              color: '#e67e22',
              fontSize: 10,
              fontPixel: true
            });
          }
          if (this.hp <= 0) {
            this.hp = 0;
            if (this.game.audio) this.game.audio.playDeath();
            this.game.gameOver();
          }
          this.game.updateHUD();
        }
      } else {
        this.volcanicHeatTimer = 0;
      }
    } else {
      this.volcanicHeatTimer = 0;
    }

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
    if ((this.godmodeTimer || 0) > 0) {
      this.godmodeTimer -= dt;
      if (this.godmodeTimer < 0) this.godmodeTimer = 0;
    }

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

        // Update trail history
        const orbObj = this.voltShieldOrbs[i];
        orbObj.trail.unshift({ x: ox, y: oy });
        if (orbObj.trail.length > 10) orbObj.trail.pop();

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

          const dx = enemy.x - ox;
          const dy = enemy.y - oy;
          const minDist = ORB_R + enemy.radius;
          if (dx * dx + dy * dy <= minDist * minDist) {
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

    // Debuffs ticks down
    for (const key in this.debuffs) {
      if (this.debuffs[key] > 0) {
        this.debuffs[key] -= dt;
        if (this.debuffs[key] < 0) this.debuffs[key] = 0;
      }
    }

    // Runic Wisp shooting companion
    if (this.modifiers.unlockWisp) {
      this.wispAngle += dt * (3.5 + (this.modifiers.wispSpeed || 0) * 0.5);
      this.wispShootTimer += dt;
      const fireRate = Math.max(0.3, 1.2 - (this.modifiers.wispSpeed || 0) * 0.2);
      if (this.wispShootTimer >= fireRate) {
        this.wispShootTimer = 0;
        const wispCount = Math.max(1, Math.round(this.modifiers.wispCount || 1));
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
    
    // Movement integration with sub-stepping to prevent phasing through walls
    const speedDt = this.getSpeed() * dt;
    const stepX = this.vx * speedDt;
    const stepY = this.vy * speedDt;
    const moveDist = Math.sqrt(stepX * stepX + stepY * stepY);
    const subSteps = Math.ceil(moveDist / 10);
    const stepDx = stepX / subSteps;
    const stepDy = stepY / subSteps;
    
    for (let step = 0; step < subSteps; step++) {
      this.x += stepDx;
      this.y += stepDy;
      
      // Boundary check inside Arena level
      this.x = Math.max(this.radius + 40, Math.min(lvl.width - this.radius - 40, this.x));
      this.y = Math.max(this.radius + 40, Math.min(lvl.height - this.radius - 40, this.y));
      
      // Resolve collisions with walls
      const ptx = Math.floor(this.x / 40);
      const pty = Math.floor(this.y / 40);
      
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const ntx = ptx + dx;
          const nty = pty + dy;
          if (ntx >= 0 && ntx < lvl.tileWidth && nty >= 0 && nty < lvl.tileHeight) {
            if (lvl.tileGrid[ntx][nty] === 1) {
              const minX = ntx * 40;
              const maxX = minX + 40;
              const minY = nty * 40;
              const maxY = minY + 40;
              
              const closestX = Math.max(minX, Math.min(this.x, maxX));
              const closestY = Math.max(minY, Math.min(this.y, maxY));
              
              const odx = this.x - closestX;
              const ody = this.y - closestY;
              const distSq = odx * odx + ody * ody;
              
              if (distSq < this.radius * this.radius) {
                const odist = Math.sqrt(distSq);
                if (odist > 0.01) {
                  const pushAmount = this.radius - odist;
                  const factor = pushAmount / odist;
                  this.x += odx * factor;
                  this.y += ody * factor;
                } else {
                  // Centered inside, push out to closest edge
                  const distL = this.x - minX;
                  const distR = maxX - this.x;
                  const distT = this.y - minY;
                  const distB = maxY - this.y;
                  const minDist = Math.min(distL, distR, distT, distB);
                  if (minDist === distL) this.x -= this.radius;
                  else if (minDist === distR) this.x += this.radius;
                  else if (minDist === distT) this.y -= this.radius;
                  else this.y += this.radius;
                }
              }
            }
          }
        }
      }
    }

    // Stuck in wall detection & resolution
    const curTx = Math.floor(this.x / 40);
    const curTy = Math.floor(this.y / 40);
    let isStuck = false;
    if (curTx >= 0 && curTx < lvl.tileWidth && curTy >= 0 && curTy < lvl.tileHeight) {
      if (lvl.tileGrid[curTx][curTy] === 1) {
        isStuck = true;
      }
    }

    if (!isStuck) {
      // Check if deeply inside any pillar
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const ntx = curTx + dx;
          const nty = curTy + dy;
          if (ntx >= 0 && ntx < lvl.tileWidth && nty >= 0 && nty < lvl.tileHeight) {
            if (lvl.tileGrid[ntx][nty] === 1) {
              const obsX = ntx * 40 + 20;
              const obsY = nty * 40 + 20;
              const sdx = this.x - obsX;
              const sdy = this.y - obsY;
              if (sdx * sdx + sdy * sdy < 324) { // 18 * 18 = 324
                isStuck = true;
                break;
              }
            }
          }
        }
      }
    }

    if (isStuck) {
      // Find nearest empty block
      let nearestTile = null;
      let minDistSq = Infinity;
      const searchRadius = 15;

      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        for (let dy = -searchRadius; dy <= searchRadius; dy++) {
          const nx = curTx + dx;
          const ny = curTy + dy;
          if (nx >= 0 && nx < lvl.tileWidth && ny >= 0 && ny < lvl.tileHeight) {
            if (lvl.tileGrid[nx][ny] === 0 || lvl.tileGrid[nx][ny] === 2 || lvl.tileGrid[nx][ny] === 3) {
              const tileCenterX = nx * 40 + 20;
              const tileCenterY = ny * 40 + 20;
              const distSq = dx * dx + dy * dy;
              if (distSq < minDistSq) {
                minDistSq = distSq;
                nearestTile = { x: tileCenterX, y: tileCenterY };
              }
            }
          }
        }
      }

      if (nearestTile) {
        this.x = nearestTile.x;
        this.y = nearestTile.y;
        this.vx = 0;
        this.vy = 0;
        
        // Silent teleportation: no particles/text
      }
    }
  }

  wispShootNearestEnemy(wispIndex = 0, totalWisps = 1) {
    const trackRange = 220 + (this.modifiers.wispRange || 0) * 40;
    let nearest = null;
    let minDist = trackRange;

    // Each additional wisp targets a different enemy (offset by index in sorted list)
    const playerX = this.x;
    const playerY = this.y;
    const sorted = [...this.game.enemies].filter(e => !e.dead && !e.isInTallGrass()).sort((a, b) => {
      const distSqA = (a.x - playerX) * (a.x - playerX) + (a.y - playerY) * (a.y - playerY);
      const distSqB = (b.x - playerX) * (b.x - playerX) + (b.y - playerY) * (b.y - playerY);
      return distSqA - distSqB;
    });
    const target = sorted[wispIndex % sorted.length] || null;
    nearest = target && ((target.x - playerX) * (target.x - playerX) + (target.y - playerY) * (target.y - playerY) < trackRange * trackRange) ? target : null;

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
    this.runeStorage   = [];
    this.equippedRunes = [];
    this.gearStorage   = [];
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
      hueShift: this.hueShift,
      shopMaxHp: this.shopMaxHp,
      shopMaxMp: this.shopMaxMp,
      shopManaRegen: this.shopManaRegen,
      runeStorage: this.runeStorage.map(r => r.id),
      equippedRunes: this.equippedRunes.map(r => r.id),
      gearStorage: this.gearStorage.map(g => g.id),
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
      keys: this.keys || 0,
      theme: this.game.levelManager?.theme || 'dungeon',
      unlockedSectors: this.game.levelManager?.unlockedSectors ? Array.from(this.game.levelManager.unlockedSectors) : ["1,1"],
      sectorThemes: this.game.levelManager?.sectorThemes || {"1,1": 'dungeon'},
      unlockedDoors: this.game.levelManager?.unlockedDoors ? Array.from(this.game.levelManager.unlockedDoors) : [],
      earnedAchievements: this.earnedAchievements || [],
      frozenEnemiesCount: this.frozenEnemiesCount || 0,
      dashCastCount: this.dashCastCount || 0,
      unlockedCompanion1: this.unlockedCompanion1,
      unlockedCompanion2: this.unlockedCompanion2,
      completedCompanion1Tree: this.completedCompanion1Tree,
      completedCompanion1TreeAwarded: this.completedCompanion1TreeAwarded,
      completedCompanion2Tree: this.completedCompanion2Tree,
      completedCompanion2TreeAwarded: this.completedCompanion2TreeAwarded,
      chapterUnlocked: this.chapterUnlocked || 1
    };

    for (const key in this.game.abilityTree.nodes) {
      progress.treeNodes[key] = this.game.abilityTree.nodes[key].unlocked;
    }

    this._pendingSave = progress;
    if (!this._saveTimer) {
      this._saveTimer = setTimeout(() => this._flushSave(), 500);
    }
  }

  _flushSave() {
    this._saveTimer = null;
    if (!this._pendingSave) return;
    const isMultiplayer = this.game.multiplayer && (this.game.multiplayer.connected || this.game.multiplayer.roomCode);
    const saveKey = isMultiplayer ? 'aetherweaver_mp_save' : 'aetherweaver_save';
    localStorage.setItem(saveKey, JSON.stringify(this._pendingSave));
    this._pendingSave = null;
    if (this.game?.scheduleCloudSync) {
      this.game.scheduleCloudSync();
    }
  }

  loadGameState() {
    try {
      const isMultiplayer = this.game.multiplayer && (this.game.multiplayer.connected || this.game.multiplayer.roomCode);
      const saveKey = isMultiplayer ? 'aetherweaver_mp_save' : 'aetherweaver_save';

      // Always reset tree nodes first to prevent bleed-through between singleplayer and multiplayer
      const tree = this.game.abilityTree;
      const roots = new Set(['root', 'comp1_root', 'comp2_root']);
      if (tree && tree.nodes) {
        for (const key in tree.nodes) {
          tree.nodes[key].unlocked = roots.has(key);
        }
      }

      const data = localStorage.getItem(saveKey);
      if (data) {
        const progress = JSON.parse(data);
        this.level = progress.level || 1;
        this.xp = progress.xp || 0;
        this.xpNeeded = progress.xpNeeded || 50;
        this.ap = progress.ap || 0;
        this.shards = progress.shards || 0;
        this.hueShift = progress.hueShift || 0;
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
        this.keys = progress.keys || 0;
        this.earnedAchievements = progress.earnedAchievements || [];
        this.frozenEnemiesCount = progress.frozenEnemiesCount || 0;
        this.dashCastCount = progress.dashCastCount || 0;
        this.unlockedCompanion1 = progress.unlockedCompanion1 || false;
        this.unlockedCompanion2 = progress.unlockedCompanion2 || false;
        this.completedCompanion1Tree = progress.completedCompanion1Tree || false;
        this.completedCompanion1TreeAwarded = progress.completedCompanion1TreeAwarded || false;
        this.completedCompanion2Tree = progress.completedCompanion2Tree || false;
        this.completedCompanion2TreeAwarded = progress.completedCompanion2TreeAwarded || false;
        this.chapterUnlocked = progress.chapterUnlocked || 1;
        if (this.game.levelManager) {
          if (progress.theme) this.game.levelManager.theme = progress.theme;
          if (progress.unlockedSectors) {
            this.game.levelManager.unlockedSectors = new Set(progress.unlockedSectors);
          }
          if (progress.sectorThemes) {
            this.game.levelManager.sectorThemes = progress.sectorThemes;
          }
          if (progress.unlockedDoors) {
            this.game.levelManager.unlockedDoors = new Set(progress.unlockedDoors);
          }
          this.game.levelManager.generateObstacles();
        }
        
        const findItem = (id) => {
          return RELICS_CATALOG.find(r => r.id === id) || EQUIPMENT_CATALOG.find(e => e.id === id);
        };

        // Load new storage format
        if (progress.runeStorage) {
          this.runeStorage = progress.runeStorage.map(id => findItem(id)).filter(Boolean);
        } else if (progress.inventory) {
          // Migrate old saves: split old inventory into runes vs gear
          const all = progress.inventory.map(id => findItem(id)).filter(Boolean);
          this.runeStorage = all.filter(item => !item.type);
          this.gearStorage = all.filter(item => !!item.type);
        }
        if (progress.equippedRunes) {
          this.equippedRunes = progress.equippedRunes.map(id => findItem(id)).filter(Boolean);
        }
        if (progress.gearStorage) {
          this.gearStorage = progress.gearStorage.map(id => findItem(id)).filter(Boolean);
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
            if (tree && tree.nodes[key]) {
              tree.nodes[key].unlocked = progress.treeNodes[key];
            }
          }
        }
      } else {
        if (isMultiplayer) {
          this.level = 1;
          this.xp = 0;
          this.xpNeeded = 50;
          this.ap = 0;
          this.shards = 0;
          this.shopMaxHp = 0;
          this.shopMaxMp = 0;
          this.shopManaRegen = 0;
          this.runeStorage = [];
          this.equippedRunes = [];
          this.gearStorage = [];
          this.equipment = { helmet: null, chestplate: null, boots: null, weapon: null, ring: null };
        }
      }

      // Always run modifier recalculations and clamp health/mana to max values
      if (tree) {
        this.recalculateModifiers(tree);
      }
      this.hp = Math.min(this.getMaxHp(), this.hp);
      this.mp = Math.min(this.getMaxMp(), this.mp);
      if (this.hp <= 0) this.hp = this.getMaxHp();
      if (this.mp <= 0) this.mp = this.getMaxMp();

      // Trigger HUD update to refresh levels, stats, and spell slots
      this.game.updateHUD();
    } catch (e) {
      console.warn("Failed to load local storage save: ", e);
    }
  }

  draw(ctx, assetManager, frameIndex) {
    // Draw 8-bit trail shadow (flat blocky rect)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.fillRect(this.x - this.game.camera.x - (this.radius - 2), this.y - this.game.camera.y + 5, (this.radius - 2) * 2, 3);

    const worldMouse = this.game.getWorldMouse();
    const mx = worldMouse.x;
    const isFacingLeft = mx < this.x;
    
    let fIdx = 0;
    if (this.vx * this.vx + this.vy * this.vy > 0.0001) {
      fIdx = 1 + (Math.floor(frameIndex * 6) % 2);
    }

    ctx.save();
    if (this.hueShift) {
      ctx.filter = `hue-rotate(${this.hueShift}deg)`;
    }
    
    // Draw Volt Shield orbs (drawn before player so player renders on top)
    if (this.voltShieldTimer > 0) {
      const ORB_COUNT  = 3;
      const ORBIT_R    = 80;
      const SPIN_SPEED = 2.2;
      const cx = this.x - this.game.camera.x;
      const cy = this.y - this.game.camera.y;

      // Orbit ring hint (subtly blocky circle)
      this.game.drawCircle(ctx, cx, cy, ORBIT_R, null, 'rgba(255, 226, 0, 0.08)', 1, 4);

      for (let i = 0; i < ORB_COUNT; i++) {
        const orbAngle = this.voltShieldTimer * SPIN_SPEED * -1 + (i / ORB_COUNT) * Math.PI * 2;
        const ox = cx + Math.cos(orbAngle) * ORBIT_R;
        const oy = cy + Math.sin(orbAngle) * ORBIT_R;

        // Draw ribbon trail for orb
        const orbObj = this.voltShieldOrbs[i];
        if (orbObj && orbObj.trail && orbObj.trail.length > 1) {
          ctx.save();
          ctx.fillStyle = '#fff200';

          for (let j = 0; j < orbObj.trail.length - 1; j++) {
            const p1 = orbObj.trail[j];
            const alpha = 1.0 - (j / orbObj.trail.length);
            const size = Math.max(2, 6 * alpha);
            
            ctx.globalAlpha = alpha > 0.5 ? 0.6 : 0.2;
            ctx.fillRect(
              Math.round((p1.x - this.game.camera.x) / 2) * 2 - size/2, 
              Math.round((p1.y - this.game.camera.y) / 2) * 2 - size/2, 
              size, size
            );
          }
          ctx.restore();
        }

        // Draw orb core (pixelated circle)
        this.game.drawCircle(ctx, ox, oy, 6, '#fff200', '#ffffff', 2, 2);
      }
    }

    // Draw buffs indicator rings under player (drawn as strokeRect)
    if (this.buffs.damage > 0) {
      ctx.strokeStyle = 'rgba(255, 71, 87, 0.45)';
      ctx.lineWidth = 1.5;
      const r = this.radius + 3;
      ctx.strokeRect(this.x - this.game.camera.x - r, this.y - this.game.camera.y - r, r * 2, r * 2);
    }
    if (this.buffs.haste > 0) {
      ctx.strokeStyle = 'rgba(255, 159, 67, 0.45)';
      ctx.lineWidth = 1.5;
      const r = this.radius + 5;
      ctx.strokeRect(this.x - this.game.camera.x - r, this.y - this.game.camera.y - r, r * 2, r * 2);
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
      const count = Math.max(1, Math.round(this.modifiers.wispCount || 1));
      for (let w = 0; w < count; w++) {
        const orbitOffset = (w / count) * Math.PI * 2;
        const wx = this.x + Math.cos(this.wispAngle + orbitOffset) * wispRadius - this.game.camera.x;
        const wy = this.y + Math.sin(this.wispAngle + orbitOffset) * wispRadius - this.game.camera.y;
        
        // Draw 8-bit shadow (flat rect)
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(wx - 3, wy + 3, 6, 2);

        assetManager.draw(ctx, 'item_wisp', wx, wy, 12, this.game.frameIndex * 4);
      }
    }
  }
}
