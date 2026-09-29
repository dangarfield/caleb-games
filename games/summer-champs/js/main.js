// Summer Champs boot: open the save store, then load the game (sc-ui.js is the real entry).
window.ArcadeStore('summer-champs').ready(() => {
  import('./sc-ui.js').catch(e => {
    console.error(e);
    const t = document.getElementById('loadtxt'); if (t) t.textContent = 'COULD NOT LOAD THE ATHLETES';
  });
});
