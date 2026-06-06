import { Game } from './engine/Game.js';
import { inject } from '@vercel/analytics';

// Initialize Vercel Web Analytics
inject();

window.addEventListener('DOMContentLoaded', () => {
  // Detect mobile devices (via user agent or screen size)
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
  if (isMobile) {
    const warning = document.getElementById('mobile-warning-overlay');
    if (warning) {
      warning.classList.remove('hidden');
      document.getElementById('btn-mobile-bypass')?.addEventListener('click', () => {
        warning.classList.add('hidden');
      });
    }
  }

  // Create and initialize game instance
  const game = new Game();
  
  // Attach to window for global debugging if needed
  window.gameInstance = game;
});
