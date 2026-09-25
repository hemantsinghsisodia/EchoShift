const JUMP_BUFFER_MS = 130;

/** Keyboard + pointer-lock mouse input. Produces an immutable snapshot per simulation tick. */
export class Input {
  constructor(element, settings) {
    this.element = element;
    this.settings = settings;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.jumpAt = -Infinity;
    this.interactQueued = false;
    this.locked = false;
    this.enabled = false;
    this.handlers = { restart: null, lockChange: null, keyDown: null };

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.keys.clear();
      this.handlers.lockChange?.(this.locked);
    });
    document.addEventListener('mousedown', (e) => {
      if (this.locked && this.enabled && e.button === 0) this.interactQueued = true;
    });
  }

  requestLock() {
    try {
      const p = this.element.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* pointer lock can be refused right after an exit; the pause screen lets the user retry */
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  onKeyDown(e) {
    if (e.repeat) {
      if (this.enabled && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      return;
    }
    if (this.handlers.keyDown?.(e.code)) {
      e.preventDefault();
      return;
    }
    if (!this.enabled) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
    if (e.code === 'Space') this.jumpAt = performance.now();
    if (e.code === 'KeyE') this.interactQueued = true;
    if (e.code === 'KeyQ') this.swapQueued = true;
    if (e.code === 'KeyF') this.freezeQueued = true;
    if (e.code === 'KeyR') this.handlers.restart?.();
  }

  onMouseMove(e) {
    if (!this.locked || !this.enabled) return;
    const s = 0.0022 * (this.settings.sensitivity ?? 1);
    this.yaw -= e.movementX * s;
    this.pitch -= e.movementY * s;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
  }

  setLook(yaw, pitch = 0) {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  snapshot() {
    const k = this.keys;
    const jump = performance.now() - this.jumpAt < JUMP_BUFFER_MS;
    if (jump) this.jumpAt = -Infinity;
    const interact = this.interactQueued;
    const swap = !!this.swapQueued;
    const freeze = !!this.freezeQueued;
    this.interactQueued = false;
    this.swapQueued = false;
    this.freezeQueued = false;
    return {
      forward: k.has('KeyW') || k.has('ArrowUp'),
      back: k.has('KeyS') || k.has('ArrowDown'),
      left: k.has('KeyA') || k.has('ArrowLeft'),
      right: k.has('KeyD') || k.has('ArrowRight'),
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
      jump,
      interact,
      swap,
      freeze,
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }
}

export function idleInput(yaw = 0, pitch = 0) {
  return { forward: false, back: false, left: false, right: false, sprint: false, jump: false, interact: false, swap: false, freeze: false, yaw, pitch };
}
