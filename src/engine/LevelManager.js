/**
 * LevelManager - Manages arenas, waves, spawns, and dynamic events (Meteors, Storms)
 */
import {
  RELICS_CATALOG,
  EQUIPMENT_CATALOG,
  createScaledLootItem,
} from "../entities/Player.js";

const A_STAR_DIRS = [
  { dc: 0, dr: -1, wall: "north" },
  { dc: 0, dr: 1, wall: "south" },
  { dc: 1, dr: 0, wall: "east" },
  { dc: -1, dr: 0, wall: "west" },
];

const WALL_SHEETS = {};
const THEMES = [
  "walls-light",
  "walls-dark",
  "walls-lava",
  "walls-Garden",
  "walls-void",
  "walls-backrooms",
  "walls-underground",
  "walls-pool",
];
let sheetsLoaded = 0;
THEMES.forEach((name) => {
  const img = new Image();
  img.src = `${name}.png`;
  img.onload = () => {
    sheetsLoaded++;
    window.sheetsLoaded = sheetsLoaded;
  };
  WALL_SHEETS[name] = img;
});
let currentTheme = "walls-light";

const THEME_MAPPING = {
  dungeon: "walls-dark",
  underground: "walls-underground",
  volcanic: "walls-lava",
  gardens: "walls-Garden",
  void_rift: "walls-void",
  pool: "walls-pool",
  backrooms: "walls-backrooms",
};

const WALL_TILE_COORDS = {
  fill: [16, 16],
  top: [64, 0],
  bottom: [64, 32],
  left: [0, 16],
  right: [112, 16],
  topLeft: [0, 0],
  topRight: [112, 0],
  bottomLeft: [0, 32],
  bottomRight: [112, 32],
  archTop: [48, 0],
  archBase: [48, 32],
  floor: [0, 64],
};

function getWallTile(neighbors) {
  const { top, bottom, left, right } = neighbors;

  if (top && bottom && left && right) return WALL_TILE_COORDS.fill;
  if (!top && bottom && left && right) return WALL_TILE_COORDS.top;
  if (top && !bottom && left && right) return WALL_TILE_COORDS.bottom;
  if (top && bottom && !left && right) return WALL_TILE_COORDS.left;
  if (top && bottom && left && !right) return WALL_TILE_COORDS.right;
  if (!top && bottom && !left && right) return WALL_TILE_COORDS.topLeft;
  if (!top && bottom && left && !right) return WALL_TILE_COORDS.topRight;
  if (top && !bottom && !left && right) return WALL_TILE_COORDS.bottomLeft;
  if (top && !bottom && left && !right) return WALL_TILE_COORDS.bottomRight;

  return WALL_TILE_COORDS.fill;
}

// Expose variables globally for compatibility and verification
window.WALL_SHEETS = WALL_SHEETS;
window.THEMES = THEMES;
window.sheetsLoaded = sheetsLoaded;
window.currentTheme = currentTheme;
window.WALL_TILE_COORDS = WALL_TILE_COORDS;
window.getWallTile = getWallTile;
window.drawWallTile = function (ctx, col, row, neighbors) {
  const themeName = window.currentTheme || currentTheme;
  const sheet = WALL_SHEETS[themeName];
  if (!sheet) return;
  const [srcX, srcY] = getWallTile(neighbors);
  ctx.drawImage(sheet, srcX, srcY, 16, 16, col * 16, row * 16, 16, 16);
};

export class LevelManager {
  constructor(game) {
    this.game = game;
    this.width = 6000; // Expanded Arena dimensions
    this.height = 6000;
    this.theme = "dungeon";
    this.doors = [];

    // Grid expanding state
    this.unlockedSectors = new Set();
    this.sectorThemes = {};
    this.unlockedDoors = new Set();

    // Wave state
    this.wave = 1;
    this.waveTimer = 30.0; // 30 seconds per wave
    this.maxWave = 10;
    this.waveInProgress = false;
    this.enemiesSpawnedThisWave = 0;
    this.spawnTimer = 0;
    this.spawnInterval = 2.0; // Spawns every 2 seconds
    this.nextWaveElement = null;

    // Arena obstacles
    this.obstacles = [];
    // Navigation graph built during generateObstacles()
    // navCells[c][r] = { c, r, open: { north, south, east, west } }
    this.navCols = 10;
    this.navRows = 10;
    this.navCellSize = 200;
    this.navCells = null;

    this.startSectorX = 0;
    this.startSectorY = 0;
    this._generationValidated = false;

    console.log("[LevelManager] Constructor: initializing obstacles...");
    this.generateObstacles();

    // Interactive elements
    this.chests = [];
    this.shrines = [];

    // Event schedule state
    this.activeEvents = {
      meteors: false,
      storm: false,
    };
    this.eventTimer = 15.0; // Random events every 15s
    this.meteorIndicators = [];
    this.backroomsSecretUnlocked = false;

    // Story & custom triggers
    this.buttons = [];
    this.teleporters = [];
    this.valves = [];
    this.lavaVents = [];
    this.bossTriggers = [];
    this.exitPortal = null;
    this.chapterBatteryCompanion = null;
    this.darknessDrainTimer = 0;
  }

  preGenerateFullMaze() {
    this._generationValidated = false;
    const cols = 120;
    const rows = 120;
    const cellSize = 200;

    this.fullCols = cols;
    this.fullRows = rows;
    this.fullWidth = cols * cellSize;
    this.fullHeight = rows * cellSize;
    this.fullTileWidth = cols * 5;
    this.fullTileHeight = rows * 5;
    this.maxSectorCols = cols / 10;
    this.maxSectorRows = rows / 10;
    this.startSectorX = Math.floor(this.maxSectorCols / 2);
    this.startSectorY = Math.floor(this.maxSectorRows / 2);
    if (!this.unlockedSectors || this.unlockedSectors.size === 0) {
      this.unlockedSectors = new Set([
        `${this.startSectorX},${this.startSectorY}`,
      ]);
    }
    if (!this.sectorThemes || Object.keys(this.sectorThemes).length === 0) {
      this.sectorThemes = {
        [`${this.startSectorX},${this.startSectorY}`]: "dungeon",
      };
    }

    this.fullTileGrid = [];
    if (!this.exploredGrid || this.exploredGrid.length === 0) {
      this.exploredGrid = [];
      for (let x = 0; x < this.fullTileWidth; x++) {
        this.exploredGrid[x] = new Array(this.fullTileHeight).fill(false);
      }
    }
    // Initialize fullTileGrid with all walls (1)
    for (let x = 0; x < this.fullTileWidth; x++) {
      this.fullTileGrid[x] = new Array(this.fullTileHeight).fill(1);
    }

    // Choose 3 distinct sectors (excluding the starting sector) for special rooms
    const specialSectors = [];
    const roomTypes = ["treasure", "shrine", "nest"];
    const startSectorKey = `${this.startSectorX},${this.startSectorY}`;

    while (specialSectors.length < 3) {
      const sx = Math.floor(Math.random() * this.maxSectorCols);
      const sy = Math.floor(Math.random() * this.maxSectorRows);
      const key = `${sx},${sy}`;
      if (
        key !== startSectorKey &&
        !specialSectors.some((s) => s.key === key)
      ) {
        specialSectors.push({
          sx,
          sy,
          type: roomTypes[specialSectors.length],
          key,
        });
      }
    }

    this.fullSpecialRooms = specialSectors.map((s) => {
      return {
        c: s.sx * 10 + 5,
        r: s.sy * 10 + 5,
        type: s.type,
      };
    });

    const carveRect = (tx1, ty1, tx2, ty2, tileType = 0) => {
      for (let x = tx1; x <= tx2; x++) {
        for (let y = ty1; y <= ty2; y++) {
          if (
            x >= 0 &&
            x < this.fullTileWidth &&
            y >= 0 &&
            y < this.fullTileHeight
          ) {
            this.fullTileGrid[x][y] = tileType;
          }
        }
      }
    };

    // Generate sectors
    for (let sx = 0; sx < this.maxSectorCols; sx++) {
      for (let sy = 0; sy < this.maxSectorRows; sy++) {
        // Set sector boundaries as walls in the global fullTileGrid
        // except at the door coordinate 27
        for (let tx = sx * 50; tx < (sx + 1) * 50; tx++) {
          if (tx !== sx * 50 + 27) {
            this.fullTileGrid[tx][sy * 50] = 1;
            this.fullTileGrid[tx][(sy + 1) * 50 - 1] = 1;
          }
        }
        for (let ty = sy * 50; ty < (sy + 1) * 50; ty++) {
          if (ty !== sy * 50 + 27) {
            this.fullTileGrid[sx * 50][ty] = 1;
            this.fullTileGrid[(sx + 1) * 50 - 1][ty] = 1;
          }
        }

        const isSpecial = specialSectors.find(
          (s) => s.sx === sx && s.sy === sy,
        );
        const roomTypeVal = isSpecial ? 2 : 0;

        // Determine theme for this sector (for backrooms maze check)
        const sectorKey = `${sx},${sy}`;
        const sectorTheme =
          (this.sectorThemes && this.sectorThemes[sectorKey]) || "dungeon";

        // Sector-local tile origin
        const ox = sx * 50;
        const oy = sy * 50;

        if (sectorTheme === "backrooms") {
          // ── BACKROOMS: Recursive backtracker maze ──────────────────────
          // Operate on a coarse grid within the 50x50 tile sector
          // Each maze cell = 4 tiles, corridors = 2 tiles wide
          const mazeW = 11; // cells across (11 * 4 = 44 tiles, fits in 50 with borders)
          const mazeH = 11;
          const cellSz = 4; // tiles per cell
          const mazeOx = ox + 3; // offset from sector edge (leave border)
          const mazeOy = oy + 3;

          // Initialize maze cells
          const mazeCells = [];
          for (let mx = 0; mx < mazeW; mx++) {
            mazeCells[mx] = [];
            for (let my = 0; my < mazeH; my++) {
              mazeCells[mx][my] = {
                visited: false,
                walls: { N: true, S: true, E: true, W: true },
              };
            }
          }

          // Recursive backtracker (iterative stack version)
          const stack = [
            { x: Math.floor(mazeW / 2), y: Math.floor(mazeH / 2) },
          ];
          mazeCells[stack[0].x][stack[0].y].visited = true;

          while (stack.length > 0) {
            const cur = stack[stack.length - 1];
            const neighbors = [];
            if (cur.y > 0 && !mazeCells[cur.x][cur.y - 1].visited)
              neighbors.push({ x: cur.x, y: cur.y - 1, wall: "N", opp: "S" });
            if (cur.y < mazeH - 1 && !mazeCells[cur.x][cur.y + 1].visited)
              neighbors.push({ x: cur.x, y: cur.y + 1, wall: "S", opp: "N" });
            if (cur.x > 0 && !mazeCells[cur.x - 1][cur.y].visited)
              neighbors.push({ x: cur.x - 1, y: cur.y, wall: "W", opp: "E" });
            if (cur.x < mazeW - 1 && !mazeCells[cur.x + 1][cur.y].visited)
              neighbors.push({ x: cur.x + 1, y: cur.y, wall: "E", opp: "W" });

            if (neighbors.length > 0) {
              const next =
                neighbors[Math.floor(Math.random() * neighbors.length)];
              mazeCells[cur.x][cur.y].walls[next.wall] = false;
              mazeCells[next.x][next.y].walls[next.opp] = false;
              mazeCells[next.x][next.y].visited = true;
              stack.push({ x: next.x, y: next.y });
            } else {
              stack.pop();
            }
          }

          // Carve maze corridors into tile grid (2-tile-wide passages)
          for (let mx = 0; mx < mazeW; mx++) {
            for (let my = 0; my < mazeH; my++) {
              const cell = mazeCells[mx][my];
              // Carve cell center (2x2 tiles)
              const tcx = mazeOx + mx * cellSz + 1;
              const tcy = mazeOy + my * cellSz + 1;
              carveRect(tcx, tcy, tcx + 1, tcy + 1, 0);

              // Carve passages through open walls
              if (!cell.walls.N)
                carveRect(tcx, tcy - cellSz + 2, tcx + 1, tcy - 1, 0);
              if (!cell.walls.S)
                carveRect(tcx, tcy + 2, tcx + 1, tcy + cellSz - 1, 0);
              if (!cell.walls.W)
                carveRect(tcx - cellSz + 2, tcy, tcx - 1, tcy + 1, 0);
              if (!cell.walls.E)
                carveRect(tcx + 2, tcy, tcx + cellSz - 1, tcy + 1, 0);
            }
          }

          // Carve door connections to sector edges
          const doorTile = 27; // tile offset within sector
          // North door → carve from sector edge to nearest maze cell
          if (sy > 0) carveRect(ox + 26, oy, ox + 28, mazeOy + 2, 0);
          // South door
          if (sy < this.maxSectorRows - 1)
            carveRect(
              ox + 26,
              mazeOy + mazeH * cellSz - 1,
              ox + 28,
              oy + 49,
              0,
            );
          // West door
          if (sx > 0) carveRect(ox, oy + 26, mazeOx + 2, oy + 28, 0);
          // East door
          if (sx < this.maxSectorCols - 1)
            carveRect(
              mazeOx + mazeW * cellSz - 1,
              oy + 26,
              ox + 49,
              oy + 28,
              0,
            );

          // Ensure center area (around tile 27,27) is open for special rooms
          carveRect(ox + 24, oy + 24, ox + 30, oy + 30, roomTypeVal);
        } else {
          // ── STANDARD: Large organic rooms with details ─────────────────
          // 5 rooms: 1 large central hall + 4 cardinal rooms
          const rooms = [];

          // Central hall (large)
          const cwBase = 18 + Math.floor(Math.random() * 9); // 18-26 tiles
          const chBase = 18 + Math.floor(Math.random() * 9);
          rooms.push({
            cx: 25,
            cy: 25, // center of sector (in local coords)
            w: cwBase,
            h: chBase,
            floorType: roomTypeVal,
          });

          // Cardinal rooms (medium)
          const cardinals = [
            { cx: 12, cy: 12 }, // NW
            { cx: 38, cy: 12 }, // NE
            { cx: 12, cy: 38 }, // SW
            { cx: 38, cy: 38 }, // SE
          ];

          for (const card of cardinals) {
            const rw = 10 + Math.floor(Math.random() * 7); // 10-16 tiles
            const rh = 10 + Math.floor(Math.random() * 7);
            rooms.push({
              cx: card.cx,
              cy: card.cy,
              w: rw,
              h: rh,
              floorType: 0,
            });
          }

          // Carve all rooms
          for (const room of rooms) {
            const x1 = ox + room.cx - Math.floor(room.w / 2);
            const y1 = oy + room.cy - Math.floor(room.h / 2);
            const x2 = x1 + room.w - 1;
            const y2 = y1 + room.h - 1;
            carveRect(x1, y1, x2, y2, room.floorType);
          }

          // Organic edge erosion: randomly add/remove 1-2 tiles at room edges
          // Uses a seeded hash to be deterministic per sector
          const erosionSeed = sx * 997 + sy * 1013;
          for (const room of rooms) {
            const x1 = ox + room.cx - Math.floor(room.w / 2);
            const y1 = oy + room.cy - Math.floor(room.h / 2);
            const x2 = x1 + room.w - 1;
            const y2 = y1 + room.h - 1;

            // Erode top and bottom edges
            for (let tx = x1; tx <= x2; tx++) {
              const h1 = (tx * 31 + y1 * 17 + erosionSeed) % 100;
              const h2 = (tx * 37 + y2 * 19 + erosionSeed) % 100;
              if (h1 < 30 && y1 - 1 > oy + 1)
                carveRect(tx, y1 - 1, tx, y1 - 1, room.floorType); // expand top
              if (h1 > 70 && y1 + 1 <= y2) {
                // retract top
                if (
                  tx >= 0 &&
                  tx < this.fullTileWidth &&
                  y1 >= 0 &&
                  y1 < this.fullTileHeight
                )
                  this.fullTileGrid[tx][y1] = 1;
              }
              if (h2 < 30 && y2 + 1 < oy + 49)
                carveRect(tx, y2 + 1, tx, y2 + 1, room.floorType); // expand bottom
              if (h2 > 70 && y2 - 1 >= y1) {
                // retract bottom
                if (
                  tx >= 0 &&
                  tx < this.fullTileWidth &&
                  y2 >= 0 &&
                  y2 < this.fullTileHeight
                )
                  this.fullTileGrid[tx][y2] = 1;
              }
            }
            // Erode left and right edges
            for (let ty = y1; ty <= y2; ty++) {
              const h1 = (x1 * 23 + ty * 41 + erosionSeed) % 100;
              const h2 = (x2 * 29 + ty * 43 + erosionSeed) % 100;
              if (h1 < 30 && x1 - 1 > ox + 1)
                carveRect(x1 - 1, ty, x1 - 1, ty, room.floorType);
              if (h1 > 70 && x1 + 1 <= x2) {
                if (
                  x1 >= 0 &&
                  x1 < this.fullTileWidth &&
                  ty >= 0 &&
                  ty < this.fullTileHeight
                )
                  this.fullTileGrid[x1][ty] = 1;
              }
              if (h2 < 30 && x2 + 1 < ox + 49)
                carveRect(x2 + 1, ty, x2 + 1, ty, room.floorType);
              if (h2 > 70 && x2 - 1 >= x1) {
                if (
                  x2 >= 0 &&
                  x2 < this.fullTileWidth &&
                  ty >= 0 &&
                  ty < this.fullTileHeight
                )
                  this.fullTileGrid[x2][ty] = 1;
              }
            }
          }

          // Carve corridors connecting all cardinal rooms to center
          // Corridor widths vary 3-5 tiles for organic feel
          const corridorPairs = [
            { from: rooms[1], to: rooms[0] }, // NW → center
            { from: rooms[2], to: rooms[0] }, // NE → center
            { from: rooms[3], to: rooms[0] }, // SW → center
            { from: rooms[4], to: rooms[0] }, // SE → center
          ];

          for (let i = 0; i < corridorPairs.length; i++) {
            const fr = corridorPairs[i].from;
            const to = corridorPairs[i].to;
            const cw = 1 + Math.floor((sx * 13 + sy * 7 + i * 31) % 3); // 1-3 half-width → 3-7 total, clamped to 1-2

            // L-shaped corridor: horizontal then vertical
            const midX = ox + to.cx;
            const midY = oy + fr.cy;

            // Horizontal segment
            const hx1 = Math.min(ox + fr.cx, midX);
            const hx2 = Math.max(ox + fr.cx, midX);
            carveRect(hx1, midY - cw, hx2, midY + cw, 0);

            // Vertical segment
            const vy1 = Math.min(midY, oy + to.cy);
            const vy2 = Math.max(midY, oy + to.cy);
            carveRect(midX - cw, vy1, midX + cw, vy2, 0);
          }

          // Also connect cardinal rooms to each other along edges
          // N-rooms horizontal
          carveRect(
            ox + rooms[1].cx,
            oy + 12 - 1,
            ox + rooms[2].cx,
            oy + 12 + 1,
            0,
          );
          // S-rooms horizontal
          carveRect(
            ox + rooms[3].cx,
            oy + 38 - 1,
            ox + rooms[4].cx,
            oy + 38 + 1,
            0,
          );
          // W-rooms vertical
          carveRect(
            ox + 12 - 1,
            oy + rooms[1].cy,
            ox + 12 + 1,
            oy + rooms[3].cy,
            0,
          );
          // E-rooms vertical
          carveRect(
            ox + 38 - 1,
            oy + rooms[2].cy,
            ox + 38 + 1,
            oy + rooms[4].cy,
            0,
          );

          // Carve door corridors to sector edges (3 tiles wide, connect to nearest room)
          // North Door → connects to center (27, 25)
          if (sy > 0) {
            carveRect(ox + 26, oy, ox + 28, oy + 25, 0);
          }
          // South Door → connects to center
          if (sy < this.maxSectorRows - 1) {
            carveRect(ox + 26, oy + 25, ox + 28, oy + 49, 0);
          }
          // West Door → connects to center
          if (sx > 0) {
            carveRect(ox, oy + 26, ox + 25, oy + 28, 0);
          }
          // East Door → connects to center
          if (sx < this.maxSectorCols - 1) {
            carveRect(ox + 25, oy + 26, ox + 49, oy + 28, 0);
          }
        }
      }
    }

    // Compile outer boundaries of the entire world to solid walls
    for (let x = 0; x < this.fullTileWidth; x++) {
      this.fullTileGrid[x][0] = 1;
      this.fullTileGrid[x][this.fullTileHeight - 1] = 1;
    }
    for (let y = 0; y < this.fullTileHeight; y++) {
      this.fullTileGrid[0][y] = 1;
      this.fullTileGrid[this.fullTileWidth - 1][y] = 1;
    }

    // Carve around player if player exists
    if (this.game && this.game.player) {
      const px = this.game.player.x;
      const py = this.game.player.y;
      const pTx = Math.floor(px / 40);
      const pTy = Math.floor(py / 40);
      const carveRadius = 3;
      for (let tx = pTx - carveRadius; tx <= pTx + carveRadius; tx++) {
        for (let ty = pTy - carveRadius; ty <= pTy + carveRadius; ty++) {
          if (
            tx > 0 &&
            tx < this.fullTileWidth - 1 &&
            ty > 0 &&
            ty < this.fullTileHeight - 1
          ) {
            this.fullTileGrid[tx][ty] = 0;
          }
        }
      }
    }

    // Compile cells connectivity for pathfinding navCells
    const cells = [];
    for (let c = 0; c < cols; c++) {
      cells[c] = [];
      for (let r = 0; r < rows; r++) {
        const north = r === 0 || this.fullTileGrid[c * 5 + 2][r * 5] === 1;
        const south =
          r === rows - 1 || this.fullTileGrid[c * 5 + 2][(r + 1) * 5] === 1;
        const west = c === 0 || this.fullTileGrid[c * 5][r * 5 + 2] === 1;
        const east =
          c === cols - 1 || this.fullTileGrid[(c + 1) * 5][r * 5 + 2] === 1;

        cells[c][r] = {
          c,
          r,
          visited: true,
          walls: { north, south, east, west },
        };
      }
    }
    this.fullNavCells = cells;

    // Pre-generate explosive barrels
    this.fullExplosiveBarrels = [];
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const cx = (c + 0.5) * cellSize;
        const cy = (r + 0.5) * cellSize;
        if (Math.hypot(cx - this.fullWidth / 2, cy - this.fullHeight / 2) < 200)
          continue;
        if (this.fullTileGrid[c * 5 + 2][r * 5 + 2] === 1) continue;

        if (Math.random() < 0.12) {
          const bx = cx + (Math.random() - 0.5) * 60;
          const by = cy + (Math.random() - 0.5) * 60;
          const bTx = Math.floor(bx / 40);
          const bTy = Math.floor(by / 40);
          if (
            bTx > 0 &&
            bTx < this.fullTileWidth - 1 &&
            bTy > 0 &&
            bTy < this.fullTileHeight - 1
          ) {
            if (this.fullTileGrid[bTx][bTy] === 1) continue;
          }
          let overlap = false;
          for (const b of this.fullExplosiveBarrels) {
            if (Math.hypot(b.x - bx, b.y - by) < 40) {
              overlap = true;
              break;
            }
          }
          if (!overlap) {
            this.fullExplosiveBarrels.push({
              x: bx,
              y: by,
              radius: 12,
              type: "explosive_barrel",
            });
          }
        }
      }
    }

    // Make the spawn area immediately discovered
    const spawnCenterX = this.startSectorX * 50 + 27;
    const spawnCenterY = this.startSectorY * 50 + 27;
    const spawnRadius = 5;
    for (
      let tx = spawnCenterX - spawnRadius - 2;
      tx <= spawnCenterX + spawnRadius + 2;
      tx++
    ) {
      for (
        let ty = spawnCenterY - spawnRadius - 2;
        ty <= spawnCenterY + spawnRadius + 2;
        ty++
      ) {
        if (
          tx >= 0 &&
          tx < this.fullTileWidth &&
          ty >= 0 &&
          ty < this.fullTileHeight
        ) {
          this.exploredGrid[tx][ty] = true;
        }
      }
    }
    this.mapRevealed = true;
  }

  getSpawnPoint() {
    if (this.game.isStoryMode || this.game.isCustomLevel) {
      return {
        x: this.game.playerSpawnX || 1000,
        y: this.game.playerSpawnY || 1000,
      };
    }
    return {
      x: this.startSectorX * 2000 + 1080,
      y: this.startSectorY * 2000 + 1080,
    };
  }

  activateBackroomsSecret() {
    this.backroomsSecretUnlocked = true;

    if (this.sectorThemes) {
      for (const key of Object.keys(this.sectorThemes)) {
        this.sectorThemes[key] = "backrooms";
      }
    }

    if (this.game.player) {
      const currentSx = Math.max(
        0,
        Math.min(this.maxSectorCols - 1, Math.floor(this.game.player.x / 2000)),
      );
      const currentSy = Math.max(
        0,
        Math.min(this.maxSectorRows - 1, Math.floor(this.game.player.y / 2000)),
      );
      this.sectorThemes[`${currentSx},${currentSy}`] = "backrooms";
      this.theme = "backrooms";
    }

    this.generateObstacles();

    if (this.game && this.game.unlockAchievement) {
      this.game.unlockAchievement("the_glitched");
    }

    if (this.game && this.game.particles && this.game.player) {
      this.game.particles.spawnText(
        this.game.player.x,
        this.game.player.y - 50,
        "BACKROOMS ONLINE",
        {
          color: "#ffeaa7",
          fontSize: 12,
          fontPixel: true,
          life: 3.0,
        },
      );
    }
  }

  generateObstacles(retryCount = 0) {
    if (retryCount === 0) {
      this._generationValidated = false;
    }
    if (!this.fullTileGrid) {
      this.preGenerateFullMaze();
    }

    this.allObstacles = [];

    // In Story mode or Custom Builder mode, load layout directly
    if (this.game.isStoryMode || this.game.isCustomLevel) {
      this.theme = this.game.loadedLevelTheme || "dungeon";
      this.sectorThemes = { "0,0": this.theme };
      this.unlockedSectors = new Set(["0,0"]);
      this.maxSectorCols = 1;
      this.maxSectorRows = 1;
      this.navCols = 10;
      this.navRows = 10;
      this.navCellSize = 200;
      this.width = 2000;
      this.height = 2000;
      this.tileWidth = 50;
      this.tileHeight = 50;

      this.navCells = [];
      for (let c = 0; c < 10; c++) {
        this.navCells[c] = [];
        for (let r = 0; r < 10; r++) {
          this.navCells[c][r] = {
            c,
            r,
            visited: true,
            walls: { north: false, south: false, east: false, west: false },
          };
        }
      }

      this.tileGrid = [];
      for (let x = 0; x < 50; x++) {
        this.tileGrid[x] = new Array(50).fill(0);
      }

      this.chests = [];
      this.shrines = [];
      this.buttons = [];
      this.teleporters = [];
      this.valves = [];
      this.lavaVents = [];
      this.bossTriggers = [];
      this.customEnemySpawns = [];
      this.exitPortal = null;
      this.chapterBatteryCompanion = null;

      const layout = this.game.loadedLevelLayout;
      if (layout) {
        for (let ty = 0; ty < 50; ty++) {
          const rowStr = layout[ty] || "#".repeat(50);
          for (let tx = 0; tx < 50; tx++) {
            const char = rowStr[tx] || ".";

            if (char === "#" || char === "1") {
              this.tileGrid[tx][ty] = 1; // Wall
            } else {
              this.tileGrid[tx][ty] = 0; // Floor
            }

            const worldX = tx * 40 + 20;
            const worldY = ty * 40 + 20;

            if (char === "P") {
              this.game.playerSpawnX = worldX;
              this.game.playerSpawnY = worldY;
            } else if (char === "C") {
              this.chests.push({
                x: worldX,
                y: worldY,
                radius: 12,
                unlockTimer: 3.0,
              });
            } else if (char === "H") {
              const buffType =
                this.shrines.length % 3 === 0
                  ? "fire"
                  : this.shrines.length % 3 === 1
                    ? "frost"
                    : "void";
              this.shrines.push({
                x: worldX,
                y: worldY,
                radius: 12,
                buffType,
                active: true,
                cooldown: 0,
              });
            } else if (char === "S") {
              this.buttons.push({
                x: worldX,
                y: worldY,
                radius: 14,
                active: false,
                id: `btn_${this.buttons.length}`,
              });
            } else if (char === "D") {
              const doorObst = {
                x: worldX,
                y: worldY,
                radius: 20,
                type: "door",
                id: `door_${this.allObstacles.length}`,
                closed: true,
              };
              this.allObstacles.push(doorObst);
            } else if (char === "T") {
              this.teleporters.push({
                x: worldX,
                y: worldY,
                radius: 14,
                cooldown: 0,
              });
            } else if (char === "L") {
              this.lavaVents.push({
                x: worldX,
                y: worldY,
                radius: 16,
                active: false,
                eruptionTimer: 2.0 + Math.random() * 2.0,
              });
            } else if (char === "V") {
              this.valves.push({
                x: worldX,
                y: worldY,
                radius: 16,
                interactionTimer: 0,
                cooled: false,
              });
            } else if (char === "B") {
              this.bossTriggers.push({
                x: worldX,
                y: worldY,
                radius: 25,
                active: false,
                spawned: false,
              });
            } else if (char === "e") {
              this.customEnemySpawns.push({
                x: worldX,
                y: worldY,
                type: "slime",
              });
            } else if (char === "k") {
              this.customEnemySpawns.push({
                x: worldX,
                y: worldY,
                type: "skeleton",
              });
            } else if (char === "r") {
              this.customEnemySpawns.push({
                x: worldX,
                y: worldY,
                type: "horror",
              });
            }
          }
        }
      }

      // Link teleporters in a ring
      if (this.teleporters.length > 1) {
        for (let i = 0; i < this.teleporters.length; i++) {
          const nextIdx = (i + 1) % this.teleporters.length;
          this.teleporters[i].targetX = this.teleporters[nextIdx].x;
          this.teleporters[i].targetY = this.teleporters[nextIdx].y;
        }
      }

      // Fill walls
      for (let tx = 0; tx < 50; tx++) {
        for (let ty = 0; ty < 50; ty++) {
          if (this.tileGrid[tx][ty] === 1) {
            this.allObstacles.push({
              x: tx * 40 + 20,
              y: ty * 40 + 20,
              radius: 20,
              type: "pillar",
            });
          }
        }
      }

      this.exploredGrid = [];
      for (let x = 0; x < 50; x++) {
        this.exploredGrid[x] = new Array(50).fill(false);
      }

      const spTx = Math.floor((this.game.playerSpawnX || 1000) / 40);
      const spTy = Math.floor((this.game.playerSpawnY || 1000) / 40);
      const spawnRadius = 5;
      for (let tx = spTx - spawnRadius; tx <= spTx + spawnRadius; tx++) {
        for (let ty = spTy - spawnRadius; ty <= spTy + spawnRadius; ty++) {
          if (tx >= 0 && tx < 50 && ty >= 0 && ty < 50) {
            this.exploredGrid[tx][ty] = true;
          }
        }
      }

      this.obstacles = [...this.allObstacles];
      this.specialRooms = [];
      this._generationValidated = true;
      return;
    }

    // Regular gameplay: Expanded 12x12 sectors grid layout
    this.navCols = 120;
    this.navRows = 120;
    this.navCellSize = 200;
    this.width = 24000;
    this.height = 24000;
    this.tileWidth = 600;
    this.tileHeight = 600;

    this.navCells = [];
    for (let c = 0; c < this.navCols; c++) {
      this.navCells[c] = [];
      const sx = Math.floor(c / 10);
      for (let r = 0; r < this.navRows; r++) {
        const sy = Math.floor(r / 10);
        const sectorKey = `${sx},${sy}`;
        const isUnlocked = this.unlockedSectors.has(sectorKey);

        if (!isUnlocked) {
          this.navCells[c][r] = {
            c,
            r,
            visited: false,
            walls: { north: true, south: true, east: true, west: true },
          };
          continue;
        }

        const fullCell = this.fullNavCells[c][r];
        let north = fullCell.walls.north;
        let south = fullCell.walls.south;
        let east = fullCell.walls.east;
        let west = fullCell.walls.west;

        // 1. North boundary of sector (sy * 10)
        if (r === sy * 10) {
          const neighborSy = sy - 1;
          const isNeighborUnlocked =
            neighborSy >= 0 && this.unlockedSectors.has(`${sx},${neighborSy}`);
          if (!isNeighborUnlocked) {
            north = true;
          } else {
            if (c === sx * 10 + 5) {
              const doorKey = `${sx * 50 + 27},${sy * 50}`;
              const doorUnlocked = this.unlockedDoors.has(doorKey);
              north = !doorUnlocked;
            } else {
              north = true;
            }
          }
        }

        // 2. South boundary of sector (sy * 10 + 9)
        if (r === sy * 10 + 9) {
          const neighborSy = sy + 1;
          const isNeighborUnlocked =
            neighborSy < this.maxSectorRows &&
            this.unlockedSectors.has(`${sx},${neighborSy}`);
          if (!isNeighborUnlocked) {
            south = true;
          } else {
            if (c === sx * 10 + 5) {
              const doorKey = `${sx * 50 + 27},${sy * 50 + 49}`;
              const doorUnlocked = this.unlockedDoors.has(doorKey);
              south = !doorUnlocked;
            } else {
              south = true;
            }
          }
        }

        // 3. West boundary of sector (sx * 10)
        if (c === sx * 10) {
          const neighborSx = sx - 1;
          const isNeighborUnlocked =
            neighborSx >= 0 && this.unlockedSectors.has(`${neighborSx},${sy}`);
          if (!isNeighborUnlocked) {
            west = true;
          } else {
            if (r === sy * 10 + 5) {
              const doorKey = `${sx * 50},${sy * 50 + 27}`;
              const doorUnlocked = this.unlockedDoors.has(doorKey);
              west = !doorUnlocked;
            } else {
              west = true;
            }
          }
        }

        // 4. East boundary of sector (sx * 10 + 9)
        if (c === sx * 10 + 9) {
          const neighborSx = sx + 1;
          const isNeighborUnlocked =
            neighborSx < this.maxSectorCols &&
            this.unlockedSectors.has(`${neighborSx},${sy}`);
          if (!isNeighborUnlocked) {
            east = true;
          } else {
            if (r === sy * 10 + 5) {
              const doorKey = `${sx * 50 + 49},${sy * 50 + 27}`;
              const doorUnlocked = this.unlockedDoors.has(doorKey);
              east = !doorUnlocked;
            } else {
              east = true;
            }
          }
        }

        this.navCells[c][r] = {
          c,
          r,
          visited: true,
          walls: { north, south, east, west },
        };
      }
    }

    // Initialize tileGrid for the entire active maze region
    this.tileGrid = [];
    for (let x = 0; x < this.tileWidth; x++) {
      this.tileGrid[x] = new Array(this.tileHeight).fill(1); // solid walls by default
    }

    // Copy the active portions of fullTileGrid into tileGrid
    for (let tx = 0; tx < this.tileWidth; tx++) {
      const sx = Math.floor(tx / 50);
      for (let ty = 0; ty < this.tileHeight; ty++) {
        const sy = Math.floor(ty / 50);
        const sectorKey = `${sx},${sy}`;

        if (this.unlockedSectors.has(sectorKey)) {
          this.tileGrid[tx][ty] = this.fullTileGrid[tx][ty];

          // Apply sector boundary walls

          // 1. North edge
          if (ty === sy * 50) {
            const neighborSy = sy - 1;
            const neighborUnlocked =
              neighborSy >= 0 &&
              this.unlockedSectors.has(`${sx},${neighborSy}`);
            if (!neighborUnlocked) {
              if (this.tileGrid[tx][ty] !== 3) this.tileGrid[tx][ty] = 1;
            } else {
              if (tx >= sx * 50 + 26 && tx <= sx * 50 + 28) {
                const doorKey = `${sx * 50 + 27},${ty}`;
                const doorUnlocked = this.unlockedDoors.has(doorKey);
                this.tileGrid[tx][ty] = doorUnlocked ? 0 : 3;
              } else {
                if (this.tileGrid[tx][ty] !== 3) this.tileGrid[tx][ty] = 1;
              }
            }
          }

          // 2. South edge
          if (ty === sy * 50 + 49) {
            const neighborSy = sy + 1;
            const neighborUnlocked =
              neighborSy < this.maxSectorRows &&
              this.unlockedSectors.has(`${sx},${neighborSy}`);
            if (!neighborUnlocked) {
              if (this.tileGrid[tx][ty] !== 3) this.tileGrid[tx][ty] = 1;
            } else {
              if (tx >= sx * 50 + 26 && tx <= sx * 50 + 28) {
                const doorKey = `${sx * 50 + 27},${ty}`;
                const doorUnlocked = this.unlockedDoors.has(doorKey);
                this.tileGrid[tx][ty] = doorUnlocked ? 0 : 3;
              } else {
                if (this.tileGrid[tx][ty] !== 3) this.tileGrid[tx][ty] = 1;
              }
            }
          }

          // 3. West edge
          if (tx === sx * 50) {
            const neighborSx = sx - 1;
            const neighborUnlocked =
              neighborSx >= 0 &&
              this.unlockedSectors.has(`${neighborSx},${sy}`);
            if (!neighborUnlocked) {
              if (this.tileGrid[tx][ty] !== 3) this.tileGrid[tx][ty] = 1;
            } else {
              if (ty >= sy * 50 + 26 && ty <= sy * 50 + 28) {
                const doorKey = `${tx},${sy * 50 + 27}`;
                const doorUnlocked = this.unlockedDoors.has(doorKey);
                this.tileGrid[tx][ty] = doorUnlocked ? 0 : 3;
              } else {
                if (this.tileGrid[tx][ty] !== 3) this.tileGrid[tx][ty] = 1;
              }
            }
          }

          // 4. East edge
          if (tx === sx * 50 + 49) {
            const neighborSx = sx + 1;
            const neighborUnlocked =
              neighborSx < this.maxSectorCols &&
              this.unlockedSectors.has(`${neighborSx},${sy}`);
            if (!neighborUnlocked) {
              if (this.tileGrid[tx][ty] !== 3) this.tileGrid[tx][ty] = 1;
            } else {
              if (ty >= sy * 50 + 26 && ty <= sy * 50 + 28) {
                const doorKey = `${tx},${sy * 50 + 27}`;
                const doorUnlocked = this.unlockedDoors.has(doorKey);
                this.tileGrid[tx][ty] = doorUnlocked ? 0 : 3;
              } else {
                if (this.tileGrid[tx][ty] !== 3) this.tileGrid[tx][ty] = 1;
              }
            }
          }
        }
      }
    }

    // Set Door Portals at unlocked sector boundaries (excluding unlocked doors)
    this.doors = [];
    for (const sectorKey of this.unlockedSectors) {
      const [sx, sy] = sectorKey.split(",").map(Number);

      // North Door
      if (sy > 0) {
        const doorTx = sx * 50 + 27;
        const doorTy = sy * 50;
        const doorKey = `${doorTx},${doorTy}`;
        if (
          !this.unlockedDoors.has(doorKey) &&
          !this.unlockedSectors.has(`${sx},${sy - 1}`)
        ) {
          this.doors.push({
            tx: doorTx,
            ty: doorTy,
            dir: "North",
            x: (doorTx + 0.5) * 40,
            y: (doorTy + 0.5) * 40,
          });
        }
      }
      // South Door
      if (sy < this.maxSectorRows - 1) {
        const doorTx = sx * 50 + 27;
        const doorTy = sy * 50 + 49;
        const doorKey = `${doorTx},${doorTy}`;
        if (
          !this.unlockedDoors.has(doorKey) &&
          !this.unlockedSectors.has(`${sx},${sy + 1}`)
        ) {
          this.doors.push({
            tx: doorTx,
            ty: doorTy,
            dir: "South",
            x: (doorTx + 0.5) * 40,
            y: (doorTy + 0.5) * 40,
          });
        }
      }
      // West Door
      if (sx > 0) {
        const doorTx = sx * 50;
        const doorTy = sy * 50 + 27;
        const doorKey = `${doorTx},${doorTy}`;
        if (
          !this.unlockedDoors.has(doorKey) &&
          !this.unlockedSectors.has(`${sx - 1},${sy}`)
        ) {
          this.doors.push({
            tx: doorTx,
            ty: doorTy,
            dir: "West",
            x: (doorTx + 0.5) * 40,
            y: (doorTy + 0.5) * 40,
          });
        }
      }
      // East Door
      if (sx < this.maxSectorCols - 1) {
        const doorTx = sx * 50 + 49;
        const doorTy = sy * 50 + 27;
        const doorKey = `${doorTx},${doorTy}`;
        if (
          !this.unlockedDoors.has(doorKey) &&
          !this.unlockedSectors.has(`${sx + 1},${sy}`)
        ) {
          this.doors.push({
            tx: doorTx,
            ty: doorTy,
            dir: "East",
            x: (doorTx + 0.5) * 40,
            y: (doorTy + 0.5) * 40,
          });
        }
      }
    }

    // Set tileGrid values for doors so they render and behave correctly (3 tiles wide)
    this.doors.forEach((d) => {
      if (d.dir === "North" || d.dir === "South") {
        this.tileGrid[d.tx - 1][d.ty] = 3;
        this.tileGrid[d.tx][d.ty] = 3;
        this.tileGrid[d.tx + 1][d.ty] = 3;
      } else {
        this.tileGrid[d.tx][d.ty - 1] = 3;
        this.tileGrid[d.tx][d.ty] = 3;
        this.tileGrid[d.tx][d.ty + 1] = 3;
      }
    });

    // Connectivity Check: BFS flood-fill from player position or spawn center
    // to find all reachable floor tiles, converting unreachable floor pockets into solid walls (1).
    let startTx = this.startSectorX * 50 + 27;
    let startTy = this.startSectorY * 50 + 27;
    if (this.game.player) {
      startTx = Math.max(
        0,
        Math.min(this.tileWidth - 1, Math.floor(this.game.player.x / 40)),
      );
      startTy = Math.max(
        0,
        Math.min(this.tileHeight - 1, Math.floor(this.game.player.y / 40)),
      );
    }

    // Ensure the start position itself is not inside a wall (fallback if it is)
    if (this.tileGrid[startTx][startTy] === 1) {
      startTx = this.startSectorX * 50 + 27;
      startTy = this.startSectorY * 50 + 27;
    }

    console.log(
      `[LevelManager] BFS start tile: (${startTx}, ${startTy}), val: ${this.tileGrid[startTx][startTy]}`,
    );

    const queue = [{ x: startTx, y: startTy }];
    const visited = [];
    for (let x = 0; x < this.tileWidth; x++) {
      visited[x] = new Array(this.tileHeight).fill(false);
    }
    visited[startTx][startTy] = true;

    let head = 0;
    let reachableCount = 1;
    while (head < queue.length) {
      const curr = queue[head++];
      const dirs = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
      ];
      for (const d of dirs) {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;
        if (nx >= 0 && nx < this.tileWidth && ny >= 0 && ny < this.tileHeight) {
          if (!visited[nx][ny]) {
            const tileVal = this.tileGrid[nx][ny];
            // 0 = floor, 2 = runic, 3 = door.
            // Note: we can pass through doors too!
            if (tileVal === 0 || tileVal === 2 || tileVal === 3) {
              visited[nx][ny] = true;
              queue.push({ x: nx, y: ny });
              reachableCount++;
            }
          }
        }
      }
    }
    console.log(
      `[LevelManager] BFS finished. Reachable tiles: ${reachableCount}`,
    );

    // For each door, if it is not reached by BFS, carve a corridor inward into the active sector
    if (this.doors) {
      this.doors.forEach((door) => {
        let reached = false;
        if (door.dir === "North" || door.dir === "South") {
          reached =
            visited[door.tx - 1][door.ty] ||
            visited[door.tx][door.ty] ||
            visited[door.tx + 1][door.ty];
        } else {
          reached =
            visited[door.tx][door.ty - 1] ||
            visited[door.tx][door.ty] ||
            visited[door.tx][door.ty + 1];
        }

        if (!reached) {
          console.log(
            `[LevelManager] Door at (${door.tx}, ${door.ty}) not reachable. Carving corridor...`,
          );
          let currX = door.tx;
          let currY = door.ty;
          let stepX = 0;
          let stepY = 0;

          if (door.dir === "North") stepY = 1;
          else if (door.dir === "South") stepY = -1;
          else if (door.dir === "West") stepX = 1;
          else if (door.dir === "East") stepX = -1;

          for (let i = 0; i < 100; i++) {
            currX += stepX;
            currY += stepY;

            if (
              currX < 0 ||
              currX >= this.tileWidth ||
              currY < 0 ||
              currY >= this.tileHeight
            ) {
              break;
            }

            // Carve 3 tiles wide
            if (stepY !== 0) {
              for (let dx = -1; dx <= 1; dx++) {
                const cx = currX + dx;
                if (cx >= 0 && cx < this.tileWidth) {
                  this.tileGrid[cx][currY] = 0; // Clear to floor
                  visited[cx][currY] = true;
                }
              }
            } else {
              for (let dy = -1; dy <= 1; dy++) {
                const cy = currY + dy;
                if (cy >= 0 && cy < this.tileHeight) {
                  this.tileGrid[currX][cy] = 0; // Clear to floor
                  visited[currX][cy] = true;
                }
              }
            }

            // Check neighbors to see if we connected to a visited tile (not including the path we came from)
            let hitVisited = false;
            const checkDirs = [
              { dx: 0, dy: -1 },
              { dx: 0, dy: 1 },
              { dx: -1, dy: 0 },
              { dx: 1, dy: 0 },
            ];

            const checkCoords = [];
            if (stepY !== 0) {
              for (let dx = -1; dx <= 1; dx++) {
                const cx = currX + dx;
                if (cx >= 0 && cx < this.tileWidth) {
                  checkCoords.push({ cx, cy: currY });
                }
              }
            } else {
              for (let dy = -1; dy <= 1; dy++) {
                const cy = currY + dy;
                if (cy >= 0 && cy < this.tileHeight) {
                  checkCoords.push({ cx: currX, cy });
                }
              }
            }

            for (const coord of checkCoords) {
              for (const cd of checkDirs) {
                const nx = coord.cx + cd.dx;
                const ny = coord.cy + cd.dy;
                // Exclude the slice we came from
                if (
                  stepY !== 0 &&
                  nx >= currX - stepX - 1 &&
                  nx <= currX - stepX + 1 &&
                  ny === currY - stepY
                )
                  continue;
                if (
                  stepX !== 0 &&
                  ny >= currY - stepY - 1 &&
                  ny <= currY - stepY + 1 &&
                  nx === currX - stepX
                )
                  continue;

                if (
                  nx >= 0 &&
                  nx < this.tileWidth &&
                  ny >= 0 &&
                  ny < this.tileHeight
                ) {
                  if (visited[nx][ny] && this.tileGrid[nx][ny] !== 1) {
                    hitVisited = true;
                    break;
                  }
                }
              }
              if (hitVisited) break;
            }

            if (hitVisited) {
              break;
            }
          }

          // Mark all 3 tiles of the door portal as visited
          if (door.dir === "North" || door.dir === "South") {
            visited[door.tx - 1][door.ty] = true;
            visited[door.tx][door.ty] = true;
            visited[door.tx + 1][door.ty] = true;
          } else {
            visited[door.tx][door.ty - 1] = true;
            visited[door.tx][door.ty] = true;
            visited[door.tx][door.ty + 1] = true;
          }
        }
      });
    }

    // Now convert any unvisited floor tile into a solid wall (1)
    // CRITICAL: NEVER convert tile type 3 (Door) into a wall, as it is the ONLY way between sectors.
    let convertedCount = 0;
    for (let tx = 0; tx < this.tileWidth; tx++) {
      for (let ty = 0; ty < this.tileHeight; ty++) {
        const tileVal = this.tileGrid[tx][ty];
        if ((tileVal === 0 || tileVal === 2) && !visited[tx][ty]) {
          this.tileGrid[tx][ty] = 1;
          convertedCount++;
        }
      }
    }
    console.log(
      `[LevelManager] Converted ${convertedCount} unreachable floor tiles to walls.`,
    );

    // Store visited grid for spawn checking
    this.reachableGrid = visited;

    // Hollow out massive solid blocks of walls (Disabled to prevent unreachable pocket rooms)
    // this.hollowSolidWalls();

    // Reconstruct physics obstacles (pillars) for active region (surface/boundary walls only)
    this.allObstacles = [];
    const dirs = [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
    ];
    for (let tx = 0; tx < this.tileWidth; tx++) {
      for (let ty = 0; ty < this.tileHeight; ty++) {
        if (this.tileGrid[tx][ty] === 1) {
          let isBoundary = false;
          for (const d of dirs) {
            const nx = tx + d.x;
            const ny = ty + d.y;
            if (
              nx >= 0 &&
              nx < this.tileWidth &&
              ny >= 0 &&
              ny < this.tileHeight
            ) {
              const val = this.tileGrid[nx][ny];
              if (val === 0 || val === 2 || val === 3) {
                isBoundary = true;
                break;
              }
            } else {
              isBoundary = true;
              break;
            }
          }
          if (isBoundary) {
            this.allObstacles.push({
              x: tx * 40 + 20,
              y: ty * 40 + 20,
              radius: 20,
              type: "pillar",
            });
          }
        }
      }
    }

    // Add explosive barrels that fall inside the unlocked regions
    if (this.fullExplosiveBarrels) {
      for (const barrel of this.fullExplosiveBarrels) {
        const tx = Math.floor(barrel.x / 40);
        const ty = Math.floor(barrel.y / 40);
        const sx = Math.floor(tx / 50);
        const sy = Math.floor(ty / 50);
        if (this.unlockedSectors.has(`${sx},${sy}`)) {
          if (tx % 50 > 0 && tx % 50 < 49 && ty % 50 > 0 && ty % 50 < 49) {
            this.allObstacles.push(barrel);
          }
        }
      }
    }

    // If the BFS had to remove a huge chunk of the unlocked zone, rebuild once.
    const activeFloorTiles = this.tileGrid.reduce((sum, column) => {
      let local = 0;
      for (let i = 0; i < column.length; i++) {
        if (column[i] === 0 || column[i] === 2 || column[i] === 3) local++;
      }
      return sum + local;
    }, 0);
    const tooMuchIsolation =
      !this._generationValidated &&
      retryCount < 2 &&
      convertedCount > Math.max(700, Math.floor(activeFloorTiles * 0.35));
    if (tooMuchIsolation) {
      console.log(
        `[LevelManager] Regenerating maze due to excessive unreachable area (${convertedCount} converted / ${activeFloorTiles} active).`,
      );
      this.preGenerateFullMaze();
      return this.generateObstacles(retryCount + 1);
    }
    this._generationValidated = true;

    // Initialize active obstacles with dynamic render distance filter
    if (this.game.player && this.allObstacles) {
      const px = this.game.player.x;
      const py = this.game.player.y;
      const distCutoff = this.game.renderDistance || 1200;
      const distCutoffSq = (distCutoff + 200) ** 2;
      this.obstacles = this.allObstacles.filter((obs) => {
        const dx = obs.x - px;
        const dy = obs.y - py;
        return dx * dx + dy * dy <= distCutoffSq;
      });
    } else {
      this.obstacles = [...this.allObstacles];
    }

    // Filter special rooms that are inside unlocked sectors
    this.specialRooms = this.fullSpecialRooms.filter((room) => {
      const sx = Math.floor(room.c / 10);
      const sy = Math.floor(room.r / 10);
      return this.unlockedSectors.has(`${sx},${sy}`);
    });
  }

  hollowSolidWalls() {
    if (!this.tileGrid) return;
    const newGrid = [];
    for (let x = 0; x < this.tileWidth; x++) {
      newGrid[x] = [...this.tileGrid[x]];
    }

    for (let tx = 1; tx < this.tileWidth - 1; tx++) {
      const sx = Math.floor(tx / 50);
      for (let ty = 1; ty < this.tileHeight - 1; ty++) {
        const sy = Math.floor(ty / 50);

        // Only hollow out walls in unlocked sectors.
        // Unexplored/locked sectors must remain filled solid walls.
        if (!this.unlockedSectors.has(`${sx},${sy}`)) {
          continue;
        }

        if (this.tileGrid[tx][ty] === 1) {
          // Check if it and all 8 neighbors are walls
          let surrounded = true;
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              if (this.tileGrid[tx + dx][ty + dy] !== 1) {
                surrounded = false;
                break;
              }
            }
            if (!surrounded) break;
          }
          if (surrounded) {
            newGrid[tx][ty] = 0; // Hollow it out to floor
          }
        }
      }
    }
    this.tileGrid = newGrid;
  }

  // ── Navigation helpers ──────────────────────────────────────────────────

  /** World position → cell coords (clamped) */
  worldToCell(wx, wy) {
    const c = Math.max(
      0,
      Math.min(this.navCols - 1, Math.floor(wx / this.navCellSize)),
    );
    const r = Math.max(
      0,
      Math.min(this.navRows - 1, Math.floor(wy / this.navCellSize)),
    );
    return { c, r };
  }

  /** Cell coords → world centre of that cell */
  cellCenter(c, r) {
    return {
      x: (c + 0.5) * this.navCellSize,
      y: (r + 0.5) * this.navCellSize,
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

    const open = [];
    const openMap = new Map();
    const closed = new Set();

    const startNode = {
      c: sc.c,
      r: sc.r,
      g: 0,
      f: Math.abs(sc.c - gc.c) + Math.abs(sc.r - gc.r),
      parent: null,
    };
    open.push(startNode);
    openMap.set(sc.c * this.navRows + sc.r, startNode);

    let iterations = 0;

    while (open.length > 0) {
      iterations++;
      if (iterations > 200) {
        break;
      }

      // Pick lowest-f node without splice-heavy sorted-array maintenance
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const best = open[bestIdx];
      open[bestIdx] = open[open.length - 1];
      open.pop();

      const bestKey = best.c * this.navRows + best.r;
      openMap.delete(bestKey);
      closed.add(bestKey);

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
          if (
            Math.hypot(firstWp.x - startCenter.x, firstWp.y - startCenter.y) < 1
          ) {
            waypoints.shift();
          }
        }
        return waypoints;
      }

      // Expand neighbours through open walls
      const cell = this.navCells[best.c][best.r];

      for (let i = 0; i < 4; i++) {
        const dir = A_STAR_DIRS[i];
        if (cell.walls[dir.wall]) continue; // wall present — not passable
        const nc = best.c + dir.dc;
        const nr = best.r + dir.dr;
        if (nc < 0 || nr < 0 || nc >= this.navCols || nr >= this.navRows)
          continue;
        const nk = nc * this.navRows + nr;
        if (closed.has(nk)) continue;

        const g = best.g + 1;
        const f = g + Math.abs(nc - gc.c) + Math.abs(nr - gc.r);

        if (!openMap.has(nk)) {
          const neighbor = { c: nc, r: nr, g, f, parent: best };
          open.push(neighbor);
          openMap.set(nk, neighbor);
        } else {
          const existing = openMap.get(nk);
          if (existing.g > g) {
            existing.g = g;
            existing.f = f;
            existing.parent = best;
          }
        }
      }
    }

    // No path found or iteration limit reached
    return [];
  }

  startNextWave() {
    const isFirstWave = this.wave === 1;

    // Regenerate obstacles (which updates active bounds) for the new wave size
    this.generateObstacles();

    if (isFirstWave) {
      // Reset player position to center of the new map only on wave 1
      const spawnPoint = this.getSpawnPoint();
      this.game.player.x = spawnPoint.x;
      this.game.player.y = spawnPoint.y;
      this.game.player.vx = 0;
      this.game.player.vy = 0;

      // Reset camera instantly to player center
      this.game.camera.x = this.game.player.x - this.game.canvas.width / 2;
      this.game.camera.y = this.game.player.y - this.game.canvas.height / 2;

      // Clear chests/shrines/room trackers on first wave
      this.chests = [];
      this.shrines = [];
      this.spawnedSpecialRooms = new Set();
    } else {
      // Wave > 1: player stays where they are!
      this.game.player.vx = 0;
      this.game.player.vy = 0;
    }

    // Clear active projectiles and area effects
    this.game.projectiles = [];
    this.game.areaEffects = [];

    this.waveInProgress = true;
    this.waveTimer = 30.0;
    this.enemiesSpawnedThisWave = 0;
    this.spawnTimer = 0;

    // Wave spawning density tuning
    this.spawnInterval = Math.max(0.4, 2.0 - this.wave * 0.15);
    if (this.wave >= 10) {
      this.spawnInterval /= 2.0; // Double spawn rate
    }

    this.game.particles.spawnText(
      this.game.player.x,
      this.game.player.y - 40,
      `WAVE ${this.wave} BEGINS`,
      {
        color: "#fff",
        fontSize: 16,
        fontPixel: true,
        life: 2.0,
      },
    );

    // Spawn special rooms contents (only newly entered ones)
    this.spawnSpecialRoomsContents();

    // Spawn 1 chest and 1 shrine per wave in the active area
    this.spawnChest();
    this.spawnShrine();

    // Spawn the elite room guards
    this.specialSpawns.forEach((spawn) => {
      this.game.spawnEnemy(spawn.x, spawn.y, spawn.type);
    });

    // Handle background level sound cues or screen flashes
    this.game.screenShake = 10;
  }

  spawnSpecialRoomsContents() {
    this.specialSpawns = [];
    if (!this.specialRooms) return;

    this.spawnedSpecialRooms = this.spawnedSpecialRooms || new Set();

    for (const room of this.specialRooms) {
      const roomKey = `${room.c},${room.r}`;
      if (this.spawnedSpecialRooms.has(roomKey)) continue;
      this.spawnedSpecialRooms.add(roomKey);

      const cx = (room.c + 0.5) * this.navCellSize;
      const cy = (room.r + 0.5) * this.navCellSize;

      if (room.type === "treasure") {
        // Spawn 2 special chests in the Treasury!
        this.chests.push({
          x: cx - 20,
          y: cy,
          radius: 12,
          unlockTimer: 2.0,
          isSpecial: true,
        });
        this.chests.push({
          x: cx + 20,
          y: cy,
          radius: 12,
          unlockTimer: 2.0,
          isSpecial: true,
        });
      } else if (room.type === "shrine") {
        // Spawn a guaranteed shrine in the center!
        const types = ["haste", "mana", "damage"];
        const buffType = types[Math.floor(Math.random() * types.length)];
        this.shrines.push({
          x: cx,
          y: cy,
          radius: 16,
          buffType,
          cooldown: 0,
          pulseTimer: 0,
        });
      } else if (room.type === "nest") {
        // Spawn 1 special chest and queue 1 elite enemy spawner
        this.chests.push({
          x: cx - 25,
          y: cy,
          radius: 12,
          unlockTimer: 2.0,
          isSpecial: true,
        });

        const eliteTypes = ["slime_elite", "skeleton_elite", "horror_elite"];
        const eliteType =
          eliteTypes[Math.floor(Math.random() * eliteTypes.length)];
        this.specialSpawns.push({ x: cx + 25, y: cy, type: eliteType });
      }
    }
  }

  spawnChest(specificSectorKey = null) {
    let px = 0,
      py = 0;
    let valid = false;
    let attempts = 0;

    const unlockedList = Array.from(this.unlockedSectors);
    const chosenSectorKey =
      specificSectorKey ||
      unlockedList[Math.floor(Math.random() * unlockedList.length)];
    const [sx, sy] = chosenSectorKey.split(",").map(Number);
    const minX = sx * 2000 + 100;
    const maxX = (sx + 1) * 2000 - 100;
    const minY = sy * 2000 + 100;
    const maxY = (sy + 1) * 2000 - 100;

    while (!valid && attempts < 100) {
      px = minX + Math.random() * (maxX - minX);
      py = minY + Math.random() * (maxY - minY);
      attempts++;

      // Check distance to player
      const pdist = Math.hypot(
        this.game.player.x - px,
        this.game.player.y - py,
      );
      if (pdist < 200) continue;

      const tx = Math.floor(px / 40);
      const ty = Math.floor(py / 40);
      if (tx < 0 || tx >= this.tileWidth || ty < 0 || ty >= this.tileHeight)
        continue;
      if (this.tileGrid[tx][ty] !== 0) continue;
      if (this.reachableGrid && !this.reachableGrid[tx][ty]) continue;

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

  spawnShrine(specificSectorKey = null) {
    let px = 0,
      py = 0;
    let valid = false;
    let attempts = 0;

    const unlockedList = Array.from(this.unlockedSectors);
    const chosenSectorKey =
      specificSectorKey ||
      unlockedList[Math.floor(Math.random() * unlockedList.length)];
    const [sx, sy] = chosenSectorKey.split(",").map(Number);
    const minX = sx * 2000 + 100;
    const maxX = (sx + 1) * 2000 - 100;
    const minY = sy * 2000 + 100;
    const maxY = (sy + 1) * 2000 - 100;

    while (!valid && attempts < 100) {
      px = minX + Math.random() * (maxX - minX);
      py = minY + Math.random() * (maxY - minY);
      attempts++;

      // Check distance to player
      const pdist = Math.hypot(
        this.game.player.x - px,
        this.game.player.y - py,
      );
      if (pdist < 200) continue;

      const tx = Math.floor(px / 40);
      const ty = Math.floor(py / 40);
      if (tx < 0 || tx >= this.tileWidth || ty < 0 || ty >= this.tileHeight)
        continue;
      if (this.tileGrid[tx][ty] !== 0) continue;
      if (this.reachableGrid && !this.reachableGrid[tx][ty]) continue;

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
      const types = ["haste", "mana", "damage"];
      const buffType = types[Math.floor(Math.random() * types.length)];
      this.shrines.push({
        x: px,
        y: py,
        radius: 12,
        buffType,
        active: true,
        cooldown: 0,
      });
    }
  }

  update(dt) {
    if (this.game.isStoryMode || this.game.isCustomLevel) {
      this.updateStoryOrCustomLevel(dt);
      this.updateInteractives(dt);
      return;
    }

    // Dynamic theme update based on player position
    if (this.game.player && this.sectorThemes) {
      const currentSx = Math.max(
        0,
        Math.min(this.maxSectorCols - 1, Math.floor(this.game.player.x / 2000)),
      );
      const currentSy = Math.max(
        0,
        Math.min(this.maxSectorRows - 1, Math.floor(this.game.player.y / 2000)),
      );
      this.theme = this.sectorThemes[`${currentSx},${currentSy}`] || "dungeon";

      // Void Rift mechanic: Spawns periodic singularities near the player
      if (this.theme === "void_rift") {
        this.voidSingularityTimer = (this.voidSingularityTimer || 5.0) - dt;
        if (this.voidSingularityTimer <= 0) {
          this.voidSingularityTimer = 5.0 + Math.random() * 3.0; // every 5-8s
          const offsetX = (Math.random() - 0.5) * 600;
          const offsetY = (Math.random() - 0.5) * 600;
          const sx = this.game.player.x + offsetX;
          const sy = this.game.player.y + offsetY;
          this.game.spawnAreaEffect(sx, sy, 80, "singularity", 3.0);
          if (this.game.particles) {
            this.game.particles.spawnText(sx, sy - 20, "VOID INTRUSION", {
              color: "#a55eea",
              fontSize: 10,
              fontPixel: true,
              life: 1.5,
            });
          }
        }
      }
    }

    // Dynamic filtering of active obstacles based on player proximity
    if (this.game.player && this.allObstacles) {
      const px = this.game.player.x;
      const py = this.game.player.y;
      const moved =
        !this._lastObsPx ||
        Math.abs(px - this._lastObsPx) > 60 ||
        Math.abs(py - this._lastObsPy) > 60;
      const renderDistanceChanged =
        this.game.renderDistance !== this._lastRenderDistance;
      if (moved || renderDistanceChanged || !this.obstacles) {
        this._lastObsPx = px;
        this._lastObsPy = py;
        this._lastRenderDistance = this.game.renderDistance;
        const distCutoffSq = ((this.game.renderDistance || 1200) + 200) ** 2;
        if (!this.obstacles) this.obstacles = [];
        this.obstacles.length = 0;
        for (const obs of this.allObstacles) {
          const dx = obs.x - px;
          const dy = obs.y - py;
          if (dx * dx + dy * dy <= distCutoffSq) {
            this.obstacles.push(obs);
          }
        }
      }
    }

    // Dynamic enemy unloading and teleportation
    if (this.game.player && this.game.enemies) {
      const px = this.game.player.x;
      const py = this.game.player.y;
      const renderDistance = this.game.renderDistance || 1200;
      const unloadCutoff = renderDistance + 200;
      const unloadCutoffSq = unloadCutoff * unloadCutoff;

      for (let i = 0; i < this.game.enemies.length; i++) {
        // Stagger checking: spread A* and collision loop checks across frames
        if ((this.game.frameCount + i) % 12 !== 0) continue;

        const enemy = this.game.enemies[i];
        if (enemy.dead) continue;
        if (enemy.type === "archon" || enemy.spriteKey === "boss_archon")
          continue;

        const edx = enemy.x - px;
        const edy = enemy.y - py;
        const distSq = edx * edx + edy * edy;

        if (distSq > unloadCutoffSq) {
          // Unloaded! Teleport closer to player (between 350px and renderDistance)
          let targetX = px;
          let targetY = py;
          let found = false;

          for (let attempt = 0; attempt < 10; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 350 + Math.random() * (renderDistance - 350);
            targetX = px + Math.cos(angle) * dist;
            targetY = py + Math.sin(angle) * dist;

            const tx = Math.floor(targetX / 40);
            const ty = Math.floor(targetY / 40);

            if (
              tx >= 0 &&
              tx < this.tileWidth &&
              ty >= 0 &&
              ty < this.tileHeight
            ) {
              if (this.tileGrid[tx][ty] === 0) {
                // Check obstacle overlap
                let overlap = false;
                for (const obs of this.obstacles) {
                  if (obs.type === "pillar") {
                    const dx = targetX - obs.x;
                    const dy = targetY - obs.y;
                    const minDist = obs.radius + enemy.radius;
                    if (dx * dx + dy * dy < minDist * minDist) {
                      overlap = true;
                      break;
                    }
                  }
                }
                if (!overlap) {
                  found = true;
                  break;
                }
              }
            }
          }

          if (found) {
            // Teleport the enemy!
            enemy.x = targetX;
            enemy.y = targetY;
            // Reset A* path target/state so it re-routes immediately
            enemy._path = [];
            enemy._pathTimer = 0;

            // Spawn visual teleport wisp particles at new location
            if (this.game.particles) {
              this.game.particles.createExplosion(
                targetX,
                targetY,
                "#7d5fff",
                8,
                40,
                1.5,
              );
            }
          }
        }
      }
    }

    // Door proximity and unlock checks
    if (this.doors && this.game.player && this.game.state === "PLAYING") {
      this.doors.forEach((door) => {
        const dist = Math.hypot(
          this.game.player.x - door.x,
          this.game.player.y - door.y,
        );
        if (dist < 55) {
          if (this.game.player.keys > 0) {
            this.transitionToNewArea(door);
          } else {
            if (
              !this._lastDoorWarnTime ||
              Date.now() - this._lastDoorWarnTime > 1500
            ) {
              this.game.particles.spawnText(
                door.x,
                door.y - 20,
                "LOCKED: NEED RUNE KEY",
                { color: "#ff4757", fontSize: 10, fontPixel: true },
              );
              this._lastDoorWarnTime = Date.now();
            }
          }
        }
      });
    }

    // Uncover fog of war around player (only when tile position changes)
    if (this.game.player && this.exploredGrid) {
      const px = Math.floor(this.game.player.x / 40);
      const py = Math.floor(this.game.player.y / 40);
      if (this._lastFogTx !== px || this._lastFogTy !== py) {
        this._lastFogTx = px;
        this._lastFogTy = py;
        const radius = 5;
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dy = -radius; dy <= radius; dy++) {
            const tx = px + dx;
            const ty = py + dy;
            if (
              tx >= 0 &&
              tx < this.tileWidth &&
              ty >= 0 &&
              ty < this.tileHeight
            ) {
              this.exploredGrid[tx][ty] = true;
            }
          }
        }
      }
    }

    if (!this.waveInProgress) return;

    // Advance wave countdown
    if (this.waveTimer > 0) {
      this.waveTimer -= dt;
      if (this.waveTimer < 0) this.waveTimer = 0;
    }

    // Check wave end conditions (Time is up AND no enemies left)
    if (this.waveTimer === 0 && this.game.enemies.length === 0) {
      this.waveInProgress = false;
      this.nextWaveElement = null; // Reset element chosen by chat for the next wave

      // Grant bonus Aether Shards for survival
      const shardBonus = 5 + this.wave * 2;
      this.game.player.shards += shardBonus;
      this.game.player.ap += 1; // Gain 1 Ability Point per wave completion

      this.game.particles.spawnText(
        this.game.player.x,
        this.game.player.y - 30,
        `WAVE COMPLETED! +${shardBonus} Shards`,
        {
          color: "#2ed573",
          fontSize: 12,
          fontPixel: true,
          life: 2.5,
        },
      );

      // Grant Rune Key (except in tutorial)
      if (!this.game.isTutorial) {
        this.game.player.keys = (this.game.player.keys || 0) + 1;
        this.game.particles.spawnText(
          this.game.player.x,
          this.game.player.y - 12,
          `ACQUIRED RUNE KEY!`,
          {
            color: "#f1c40f",
            fontSize: 11,
            fontPixel: true,
            life: 2.5,
          },
        );
        if (this.game.audio) this.game.audio.playUnlock();
      }

      // Check First Weave achievement
      if (this.wave === 1 && !this.game.isTutorial) {
        this.game.unlockAchievement("first_weave");
      }

      // Save game state
      this.game.player.saveGameState();

      // Trigger Runic Shop overlay!
      this.game.setState("SHOP");
      if (this.game.twitchManager && this.game.twitchManager.connected) {
        this.game.twitchManager.sendMessage(
          `[Aetherweaver] Wave ${this.wave} completed successfully! Streamer is now upgrading in the Runic Shop. Prepare for Wave ${this.wave + 1}!`,
        );
      }
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

  updateStoryOrCustomLevel(dt) {
    if (!this.game.player) return;
    const player = this.game.player;

    // Uncover fog of war around player in story/custom mode
    if (this.exploredGrid) {
      const px = Math.floor(player.x / 40);
      const py = Math.floor(player.y / 40);
      if (this._lastFogTx !== px || this._lastFogTy !== py) {
        this._lastFogTx = px;
        this._lastFogTy = py;
        const radius = 5;
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dy = -radius; dy <= radius; dy++) {
            const tx = px + dx;
            const ty = py + dy;
            if (
              tx >= 0 &&
              tx < this.tileWidth &&
              ty >= 0 &&
              ty < this.tileHeight
            ) {
              this.exploredGrid[tx][ty] = true;
            }
          }
        }
      }
    }

    // 1. Teleporters Cooldowns and Overlaps
    if (this.teleporters) {
      this.teleporters.forEach((tp) => {
        if (tp.cooldown > 0) tp.cooldown -= dt;

        const dist = Math.hypot(player.x - tp.x, player.y - tp.y);
        if (dist < 22 && tp.cooldown <= 0) {
          // Send to linked teleporter
          if (tp.targetX !== undefined) {
            tp.cooldown = 1.2;
            this.game.particles.createExplosion(
              player.x,
              player.y,
              "#a55eea",
              15,
              60,
              2.0,
            );

            player.x = tp.targetX;
            player.y = tp.targetY;

            this.game.particles.createExplosion(
              player.x,
              player.y,
              "#a55eea",
              15,
              60,
              2.0,
            );
            if (this.game.audio) this.game.audio.playCollect();
            this.game.particles.spawnText(
              player.x,
              player.y - 40,
              "VOID SHIFT!",
              { color: "#a55eea", fontSize: 10, fontPixel: true },
            );

            // Set cooldown on the target teleporter as well
            const targetTp = this.teleporters.find(
              (t) => t.x === tp.targetX && t.y === tp.targetY,
            );
            if (targetTp) targetTp.cooldown = 1.2;
          }
        }
      });
    }

    // 2. Buttons / Switches
    if (this.buttons) {
      let activeCount = 0;
      this.buttons.forEach((btn) => {
        const dist = Math.hypot(player.x - btn.x, player.y - btn.y);
        if (dist < 18) {
          if (!btn.active) {
            btn.active = true;
            this.game.particles.createExplosion(
              btn.x,
              btn.y,
              "#2ed573",
              8,
              30,
              1.2,
            );
            if (this.game.audio) this.game.audio.playCollect();
            this.game.particles.spawnText(
              btn.x,
              btn.y - 20,
              "SWITCH ACTIVATED!",
              { color: "#2ed573", fontSize: 9, fontPixel: true },
            );
          }
        }
        if (btn.active) activeCount++;
      });

      // Chapter 1 Puzzle: Stand on all 3 buttons to unlock boss doors
      if (this.game.isStoryMode && this.game.storyChapter === 1) {
        if (activeCount >= 3) {
          let doorUnlocked = false;
          this.allObstacles.forEach((obs) => {
            if (obs.type === "door" && obs.closed) {
              obs.closed = false;
              doorUnlocked = true;
              this.game.particles.createExplosion(
                obs.x,
                obs.y,
                "#2ed573",
                25,
                90,
                2.5,
              );
            }
          });
          if (doorUnlocked) {
            this.obstacles = this.allObstacles.filter(
              (o) => o.type !== "door" || o.closed,
            );
            if (this.game.audio) this.game.audio.playUnlock();
            this.game.particles.spawnText(
              player.x,
              player.y - 60,
              "RUNE GATES OPENED!",
              { color: "#2ed573", fontSize: 12, fontPixel: true },
            );
          }
        }
      }
    }

    // 3. Shrines Order Puzzle (Chapter 2)
    if (this.game.isStoryMode && this.game.storyChapter === 2) {
      this.shrineSequence = this.shrineSequence || [];
      this.shrines.forEach((shrine) => {
        if (shrine.active) {
          const dist = Math.hypot(player.x - shrine.x, player.y - shrine.y);
          if (dist < 22) {
            shrine.active = false;
            this.shrineSequence.push(shrine.buffType);
            this.game.particles.createExplosion(
              shrine.x,
              shrine.y,
              "#f1c40f",
              12,
              50,
              1.5,
            );
            if (this.game.audio) this.game.audio.playClick();

            const step = this.shrineSequence.length - 1;
            const targetSeq = ["fire", "frost", "void"];
            if (shrine.buffType === targetSeq[step]) {
              this.game.particles.spawnText(
                shrine.x,
                shrine.y - 20,
                `${shrine.buffType.toUpperCase()} ALIGNED!`,
                { color: "#2ecc71", fontSize: 10, fontPixel: true },
              );

              if (this.shrineSequence.length === 3) {
                let doorUnlocked = false;
                this.allObstacles.forEach((obs) => {
                  if (obs.type === "door" && obs.closed) {
                    obs.closed = false;
                    doorUnlocked = true;
                    this.game.particles.createExplosion(
                      obs.x,
                      obs.y,
                      "#2ed573",
                      25,
                      90,
                      2.5,
                    );
                  }
                });
                if (doorUnlocked) {
                  this.obstacles = this.allObstacles.filter(
                    (o) => o.type !== "door" || o.closed,
                  );
                  if (this.game.audio) this.game.audio.playUnlock();
                  this.game.particles.spawnText(
                    player.x,
                    player.y - 60,
                    "GARDEN SEAL BROKEN!",
                    { color: "#2ed573", fontSize: 12, fontPixel: true },
                  );
                }
              }
            } else {
              // Incorrect sequence: Reset and punish
              this.game.particles.spawnText(
                shrine.x,
                shrine.y - 20,
                "MISALIGNMENT: RESET!",
                { color: "#ff4757", fontSize: 11, fontPixel: true },
              );
              if (this.game.audio) this.game.audio.playHurt();

              this.shrineSequence = [];
              this.shrines.forEach((s) => (s.active = true));

              for (let i = 0; i < 3; i++) {
                const angle = (i / 3) * Math.PI * 2;
                this.game.spawnEnemy(
                  shrine.x + Math.cos(angle) * 80,
                  shrine.y + Math.sin(angle) * 80,
                  "slime",
                );
              }
            }
          }
        }
      });
    }

    // 4. Chapter 3 Battery Companion (Darkness health drain)
    if (this.game.isStoryMode && this.game.storyChapter === 3) {
      if (!this.chapterBatteryCompanion) {
        const bx = this.game.playerSpawnX || 1000;
        const by = this.game.playerSpawnY || 1000;
        this.chapterBatteryCompanion = {
          x: bx,
          y: by,
          vx: 0,
          vy: 0,
          radius: 10,
        };
      }

      const companion = this.chapterBatteryCompanion;
      const cDist = Math.hypot(player.x - companion.x, player.y - companion.y);
      if (cDist > 60) {
        const angle = Math.atan2(
          player.y - companion.y,
          player.x - companion.x,
        );
        companion.vx = Math.cos(angle) * 130;
        companion.vy = Math.sin(angle) * 130;
      } else {
        companion.vx *= 0.8;
        companion.vy *= 0.8;
      }
      companion.x += companion.vx * dt;
      companion.y += companion.vy * dt;

      if (Math.random() < 0.2 && this.game.particles) {
        this.game.particles.spawn(companion.x, companion.y, {
          color: "#70a1ff",
          speed: 20,
          life: 0.8,
          size: 2,
        });
      }

      if (cDist > 160) {
        this.darknessDrainTimer = (this.darknessDrainTimer || 0) + dt;
        if (this.darknessDrainTimer >= 0.5) {
          this.darknessDrainTimer = 0;
          player.hp = Math.max(1, player.hp - 2);
          player.mp = Math.max(0, player.mp - 4);
          this.game.particles.spawnText(
            player.x,
            player.y - 30,
            "OUT OF LIGHT: DRAINING!",
            { color: "#ff4757", fontSize: 10, fontPixel: true },
          );
          if (this.game.particles) {
            this.game.particles.createExplosion(
              player.x,
              player.y,
              "#8e44ad",
              4,
              15,
              0.7,
            );
          }
        }
      } else {
        this.darknessDrainTimer = 0;
      }
    }

    // 5. Chapter 4 Lava Vents & Cooling Valves
    if (this.game.isStoryMode && this.game.storyChapter === 4) {
      if (this.lavaVents) {
        this.lavaVents.forEach((vent) => {
          vent.eruptionTimer -= dt;
          if (vent.eruptionTimer <= 0) {
            vent.eruptionTimer = 3.0 + Math.random() * 2.0;
            this.game.spawnAreaEffect(vent.x, vent.y, 60, "lava_fire", 2.0);
            this.game.particles.createExplosion(
              vent.x,
              vent.y,
              "#ff9f43",
              15,
              70,
              1.8,
            );
            if (this.game.audio) this.game.audio.playExplosion();
          }
        });
      }

      if (this.valves) {
        let cooledCount = 0;
        this.valves.forEach((valve) => {
          if (!valve.cooled) {
            const dist = Math.hypot(player.x - valve.x, player.y - valve.y);
            if (dist < 24) {
              valve.interactionTimer += dt;
              if (Math.random() < 0.25) {
                this.game.particles.spawn(
                  valve.x + (Math.random() - 0.5) * 20,
                  valve.y - 10,
                  { color: "#54a0ff", speed: 30, life: 0.6, size: 2.5 },
                );
              }
              if (valve.interactionTimer >= 3.0) {
                valve.cooled = true;
                this.game.particles.createExplosion(
                  valve.x,
                  valve.y,
                  "#54a0ff",
                  20,
                  80,
                  2.0,
                );
                if (this.game.audio) this.game.audio.playUnlock();
                this.game.particles.spawnText(
                  valve.x,
                  valve.y - 25,
                  "VALVE STABILIZED!",
                  { color: "#54a0ff", fontSize: 10, fontPixel: true },
                );
              }
            } else {
              valve.interactionTimer = Math.max(0, valve.interactionTimer - dt);
            }
          } else {
            cooledCount++;
          }
        });

        if (cooledCount >= 3) {
          let doorUnlocked = false;
          this.allObstacles.forEach((obs) => {
            if (obs.type === "door" && obs.closed) {
              obs.closed = false;
              doorUnlocked = true;
              this.game.particles.createExplosion(
                obs.x,
                obs.y,
                "#2ed573",
                25,
                90,
                2.5,
              );
            }
          });
          if (doorUnlocked) {
            this.obstacles = this.allObstacles.filter(
              (o) => o.type !== "door" || o.closed,
            );
            if (this.game.audio) this.game.audio.playUnlock();
            this.game.particles.spawnText(
              player.x,
              player.y - 60,
              "CORE ROOM UNLOCKED!",
              { color: "#2ed573", fontSize: 12, fontPixel: true },
            );
          }
        }
      }
    }

    // 6. Boss spawner triggers
    if (this.bossTriggers) {
      this.bossTriggers.forEach((trig) => {
        if (!trig.spawned) {
          const dist = Math.hypot(player.x - trig.x, player.y - trig.y);
          if (dist < 45) {
            trig.spawned = true;

            // Lock entrance gates
            let doorLocked = false;
            this.allObstacles.forEach((obs) => {
              if (obs.type === "door" && !obs.closed) {
                const dDist = Math.hypot(obs.x - trig.x, obs.y - trig.y);
                if (dDist < 160) {
                  obs.closed = true;
                  doorLocked = true;
                  this.game.particles.createExplosion(
                    obs.x,
                    obs.y,
                    "#ff4757",
                    20,
                    80,
                    2.0,
                  );
                }
              }
            });
            if (doorLocked) {
              this.obstacles = [...this.allObstacles];
            }

            let bossType = "horror";
            if (this.game.isStoryMode) {
              if (this.game.storyChapter === 1) bossType = "skeleton_king";
              else if (this.game.storyChapter === 2) bossType = "spore_blossom";
              else if (this.game.storyChapter === 3) bossType = "shadow_lurker";
              else if (this.game.storyChapter === 4)
                bossType = "flame_colossus";
              else if (this.game.storyChapter === 5) bossType = "void_archmage";
            }
            this.game.spawnEnemy(trig.x, trig.y, bossType);
            this.game.particles.spawnText(
              trig.x,
              trig.y - 60,
              "BOSS ENCOUNTER!",
              { color: "#ff4757", fontSize: 14, fontPixel: true },
            );
          }
        }
      });
    }

    // 7. Exit Portal Interaction
    if (this.exitPortal) {
      const dist = Math.hypot(
        player.x - this.exitPortal.x,
        player.y - this.exitPortal.y,
      );
      if (dist < 26) {
        this.game.triggerStoryWin();
      }
    }
  }

  updateInteractives(dt) {
    // Update Shrines
    this.shrines.forEach((shrine) => {
      if (shrine.cooldown > 0) {
        shrine.cooldown -= dt;
        if (shrine.cooldown <= 0) {
          shrine.active = true;
          this.game.particles.createExplosion(
            shrine.x,
            shrine.y,
            "#7d5fff",
            10,
            50,
            1.5,
          );
        }
      } else {
        // Player interaction with active shrine
        const dist = Math.hypot(
          this.game.player.x - shrine.x,
          this.game.player.y - shrine.y,
        );
        if (dist < 22 && shrine.active) {
          shrine.active = false;
          shrine.cooldown = 35.0; // 35s cooldown

          // Apply buff to player
          this.game.player.applyBuff(shrine.buffType, 12.0); // 12 seconds buff

          if (this.game.audio) this.game.audio.playUnlock();

          const colorMap = {
            haste: "#ff9f43",
            mana: "#10ac84",
            damage: "#ff4757",
          };
          this.game.particles.createExplosion(
            shrine.x,
            shrine.y,
            colorMap[shrine.buffType],
            20,
            90,
            3,
          );
        }
      }
    });

    // Update Chests
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const chest = this.chests[i];
      const dist = Math.hypot(
        this.game.player.x - chest.x,
        this.game.player.y - chest.y,
      );

      if (dist < 30) {
        // Player unlocking chest
        chest.unlockTimer -= dt;

        // Spawn lockpicking wisp particles
        if (Math.random() < 0.25) {
          this.game.particles.spawn(
            chest.x + (Math.random() - 0.5) * 20,
            chest.y + (Math.random() - 0.5) * 20,
            {
              vx: 0,
              vy: -30,
              color: "#eccc68",
              size: 1.5,
              life: 0.4,
              glow: true,
            },
          );
        }

        if (chest.unlockTimer <= 0) {
          // Open chest — give shards immediately, then show GUI for item selection
          this.game.player.shards += 40;
          this.game.score += 400;

          if (this.game.audio) this.game.audio.playBuy();

          this.game.particles.spawnText(
            chest.x,
            chest.y - 20,
            "CHEST OPENED! +40 Shards",
            {
              color: "#eccc68",
              fontSize: 10,
              fontPixel: true,
            },
          );
          this.game.particles.createExplosion(
            chest.x,
            chest.y,
            "#eccc68",
            25,
            120,
            3,
          );

          // Build loot pool: always 2 random items (relic or gear) to choose from
          const combinedPool = [...RELICS_CATALOG, ...EQUIPMENT_CATALOG];
          const loot = [];
          const used = new Set();
          const numOffers = chest.isSpecial ? 3 : 2;
          for (let n = 0; n < numOffers; n++) {
            let idx;
            let attempts = 0;
            do {
              idx = Math.floor(Math.random() * combinedPool.length);
              attempts++;
            } while (used.has(idx) && attempts < 20);
            used.add(idx);
            loot.push(combinedPool[idx]);
          }

          // Spawn chest loot directly on the ground!
          loot.forEach((item) => {
            this.game.spawnItem(
              chest.x + (Math.random() - 0.5) * 16,
              chest.y + (Math.random() - 0.5) * 16,
              "relic",
              createScaledLootItem(item, this.wave),
            );
          });

          this.chests.splice(i, 1);
        }
      } else {
        // Reset timer slowly if player walks away
        if (chest.unlockTimer < 3.0)
          chest.unlockTimer = Math.min(3.0, chest.unlockTimer + dt);
      }
    }
  }

  /**
   * Spawn a random enemy based on the current wave difficulty
   */
  spawnEnemy() {
    let sx = 0;
    let sy = 0;

    // Gather all floor tile candidates within the active render distance, but outside the screen view
    const candidates = [];
    const playerX = this.game.player.x;
    const playerY = this.game.player.y;
    const maxDist = this.game.renderDistance || 1200;
    const minDist = 350; // Just off-screen

    for (let tx = 0; tx < this.tileWidth; tx++) {
      const secX = Math.floor(tx / 50);
      for (let ty = 0; ty < this.tileHeight; ty++) {
        const secY = Math.floor(ty / 50);
        if (!this.unlockedSectors.has(`${secX},${secY}`)) continue;

        if (this.tileGrid[tx][ty] === 0) {
          const wx = tx * 40 + 20;
          const wy = ty * 40 + 20;
          const dist = Math.hypot(wx - playerX, wy - playerY);
          if (dist >= minDist && dist <= maxDist) {
            candidates.push({ x: wx, y: wy });
          }
        }
      }
    }

    // Fallback if no tiles fit inside the band
    if (candidates.length === 0) {
      for (let tx = 0; tx < this.tileWidth; tx++) {
        const secX = Math.floor(tx / 50);
        for (let ty = 0; ty < this.tileHeight; ty++) {
          const secY = Math.floor(ty / 50);
          if (!this.unlockedSectors.has(`${secX},${secY}`)) continue;

          if (this.tileGrid[tx][ty] === 0) {
            const wx = tx * 40 + 20;
            const wy = ty * 40 + 20;
            const dist = Math.hypot(wx - playerX, wy - playerY);
            if (dist > 220) {
              candidates.push({ x: wx, y: wy });
            }
          }
        }
      }
    }

    let spawnPos = null;
    if (candidates.length > 0) {
      spawnPos = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      // Fallback: search for any floor tile in unlocked sectors
      const allFloor = [];
      for (let tx = 0; tx < this.tileWidth; tx++) {
        const secX = Math.floor(tx / 50);
        for (let ty = 0; ty < this.tileHeight; ty++) {
          const secY = Math.floor(ty / 50);
          if (!this.unlockedSectors.has(`${secX},${secY}`)) continue;

          if (this.tileGrid[tx][ty] === 0) {
            allFloor.push({ x: tx * 40 + 20, y: ty * 40 + 20 });
          }
        }
      }
      if (allFloor.length > 0) {
        spawnPos = allFloor[Math.floor(Math.random() * allFloor.length)];
      }
    }

    if (spawnPos) {
      sx = spawnPos.x;
      sy = spawnPos.y;
    } else {
      // Last resort fallback: center of the first unlocked sector
      const unlockedList = Array.from(this.unlockedSectors);
      if (unlockedList.length > 0) {
        const chosenSectorKey = unlockedList[0];
        const [secX, secY] = chosenSectorKey.split(",").map(Number);
        sx = secX * 2000 + 1000;
        sy = secY * 2000 + 1000;
      } else {
        sx = this.width / 2;
        sy = this.height / 2;
      }
    }

    // Choose enemy archetype based on wave
    let type = "slime";
    const roll = Math.random();

    // 15% chance to spawn an Elite starting at wave 3
    const isElite = this.wave >= 3 && Math.random() < 0.15;

    if (this.wave === 1) {
      type = "slime";
    } else if (this.wave === 2) {
      type = roll < 0.7 ? "slime" : "skeleton";
    } else if (this.wave === 3) {
      type = roll < 0.4 ? "slime" : roll < 0.8 ? "skeleton" : "horror";
    } else if (this.wave === 4) {
      type =
        roll < 0.3
          ? "slime"
          : roll < 0.6
            ? "skeleton"
            : roll < 0.9
              ? "horror"
              : "warden";
    } else if (this.wave === 5 && this.enemiesSpawnedThisWave === 0) {
      // BOSS WAVE!
      type = "archon";
    } else if (this.wave === 10 && this.enemiesSpawnedThisWave === 0) {
      // BOSS WAVE!
      type = "volcanic_titan";
    } else if (this.wave === 15 && this.enemiesSpawnedThisWave === 0) {
      // BOSS WAVE!
      type = "void_behemoth";
    } else {
      // Later waves have higher proportions of tough enemies
      // Beyond wave 15, there is a 10% chance to spawn a random boss (if first spawn)
      if (this.wave > 15 && roll < 0.1 && this.enemiesSpawnedThisWave === 0) {
        const bosses = ["archon", "volcanic_titan", "void_behemoth"];
        type = bosses[Math.floor(Math.random() * bosses.length)];
      } else {
        const enemyRoll = Math.random();
        if (enemyRoll < 0.25) type = "slime";
        else if (enemyRoll < 0.55) type = "skeleton";
        else if (enemyRoll < 0.8) type = "horror";
        else type = "warden";
      }
    }

    if (
      isElite &&
      type !== "archon" &&
      type !== "volcanic_titan" &&
      type !== "void_behemoth" &&
      type !== "warden"
    ) {
      type = type + "_elite";
    }

    // Ensure spawn coordinates are not inside any pillar
    for (const obs of this.obstacles) {
      if (obs.type !== "pillar") continue;
      const dist = Math.hypot(sx - obs.x, sy - obs.y);
      const minDistance = obs.radius + 15; // 15px clearance
      if (dist < minDistance) {
        // Push spawn position away from the pillar center
        const angle =
          dist > 0.1
            ? Math.atan2(sy - obs.y, sx - obs.x)
            : Math.random() * Math.PI * 2;
        sx = obs.x + Math.cos(angle) * (minDistance + 5);
        sy = obs.y + Math.sin(angle) * (minDistance + 5);
      }
    }

    // Double-check constraints
    sx = Math.max(60, Math.min(this.width - 60, sx));
    sy = Math.max(60, Math.min(this.height - 60, sy));

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
        const type = met.type || "meteor";
        const dist = Math.hypot(
          this.game.player.x - met.x,
          this.game.player.y - met.y,
        );

        if (type === "meteor") {
          // METEOR STRIKE!
          this.game.particles.createExplosion(
            met.x,
            met.y,
            "#ffa502",
            30,
            200,
            5,
          );
          this.game.screenShake = 15;

          if (dist <= met.radius) {
            this.game.player.takeDamage(30, this.game);
          }

          this.game.enemies.forEach((enemy) => {
            const edist = Math.hypot(enemy.x - met.x, enemy.y - met.y);
            if (edist <= met.radius) {
              enemy.takeDamage(60, false, this.game);
              enemy.applyStatus("fire", 5.0);
            }
          });

          this.game.spawnAreaEffect(
            met.x,
            met.y,
            met.radius - 10,
            "fire_pool",
            3.0,
          );
        } else if (type === "frost") {
          // FROST FISSURES!
          this.game.particles.createExplosion(
            met.x,
            met.y,
            "#00d2d3",
            25,
            120,
            3,
          );
          this.game.screenShake = 5;

          if (dist <= met.radius) {
            this.game.player.takeDamage(20, this.game);
          }

          this.game.enemies.forEach((enemy) => {
            const edist = Math.hypot(enemy.x - met.x, enemy.y - met.y);
            if (edist <= met.radius) {
              enemy.takeDamage(30, false, this.game);
              enemy.applyStatus("frost", 6.0);
            }
          });

          this.game.spawnAreaEffect(
            met.x,
            met.y,
            met.radius,
            "frost_slow",
            4.0,
          );
        } else if (type === "void") {
          // VOID DETONATION!
          this.game.particles.createExplosion(
            met.x,
            met.y,
            "#8c7ae6",
            35,
            180,
            4,
          );
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

          this.game.spawnAreaEffect(
            met.x,
            met.y,
            met.radius + 15,
            "singularity",
            4.0,
          );
        }

        this.meteorIndicators.splice(i, 1);
      }
    }
  }

  triggerMeteorShower() {
    this.game.particles.spawnText(
      this.game.player.x,
      this.game.player.y - 50,
      "HAZARD: METEOR SHOWER DETECTED",
      {
        color: "#ff4757",
        fontSize: 12,
        fontPixel: true,
        life: 3.0,
      },
    );

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
        pulseTimer: 0,
      });
    }
  }

  triggerAetherStorm() {
    this.game.particles.spawnText(
      this.game.player.x,
      this.game.player.y - 50,
      "HAZARD: ELECTROMAGNETIC STORM",
      {
        color: "#f1c40f",
        fontSize: 12,
        fontPixel: true,
        life: 3.0,
      },
    );

    // Spawn multiple rapid lightning bolts on coordinates
    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        if (this.game.state !== "PLAYING") return;

        const tx = this.game.player.x + (Math.random() - 0.5) * 500;
        const ty = this.game.player.y + (Math.random() - 0.5) * 500;

        // Spawn lightning bolt particle
        this.game.particles.createExplosion(tx, ty, "#f1c40f", 15, 120, 2);

        // Deal damage - FIXED reference error
        const dist = Math.hypot(
          this.game.player.x - tx,
          this.game.player.y - ty,
        );
        if (dist < 40) {
          this.game.player.takeDamage(20, this.game);
        }

        this.game.enemies.forEach((enemy) => {
          const edist = Math.hypot(enemy.x - tx, enemy.y - ty);
          if (edist < 40) {
            enemy.takeDamage(40, false, this.game);
            enemy.applyStatus("lightning", 4.0);
          }
        });
      }, i * 400);
    }
  }

  triggerFrostFissures() {
    this.game.particles.spawnText(
      this.game.player.x,
      this.game.player.y - 50,
      "HAZARD: FROST FISSURES DETECTED",
      {
        color: "#00d2d3",
        fontSize: 10,
        fontPixel: true,
        life: 3.0,
      },
    );

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
        type: "frost",
      });
    }
  }

  triggerVoidRifts() {
    this.game.particles.spawnText(
      this.game.player.x,
      this.game.player.y - 50,
      "HAZARD: VOID RIFTS DETECTED",
      {
        color: "#a55eea",
        fontSize: 10,
        fontPixel: true,
        life: 3.0,
      },
    );

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
        type: "void",
      });
    }
  }

  /**
   * Draw procedurally-generated ground flagstones with detail variation
   */
  drawFloor(ctx, camera, canvasWidth, canvasHeight) {
    if (!this.tileGrid) return;

    const tileSize = 40;
    const bounds = this.getNearbyTileBounds();
    if (!bounds) return;
    const { startTx, endTx, startTy, endTy } = bounds;

    const zoom = this.game?.gameZoom || 1.0;
    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    const visibleLeftCam = cx - cx / zoom;
    const visibleRightCam = cx + cx / zoom;
    const visibleTopCam = cy - cy / zoom;
    const visibleBottomCam = cy + cy / zoom;

    for (let tx = startTx; tx <= endTx; tx++) {
      const sx = Math.floor(tx / 50);
      for (let ty = startTy; ty <= endTy; ty++) {
        const sy = Math.floor(ty / 50);
        const theme =
          (this.sectorThemes && this.sectorThemes[`${sx},${sy}`]) || "dungeon";

        // Draw floor if it's a floor tile (0) or door tile (3 - draws floor under the door object)
        if (this.tileGrid[tx][ty] === 0 || this.tileGrid[tx][ty] === 3) {
          const rx = tx * tileSize - camera.x;
          const ry = ty * tileSize - camera.y;

          // Skip tiles fully off-screen
          if (
            rx + tileSize < visibleLeftCam ||
            rx > visibleRightCam ||
            ry + tileSize < visibleTopCam ||
            ry > visibleBottomCam
          )
            continue;

          // Theme coloring & tileset variations to prevent visual uniformity
          const variant = (tx * 7 + ty * 13) % 4;

          let fillStyle = "#121320";
          let strokeStyle = "#0e0f18";
          let crackStyle = "#08090f";
          let dotStyle = "#1d1e2f";

          if (theme === "gardens") {
            fillStyle =
              variant === 1 ? "#1e8544" : variant === 2 ? "#166934" : "#1b7a3e";
            strokeStyle = "#145c2f";
            crackStyle = "#0e3e20";
            dotStyle = "#f1c40f";
          } else if (theme === "underground") {
            fillStyle =
              variant === 1 ? "#563314" : variant === 2 ? "#3f250e" : "#4a2c11";
            strokeStyle = "#331e0b";
            crackStyle = "#1e1106";
            dotStyle = "#5c3715";
          } else if (theme === "pool") {
            fillStyle =
              variant === 1 ? "#2de0e0" : variant === 2 ? "#00a3a4" : "#00d2d3";
            strokeStyle = "#00a8a9";
            crackStyle = "#48dbfb";
            dotStyle = "#b2fefb";
          } else if (theme === "volcanic") {
            fillStyle =
              variant === 1
                ? "#a93226"
                : variant === 2
                  ? "#d35400"
                  : variant === 3
                    ? "#2c1111"
                    : "#c0392b";
            strokeStyle = "#962d22";
            crackStyle = "#7f0000";
            dotStyle = "#f39c12";
          } else if (theme === "void_rift") {
            fillStyle =
              variant === 1 ? "#371c66" : variant === 2 ? "#1c0f33" : "#2c1a4d";
            strokeStyle = "#1c0d35";
            crackStyle = "#4a1268";
            dotStyle = "#8e44ad";
          } else if (theme === "backrooms") {
            fillStyle =
              variant === 1
                ? "#dbbf85"
                : variant === 2
                  ? "#c5ac70"
                  : variant === 3
                    ? "#bfa767"
                    : "#d1b87a";
            strokeStyle = "#b89e5c";
            crackStyle = "#a38b4d";
            dotStyle = "#8f773b";
          } else {
            // dungeon (default)
            fillStyle =
              variant === 1 ? "#161827" : variant === 2 ? "#0d0e17" : "#121320";
          }

          ctx.fillStyle = fillStyle;
          ctx.fillRect(rx, ry, tileSize, tileSize);

          // Extra details for Variant 3 of specific themes
          if (variant === 3) {
            if (theme === "dungeon") {
              ctx.fillStyle = "#1a1c2e"; // subtle brick seam
              ctx.fillRect(rx, ry + 20, tileSize, 1);
            } else if (theme === "gardens") {
              ctx.fillStyle = "#11572b"; // tiny grass blades
              ctx.fillRect(rx + 10, ry + 15, 2, 4);
              ctx.fillRect(rx + 25, ry + 8, 2, 4);
            } else if (theme === "underground") {
              ctx.fillStyle = "#2f1b0a"; // tiny crack detail
              ctx.fillRect(rx + 15, ry + 12, 6, 2);
              ctx.fillRect(rx + 19, ry + 14, 2, 4);
            } else if (theme === "pool") {
              ctx.strokeStyle = "#00b8b9"; // 2x2 grid subdivisions for pool mosaic look
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(rx + 20, ry);
              ctx.lineTo(rx + 20, ry + tileSize);
              ctx.moveTo(rx, ry + 20);
              ctx.lineTo(rx + tileSize, ry + 20);
              ctx.stroke();
            } else if (theme === "volcanic" && fillStyle === "#2c1111") {
              ctx.fillStyle = "#e67e22"; // obsidian ember core
              ctx.fillRect(rx + 19, ry + 19, 2, 2);
            } else if (theme === "void_rift") {
              ctx.fillStyle = "#a55eea"; // stellar dust pixel
              ctx.fillRect(rx + 12, ry + 22, 2, 2);
            }
          }

          // ── Rich per-theme floor decorations (visual only) ──────────
          const hash = (tx * 17 + ty * 31) % 100;
          const hash2 = (tx * 53 + ty * 11) % 100;

          if (theme === "dungeon") {
            // Rubble pile (small cluster of darker pixels)
            if (hash < 8) {
              ctx.fillStyle = "#1e2030";
              ctx.fillRect(rx + 14, ry + 16, 4, 3);
              ctx.fillRect(rx + 16, ry + 14, 3, 2);
              ctx.fillStyle = "#252740";
              ctx.fillRect(rx + 18, ry + 17, 2, 2);
            }
            // Dark stain patch
            if (hash2 < 6) {
              ctx.fillStyle = "rgba(8, 9, 15, 0.4)";
              ctx.fillRect(rx + 8, ry + 10, 10, 8);
            }
            // Cobweb corner hint
            if (hash > 92) {
              ctx.strokeStyle = "rgba(40, 42, 60, 0.5)";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(rx, ry);
              ctx.lineTo(rx + 8, ry + 6);
              ctx.moveTo(rx, ry);
              ctx.lineTo(rx + 6, ry + 8);
              ctx.stroke();
            }
          } else if (theme === "underground") {
            // Mineral vein (thin colored line)
            if (hash < 10) {
              ctx.strokeStyle = "#7d5b3c";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(rx + 5, ry + 12);
              ctx.lineTo(rx + 22, ry + 18);
              ctx.lineTo(rx + 35, ry + 14);
              ctx.stroke();
            }
            // Crystal glint
            if (hash2 < 5) {
              ctx.fillStyle = "#c9a84c";
              ctx.fillRect(rx + 28, ry + 24, 2, 2);
              ctx.fillStyle = "#f5d76e";
              ctx.fillRect(rx + 29, ry + 25, 1, 1);
            }
          } else if (theme === "volcanic") {
            // Lava hairline crack
            if (hash < 12) {
              ctx.strokeStyle = "#e74c3c";
              ctx.lineWidth = 1;
              ctx.globalAlpha = 0.5;
              ctx.beginPath();
              ctx.moveTo(rx + 4, ry + 20);
              ctx.lineTo(rx + 18, ry + 22);
              ctx.lineTo(rx + 24, ry + 18);
              ctx.lineTo(rx + 36, ry + 24);
              ctx.stroke();
              ctx.globalAlpha = 1;
            }
            // Ember cluster
            if (hash2 < 7) {
              ctx.fillStyle = "#f39c12";
              ctx.fillRect(rx + 20, ry + 30, 2, 2);
              ctx.fillStyle = "#e74c3c";
              ctx.fillRect(rx + 24, ry + 28, 1, 1);
            }
          } else if (theme === "void_rift") {
            // Energy wisp trail
            if (hash < 8) {
              ctx.fillStyle = "rgba(155, 89, 182, 0.3)";
              ctx.fillRect(rx + 10, ry + 14, 6, 2);
              ctx.fillRect(rx + 14, ry + 12, 2, 6);
            }
            // Constellation dots
            if (hash2 < 10) {
              ctx.fillStyle = "#8e44ad";
              ctx.fillRect(rx + 8, ry + 8, 1, 1);
              ctx.fillRect(rx + 30, ry + 20, 1, 1);
              ctx.fillRect(rx + 18, ry + 34, 1, 1);
            }
          } else if (theme === "pool") {
            // Ripple ring
            if (hash < 6) {
              ctx.strokeStyle = "rgba(72, 219, 251, 0.25)";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(rx + 20, ry + 20, 8, 0, Math.PI * 2);
              ctx.stroke();
            }
          }

          // Gameplay mechanic: Tall grass patches in Gardens theme
          if (theme === "gardens" && hash >= 50 && hash < 75) {
            ctx.fillStyle = "#11572b"; // darker grass background
            ctx.fillRect(rx, ry, tileSize, tileSize);

            ctx.fillStyle = "#21a153"; // bright grass blades
            for (let b = 0; b < 5; b++) {
              const bx = rx + 4 + b * 7;
              const by = ry + tileSize;
              const bh = 15 + ((b * 3 + hash) % 12); // blade height
              ctx.beginPath();
              ctx.moveTo(bx, by);
              ctx.lineTo(bx + 2, by - bh);
              ctx.lineTo(bx + 4, by);
              ctx.fill();
            }
          }

          if (theme === "backrooms") {
            // Soggy carpet — no tile grid, just organic damp patches
            const dh = (tx * 13 + ty * 37) % 100;
            if (dh < 15) {
              ctx.fillStyle = "#a38b4d";
              ctx.fillRect(rx + 6, ry + 8, 18, 14);
            } else if (dh < 22) {
              ctx.fillStyle = "#8f773b";
              ctx.fillRect(rx + 14, ry + 4, 8, 8);
            } else if (dh < 28) {
              ctx.fillStyle = "#bda35c";
              ctx.fillRect(rx + 2, ry + 22, 12, 10);
            }
            // Fluorescent light reflection on floor
            if (dh > 85) {
              ctx.fillStyle = "rgba(255, 255, 220, 0.06)";
              ctx.fillRect(rx + 4, ry + 2, 32, 4);
            }
          } else if (this.game.showFloorGrid) {
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = 1;
            ctx.strokeRect(rx, ry, tileSize, tileSize);

            const gridHash = (tx * 17 + ty * 31) % 100;
            if (gridHash < 12) {
              // Draw a diagonal crack
              ctx.strokeStyle = crackStyle;
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(rx + 8, ry + 8);
              ctx.lineTo(rx + 16, ry + 16);
              ctx.lineTo(rx + 12, ry + 26);
              ctx.stroke();
            } else if (gridHash < 20) {
              // Tiny stone/debris dot details or flowers
              ctx.fillStyle = dotStyle;
              if (theme === "gardens") {
                // Draw flower dots (yellow/pink)
                ctx.fillRect(rx + 24, ry + 12, 3, 3);
                ctx.fillStyle = gridHash % 2 === 0 ? "#e84393" : "#f1c40f";
                ctx.fillRect(rx + 10, ry + 28, 4, 4);
              } else {
                ctx.fillRect(rx + 24, ry + 12, 3, 3);
                ctx.fillRect(rx + 10, ry + 28, 2, 2);
              }
            } else if (gridHash < 26) {
              // Vertical split lines to simulate smaller brick pavers
              ctx.strokeStyle = strokeStyle;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(rx + 20, ry);
              ctx.lineTo(rx + 20, ry + tileSize);
              ctx.stroke();
            }
          }
        } else if (this.tileGrid[tx][ty] === 2) {
          const rx = tx * tileSize - camera.x;
          const ry = ty * tileSize - camera.y;

          // Skip tiles fully off-screen
          if (
            rx + tileSize < visibleLeftCam ||
            rx > visibleRightCam ||
            ry + tileSize < visibleTopCam ||
            ry > visibleBottomCam
          )
            continue;

          // Draw special runic floor
          ctx.fillStyle = "#22153c"; // deep runic purple
          ctx.fillRect(rx, ry, tileSize, tileSize);

          ctx.strokeStyle = "#43267d"; // glowing purple border
          ctx.lineWidth = 1;
          ctx.strokeRect(rx, ry, tileSize, tileSize);

          // Add a faint central rune symbol or dot
          ctx.fillStyle = "#7d5fff";
          ctx.fillRect(rx + tileSize / 2 - 2, ry + tileSize / 2 - 2, 4, 4);
        }
      }
    }
  }

  /**
   * Draw borders, obstacles, hazard indicators
   */
  draw(ctx, camera) {
    if (!this.tileGrid) return;

    const tileSize = 40;

    const player = this.game?.player;
    const renderDist = this.game?.renderDistance || 1200;
    const renderDistSq = renderDist * renderDist;
    const shouldCull = (wx, wy) => {
      if (!player) return false;
      const dx = wx - player.x;
      const dy = wy - player.y;
      return dx * dx + dy * dy > renderDistSq;
    };

    // Draw outer boundary line
    ctx.strokeStyle = "#1e1f2f";
    ctx.lineWidth = 4;
    ctx.strokeRect(-camera.x, -camera.y, this.width, this.height);

    // Draw Door portals (3 blocks wide)
    if (this.doors) {
      this.doors.forEach((door) => {
        const rx = door.x - camera.x;
        const ry = door.y - camera.y;
        const isHorizontal = door.dir === "North" || door.dir === "South";

        // Door background
        ctx.fillStyle = "#2f3542";
        if (isHorizontal) {
          ctx.fillRect(rx - 60, ry - 20, 120, 40);
        } else {
          ctx.fillRect(rx - 20, ry - 60, 40, 120);
        }

        // Door frame
        ctx.strokeStyle = "#747d8c";
        ctx.lineWidth = 3;
        if (isHorizontal) {
          ctx.strokeRect(rx - 60, ry - 20, 120, 40);
        } else {
          ctx.strokeRect(rx - 20, ry - 60, 40, 120);
        }

        // Keep the door label readable instead of over-pixelating the text.
        ctx.font = "700 10px 'Orbitron', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#000";
        ctx.fillStyle = "#ffffff";
        ctx.strokeText(door.dir, rx, ry);
        ctx.fillText(door.dir, rx, ry);
      });
    }

    // Draw Shrines
    this.shrines.forEach((shrine) => {
      const rx = shrine.x - camera.x;
      const ry = shrine.y - camera.y;

      // Draw shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(rx - 12, ry + 6, 24, 4);

      // Draw shrine sprite (translucent if on cooldown)
      const alpha = shrine.active ? 1.0 : 0.4;
      this.game.assets.draw(
        ctx,
        "shrine_" + shrine.buffType,
        rx,
        ry,
        24,
        0,
        0,
        alpha,
      );

      // Glowing circle underneath active shrine (pixelated)
      if (shrine.active) {
        const strokeColor =
          shrine.buffType === "haste"
            ? "rgba(255, 159, 67, 0.3)"
            : shrine.buffType === "mana"
              ? "rgba(16, 172, 132, 0.3)"
              : "rgba(255, 71, 87, 0.3)";
        this.game.drawCircle(
          ctx,
          rx,
          ry,
          shrine.radius + 6,
          null,
          strokeColor,
          2,
        );
      }
    });

    // Draw Chests (locked/unlocked)
    this.chests.forEach((chest) => {
      const rx = chest.x - camera.x;
      const ry = chest.y - camera.y;

      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(rx - 10, ry + 4, 20, 3);

      this.game.assets.draw(ctx, "item_chest", rx, ry, 20);

      // Progress bar if player is unlocking
      if (chest.unlockTimer < 3.0) {
        const bw = 20;
        const bh = 3;
        const bx = rx - bw / 2;
        const by = ry - chest.radius - 6;

        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(bx, by, bw, bh);

        const pct = (3.0 - chest.unlockTimer) / 3.0;
        ctx.fillStyle = "#eccc68";
        ctx.fillRect(bx, by, bw * pct, bh);
      }
    });

    // Draw custom story triggers
    // A. Switch Buttons
    if (this.buttons) {
      this.buttons.forEach((btn) => {
        const rx = btn.x - camera.x;
        const ry = btn.y - camera.y;

        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(rx - 14, ry + 4, 28, 4);

        ctx.fillStyle = btn.active ? "#2ed573" : "#747d8c";
        ctx.strokeStyle = "#2f3542";
        ctx.lineWidth = 2;
        ctx.fillRect(rx - 12, ry - 12, 24, 24);
        ctx.strokeRect(rx - 12, ry - 12, 24, 24);

        ctx.fillStyle = btn.active ? "#58ea8d" : "#a4b0be";
        ctx.fillRect(rx - 6, ry - 6, 12, 12);
      });
    }

    // B. Locked Doors
    this.allObstacles.forEach((obs) => {
      if (obs.type === "door" && obs.closed) {
        const rx = obs.x - camera.x;
        const ry = obs.y - camera.y;

        ctx.fillStyle = "#4b6584";
        ctx.strokeStyle = "#2f3542";
        ctx.lineWidth = 3;
        ctx.fillRect(rx - 18, ry - 18, 36, 36);
        ctx.strokeRect(rx - 18, ry - 18, 36, 36);

        ctx.fillStyle = "#ff4757";
        ctx.font = "bold 12px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⛉", rx, ry);
      }
    });

    // C. Teleporters
    if (this.teleporters) {
      this.teleporters.forEach((tp) => {
        const rx = tp.x - camera.x;
        const ry = tp.y - camera.y;

        ctx.strokeStyle = "#a55eea";
        ctx.lineWidth = 2;
        this.game.drawCircle(ctx, rx, ry, tp.radius, null, "#a55eea", 2);

        const pulse = Math.abs(Math.sin(Date.now() / 150)) * 6;
        ctx.fillStyle = "rgba(165, 94, 234, 0.25)";
        this.game.drawCircle(
          ctx,
          rx,
          ry,
          tp.radius - 4 + pulse,
          "rgba(165, 94, 234, 0.25)",
        );
      });
    }

    // D. Valves
    if (this.valves) {
      this.valves.forEach((valve) => {
        const rx = valve.x - camera.x;
        const ry = valve.y - camera.y;

        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(rx - 16, ry + 6, 32, 4);

        ctx.fillStyle = valve.cooled ? "#54a0ff" : "#ff4757";
        ctx.strokeStyle = "#2f3542";
        ctx.lineWidth = 2.5;
        this.game.drawCircle(
          ctx,
          rx,
          ry,
          valve.radius,
          valve.cooled ? "#54a0ff" : "#ff4757",
          "#2f3542",
          2.5,
        );

        ctx.strokeStyle = "#2f3542";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rx - 12, ry);
        ctx.lineTo(rx + 12, ry);
        ctx.moveTo(rx, ry - 12);
        ctx.lineTo(rx, ry + 12);
        ctx.stroke();

        if (valve.interactionTimer > 0 && !valve.cooled) {
          const bw = 24;
          const bh = 3;
          const bx = rx - bw / 2;
          const by = ry - valve.radius - 8;
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.fillRect(bx, by, bw, bh);
          ctx.fillStyle = "#54a0ff";
          ctx.fillRect(bx, by, bw * (valve.interactionTimer / 3.0), bh);
        }
      });
    }

    // E. Lava Vents
    if (this.lavaVents) {
      this.lavaVents.forEach((vent) => {
        const rx = vent.x - camera.x;
        const ry = vent.y - camera.y;

        ctx.strokeStyle = "#ff9f43";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(rx - 14, ry - 8);
        ctx.lineTo(rx + 10, ry + 10);
        ctx.moveTo(rx + 12, ry - 10);
        ctx.lineTo(rx - 8, ry + 8);
        ctx.stroke();

        ctx.fillStyle = "rgba(255, 159, 67, 0.15)";
        this.game.drawCircle(
          ctx,
          rx,
          ry,
          vent.radius,
          "rgba(255, 159, 67, 0.15)",
        );
      });
    }

    // F. Exit Portal
    if (this.exitPortal) {
      const rx = this.exitPortal.x - camera.x;
      const ry = this.exitPortal.y - camera.y;

      const pulse = 16 + Math.sin(Date.now() / 100) * 4;
      ctx.fillStyle = "rgba(236, 204, 104, 0.35)";
      this.game.drawCircle(
        ctx,
        rx,
        ry,
        pulse,
        "rgba(236, 204, 104, 0.35)",
        "#eccc68",
        2,
      );
      this.game.drawCircle(ctx, rx, ry, pulse - 6, "rgba(255, 255, 255, 0.45)");

      ctx.fillStyle = "#eccc68";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("EXIT", rx, ry);
    }

    // G. Battery Companion
    if (this.chapterBatteryCompanion) {
      const rx = this.chapterBatteryCompanion.x - camera.x;
      const ry = this.chapterBatteryCompanion.y - camera.y;

      ctx.fillStyle = "rgba(112, 161, 255, 0.04)";
      this.game.drawCircle(ctx, rx, ry, 160, "rgba(112, 161, 255, 0.04)");
      this.game.drawCircle(
        ctx,
        rx,
        ry,
        40,
        "rgba(112, 161, 255, 0.12)",
        "#70a1ff",
        1,
      );

      ctx.fillStyle = "#ffffff";
      this.game.drawCircle(ctx, rx, ry, 6, "#ffffff", "#70a1ff", 2);
    }

    // Draw wall tiles (connected textures) and explosive barrels
    const bounds = this.getNearbyTileBounds();
    if (!bounds) return;
    const { startTx, endTx, startTy, endTy } = bounds;

    // First pass: Draw drop shadows on the ground for any wall that has floor below it
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    for (let tx = startTx; tx <= endTx; tx++) {
      for (let ty = startTy; ty <= endTy; ty++) {
        if (this.tileGrid[tx][ty] === 1) {
          const rx = tx * tileSize - camera.x;
          const ry = ty * tileSize - camera.y;
          // Check if there is floor below this wall
          const S =
            ty < this.tileHeight - 1 ? this.tileGrid[tx][ty + 1] === 1 : true;
          if (!S) {
            ctx.fillRect(rx, ry + tileSize, tileSize, 8);
          }
        }
      }
    }

    // Second pass: Draw the wall tiles themselves with connected textures
    for (let tx = startTx; tx <= endTx; tx++) {
      for (let ty = startTy; ty <= endTy; ty++) {
        if (this.tileGrid[tx][ty] === 1) {
          const rx = tx * tileSize - camera.x;
          const ry = ty * tileSize - camera.y;

          // Check neighbors
          const top = ty > 0 ? this.tileGrid[tx][ty - 1] === 1 : false;
          const bottom =
            ty < this.tileHeight - 1 ? this.tileGrid[tx][ty + 1] === 1 : false;
          const left = tx > 0 ? this.tileGrid[tx - 1][ty] === 1 : false;
          const right =
            tx < this.tileWidth - 1 ? this.tileGrid[tx + 1][ty] === 1 : false;
          const N = top;
          const S = bottom;
          const W = left;
          const E = right;
          const theme =
            (this.sectorThemes &&
              this.sectorThemes[
                `${Math.floor(tx / 50)},${Math.floor(ty / 50)}`
              ]) ||
            "dungeon";

          const [srcX, srcY] = getWallTile({
            top,
            bottom,
            left,
            right,
            tl: topLeft,
            tr: topRight,
            bl: bottomLeft,
            br: bottomRight,
          });

          const themeName = THEME_MAPPING[theme] || "walls-light";
          window.currentTheme = themeName;
          const sheet = WALL_SHEETS[themeName];
          if (sheet && sheet.complete && sheet.naturalWidth !== 0) {
            // Draw tile scaled to tileSize (40px)
            ctx.drawImage(
              sheet,
              srcX,
              srcY,
              16,
              16,
              rx,
              ry,
              tileSize,
              tileSize,
            );
          } else {
            // Procedural fallback
            let wallBase = "#3f4756";
            let wallMortar = "#1c202a";
            let wallHighlight = "#5c677c";
            let wallShadow = "#161922";

            if (theme === "gardens") {
              wallBase = "#1e5f33"; // shrub leafy green
              wallMortar = "#0e3e20";
              wallHighlight = "#2ecc71";
              wallShadow = "#0f3d1e";
            } else if (theme === "underground") {
              wallBase = "#634427"; // cavern rock
              wallMortar = "#331e0b";
              wallHighlight = "#7d5b3c";
              wallShadow = "#2d1c0a";
            } else if (theme === "pool") {
              wallBase = "#e0f7fa"; // white/teal clean tiles
              wallMortar = "#b2ebf2";
              wallHighlight = "#ffffff";
              wallShadow = "#80deea";
            } else if (theme === "volcanic") {
              wallBase = "#4a1b1b"; // dark volcanic rock
              wallMortar = "#2c0f0f";
              wallHighlight = "#e74c3c"; // red highlights
              wallShadow = "#1c0a0a";
            } else if (theme === "void_rift") {
              wallBase = "#11052c"; // void obsidian
              wallMortar = "#0d0221";
              wallHighlight = "#9b59b6"; // magenta highlights
              wallShadow = "#070114";
            } else if (theme === "backrooms") {
              wallBase = "#ffeaa7"; // yellow mono wallpaper
              wallMortar = "#d1b87a";
              wallHighlight = "#fff9db";
              wallShadow = "#b89e5c";
            }

            ctx.fillStyle = wallBase;
            ctx.fillRect(rx, ry, tileSize, tileSize);

            if (theme === "backrooms") {
              // Vertical wallpaper stripes
              ctx.fillStyle = "#e8d090";
              ctx.fillRect(rx + 10, ry, 1, tileSize);
              ctx.fillRect(rx + 20, ry, 1, tileSize);
              ctx.fillRect(rx + 30, ry, 1, tileSize);
              // Subtle horizontal seam
              ctx.fillStyle = "#d4c07a";
              ctx.fillRect(rx, ry + 20, tileSize, 1);
              // Baseboard if floor below
              if (!S) {
                ctx.fillStyle = "#8f773b";
                ctx.fillRect(rx, ry + tileSize - 5, tileSize, 5);
                ctx.fillStyle = "#6d5a2e";
                ctx.fillRect(rx, ry + tileSize - 6, tileSize, 1);
              }
            } else {
              // Draw procedural horizontal brick line textures
              const xStart = W ? rx : rx + 4;
              const xEnd = E ? rx + tileSize : rx + tileSize - 4;
              ctx.fillStyle = wallMortar;
              ctx.fillRect(xStart, ry + 13, xEnd - xStart, 2);
              ctx.fillRect(xStart, ry + 26, xEnd - xStart, 2);

              // Draw vertical joints deterministically for brick look
              const hash = (tx * 19 + ty * 23) % 100;
              if (hash < 50) {
                ctx.fillRect(rx + 20, ry, 2, 13);
                ctx.fillRect(rx + 10, ry + 13, 2, 13);
                ctx.fillRect(rx + 30, ry + 26, 2, 14);
              } else {
                ctx.fillRect(rx + 10, ry, 2, 13);
                ctx.fillRect(rx + 30, ry + 13, 2, 13);
                ctx.fillRect(rx + 20, ry + 26, 2, 14);
              }
            }

            // Connected highlights (top/left) and shadows (bottom/right)
            ctx.fillStyle = wallHighlight;
            if (!N) ctx.fillRect(rx, ry, tileSize, 3);
            if (!W) ctx.fillRect(rx, ry, 3, tileSize);

            ctx.fillStyle = wallShadow;
            if (!S) ctx.fillRect(rx, ry + tileSize - 3, tileSize, 3);
            if (!E) ctx.fillRect(rx + tileSize - 3, ry, 3, tileSize);
          }
        }
      }
    }

    // Draw explosive barrels (which are obstacles, but not walls)
    this.obstacles.forEach((obs) => {
      if (obs.type !== "explosive_barrel") return;
      if (shouldCull(obs.x, obs.y)) return;
      const rx = obs.x - camera.x;
      const ry = obs.y - camera.y;

      // Barrel shadow
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(
        rx - obs.radius,
        ry - obs.radius + 5,
        obs.radius * 2,
        obs.radius * 2,
      );

      ctx.fillStyle = "#ea8214"; // Orange barrel
      ctx.fillRect(
        rx - obs.radius,
        ry - obs.radius,
        obs.radius * 2,
        obs.radius * 2,
      );

      // Bands
      ctx.fillStyle = "#374151";
      ctx.fillRect(rx - obs.radius, ry - obs.radius + 4, obs.radius * 2, 3);
      ctx.fillRect(rx - obs.radius, ry + obs.radius - 7, obs.radius * 2, 3);

      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        rx - obs.radius,
        ry - obs.radius,
        obs.radius * 2,
        obs.radius * 2,
      );
    });

    // Draw Event Warning Indicators
    this.meteorIndicators.forEach((met) => {
      if (shouldCull(met.x, met.y)) return;
      const rx = met.x - camera.x;
      const ry = met.y - camera.y;

      // Pulse animation
      const scale = 0.8 + Math.sin(met.pulseTimer) * 0.15;

      // Select indicator color based on type
      let strokeColor = "rgba(255, 71, 87, 0.7)"; // red
      let fillColor = "rgba(255, 71, 87, 0.15)";

      if (met.type === "frost") {
        strokeColor = "rgba(0, 210, 213, 0.7)"; // cyan
        fillColor = "rgba(0, 210, 213, 0.15)";
      } else if (met.type === "void") {
        strokeColor = "rgba(165, 94, 234, 0.7)"; // purple
        fillColor = "rgba(165, 94, 234, 0.15)";
      }

      // Pixelated warning circle
      this.game.drawCircle(
        ctx,
        rx,
        ry,
        met.radius * scale,
        fillColor,
        strokeColor,
        3,
      );

      // Draw warning triangle
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(rx, ry - 10);
      ctx.lineTo(rx + 10, ry + 8);
      ctx.lineTo(rx - 10, ry + 8);
      ctx.closePath();

      ctx.fillStyle = "#ff9f43";
      ctx.fill();

      ctx.fillStyle = "#1e293b";
      ctx.textAlign = "center";
      ctx.fillText("!", rx, ry + 5);
      ctx.restore();
    });
  }

  getNearbyTileBounds() {
    if (!this.tileGrid) return null;
    const tileSize = 40;
    const pad = 2;
    const camera = this.game?.camera;
    const canvas = this.game?.canvas;
    const zoom = this.game?.gameZoom || 1.0;

    let startTx = 0;
    let endTx = this.tileWidth - 1;
    let startTy = 0;
    let endTy = this.tileHeight - 1;

    // Viewport bounds (adjusted for camera zoom)
    if (camera && canvas) {
      const halfWidth = canvas.width / 2;
      const halfHeight = canvas.height / 2;

      const visibleLeft = camera.x + halfWidth - halfWidth / zoom;
      const visibleRight = camera.x + halfWidth + halfWidth / zoom;
      const visibleTop = camera.y + halfHeight - halfHeight / zoom;
      const visibleBottom = camera.y + halfHeight + halfHeight / zoom;

      startTx = Math.max(startTx, Math.floor(visibleLeft / tileSize) - pad);
      endTx = Math.min(endTx, Math.ceil(visibleRight / tileSize) + pad);
      startTy = Math.max(startTy, Math.floor(visibleTop / tileSize) - pad);
      endTy = Math.min(endTy, Math.ceil(visibleBottom / tileSize) + pad);
    }

    return { startTx, endTx, startTy, endTy };
  }

  transitionToNewArea(door) {
    if (!door) return;

    // Consume key
    this.game.player.keys = Math.max(0, (this.game.player.keys || 0) - 1);

    // Find current player sector
    const currentSx = Math.max(
      0,
      Math.min(this.maxSectorCols - 1, Math.floor(this.game.player.x / 2000)),
    );
    const currentSy = Math.max(
      0,
      Math.min(this.maxSectorRows - 1, Math.floor(this.game.player.y / 2000)),
    );

    // Determine target sector
    const targetSx =
      currentSx + (door.dir === "East" ? 1 : door.dir === "West" ? -1 : 0);
    const targetSy =
      currentSy + (door.dir === "South" ? 1 : door.dir === "North" ? -1 : 0);

    // Bounds check for the expanded sectors grid
    if (
      targetSx < 0 ||
      targetSx >= this.maxSectorCols ||
      targetSy < 0 ||
      targetSy >= this.maxSectorRows
    ) {
      return; // Out of bounds of the active maze grid
    }

    const targetSectorKey = `${targetSx},${targetSy}`;
    const targetAlreadyUnlocked = this.unlockedSectors.has(targetSectorKey);

    // Choose new theme randomly for the target sector if it doesn't have one
    let newTheme = this.sectorThemes[targetSectorKey];
    if (!newTheme) {
      if (this.game.nextThemeOverride) {
        newTheme = this.game.nextThemeOverride;
        this.game.nextThemeOverride = null; // Consume override
        const selectEl = document.getElementById("dev-next-theme");
        if (selectEl) selectEl.value = "";
      } else if (this.backroomsSecretUnlocked) {
        newTheme = "backrooms";
      } else {
        const currentTheme =
          this.sectorThemes[`${currentSx},${currentSy}`] || "dungeon";
        const roll = Math.random();
        if (roll < 0.005) {
          newTheme = "backrooms";
        } else {
          const themes = [
            "dungeon",
            "gardens",
            "underground",
            "pool",
            "volcanic",
            "void_rift",
          ];
          const choices = themes.filter((t) => t !== currentTheme);
          newTheme = choices[Math.floor(Math.random() * choices.length)];
        }
      }
      this.sectorThemes[targetSectorKey] = newTheme;
    }

    // Unlock target sector
    this.unlockedSectors.add(targetSectorKey);

    // Unlock target door
    const doorKey = `${door.tx},${door.ty}`;
    this.unlockedDoors.add(doorKey);

    // Also unlock the corresponding door tile in the adjacent sector
    let neighborTx = door.tx;
    let neighborTy = door.ty;
    if (door.dir === "North") neighborTy = door.ty - 1;
    else if (door.dir === "South") neighborTy = door.ty + 1;
    else if (door.dir === "West") neighborTx = door.tx - 1;
    else if (door.dir === "East") neighborTx = door.tx + 1;

    this.unlockedDoors.add(`${neighborTx},${neighborTy}`);

    // Unlock explore achievements
    if (newTheme === "gardens") this.game.unlockAchievement("flora_explorer");
    else if (newTheme === "underground")
      this.game.unlockAchievement("spelunker");
    else if (newTheme === "pool") this.game.unlockAchievement("abyssal_diver");
    else if (newTheme === "backrooms")
      this.game.unlockAchievement("the_glitched");
    else if (newTheme === "volcanic")
      this.game.unlockAchievement("pyroclastic_survivor");
    else if (newTheme === "void_rift")
      this.game.unlockAchievement("void_walker");

    // Visual text banner
    const names = {
      dungeon: "THE DARK DUNGEON",
      gardens: "THE HARMONIOUS GARDENS",
      underground: "THE DEEP CAVERNS",
      pool: "THE TRITON POOLS",
      backrooms: "THE LIMITLESS BACKROOMS",
      volcanic: "THE VOLCANIC CORE",
      void_rift: "THE COSMIC VOID RIFT",
    };
    const colors = {
      dungeon: "#a55eea",
      gardens: "#2ecc71",
      underground: "#e67e22",
      pool: "#48dbfb",
      backrooms: "#ffeaa7",
      volcanic: "#ff4757",
      void_rift: "#a55eea",
    };

    const themeName = names[newTheme] || newTheme.toUpperCase();
    const themeColor = colors[newTheme] || "#ffffff";

    this.game.particles.spawnText(
      door.x,
      door.y - 20,
      `UNLOCKED: ${themeName}`,
      {
        color: themeColor,
        fontSize: 12,
        fontPixel: true,
        life: 3.5,
      },
    );

    // Push the player slightly into the new sector to avoid immediate re-triggering
    const pushDist = 60;
    if (door.dir === "North") this.game.player.y -= pushDist;
    else if (door.dir === "South") this.game.player.y += pushDist;
    else if (door.dir === "West") this.game.player.x -= pushDist;
    else if (door.dir === "East") this.game.player.x += pushDist;

    // Regenerate obstacles to update active bounds and open the door without triggering a new wave
    this.generateObstacles();

    // Spawn special room contents in the new sector if any exist
    this.spawnSpecialRoomsContents();
    if (this.specialSpawns) {
      this.specialSpawns.forEach((spawn) => {
        this.game.spawnEnemy(spawn.x, spawn.y, spawn.type);
      });
    }

    // Spawn 1 chest and 1 shrine inside the newly unlocked sector
    this.spawnChest(targetSectorKey);
    this.spawnShrine(targetSectorKey);

    // Update HUD
    this.game.updateHUD();
  }
}
