import * as THREE from 'three';
import { FOG_COLOR } from './Renderer.js';

const FADE = 1.5;
const DARK = 1.0;

/**
 * Ending sequence visuals: the lab powers down (lights, neon, light cones fade), a beat of
 * darkness, then pulsing red emergency lighting with red fog and a sustained rumble.
 */
export class EndingFX {
  constructor({ lightRig, mats, scene, shake, coneMats }) {
    this.lightRig = lightRig;
    this.mats = mats;
    this.scene = scene;
    this.shake = shake;
    this.coneMats = Object.values(coneMats);
    this.coneBase = this.coneMats.map((m) => m.uniforms.uIntensity.value);
    this.active = false;
    this.t = 0;
    this.fogBase = new THREE.Color(FOG_COLOR);
    this.fogRed = new THREE.Color(0x1c0306);
    this.neonRed = new THREE.Color(1.6, 0.08, 0.12);
    this.phase = 'idle';
  }

  start() {
    this.active = true;
    this.t = 0;
    this.phase = 'powerdown';
  }

  reset() {
    this.active = false;
    this.t = 0;
    this.phase = 'idle';
    this.apply(1, 0, 0);
  }

  apply(power, emergency, time) {
    this.lightRig.power = power;
    this.lightRig.emergency = emergency;
    for (const key of ['blue', 'blueDim', 'green', 'white', 'purple', 'cyan', 'wireOn', 'wireOff']) {
      const m = this.mats[key];
      m.color.copy(m.userData.baseColor).multiplyScalar(Math.max(0.3, power));
    }
    const neon = this.mats.neon;
    neon.color.copy(neon.userData.baseColor).multiplyScalar(Math.max(0.03, power));
    if (emergency > 0) {
      const pulse = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(time * 5), 2);
      neon.color.lerp(this.neonRed.clone().multiplyScalar(pulse), emergency);
    }
    this.coneMats.forEach((m, i) => {
      m.uniforms.uIntensity.value = this.coneBase[i] * Math.max(0.05, power) * (1 - 0.7 * emergency);
    });
    this.scene.fog.color.copy(this.fogBase).lerp(this.fogRed, emergency);
    this.scene.background.copy(this.scene.fog.color);
    this.shake.sustained = emergency * 0.22;
  }

  /** elapsed: seconds of simulation time since the ending began (keeps FX in step with the sim). */
  update(dt, time, elapsed = null) {
    if (!this.active) return;
    this.t = elapsed ?? this.t + dt;
    const t = this.t;
    if (t < FADE) {
      const k = t / FADE;
      const flick = k > 0.3 ? (Math.sin(time * 60) > 0.3 ? 1 : 0.4) : 1;
      this.apply((1 - k) * flick, 0, time);
    } else if (t < FADE + DARK) {
      this.phase = 'dark';
      this.apply(0.02, 0, time);
    } else {
      this.phase = 'emergency';
      const e = Math.min(1, (t - FADE - DARK) / 0.6);
      this.apply(0.25, e, time);
    }
  }
}
