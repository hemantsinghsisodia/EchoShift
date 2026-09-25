import { describe, it, expect } from 'vitest';
import { Input } from '../src/core/Input.js';

const input = () => new Input(null, { sensitivity: 1 });

describe('touch input', () => {
  it('maps a joystick past the deadzone, and sprints only when pushed hard', () => {
    const pad = input();
    pad.setMove(0, 0.5);
    expect(pad.snapshot()).toMatchObject({ forward: true, back: false, left: false, right: false, sprint: false });
    pad.setMove(-0.5, 0);
    expect(pad.snapshot().left).toBe(true);
    pad.setMove(0.5, -0.5);
    expect(pad.snapshot()).toMatchObject({ right: true, back: true, forward: false });
    pad.setMove(0, 0.2);
    expect(pad.snapshot().forward).toBe(false);
    pad.setMove(0, 0.95);
    expect(pad.snapshot()).toMatchObject({ forward: true, sprint: true });
  });

  it('sprints from the toggle without moving', () => {
    const pad = input();
    pad.setSprint(true);
    expect(pad.snapshot().sprint).toBe(true);
    expect(pad.snapshot().forward).toBe(false);
  });

  it('presses jump once inside the buffer', () => {
    const pad = input();
    pad.press('jump');
    expect(pad.snapshot().jump).toBe(true);
    expect(pad.snapshot().jump).toBe(false);
  });

  it('queues interact, swap and freeze for a single snapshot', () => {
    const pad = input();
    pad.press('interact');
    pad.press('swap');
    pad.press('freeze');
    expect(pad.snapshot()).toMatchObject({ interact: true, swap: true, freeze: true });
    expect(pad.snapshot()).toMatchObject({ interact: false, swap: false, freeze: false });
  });

  it('clamps look pitch', () => {
    const pad = input();
    pad.addLook(0, -100000);
    expect(pad.pitch).toBe(1.5);
    pad.addLook(0, 100000);
    expect(pad.pitch).toBe(-1.5);
  });

  it('keeps keyboard movement when the stick is centered', () => {
    const pad = input();
    pad.keys.add('KeyW');
    pad.keys.add('KeyD');
    pad.keys.add('ShiftLeft');
    expect(pad.snapshot()).toMatchObject({ forward: true, right: true, left: false, sprint: true });
  });
});
