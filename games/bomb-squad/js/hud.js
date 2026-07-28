// HUD - instruction panel, timer, progress display

const COMPONENT_ICONS = {
  wire: '〰',
  button: '⏺',
  keypad: '🔢',
  switch: '🔀',
  turnKey: '🔑',
  holdButton: '⏹',
  pressureValve: '🎛️',
};

const VARIANT_COLORS = {
  red: '#e74c3c',
  blue: '#3498db',
  yellow: '#f1c40f',
  white: '#ecf0f1',
  black: '#2c3e50',
  green: '#2ecc71',
  brass: '#d4a017',
  silver: '#c0c0c0',
  copper: '#b87333',
};

export class HUD {
  constructor() {
    this.hudEl = document.getElementById('hud');
    this.timerText = document.getElementById('timer-text');
    this.levelInfo = document.getElementById('level-info');
    this.instructionPanel = document.getElementById('instruction-panel');
    this.steps = [];
    this.currentStep = 0;
  }

  show() {
    this.hudEl.classList.remove('hidden');
  }

  hide() {
    this.hudEl.classList.add('hidden');
  }

  setLevel(level, round) {
    this.levelInfo.textContent = `Level ${level} - Round ${round}/5`;
  }

  setTimer(time) {
    const t = Math.max(0, time);
    this.timerText.textContent = t.toFixed(1);
    // Color shift
    if (t <= 10) {
      this.timerText.style.color = '#e74c3c';
    } else if (t <= 20) {
      this.timerText.style.color = '#f1c40f';
    } else {
      this.timerText.style.color = '#2ecc71';
    }
  }

  setSolution(solution) {
    this.instructionPanel.innerHTML = '';
    this.steps = [];
    this.currentStep = 0;

    solution.forEach((step, i) => {
      const el = document.createElement('div');
      el.className = 'instruction-step' + (i === 0 ? ' active' : '');

      const icon = document.createElement('div');
      icon.className = 'step-icon';
      icon.textContent = COMPONENT_ICONS[step.type] || '?';
      const varColor = VARIANT_COLORS[step.variant];
      if (varColor) {
        if (step.type === 'wire') {
          // Wire: show the color as the icon's text color, dark background
          icon.style.background = '#1a1a2e';
          icon.style.borderColor = varColor;
          icon.style.color = varColor;
          icon.style.textShadow = `0 0 6px ${varColor}`;
        } else {
          icon.style.background = varColor;
          icon.style.borderColor = varColor;
        }
      }

      const label = document.createElement('div');
      label.className = 'step-label';
      label.textContent = this.formatLabel(step);

      const tick = document.createElement('div');
      tick.className = 'step-tick';
      tick.textContent = '✓';

      el.appendChild(icon);
      el.appendChild(label);
      el.appendChild(tick);
      this.instructionPanel.appendChild(el);
      this.steps.push(el);
    });
  }

  formatLabel(step) {
    const variant = step.variant ? step.variant.charAt(0).toUpperCase() + step.variant.slice(1) : '';
    const typeNames = {
      wire: 'Wire',
      button: 'Button',
      keypad: 'Keypad',
      switch: 'Switch',
      turnKey: 'Key',
      holdButton: 'Hold Btn',
      pressureValve: 'Valve',
    };
    const typeName = typeNames[step.type] || step.type;
    // Don't reveal the keypad code in the HUD — it's on the bomb body
    if (step.type === 'keypad') return 'Keypad';
    return variant ? `${variant} ${typeName}` : typeName;
  }

  advanceStep() {
    if (this.currentStep < this.steps.length) {
      this.steps[this.currentStep].classList.remove('active');
      this.steps[this.currentStep].classList.add('done');
      this.currentStep++;
      if (this.currentStep < this.steps.length) {
        this.steps[this.currentStep].classList.add('active');
      }
    }
  }

  reset() {
    this.instructionPanel.innerHTML = '';
    this.steps = [];
    this.currentStep = 0;
  }
}
