/**
 * Spells - Spell Configuration and Elemental Synergy Engine
 */

export const SPELL_TYPES = {
  FIRE: 'fire',
  FROST: 'frost',
  LIGHTNING: 'lightning',
  VOID: 'void',
  TIME: 'time'
};

// All available spells in the game, unlocked/modified via the Ability Tree
export const SpellBook = {
  // --- PRIMARY SPELLS (LMB) ---
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    element: SPELL_TYPES.FIRE,
    cooldown: 0.4, // seconds
    manaCost: 4,
    damage: 15,
    speed: 350,
    radius: 8,
    sprite: 'proj_fire',
    description: 'Launches a searing fireball that ignites enemies, dealing burning damage.',
    cast(player, targetAngle, game) {
      game.spawnProjectile(player.x, player.y, targetAngle, this, true);
    }
  },
  
  frost_spike: {
    id: 'frost_spike',
    name: 'Frost Spike',
    element: SPELL_TYPES.FROST,
    cooldown: 0.6,
    manaCost: 6,
    damage: 12,
    speed: 400,
    radius: 6,
    sprite: 'proj_frost',
    description: 'Shoots a piercing ice shard. Chills enemies, reducing their movement speed.',
    cast(player, targetAngle, game) {
      game.spawnProjectile(player.x, player.y, targetAngle, this, true);
    }
  },

  flame_wave: {
    id: 'flame_wave',
    name: 'Flame Wave',
    element: SPELL_TYPES.FIRE,
    cooldown: 0.7,
    manaCost: 7,
    damage: 20,
    speed: 260,
    radius: 14,
    sprite: 'proj_flame_wave',
    description: 'Launches a wide, piercing wave of flame that burns enemies in its path.',
    cast(player, targetAngle, game) {
      game.spawnProjectile(player.x, player.y, targetAngle, this, true);
    }
  },

  blizzard_orb: {
    id: 'blizzard_orb',
    name: 'Blizzard Orb',
    element: SPELL_TYPES.FROST,
    cooldown: 1.8,
    manaCost: 15,
    damage: 6,
    speed: 120,
    radius: 12,
    sprite: 'proj_blizzard_orb',
    description: 'Fires a freezing sphere that continuously shoots ice shards at nearby targets as it rolls.',
    cast(player, targetAngle, game) {
      game.spawnProjectile(player.x, player.y, targetAngle, this, true);
    }
  },

  // --- SECONDARY SPELLS (RMB) ---
  tesla_bolt: {
    id: 'tesla_bolt',
    name: 'Tesla Bolt',
    element: SPELL_TYPES.LIGHTNING,
    cooldown: 0.8,
    manaCost: 10,
    damage: 8,
    speed: 500,
    radius: 5,
    sprite: 'proj_lightning',
    description: 'Fires a high-speed bolt of electricity. On hit, jumps to 3 nearby enemies.',
    cast(player, targetAngle, game) {
      game.spawnProjectile(player.x, player.y, targetAngle, this, true);
    }
  },

  volt_shield: {
    id: 'volt_shield',
    name: 'Volt Shield',
    element: SPELL_TYPES.LIGHTNING,
    cooldown: 8.0,
    manaCost: 20,
    damage: 0,
    description: '3 electric orbs orbit you at radius 80 for 6 seconds, each zapping any enemy they touch for 25 damage.',
    cast(player, targetAngle, game) {
      player.voltShieldTimer = 6.0;
      player.voltShieldDamageTimer = 0;
      // Give each orb its own hit-cooldown set so the same enemy can only be zapped
      // once per 0.5s per orb, preventing instant drain on anything that runs through
      player.voltShieldHitCooldowns = {};
      game.particles.createExplosion(player.x, player.y, '#fff200', 18, 80, 2.5);
      if (game.audio) game.audio.playLightning();
      game.particles.spawnText(player.x, player.y - 35, 'VOLT SHIELD!', {
        color: '#fff200', fontSize: 12, fontPixel: true
      });
    }
  },

  // --- UTILITY / DASH (Space) ---
  aether_dash: {
    id: 'aether_dash',
    name: 'Chrono Dash',
    element: SPELL_TYPES.TIME,
    cooldown: 2.0,
    manaCost: 8,
    damage: 0,
    description: 'Teleport forward in space and time. Gain briefly invulnerability frames (i-frames).',
    cast(player, targetAngle, game) {
      // Get dash vector based on keyboard input direction
      let dx = 0;
      let dy = 0;
      if (game.keys['w'] || game.keys['arrowup']) dy -= 1;
      if (game.keys['s'] || game.keys['arrowdown']) dy += 1;
      if (game.keys['a'] || game.keys['arrowleft']) dx -= 1;
      if (game.keys['d'] || game.keys['arrowright']) dx += 1;
      
      // Default to target direction if no movement keys pressed
      let angle = targetAngle;
      if (dx !== 0 || dy !== 0) {
        angle = Math.atan2(dy, dx);
      }
      
      const dashDist = 120 * (player.modifiers.dashDistance || 1.0);
      
      // Spawn trail particles
      const particleCount = 10;
      for (let i = 0; i < particleCount; i++) {
        const t = i / particleCount;
        const tx = player.x + Math.cos(angle) * dashDist * t;
        const ty = player.y + Math.sin(angle) * dashDist * t;
        game.particles.spawn(tx, ty, {
          vx: (Math.random() - 0.5) * 20,
          vy: (Math.random() - 0.5) * 20,
          color: player.modifiers.lightningDash ? '#fff200' : '#ffa502',
          size: Math.random() * 3 + 2,
          life: 0.3,
          glow: true
        });
      }

      // Check if player has lightning dash upgrade (leaves chain lightning)
      if (player.modifiers.lightningDash) {
        game.triggerChainLightning(player.x, player.y, 15, 3, 200);
      }

      // Chrono displacement: leave a slow zone behind
      if (player.modifiers.chronoDashSlow) {
        game.spawnAreaEffect(player.x, player.y, 80, 'chrono_slow', 3.0);
      }

      // Perform teleport
      player.x += Math.cos(angle) * dashDist;
      player.y += Math.sin(angle) * dashDist;
      player.dashCooldownTimer = player.getSpellCooldown('aether_dash');
      if (game.audio) game.audio.playTeleport();
      
      // Give i-frames
      player.iframeTimer = 0.25; 
    }
  },

  // --- ULTIMATES (Q / E) ---
  void_pull: {
    id: 'void_pull',
    name: 'Void Singularity',
    element: SPELL_TYPES.VOID,
    cooldown: 8.0,
    manaCost: 25,
    damage: 5, // tick damage
    description: 'Tears a hole in reality. Spawns a gravitational pull zone drawing all enemies into the center.',
    cast(player, targetAngle, game) {
      // Spawn singularity at mouse coordinates
      const worldMouse = game.getWorldMouse();
      const mx = worldMouse.x;
      const my = worldMouse.y;
      game.spawnAreaEffect(mx, my, 120, 'singularity', 4.0);
      
      // Initial burst particles
      game.particles.createExplosion(mx, my, '#a55eea', 20, 100, 3);
    }
  },

  chrono_shift: {
    id: 'chrono_shift',
    name: 'Temporal Shift',
    element: SPELL_TYPES.TIME,
    cooldown: 12.0,
    manaCost: 35,
    description: 'Slows down time for all enemies by 80% for 4 seconds, while keeping you at normal speed.',
    cast(player, targetAngle, game) {
      game.timeDilationTimer = 4.0;
      game.particles.createExplosion(player.x, player.y, '#ff9f43', 30, 200, 4);
      game.particles.spawnText(player.x, player.y - 30, "TIME DILATED", {
        color: '#ff9f43',
        fontSize: 16,
        fontPixel: true
      });
    }
  },

  // --- NEW SPELLS ---

  // Fire: Meteor Strike — call down a delayed fiery meteor at cursor position
  meteor_strike: {
    id: 'meteor_strike',
    name: 'Meteor Strike',
    element: SPELL_TYPES.FIRE,
    cooldown: 6.0,
    manaCost: 30,
    damage: 80,
    description: 'Calls down a meteor at the cursor position after a 1 second delay. Massive AoE fire damage.',
    cast(player, targetAngle, game) {
      const worldMouse = game.getWorldMouse();
      const tx = worldMouse.x;
      const ty = worldMouse.y;
      // Show a warning indicator
      game.particles.spawnText(tx, ty - 20, '!', { color: '#ff4757', fontSize: 20, fontPixel: true, life: 1.0 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        game.particles.spawn(tx + Math.cos(a) * 50, ty + Math.sin(a) * 50, {
          vx: -Math.cos(a) * 20, vy: -Math.sin(a) * 20,
          color: '#ff4757', size: 3, life: 0.9, glow: true
        });
      }
      // Delay then impact
      setTimeout(() => {
        if (game.state !== 'PLAYING') return;
        const dmg = Math.round(game.spellBook_meteorDamage || player.modifiers.allDamage * 80);
        game.enemies.forEach(enemy => {
          if (enemy.dead) return;
          const dist = Math.hypot(enemy.x - tx, enemy.y - ty);
          if (dist <= 90) {
            const falloff = 1 - dist / 90;
            enemy.takeDamage(Math.round(dmg * falloff), true, game);
            if (!enemy.dead) {
              enemy.applyStatus(SPELL_TYPES.FIRE, 4.0);
              const ang = Math.atan2(enemy.y - ty, enemy.x - tx);
              enemy.applyKnockback(Math.cos(ang) * 250, Math.sin(ang) * 250);
            }
          }
        });
        game.spawnAreaEffect(tx, ty, 90, 'fire_pool', 2.0);
        game.particles.createExplosion(tx, ty, '#ff6348', 35, 200, 6);
        game.screenShake = 14;
        if (game.audio) game.audio.playExplosion();
        game.uiNotifyCombo('METEOR IMPACT!', 'fire');
      }, 1000);
    }
  },

  // Frost: Ice Nova — burst of frost spikes in all directions around the player
  ice_nova: {
    id: 'ice_nova',
    name: 'Ice Nova',
    element: SPELL_TYPES.FROST,
    cooldown: 5.0,
    manaCost: 22,
    damage: 18,
    speed: 280,
    radius: 7,
    sprite: 'proj_frost',
    description: 'Releases a ring of frost spikes in all directions, chilling all nearby enemies.',
    cast(player, targetAngle, game) {
      const count = 12;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        game.spawnProjectile(player.x, player.y, angle, {
          element: SPELL_TYPES.FROST,
          damage: 18,
          speed: 280,
          radius: 7,
          sprite: 'proj_frost',
          id: 'ice_nova_shard'
        }, true);
      }
      if (game.audio) game.audio.playFreeze();
      game.particles.createExplosion(player.x, player.y, '#10ac84', 20, 120, 3);
    }
  },

  // Lightning: Storm Call — summons a lightning storm that zaps random enemies for 5 seconds
  storm_call: {
    id: 'storm_call',
    name: 'Storm Call',
    element: SPELL_TYPES.LIGHTNING,
    cooldown: 10.0,
    manaCost: 28,
    description: 'Calls down a lightning storm. Strikes 2 random enemies per second for 5 seconds.',
    cast(player, targetAngle, game) {
      game.particles.spawnText(player.x, player.y - 30, 'STORM CALLED', { color: '#f1c40f', fontSize: 12, fontPixel: true });
      game.particles.createExplosion(player.x, player.y, '#f1c40f', 15, 100, 2);
      let ticks = 0;
      const interval = setInterval(() => {
        if (game.state !== 'PLAYING' || ticks >= 10) { clearInterval(interval); return; }
        ticks++;
        // Pick up to 2 random enemies
        const targets = [...game.enemies].filter(e => !e.dead).sort(() => Math.random() - 0.5).slice(0, 2);
        targets.forEach(enemy => {
          if (enemy.dead) return;
          game.triggerChainLightning(enemy.x, enemy.y - 200, 22, 2, 150);
          enemy.takeDamage(22, false, game);
          if (!enemy.dead) {
            enemy.applyStatus(SPELL_TYPES.LIGHTNING, 2.0);
            game.particles.createExplosion(enemy.x, enemy.y, '#f1c40f', 8, 60, 2);
          }
        });
      }, 500);
    }
  },

  // Void: Shadow Blink — teleport to cursor and leave a void explosion at origin
  shadow_blink: {
    id: 'shadow_blink',
    name: 'Shadow Blink',
    element: SPELL_TYPES.VOID,
    cooldown: 7.0,
    manaCost: 20,
    damage: 35,
    description: 'Blink to cursor position, leaving a void implosion at your original location.',
    cast(player, targetAngle, game) {
      const worldMouse = game.getWorldMouse();
      const originX = player.x;
      const originY = player.y;
      // Leave void explosion at origin
      game.spawnAreaEffect(originX, originY, 80, 'singularity', 1.5);
      game.particles.createExplosion(originX, originY, '#a55eea', 18, 120, 3);
      // Blink to target (clamped to level bounds)
      const lvl = game.levelManager;
      player.x = Math.max(20, Math.min(lvl.width - 20, worldMouse.x));
      player.y = Math.max(20, Math.min(lvl.height - 20, worldMouse.y));
      player.iframeTimer = 0.35;
      if (game.audio) game.audio.playTeleport();
      game.particles.createExplosion(player.x, player.y, '#a55eea', 12, 80, 2);
      game.particles.spawnText(player.x, player.y - 20, 'SHADOW BLINK', { color: '#a55eea', fontSize: 10, fontPixel: true });

      // Dimension Break keystone: origin void explosion deals double damage
      if (player.modifiers.shadowBlinkDmg) {
        game.enemies.forEach(enemy => {
          const d = Math.hypot(enemy.x - originX, enemy.y - originY);
          if (d <= 80) {
            enemy.takeDamage(Math.round(70 * player.modifiers.allDamage), true, game);
            const ang = Math.atan2(enemy.y - originY, enemy.x - originX);
            enemy.applyKnockback(Math.cos(ang) * 200, Math.sin(ang) * 200);
          }
        });
        game.particles.spawnText(originX, originY - 20, 'DIMENSION BREAK!', { color: '#a55eea', fontSize: 10, fontPixel: true });
      }
    }
  },

  // Time: Time Warp — instantly reset all spell cooldowns
  time_warp: {
    id: 'time_warp',
    name: 'Time Warp',
    element: SPELL_TYPES.TIME,
    cooldown: 20.0,
    manaCost: 40,
    description: 'Warps time around you, instantly resetting all your other spell cooldowns.',
    cast(player, targetAngle, game) {
      for (const slot in player.spellCooldowns) {
        if (slot !== 'ultimate') player.spellCooldowns[slot] = 0;
      }
      // Paradox Engine keystone: also grant 3s speed boost
      if (player.modifiers.timeWarpHaste) {
        player.buffs.haste = 3.0;
        game.particles.spawnText(player.x, player.y - 50, 'PARADOX HASTE!', { color: '#ff9f43', fontSize: 10, fontPixel: true, life: 1.5 });
      }
      game.particles.createExplosion(player.x, player.y, '#ff9f43', 25, 160, 4);
      game.particles.spawnText(player.x, player.y - 35, 'COOLDOWNS RESET!', { color: '#ff9f43', fontSize: 12, fontPixel: true, life: 2.0 });
      game.screenShake = 6;
    }
  }
};

/**
 * Elemental Combo Synergy Calculator
 * Returns the combo result when applying a new spell type to an enemy with existing status
 */
export function processCombo(enemy, spellType, game) {
  const currentStatuses = enemy.statuses;
  let comboTriggered = null;

  if (spellType === SPELL_TYPES.FIRE) {
    if (currentStatuses[SPELL_TYPES.FROST] > 0) {
      // Fire hits Frost -> STEAM EXPLOSION
      comboTriggered = {
        name: 'STEAM EXPLOSION',
        color: '#ffffff',
        class: 'steam',
        effect() {
          // Spawn a scalding cloud dealing damage over time
          game.spawnAreaEffect(enemy.x, enemy.y, 80, 'steam_cloud', 4.0);
          game.particles.createExplosion(enemy.x, enemy.y, '#ffffff', 25, 140, 5);
          enemy.takeDamage(40, true, game); // bonus burst damage
        }
      };
      currentStatuses[SPELL_TYPES.FROST] = 0; // consume status
    }
  } 
  
  else if (spellType === SPELL_TYPES.LIGHTNING) {
    if (currentStatuses[SPELL_TYPES.FROST] > 0) {
      // Lightning hits Frost -> SUPERCONDUCTIVE FREEZE
      comboTriggered = {
        name: 'SUPERCONDUCT',
        color: '#4bc0c0',
        class: 'superconduct',
        effect() {
          // Freeze target and nearby, deal electric burst
          game.triggerAoEFreeze(enemy.x, enemy.y, 130, 3.0);
          game.triggerChainLightning(enemy.x, enemy.y, 25, 5, 220);
          game.particles.createExplosion(enemy.x, enemy.y, '#4bc0c0', 20, 120, 3);
        }
      };
      currentStatuses[SPELL_TYPES.FROST] = 0;
    }
  }

  else if (spellType === SPELL_TYPES.VOID) {
    // Void can combine with fire inside Singularities
    // This is handled actively inside the AreaEffect update loop when a fire projectile enters the singularity.
  }

  // Record combo visual indicator
  if (comboTriggered) {
    // Spawn floating combo label on screen
    game.particles.spawnText(enemy.x, enemy.y - 20, comboTriggered.name, {
      color: comboTriggered.color,
      fontSize: 14,
      fontPixel: true,
      life: 1.2
    });

    // Notify UI (which triggers combo notification popping)
    game.uiNotifyCombo(comboTriggered.name, comboTriggered.class);
  }

  // Always apply the status
  enemy.applyStatus(spellType, 5.0); // 5 seconds duration
}
