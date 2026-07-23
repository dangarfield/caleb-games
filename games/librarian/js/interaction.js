import * as THREE from 'three';
import { playPickup, playPlace, playError, playDrop, playAbility } from './audio.js';
import { BookObject, createShelvedBookMesh, BOOK_DEPTH } from './book-objects.js';

const INTERACT_DISTANCE = 4;
const HIGHLIGHT_COLOR = 0x44ff88;
const HIGHLIGHT_OPACITY = 0.35;
const WRONG_COLOR = 0xff4444;

export class InteractionManager {
  constructor(player, gameState, scene, camera) {
    this.player = player;
    this.gameState = gameState;
    this.scene = scene;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.bookObjects = [];
    this.shelfData = [];
    this.hoveredObject = null;
    this.hoveredSlot = null;
    this.tooltipEl = document.getElementById('tooltip');
    this.insightActive = false;
    this.insightTimer = 0;
    this.guideActive = false;
    this.guideTimer = 0;
    this.guideTarget = null;
  }

  setBookObjects(bookObjects) {
    this.bookObjects = bookObjects;
  }

  setShelfData(shelfData) {
    this.shelfData = shelfData;
  }

  update(dt) {
    this.updateRaycast();
    this.updateInsight(dt);
    this.updateGuide(dt);
  }

  updateRaycast() {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = INTERACT_DISTANCE;

    if (this.hoveredObject) {
      if (!this.insightActive) {
        this.hoveredObject.setHighlight(false);
      }
      this.hoveredObject = null;
    }

    if (this.hoveredSlot) {
      this.unhighlightSlot(this.hoveredSlot);
      this.hoveredSlot = null;
    }

    const meshes = this.bookObjects
      .filter(bo => !bo.data.shelved)
      .map(bo => bo.mesh);

    const intersects = this.raycaster.intersectObjects(meshes, true);

    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && !obj.userData.bookObject) {
        obj = obj.parent;
      }
      if (obj.userData && obj.userData.bookObject) {
        const bookObj = obj.userData.bookObject;
        bookObj.setHighlight(true);
        this.hoveredObject = bookObj;
        this.showTooltip(`${bookObj.data.title}`);
        return;
      }
    }

    // Check slot markers for placement/retrieval
    const slotMarkers = this.getAllSlotMarkers();
    const slotIntersects = this.raycaster.intersectObjects(slotMarkers, false);
    if (slotIntersects.length > 0) {
      const marker = slotIntersects[0].object;
      const slotData = marker.userData;
      if (slotData && slotData.type === 'slot') {
        const slot = slotData.shelf.slots[slotData.slotIndex];
        this.hoveredSlot = slot;

        if (slot.occupied) {
          this.highlightSlotOccupied(slot);
          this.showTooltip(`${slot.bookData.series} #${slot.bookData.volume} — Press E to take`);
        } else if (this.player.carrying.length > 0) {
          const topBook = this.player.getTopBook();
          const correct = this.isCorrectSlot(topBook, slotData);
          if (correct) {
            this.highlightSlot(slot);
            this.showTooltip(`Place "${topBook.seriesLabel} #${topBook.volume}" in slot ${slot.volume} — Press E`);
          } else {
            this.highlightSlotWrong(slot);
            if (topBook.series !== slotData.shelf.series) {
              this.showTooltip(`Wrong shelf! This is ${slotData.shelf.seriesLabel} — ${slotData.shelf.series}`);
            } else {
              this.showTooltip(`Wrong slot! This is slot #${slot.volume}, you have volume #${topBook.volume}`);
            }
          }
        } else {
          this.showTooltip(`${slotData.shelf.seriesLabel} — Slot #${slot.volume} (empty)`);
        }
        return;
      }
    }

    // Check shelf meshes (the wooden panels themselves)
    const shelfMeshes = this.shelfData.map(s => s.mesh);
    const shelfIntersects = this.raycaster.intersectObjects(shelfMeshes, true);
    if (shelfIntersects.length > 0 && this.player.carrying.length > 0) {
      const shelf = this.findShelfFromMesh(shelfIntersects[0].object);
      if (shelf) {
        const topBook = this.player.getTopBook();
        if (topBook.category === shelf.category) {
          this.showTooltip(`Shelf ${shelf.section} — aim at a specific slot to place`);
        } else {
          this.showTooltip(`Wrong section! Check the map (M)`);
        }
        return;
      }
    }

    this.hideTooltip();
  }

  getAllSlotMarkers() {
    const markers = [];
    for (const unit of this.shelfData) {
      for (const shelf of unit.shelves) {
        for (const slot of shelf.slots) {
          markers.push(slot.marker);
        }
      }
    }
    return markers;
  }

  isCorrectSlot(book, slotData) {
    return book.category === slotData.unit.category &&
           book.series === slotData.shelf.series &&
           book.volume === slotData.shelf.slots[slotData.slotIndex].volume;
  }

  highlightSlot(slot) {
    slot.marker.material.opacity = HIGHLIGHT_OPACITY;
    slot.marker.material.emissiveIntensity = 0.4;
    slot.marker.material.color.setHex(HIGHLIGHT_COLOR);
    slot.marker.material.emissive.setHex(HIGHLIGHT_COLOR);
  }

  highlightSlotWrong(slot) {
    slot.marker.material.opacity = 0.25;
    slot.marker.material.emissiveIntensity = 0.3;
    slot.marker.material.color.setHex(WRONG_COLOR);
    slot.marker.material.emissive.setHex(WRONG_COLOR);
  }

  highlightSlotOccupied(slot) {
    slot.marker.material.opacity = 0.2;
    slot.marker.material.emissiveIntensity = 0.25;
    slot.marker.material.color.setHex(0xffaa44);
    slot.marker.material.emissive.setHex(0xffaa44);
  }

  unhighlightSlot(slot) {
    slot.marker.material.opacity = 0.06;
    slot.marker.material.emissiveIntensity = 0;
    slot.marker.material.color.setHex(0x88aaff);
    slot.marker.material.emissive.setHex(0x88aaff);
  }

  findShelfFromMesh(mesh) {
    let current = mesh;
    while (current) {
      for (const shelf of this.shelfData) {
        if (shelf.mesh === current) return shelf;
      }
      current = current.parent;
    }
    return null;
  }

  tryPickup() {
    if (!this.hoveredObject) return false;
    if (!this.player.canPickUp()) {
      playError();
      this.showTooltip('Hands full! Drop a book first (Q)');
      return false;
    }

    const bookObj = this.hoveredObject;
    this.player.pickUp(bookObj.data);
    this.scene.remove(bookObj.mesh);
    const idx = this.bookObjects.indexOf(bookObj);
    if (idx !== -1) this.bookObjects.splice(idx, 1);
    bookObj.dispose();
    playPickup();
    this.hoveredObject = null;
    this.hideTooltip();
    return true;
  }

  tryTakeFromShelf() {
    if (!this.hoveredSlot || !this.hoveredSlot.occupied) return false;
    if (!this.player.canPickUp()) {
      playError();
      this.showTooltip('Hands full! Drop a book first (Q)');
      return false;
    }

    const slot = this.hoveredSlot;
    const book = slot.bookData;

    const unit = this.findUnitForSlot(slot);
    if (slot.bookMesh && unit) {
      unit.mesh.remove(slot.bookMesh);
      slot.bookMesh.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
      slot.bookMesh = null;
    }

    slot.occupied = false;
    slot.bookData = null;
    book.shelved = false;

    this.player.pickUp(book);
    this.gameState.unshelveBook(book);
    playPickup();
    this.hideTooltip();
    return true;
  }

  findUnitForSlot(slot) {
    for (const unit of this.shelfData) {
      for (const shelf of unit.shelves) {
        if (shelf.slots.includes(slot)) return unit;
      }
    }
    return null;
  }

  tryPlace() {
    if (this.player.carrying.length === 0) return false;
    if (!this.hoveredSlot) return false;

    const slot = this.hoveredSlot;
    if (slot.occupied) {
      playError();
      this.showTooltip('Slot already occupied!');
      setTimeout(() => this.hideTooltip(), 1500);
      return false;
    }

    const topBook = this.player.getTopBook();
    const slotData = slot.marker.userData;

    if (!this.isCorrectSlot(topBook, slotData)) {
      playError();
      if (topBook.series !== slotData.shelf.series) {
        this.showTooltip(`Wrong shelf! This is for ${slotData.shelf.series}`);
      } else {
        this.showTooltip(`Wrong slot! This is slot #${slot.volume}, you have volume #${topBook.volume}`);
      }
      setTimeout(() => this.hideTooltip(), 2000);
      return false;
    }

    const book = this.player.dropBook();
    this.placeBookInSlot(book, slot, slotData.unit);
    playPlace();

    const result = this.gameState.shelveBook(book);
    if (result.seriesComplete) {
      this.showTooltip(`Series complete: ${result.seriesName}!`);
      setTimeout(() => this.hideTooltip(), 3000);
    }

    return true;
  }

  placeBookInSlot(book, slot, unit) {
    const bookMesh = createShelvedBookMesh(book);
    bookMesh.position.set(slot.localX, slot.localY, 0);
    bookMesh.userData.placedBook = true;
    unit.mesh.add(bookMesh);

    slot.bookMesh = bookMesh;
    slot.occupied = true;
    slot.bookData = book;
  }

  clearPlacedBooks() {
    this.shelfData.forEach(sd => {
      const toRemove = [];
      sd.mesh.children.forEach(child => {
        if (child.userData && child.userData.placedBook) {
          toRemove.push(child);
        }
      });
      toRemove.forEach(m => {
        sd.mesh.remove(m);
        m.traverse(c => {
          if (c.geometry) c.geometry.dispose();
          if (c.material) c.material.dispose();
        });
      });
      sd.shelves.forEach(shelf => {
        shelf.slots.forEach(slot => {
          slot.occupied = false;
          slot.bookMesh = null;
          slot.bookData = null;
        });
      });
    });
  }

  dropBook() {
    const book = this.player.dropBook();
    if (!book) return;

    const pos = this.player.getPosition();
    const dir = this.player.getLookDirection();
    const dropPos = new THREE.Vector3(
      pos.x + dir.x * 0.8,
      pos.y - 0.2,
      pos.z + dir.z * 0.8
    );

    const bookObj = new BookObject(book, dropPos);
    bookObj.mesh.rotation.y = Math.random() * Math.PI;
    bookObj.toss(dir, 3.5);
    this.scene.add(bookObj.mesh);
    this.bookObjects.push(bookObj);
    playDrop();
  }

  interact() {
    if (this.hoveredObject) {
      this.tryPickup();
    } else if (this.hoveredSlot && this.hoveredSlot.occupied) {
      this.tryTakeFromShelf();
    } else if (this.player.carrying.length > 0 && this.hoveredSlot) {
      this.tryPlace();
    }
  }

  useInsight() {
    const ability = this.player.abilities.insight;
    if (ability.cooldown > 0) return;

    playAbility();
    ability.cooldown = ability.maxCooldown;
    this.insightActive = true;
    this.insightTimer = 5;

    const topBook = this.player.getTopBook();
    if (!topBook) {
      this.showTooltip('Hold a book first to use Insight!');
      setTimeout(() => this.hideTooltip(), 2000);
      this.insightActive = false;
      ability.cooldown = 2;
      return;
    }

    this.bookObjects.forEach(bo => {
      if (!bo.data.shelved && bo.data.category === topBook.category &&
          bo.data.seriesLabel === topBook.seriesLabel) {
        bo.setHighlight(true);
      }
    });
  }

  updateInsight(dt) {
    if (!this.insightActive) return;
    this.insightTimer -= dt;
    if (this.insightTimer <= 0) {
      this.insightActive = false;
      this.bookObjects.forEach(bo => bo.setHighlight(false));
    }
  }

  useSort() {
    const ability = this.player.abilities.sort;
    if (ability.cooldown > 0) return;
    if (this.player.carrying.length === 0) return;

    playAbility();
    ability.cooldown = ability.maxCooldown;
    this.player.sortBooks();
  }

  useGuide() {
    const ability = this.player.abilities.guide;
    if (ability.cooldown > 0) return;

    const topBook = this.player.getTopBook();
    if (!topBook) {
      this.showTooltip('Hold a book first to use Guide!');
      setTimeout(() => this.hideTooltip(), 2000);
      return;
    }

    playAbility();
    ability.cooldown = ability.maxCooldown;
    this.guideActive = true;
    this.guideTimer = 8;

    const targetShelf = this.shelfData.find(s => s.category === topBook.category);
    if (targetShelf) {
      this.guideTarget = targetShelf;
      this.showTooltip(`"${topBook.title}" belongs in Section ${targetShelf.section}: ${targetShelf.categoryName}`);
    }
  }

  updateGuide(dt) {
    if (!this.guideActive) return;
    this.guideTimer -= dt;
    if (this.guideTimer <= 0) {
      this.guideActive = false;
      this.guideTarget = null;
      this.hideTooltip();
    }
  }

  getGuideTarget() {
    return this.guideActive ? this.guideTarget : null;
  }

  showTooltip(text) {
    this.tooltipEl.textContent = text;
    this.tooltipEl.style.display = 'block';
  }

  hideTooltip() {
    this.tooltipEl.style.display = 'none';
  }
}
