/**
 * Enemy - Opponents with AI archetypes and status reaction targets
 */
import { SPELL_TYPES } from '../engine/Spells.js';
import { RELICS_CATALOG, EQUIPMENT_CATALOG, createScaledLootItem } from './Player.js';

export class Enemy {
  constructor(game, x, y, type) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.type = type; // 'slime', 'slime_elite', 'slime_mini', 'skeleton', 'skeleton_elite', ...
    
    // Core parameters based on archetype
    this.statuses = {
      [SPELL_TYPES.FIRE]: 0,
      [SPELL_TYPES.FROST]: 0,
      [SPELL_TYPES.LIGHTNING]: 0
    };

    this.initArchetype();

    // Infinite wave difficulty scaling
    const wave = this.game.levelManager.wave;
    const hpMultiplier = 1.0 + Math.max(0, wave - 1) * 0.15;
    const damageMultiplier = 1.0 + Math.max(0, wave - 1) * 0.10;

    this.maxHp = Math.round(this.maxHp * hpMultiplier);
    this.damage = Math.round(this.damage * damageMultiplier);

    this.hp = this.maxHp;

    // Voted element infusion
    this.infusedElement = this.game.levelManager?.nextWaveElement || null;
    if (this.infusedElement) {
      if (this.infusedElement === 'fire') {
        this.damage = Math.round(this.damage * 1.2);
        this.name = `Fiery ${this.name}`;
      } else if (this.infusedElement === 'frost') {
        this.maxHp = Math.round(this.maxHp * 1.2);
        this.hp = this.maxHp;
        this.name = `Frosted ${this.name}`;
      } else if (this.infusedElement === 'void') {
        this.speed = Math.round(this.speed * 1.1);
        this.name = `Void ${this.name}`;
      }
    }
    
    // Knockback states
    this.kbX = 0;
    this.kbY = 0;
    this.kbFriction = 0.88;
    
    // Animation frame tick
    this.frameTimer = Math.random();
    
    // Movement wobble (organic weave)
    this._wobbleAngle = 0;
    this._wobbleTarget = 0;
    this._wobbleTimer = Math.random() * 0.5;
    
    // State timer trackers
    this.shootTimer = Math.random() * 2.0; // random offset for shooters
    this.teleportCooldown = 3.0;
    this._pathTimer = Math.random() * 0.6;
  }

  initArchetype() {
    switch (this.type) {
      case 'slime':
      case 'slime_elite':
        this.name = this.type.includes('elite') ? 'Elite Fire Slime' : 'Aether Slime';
        this.maxHp = (25 + this.game.levelManager.wave * 8) * (this.type.includes('elite') ? 2.2 : 1.0);
        this.speed = this.type.includes('elite') ? 60 : 45;
        this.radius = this.type.includes('elite') ? 12 : 10;
        this.damage = this.type.includes('elite') ? 16 : 10;
        this.xpValue = this.type.includes('elite') ? 25 : 10;
        this.spriteKey = this.type.includes('elite') ? 'enemy_slime_elite' : 'enemy_slime';
        this.aiState = 'chase';
        break;

      case 'slime_mini':
        this.name = 'Mini Slime';
        this.maxHp = 8 + this.game.levelManager.wave * 2;
        this.speed = 65; // Speedy little pests
        this.radius = 6;
        this.damage = 5;
        this.xpValue = 3;
        this.spriteKey = 'enemy_slime'; // uses standard slime sprite drawn at 16 size
        this.aiState = 'chase';
        break;
        
      case 'skeleton':
      case 'skeleton_elite':
        this.name = this.type.includes('elite') ? 'Elite Glacial Archer' : 'Runic Archer';
        this.maxHp = (40 + this.game.levelManager.wave * 12) * (this.type.includes('elite') ? 2.0 : 1.0);
        this.speed = this.type.includes('elite') ? 65 : 55;
        this.radius = 10;
        this.damage = this.type.includes('elite') ? 18 : 12;
        this.xpValue = this.type.includes('elite') ? 45 : 20;
        this.spriteKey = this.type.includes('elite') ? 'enemy_skeleton_elite' : 'enemy_skeleton';
        this.aiState = 'keep_distance';
        this.shootInterval = this.type.includes('elite') ? 1.4 : 2.2;
        break;

      case 'horror':
      case 'horror_elite':
        this.name = this.type.includes('elite') ? 'Elite Void Assassin' : 'Void Stalker';
        this.maxHp = (60 + this.game.levelManager.wave * 18) * (this.type.includes('elite') ? 2.0 : 1.0);
        this.speed = this.type.includes('elite') ? 80 : 65;
        this.radius = 12;
        this.damage = this.type.includes('elite') ? 24 : 16;
        this.xpValue = this.type.includes('elite') ? 70 : 35;
        this.spriteKey = this.type.includes('elite') ? 'enemy_horror_elite' : 'enemy_horror';
        this.aiState = 'chase_teleport';
        this.shootInterval = this.type.includes('elite') ? 1.8 : 3.0;
        break;

      case 'warden':
        this.name = 'Chrono Warden';
        this.maxHp = 80 + this.game.levelManager.wave * 25;
        this.speed = 90; // High speed
        this.radius = 12;
        this.damage = 20;
        this.xpValue = 50;
        this.spriteKey = 'enemy_warden';
        this.aiState = 'charge';
        this.chargeTimer = 2.0; // Charge attack cooldown
        this.isCharging = false;
        break;

      case 'archon': // Wave 5 Boss!
        this.name = 'THE AETHER ARCHON';
        this.maxHp = 600 + this.game.levelManager.wave * 100;
        this.speed = 40;
        this.radius = 20;
        this.damage = 25;
        this.xpValue = 300;
        this.spriteKey = 'boss_archon';
        this.aiState = 'boss_phase1';
        this.shootInterval = 1.2;
        this.bossPhase = 1;
        break;

      case 'volcanic_titan': // Wave 10 Boss!
        this.name = 'THE VOLCANIC TITAN';
        this.maxHp = 1000 + this.game.levelManager.wave * 150;
        this.speed = 35;
        this.radius = 25;
        this.damage = 30;
        this.xpValue = 400;
        this.spriteKey = 'boss_titan';
        this.aiState = 'boss_titan_phase1';
        this.shootInterval = 1.4;
        this.bossPhase = 1;
        break;

      case 'void_behemoth': // Wave 15 Boss!
        this.name = 'THE VOID BEHEMOTH';
        this.maxHp = 1500 + this.game.levelManager.wave * 200;
        this.speed = 30;
        this.radius = 25;
        this.damage = 35;
        this.xpValue = 500;
        this.spriteKey = 'boss_behemoth';
        this.aiState = 'boss_behemoth_phase1';
        this.shootInterval = 1.6;
        this.bossPhase = 1;
        break;
    }
    
    // Scale XP Value by +25% to speed up AP gains
    if (this.xpValue) {
      this.xpValue = Math.round(this.xpValue * 1.25);
    }

    // Theme-specific monster renaming
    const theme = this.getLocalTheme();
    if (theme === 'gardens') {
      if (this.type === 'slime') this.name = 'Spore Slime';
      else if (this.type === 'slime_elite') this.name = 'Elite Blossom Slime';
      else if (this.type === 'slime_mini') this.name = 'Seed Slime';
      else if (this.type === 'skeleton') this.name = 'Ivy Archer';
      else if (this.type === 'skeleton_elite') this.name = 'Elite Thorn Archer';
      else if (this.type === 'horror') this.name = 'Vine Creeper';
      else if (this.type === 'horror_elite') this.name = 'Elite Bramble Stalker';
      else if (this.type === 'warden') this.name = 'Grove Guardian';
      else if (this.type === 'archon') this.name = 'THE FOREST ARCHON';
    } else if (theme === 'underground') {
      if (this.type === 'slime') this.name = 'Cavern Slime';
      else if (this.type === 'slime_elite') this.name = 'Elite Magma Slime';
      else if (this.type === 'slime_mini') this.name = 'Rock Slime';
      else if (this.type === 'skeleton') this.name = 'Fossil Sentry';
      else if (this.type === 'skeleton_elite') this.name = 'Elite Deep Archer';
      else if (this.type === 'horror') this.name = 'Tunnel Skulker';
      else if (this.type === 'horror_elite') this.name = 'Elite Maw Horror';
      else if (this.type === 'warden') this.name = 'Iron Warden';
      else if (this.type === 'archon') this.name = 'THE GEODE ARCHON';
    } else if (theme === 'pool') {
      if (this.type === 'slime') this.name = 'Aquatic Slime';
      else if (this.type === 'slime_elite') this.name = 'Elite Tide Slime';
      else if (this.type === 'slime_mini') this.name = 'Droplet Slime';
      else if (this.type === 'skeleton') this.name = 'Coral Sentry';
      else if (this.type === 'skeleton_elite') this.name = 'Elite Abyssal Archer';
      else if (this.type === 'horror') this.name = 'Abyss Lurker';
      else if (this.type === 'horror_elite') this.name = 'Elite Siren Terror';
      else if (this.type === 'warden') this.name = 'Deep Warden';
      else if (this.type === 'archon') this.name = 'THE TSUNAMI ARCHON';
    } else if (theme === 'backrooms') {
      if (this.type === 'slime') this.name = 'Glitch Slime';
      else if (this.type === 'slime_elite') this.name = 'Elite Error Slime';
      else if (this.type === 'slime_mini') this.name = 'Pixel Slime';
      else if (this.type === 'skeleton') this.name = 'Lagging Sentry';
      else if (this.type === 'skeleton_elite') this.name = 'Elite Glitched Archer';
      else if (this.type === 'horror') this.name = 'The Smiler';
      else if (this.type === 'horror_elite') this.name = 'Elite Bacteria Assassin';
      else if (this.type === 'warden') this.name = 'Null Pointer Warden';
      else if (this.type === 'archon') this.name = 'THE SYSTEM ARCHON';
    }
  }

  applyStatus(type, duration) {
    if (type in this.statuses) {
      const wasFrozen = this.statuses[SPELL_TYPES.FROST] > 0;
      this.statuses[type] = Math.max(this.statuses[type], duration);

      // If frost status was not active and is now active, count as a freeze application
      if (type === SPELL_TYPES.FROST && !wasFrozen && this.statuses[SPELL_TYPES.FROST] > 0) {
        const player = this.game.player;
        if (player) {
          player.frozenEnemiesCount = (player.frozenEnemiesCount || 0) + 1;
          if (player.frozenEnemiesCount >= 50) {
            this.game.unlockAchievement('cryomancer');
          }
        }
      }
    }
  }

  takeDamage(amount, isCrit, game) {
    // Already dead this frame — ignore further damage calls
    if (this.dead) return;
    // Check if shock status active (reduced defense)
    let finalDamage = amount;
    if (this.statuses[SPELL_TYPES.LIGHTNING] > 0) {
      finalDamage = Math.round(finalDamage * 1.35); // 35% increased damage
    }

    this.hp -= finalDamage;
    console.log(`[COMBAT] ${this.type} took ${finalDamage} dmg${isCrit ? ' (CRIT)' : ''} | HP: ${this.hp.toFixed(0)}/${this.maxHp}`);
    if (game.audio) game.audio.playHit();

    // Create hit particles
    const hitColor = this.statuses[SPELL_TYPES.FROST] > 0 ? '#10ac84' : 
                     this.statuses[SPELL_TYPES.FIRE] > 0 ? '#ff4757' : '#ffffff';
    game.particles.createExplosion(this.x, this.y, hitColor, 8, 80, 2);

    // Spawn damage numbers
    if (game.showDamageNumbers) {
      game.particles.spawnText(this.x, this.y - 12, `${finalDamage}`, {
        color: isCrit ? '#f1c40f' : '#ffffff',
        fontSize: isCrit ? 13 : 10,
        weight: isCrit ? 'bold' : 'normal'
      });
    }

    // Void Horror reaction (Teleport away when hit)
    if ((this.type === 'horror' || this.type === 'horror_elite') && this.teleportCooldown <= 0) {
      this.teleportAway();
    }

    if (this.hp <= 0) {
      this.die(game);
    }
  }

  applyKnockback(vx, vy) {
    // Boss Archon has high knockback resistance
    const factor = this.type === 'archon' ? 0.15 : 1.0;
    this.kbX += vx * factor;
    this.kbY += vy * factor;
  }

  teleportAway() {
    this.teleportCooldown = 3.0;
    
    // Choose random point within 150px
    const angle = Math.random() * Math.PI * 2;
    const dist = 100 + Math.random() * 80;
    
    const nx = this.x + Math.cos(angle) * dist;
    const ny = this.y + Math.sin(angle) * dist;

    // Spawn portal particles
    this.game.particles.createExplosion(this.x, this.y, '#a55eea', 15, 100, 3);
    
    const lvl = this.game.levelManager;
    this.x = Math.max(20, Math.min(lvl.width - 20, nx));
    this.y = Math.max(20, Math.min(lvl.height - 20, ny));

    // Ensure teleport destination is not inside a pillar
    for (const obs of lvl.obstacles) {
      if (obs.type !== 'pillar') continue;
      const odist = Math.hypot(this.x - obs.x, this.y - obs.y);
      if (odist < this.radius + obs.radius) {
        const pushAngle = Math.atan2(this.y - obs.y, this.x - obs.x);
        this.x = obs.x + Math.cos(pushAngle) * (this.radius + obs.radius + 2);
        this.y = obs.y + Math.sin(pushAngle) * (this.radius + obs.radius + 2);
      }
    }
    
    this.game.particles.createExplosion(this.x, this.y, '#a55eea', 15, 100, 3);
  }

  die(game) {
    // Mark as dead — actual removal from the array happens in Game.flushDeadEnemies()
    // at the end of the frame, so no mid-loop splice corruption can occur.
    if (this.dead) return; // already died this frame, don't double-process
    this.dead = true;
    console.log(`[DEATH] ${this.type} killed | Pos: ${this.x.toFixed(0)},${this.y.toFixed(0)}`);

    // Check Boss defeat achievements
    if (this.type === 'archon') {
      game.unlockAchievement('archon_slayer');
    } else if (this.type === 'volcanic_titan') {
      game.unlockAchievement('titan_slayer');
    } else if (this.type === 'void_behemoth') {
      game.unlockAchievement('behemoth_slayer');
    }

    // Slime splitting logic — queued as pending spawns so they appear next frame
    if (this.type === 'slime' || this.type === 'slime_elite') {
      const count = this.type.includes('elite') ? 4 : 3;
      for (let i = 0; i < count; i++) {
        const offsetAngle = Math.random() * Math.PI * 2;
        game.pendingEnemySpawns = game.pendingEnemySpawns || [];
        game.pendingEnemySpawns.push({
          x: this.x + Math.cos(offsetAngle) * 12,
          y: this.y + Math.sin(offsetAngle) * 12,
          type: 'slime_mini',
          kbx: Math.cos(offsetAngle) * 90,
          kby: Math.sin(offsetAngle) * 90
        });
      }
    }

    // Spawn drops
    const shardsToDrop = Math.max(1, Math.round(this.xpValue / 10));
    for (let i = 0; i < shardsToDrop; i++) {
      game.spawnItem(this.x + (Math.random() - 0.5) * 16, this.y + (Math.random() - 0.5) * 16, 'shard', this.xpValue / shardsToDrop);
    }

    const roll = Math.random();
    if (roll < 0.05) {
      game.spawnItem(this.x, this.y, 'hp', 25);
    } else if (roll < 0.10) {
      game.spawnItem(this.x, this.y, 'mp', 15);
    }

    if (this.type.includes('elite') || this.type === 'archon' || this.type === 'volcanic_titan' || this.type === 'void_behemoth') {
      if (Math.random() < 0.50) {
        const combinedPool = [...RELICS_CATALOG, ...EQUIPMENT_CATALOG];
        const randomRelic = combinedPool[Math.floor(Math.random() * combinedPool.length)];
        game.spawnItem(this.x, this.y, 'relic', createScaledLootItem(randomRelic, game.levelManager.wave));
      }
    }

    // Death FX
    const deathColor = this.type.includes('slime') ? '#2ed573' : this.type.includes('horror') ? '#a55eea' : '#f1f2f6';
    game.particles.createExplosion(this.x, this.y, deathColor, 20, 150, 4);

    if (this.type === 'archon' || this.type === 'volcanic_titan' || this.type === 'void_behemoth') {
      if (game.audio) game.audio.playDeath();
    } else if (Math.random() < 0.35) {
      if (game.audio) game.audio.playKill();
    }

    game.kills++;
    game.score += this.xpValue * 10;
  }

  update(dt, player) {
    this.frameTimer += dt;
    if (this.teleportCooldown > 0) this.teleportCooldown -= dt;

    // Apply status ticks down
    for (const key in this.statuses) {
      if (this.statuses[key] > 0) {
        this.statuses[key] -= dt;
        if (this.statuses[key] < 0) this.statuses[key] = 0;
      }
    }

    // Fire status tick (Burning DOT)
    if (this.statuses[SPELL_TYPES.FIRE] > 0) {
      // 5 dmg per second
      if (Math.random() < 0.08) {
        this.takeDamage(1, false, this.game);
        this.game.particles.spawn(this.x, this.y, {
          vx: (Math.random() - 0.5) * 20,
          vy: -30 - Math.random() * 20,
          color: '#ff4757',
          size: 1.5,
          life: 0.3
        });
      }
    }

    if (this.isPassive) {
      // Passive dummy doesn't move or shoot. Just apply knockback and decay
      const finalVx = this.kbX;
      const finalVy = this.kbY;

      this.x += finalVx * dt;
      this.y += finalVy * dt;

      this.kbX *= Math.pow(this.kbFriction, dt * 60);
      this.kbY *= Math.pow(this.kbFriction, dt * 60);
      if (this.kbX * this.kbX + this.kbY * this.kbY < 1) { this.kbX = 0; this.kbY = 0; }

      // Hard boundary clamp
      const lvl = this.game.levelManager;
      this.x = Math.max(this.radius + 40, Math.min(lvl.width  - this.radius - 40, this.x));
      this.y = Math.max(this.radius + 40, Math.min(lvl.height - this.radius - 40, this.y));

      // Post-move push-out
      for (const obs of lvl.obstacles) {
        if (obs.type !== 'pillar' && obs.type !== 'explosive_barrel') continue;
        const odx = this.x - obs.x;
        const ody = this.y - obs.y;
        const distSq = odx * odx + ody * ody;
        const minD = this.radius + obs.radius + 1;
        if (distSq < minD * minD && distSq > 0.0001) {
          const odist = Math.sqrt(distSq);
          const factor = minD / odist;
          this.x = obs.x + odx * factor;
          this.y = obs.y + ody * factor;
        }
      }
      return;
    }

    // Compute status-affected speed (Frost slows down movement)
    let speedMult = 1.0;
    if (this.statuses[SPELL_TYPES.FROST] > 0) {
      speedMult *= 0.55; // 45% slow
    }
    
    // Chrono Warden is immune to slow downs
    if (this.type === 'warden') {
      speedMult = 1.0;
    }

    // Pool region speed reduction
    if (this.game.levelManager && this.game.levelManager.theme === 'pool' && this.type !== 'warden') {
      speedMult *= 0.65; // 35% slower in water
    }

    const currentSpeed = this.speed * speedMult;
    
    // Simple Pathfinding / AI steering
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    let moveX = 0;
    let moveY = 0;

    // Process AI State behaviors
    if (this.aiState === 'chase' || this.aiState === 'chase_teleport') {
      // Vector towards player
      if (dist > 5) {
        moveX = dx / dist;
        moveY = dy / dist;
      }
      
      // Void horror shoots homing elements
      if (this.type.includes('horror') && dist < 300) {
        this.shootTimer += dt;
        if (this.shootTimer >= this.shootInterval) {
          this.shootTimer = 0;
          const angle = Math.atan2(dy, dx);
          
          this.game.spawnProjectile(this.x, this.y, angle, {
            element: SPELL_TYPES.VOID,
            damage: 15,
            speed: 120,
            radius: 8,
            sprite: 'proj_void'
          }, false); // false = fired by enemy

          // Elite Void Assassin tracking second shot
          if (this.type.includes('elite')) {
            setTimeout(() => {
              if (this.game.state === 'PLAYING' && this.hp > 0) {
                const freshDx = this.game.player.x - this.x;
                const freshDy = this.game.player.y - this.y;
                const freshAngle = Math.atan2(freshDy, freshDx);
                this.game.spawnProjectile(this.x, this.y, freshAngle, {
                  element: SPELL_TYPES.VOID,
                  damage: 15,
                  speed: 130,
                  radius: 8,
                  sprite: 'proj_void'
                }, false);
              }
            }, 350);
          }
        }
      }
    } 
    
    else if (this.aiState === 'keep_distance') {
      const idealDist = 200;
      if (dist < idealDist - 30) {
        // Back away
        moveX = -dx / dist;
        moveY = -dy / dist;
      } else if (dist > idealDist + 30) {
        // Walk closer
        moveX = dx / dist;
        moveY = dy / dist;
      }
      
      // Skeleton archer shoots arrows
      this.shootTimer += dt;
      if (this.shootTimer >= this.shootInterval && dist < 350) {
        this.shootTimer = 0;
        const angle = Math.atan2(dy, dx);

        if (this.type.includes('elite')) {
          // Elite Glacial Archer shoots triple frost arrow spread!
          for (let i = -1; i <= 1; i++) {
            this.game.spawnProjectile(this.x, this.y, angle + i * 0.22, {
              element: SPELL_TYPES.FROST,
              damage: 10,
              speed: 240,
              radius: 5,
              sprite: 'proj_frost'
            }, false);
          }
        } else {
          this.game.spawnProjectile(this.x, this.y, angle, {
            element: SPELL_TYPES.FIRE,
            damage: 10,
            speed: 250,
            radius: 5,
            sprite: 'proj_fire'
          }, false);
        }
      }
    } 
    
    else if (this.aiState === 'charge') {
      // Chrono Warden charging pattern
      if (this.isCharging) {
        this.chargeTimer -= dt;
        // Fast movement in charge vector
        moveX = this.chargeVx;
        moveY = this.chargeVy;
        
        if (this.chargeTimer <= 0) {
          this.isCharging = false;
          this.chargeTimer = 2.0; // rest period
          this.speed = 90; // return to normal speed
        }
      } else {
        this.chargeTimer -= dt;
        // Normal chase
        if (dist > 5) {
          moveX = dx / dist;
          moveY = dy / dist;
        }
        
        if (this.chargeTimer <= 0 && dist < 220) {
          // Trigger Charge!
          this.isCharging = true;
          this.chargeTimer = 0.6; // charge duration
          this.chargeVx = dx / dist;
          this.chargeVy = dy / dist;
          this.speed = 220; // Super fast!
          
          // Speed particles
          this.game.particles.createExplosion(this.x, this.y, '#f1c40f', 8, 40, 2);
        }
      }
    } 
    
    else if (this.aiState.startsWith('boss_phase')) {
      // Boss Archon complex bullet hell patterns
      if (dist > 150) {
        moveX = dx / dist;
        moveY = dy / dist;
      }
      
      this.shootTimer += dt;
      if (this.shootTimer >= this.shootInterval) {
        this.shootTimer = 0;
        
        // Alternate attack patterns based on HP percentage
        const hpPercent = this.hp / this.maxHp;
        if (hpPercent > 0.5) {
          // Phase 1: Circle spread of frost spikes
          const bullets = 8;
          const baseAngle = Math.atan2(dy, dx);
          for (let i = 0; i < bullets; i++) {
            const angle = baseAngle + (i * (Math.PI * 2 / bullets));
            this.game.spawnProjectile(this.x, this.y, angle, {
              element: SPELL_TYPES.FROST,
              damage: 15,
              speed: 160,
              radius: 6,
              sprite: 'proj_frost'
            }, false);
          }
        } else {
          // Phase 2: Rapid fireball fire rings & void tracking spheres
          const baseAngle = Math.random() * Math.PI;
          const bullets = 12;
          for (let i = 0; i < bullets; i++) {
            const angle = baseAngle + (i * (Math.PI * 2 / bullets));
            this.game.spawnProjectile(this.x, this.y, angle, {
              element: SPELL_TYPES.FIRE,
              damage: 18,
              speed: 200,
              radius: 7,
              sprite: 'proj_fire'
            }, false);
          }
          
          // Spawn tracking void vortex towards player
          const angle = Math.atan2(dy, dx);
          this.game.spawnProjectile(this.x, this.y, angle, {
            element: SPELL_TYPES.VOID,
            damage: 25,
            speed: 100,
            radius: 10,
            sprite: 'proj_void'
          }, false);
        }
      }
    }
    
    else if (this.aiState.startsWith('boss_titan_phase')) {
      if (dist > 160) {
        moveX = dx / dist;
        moveY = dy / dist;
      }
      
      this.shootTimer += dt;
      if (this.shootTimer >= this.shootInterval) {
        this.shootTimer = 0;
        
        const hpPercent = this.hp / this.maxHp;
        if (hpPercent > 0.5) {
          // Phase 1: Triple fireball spread
          const baseAngle = Math.atan2(dy, dx);
          const angles = [baseAngle - 0.2, baseAngle, baseAngle + 0.2];
          angles.forEach(angle => {
            this.game.spawnProjectile(this.x, this.y, angle, {
              element: SPELL_TYPES.FIRE,
              damage: 20,
              speed: 180,
              radius: 8,
              sprite: 'proj_fire'
            }, false);
          });
        } else {
          // Phase 2: Magma Stomp (spawn fire pools around)
          const baseAngle = Math.atan2(dy, dx);
          // Spawn 5 fireballs
          const angles = [baseAngle - 0.3, baseAngle - 0.15, baseAngle, baseAngle + 0.15, baseAngle + 0.3];
          angles.forEach(angle => {
            this.game.spawnProjectile(this.x, this.y, angle, {
              element: SPELL_TYPES.FIRE,
              damage: 22,
              speed: 210,
              radius: 8,
              sprite: 'proj_fire'
            }, false);
          });
          
          // Stomp fire pools
          const stompDirs = [
            { x: 0, y: -100 }, { x: 0, y: 100 },
            { x: -100, y: 0 }, { x: 100, y: 0 }
          ];
          stompDirs.forEach(d => {
            this.game.spawnAreaEffect(this.x + d.x, this.y + d.y, 45, 'fire_pool', 3.0);
          });
        }
      }
    }
    
    else if (this.aiState.startsWith('boss_behemoth_phase')) {
      if (dist > 180) {
        moveX = dx / dist;
        moveY = dy / dist;
      }
      
      this.shootTimer += dt;
      if (this.shootTimer >= this.shootInterval) {
        this.shootTimer = 0;
        
        const hpPercent = this.hp / this.maxHp;
        if (hpPercent > 0.5) {
          // Phase 1: Void zaps/orbs circle
          const baseAngle = Math.random() * Math.PI;
          const bullets = 6;
          for (let i = 0; i < bullets; i++) {
            const angle = baseAngle + (i * (Math.PI * 2 / bullets));
            this.game.spawnProjectile(this.x, this.y, angle, {
              element: SPELL_TYPES.VOID,
              damage: 22,
              speed: 130,
              radius: 9,
              sprite: 'proj_void'
            }, false);
          }
        } else {
          // Phase 2: Gravity pull & tracking zaps
          const baseAngle = Math.atan2(dy, dx);
          // Fire 4 void spheres
          for (let i = -2; i <= 2; i++) {
            if (i === 0) continue;
            this.game.spawnProjectile(this.x, this.y, baseAngle + i * 0.25, {
              element: SPELL_TYPES.VOID,
              damage: 25,
              speed: 150,
              radius: 9,
              sprite: 'proj_void'
            }, false);
          }
          
          // Spawn a black hole singularity at player position!
          this.game.spawnAreaEffect(this.game.player.x, this.game.player.y, 100, 'singularity', 4.0);
        }
      }
    }

    // ── A* WAYPOINT NAVIGATION ────────────────────────────────────────────
    // Enemies follow a precomputed A* path through the cell graph so they
    // never get trapped in maze dead-ends. The path is refreshed every
    // PATH_REFRESH seconds or when the player enters a different cell.
    const lvl = this.game.levelManager;

    const PATH_REFRESH = 1.5; // seconds between full A* recalcs
    const WAYPOINT_RADIUS = 60; // how close before advancing to next waypoint

    // Initialise path state on first use
    if (!this._path)           this._path = [];
    if (this._pathTimer === undefined) this._pathTimer = Math.random() * PATH_REFRESH;
    if (!this._lastGoalCell)   this._lastGoalCell = { c: -1, r: -1 };

    this._pathTimer -= dt;

    const goalCell = lvl.worldToCell(player.x, player.y);
    const goalChanged = (goalCell.c !== this._lastGoalCell.c || goalCell.r !== this._lastGoalCell.r);

    if (this._pathTimer <= 0 || this._path.length === 0 || goalChanged) {
      if (this.game.pathfindsThisFrame < 3) {
        this._path = lvl.findPath(this.x, this.y, player.x, player.y);
        this.game.pathfindsThisFrame++;
        this._pathTimer = PATH_REFRESH + Math.random() * 0.15;
        this._lastGoalCell = goalCell;
      }
    }

    // Advance past waypoints we've already reached
    while (this._path.length > 0) {
      const wp = this._path[0];
      const wdx = wp.x - this.x;
      const wdy = wp.y - this.y;
      if (wdx * wdx + wdy * wdy < WAYPOINT_RADIUS * WAYPOINT_RADIUS) {
        this._path.shift();
      } else {
        break;
      }
    }

    // Determine movement direction:
    // • If we have remaining waypoints, steer toward the next one.
    // • When we're in the same cell as the player (or very close), steer directly.
    if (this._path.length > 0 && dist > lvl.navCellSize * 0.75) {
      const wp = this._path[0];
      const wdx = wp.x - this.x;
      const wdy = wp.y - this.y;
      const wdist = Math.sqrt(wdx * wdx + wdy * wdy);
      if (wdist > 1) {
        moveX = wdx / wdist;
        moveY = wdy / wdist;
      }
    } else if (dist > 5) {
      // Close enough — head straight at the player
      moveX = dx / dist;
      moveY = dy / dist;
    }

    // ── Movement wobble (organic weave, excluded for bosses/charging) ─────
    const isBossOrCharging = this.aiState.startsWith('boss_') || this.isCharging;
    if (!isBossOrCharging && (moveX !== 0 || moveY !== 0)) {
      this._wobbleTimer -= dt;
      if (this._wobbleTimer <= 0) {
        this._wobbleTimer = 0.3 + Math.random() * 0.5;
        this._wobbleTarget = (Math.random() - 0.5) * 0.42; // ±12° in radians
      }
      // Smoothly interpolate wobble angle
      this._wobbleAngle += (this._wobbleTarget - this._wobbleAngle) * Math.min(1, dt * 6);
      // Rotate moveX/moveY by wobble angle
      const cosW = Math.cos(this._wobbleAngle);
      const sinW = Math.sin(this._wobbleAngle);
      const wmx = moveX * cosW - moveY * sinW;
      const wmy = moveX * sinW + moveY * cosW;
      moveX = wmx;
      moveY = wmy;
    }

    // ── Local pillar repulsion (prevents clipping into wall edges) ────────
    // This is purely reactive/corrective, check via 3x3 grid look-up
    let repX = 0, repY = 0;
    const tx = Math.floor(this.x / 40);
    const ty = Math.floor(this.y / 40);
    
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const ntx = tx + dx;
        const nty = ty + dy;
        if (ntx >= 0 && ntx < lvl.tileWidth && nty >= 0 && nty < lvl.tileHeight) {
          if (lvl.tileGrid[ntx][nty] === 1) {
            const obsX = ntx * 40 + 20;
            const obsY = nty * 40 + 20;
            const obsRadius = 20;
            
            const odx = this.x - obsX;
            const ody = this.y - obsY;
            const distSq = odx * odx + ody * ody;
            const zone = this.radius + obsRadius + 6;
            if (distSq < zone * zone && distSq > 0.0001) {
              const odist = Math.sqrt(distSq);
              const strength = (zone - odist) / zone;
              const factor = strength / odist;
              repX += odx * factor;
              repY += ody * factor;
            }
          }
        }
      }
    }
    const repMagSq = repX * repX + repY * repY;
    if (repMagSq > 0.0001) {
      const repMag = Math.sqrt(repMagSq);
      // Blend: keep most of the intended nav direction, add gentle push away
      moveX = moveX * 0.65 + (repX / repMag) * 0.35;
      moveY = moveY * 0.65 + (repY / repMag) * 0.35;
      const blendMagSq = moveX * moveX + moveY * moveY;
      if (blendMagSq > 0.0001) {
        const blendMag = Math.sqrt(blendMagSq);
        moveX /= blendMag;
        moveY /= blendMag;
      }
    }

    // ── Peer separation (prevents enemies from clumping) ──────────────────
    // Only apply for regular enemy types; skip for bosses to avoid interfering
    // with their scripted movement.
    if (!isBossOrCharging) {
      const SEP_RADIUS = this.radius * 3.5; // zone where repulsion kicks in
      const SEP_STRENGTH = 0.55;            // weight of separation vs chase
      let sepX = 0, sepY = 0, sepCount = 0;

      const enemies = this.game.enemies;
      for (let i = 0; i < enemies.length; i++) {
        const other = enemies[i];
        if (other === this || other.dead) continue;
        const sdx = this.x - other.x;
        const sdy = this.y - other.y;
        const distSq = sdx * sdx + sdy * sdy;
        const minSep = SEP_RADIUS + other.radius;
        if (distSq < minSep * minSep && distSq > 0.0001) {
          const d = Math.sqrt(distSq);
          // Repulsion magnitude is stronger the closer they are
          const mag = (minSep - d) / minSep;
          sepX += (sdx / d) * mag;
          sepY += (sdy / d) * mag;
          sepCount++;
        }
      }

      if (sepCount > 0) {
        // Normalise
        const sepMag = Math.sqrt(sepX * sepX + sepY * sepY);
        if (sepMag > 0.0001) {
          sepX /= sepMag;
          sepY /= sepMag;
        }
        // Blend separation into move direction
        moveX = moveX * (1 - SEP_STRENGTH) + sepX * SEP_STRENGTH;
        moveY = moveY * (1 - SEP_STRENGTH) + sepY * SEP_STRENGTH;
        // Re-normalise blended direction
        const blMag = Math.sqrt(moveX * moveX + moveY * moveY);
        if (blMag > 0.0001) { moveX /= blMag; moveY /= blMag; }
      }
    }

    // ── Integrate ─────────────────────────────────────────────────────────

    const finalVx = moveX * currentSpeed + this.kbX;
    const finalVy = moveY * currentSpeed + this.kbY;

    this.x += finalVx * dt;
    this.y += finalVy * dt;

    // Decay knockback
    this.kbX *= Math.pow(this.kbFriction, dt * 60);
    this.kbY *= Math.pow(this.kbFriction, dt * 60);
    if (this.kbX * this.kbX + this.kbY * this.kbY < 1) { this.kbX = 0; this.kbY = 0; }

    // Hard boundary clamp
    this.x = Math.max(this.radius + 40, Math.min(lvl.width  - this.radius - 40, this.x));
    this.y = Math.max(this.radius + 40, Math.min(lvl.height - this.radius - 40, this.y));

    // Post-move push-out — two passes to resolve corner cases
    for (let pass = 0; pass < 2; pass++) {
      // 1. Grid pillars
      const curTx = Math.floor(this.x / 40);
      const curTy = Math.floor(this.y / 40);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const ntx = curTx + dx;
          const nty = curTy + dy;
          if (ntx >= 0 && ntx < lvl.tileWidth && nty >= 0 && nty < lvl.tileHeight) {
            if (lvl.tileGrid[ntx][nty] === 1) {
              const obsX = ntx * 40 + 20;
              const obsY = nty * 40 + 20;
              const obsRadius = 20;
              
              const odx = this.x - obsX;
              const ody = this.y - obsY;
              const distSq = odx * odx + ody * ody;
              const minD = this.radius + obsRadius + 1;
              if (distSq < minD * minD && distSq > 0.0001) {
                const odist = Math.sqrt(distSq);
                const factor = minD / odist;
                this.x = obsX + odx * factor;
                this.y = obsY + ody * factor;
              }
            }
          }
        }
      }
      
      // 2. Barrels in lvl.obstacles
      for (const obs of lvl.obstacles) {
        if (obs.type !== 'explosive_barrel') continue;
        const odx = this.x - obs.x;
        const ody = this.y - obs.y;
        const distSq = odx * odx + ody * ody;
        const minD = this.radius + obs.radius + 1;
        if (distSq < minD * minD && distSq > 0.0001) {
          const odist = Math.sqrt(distSq);
          const factor = minD / odist;
          this.x = obs.x + odx * factor;
          this.y = obs.y + ody * factor;
        }
      }
    }

    // Stuck in wall detection & resolution for enemy
    const curTx = Math.floor(this.x / 40);
    const curTy = Math.floor(this.y / 40);
    let isStuck = false;
    if (curTx >= 0 && curTx < lvl.tileWidth && curTy >= 0 && curTy < lvl.tileHeight) {
      if (lvl.tileGrid[curTx][curTy] === 1) {
        isStuck = true;
      }
    }

    if (!isStuck) {
      // Check if deeply inside a pillar
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
        this._path = [];
        this._pathTimer = 0;
        
        if (this.game.particles) {
          this.game.particles.createExplosion(this.x, this.y, '#ff4757', 8, 40, 1.5);
        }
      }
    }

    // Bumping/stacking resolution is handled globally in Game.update() to avoid O(N^2) inner iterations.

    // Deal damage to Player if colliding
    if (dist < this.radius + player.radius) {
      player.takeDamage(this.damage, this.game);
      
      // Apply elemental effect if infused
      if (this.infusedElement === 'frost') {
        player.applyDebuff('frost', 3.0);
      } else if (this.infusedElement === 'void') {
        player.mp = Math.max(0, player.mp - 15);
        this.game.particles.spawnText(player.x, player.y - 45, `-15 MANA`, { color: '#a55eea', fontSize: 10, fontPixel: true });
      }

      // bounce enemy back slightly on hit
      const bounceDx = this.x - player.x;
      const bounceDy = this.y - player.y;
      const factor = 120 / (dist > 0.01 ? dist : 1);
      this.applyKnockback(bounceDx * factor, bounceDy * factor);
    }
  }

  getLocalTheme() {
    const lvl = this.game.levelManager;
    if (lvl && lvl.sectorThemes) {
      const sx = Math.max(0, Math.min(lvl.maxSectorCols - 1, Math.floor(this.x / 2000)));
      const sy = Math.max(0, Math.min(lvl.maxSectorRows - 1, Math.floor(this.y / 2000)));
      return lvl.sectorThemes[`${sx},${sy}`] || 'dungeon';
    }
    return (lvl && lvl.theme) || 'dungeon';
  }

  draw(ctx, assetManager) {
    const inGrass = this.isInTallGrass();

    // 8-bit block shadow (flat rect)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(this.x - this.game.camera.x - (this.radius - 2), this.y - this.game.camera.y + this.radius - 4, (this.radius - 2) * 2, 3);

    const isFacingLeft = this.game.player.x < this.x;
    const fIdx = Math.floor(this.frameTimer * 5) % 2; // simple walk animation cycles (frame 0 and 1)

    // Boss sizes, mini size, or standard size rendering
    let size = (this.type === 'archon' || this.type === 'volcanic_titan' || this.type === 'void_behemoth') ? 64 : 32;
    if (this.type === 'slime_mini') size = 16;

    ctx.save();
    if (inGrass) {
      ctx.globalAlpha = 0.25; // fade out inside tall grass
    }
    
    // Apply dynamic color tint filters based on level theme
    const theme = this.getLocalTheme();
    if (theme === 'gardens') {
      ctx.filter = 'hue-rotate(90deg) saturate(1.3) brightness(0.95)';
    } else if (theme === 'underground') {
      ctx.filter = 'sepia(0.6) saturate(1.8) hue-rotate(-20deg) brightness(0.8)';
    } else if (theme === 'pool') {
      ctx.filter = 'hue-rotate(190deg) saturate(1.6) brightness(1.1)';
    } else if (theme === 'backrooms') {
      ctx.filter = 'hue-rotate(40deg) saturate(1.5) sepia(0.3) brightness(1.2)';
    }

    // Status visual overlays / Voted element visual overlays
    if (this.statuses[SPELL_TYPES.FROST] > 0 || this.infusedElement === 'frost') {
      // Ice coloring filter
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#10ac84';
    } else if (this.statuses[SPELL_TYPES.FIRE] > 0 || this.infusedElement === 'fire') {
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ff4757';
    } else if (this.infusedElement === 'void') {
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#a55eea';
    }

    if (isFacingLeft) {
      ctx.translate(this.x - this.game.camera.x, this.y - this.game.camera.y);
      ctx.scale(-1, 1);
      assetManager.draw(ctx, this.spriteKey, 0, 0, size, fIdx);
    } else {
      assetManager.draw(ctx, this.spriteKey, this.x - this.game.camera.x, this.y - this.game.camera.y, size, fIdx);
    }

    ctx.restore();

    // Draw tiny Health Bar over non-boss enemies
    if (this.game.showEnemyHealthbars && !inGrass && this.hp < this.maxHp && this.type !== 'archon' && this.type !== 'volcanic_titan' && this.type !== 'void_behemoth') {
      const rx = this.x - this.game.camera.x;
      const ry = this.y - this.game.camera.y - this.radius - 8;
      const bw = 24;
      const bh = 3;
      
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(rx - bw/2, ry, bw, bh);
      
      const fillW = (this.hp / this.maxHp) * bw;
      ctx.fillStyle = '#ff4757';
      ctx.fillRect(rx - bw/2, ry, fillW, bh);
    }
  }

  isInTallGrass() {
    if (!this.game.levelManager) return false;
    const tx = Math.floor(this.x / 40);
    const ty = Math.floor(this.y / 40);
    if (tx >= 0 && tx < this.game.levelManager.tileWidth && ty >= 0 && ty < this.game.levelManager.tileHeight) {
      const sx = Math.floor(tx / 50);
      const sy = Math.floor(ty / 50);
      const theme = (this.game.levelManager.sectorThemes && this.game.levelManager.sectorThemes[`${sx},${sy}`]) || 'dungeon';
      if (theme === 'gardens') {
        const hash = (tx * 17 + ty * 31) % 100;
        return hash >= 50 && hash < 75;
      }
    }
    return false;
  }
}
