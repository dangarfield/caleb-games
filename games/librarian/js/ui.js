import { CATEGORIES } from './books.js';

export class UI {
  constructor(player, gameState) {
    this.player = player;
    this.gameState = gameState;
    this.hudEl = document.getElementById('hud');
    this.scoreEl = document.getElementById('hudScore');
    this.seriesEl = document.getElementById('hudSeries');
    this.carryEl = document.getElementById('hudCarry');
    this.heldBooksEl = document.getElementById('held-books');
    this.heldBooksListEl = document.getElementById('held-books-list');
    this.crosshairEl = document.getElementById('crosshair');
    this.abilitiesEl = document.getElementById('abilities');
    this.instructionsEl = document.getElementById('instructions');
    this.mapBtnEl = document.getElementById('map-btn');
    this.mapPanelEl = document.getElementById('map-panel');
    this.infoPanelEl = document.getElementById('info-panel');
    this.mapOpen = false;
    this.infoOpen = false;

    this.buildMapLegend();
  }

  buildMapLegend() {
    const container = document.getElementById('map-legend');
    let html = '';
    const half = Math.ceil(CATEGORIES.length / 2);
    CATEGORIES.forEach((cat, idx) => {
      const floor = idx < half ? 'Ground' : 'Upper';
      html += `<div class="legend-row">`;
      html += `<span class="legend-code">${cat.section}</span>`;
      html += `<span class="legend-name">${cat.name}</span>`;
      html += `<span class="legend-side">${floor}</span>`;
      html += `</div>`;
      cat.series.forEach(s => {
        html += `<div class="legend-row" style="padding-left:44px; opacity:0.7;">`;
        html += `<span class="legend-code" style="font-size:0.85rem;">${s.spineLabel}</span>`;
        html += `<span class="legend-name" style="font-size:0.85rem;">${s.name}</span>`;
        html += `</div>`;
      });
    });
    container.innerHTML = html;
  }

  show() {
    this.hudEl.style.display = 'block';
    this.heldBooksEl.style.display = 'block';
    this.crosshairEl.style.display = 'block';
    this.abilitiesEl.style.display = 'flex';
    this.mapBtnEl.style.display = 'block';
    this.instructionsEl.style.display = 'block';
    setTimeout(() => {
      this.instructionsEl.style.display = 'none';
    }, 10000);
  }

  hide() {
    this.hudEl.style.display = 'none';
    this.heldBooksEl.style.display = 'none';
    this.crosshairEl.style.display = 'none';
    this.abilitiesEl.style.display = 'none';
    this.mapBtnEl.style.display = 'none';
    this.instructionsEl.style.display = 'none';
    this.closeMap();
    this.closeInfo();
  }

  update() {
    this.scoreEl.textContent = `${this.gameState.shelvedCount}/${this.gameState.totalBooks}`;
    this.seriesEl.textContent = `${this.gameState.seriesCompleted}/${this.gameState.getTotalSeries()}`;
    this.carryEl.textContent = `${this.player.carrying.length}/${this.player.maxCarry}`;

    this.updateAbilityButtons();
    this.renderHeldBooks();
  }

  updateAbilityButtons() {
    const abilities = ['insight', 'sort', 'guide'];
    abilities.forEach(name => {
      const btn = document.getElementById(`ability${name.charAt(0).toUpperCase() + name.slice(1)}`);
      const ability = this.player.abilities[name];
      if (ability.cooldown > 0) {
        btn.classList.add('cooldown');
        btn.title = `${name} (${Math.ceil(ability.cooldown)}s)`;
      } else {
        btn.classList.remove('cooldown');
      }
    });
  }

  renderHeldBooks() {
    if (this.player.carrying.length === 0) {
      this.heldBooksListEl.innerHTML = '<div class="empty">Empty — press E near a book</div>';
      return;
    }

    let html = '';
    this.player.carrying.forEach((book, i) => {
      const isTop = i === 0;
      const bg = isTop ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
      html += `<div class="book-item" style="border-left-color:${book.spineColor}; background:${bg};">`;
      html += `<strong>${isTop ? '▸ ' : ''}${book.seriesLabel} #${book.volume}</strong> — ${book.series}`;
      html += '</div>';
    });
    this.heldBooksListEl.innerHTML = html;
  }

  toggleMap() {
    this.mapOpen = !this.mapOpen;
    this.mapPanelEl.style.display = this.mapOpen ? 'block' : 'none';
  }

  closeMap() {
    this.mapOpen = false;
    this.mapPanelEl.style.display = 'none';
  }

  toggleInfo() {
    this.infoOpen = !this.infoOpen;
    this.infoPanelEl.style.display = this.infoOpen ? 'block' : 'none';
  }

  closeInfo() {
    this.infoOpen = false;
    this.infoPanelEl.style.display = 'none';
  }

  showVictory() {
    const screen = document.getElementById('victoryScreen');
    const stats = document.getElementById('victoryStats');
    const time = this.gameState.getFormattedTime();

    stats.innerHTML = `
      <div>Time: ${time}</div>
      <div>Books shelved: ${this.gameState.shelvedCount}</div>
      <div>Series completed: ${this.gameState.seriesCompleted}/${this.gameState.getTotalSeries()}</div>
      <div>Difficulty: ${this.gameState.difficulty}</div>
    `;
    screen.style.display = 'flex';
  }

  hideVictory() {
    document.getElementById('victoryScreen').style.display = 'none';
  }
}
