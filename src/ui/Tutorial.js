const STEPS = [
  { text: 'Use <b>W A S D</b> to move and the <em>mouse</em> to look around.' },
  { text: 'Hold <b>SHIFT</b> to sprint. Press <b>SPACE</b> to jump.' },
  { text: 'Stand on the glowing <em>pressure plate</em> and watch the <em>ECHO CYCLE</em> timer (top right).' },
  { text: 'That hologram is your <em>Echo</em>. It repeats your last 15 seconds, then holds its final position. Let it hold the plate while you go through the gate.' },
  { text: 'Look at the <em>white energy node</em> and press <b>E</b> to charge it.' },
  { text: 'Room clear. The exit is open. Press <b>R</b> any time to restart a room if you get stuck.' },
];

/** Action-driven tutorial for room 1: each step advances when the player does the thing. */
export class Tutorial {
  constructor(ui, sim) {
    this.ui = ui;
    this.sim = sim;
    this.step = -1;
    this.active = false;
    this.startPos = null;
    this.stepTime = 0;
    this.offs = [];
  }

  start() {
    this.stop();
    this.active = true;
    this.startPos = { ...this.sim.player.pos };
    const bus = this.sim.bus;
    this.offs.push(
      bus.on('player:jump', () => this.step === 1 && this.go(2)),
      bus.on('echo:spawn', () => this.step < 3 && this.go(3)),
      bus.on('room:complete', ({ room }) => room.index === 0 && this.go(5)),
      bus.on('room:enter', ({ room }) => room.index > 0 && this.stop()),
    );
    this.go(0);
  }

  stop() {
    this.offs.forEach((off) => off());
    this.offs = [];
    this.active = false;
    this.ui.tutorial(null);
  }

  go(i) {
    if (i <= this.step) return;
    this.step = i;
    this.stepTime = 0;
    this.ui.tutorial(STEPS[i].text, `${i + 1}/${STEPS.length}`);
  }

  update(dt) {
    if (!this.active) return;
    this.stepTime += dt;
    const p = this.sim.player.pos;
    const room = this.sim.rooms[0];
    if (this.step === 0 && Math.hypot(p.x - this.startPos.x, p.z - this.startPos.z) > 2) this.go(1);
    else if (this.step === 1 && this.stepTime > 6) this.go(2);
    else if (this.step === 3 && p.z < room.byId.d1.pos.z - 0.5) this.go(4);
    else if (this.step === 5 && this.stepTime > 7) this.ui.tutorial(null);
  }
}
