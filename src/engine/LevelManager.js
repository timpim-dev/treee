/**
 * LevelManager - Manages arenas, waves, spawns, and dynamic events (Meteors, Storms)
 */
import { RELICS_CATALOG } from '../entities/Player.js';

export class LevelManager {
  constructor(game) {
    this.game = game;
    this.width = 2000; // Arena dimensions
    this.height = 2000;
    
    // Wave state
    this.wave = 1;
    this.waveTimer = 30.0; // 30 seconds per wave
    this.maxWave = 10;
    this.waveInProgress = false;
    this.enemiesSpawnedThisWave = 0;
    this.spawnTimer = 0;
    this.spawnInterval = 2.0; // Spawns every 2 seconds
    
    // Arena obstacles
    this.obstacles = [];
    // Navigation graph built during generateObstacles()
    // navCells[c][r] = { c, r, open: { north, south, east, west } }
    this.navCols = 10;
    this.navRows = 10;
    this.navCellSize = 200;
    this.navCells = null;
    this.generateObstacles();

    // Interactive elements
    this.chests = [];
    this.shrines = [];

    // Event schedule state
    this.activeEvents = {
      meteors: false,
      storm: false
    };
    this.eventTimer = 15.0; // Random events every 15s
    this.meteorIndicators = [];
  }

  generateObstacles() {
    this.obstacles = [];
    
    const cols = 10;
    const rows = 10;
    const cellSize = 200;
    
    // Create grid cells with walls: north, south, east, west
    const cells = [];
    for (let c = 0; c < cols; c++) {
      cells[c] = [];
      for (let r = 0; r < rows; r++) {
        cells[c][r] = {
          c,
          r,
          visited: false,
          walls: {
            north: true, // y = r * cellSize
            south: true, // y = (r + 1) * cellSize
            east: true,  // x = (c + 1) * cellSize
            west: true   // x = c * cellSize
          }
        };
      }
    }
    
    // DFS Maze generation
    const stack = [];
    let current = cells[0][0];
    current.visited = true;
    let visitedCount = 1;
    const totalCells = cols * rows;
    
    while (visitedCount < totalCells) {
      // Find unvisited neighbors
      const neighbors = [];
      const { c, r } = current;
      
      if (r > 0 && !cells[c][r - 1].visited) neighbors.push({ cell: cells[c][r - 1], dir: 'north' });
      if (r < rows - 1 && !cells[c][r + 1].visited) neighbors.push({ cell: cells[c][r + 1], dir: 'south' });
      if (c < cols - 1 && !cells[c + 1][r].visited) neighbors.push({ cell: cells[c + 1][r], dir: 'east' });
      if (c > 0 && !cells[c - 1][r].visited) neighbors.push({ cell: cells[c - 1][r], dir: 'west' });
      
      if (neighbors.length > 0) {
        // Choose a random neighbor
        const nextObj = neighbors[Math.floor(Math.random() * neighbors.length)];
        const nextCell = nextObj.cell;
        
        // Remove wall between current and next
        if (nextObj.dir === 'north') {
          current.walls.north = false;
          nextCell.walls.south = false;
        } else if (nextObj.dir === 'south') {
          current.walls.south = false;
          nextCell.walls.north = false;
        } else if (nextObj.dir === 'east') {
          current.walls.east = false;
          nextCell.walls.west = false;
        } else if (nextObj.dir === 'west') {
          current.walls.west = false;
          nextCell.walls.east = false;
        }
        
        stack.push(current);
        current = nextCell;
        current.visited = true;
        visitedCount++;
      } else if (stack.length > 0) {
        current = stack.pop();
      } else {
        break;
      }
    }
    
    // Now we have a perfect maze. To make it more open (loops & chambers),
    // we randomly remove 35% of all remaining walls.
    const hWalls = [];
    const vWalls = [];
    
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (r > 0 && cells[c][r].walls.north) {
          hWalls.push({ c, r, type: 'h' });
        }
        if (c > 0 && cells[c][r].walls.west) {
          vWalls.push({ c, r, type: 'v' });
        }
      }
    }
    
    const allWalls = [...hWalls, ...vWalls];
    const removeCount = Math.floor(allWalls.length * 0.35);
    for (let i = 0; i < removeCount; i++) {
      const idx = Math.floor(Math.random() * allWalls.length);
      const wall = allWalls.splice(idx, 1)[0];
      if (wall.type === 'h') {
        cells[wall.c][wall.r].walls.north = false;
        cells[wall.c][wall.r - 1].walls.south = false;
      } else {
        cells[wall.c][wall.r].walls.west = false;
        cells[wall.c - 1][wall.r].walls.east = false;
      }
    }
    
    // ── Store nav graph (cell adjacency) ──────────────────────────────────
    // Build AFTER the 35% wall-removal so the graph matches the actual maze.
    this.navCells = cells; // keep reference — walls are already trimmed above

    // Now compile walls into overlapping stone pillars
    const addPillarsAlongWall = (startX, startY, endX, endY) => {
      const dist = Math.hypot(endX - startX, endY - startY);
      const steps = Math.floor(dist / 22); // spacing of 22px
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = startX + (endX - startX) * t;
        const py = startY + (endY - startY) * t;
        
        // Skip player spawn center check (120px)
        if (Math.hypot(px - 1000, py - 1000) < 120) {
          continue;
        }
        
        this.obstacles.push({
          x: px,
          y: py,
          radius: 16,
          type: 'pillar'
        });
      }
    };
    
    // Draw cells
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (r > 0 && cells[c][r].walls.north) {
          addPillarsAlongWall(c * cellSize, r * cellSize, (c + 1) * cellSize, r * cellSize);
        }
        if (c > 0 && cells[c][r].walls.west) {
          addPillarsAlongWall(c * cellSize, r * cellSize, c * cellSize, (r + 1) * cellSize);
        }
      }
    }
    
    // Add some random explosive barrels in chambers
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (Math.hypot((c + 0.5) * cellSize - 1000, (r + 0.5) * cellSize - 1000) < 200) {
          continue;
        }
        
        if (Math.random() < 0.12) {
          const bx = (c + 0.5) * cellSize + (Math.random() - 0.5) * 60;
          const by = (r + 0.5) * cellSize + (Math.random() - 0.5) * 60;
          
          let overlap = false;
          for (const obs of this.obstacles) {
            if (Math.hypot(obs.x - bx, obs.y - by) < obs.radius + 20) {
              overlap = true;
              break;
            }
          }
          if (!overlap) {
            this.obstacles.push({
              x: bx,
              y: by,
              radius: 14,
              type: 'explosive_barrel'
            });
          }
        }
      }
    }
  }

  // ── Navigation helpers ──────────────────────────────────────────────────

  /** World position → cell coords (clamped) */
  worldToCell(wx, wy) {
    const c = Math.max(0, Math.min(this.navCols - 1, Math.floor(wx / this.navCellSize)));
    const r = Math.max(0, Math.min(this.navRows - 1, Math.floor(wy / this.navCellSize)));
    return { c, r };
  }

  /** Cell coords → world centre of that cell */
  cellCenter(c, r) {
    return {
      x: (c + 0.5) * this.navCellSize,
      y: (r + 0.5) * this.navCellSize
    };
  }

  /**
   * A* on the cell graph.
   * Returns an array of world-space waypoints from startWorld to goalWorld,
   * NOT including startWorld itself, INCLUDING goalWorld.
   * Returns [] if start === goal cell or no path found (shouldn't happen in a
   * connected maze, but gracefully falls back).
   */
  findPath(startWx, startWy, goalWx, goalWy) {
    if (!this.navCells) return [];

    const sc = this.worldToCell(startWx, startWy);
    const gc = this.worldToCell(goalWx, goalWy);

    // Same cell — no waypoints needed
    if (sc.c === gc.c && sc.r === gc.r) return [];

    const key = (c, r) => c * this.navRows + r;

    // A* open set as a simple array (maze is only 10×10 = 100 nodes, fast enough)
    const open   = new Map(); // key → { c, r, g, f, parent }
    const closed = new Set();

    const heuristic = (c, r) => Math.abs(c - gc.c) + Math.abs(r - gc.r);

    const startNode = { c: sc.c, r: sc.r, g: 0, f: heuristic(sc.c, sc.r), parent: null };
    open.set(key(sc.c, sc.r), startNode);

    while (open.size > 0) {
      // Pick node with lowest f
      let best = null;
      for (const node of open.values()) {
        if (!best || node.f < best.f) best = node;
      }
      open.delete(key(best.c, best.r));
      closed.add(key(best.c, best.r));

      if (best.c === gc.c && best.r === gc.r) {
        // Reconstruct path
        const waypoints = [];
        let node = best;
        while (node) {
          waypoints.unshift(this.cellCenter(node.c, node.r));
          node = node.parent;
        }
        // Drop the first waypoint if it's the start cell centre (enemy already there)
        if (waypoints.length > 0) {
          const firstWp = waypoints[0];
          const startCenter = this.cellCenter(sc.c, sc.r);
          if (Math.hypot(firstWp.x - startCenter.x, firstWp.y - startCenter.y) < 1) {
            waypoints.shift();
          }
        }
        return waypoints;
      }

      // Expand neighbours through open walls
      const cell = this.navCells[best.c][best.r];
      const dirs = [
        { dc: 0,  dr: -1, wall: 'north' },
        { dc: 0,  dr:  1, wall: 'south' },
        { dc:  1, dr: 0,  wall: 'east'  },
        { dc: -1, dr: 0,  wall: 'west'  },
      ];

      for (const { dc, dr, wall } of dirs) {
        if (cell.walls[wall]) continue; // wall present — not passable
        const nc = best.c + dc;
        const nr = best.r + dr;
        if (nc < 0 || nr < 0 || nc >= this.navCols || nr >= this.navRows) continue;
        const nk = key(nc, nr);
        if (closed.has(nk)) continue;
        const g = best.g + 1;
        const f = g + heuristic(nc, nr);
        if (!open.has(nk) || open.get(nk).g > g) {
          open.set(nk, { c: nc, r: nr, g, f, parent: best });
        }
      }
    }

    // No path found (shouldn't happen in connected maze)
    return [];
  }

  startNextWave() {
    this.waveInProgress = true;
    this.waveTimer = 30.0;
    this.enemiesSpawnedThisWave = 0;
    this.spawnTimer = 0;
    
    // Wave spawning density tuning
    this.spawnInterval = Math.max(0.4, 2.0 - (this.wave * 0.15));
    if (this.wave >= 10) {
      this.spawnInterval /= 2.0; // Double spawn rate
    }

    this.game.particles.spawnText(this.game.player.x, this.game.player.y - 40, `WAVE ${this.wave} BEGINS`, {
      color: '#fff',
      fontSize: 16,
      fontPixel: true,
      life: 2.0
    });

    // Clear previous items/chests/shrines to prevent clutter, and spawn fresh ones!
    this.chests = [];
    this.shrines = [];
    
    // Spawn 1 chest and 1 shrine per wave
    this.spawnChest();
    this.spawnShrine();

    // Handle background level sound cues or screen flashes
    this.game.screenShake = 10;
  }

  spawnChest() {
    let px = 0, py = 0;
    let valid = false;
    let attempts = 0;

    while (!valid && attempts < 100) {
      px = 100 + Math.random() * (this.width - 200);
      py = 100 + Math.random() * (this.height - 200);
      attempts++;

      // Check distance to player
      const pdist = Math.hypot(this.game.player.x - px, this.game.player.y - py);
      if (pdist < 200) continue;

      let obsOverlap = false;
      this.obstacles.forEach((obs) => {
        if (Math.hypot(obs.x - px, obs.y - py) < obs.radius + 30) {
          obsOverlap = true;
        }
      });
      if (obsOverlap) continue;

      valid = true;
    }

    if (valid) {
      this.chests.push({ x: px, y: py, radius: 12, unlockTimer: 3.0 });
    }
  }

  spawnShrine() {
    let px = 0, py = 0;
    let valid = false;
    let attempts = 0;

    while (!valid && attempts < 100) {
      px = 100 + Math.random() * (this.width - 200);
      py = 100 + Math.random() * (this.height - 200);
      attempts++;

      // Check distance to player
      const pdist = Math.hypot(this.game.player.x - px, this.game.player.y - py);
      if (pdist < 200) continue;

      let overlap = false;
      this.obstacles.forEach((obs) => {
        if (Math.hypot(obs.x - px, obs.y - py) < obs.radius + 30) {
          overlap = true;
        }
      });
      this.chests.forEach((chest) => {
        if (Math.hypot(chest.x - px, chest.y - py) < 100) {
          overlap = true;
        }
      });
      if (overlap) continue;

      valid = true;
    }

    if (valid) {
      const types = ['haste', 'mana', 'damage'];
      const buffType = types[Math.floor(Math.random() * types.length)];
      this.shrines.push({ x: px, y: py, radius: 12, buffType, active: true, cooldown: 0 });
    }
  }

  update(dt) {
    if (!this.waveInProgress) return;

    // Advance wave countdown
    if (this.waveTimer > 0) {
      this.waveTimer -= dt;
      if (this.waveTimer < 0) this.waveTimer = 0;
    }

    // Check wave end conditions (Time is up AND no enemies left)
    if (this.waveTimer === 0 && this.game.enemies.length === 0) {
      this.waveInProgress = false;
      
      // Grant bonus Aether Shards for survival
      const shardBonus = 5 + this.wave * 2;
      this.game.player.shards += shardBonus;
      this.game.player.ap += 1; // Gain 1 Ability Point per wave completion
      
      this.game.particles.spawnText(this.game.player.x, this.game.player.y - 30, `WAVE COMPLETED! +${shardBonus} Shards`, {
        color: '#2ed573',
        fontSize: 12,
        fontPixel: true,
        life: 2.5
      });

      // Save game state
      this.game.player.saveGameState();

      // Trigger Runic Shop overlay!
      this.game.setState('SHOP');
      return;
    }

    // Spawn enemies during wave active duration
    if (this.waveTimer > 0) {
      this.spawnTimer += dt;
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnTimer = 0;
        this.spawnEnemy();
      }
    }

    // Update Shrines & Chests interaction
    this.updateInteractives(dt);

    // Update dynamic events
    this.updateEvents(dt);
  }

  updateInteractives(dt) {
    // Update Shrines
    this.shrines.forEach((shrine) => {
      if (shrine.cooldown > 0) {
        shrine.cooldown -= dt;
        if (shrine.cooldown <= 0) {
          shrine.active = true;
          this.game.particles.createExplosion(shrine.x, shrine.y, '#7d5fff', 10, 50, 1.5);
        }
      } else {
        // Player interaction with active shrine
        const dist = Math.hypot(this.game.player.x - shrine.x, this.game.player.y - shrine.y);
        if (dist < 22 && shrine.active) {
          shrine.active = false;
          shrine.cooldown = 35.0; // 35s cooldown
          
          // Apply buff to player
          this.game.player.applyBuff(shrine.buffType, 12.0); // 12 seconds buff
          
          if (this.game.audio) this.game.audio.playUnlock();
          
          const colorMap = {
            haste: '#ff9f43',
            mana: '#10ac84',
            damage: '#ff4757'
          };
          this.game.particles.createExplosion(shrine.x, shrine.y, colorMap[shrine.buffType], 20, 90, 3);
        }
      }
    });

    // Update Chests
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const chest = this.chests[i];
      const dist = Math.hypot(this.game.player.x - chest.x, this.game.player.y - chest.y);
      
      if (dist < 30) {
        // Player unlocking chest
        chest.unlockTimer -= dt;
        
        // Spawn lockpicking wisp particles
        if (Math.random() < 0.25) {
          this.game.particles.spawn(chest.x + (Math.random() - 0.5) * 20, chest.y + (Math.random() - 0.5) * 20, {
            vx: 0, vy: -30,
            color: '#eccc68',
            size: 1.5,
            life: 0.4,
            glow: true
          });
        }

        if (chest.unlockTimer <= 0) {
          // Open chest!
          this.game.player.shards += 40;
          this.game.score += 400;
          
          // Explode shards loot around chest
          for (let s = 0; s < 6; s++) {
            this.game.spawnItem(chest.x + (Math.random()-0.5)*15, chest.y + (Math.random()-0.5)*15, 'shard', 25);
          }

          // 50% chance to drop relic from chest
          if (Math.random() < 0.50) {
            const randomRelic = RELICS_CATALOG[Math.floor(Math.random() * RELICS_CATALOG.length)];
            this.game.spawnItem(chest.x, chest.y, 'relic', randomRelic);
          }

          if (this.game.audio) this.game.audio.playBuy();

          this.game.particles.spawnText(chest.x, chest.y - 20, "CHEST OPENED! +40 Shards", {
            color: '#eccc68',
            fontSize: 10,
            fontPixel: true
          });

          this.game.particles.createExplosion(chest.x, chest.y, '#eccc68', 25, 120, 3);
          this.chests.splice(i, 1);
        }
      } else {
        // Reset timer slowly if player walks away
        if (chest.unlockTimer < 3.0) chest.unlockTimer = Math.min(3.0, chest.unlockTimer + dt);
      }
    }
  }

  /**
   * Spawn a random enemy based on the current wave difficulty
   */
  spawnEnemy() {
    // Choose spawn location outside the player's view viewport to prevent pop-in
    const pad = 100;
    const viewWidth = this.game.canvas.width;
    const viewHeight = this.game.canvas.height;
    
    let sx = 0;
    let sy = 0;
    
    // Choose a side to spawn (0: Top, 1: Right, 2: Bottom, 3: Left)
    const side = Math.floor(Math.random() * 4);
    switch (side) {
      case 0: // Top
        sx = this.game.camera.x + Math.random() * viewWidth;
        sy = this.game.camera.y - pad;
        break;
      case 1: // Right
        sx = this.game.camera.x + viewWidth + pad;
        sy = this.game.camera.y + Math.random() * viewHeight;
        break;
      case 2: // Bottom
        sx = this.game.camera.x + Math.random() * viewWidth;
        sy = this.game.camera.y + viewHeight + pad;
        break;
      case 3: // Left
        sx = this.game.camera.x - pad;
        sy = this.game.camera.y + Math.random() * viewHeight;
        break;
    }

    // Constrain inside bounds
    sx = Math.max(50, Math.min(this.width - 50, sx));
    sy = Math.max(50, Math.min(this.height - 50, sy));

    // Choose enemy archetype based on wave
    let type = 'slime';
    const roll = Math.random();

    // 15% chance to spawn an Elite starting at wave 3
    const isElite = this.wave >= 3 && Math.random() < 0.15;

    if (this.wave === 1) {
      type = 'slime';
    } else if (this.wave === 2) {
      type = roll < 0.7 ? 'slime' : 'skeleton';
    } else if (this.wave === 3) {
      type = roll < 0.4 ? 'slime' : roll < 0.8 ? 'skeleton' : 'horror';
    } else if (this.wave === 4) {
      type = roll < 0.3 ? 'slime' : roll < 0.6 ? 'skeleton' : roll < 0.9 ? 'horror' : 'warden';
    } else if (this.wave === 5 && this.enemiesSpawnedThisWave === 0) {
      // BOSS WAVE!
      type = 'archon';
    } else {
      // Later waves have higher proportions of tough enemies
      // Beyond wave 10, there is a 10% chance to spawn an Aether Archon boss
      if (this.wave >= 10 && roll < 0.10) {
        type = 'archon';
      } else {
        const enemyRoll = Math.random();
        if (enemyRoll < 0.25) type = 'slime';
        else if (enemyRoll < 0.55) type = 'skeleton';
        else if (enemyRoll < 0.8) type = 'horror';
        else type = 'warden';
      }
    }

    if (isElite && type !== 'archon' && type !== 'warden') {
      type = type + '_elite';
    }

    // Ensure spawn coordinates are not inside any pillar
    for (const obs of this.obstacles) {
      if (obs.type !== 'pillar') continue;
      const dist = Math.hypot(sx - obs.x, sy - obs.y);
      const minDistance = obs.radius + 15; // 15px clearance
      if (dist < minDistance) {
        // Push spawn position away from the pillar center
        const angle = dist > 0.1 ? Math.atan2(sy - obs.y, sx - obs.x) : Math.random() * Math.PI * 2;
        sx = obs.x + Math.cos(angle) * (minDistance + 5);
        sy = obs.y + Math.sin(angle) * (minDistance + 5);
      }
    }

    // Double-check constraints
    sx = Math.max(50, Math.min(this.width - 50, sx));
    sy = Math.max(50, Math.min(this.height - 50, sy));

    // Spawn the enemy
    this.game.spawnEnemy(sx, sy, type);
    this.enemiesSpawnedThisWave++;
  }

  /**
   * Triggers and manages environmental hazards
   */
  updateEvents(dt) {
    this.eventTimer -= dt;
    if (this.eventTimer <= 0) {
      this.eventTimer = 15.0 + Math.random() * 10;
      
      // Select random event
      const choice = Math.floor(Math.random() * 4);
      if (choice === 0) {
        this.triggerMeteorShower();
      } else if (choice === 1) {
        this.triggerAetherStorm();
      } else if (choice === 2) {
        this.triggerFrostFissures();
      } else {
        this.triggerVoidRifts();
      }
    }

    // Update active indicators
    for (let i = this.meteorIndicators.length - 1; i >= 0; i--) {
      const met = this.meteorIndicators[i];
      met.delay -= dt;
      
      // Pulse animation in indicator size
      met.pulseTimer += dt * 10;

      if (met.delay <= 0) {
        const type = met.type || 'meteor';
        const dist = Math.hypot(this.game.player.x - met.x, this.game.player.y - met.y);

        if (type === 'meteor') {
          // METEOR STRIKE!
          this.game.particles.createExplosion(met.x, met.y, '#ffa502', 30, 200, 5);
          this.game.screenShake = 15;
          
          if (dist <= met.radius) {
            this.game.player.takeDamage(30, this.game);
          }

          this.game.enemies.forEach((enemy) => {
            const edist = Math.hypot(enemy.x - met.x, enemy.y - met.y);
            if (edist <= met.radius) {
              enemy.takeDamage(60, false, this.game);
              enemy.applyStatus('fire', 5.0);
            }
          });

          this.game.spawnAreaEffect(met.x, met.y, met.radius - 10, 'fire_pool', 3.0);
        } else if (type === 'frost') {
          // FROST FISSURES!
          this.game.particles.createExplosion(met.x, met.y, '#00d2d3', 25, 120, 3);
          this.game.screenShake = 5;
          
          if (dist <= met.radius) {
            this.game.player.takeDamage(20, this.game);
          }

          this.game.enemies.forEach((enemy) => {
            const edist = Math.hypot(enemy.x - met.x, enemy.y - met.y);
            if (edist <= met.radius) {
              enemy.takeDamage(30, false, this.game);
              enemy.applyStatus('frost', 6.0);
            }
          });

          this.game.spawnAreaEffect(met.x, met.y, met.radius, 'frost_slow', 4.0);
        } else if (type === 'void') {
          // VOID DETONATION!
          this.game.particles.createExplosion(met.x, met.y, '#8c7ae6', 35, 180, 4);
          this.game.screenShake = 12;

          if (dist <= met.radius) {
            this.game.player.takeDamage(25, this.game);
          }

          this.game.enemies.forEach((enemy) => {
            const edist = Math.hypot(enemy.x - met.x, enemy.y - met.y);
            if (edist <= met.radius) {
              enemy.takeDamage(50, false, this.game);
            }
          });

          this.game.spawnAreaEffect(met.x, met.y, met.radius + 15, 'singularity', 4.0);
        }

        this.meteorIndicators.splice(i, 1);
      }
    }
  }

  triggerMeteorShower() {
    this.game.particles.spawnText(this.game.player.x, this.game.player.y - 50, "HAZARD: METEOR SHOWER DETECTED", {
      color: '#ff4757',
      fontSize: 12,
      fontPixel: true,
      life: 3.0
    });

    const count = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      // Targets around player coordinates
      const tx = this.game.player.x + (Math.random() - 0.5) * 400;
      const ty = this.game.player.y + (Math.random() - 0.5) * 400;
      
      this.meteorIndicators.push({
        x: Math.max(50, Math.min(this.width - 50, tx)),
        y: Math.max(50, Math.min(this.height - 50, ty)),
        radius: 50,
        delay: 2.0 + Math.random() * 2.0, // strike time
        pulseTimer: 0
      });
    }
  }

  triggerAetherStorm() {
    this.game.particles.spawnText(this.game.player.x, this.game.player.y - 50, "HAZARD: ELECTROMAGNETIC STORM", {
      color: '#f1c40f',
      fontSize: 12,
      fontPixel: true,
      life: 3.0
    });

    // Spawn multiple rapid lightning bolts on coordinates
    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        if (this.game.state !== 'PLAYING') return;

        const tx = this.game.player.x + (Math.random() - 0.5) * 500;
        const ty = this.game.player.y + (Math.random() - 0.5) * 500;
        
        // Spawn lightning bolt particle
        this.game.particles.createExplosion(tx, ty, '#f1c40f', 15, 120, 2);
        
        // Deal damage - FIXED reference error
        const dist = Math.hypot(this.game.player.x - tx, this.game.player.y - ty);
        if (dist < 40) {
          this.game.player.takeDamage(20, this.game);
        }

        this.game.enemies.forEach((enemy) => {
          const edist = Math.hypot(enemy.x - tx, enemy.y - ty);
          if (edist < 40) {
            enemy.takeDamage(40, false, this.game);
            enemy.applyStatus('lightning', 4.0);
          }
        });
      }, i * 400);
    }
  }

  triggerFrostFissures() {
    this.game.particles.spawnText(this.game.player.x, this.game.player.y - 50, "HAZARD: FROST FISSURES DETECTED", {
      color: '#00d2d3',
      fontSize: 10,
      fontPixel: true,
      life: 3.0
    });

    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const tx = this.game.player.x + (Math.random() - 0.5) * 350;
      const ty = this.game.player.y + (Math.random() - 0.5) * 350;
      
      this.meteorIndicators.push({
        x: Math.max(50, Math.min(this.width - 50, tx)),
        y: Math.max(50, Math.min(this.height - 50, ty)),
        radius: 40,
        delay: 1.5 + Math.random() * 1.5,
        pulseTimer: 0,
        type: 'frost'
      });
    }
  }

  triggerVoidRifts() {
    this.game.particles.spawnText(this.game.player.x, this.game.player.y - 50, "HAZARD: VOID RIFTS DETECTED", {
      color: '#a55eea',
      fontSize: 10,
      fontPixel: true,
      life: 3.0
    });

    const count = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const tx = this.game.player.x + (Math.random() - 0.5) * 450;
      const ty = this.game.player.y + (Math.random() - 0.5) * 450;
      
      this.meteorIndicators.push({
        x: Math.max(50, Math.min(this.width - 50, tx)),
        y: Math.max(50, Math.min(this.height - 50, ty)),
        radius: 45,
        delay: 2.0 + Math.random() * 2.0,
        pulseTimer: 0,
        type: 'void'
      });
    }
  }

  /**
   * Draw borders, obstacles, hazard indicators
   */
  draw(ctx, camera) {
    // Draw boundary walls
    ctx.strokeStyle = '#7d5fff';
    ctx.lineWidth = 10;
    ctx.strokeRect(-camera.x, -camera.y, this.width, this.height);
    
    // Draw warning hashes near walls
    ctx.strokeStyle = 'rgba(255, 71, 87, 0.15)';
    ctx.lineWidth = 40;
    ctx.strokeRect(-camera.x + 20, -camera.y + 20, this.width - 40, this.height - 40);

    // Draw Shrines
    this.shrines.forEach((shrine) => {
      const rx = shrine.x - camera.x;
      const ry = shrine.y - camera.y;
      
      // Draw shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(rx, ry + 8, 12, 0, Math.PI*2);
      ctx.fill();

      // Draw shrine sprite (translucent if on cooldown)
      const alpha = shrine.active ? 1.0 : 0.4;
      this.game.assets.draw(ctx, 'shrine_' + shrine.buffType, rx, ry, 24, 0, 0, alpha);

      // Glowing circle underneath active shrine
      if (shrine.active) {
        ctx.strokeStyle = shrine.buffType === 'haste' ? 'rgba(255, 159, 67, 0.3)' : 
                          shrine.buffType === 'mana' ? 'rgba(16, 172, 132, 0.3)' : 'rgba(255, 71, 87, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rx, ry, shrine.radius + 6, 0, Math.PI*2);
        ctx.stroke();
      }
    });

    // Draw Chests
    this.chests.forEach((chest) => {
      const rx = chest.x - camera.x;
      const ry = chest.y - camera.y;
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(rx, ry + 6, 10, 0, Math.PI*2);
      ctx.fill();

      this.game.assets.draw(ctx, 'item_chest', rx, ry, 20);

      // Progress bar if player is unlocking
      if (chest.unlockTimer < 3.0) {
        const bw = 20;
        const bh = 3;
        const bx = rx - bw/2;
        const by = ry - chest.radius - 6;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(bx, by, bw, bh);

        const pct = (3.0 - chest.unlockTimer) / 3.0;
        ctx.fillStyle = '#eccc68';
        ctx.fillRect(bx, by, bw * pct, bh);
      }
    });

    // Draw obstacles
    this.obstacles.forEach((obs) => {
      const rx = obs.x - camera.x;
      const ry = obs.y - camera.y;
      
      if (obs.type === 'pillar') {
        // Draw pillar base shadow (flat dark rect)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(rx - obs.radius, ry - obs.radius + 6, obs.radius * 2, obs.radius * 2);

        // Draw the stone block (solid fill)
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(rx - obs.radius, ry - obs.radius, obs.radius * 2, obs.radius * 2);

        // Highlight top & left borders (crevice highlights)
        ctx.fillStyle = '#788290';
        ctx.fillRect(rx - obs.radius, ry - obs.radius, obs.radius * 2, 3);
        ctx.fillRect(rx - obs.radius, ry - obs.radius, 3, obs.radius * 2);

        // Shadow bottom & right borders (crevice shadows)
        ctx.fillStyle = '#1c1f26';
        ctx.fillRect(rx - obs.radius, ry + obs.radius - 3, obs.radius * 2, 3);
        ctx.fillRect(rx + obs.radius - 3, ry - obs.radius, 3, obs.radius * 2);

        // Add some pixel crevices lines inside
        ctx.fillStyle = '#22252c';
        ctx.fillRect(rx - obs.radius + 4, ry - obs.radius + 6, obs.radius, 2);
        ctx.fillRect(rx, ry + 2, obs.radius - 2, 2);
      } else if (obs.type === 'explosive_barrel') {
        // Barrel
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(rx - obs.radius, ry - obs.radius + 5, obs.radius*2, obs.radius*2);

        ctx.fillStyle = '#ea8214'; // Orange barrel
        ctx.fillRect(rx - obs.radius, ry - obs.radius, obs.radius*2, obs.radius*2);
        
        // Bands
        ctx.fillStyle = '#374151';
        ctx.fillRect(rx - obs.radius, ry - obs.radius + 4, obs.radius*2, 3);
        ctx.fillRect(rx - obs.radius, ry + obs.radius - 7, obs.radius*2, 3);

        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2;
        ctx.strokeRect(rx - obs.radius, ry - obs.radius, obs.radius*2, obs.radius*2);
      }
    });

    // Draw Event Warning Indicators
    this.meteorIndicators.forEach((met) => {
      const rx = met.x - camera.x;
      const ry = met.y - camera.y;
      
      // Pulse animation
      const scale = 0.8 + Math.sin(met.pulseTimer) * 0.15;
      
      // Select indicator color based on type
      let strokeColor = 'rgba(255, 71, 87, 0.7)'; // red
      let fillColor = 'rgba(255, 71, 87, 0.15)';
      let textColor = '#ff4757';
      
      if (met.type === 'frost') {
        strokeColor = 'rgba(0, 210, 213, 0.7)'; // cyan
        fillColor = 'rgba(0, 210, 213, 0.15)';
        textColor = '#00d2d3';
      } else if (met.type === 'void') {
        strokeColor = 'rgba(165, 94, 234, 0.7)'; // purple
        fillColor = 'rgba(165, 94, 234, 0.15)';
        textColor = '#a55eea';
      }
      
      // Outer warning circle
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(rx, ry, met.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Fill warning circle
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.arc(rx, ry, met.radius * scale, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw retro warning triangle instead of unicode emoji
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(rx, ry - 10); // top point
      ctx.lineTo(rx + 10, ry + 8); // bottom right
      ctx.lineTo(rx - 10, ry + 8); // bottom left
      ctx.closePath();
      
      ctx.fillStyle = '#ff9f43'; // Yellow-orange warning triangle
      ctx.fill();
      
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      // Black exclamation mark "!" in the center
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = '#1e293b';
      ctx.textAlign = 'center';
      ctx.fillText("!", rx, ry + 5);
      ctx.restore();
    });
  }
}
