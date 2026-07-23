import { generateBooks, CATEGORIES } from './books.js';
import { playSeriesComplete, playVictory } from './audio.js';

export class GameState {
  constructor() {
    this.difficulty = 'easy';
    this.books = [];
    this.shelvedCount = 0;
    this.seriesCompleted = 0;
    this.totalBooks = 0;
    this.startTime = 0;
    this.elapsedTime = 0;
    this.running = false;
    this.seriesTracker = {};
    this.onVictory = null;
  }

  start() {
    this.difficulty = 'standard';
    this.books = generateBooks();
    this.totalBooks = this.books.length;
    this.shelvedCount = 0;
    this.seriesCompleted = 0;
    this.startTime = performance.now();
    this.elapsedTime = 0;
    this.running = true;
    this.seriesTracker = {};

    this.books.forEach(book => {
      const key = `${book.category}-${book.seriesLabel}`;
      if (!this.seriesTracker[key]) {
        this.seriesTracker[key] = {
          series: book.series,
          category: book.category,
          total: 0,
          shelved: 0,
          complete: false,
        };
      }
      this.seriesTracker[key].total++;
    });

    return this.books;
  }

  shelveBook(book) {
    book.shelved = true;
    this.shelvedCount++;

    const key = `${book.category}-${book.seriesLabel}`;
    if (this.seriesTracker[key]) {
      this.seriesTracker[key].shelved++;
      if (this.seriesTracker[key].shelved >= this.seriesTracker[key].total && !this.seriesTracker[key].complete) {
        this.seriesTracker[key].complete = true;
        this.seriesCompleted++;
        playSeriesComplete();
        return { seriesComplete: true, seriesName: this.seriesTracker[key].series };
      }
    }

    if (this.shelvedCount >= this.totalBooks) {
      this.running = false;
      this.elapsedTime = (performance.now() - this.startTime) / 1000;
      playVictory();
      if (this.onVictory) this.onVictory();
      return { victory: true };
    }

    return { shelved: true };
  }

  unshelveBook(book) {
    this.shelvedCount--;
    const key = `${book.category}-${book.seriesLabel}`;
    if (this.seriesTracker[key]) {
      this.seriesTracker[key].shelved--;
      if (this.seriesTracker[key].complete) {
        this.seriesTracker[key].complete = false;
        this.seriesCompleted--;
      }
    }
  }

  isCorrectShelf(book, shelfCategory) {
    return book.category === shelfCategory;
  }

  getElapsed() {
    if (!this.running) return this.elapsedTime;
    return (performance.now() - this.startTime) / 1000;
  }

  getFormattedTime() {
    const t = this.getElapsed();
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getCompletedSeries() {
    return Object.values(this.seriesTracker).filter(s => s.complete);
  }

  getTotalSeries() {
    return Object.keys(this.seriesTracker).length;
  }
}

export function loadHighScores() {
  try {
    const data = JSON.parse(localStorage.getItem('calebArcadeData')) || {};
    return data.librarian || {};
  } catch (e) {
    return {};
  }
}

export function saveHighScore(difficulty, time) {
  try {
    const data = JSON.parse(localStorage.getItem('calebArcadeData')) || {};
    if (!data.librarian) data.librarian = {};
    const key = `best_${difficulty}`;
    if (!data.librarian[key] || time < data.librarian[key]) {
      data.librarian[key] = time;
    }
    localStorage.setItem('calebArcadeData', JSON.stringify(data));
  } catch (e) {}
}
