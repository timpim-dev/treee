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
    const isMoving = playerVx * playerVx + playerVy * playerVy > 100;

    let targetX, targetY;
    if (isMoving) {
      const angle = Math.atan2(playerVy, playerVx);
      const sideAngle = this.type === 1 ? angle + 0.3 : angle - 0.3;
      targetX = this.owner.x - Math.cos(sideAngle) * 35;
      targetY = this.owner.y - Math.sin(sideAngle) * 35 - 12;
    } else {
      const time = this.game.frameIndex * 2;
      if (this.type === 1) {
        targetX = this.owner.x - 25 + Math.sin(time) * 10;
        targetY = this.owner.y - 20 + Math.cos(time * 0.5) * 8;
      } else {
        targetX = this.owner.x + 25 - Math.sin(time) * 10;
        targetY = this.owner.y - 20 + Math.cos(time * 0.5 + Math.PI) * 8;
      }
    }

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const distSq = dx * dx + dy * dy;

    if (distSq > 9) { // 3 * 3 = 9
      const dist = Math.sqrt(distSq);
      const speed = dist * 5;
      const clampedSpeed = Math.min(speed, 360);
      const factor = clampedSpeed / dist;
      this.vx = dx * factor;
      this.vy = dy * factor;
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

    let nearest = null;
    let minDistSq = 280 * 280; // range squared

    for (const enemy of this.game.enemies) {
      if (enemy.dead || enemy.isInTallGrass()) continue;
      const edx = enemy.x - this.x;
      const edy = enemy.y - this.y;
      const dSq = edx * edx + edy * edy;
      if (dSq < minDistSq) {
        minDistSq = dSq;
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

        if (this.game.audio) this.game.audio.playShoot();

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

        // Chrono Emperor keystone upgrade
        if (this.owner.modifiers.companion2_emperor_bubble && Math.random() < 0.20) {
          this.triggerCompanionTimeBubble(nearest.x, nearest.y);
        }
      }
    }
  }

  triggerCompanionMeteor(tx, ty, dmg) {
    this.game.particles.spawnText(tx, ty - 25, 'COMPANION METEOR!', { color: '#ff4757', fontSize: 9, fontPixel: true, life: 0.8 });
    setTimeout(() => {
      if (this.game.state !== 'PLAYING') return;
      this.game.enemies.forEach(enemy => {
        if (enemy.dead) return;
        const edx = enemy.x - tx;
        const edy = enemy.y - ty;
        if (edx * edx + edy * edy <= 4225) { // 65 * 65 = 4225
          enemy.takeDamage(Math.round(dmg), true, this.game);
          enemy.applyStatus(SPELL_TYPES.FIRE, 3.0);
        }
      });
      this.game.spawnAreaEffect(tx, ty, 65, 'fire_pool', 1.5);
      this.game.particles.createExplosion(tx, ty, '#ff6348', 12, 90, 4);
      if (this.game.audio) this.game.audio.playExplosion();
    }, 600);
  }

  triggerCompanionTimeBubble(tx, ty) {
    this.game.particles.spawnText(tx, ty - 25, 'TIME BUBBLE!', { color: '#ff9f43', fontSize: 9, fontPixel: true, life: 0.8 });
    this.game.spawnAreaEffect(tx, ty, 60, 'chrono_slow', 2.0);
    this.game.particles.spawn(tx, ty, {
      vx: 0,
      vy: 0,
      color: '#ff9f43',
      size: 4,
      life: 0.5,
      glow: true
    });
  }

  draw(ctx, assetManager) {
    const rx = this.x - this.game.camera.x;
    const ry = this.y - this.game.camera.y;

    // Draw 8-bit shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(rx - 7, ry + 7, 14, 3);

    ctx.save();
    if (this.isFacingLeft) {
      ctx.translate(rx, ry);
      ctx.scale(-1, 1);
      assetManager.draw(ctx, this.spriteKey, 0, 0, 24, this.frameIndex, 0);
    } else {
      assetManager.draw(ctx, this.spriteKey, rx, ry, 24, this.frameIndex, 0);
    }
    ctx.restore();
  }
}
