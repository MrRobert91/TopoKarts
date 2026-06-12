/** Gestión de teclado con mapeos por jugador. */
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // teclas presionadas este frame
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  endFrame() { this.pressed.clear(); }
  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
}

export const P1_MAP = {
  left: 'KeyA', right: 'KeyD', accel: 'KeyW', brake: 'KeyS',
  drift: 'ShiftLeft', item: 'KeyE', lookBack: 'KeyQ', respawn: 'KeyR',
};
export const P2_MAP = {
  left: 'ArrowLeft', right: 'ArrowRight', accel: 'ArrowUp', brake: 'ArrowDown',
  drift: 'ShiftRight', drift2: 'ControlRight', item: 'Enter', lookBack: 'Backspace', respawn: 'KeyP',
};

export function readControls(input, map) {
  return {
    left: input.down(map.left),
    right: input.down(map.right),
    accel: input.down(map.accel),
    brake: input.down(map.brake),
    drift: input.down(map.drift) || (map.drift2 && input.down(map.drift2)),
    item: input.hit(map.item),
    lookBack: input.down(map.lookBack),
    respawn: input.hit(map.respawn),
  };
}
