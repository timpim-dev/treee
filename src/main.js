import { Game } from './engine/Game.js';

window.addEventListener('DOMContentLoaded', () => {
  // Create and initialize game instance
  const game = new Game();
  
  // Attach to window for global debugging if needed
  window.gameInstance = game;
});
