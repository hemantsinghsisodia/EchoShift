import './styles/main.css';
import { markTouchDevice } from './core/device.js';
import { Game } from './core/Game.js';
import { attachDebugHooks } from './debug/DebugHooks.js';

function boot() {
  markTouchDevice();
  const loading = document.getElementById('loading');
  try {
    const game = new Game(document.getElementById('app'));
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) attachDebugHooks(game);
    loading.classList.add('hidden');
  } catch (err) {
    console.error(err);
    loading.querySelector('.loading-text').textContent = 'WEBGL UNAVAILABLE // ' + (err?.message ?? 'UNKNOWN ERROR');
  }
}

boot();
