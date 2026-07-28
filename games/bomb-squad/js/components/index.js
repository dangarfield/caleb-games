// Component registry - exports all component types
import { WireComponent } from './wire.js';
import { ButtonComponent } from './button.js';
import { KeypadComponent } from './keypad.js';
import { SwitchComponent } from './switch.js';
import { TurnKeyComponent } from './turn-key.js';
import { HoldButtonComponent } from './hold-button.js';
import { PressureValveComponent } from './pressure-valve.js';

export const COMPONENTS = {
  wire: new WireComponent(),
  button: new ButtonComponent(),
  keypad: new KeypadComponent(),
  switch: new SwitchComponent(),
  turnKey: new TurnKeyComponent(),
  holdButton: new HoldButtonComponent(),
  pressureValve: new PressureValveComponent(),
};

export function getComponentInstance(type) {
  return COMPONENTS[type] || null;
}

export function getVariantsForType(type) {
  const map = {
    wire: WireComponent.variants,
    button: ButtonComponent.variants,
    keypad: KeypadComponent.variants,
    switch: SwitchComponent.variants,
    turnKey: TurnKeyComponent.variants,
    holdButton: HoldButtonComponent.variants,
    pressureValve: PressureValveComponent.variants,
  };
  return map[type] || [];
}
