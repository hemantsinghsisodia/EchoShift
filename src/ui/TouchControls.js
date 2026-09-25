const RADIUS = 58;
const TAP_PX = 14;

/**
 * On-screen stick, look drag and action buttons. Writes into Input; the simulation is unchanged.
 */
export class TouchControls {
  constructor(input, { onPause, onEdit, onHint } = {}) {
    this.input = input;
    this.onPause = onPause;
    this.onEdit = onEdit;
    this.onHint = onHint;
    this.root = document.getElementById('touch-layer');
    this.moveZone = document.getElementById('touch-move');
    this.lookZone = document.getElementById('touch-look');
    this.stick = document.getElementById('touch-stick');
    this.knob = this.stick.querySelector('i');
    this.moveId = null;
    this.lookId = null;
    this.origin = { x: 0, y: 0 };
    this.lookAt = { x: 0, y: 0 };
    this.lookTravel = 0;
    this.bind();
  }

  bind() {
    this.moveZone.addEventListener('pointerdown', (e) => this.beginMove(e));
    this.moveZone.addEventListener('pointermove', (e) => this.dragMove(e));
    this.moveZone.addEventListener('pointerup', (e) => this.endMove(e));
    this.moveZone.addEventListener('pointercancel', (e) => this.endMove(e));

    this.lookZone.addEventListener('pointerdown', (e) => this.beginLook(e));
    this.lookZone.addEventListener('pointermove', (e) => this.dragLook(e));
    this.lookZone.addEventListener('pointerup', (e) => this.endLook(e));
    this.lookZone.addEventListener('pointercancel', (e) => this.endLook(e));

    this.root.querySelectorAll('[data-touch]').forEach((button) => {
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onButton(button.dataset.touch, button);
      });
    });
  }

  setVisible(on) {
    this.root.classList.toggle('hidden', !on);
    if (!on) this.releaseMove();
  }

  sync(sim) {
    const ab = sim.abilities;
    document.getElementById('touch-swap').classList.toggle('hidden', !ab.allowed('swap'));
    document.getElementById('touch-freeze').classList.toggle('hidden', !ab.allowed('freeze'));
    document.getElementById('touch-edit').classList.toggle('hidden', !sim.room?.cfg.edits);
    document.getElementById('touch-hint').classList.toggle('hidden', sim.room?.kind !== 'puzzle');
    document.getElementById('touch-sprint').classList.toggle('on', this.input.sprintHeld);
  }

  beginMove(e) {
    if (this.moveId != null) return;
    this.moveId = e.pointerId;
    this.origin = { x: e.clientX, y: e.clientY };
    this.stick.classList.remove('hidden');
    this.placeStick(0, 0);
    this.moveZone.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  dragMove(e) {
    if (e.pointerId !== this.moveId) return;
    const dx = e.clientX - this.origin.x;
    const dy = e.clientY - this.origin.y;
    const len = Math.hypot(dx, dy) || 1;
    const scale = Math.min(1, RADIUS / len);
    const cx = dx * scale;
    const cy = dy * scale;
    this.placeStick(cx, cy);
    this.input.setMove(cx / RADIUS, -cy / RADIUS);
  }

  endMove(e) {
    if (e.pointerId !== this.moveId) return;
    this.releaseMove();
  }

  releaseMove() {
    this.moveId = null;
    this.input.setMove(0, 0);
    this.stick.classList.add('hidden');
  }

  placeStick(cx, cy) {
    this.stick.style.left = `${this.origin.x}px`;
    this.stick.style.top = `${this.origin.y}px`;
    this.knob.style.transform = `translate(${cx}px, ${cy}px)`;
  }

  beginLook(e) {
    if (this.lookId != null) return;
    this.lookId = e.pointerId;
    this.lookAt = { x: e.clientX, y: e.clientY };
    this.lookTravel = 0;
    this.lookZone.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  dragLook(e) {
    if (e.pointerId !== this.lookId) return;
    const dx = e.clientX - this.lookAt.x;
    const dy = e.clientY - this.lookAt.y;
    this.lookTravel += Math.hypot(dx, dy);
    this.lookAt = { x: e.clientX, y: e.clientY };
    this.input.addLook(dx, dy);
  }

  endLook(e) {
    if (e.pointerId !== this.lookId) return;
    this.lookId = null;
    if (this.lookTravel < TAP_PX) this.input.press('interact');
  }

  onButton(action, button) {
    if (action === 'sprint') {
      this.input.setSprint(!this.input.sprintHeld);
      button.classList.toggle('on', this.input.sprintHeld);
      return;
    }
    if (action === 'pause') {
      this.onPause?.();
      return;
    }
    if (action === 'edit') {
      this.onEdit?.();
      return;
    }
    if (action === 'hint') {
      this.onHint?.();
      return;
    }
    this.input.press(action);
  }
}
