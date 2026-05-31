/**
 * AbilityTree - Interactive Pan & Zoom Runic Web
 * Manages interconnected nodes that grant passive and active upgrades.
 * Supports Player, Companion 1, and Companion 2 trees.
 */
import { SPELL_TYPES } from './Spells.js';

export class AbilityTree {
  constructor(game) {
    this.game = game;
    this.nodes = {};
    this.rootId = 'root';
    
    // Zoom and pan state
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    this.minZoom = 0.4;
    this.maxZoom = 2.0;
    
    // Mouse interaction state
    this.dragStart = { x: 0, y: 0 };
    this.isDragging = false;
    this.hoveredNode = null;
    this.selectedNode = null;
    
    this.currentView = 'player'; // 'player', 'companion1', 'companion2'
    
    this.initTree();
  }

  /**
   * Generates the full ability tree.
   * Includes extended Player Tiers (13-24) and Companion Trees.
   */
  initTree() {
    // ── Root ──────────────────────────────────────────────────────────────
    this.nodes['root'] = {
      id: 'root', name: 'Aether Core',
      desc: 'The spark of all rune-weaving. +5% XP gain. Unlocks all elemental paths.',
      x: 0, y: 0, cost: 0, unlocked: true, connections: [],
      stats: { xpGain: 0.05 }, type: 'root', element: 'aether',
      view: 'player', expansion: 0
    };

    // Branch angles
    const branches = [
      { type: SPELL_TYPES.FIRE,      angle: -Math.PI / 2,                       color: '#ff4757', name: 'Pyromancy'   },
      { type: SPELL_TYPES.FROST,     angle: -Math.PI / 2 - (2*Math.PI)/5,       color: '#10ac84', name: 'Cryomancy'   },
      { type: SPELL_TYPES.VOID,      angle:  Math.PI / 2 + (2*Math.PI)/10,      color: '#a55eea', name: 'Voidweaving' },
      { type: SPELL_TYPES.TIME,      angle:  Math.PI / 2 - (2*Math.PI)/10,      color: '#ff9f43', name: 'Chronomancy' },
      { type: SPELL_TYPES.LIGHTNING, angle: -Math.PI / 2 + (2*Math.PI)/5,       color: '#f1c40f', name: 'Electromancy'},
    ];

    // Branch nodes details (Tiers 1 - 24)
    const branchData = {
      [SPELL_TYPES.FIRE]: [
        /* t1  */ { name: 'Ember Touch',       desc: '+10% Fire Damage.',                               stats: { fireDamage: 0.10 } },
        /* t2  */ { name: 'Ignite Core',       desc: 'Unlocks Spell: Fireball (LMB).',                  stats: { unlockSpell: 'fireball' },              type: 'unlock' },
        /* t3  */ { name: 'Fuel the Flames',   desc: '+8% Fire Dmg, +2% Crit Chance.',                  stats: { fireDamage: 0.08, critChance: 0.02 } },
        /* t4  */ { name: 'Flame Fissure',     desc: 'Unlocks Spell: Flame Wave (LMB upgrade).',        stats: { unlockSpell: 'flame_wave' },            type: 'unlock' },
        /* t5  */ { name: 'Scorching Aura',    desc: '+10% Fire Dmg, +5 Max HP.',                       stats: { fireDamage: 0.10, maxHp: 5 } },
        /* t6  */ { name: 'Pyro Amplifier',    desc: '+20% Fire Dmg, +10% Cast Speed.',                 stats: { fireDamage: 0.20, castSpeed: 0.10 },    type: 'major', cost: 2 },
        /* t7  */ { name: 'Meteor Strike',     desc: 'Unlocks Spell: Meteor Strike (Q).',               stats: { unlockSpell: 'meteor_strike' },        type: 'unlock', cost: 2 },
        /* t8  */ { name: 'Ash Shroud',        desc: '+6% Dmg Reduction, +8% Fire Dmg.',                stats: { damageReduction: 0.06, fireDamage: 0.08 } },
        /* t9  */ { name: 'Magma Heart',       desc: '+0.4 HP Regen/s, +12% Fire Dmg.',                 stats: { healthRegen: 0.4, fireDamage: 0.12 } },
        /* t10 */ { name: 'Cinder Rain',       desc: 'Keystone: Fireball explodes on hit, 30% AoE dmg.', stats: { fireballExplode: true },              type: 'keystone', cost: 3 },
        /* t11 */ { name: 'Solar Flare',       desc: '+15% Fire Dmg, +0.3 HP Regen/s.',                 stats: { fireDamage: 0.15, healthRegen: 0.3 } },
        /* t12 */ { name: 'Inferno Ascent',    desc: 'Keystone: +10% all Dmg, +25% Fire Dmg.',          stats: { fireDamage: 0.25, allDamage: 0.10 },    type: 'keystone', cost: 3 },
        /* t13 */ { name: 'Lava Core',         desc: '+15% Fire Damage.',                               stats: { fireDamage: 0.15 } },
        /* t14 */ { name: 'Solar Beam',        desc: 'Unlocks Spell: Solar Beam (Active LMB).',          stats: { unlockSpell: 'solar_beam' },            type: 'unlock' },
        /* t15 */ { name: 'Magma Flow',        desc: '+12% Fire Damage, +8 Max HP.',                    stats: { fireDamage: 0.12, maxHp: 8 } },
        /* t16 */ { name: 'Conflagration',     desc: '+20% Fire Damage, +5% Crit Chance.',              stats: { fireDamage: 0.20, critChance: 0.05 },   type: 'major', cost: 2 },
        /* t17 */ { name: 'Volcano Core',      desc: '+15% Fire Damage, +0.5 HP Regen/s.',              stats: { fireDamage: 0.15, healthRegen: 0.5 } },
        /* t18 */ { name: 'Avatar of Fire',    desc: 'Keystone: Fire spells consume 25% less mana.',     stats: { fireManaReduce: 0.25, fireDamage: 0.20 }, type: 'keystone', cost: 3 },
        /* t19 */ { name: 'Solar Heat',        desc: '+20% Fire Damage, +10% Cast Speed.',              stats: { fireDamage: 0.20, castSpeed: 0.10 } },
        /* t20 */ { name: 'Volcanic Wrath',    desc: 'Unlocks Spell: Volcanic Eruption (Active Ult).',   stats: { unlockSpell: 'volcanic_eruption' },     type: 'unlock', cost: 2 },
        /* t21 */ { name: 'Supernova Touch',   desc: '+25% Fire Damage, +10 Max HP.',                   stats: { fireDamage: 0.25, maxHp: 10 } },
        /* t22 */ { name: 'Infernal Will',     desc: '+30% Fire Damage, +15 Max Mana.',                 stats: { fireDamage: 0.30, maxMp: 15 },          type: 'major', cost: 2 },
        /* t23 */ { name: 'Magma Soul',        desc: '+35% Fire Damage, +0.6 HP Regen/s.',              stats: { fireDamage: 0.35, healthRegen: 0.6 } },
        /* t24 */ { name: 'God of Fire',       desc: 'Keystone: Fire spells deal +50% damage.',         stats: { fireDamage: 0.50 },                    type: 'keystone', cost: 3 },
      ],
      [SPELL_TYPES.FROST]: [
        /* t1  */ { name: 'Frost Veil',        desc: '+10% Frost Damage.',                              stats: { frostDamage: 0.10 } },
        /* t2  */ { name: 'Glacial Core',      desc: 'Unlocks Spell: Frost Spike (RMB).',               stats: { unlockSpell: 'frost_spike' },           type: 'unlock' },
        /* t3  */ { name: 'Permafrost',        desc: '+6% Frost Dmg, +3% Dmg Reduction.',               stats: { frostDamage: 0.06, damageReduction: 0.03 } },
        /* t4  */ { name: 'Glacial Orb',       desc: 'Unlocks Spell: Blizzard Orb (RMB upgrade).',      stats: { unlockSpell: 'blizzard_orb' },          type: 'unlock' },
        /* t5  */ { name: 'Crystalline Shell', desc: '+8% Dmg Reduction, +5 Max HP.',                   stats: { damageReduction: 0.08, maxHp: 5 } },
        /* t6  */ { name: 'Cryo Amplifier',    desc: '+20% Frost Dmg, +0.5 Mana Regen/s.',              stats: { frostDamage: 0.20, manaRegen: 0.5 },    type: 'major', cost: 2 },
        /* t7  */ { name: 'Ice Nova',          desc: 'Unlocks Spell: Ice Nova (RMB).',                  stats: { unlockSpell: 'ice_nova' },              type: 'unlock', cost: 2 },
        /* t8  */ { name: 'Deep Freeze',       desc: '+10% Frost Dmg, slow lasts longer.',               stats: { frostDamage: 0.10, spellDuration: 0.15 } },
        /* t9  */ { name: 'Glacial Stride',    desc: '+5% Move Speed, +6% Frost Dmg.',                   stats: { speed: 0.05, frostDamage: 0.06 } },
        /* t10 */ { name: 'Glacial Tomb',      desc: 'Keystone: Frost Spike pierces + freeze on chill.', stats: { frostPierce: true, freezeOnChill: true }, type: 'keystone', cost: 3 },
        /* t11 */ { name: 'Cryo Lattice',      desc: '+15% Frost Dmg, +0.4 Mana Regen/s.',              stats: { frostDamage: 0.15, manaRegen: 0.4 } },
        /* t12 */ { name: 'Absolute Zero',     desc: 'Keystone: Ice Nova fully freezes all hit enemies.', stats: { iceNovaFreeze: true, frostDamage: 0.20 }, type: 'keystone', cost: 3 },
        /* t13 */ { name: 'Frostbite',         desc: '+15% Frost Damage.',                              stats: { frostDamage: 0.15 } },
        /* t14 */ { name: 'Glacial Fissure',   desc: 'Unlocks Spell: Glacial Fissure (Active RMB).',    stats: { unlockSpell: 'glacial_fissure' },        type: 'unlock' },
        /* t15 */ { name: 'Permafrost Shield', desc: '+10% Frost Damage, +2% Dmg Reduction.',           stats: { frostDamage: 0.10, damageReduction: 0.02 } },
        /* t16 */ { name: 'Teal Citadel',      desc: '+20% Frost Damage, +10 Max HP.',                  stats: { frostDamage: 0.20, maxHp: 10 },          type: 'major', cost: 2 },
        /* t17 */ { name: 'Crystal Stride',    desc: '+6% Move Speed, +12% Frost Damage.',              stats: { speed: 0.06, frostDamage: 0.12 } },
        /* t18 */ { name: 'Eternal Frost',     desc: 'Keystone: Frost Spike pierces +2 targets.',       stats: { frostPierceExtra: 2 },                  type: 'keystone', cost: 3 },
        /* t19 */ { name: 'Absolute Chill',    desc: '+20% Frost Damage, +0.5 Mana Regen/s.',           stats: { frostDamage: 0.20, manaRegen: 0.5 } },
        /* t20 */ { name: 'Absolute Zero',     desc: 'Unlocks Spell: Absolute Zero (Active Ultimate).', stats: { unlockSpell: 'absolute_zero' },        type: 'unlock', cost: 2 },
        /* t21 */ { name: 'Glacial Shell',     desc: '+4% Dmg Reduction, +12 Max HP.',                  stats: { damageReduction: 0.04, maxHp: 12 } },
        /* t22 */ { name: 'Cryo Lattice Max',  desc: '+25% Frost Damage, +20 Max Mana.',                stats: { frostDamage: 0.25, maxMp: 20 },          type: 'major', cost: 2 },
        /* t23 */ { name: 'Zero Point Energy', desc: '+30% Frost Damage, +0.6 Mana Regen/s.',           stats: { frostDamage: 0.30, manaRegen: 0.6 } },
        /* t24 */ { name: 'God of Frost',      desc: 'Keystone: Freeze duration +2 seconds.',           stats: { freezeDurationBonus: 2.0, frostDamage: 0.20 }, type: 'keystone', cost: 3 },
      ],
      [SPELL_TYPES.VOID]: [
        /* t1  */ { name: 'Dark Rift',         desc: '+4% Void Dmg, +4% Void AoE.',                     stats: { voidDamage: 0.04, voidArea: 0.04 } },
        /* t2  */ { name: 'Void Core',         desc: 'Unlocks Spell: Void Singularity (Q).',             stats: { unlockSpell: 'void_pull' },             type: 'unlock' },
        /* t3  */ { name: 'Rift Siphon',       desc: '+6% Void Dmg, +0.15 Mana Regen/s.',               stats: { voidDamage: 0.06, manaRegen: 0.15 } },
        /* t4  */ { name: 'Null Field',        desc: '+8% Void AoE, +5 Max Mana.',                       stats: { voidArea: 0.08, maxMp: 5 } },
        /* t5  */ { name: 'Entropy Surge',     desc: '+10% Void Dmg, +2% Crit Chance.',                  stats: { voidDamage: 0.10, critChance: 0.02 } },
        /* t6  */ { name: 'Void Amplifier',    desc: '+20% Void Dmg, +8% Void AoE.',                     stats: { voidDamage: 0.20, voidArea: 0.08 },     type: 'major', cost: 2 },
        /* t7  */ { name: 'Shadow Blink',      desc: 'Unlocks Spell: Shadow Blink (Space).',            stats: { unlockSpell: 'shadow_blink' },          type: 'unlock', cost: 2 },
        /* t8  */ { name: 'Shadow Pulse',      desc: '+8% Void Dmg, +3% Move Speed.',                    stats: { voidDamage: 0.08, speed: 0.03 } },
        /* t9  */ { name: 'Annihilation',      desc: '+12% Void Dmg, +5 Max Mana.',                      stats: { voidDamage: 0.12, maxMp: 5 } },
        /* t10 */ { name: 'Shattered Dimension', desc: 'Keystone: Singularity + Fire projectile = Supernova!', stats: { supernovaEnabled: true },         type: 'keystone', cost: 3 },
        /* t11 */ { name: 'Event Horizon',     desc: '+15% Void Dmg, wider Singularity pull.',            stats: { voidDamage: 0.15, voidArea: 0.15 } },
        /* t12 */ { name: 'Dimension Break',   desc: 'Keystone: Shadow Blink explosion deals double damage.', stats: { shadowBlinkDmg: true, voidDamage: 0.20 }, type: 'keystone', cost: 3 },
        /* t13 */ { name: 'Singularity Hold',  desc: '+15% Void Damage.',                               stats: { voidDamage: 0.15 } },
        /* t14 */ { name: 'Void Beam',         desc: 'Unlocks Spell: Void Beam (Active LMB).',          stats: { unlockSpell: 'void_beam' },            type: 'unlock' },
        /* t15 */ { name: 'Entropic Pull',     desc: '+8% Void AoE, +8 Max Mana.',                      stats: { voidArea: 0.08, maxMp: 8 } },
        /* t16 */ { name: 'Eldritch Flesh',    desc: '+20% Void Damage, +12 Max HP.',                   stats: { voidDamage: 0.20, maxHp: 12 },          type: 'major', cost: 2 },
        /* t17 */ { name: 'Event Horizon Max', desc: '+15% Void Damage, +10% Void AoE.',                stats: { voidDamage: 0.15, voidArea: 0.10 } },
        /* t18 */ { name: 'Collapse Pulse',    desc: 'Keystone: Singularity pull rate +40%.',           stats: { voidPullRate: 0.4 },                    type: 'keystone', cost: 3 },
        /* t19 */ { name: 'Dimensional Tear',  desc: '+20% Void Damage, +5% Crit Chance.',              stats: { voidDamage: 0.20, critChance: 0.05 } },
        /* t20 */ { name: 'Nether Collapse',   desc: 'Unlocks Spell: Singularity Collapse (Active Ult).', stats: { unlockSpell: 'void_singularity_collapse' }, type: 'unlock', cost: 2 },
        /* t21 */ { name: 'Chaos Shield',      desc: '+3% Dmg Reduction, +15 Max HP.',                  stats: { damageReduction: 0.03, maxHp: 15 } },
        /* t22 */ { name: 'Nether Weaver',     desc: '+25% Void Damage, +25 Max Mana.',                 stats: { voidDamage: 0.25, maxMp: 25 },          type: 'major', cost: 2 },
        /* t23 */ { name: 'Dark Nebula',       desc: '+30% Void Damage, +15% Void AoE.',                stats: { voidDamage: 0.30, voidArea: 0.15 } },
        /* t24 */ { name: 'God of Void',       desc: 'Keystone: Spells deal +40% Void Damage.',         stats: { voidDamage: 0.40 },                    type: 'keystone', cost: 3 },
      ],
      [SPELL_TYPES.TIME]: [
        /* t1  */ { name: 'Time Sense',        desc: '+4% Cooldown Reduction.',                          stats: { cooldownReduction: 0.04 } },
        /* t2  */ { name: 'Chrono Core',       desc: 'Unlocks Spell: Chrono Dash (Space).',              stats: { unlockSpell: 'aether_dash' },           type: 'unlock' },
        /* t3  */ { name: 'Swift Step',        desc: '+3% Move Speed, +4% CDR.',                         stats: { speed: 0.03, cooldownReduction: 0.04 } },
        /* t4  */ { name: 'Haste Weave',       desc: '+5% Move Speed, +5% CDR.',                         stats: { speed: 0.05, cooldownReduction: 0.05 } },
        /* t5  */ { name: 'Slipstream',        desc: '+5% Move Speed, +5 Max Mana.',                     stats: { speed: 0.05, maxMp: 5 } },
        /* t6  */ { name: 'Epoch Shift',       desc: 'Unlocks Spell: Temporal Shift (Q).',               stats: { unlockSpell: 'chrono_shift' },          type: 'unlock', cost: 2 },
        /* t7  */ { name: 'Time Warp',         desc: 'Unlocks Spell: Time Warp (Q upgrade).',            stats: { unlockSpell: 'time_warp' },             type: 'unlock', cost: 2 },
        /* t8  */ { name: 'Phase Walk',        desc: '+8% Move Speed, +6% CDR.',                         stats: { speed: 0.08, cooldownReduction: 0.06 } },
        /* t9  */ { name: 'Time Dilation',     desc: '+6% CDR, +5% Move Speed.',                         stats: { cooldownReduction: 0.06, speed: 0.05 } },
        /* t10 */ { name: 'Temporal Reflex',   desc: 'Keystone: Dash leaves slowing decoy.',             stats: { chronoDashSlow: true },                 type: 'keystone', cost: 3 },
        /* t11 */ { name: 'Chrono Mastery',    desc: '+8% CDR, +5% Move Speed.',                         stats: { cooldownReduction: 0.08, speed: 0.05 } },
        /* t12 */ { name: 'Paradox Engine',    desc: 'Keystone: Time Warp also grants 3s speed boost.',  stats: { timeWarpHaste: true, cooldownReduction: 0.10 }, type: 'keystone', cost: 3 },
        /* t13 */ { name: 'Temporal Haste',    desc: '+6% Cooldown Reduction.',                         stats: { cooldownReduction: 0.06 } },
        /* t14 */ { name: 'Time Bubble',       desc: 'Unlocks Spell: Time Bubble (Active Space).',      stats: { unlockSpell: 'time_bubble' },           type: 'unlock' },
        /* t15 */ { name: 'Swift Chrono',      desc: '+5% Move Speed, +4% CDR.',                        stats: { speed: 0.05, cooldownReduction: 0.04 } },
        /* t16 */ { name: 'Paradox Loop',      desc: '+15 Max HP, +10 Max Mana.',                       stats: { maxHp: 15, maxMp: 10 },                 type: 'major', cost: 2 },
        /* t17 */ { name: 'Chronos Ward',      desc: '+6% CDR, +3% Dmg Reduction.',                     stats: { cooldownReduction: 0.06, damageReduction: 0.03 } },
        /* t18 */ { name: 'Temporal Echo',     desc: 'Keystone: Haste buff duration +2s.',              stats: { hasteDurationBonus: 2.0 },              type: 'keystone', cost: 3 },
        /* t19 */ { name: 'Future Sight',      desc: '+8% CDR, +5% Move Speed.',                        stats: { cooldownReduction: 0.08, speed: 0.05 } },
        /* t20 */ { name: 'Temporal Rewind',   desc: 'Unlocks Spell: Temporal Rewind (Active Ultimate).', stats: { unlockSpell: 'temporal_rewind' },        type: 'unlock', cost: 2 },
        /* t21 */ { name: 'Slipstream Aura',   desc: '+8% Move Speed, +10 Max HP.',                     stats: { speed: 0.08, maxHp: 10 } },
        /* t22 */ { name: 'Quantum Leap',      desc: '+10% CDR, +15 Max Mana.',                         stats: { cooldownReduction: 0.10, maxMp: 15 },   type: 'major', cost: 2 },
        /* t23 */ { name: 'Dilation Aura',     desc: '+8% Move Speed, +8% CDR.',                        stats: { speed: 0.08, cooldownReduction: 0.08 } },
        /* t24 */ { name: 'God of Time',       desc: 'Keystone: Resets all cooldowns on 20% CDR.',      stats: { cooldownReduction: 0.12 },              type: 'keystone', cost: 3 },
      ],
      [SPELL_TYPES.LIGHTNING]: [
        /* t1  */ { name: 'Static Charge',     desc: '+5% Lightning Dmg, +3% Cast Speed.',               stats: { lightningDamage: 0.05, castSpeed: 0.03 } },
        /* t2  */ { name: 'Volt Core',         desc: 'Unlocks Spell: Tesla Bolt (E).',                   stats: { unlockSpell: 'tesla_bolt' },            type: 'unlock' },
        /* t3  */ { name: 'Arc Flash',         desc: '+6% Lightning Dmg, +4% Cast Speed.',               stats: { lightningDamage: 0.06, castSpeed: 0.04 } },
        /* t4  */ { name: 'Thunderous Barrier', desc: 'Unlocks Spell: Volt Shield (E upgrade).',         stats: { unlockSpell: 'volt_shield' },           type: 'unlock' },
        /* t5  */ { name: 'Conductivity',      desc: '+8% Lightning Dmg, +5 Max Mana.',                  stats: { lightningDamage: 0.08, maxMp: 5 } },
        /* t6  */ { name: 'Bolt Amplifier',    desc: '+20% Lightning Dmg, +8% Cast Speed.',              stats: { lightningDamage: 0.20, castSpeed: 0.08 }, type: 'major', cost: 2 },
        /* t7  */ { name: 'Storm Call',        desc: 'Unlocks Spell: Storm Call (E upgrade).',          stats: { unlockSpell: 'storm_call' },            type: 'unlock', cost: 2 },
        /* t8  */ { name: 'Chain Reaction',    desc: '+1 Tesla Bolt chain jump.',                        stats: { teslaJumps: 1, lightningDamage: 0.05 } },
        /* t9  */ { name: 'Surge Capacitor',   desc: '+10% Lightning Dmg, Tesla restores 0.5 mana/hit.', stats: { lightningDamage: 0.10, teslaManaGain: 0.5 } },
        /* t10 */ { name: 'Conductive Surge',  desc: 'Keystone: +3 Tesla chain jumps + 1 mana per hit.', stats: { teslaJumps: 3, teslaManaGain: 1.0 },   type: 'keystone', cost: 3 },
        /* t11 */ { name: 'Thunderhead',       desc: '+12% Lightning Dmg, Storm Call hits +1 enemy.',    stats: { lightningDamage: 0.12, stormCallAoe: true } },
        /* t12 */ { name: 'Overload',          desc: 'Keystone: Dash triggers chain lightning.',         stats: { lightningDash: true, lightningDamage: 0.20 }, type: 'keystone', cost: 3 },
        /* t13 */ { name: 'Static Charge Up',  desc: '+15% Lightning Damage.',                          stats: { lightningDamage: 0.15 } },
        /* t14 */ { name: 'Thunderbolt',       desc: 'Unlocks Spell: Thunderbolt (Active E).',          stats: { unlockSpell: 'thunderbolt' },           type: 'unlock' },
        /* t15 */ { name: 'Volt Surge',        desc: '+8% Cast Speed, +8 Max Mana.',                    stats: { castSpeed: 0.08, maxMp: 8 } },
        /* t16 */ { name: 'Storm Shield',      desc: '+20% Lightning Damage, +12 Max HP.',              stats: { lightningDamage: 0.20, maxHp: 12 },     type: 'major', cost: 2 },
        /* t17 */ { name: 'High Voltage',      desc: '+1 Tesla Bolt chain jump, +10% Lightning.',       stats: { teslaJumps: 1, lightningDamage: 0.10 } },
        /* t18 */ { name: 'Lightning Cascade',  desc: 'Keystone: Tesla zaps chain-jump +1 target.',      stats: { teslaJumps: 1, lightningDamage: 0.15 }, type: 'keystone', cost: 3 },
        /* t19 */ { name: 'Superconductor',    desc: '+20% Lightning Damage, +8% Cast Speed.',          stats: { lightningDamage: 0.20, castSpeed: 0.08 } },
        /* t20 */ { name: 'Storm Deity Wrath', desc: 'Unlocks Spell: Storm Wrath (Active Ultimate).',   stats: { unlockSpell: 'storm_deity_wrath' },     type: 'unlock', cost: 2 },
        /* t21 */ { name: 'Ionic Bond',        desc: '+3% Dmg Reduction, +15 Max HP.',                  stats: { damageReduction: 0.03, maxHp: 15 } },
        /* t22 */ { name: 'Magnetic Field',    desc: '+25% Lightning Damage, +25 Max Mana.',            stats: { lightningDamage: 0.25, maxMp: 25 },     type: 'major', cost: 2 },
        /* t23 */ { name: 'Thunderous Echo',   desc: '+30% Lightning Damage, +10% Cast Speed.',         stats: { lightningDamage: 0.30, castSpeed: 0.10 } },
        /* t24 */ { name: 'God of Lightning',  desc: 'Keystone: Lightning spells deal +40% damage.',    stats: { lightningDamage: 0.40 },                type: 'keystone', cost: 3 }
      ],
    };

    // Side-node data per branch and tier
    const sideData = {
      [SPELL_TYPES.FIRE]: {
        left:  (t) => ({ name: 'Flame Ward',    desc: `+${6 + t} Max HP, +1.5% Dmg Reduction.`, stats: { maxHp: 6 + t, damageReduction: 0.015 } }),
        right: (t) => ({ name: 'Fire Mind',     desc: `+${4 + t} Max Mana, +0.15 Mana Regen/s.`, stats: { maxMp: 4 + t, manaRegen: 0.15 } }),
      },
      [SPELL_TYPES.FROST]: {
        left:  (t) => ({ name: 'Frost Ward',    desc: `+${5 + t} Max HP, +2% Dmg Reduction.`,  stats: { maxHp: 5 + t, damageReduction: 0.02 } }),
        right: (t) => ({ name: 'Frost Mind',    desc: `+${5 + t} Max Mana, +0.2 Mana Regen/s.`, stats: { maxMp: 5 + t, manaRegen: 0.2 } }),
      },
      [SPELL_TYPES.VOID]: {
        left:  (t) => ({ name: 'Void Ward',     desc: `+${4 + t} Max HP, +0.15 Mana Regen/s.`, stats: { maxHp: 4 + t, manaRegen: 0.15 } }),
        right: (t) => ({ name: 'Void Mind',     desc: `+${6 + t} Max Mana, +2% Void Dmg.`,     stats: { maxMp: 6 + t, voidDamage: 0.02 } }),
      },
      [SPELL_TYPES.TIME]: {
        left:  (t) => ({ name: 'Time Ward',     desc: `+${5 + t} Max HP, +2% CDR.`,            stats: { maxHp: 5 + t, cooldownReduction: 0.02 } }),
        right: (t) => ({ name: 'Time Mind',     desc: `+${4 + t} Max Mana, +1% Move Speed.`,   stats: { maxMp: 4 + t, speed: 0.01 } }),
      },
      [SPELL_TYPES.LIGHTNING]: {
        left:  (t) => ({ name: 'Volt Ward',     desc: `+${4 + t} Max HP, +2% Cast Speed.`,     stats: { maxHp: 4 + t, castSpeed: 0.02 } }),
        right: (t) => ({ name: 'Volt Mind',     desc: `+${5 + t} Max Mana, +0.2 Mana Regen/s.`, stats: { maxMp: 5 + t, manaRegen: 0.2 } }),
      },
    };

    // ── Build each branch (24 Tiers) ──────────────────────────────────────
    const TIERS = 24;
    const TIER_STEP = 88;
    const TIER_OFFSET = 45;

    branches.forEach((branch) => {
      const bAngle = branch.angle;
      const bType = branch.type;
      const data = branchData[bType];
      const sides = sideData[bType];
      let prevId = 'root';

      for (let tier = 1; tier <= TIERS; tier++) {
        const distance = tier * TIER_STEP + TIER_OFFSET;
        const curAngle = bAngle + Math.sin(tier * 0.7) * 0.08;

        const td = data[tier - 1];
        if (!td) continue;
        const mainId = `${bType}_t${tier}_m`;
        const expGroup = tier <= 12 ? 0 : (tier <= 18 ? 1 : 2);

        this.nodes[mainId] = {
          id: mainId,
          name: td.name,
          desc: td.desc,
          x: Math.round(Math.cos(curAngle) * distance),
          y: Math.round(Math.sin(curAngle) * distance),
          cost: td.cost ?? 1,
          unlocked: false,
          connections: [prevId],
          stats: td.stats,
          type: td.type ?? 'normal',
          element: bType,
          view: 'player',
          expansion: expGroup
        };
        this.nodes[prevId].connections.push(mainId);

        // ── Left side node ──
        const leftId = `${bType}_t${tier}_l`;
        const leftAngle = curAngle - 0.26;
        const ld = sides.left(tier);
        this.nodes[leftId] = {
          id: leftId,
          name: ld.name,
          desc: ld.desc,
          x: Math.round(Math.cos(leftAngle) * (distance + 28)),
          y: Math.round(Math.sin(leftAngle) * (distance + 28)),
          cost: 1, unlocked: false,
          connections: [mainId],
          stats: ld.stats, type: 'normal', element: bType,
          view: 'player',
          expansion: expGroup
        };
        this.nodes[mainId].connections.push(leftId);

        // ── Right side node ──
        const rightId = `${bType}_t${tier}_r`;
        const rightAngle = curAngle + 0.26;
        const rd = sides.right(tier);
        this.nodes[rightId] = {
          id: rightId,
          name: rd.name,
          desc: rd.desc,
          x: Math.round(Math.cos(rightAngle) * (distance + 28)),
          y: Math.round(Math.sin(rightAngle) * (distance + 28)),
          cost: 1, unlocked: false,
          connections: [mainId],
          stats: rd.stats, type: 'normal', element: bType,
          view: 'player',
          expansion: expGroup
        };
        this.nodes[mainId].connections.push(rightId);

        prevId = mainId;
      }

      this.nodes['root'].connections.push(`${bType}_t1_m`);
    });

    // ── Wisp Companion Sub-tree (aether branch, pointing straight down) ───
    const wispAngle = Math.PI / 2;
    const wispNodes = [
      { id: 'wisp_t1', name: 'Void Wisp',       desc: 'Summons an orbital wisp that shoots tracking sparks at enemies (8 dmg).',     stats: { unlockWisp: true },        type: 'unlock',   cost: 2, dist: 100 },
      { id: 'wisp_t2', name: 'Wisp Sharpening', desc: 'Wisp deals +8 bonus damage per shot.',                                         stats: { wispDamage: 1 },           type: 'normal',   cost: 1, dist: 175 },
      { id: 'wisp_t3', name: 'Wisp Haste',      desc: 'Wisp fires twice as fast.',                                                    stats: { wispSpeed: 1 },            type: 'normal',   cost: 1, dist: 250 },
      { id: 'wisp_t4', name: 'Second Wisp',     desc: 'Summons a second orbiting wisp, each targeting a different enemy.',            stats: { wispCount: 1 },            type: 'major',    cost: 2, dist: 325 },
      { id: 'wisp_t5', name: 'Wisp Sight',      desc: 'Wisps track enemies from +40% further away.',                                  stats: { wispRange: 1 },            type: 'normal',   cost: 1, dist: 400 },
      { id: 'wisp_t6', name: 'Third Wisp',      desc: 'Summons a third wisp. All wisps now also apply electric shock on hit.',        stats: { wispCount: 1, wispDamage: 1 }, type: 'major', cost: 2, dist: 475 },
      { id: 'wisp_t7', name: 'Wisp Swarm',      desc: 'Keystone: Wisps fire at 3x speed and deal +16 bonus damage total.',           stats: { wispSpeed: 2, wispDamage: 2 }, type: 'keystone', cost: 3, dist: 555 },
    ];

    wispNodes.forEach((wn, i) => {
      const ang = wispAngle + Math.sin(i * 0.8) * 0.06;
      const x = Math.round(Math.cos(ang) * wn.dist);
      const y = Math.round(Math.sin(ang) * wn.dist);
      const parent = i === 0 ? 'root' : wispNodes[i - 1].id;
      this.nodes[wn.id] = {
        id: wn.id, name: wn.name, desc: wn.desc,
        x, y, cost: wn.cost, unlocked: false,
        connections: [parent],
        stats: wn.stats, type: wn.type, element: 'aether',
        view: 'player', expansion: 0
      };
      this.nodes[parent].connections.push(wn.id);
    });

    // ── Aether Mastery nodes (root cluster) ────
    const aetherMastery = [
      { id: 'aether_regen',   name: 'Aether Regen',     desc: '+0.5 HP Regen/s, +0.5 Mana Regen/s.', x: -85, y: -50,  stats: { healthRegen: 0.5, manaRegen: 0.5 }, type: 'normal', cost: 1 },
      { id: 'aether_vitality', name: 'Aether Vitality',  desc: '+20 Max HP, +10 Max Mana.',           x: 85,  y: -50,  stats: { maxHp: 20, maxMp: 10 },             type: 'normal', cost: 1 },
      { id: 'aether_focus',   name: 'Aether Focus',     desc: '+5% CDR, +5% Cast Speed.',            x: 0,   y: -100, stats: { cooldownReduction: 0.05, castSpeed: 0.05 }, type: 'normal', cost: 1 },
      { id: 'aether_power',   name: 'Aether Power',     desc: '+8% all Spell Damage.',               x: -95, y: 25,   stats: { allDamage: 0.08 },                  type: 'major',  cost: 2 },
      { id: 'aether_fortune', name: 'Aether Fortune',   desc: '+15% XP gain, +5% Shard drops.',       x: 95,  y: 25,   stats: { xpGain: 0.15 },                     type: 'normal', cost: 1 },
    ];

    aetherMastery.forEach(am => {
      this.nodes[am.id] = {
        id: am.id, name: am.name, desc: am.desc,
        x: am.x, y: am.y, cost: am.cost, unlocked: false,
        connections: ['root'],
        stats: am.stats, type: am.type, element: 'aether',
        view: 'player', expansion: 0
      };
      this.nodes['root'].connections.push(am.id);
    });

    // ── COMPANION 1 TREE (Baby Pyro-Dragon, view: companion1) ──
    this.nodes['comp1_root'] = {
      id: 'comp1_root', name: 'Baby Dragon Core',
      desc: 'Baby Dragon companion. Attacks nearest enemy with fireballs. Unlocks its skill tree.',
      x: 0, y: 0, cost: 0, unlocked: true, connections: [],
      stats: {}, type: 'root', element: 'fire', view: 'companion1', expansion: 0
    };

    const comp1Data = [
      /* t1  */ { id: 'comp1_t1', name: 'Dragon Bond',      desc: '+10% Companion Attack Speed.',                        stats: { companion1_speed: 0.10 },               x: -70,  y: -50,  cost: 1, conn: ['comp1_root'],       expansion: 0 },
      /* t2  */ { id: 'comp1_t2', name: 'Flame Breath',     desc: '+15 Companion Fire Damage.',                           stats: { companion1_damage: 15 },                x: 70,   y: -50,  cost: 1, conn: ['comp1_root'],       expansion: 0 },
      /* t3  */ { id: 'comp1_t3', name: 'Dragon Scales',    desc: 'Player gains +5% Damage Reduction.',                  stats: { damageReduction: 0.05 },                x: -140, y: -80,  cost: 1, conn: ['comp1_t1'],         expansion: 0 },
      /* t4  */ { id: 'comp1_t4', name: 'Volcanic Rage',    desc: '+20 Companion Fire Damage.',                           stats: { companion1_damage: 20 },                x: 140,  y: -80,  cost: 1, conn: ['comp1_t2'],         expansion: 0 },
      /* t5  */ { id: 'comp1_t5', name: 'Cinder Wings',     desc: '+15% Companion Attack Speed, player +5% Move Speed.', stats: { companion1_speed: 0.15, speed: 0.05 },      x: -90,  y: -130, cost: 2, conn: ['comp1_t1'],         expansion: 0 },
      /* t6  */ { id: 'comp1_t6', name: 'Volcanic Fury',    desc: 'Player gains +20% Fire Damage.',                      stats: { fireDamage: 0.20 },                     x: 90,   y: -130, cost: 2, conn: ['comp1_t2'],         expansion: 0 },
      /* t7  */ { id: 'comp1_t7', name: 'Infernal Lord',    desc: 'Keystone: Companion shoots 3 fireballs in a spread.',  stats: { companion1_triple_shot: true },         x: 0,    y: -170, cost: 3, conn: ['comp1_t5', 'comp1_t6'], type: 'keystone', expansion: 0 },
      
      /* t8  */ { id: 'comp1_t8', name: 'Golden Scales',    desc: 'Player gains +5% Damage Reduction.',                  stats: { damageReduction: 0.05 },                x: -60,  y: -230, cost: 2, conn: ['comp1_t7'],         expansion: 1 },
      /* t9  */ { id: 'comp1_t9', name: 'Blazing Tail',     desc: '+25 Companion Damage, +10% Companion Attack Speed.',   stats: { companion1_damage: 25, companion1_speed: 0.10 }, x: 60,  y: -230, cost: 2, conn: ['comp1_t7'],    expansion: 1 },
      /* t10 */ { id: 'comp1_t10',name: 'Solar Glow',       desc: 'Player gains +25% Fire Damage, +15 Max HP.',          stats: { fireDamage: 0.25, maxHp: 15 },          x: -120, y: -280, cost: 2, conn: ['comp1_t8'],         expansion: 1 },
      /* t11 */ { id: 'comp1_t11',name: 'Draconic Majesty', desc: 'Player gains +15% all Spell Damage.',                 stats: { allDamage: 0.15 },                      x: 120,  y: -280, cost: 2, conn: ['comp1_t9'],         expansion: 1 },
      /* t12 */ { id: 'comp1_t12',name: 'Dragon Emperor',   desc: 'Keystone: Companion zaps have 20% chance to summon meteors.', stats: { companion1_emperor_meteor: true },   x: 0,    y: -340, cost: 3, conn: ['comp1_t10', 'comp1_t11'], type: 'keystone', expansion: 1 },
    ];

    comp1Data.forEach(n => {
      this.nodes[n.id] = {
        id: n.id, name: n.name, desc: n.desc,
        x: n.x, y: n.y, cost: n.cost, unlocked: false,
        connections: [...n.conn],
        stats: n.stats, type: n.type || 'normal', element: 'fire',
        view: 'companion1', expansion: n.expansion
      };
      n.conn.forEach(parentId => {
        if (this.nodes[parentId]) this.nodes[parentId].connections.push(n.id);
      });
    });

    // ── COMPANION 2 TREE (Chrono Griffin, view: companion2) ──
    this.nodes['comp2_root'] = {
      id: 'comp2_root', name: 'Chrono Griffin Core',
      desc: 'Chrono Griffin companion. Attacks nearest enemy with time-warp zaps. Unlocks its skill tree.',
      x: 0, y: 0, cost: 0, unlocked: true, connections: [],
      stats: {}, type: 'root', element: 'time', view: 'companion2', expansion: 0
    };

    const comp2Data = [
      /* t1  */ { id: 'comp2_t1', name: 'Time Warp Wing',   desc: '+10% Companion Attack Speed.',                        stats: { companion2_speed: 0.10 },               x: -70,  y: -50,  cost: 1, conn: ['comp2_root'],       expansion: 0 },
      /* t2  */ { id: 'comp2_t2', name: 'Temporal Beak',    desc: '+15 Companion Time Damage.',                           stats: { companion2_damage: 15 },                x: 70,   y: -50,  cost: 1, conn: ['comp2_root'],       expansion: 0 },
      /* t3  */ { id: 'comp2_t3', name: 'Griffin Haste',    desc: 'Player gains +5% Move Speed, +5% Cooldown Reduction.',stats: { speed: 0.05, cooldownReduction: 0.05 },  x: -140, y: -80,  cost: 1, conn: ['comp2_t1'],         expansion: 0 },
      /* t4  */ { id: 'comp2_t4', name: 'Chrono Feathers',  desc: '+20 Companion Time Damage.',                           stats: { companion2_damage: 20 },                x: 140,  y: -80,  cost: 1, conn: ['comp2_t2'],         expansion: 0 },
      /* t5  */ { id: 'comp2_t5', name: 'Future Vision',    desc: '+15% Companion Attack Speed, player +5% CDR.',        stats: { companion2_speed: 0.15, cooldownReduction: 0.05 }, x: -90, y: -130, cost: 2, conn: ['comp2_t3'],       expansion: 0 },
      /* t6  */ { id: 'comp2_t6', name: 'Chrono Synergy',   desc: 'Player gains +20% Time Damage, +20 Max Mana.',        stats: { timeDamage: 0.20, maxMp: 20 },          x: 90,   y: -130, cost: 2, conn: ['comp2_t4'],         expansion: 0 },
      /* t7  */ { id: 'comp2_t7', name: 'Chrono Lord',      desc: 'Keystone: Companion zaps chain-strike up to 3 targets.', stats: { companion2_chain_zap: true },             x: 0,    y: -170, cost: 3, conn: ['comp2_t5', 'comp2_t6'], type: 'keystone', expansion: 0 }
    ];

    comp2Data.forEach(n => {
      this.nodes[n.id] = {
        id: n.id, name: n.name, desc: n.desc,
        x: n.x, y: n.y, cost: n.cost, unlocked: false,
        connections: [...n.conn],
        stats: n.stats, type: n.type || 'normal', element: 'time',
        view: 'companion2', expansion: n.expansion
      };
      n.conn.forEach(parentId => {
        if (this.nodes[parentId]) this.nodes[parentId].connections.push(n.id);
      });
    });
  }

  /**
   * Reset all nodes to locked state (except roots) and return AP
   */
  refundAll() {
    let refundedPoints = 0;
    const roots = new Set(['root', 'comp1_root', 'comp2_root']);
    for (const key in this.nodes) {
      if (!roots.has(key) && this.nodes[key].unlocked) {
        refundedPoints += this.nodes[key].cost;
        this.nodes[key].unlocked = false;
      }
    }
    return refundedPoints;
  }

  /**
   * Checks if Player Tree 1 is completed (unlocked Pyromancy, Cryomancy, etc. Tiers 1-12 main-line nodes + root)
   */
  isPlayerTree1Completed() {
    const elements = ['fire', 'frost', 'void', 'time', 'lightning'];
    if (!this.nodes['root'] || !this.nodes['root'].unlocked) return false;
    for (const el of elements) {
      for (let tier = 1; tier <= 12; tier++) {
        const id = `${el}_t${tier}_m`;
        if (!this.nodes[id] || !this.nodes[id].unlocked) return false;
      }
    }
    return true;
  }

  /**
   * Checks if Player Tree 2 is completed (unlocked Pyromancy, Cryomancy, etc. Tiers 13-18 main-line nodes)
   */
  isPlayerTree2Completed() {
    if (!this.isPlayerTree1Completed()) return false;
    const elements = ['fire', 'frost', 'void', 'time', 'lightning'];
    for (const el of elements) {
      for (let tier = 13; tier <= 18; tier++) {
        const id = `${el}_t${tier}_m`;
        if (!this.nodes[id] || !this.nodes[id].unlocked) return false;
      }
    }
    return true;
  }

  /**
   * Checks if Companion 1's Tree is completed (Tiers 1-7 nodes unlocked)
   */
  isCompanion1TreeCompleted() {
    if (!this.nodes['comp1_root'] || !this.nodes['comp1_root'].unlocked) return false;
    for (let tier = 1; tier <= 7; tier++) {
      const id = `comp1_t${tier}`;
      if (!this.nodes[id] || !this.nodes[id].unlocked) return false;
    }
    return true;
  }

  /**
   * Check if a node is unlockable (connected to an unlocked node and player has AP)
   */
  isUnlockable(node) {
    if (node.unlocked) return false;
    
    // Check progression locks
    if (node.view === 'player') {
      if (node.expansion === 1 && !this.game.player.unlockedCompanion1) return false;
      if (node.expansion === 2 && !this.game.player.unlockedCompanion2) return false;
    } else if (node.view === 'companion1') {
      if (node.expansion === 1 && !this.game.player.completedCompanion1Tree) return false;
    }

    // Must be connected to an unlocked node in the SAME view
    let connectedToUnlocked = false;
    for (const connId of node.connections) {
      const parentNode = this.nodes[connId];
      if (parentNode && parentNode.unlocked && parentNode.view === node.view) {
        connectedToUnlocked = true;
        break;
      }
    }
    
    return connectedToUnlocked && this.game.player.ap >= node.cost;
  }

  /**
   * Attempts to purchase/unlock a node
   */
  unlockNode(nodeId) {
    const node = this.nodes[nodeId];
    if (!node || node.unlocked) return false;
    
    if (this.isUnlockable(node)) {
      this.game.player.ap -= node.cost;
      node.unlocked = true;
      
      // Spawn particles
      this.game.particles.createExplosion(node.x, node.y, '#f1c40f', 15, 80, 2);
      this.game.particles.spawnText(node.x, node.y - 15, "RUNIC SYNERGY UNLOCKED", {
        color: '#f1c40f',
        fontSize: 10,
        fontPixel: true
      });
      
      // Update stats on player
      this.game.player.recalculateModifiers(this);
      
      if (this.game.audio) this.game.audio.playUnlock();

      // Trigger achievement
      let spent = 0;
      const roots = new Set(['root', 'comp1_root', 'comp2_root']);
      for (const key in this.nodes) {
        if (this.nodes[key].unlocked && !roots.has(key)) {
          spent += this.nodes[key].cost;
        }
      }
      if (spent >= 10) {
        this.game.unlockAchievement('ap_master');
      }

      // Check immediate progression events on unlock
      this.game.checkProgressionOnUnlock();

      this.game.player.saveGameState();
      return true;
    }
    
    return false;
  }

  /**
   * Visual renderer of the ability tree
   */
  draw(canvas, ctx) {
    // Background
    ctx.fillStyle = '#080910';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(canvas.width / 2 + this.panX, canvas.height / 2 + this.panY);
    ctx.scale(this.zoom, this.zoom);

    // Subtle radial dot grid
    ctx.strokeStyle = 'rgba(120, 90, 220, 0.06)';
    ctx.lineWidth = 0.5;
    const gridSize = 100;
    const viewW = (canvas.width / this.zoom) + Math.abs(this.panX) * 2;
    const viewH = (canvas.height / this.zoom) + Math.abs(this.panY) * 2;
    const startX = -viewW / 2;
    const endX   =  viewW / 2;
    const startY = -viewH / 2;
    const endY   =  viewH / 2;

    for (let gx = Math.floor(startX / gridSize) * gridSize; gx < endX; gx += gridSize) {
      for (let gy = Math.floor(startY / gridSize) * gridSize; gy < endY; gy += gridSize) {
        ctx.beginPath();
        // 8-bit grid dot (draw square pixel instead of arc)
        ctx.fillStyle = 'rgba(120, 90, 220, 0.12)';
        ctx.fillRect(gx - 1, gy - 1, 2, 2);
      }
    }

    const elementColor = {
      [SPELL_TYPES.FIRE]:      '#ff4757',
      [SPELL_TYPES.FROST]:     '#10ac84',
      [SPELL_TYPES.LIGHTNING]: '#f1c40f',
      [SPELL_TYPES.VOID]:      '#a55eea',
      [SPELL_TYPES.TIME]:      '#ff9f43',
      'hybrid': '#7d5fff',
      'aether': '#dfe6e9'
    };

    // Filter visible nodes based on progression and active tab
    const visibleNodes = {};
    for (const key in this.nodes) {
      const node = this.nodes[key];
      if (node.view !== this.currentView) continue;
      
      // Check progression lock
      if (node.view === 'player') {
        if (node.expansion === 1 && !this.game.player.unlockedCompanion1) continue;
        if (node.expansion === 2 && !this.game.player.unlockedCompanion2) continue;
      } else if (node.view === 'companion1') {
        if (node.expansion === 1 && !this.game.player.completedCompanion1Tree) continue;
      }
      visibleNodes[key] = node;
    }

    // Determine current active player TIERS (max 24)
    let maxActiveTier = 12;
    if (this.game.player.unlockedCompanion2) maxActiveTier = 24;
    else if (this.game.player.unlockedCompanion1) maxActiveTier = 18;

    // --- Branch spine glow underlays (drawn first, behind everything, only in Player Tree) ---
    if (this.currentView === 'player') {
      for (const bType in elementColor) {
        if (bType === 'hybrid' || bType === 'aether') continue;
        const col = elementColor[bType];
        ctx.save();
        ctx.strokeStyle = col + '18';
        ctx.lineWidth = 28;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let tier = 1; tier <= maxActiveTier; tier++) {
          const mainNode = visibleNodes[`${bType}_t${tier}_m`];
          if (mainNode) ctx.lineTo(mainNode.x, mainNode.y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // --- Connection lines (straight, clean) ---
    const drawnEdges = new Set();
    for (const key in visibleNodes) {
      const node = visibleNodes[key];
      for (const connId of node.connections) {
        if (!visibleNodes[connId]) continue;

        const edgeKey = [key, connId].sort().join('|');
        if (drawnEdges.has(edgeKey)) continue;
        drawnEdges.add(edgeKey);

        const connNode = visibleNodes[connId];
        const edgeElement = node.element === 'aether' ? connNode.element : node.element;
        const col = elementColor[edgeElement] || '#4a4d6a';

        const bothUnlocked = node.unlocked && connNode.unlocked;
        const oneUnlocked  = node.unlocked || connNode.unlocked;

        if (bothUnlocked) {
          ctx.strokeStyle = col;
          ctx.lineWidth = 2.5;
          ctx.globalAlpha = 1.0;
        } else if (oneUnlocked) {
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.30;
        } else {
          ctx.strokeStyle = '#2d3047';
          ctx.lineWidth = 1.0;
          ctx.globalAlpha = 1.0;
        }

        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(connNode.x, connNode.y);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
    }

    // --- Draw Nodes ---
    for (const key in visibleNodes) {
      const node = visibleNodes[key];
      this._drawNode(ctx, node, elementColor);
    }

    // --- Branch header labels (drawn at the current outer tier limits, player view only) ---
    if (this.currentView === 'player') {
      const branchHeaders = [
        { type: SPELL_TYPES.FIRE,      label: 'PYROMANCY',    angle: -Math.PI / 2 },
        { type: SPELL_TYPES.FROST,     label: 'CRYOMANCY',    angle: -Math.PI / 2 - (2 * Math.PI) / 5 },
        { type: SPELL_TYPES.VOID,      label: 'VOIDWEAVING',  angle: Math.PI / 2 + (2 * Math.PI) / 10 },
        { type: SPELL_TYPES.TIME,      label: 'CHRONOMANCY',  angle: Math.PI / 2 - (2 * Math.PI) / 10 },
        { type: SPELL_TYPES.LIGHTNING, label: 'ELECTROMANCY', angle: -Math.PI / 2 + (2 * Math.PI) / 5 },
      ];

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      branchHeaders.forEach((header) => {
        const hDist = maxActiveTier * 88 + 45 + 60;
        const hx = Math.round(Math.cos(header.angle) * hDist);
        const hy = Math.round(Math.sin(header.angle) * hDist);
        const col = elementColor[header.type] || '#ffffff';

        ctx.font = 'bold 11px "Courier New", Courier, monospace';
        const tw = ctx.measureText(header.label).width;
        const pad = 7;

        ctx.fillStyle = '#0e1020';
        ctx.beginPath();
        ctx.roundRect(hx - tw / 2 - pad, hy - 9, tw + pad * 2, 18, 4);
        ctx.fill();

        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(hx - tw / 2 - pad, hy - 9, tw + pad * 2, 18, 4);
        ctx.stroke();

        ctx.fillStyle = col;
        ctx.fillText(header.label, hx, hy);
      });
    }

    ctx.restore();
  }

  /**
   * Draw a single node — circle shape with readable label below.
   */
  _drawNode(ctx, node, elementColor) {
    const isUnlocked   = node.unlocked;
    const isUnlockable = this.isUnlockable(node);

    // Radii by importance
    const r = node.type === 'root'     ? 20
            : node.type === 'keystone' ? 17
            : node.type === 'major' || node.type === 'unlock' ? 13
            : 10;

    const col   = elementColor[node.element] || '#7d5fff';
    const nx    = node.x;
    const ny    = node.y;

    // Outer glow for unlocked / unlockable nodes
    if (isUnlocked) {
      ctx.save();
      ctx.shadowBlur  = 16;
      ctx.shadowColor = col;
    } else if (isUnlockable) {
      ctx.save();
      ctx.shadowBlur  = 8;
      ctx.shadowColor = '#7d5fff';
    }

    // Node body (round icons restored)
    ctx.beginPath();
    ctx.arc(nx, ny, r, 0, Math.PI * 2);

    if (isUnlocked) {
      ctx.fillStyle   = col;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 2;
    } else if (isUnlockable) {
      ctx.fillStyle   = '#232545';
      ctx.strokeStyle = '#7d5fff';
      ctx.lineWidth   = 2;
    } else {
      ctx.fillStyle   = '#181a28';
      ctx.strokeStyle = '#383a50';
      ctx.lineWidth   = 1.2;
    }
    ctx.fill();
    ctx.stroke();

    if (isUnlocked || isUnlockable) ctx.restore();

    // Inner icon / glyph
    ctx.save();
    ctx.beginPath();
    ctx.arc(nx, ny, r, 0, Math.PI * 2);
    ctx.clip();

    if (node.type === 'root') {
      ctx.fillStyle = isUnlocked ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)';
      ctx.fillRect(nx - 2, ny - 8, 4, 16);
      ctx.fillRect(nx - 8, ny - 2, 16, 4);
    } else if (node.type === 'keystone') {
      const d = r * 0.55;
      ctx.fillStyle = isUnlocked ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.moveTo(nx,     ny - d);
      ctx.lineTo(nx + d, ny    );
      ctx.lineTo(nx,     ny + d);
      ctx.lineTo(nx - d, ny    );
      ctx.closePath();
      ctx.fill();
    } else if (node.type === 'unlock') {
      ctx.fillStyle = isUnlocked ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.18)';
      const s = Math.max(1, Math.round(r * 0.18));
      ctx.fillRect(nx - s, ny - s * 4, s * 2 + 1, s);
      ctx.fillRect(nx - s, ny + s * 3, s * 2 + 1, s);
      ctx.fillRect(nx - s * 4, ny - s, s, s * 2 + 1);
      ctx.fillRect(nx + s * 3, ny - s, s, s * 2 + 1);
      ctx.fillRect(nx - s * 2, ny - s * 2, s, s);
      ctx.fillRect(nx + s, ny - s * 2, s, s);
      ctx.fillRect(nx - s * 2, ny + s, s, s);
      ctx.fillRect(nx + s, ny + s, s, s);
    } else if (node.type === 'major') {
      ctx.fillStyle = isUnlocked ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.1)';
      const d = r * 0.4;
      ctx.beginPath();
      ctx.arc(nx, ny, d, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // AP cost badge
    if (!isUnlocked && node.cost > 0) {
      const bx = nx + r * 0.7;
      const by = ny - r * 0.7;
      const br = 6;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle = isUnlockable ? '#7d5fff' : '#23253a';
      ctx.fill();
      ctx.strokeStyle = isUnlockable ? '#b39dff' : '#44475a';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${br + 1}px "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.cost, bx, by + 0.5);
    }

    // Node text label
    const labelY = ny + r + 5;
    const maxW   = 80;

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    const fontSize = node.type === 'root' ? 9
                   : node.type === 'keystone' || node.type === 'major' || node.type === 'unlock' ? 8
                   : 7;
    ctx.font = `${isUnlocked ? 'bold' : 'normal'} ${fontSize}px "Courier New", Courier, monospace`;

    if (isUnlocked) {
      ctx.fillStyle = col;
    } else if (isUnlockable) {
      ctx.fillStyle = '#a89be8';
    } else {
      ctx.fillStyle = '#555877';
    }

    const words = node.name.split(' ');
    let line1 = '', line2 = '';
    for (const w of words) {
      const test = line1 ? line1 + ' ' + w : w;
      if (ctx.measureText(test).width <= maxW) {
        line1 = test;
      } else {
        line2 = line2 ? line2 + ' ' + w : w;
      }
    }

    ctx.fillText(line1, nx, labelY);
    if (line2) ctx.fillText(line2, nx, labelY + fontSize + 1);
  }
}
