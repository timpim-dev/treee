// Intercept OAuth2 popup redirect before initializing anything
const params = new URLSearchParams(window.location.search);
const code = params.get('code');
const state = params.get('state');
if (window.opener && code && state) {
  console.log('[OAuth Popup] Detected popup callback. Sending credentials back to opener...');
  
  // Render a clean authorization loading screen immediately to prevent game asset initialization
  if (document.body) {
    document.body.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #0c0d14; color: #dfe7ff; font-family: sans-serif; text-align: center; padding: 20px; box-sizing: border-box;">
        <div style="border: 4px solid #9146FF; border-top: 4px solid transparent; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
        <h2 style="color: #9146FF; font-family: monospace; font-size: 16px; margin: 0 0 10px; letter-spacing: 2px;">AUTHORIZING</h2>
        <p style="color: #888; font-size: 12px; margin: 0;">Connecting Aetherweaver to your account. Please wait...</p>
        <style>
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </div>
    `;
  }

  // Send credentials to parent window
  window.opener.postMessage({
    code,
    state,
    redirectUrl: window.location.origin + window.location.pathname
  }, window.location.origin);
  
  // Delay closing the window to allow postMessage task execution
  setTimeout(() => {
    window.close();
  }, 500);

  // Prevent DOMContentLoaded and further imports execution inside the popup
  window.addEventListener('DOMContentLoaded', (e) => {
    e.stopImmediatePropagation();
  }, true);
  
  throw new Error('[OAuth Popup] Redirect processed, exiting popup.');
}

import { Game } from './engine/Game.js';

window.addEventListener('DOMContentLoaded', () => {
  // Create and initialize game instance
  const game = new Game();
  
  // Attach to window for global debugging if needed
  window.gameInstance = game;
});
