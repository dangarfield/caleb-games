// Portal Lab entry: mount the game shell onto #ui (long-press menus are blocked in index.html).
import { App } from './bl-app.js';

const app = new App();
app.mount(document.getElementById('ui'));
window.portalLab = app; // for console checks while debugging (the engine is window.__portalLab)
