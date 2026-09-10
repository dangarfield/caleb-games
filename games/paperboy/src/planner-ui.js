// The small draggable panel: a list of placed entities, and a detail view for
// editing one. Everything writes straight into the plan, which redraws the 3D.
import { ENTITY_TYPES } from './config.js';
import { state } from './config.js';

const CSS = `
#plannerUI { position: fixed; top: 70px; left: 10px; z-index: 40; width: 244px;
  font: 11px/1.35 ui-monospace, monospace; color: #e8e8f0;
  background: rgba(14,14,30,.94); border: 1px solid #3a3a5c; border-radius: 6px;
  box-shadow: 0 6px 20px rgba(0,0,0,.5); user-select: none; }
#plannerUI[hidden] { display: none !important; }
#plannerUI h4 { margin: 0; padding: 6px 8px; font-size: 11px; letter-spacing: .04em;
  background: #26264a; border-radius: 5px 5px 0 0; cursor: move; display: flex;
  justify-content: space-between; }
#plannerUI .body { padding: 6px 8px 8px; max-height: 58vh; overflow-y: auto; }
#plannerUI .row { display: flex; align-items: center; gap: 5px; padding: 3px 4px;
  border-radius: 3px; cursor: pointer; }
#plannerUI .row:hover { background: #24244a; }
#plannerUI .row.sel { background: #34346a; }
#plannerUI .sw { width: 9px; height: 9px; border-radius: 2px; flex: 0 0 auto; }
#plannerUI .row .co { color: #9a9ab8; margin-left: auto; }
#plannerUI label { display: flex; align-items: center; gap: 5px; margin: 3px 0; }
#plannerUI label span { width: 62px; color: #9a9ab8; }
#plannerUI input[type=number], #plannerUI select { flex: 1; min-width: 0;
  background: #10102a; color: #e8e8f0; border: 1px solid #3a3a5c;
  border-radius: 3px; padding: 2px 4px; font: inherit; }
#plannerUI input[type=checkbox] { accent-color: #6c5ce7; }
#plannerUI button { font: inherit; color: #e8e8f0; background: #34346a; cursor: pointer;
  border: 1px solid #4a4a80; border-radius: 3px; padding: 3px 7px; }
#plannerUI button:hover { background: #414180; }
#plannerUI button.wide { width: 100%; margin-top: 5px; }
#plannerUI .bar { display: flex; gap: 4px; margin-top: 6px; }
#plannerUI .bar button { flex: 1; }
#plannerUI .wp { display: flex; gap: 4px; align-items: center; margin: 2px 0; }
#plannerUI .wp input { width: 44px; }
#plannerUI .hint { color: #7a7a99; margin: 4px 0 0; }
#plannerUI .danger { background: #5c2230; border-color: #8a3346; }
`;

export class PlannerUI {
    constructor(plan) {
        this.plan = plan;
        this.mode = 'list';
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        this.el = document.createElement('div');
        this.el.id = 'plannerUI';
        this.el.hidden = true;
        this.el.innerHTML = '<h4><span>Enemy planner</span><span id="plCount"></span></h4><div class="body"></div>';
        document.body.appendChild(this.el);
        this.body = this.el.querySelector('.body');
        this.makeDraggable(this.el.querySelector('h4'));
        plan.onChange = () => this.render();
    }

    setVisible(on) { this.el.hidden = !on; if (on) this.render(); }

    makeDraggable(handle) {
        let ox = 0, oy = 0, dragging = false;
        handle.addEventListener('pointerdown', ev => {
            dragging = true;
            const r = this.el.getBoundingClientRect();
            ox = ev.clientX - r.left;
            oy = ev.clientY - r.top;
            handle.setPointerCapture(ev.pointerId);
        });
        handle.addEventListener('pointermove', ev => {
            if (!dragging) return;
            this.el.style.left = `${ev.clientX - ox}px`;
            this.el.style.top = `${ev.clientY - oy}px`;
        });
        const end = () => { dragging = false; };
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    }

    render() {
        const sel = this.plan.selected;
        this.el.querySelector('#plCount').textContent = `${this.plan.entities.length}`;
        if (this.mode === 'detail' && sel) this.renderDetail(sel);
        else { this.mode = 'list'; this.renderList(); }
    }

    renderList() {
        const b = this.body;
        b.innerHTML = '';
        if (!this.plan.entities.length) {
            b.insertAdjacentHTML('beforeend',
                '<p class="hint">Nothing placed yet. Pick a type and add one, then drag it in the view.</p>');
        }
        for (const e of this.plan.entities) {
            const spec = ENTITY_TYPES[e.type];
            const row = document.createElement('div');
            row.className = 'row' + (e.id === this.plan.selectedId ? ' sel' : '');
            row.innerHTML = `<i class="sw" style="background:#${spec.colour.toString(16).padStart(6, '0')}"></i>`
                + `<b>${spec.label}</b><span class="co">x ${e.spawn.x.toFixed(0)} z ${e.spawn.z.toFixed(0)}`
                + `${e.waypoints.length ? ` · ${e.waypoints.length}wp` : ''}</span>`;
            row.onclick = () => { this.plan.select(e.id); this.mode = 'detail'; this.render(); };
            b.appendChild(row);
        }

        const types = Object.entries(ENTITY_TYPES)
            .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
        b.insertAdjacentHTML('beforeend',
            `<label style="margin-top:6px"><span>Add</span><select id="plType">${types}</select></label>`
            + '<button class="wide" id="plAdd">Add at view centre</button>'
            + '<div class="bar"><button id="plExport">Export</button><button id="plImport">Import</button></div>');

        b.querySelector('#plAdd').onclick = () => {
            const type = b.querySelector('#plType').value;
            this.plan.add(type, state.plannerX, state.plannerCentreZ);
            this.mode = 'detail';
            this.render();
        };
        b.querySelector('#plExport').onclick = () => this.exportJSON();
        b.querySelector('#plImport').onclick = () => this.importJSON();
    }

    renderDetail(e) {
        const spec = ENTITY_TYPES[e.type];
        const types = Object.entries(ENTITY_TYPES)
            .map(([k, v]) => `<option value="${k}"${k === e.type ? ' selected' : ''}>${v.label}</option>`).join('');
        const wps = e.waypoints.map((w, i) => `<div class="wp"><span style="color:#9a9ab8">${i + 1}</span>`
            + `<input type="number" step="0.5" data-wp="${i}" data-axis="x" value="${w.x}">`
            + `<input type="number" step="0.5" data-wp="${i}" data-axis="z" value="${w.z}">`
            + `<button data-del="${i}">×</button></div>`).join('');

        this.body.innerHTML = `
      <div class="bar"><button id="plBack">‹ Back</button>
        <b style="flex:2;text-align:right;color:#${spec.colour.toString(16).padStart(6, '0')}">${spec.label}</b></div>
      <label><span>Type</span><select id="plT">${types}</select></label>
      <label><span>Spawn x</span><input type="number" step="0.5" id="plSX" value="${e.spawn.x}"></label>
      <label><span>Spawn y</span><input type="number" step="0.1" id="plSY" value="${e.spawn.y}"></label>
      <label><span>Spawn z</span><input type="number" step="0.5" id="plSZ" value="${e.spawn.z}"></label>
      <label><span>Facing°</span><input type="number" step="5" id="plDir" value="${e.dir ?? ''}" placeholder="auto"></label>
      <label><span>Trigger x</span><input type="number" step="0.5" id="plTX" value="${e.trigger.x}"></label>
      <label><span>Trigger z</span><input type="number" step="0.5" id="plTZ" value="${e.trigger.z}"></label>
      <label><span>Repeat</span><input type="checkbox" id="plRep"${e.repeat ? ' checked' : ''}></label>
      <p class="hint">Speed is per type — Enemy Planner &gt; Speeds</p>
      <p class="hint">Waypoints (x, z) — drag them in the view too</p>
      ${wps}
      <button class="wide" id="plAddWp">+ waypoint</button>
      <button class="wide danger" id="plDel">Delete this one</button>
      <p class="hint">Facing blank = look at the first waypoint.</p>`;

        const b = this.body;
        b.querySelector('#plBack').onclick = () => { this.mode = 'list'; this.render(); };
        b.querySelector('#plT').onchange = ev => { e.type = ev.target.value; this.plan.changed(); };
        const num = (id, apply) => {
            b.querySelector(id).onchange = ev => { apply(parseFloat(ev.target.value)); this.plan.changed(); };
        };
        num('#plSX', v => e.spawn.x = v);
        num('#plSY', v => e.spawn.y = v);
        num('#plSZ', v => e.spawn.z = v);
        num('#plTX', v => e.trigger.x = v);
        num('#plTZ', v => e.trigger.z = v);
        b.querySelector('#plDir').onchange = ev => {
            const raw = ev.target.value.trim();
            e.dir = raw === '' ? null : parseFloat(raw);
            this.plan.changed();
        };
        b.querySelector('#plRep').onchange = ev => { e.repeat = ev.target.checked; this.plan.changed(); };
        b.querySelector('#plAddWp').onclick = () => this.plan.addWaypoint(e.id);
        b.querySelector('#plDel').onclick = () => { this.plan.remove(e.id); this.mode = 'list'; this.render(); };
        b.querySelectorAll('[data-wp]').forEach(input => {
            input.onchange = ev => {
                const w = e.waypoints[+ev.target.dataset.wp];
                w[ev.target.dataset.axis] = parseFloat(ev.target.value);
                this.plan.changed();
            };
        });
        b.querySelectorAll('[data-del]').forEach(btn => {
            btn.onclick = () => this.plan.removeWaypoint(e.id, +btn.dataset.del);
        });
    }

    exportJSON() {
        const json = this.plan.toJSON();
        navigator.clipboard?.writeText(json)
            .then(() => console.log('Plan copied to the clipboard'))
            .catch(() => {});
        console.log(json);
    }

    importJSON() {
        const raw = prompt('Paste a plan JSON');
        if (!raw) return;
        try {
            const data = JSON.parse(raw);
            this.plan.adopt(data.plan || data);
            this.plan.save();
            this.mode = 'list';
            this.render();
        } catch (err) {
            console.warn('That was not valid plan JSON:', err.message);
        }
    }
}
