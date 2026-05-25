/**
 * Enemy - Opponents with AI archetypes and status reaction targets
 */
import { SPELL_TYPES } from '../engine/Spells.js';
import { RELICS_CATALOG, EQUIPMENT_CATALOG } from './Player.js';

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
    
    // Knockback states
    this.kbX = 0;
    this.kbY = 0;
    this.kbFriction = 0.88;
    
    // Animation frame tick
    this.frameTimer = Math.random();
    
    // State timer trackers
    this.shootTimer = Math.random() * 2.0; // random offset for shooters
    this.teleportCooldown = 3.0;
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
    }
    
    // Scale XP Value by +25% to speed up AP gains
    if (this.xpValue) {
      this.xpValue = Math.round(this.xpValue * 1.25);
    }
  }

  applyStatus(type, duration) {
    if (type in this.statuses) {
      this.statuses[type] = Math.max(this.statuses[type], duration);
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
    if (game.audio) game.audio.playHit();

    // Create hit particles
    const hitColor = this.statuses[SPELL_TYPES.FROST] > 0 ? '#10ac84' : 
                     this.statuses[SPELL_TYPES.FIRE] > 0 ? '#ff4757' : '#ffffff';
    game.particles.createExplosion(this.x, this.y, hitColor, 8, 80, 2);

    // Spawn damage numbers
    game.particles.spawnText(this.x, this.y - 12, `${finalDamage}`, {
      color: isCrit ? '#f1c40f' : '#ffffff',
      fontSize: isCrit ? 13 : 10,
      weight: isCrit ? 'bold' : 'normal'
    });

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

    if (this.type.includes('elite') || this.type === 'archon') {
      if (Math.random() < 0.50) {
        const combinedPool = [...RELICS_CATALOG, ...EQUIPMENT_CATALOG];
        const randomRelic = combinedPool[Math.floor(Math.random() * combinedPool.length)];
        game.spawnItem(this.x, this.y, 'relic', randomRelic);
      }
    }

    // Death FX
    const deathColor = this.type.includes('slime') ? '#2ed573' : this.type.includes('horror') ? '#a55eea' : '#f1f2f6';
    game.particles.createExplosion(this.x, this.y, deathColor, 20, 150, 4);

    if (this.type === 'archon') {
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

    // Compute status-affected speed (Frost slows down movement)
    let speedMult = 1.0;
    if (this.statuses[SPELL_TYPES.FROST] > 0) {
      speedMult *= 0.55; // 45% slow
    }
    
    // Chrono Warden is immune to slow downs
    if (this.type === 'warden') {
      speedMult = 1.0;
    }

    const currentSpeed = this.speed * speedMult;
    
    // Simple Pathfinding / AI steering
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);

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

    // ── A* WAYPOINT NAVIGATION ────────────────────────────────────────────
    // Enemies follow a precomputed A* path through the cell graph so they
    // never get trapped in maze dead-ends. The path is refreshed every
    // PATH_REFRESH seconds or when the player enters a different cell.
    const lvl = this.game.levelManager;

    const PATH_REFRESH = 0.6; // seconds between full A* recalcs
    const WAYPOINT_RADIUS = 60; // how close before advancing to next waypoint

    // Initialise path state on first use
    if (!this._path)           this._path = [];
    if (!this._pathTimer)      this._pathTimer = 0;
    if (!this._lastGoalCell)   this._lastGoalCell = { c: -1, r: -1 };

    this._pathTimer -= dt;

    const goalCell = lvl.worldToCell(player.x, player.y);
    const goalChanged = goalCell.c !== this._lastGoalCell.c || goalCell.r !== this._lastGoalCell.r;

    if (this._pathTimer <= 0 || goalChanged || this._path.length === 0) {
      this._path = lvl.findPath(this.x, this.y, player.x, player.y);
      this._pathTimer = PATH_REFRESH;
      this._lastGoalCell = goalCell;
    }

    // Advance past waypoints we've already reached
    while (this._path.length > 0) {
      const wp = this._path[0];
      if (Math.hypot(wp.x - this.x, wp.y - this.y) < WAYPOINT_RADIUS) {
        this._path.shift();
      } else {
        break;
      }
    }

    // Determine movement direction:
    // • If we have remaining waypoints, steer toward the next one.
    // • When we're in the same cell as the player (or very close), steer directly.
    const directDist = Math.hypot(player.x - this.x, player.y - this.y);
    if (this._path.length > 0 && directDist > lvl.navCellSize * 0.75) {
      const wp = this._path[0];
      const wdx = wp.x - this.x;
      const wdy = wp.y - this.y;
      const wdist = Math.hypot(wdx, wdy);
      if (wdist > 1) {
        moveX = wdx / wdist;
        moveY = wdy / wdist;
      }
    } else if (directDist > 5) {
      // Close enough — head straight at the player
      moveX = dx / directDist;
      moveY = dy / directDist;
    }

    // ── Local pillar repulsion (prevents clipping into wall edges) ────────
    // This is purely reactive/corrective, NOT the main navigation driver.
    let repX = 0, repY = 0;
    for (const obs of lvl.obstacles) {
      if (obs.type !== 'pillar') continue;
      const odx = this.x - obs.x;
      const ody = this.y - obs.y;
      const odist = Math.hypot(odx, ody);
      const zone = this.radius + obs.radius + 6;
      if (odist < zone && odist > 0.01) {
        const strength = (zone - odist) / zone;
        repX += (odx / odist) * strength;
        repY += (ody / odist) * strength;
      }
    }
    const repMag = Math.hypot(repX, repY);
    if (repMag > 0.01) {
      // Blend: keep most of the intended nav direction, add gentle push away
      moveX = moveX * 0.65 + (repX / repMag) * 0.35;
      moveY = moveY * 0.65 + (repY / repMag) * 0.35;
      const blendMag = Math.hypot(moveX, moveY);
      if (blendMag > 0.01) { moveX /= blendMag; moveY /= blendMag; }
    }

    // ── Integrate ─────────────────────────────────────────────────────────
    const finalVx = moveX * currentSpeed + this.kbX;
    const finalVy = moveY * currentSpeed + this.kbY;

    this.x += finalVx * dt;
    this.y += finalVy * dt;

    // Decay knockback
    this.kbX *= Math.pow(this.kbFriction, dt * 60);
    this.kbY *= Math.pow(this.kbFriction, dt * 60);
    if (Math.hypot(this.kbX, this.kbY) < 1) { this.kbX = 0; this.kbY = 0; }

    // Hard boundary clamp
    this.x = Math.max(this.radius + 40, Math.min(lvl.width  - this.radius - 40, this.x));
    this.y = Math.max(this.radius + 40, Math.min(lvl.height - this.radius - 40, this.y));

    // Post-move push-out — two passes to resolve corner cases
    for (let pass = 0; pass < 2; pass++) {
      for (const obs of lvl.obstacles) {
        if (obs.type !== 'pillar' && obs.type !== 'explosive_barrel') continue;
        const odx = this.x - obs.x;
        const ody = this.y - obs.y;
        const odist = Math.hypot(odx, ody);
        const minD = this.radius + obs.radius + 1;
        if (odist < minD && odist > 0.01) {
          const ang = Math.atan2(ody, odx);
          this.x = obs.x + Math.cos(ang) * minD;
          this.y = obs.y + Math.sin(ang) * minD;
        }
      }
    }

    // Bumping between enemies to prevent stacking
    this.game.enemies.forEach((other) => {
      if (other !== this && !other.dead) {
        const bdx = this.x - other.x;
        const bdy = this.y - other.y;
        const bdist = Math.hypot(bdx, bdy);
        const minDist = this.radius + other.radius;
        if (bdist < minDist && bdist > 0.01) {
          const push = (minDist - bdist) * 0.5;
          const angle = Math.atan2(bdy, bdx);
          this.x += Math.cos(angle) * push;
          this.y += Math.sin(angle) * push;
          other.x -= Math.cos(angle) * push;
          other.y -= Math.sin(angle) * push;
        }
      }
    });

    // Deal damage to Player if colliding
    const pdist = Math.hypot(player.x - this.x, player.y - this.y);
    if (pdist < this.radius + player.radius) {
      player.takeDamage(this.damage, this.game);
      // bounce enemy back slightly on hit
      const bounceAngle = Math.atan2(this.y - player.y, this.x - player.x);
      this.applyKnockback(Math.cos(bounceAngle) * 120, Math.sin(bounceAngle) * 120);
    }
  }

  draw(ctx, assetManager) {
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(this.x - this.game.camera.x, this.y - this.game.camera.y + this.radius - 2, this.radius - 2, 0, Math.PI * 2);
    ctx.fill();

    const isFacingLeft = this.game.player.x < this.x;
    const fIdx = Math.floor(this.frameTimer * 5) % 2; // simple walk animation cycles (frame 0 and 1)

    // Boss sizes, mini size, or standard size rendering
    let size = this.type === 'archon' ? 64 : 32;
    if (this.type === 'slime_mini') size = 16;

    ctx.save();
    
    // Status visual overlays
    if (this.statuses[SPELL_TYPES.FROST] > 0) {
      // Ice coloring filter
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#10ac84';
    } else if (this.statuses[SPELL_TYPES.FIRE] > 0) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ff4757';
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
    if (this.hp < this.maxHp && this.type !== 'archon') {
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
}
