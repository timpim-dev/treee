// scratch/test_game.js
import { JSDOM } from 'jsdom';

const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<body>
  <canvas id="game-canvas" width="800" height="600"></canvas>
  <div id="hud" class="hidden">
    <div id="hud-hp-fill"></div>
    <div id="hud-hp-text"></div>
    <div id="hud-mp-fill"></div>
    <div id="hud-mp-text"></div>
    <div id="hud-xp-fill"></div>
    <div id="hud-level-text"></div>
    <div id="hud-bottom-xp-bar"></div>
    <div id="hud-bottom-xp-fill"></div>
    <div id="hud-bottom-xp-text"></div>
    <canvas id="hud-avatar-canvas" width="40" height="40"></canvas>
    <div id="hud-wave-title"></div>
    <div id="hud-wave-timer"></div>
    <div id="hud-enemies-left"></div>
    <div id="hud-shards-value"></div>
    <div id="hud-keys-value"></div>
    <div id="hud-ap-value"></div>
    <div id="inventory-container"></div>
    <canvas id="minimap-canvas" width="120" height="120"></canvas>
    <div id="spell-slot-1"></div>
    <div id="spell-slot-2"></div>
    <div id="spell-slot-3"></div>
    <div id="spell-slot-4"></div>
    <div id="spell-slot-5"></div>
    <div id="spell-slot-6"></div>
    <div id="spell-slot-7"></div>
  </div>
  <canvas id="main-menu-player-canvas" width="128" height="128"></canvas>
  <canvas id="canvas-mode-weaver" width="64" height="64"></canvas>
  <canvas id="icon-mainmenu-story" width="64" height="64"></canvas>
  <canvas id="icon-mainmenu-multiplayer" width="64" height="64"></canvas>
  <canvas id="canvas-mode-tutorial" width="64" height="64"></canvas>
  <div id="tutorial-guide" class="hidden"></div>
  <button id="btn-play-menu"></button>
</body>
</html>
`, {
  url: 'http://localhost/',
  pretendToBeVisual: true
});

global.window = dom.window;
global.document = dom.window.document;

// Dynamic element mocking to avoid null element errors
const originalGetElementById = dom.window.document.getElementById.bind(dom.window.document);
dom.window.document.getElementById = (id) => {
  let el = originalGetElementById(id);
  if (!el) {
    el = dom.window.document.createElement('canvas');
    el.id = id;
    dom.window.document.body.appendChild(el);
  }
  return el;
};

const originalQuerySelector = dom.window.document.querySelector.bind(dom.window.document);
dom.window.document.querySelector = (selector) => {
  let el = originalQuerySelector(selector);
  if (!el) {
    el = dom.window.document.createElement('canvas');
    if (selector.startsWith('#')) {
      el.id = selector.slice(1);
    } else if (selector.startsWith('.')) {
      el.className = selector.slice(1);
    }
    dom.window.document.body.appendChild(el);
  }
  return el;
};

Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
global.Image = dom.window.Image;
Object.defineProperty(global, 'location', { value: dom.window.location, configurable: true, writable: true });
global.localStorage = {
  getItem(key) {
    if (key === 'aetherweaver_save') {
      return JSON.stringify({
        level: 5,
        xp: 10,
        xpNeeded: 100,
        ap: 3,
        shards: 120,
        hueShift: 50,
        shopMaxHp: 20,
        shopMaxMp: 20,
        shopManaRegen: 0.2,
        runeStorage: [],
        equippedRunes: [],
        gearStorage: [],
        equipment: { helmet: null, chestplate: null, boots: null, weapon: null, ring: null },
        treeNodes: { 'root': true, 'comp1_root': true },
        rebirthCount: 1,
        rebirthBonuses: { xpGain: 0.1, damageBonus: 0.05, healthBonus: 10 },
        maxInventorySlots: 4,
        customSpellMap: {},
        maxSpellSlots: 5,
        keys: 2,
        theme: 'dungeon',
        unlockedSectors: ["6,6", "6,7"],
        sectorThemes: {"6,6": 'dungeon', "6,7": 'gardens'},
        unlockedDoors: ["6,6-S"],
        earnedAchievements: [],
        frozenEnemiesCount: 0,
        dashCastCount: 0,
        unlockedCompanion1: true,
        unlockedCompanion2: false,
        completedCompanion1Tree: false,
        completedCompanion1TreeAwarded: false,
        completedCompanion2Tree: false,
        completedCompanion2TreeAwarded: false,
        chapterUnlocked: 1
      });
    }
    return null;
  },
  setItem() {},
  removeItem() {}
};
global.fetch = async () => ({ ok: false, json: async () => ({}) });
global.requestAnimationFrame = (callback) => setTimeout(callback, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

// Mock HTMLCanvasElement.prototype.getContext to return a mock 2d context
dom.window.HTMLCanvasElement.prototype.getContext = () => ({
  clearRect() {},
  save() {},
  restore() {},
  fillRect() {},
  drawImage() {},
  translate() {},
  rotate() {},
  scale() {},
  beginPath() {},
  arc() {},
  fill() {},
  stroke() {},
  measureText() { return { width: 10 }; },
  fillText() {}
});

// Import and run Game
console.log('Importing Game...');
const { Game } = await import('../src/engine/Game.js');

console.log('Instantiating Game...');
const game = new Game();

console.log('Testing setState(PLAY_MENU)...');
game.setState('PLAY_MENU');
game.drawGameModePreviews();

console.log('Testing startNewGame()...');
game.startNewGame();

console.log('Letting game loop run for 2 seconds...');
await new Promise(resolve => setTimeout(resolve, 2000));

console.log('All tests passed without freezing!');
process.exit(0);
