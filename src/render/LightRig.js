import * as THREE from 'three';

const POOL = 5;
const CURRENT_SLOTS = 3;

/**
 * A fixed pool of point lights that is re-anchored to the active room (and the next one),
 * so the light count - and therefore the compiled shaders - never change.
 */
export class LightRig {
  constructor(scene) {
    this.hemi = new THREE.HemisphereLight(0x5068c8, 0x140a1e, 0.9);
    scene.add(this.hemi);
    this.lights = [];
    for (let i = 0; i < POOL; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 24, 1.7);
      scene.add(l);
      this.lights.push({ light: l, base: 0, color: new THREE.Color(), pos: new THREE.Vector3() });
    }
    this.mode = 'normal';
    this.power = 1;
    this.emergency = 0;
    this.baseIntensity = 18;
    this.lastTime = 0;
  }

  flicker(seconds = 0.3) {
    this.flickerUntil = this.lastTime + seconds;
  }

  assign(currentInfo, nextInfo) {
    const anchors = [];
    currentInfo?.lights.slice(0, CURRENT_SLOTS).forEach((l) => anchors.push(l));
    nextInfo?.lights.slice(0, POOL - anchors.length).forEach((l) => anchors.push(l));
    this.lights.forEach((slot, i) => {
      const a = anchors[i];
      if (a) {
        slot.pos.copy(a.pos);
        slot.color.copy(a.color);
        slot.base = this.baseIntensity;
      } else {
        slot.base = 0;
      }
      slot.light.position.copy(slot.pos);
      slot.light.color.copy(slot.color);
    });
  }

  update(time) {
    this.lastTime = time;
    const glitch = time < (this.flickerUntil ?? 0) ? (Math.sin(time * 110) > 0.15 ? 1 : 0.1) : 1;
    const red = new THREE.Color(1, 0.06, 0.08);
    for (let i = 0; i < this.lights.length; i++) {
      const s = this.lights[i];
      const flicker = 0.96 + 0.04 * Math.sin(time * 13 + i * 7.1) * Math.sin(time * 3.3 + i);
      let intensity = s.base * this.power * flicker;
      s.light.color.copy(s.color);
      if (this.emergency > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 5 + (i % 2) * Math.PI);
        s.light.color.lerp(red, this.emergency);
        intensity = THREE.MathUtils.lerp(intensity, s.base * 0.9 * pulse * pulse + 3, this.emergency);
      }
      intensity *= glitch;
      s.light.intensity = intensity;
    }
    this.hemi.intensity = 0.9 * Math.max(0.12, this.power) * (1 - 0.6 * this.emergency);
  }
}
