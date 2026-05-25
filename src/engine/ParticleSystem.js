/**
 * ParticleSystem - High-performance visual effects engine
 * Manages physical particles (fire, sparks, ice, shards) and floating text.
 */
export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.textParticles = [];
  }

  /**
   * Spawns a physical particle
   */
  spawn(x, y, options = {}) {
    this.particles.push({
      x,
      y,
      vx: options.vx !== undefined ? options.vx : (Math.random() - 0.5) * 100,
      vy: options.vy !== undefined ? options.vy : (Math.random() - 0.5) * 100,
      color: options.color || '#fff',
      size: options.size || Math.random() * 4 + 2,
      maxLife: options.life || Math.random() * 0.5 + 0.3,
      life: options.life || Math.random() * 0.5 + 0.3,
      friction: options.friction || 0.95,
      gravity: options.gravity || 0,
      glow: options.glow || false,
      shape: options.shape || 'circle', // 'circle', 'square', 'spark'
      growth: options.growth || 0, // change in size over time
      behavior: options.behavior || null // custom movement function
    });
  }

  /**
   * Spawns floating combat text (Damage numbers, healing, status effects)
   */
  spawnText(x, y, text, options = {}) {
    this.textParticles.push({
      x,
      y,
      vx: options.vx !== undefined ? options.vx : (Math.random() - 0.5) * 40,
      vy: options.vy !== undefined ? options.vy : -80 - Math.random() * 40,
      text: text,
      color: options.color || '#fff',
      fontSize: options.fontSize || 12,
      fontFamily: options.fontPixel ? "'Press Start 2P', monospace" : "'Orbitron', sans-serif",
      life: options.life || 1.0,
      maxLife: options.life || 1.0,
      weight: options.weight || 'bold',
      shadow: options.shadow || true
    });
  }

  /**
   * Create an explosion of particles
   */
  createExplosion(x, y, color, count = 15, speed = 120, size = 4) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = (0.3 + Math.random() * 0.7) * speed;
      this.spawn(x, y, {
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        color: color,
        size: Math.random() * size + 2,
        life: 0.4 + Math.random() * 0.4,
        friction: 0.92,
        glow: true
      });
    }
  }

  /**
   * Update all active particles
   */
  update(dt) {
    // Update physical particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      // Physics integration
      p.vx *= Math.pow(p.friction, dt * 60);
      p.vy *= Math.pow(p.friction, dt * 60);
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.growth * dt;
      if (p.size < 0.1) p.size = 0.1;

      if (p.behavior) {
        p.behavior(p, dt);
      }
    }

    // Update text particles
    for (let i = this.textParticles.length - 1; i >= 0; i--) {
      const tp = this.textParticles[i];
      tp.life -= dt;
      if (tp.life <= 0) {
        this.textParticles.splice(i, 1);
        continue;
      }

      // Slowly float upwards and drift
      tp.vy *= Math.pow(0.9, dt * 60);
      tp.x += tp.vx * dt;
      tp.y += tp.vy * dt;
    }
  }

  /**
   * Draw all particles on canvas
   */
  draw(ctx, camera) {
    ctx.save();
    
    // Draw physical particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const alpha = p.life / p.maxLife;
      
      const rx = p.x - camera.x;
      const ry = p.y - camera.y;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      if (p.glow) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
      } else {
        ctx.shadowBlur = 0;
      }

      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(rx, ry, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'square') {
        ctx.fillRect(rx - p.size, ry - p.size, p.size * 2, p.size * 2);
      } else if (p.shape === 'spark') {
        // Jagged line shape
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(rx - p.vx * 0.05, ry - p.vy * 0.05);
        ctx.lineTo(rx, ry);
        ctx.stroke();
      }
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Draw text particles
    for (let i = 0; i < this.textParticles.length; i++) {
      const tp = this.textParticles[i];
      const alpha = Math.min(1, (tp.life / tp.maxLife) * 1.5);
      
      const rx = tp.x - camera.x;
      const ry = tp.y - camera.y;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = tp.color;
      ctx.font = `${tp.weight} ${tp.fontSize}px ${tp.fontFamily}`;
      ctx.textAlign = 'center';
      
      if (tp.shadow) {
        ctx.fillStyle = '#000000';
        ctx.fillText(tp.text, rx + 1, ry + 1);
        ctx.fillStyle = tp.color;
      }
      
      ctx.fillText(tp.text, rx, ry);
      ctx.restore();
    }

    ctx.restore();
  }
}
