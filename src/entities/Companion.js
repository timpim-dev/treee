import { SPELL_TYPES } from '../engine/Spells.js';

export class Companion {
  constructor(game, type, owner) {
    this.game = game;
    this.type = type; // 1 = Baby Dragon, 2 = Chrono Griffin
    this.owner = owner; // Player
    this.x = owner.x;
    this.y = owner.y;
    this.vx = 0;
    this.vy = 0;
    this.radius = 10;
    this.attackTimer = 0;
    
    this.name = this.type === 1 ? "Baby Pyro-Dragon" : "Chrono Griffin";
    this.spriteKey = this.type === 1 ? "pet_dragon" : "pet_griffin";
    this.frameIndex = 0;
    this.isFacingLeft = false;
  }

  update(dt) {
    // 1. Follow Movement Physics
    // Target position is behind the player's movement direction, or floats nearby if player is idle.
    const playerVx = this.owner.vx;
    const playerVy = this.owner.vy;
    const isMoving = Math.hypot(playerVx, playerVy) > 10;

    let targetX, targetY;
    if (isMoving) {
      const angle = Math.atan2(playerVy, playerVx);
      targetX = this.owner.x - Math.cos(angle) * 35;
      targetY = this.owner.y - Math.sin(angle) * 35 - 12;
    } else {
      const time = this.game.frameIndex * 2;
      targetX = this.owner.x - 25 + Math.sin(time) * 10;
      targetY = this.owner.y - 20 + Math.cos(time * 0.5) * 8;
    }

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);

    const speed = dist * 5;
    const maxSpeed = 360;
    const clampedSpeed = Math.min(speed, maxSpeed);

    if (dist > 3) {
      this.vx = (dx / dist) * clampedSpeed;
      this.vy = (dy / dist) * clampedSpeed;
    } else {
      this.vx *= 0.8;
      this.vy *= 0.8;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Face the target/movement direction
    const mouse = this.game.getWorldMouse();
    this.isFacingLeft = mouse.x < this.x;

    // Wings flapping frame index
    this.frameIndex = Math.floor(this.game.frameIndex * 6) % 2;

    // 2. Auto-attack Targeting and Firing
    const attackRate = this.getAttackRate();
    this.attackTimer += dt;
    if (this.attackTimer >= 1.0 / attackRate) {
      this.attackTimer = 0;
      this.shootAtNearestEnemy();
    }
  }

  getAttackRate() {
    let rate = 1.0;
    const mods = this.owner.modifiers;
    if (this.type === 1) {
      rate += (mods.companion1_speed || 0);
    } else {
      rate += (mods.companion2_speed || 0);
    }
    return rate;
  }

  getDamage() {
    let dmg = this.type === 1 ? 25 : 35;
    const mods = this.owner.modifiers;
    if (this.type === 1) {
      dmg += (mods.companion1_damage || 0);
    } else {
      dmg += (mods.companion2_damage || 0);
    }
    return Math.round(dmg);
  }

  shootAtNearestEnemy() {
    let nearest = null;
    let minDist = 280; // range

    for (const enemy of this.game.enemies) {
      if (enemy.dead || enemy.isInTallGrass()) continue;
      const d = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (d < minDist) {
        minDist = d;
        nearest = enemy;
      }
    }

    if (nearest) {
      const angle = Math.atan2(nearest.y - this.y, nearest.x - this.x);
      const dmg = this.getDamage();

      if (this.type === 1) {
        // Dragon: fires fireballs
        const count = this.owner.modifiers.companion1_triple_shot ? 3 : 1;
        for (let i = 0; i < count; i++) {
          const spreadAngle = angle + (i - (count - 1) / 2) * 0.15;
          this.game.projectiles.push({
            x: this.x,
            y: this.y,
            vx: Math.cos(spreadAngle) * 350,
            vy: Math.sin(spreadAngle) * 350,
            damage: dmg,
            radius: 6,
            element: SPELL_TYPES.FIRE,
            spriteKey: 'proj_fire',
            isPlayerOwned: true,
            life: 2.0,
            id: 'companion_dragon_fire'
          });
        }

        // Spawn fire flash particles
        this.game.particles.spawn(this.x, this.y, {
          vx: Math.cos(angle) * 70,
          vy: Math.sin(angle) * 70,
          color: '#ff4757',
          size: 3.5,
          life: 0.35,
          glow: true
        });

        if (this.game.audio) this.game.audio.playFire();

        // Meteor Emperor keystone upgrade
        if (this.owner.modifiers.companion1_emperor_meteor && Math.random() < 0.20) {
          this.triggerCompanionMeteor(nearest.x, nearest.y, dmg * 2.5);
        }
      } else {
        // Griffin: fires time/lightning zaps that chain/slow
        const isChaining = this.owner.modifiers.companion2_chain_zap;
        this.game.projectiles.push({
          x: this.x,
          y: this.y,
          vx: Math.cos(angle) * 480,
          vy: Math.sin(angle) * 480,
          damage: dmg,
          radius: 5,
          element: SPELL_TYPES.TIME,
          spriteKey: 'proj_lightning',
          isPlayerOwned: true,
          life: 1.5,
          id: isChaining ? 'companion_griffin_chain' : 'companion_griffin_zap'
        });

        // Trigger chain or zapping sounds
        if (this.game.audio) this.game.audio.playLightning();

        // Apply a slow state on zap impact (handled in projectile hit in Game.js)
      }
    }
  }

  triggerCompanionMeteor(tx, ty, dmg) {
    this.game.particles.spawnText(tx, ty - 25, 'COMPANION METEOR!', { color: '#ff4757', fontSize: 9, fontPixel: true, life: 0.8 });
    setTimeout(() => {
      if (this.game.state !== 'PLAYING') return;
      this.game.enemies.forEach(enemy => {
        if (enemy.dead) return;
        const dist = Math.hypot(enemy.x - tx, enemy.y - ty);
        if (dist <= 65) {
          enemy.takeDamage(Math.round(dmg), true, this.game);
          enemy.applyStatus(SPELL_TYPES.FIRE, 3.0);
        }
      });
      this.game.spawnAreaEffect(tx, ty, 65, 'fire_pool', 1.5);
      this.game.particles.createExplosion(tx, ty, '#ff6348', 12, 90, 4);
      if (this.game.audio) this.game.audio.playExplosion();
    }, 600);
  }

  draw(ctx, assetManager) {
    // Draw 8-bit shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(this.x - 7, this.y + 7, 14, 3);

    ctx.save();
    if (this.isFacingLeft) {
      ctx.translate(this.x, this.y);
      ctx.scale(-1, 1);
      assetManager.draw(ctx, this.spriteKey, 0, 0, 24, this.frameIndex, 0);
    } else {
      assetManager.draw(ctx, this.spriteKey, this.x, this.y, 24, this.frameIndex, 0);
    }
    ctx.restore();
  }
}
