import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EchoFx, fxBudget } from '../src/echo/EchoFx.js';

describe('echo hologram effects', () => {
  it('uses a shorter trail and fewer motes on touch quality', () => {
    expect(fxBudget('low')).toEqual({ trail: 8, particles: 12 });
    expect(fxBudget('high')).toEqual({ trail: 16, particles: 24 });
    const low = new EchoFx(new THREE.Group(), 0, 'low');
    const high = new EchoFx(new THREE.Group(), 0, 'high');
    expect(low.motes).toHaveLength(12);
    expect(high.motes).toHaveLength(24);
    low.dispose();
    high.dispose();
  });

  it('clears the motion ribbon when the echo swaps', () => {
    const fx = new EchoFx(new THREE.Group(), 0, 'high');
    fx.noteMotion({ speed: 3, swapped: false, x: 0, y: 0, z: 0 });
    fx.noteMotion({ speed: 3, swapped: false, x: 1, y: 0, z: 0 });
    expect(fx.trail.length).toBe(2);
    fx.noteMotion({ speed: 3, swapped: true, x: 9, y: 0, z: 9 });
    expect(fx.trail.length).toBe(0);
    fx.dispose();
  });
});
