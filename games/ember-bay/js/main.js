// Ember Bay entry: mount the game shell onto the stage (long-press menus are blocked in index.html).
import { EmberBay } from './eb-app.js';

const $ = id => document.getElementById(id);
const game = new EmberBay();
game.mount($('ui'), $('stage'), $('city'), $('mg'));
window.emberBay = game; // for console checks while debugging
