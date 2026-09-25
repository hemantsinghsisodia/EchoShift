import * as THREE from 'three';
import { COLORS, TICK_RATE } from '../core/config.js';
import { PressurePlate } from '../objects/PressurePlate.js';
import { Switch } from '../objects/Switch.js';
import { TimedButton } from '../objects/TimedButton.js';
import { Door } from '../objects/Door.js';
import { MovingPlatform } from '../objects/MovingPlatform.js';
import { Laser } from '../objects/Laser.js';
import { EnergyNode } from '../objects/EnergyNode.js';
import { EchoFurnace } from '../objects/EchoFurnace.js';
import { createConeMaterial, createLightCone } from './LightCones.js';

const mesh = (geo, mat, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  return m;
};

class PlateView {
  constructor(obj, { mats, geos }) {
    this.obj = obj;
    this.mats = mats;
    const s = obj.size;
    this.group = new THREE.Group();
    this.group.position.set(obj.pos.x, obj.pos.y, obj.pos.z);
    const base = mesh(geos.box, mats.metalDark, s + 0.2, 0.08, s + 0.2);
    base.position.y = 0.04;
    this.ring = mesh(geos.squareRing, mats.blue, s, 1, s);
    this.ring.position.y = 0.085;
    this.pad = mesh(geos.box, mats.metal, s - 0.35, 0.06, s - 0.35);
    this.pad.position.y = 0.11;
    this.glyph = mesh(geos.flatDisc, mats.blue, 0.35, 1, 0.35);
    this.glyph.position.y = 0.145;
    this.group.add(base, this.ring, this.pad, this.glyph);
    this.pressT = 0;
  }

  update(time, alpha, dt) {
    const on = this.obj.signal;
    this.pressT += ((on ? 1 : 0) - this.pressT) * Math.min(1, dt * 14);
    const mat = on ? this.mats.green : this.mats.blue;
    this.ring.material = mat;
    this.glyph.material = mat;
    this.pad.position.y = 0.11 - 0.035 * this.pressT;
    this.glyph.position.y = this.pad.position.y + 0.035;
    const pulse = on ? 1 : 1 + 0.03 * Math.sin(time * 3);
    this.ring.scale.set(this.obj.size * pulse, 1, this.obj.size * pulse);
  }
}

class ConsoleView {
  constructor(obj, { mats, geos }) {
    this.obj = obj;
    this.mats = mats;
    this.group = new THREE.Group();
    this.group.position.set(obj.pos.x, obj.pos.y, obj.pos.z);
    this.group.rotation.y = obj.facingYaw;
    const pedestal = mesh(geos.box, mats.metal, 0.5, 1.0, 0.5);
    pedestal.position.y = 0.5;
    const foot = mesh(geos.box, mats.metalDark, 0.7, 0.06, 0.7);
    foot.position.y = 0.03;
    this.strip = mesh(geos.box, mats.blue, 0.4, 0.05, 0.02);
    this.strip.position.set(0, 0.75, 0.26);
    this.panel = new THREE.Group();
    this.panel.position.y = 1.04;
    this.panel.rotation.x = 0.38;
    const top = mesh(geos.box, mats.metalDark, 0.62, 0.08, 0.62);
    this.button = mesh(geos.cylinder, mats.blue, 0.26, 0.08, 0.26);
    this.button.position.y = 0.06;
    this.panel.add(top, this.button);
    this.group.add(pedestal, foot, this.strip, this.panel);
    this.segments = [];
    if (obj instanceof TimedButton) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const seg = mesh(geos.box, mats.blueDim, 0.05, 0.03, 0.09);
        seg.position.set(Math.sin(a) * 0.24, 0.05, Math.cos(a) * 0.24);
        seg.rotation.y = a;
        this.panel.add(seg);
        this.segments.push(seg);
      }
    }
    this.holo = mesh(geos.torus, mats.blue, 0.42, 0.42, 0.42);
    this.holo.position.y = 1.55;
    this.holo.rotation.x = Math.PI / 2;
    this.group.add(this.holo);
  }

  update(time) {
    const o = this.obj;
    const since = (o.room.clock - o.lastPressTick) / TICK_RATE;
    const flash = since >= 0 && since < 0.25;
    let on = o.signal;
    if (o instanceof Switch && o.mode === 'pulse') on = o.signal;
    const mat = on || flash ? this.mats.green : this.mats.blue;
    this.button.material = mat;
    this.strip.material = mat;
    this.holo.material = mat;
    this.button.position.y = flash ? 0.03 : 0.06;
    this.holo.rotation.z = time * (on ? 3 : 0.8);
    const bob = 1.55 + Math.sin(time * 2 + o.pos.x) * 0.04;
    this.holo.position.y = bob;
    const hs = 0.42 * (flash ? 1.3 : 1);
    this.holo.scale.set(hs, hs, hs);
    if (this.segments.length) {
      const r = o.remaining;
      this.segments.forEach((s, i) => {
        s.material = r > i / this.segments.length ? this.mats.green : this.mats.blueDim;
      });
    }
  }
}

class DoorView {
  constructor(obj, { mats, geos }) {
    this.obj = obj;
    this.mats = mats;
    const w = obj.width;
    const h = obj.doorHeight;
    const t = obj.thickness;
    this.group = new THREE.Group();
    this.group.position.set(obj.pos.x, obj.pos.y, obj.pos.z);
    if (obj.axis === 'z') this.group.rotation.y = Math.PI / 2;
    const postL = mesh(geos.box, mats.metalDark, 0.3, h + 0.3, t + 0.3);
    postL.position.set(-w / 2 - 0.15, (h + 0.3) / 2, 0);
    const postR = postL.clone();
    postR.position.x = w / 2 + 0.15;
    const header = mesh(geos.box, mats.metalDark, w + 0.6, 0.3, t + 0.3);
    header.position.y = h + 0.15;
    this.indicators = [];
    for (const side of [-1, 1]) {
      const bar = mesh(geos.box, mats.blue, w, 0.06, 0.02);
      bar.position.set(0, h + 0.05, side * (t / 2 + 0.16));
      const vl = mesh(geos.box, mats.blue, 0.05, h, 0.02);
      vl.position.set(-w / 2 - 0.15, h / 2, side * (t / 2 + 0.16));
      const vr = vl.clone();
      vr.position.x = w / 2 + 0.15;
      this.indicators.push(bar, vl, vr);
    }
    this.left = new THREE.Group();
    this.right = new THREE.Group();
    for (const [g, sgn] of [
      [this.left, -1],
      [this.right, 1],
    ]) {
      const panel = mesh(geos.box, mats.door, w / 2, h, t);
      panel.position.y = h / 2;
      const stripe = mesh(geos.box, mats.blue, w / 2 - 0.2, 0.06, t + 0.02);
      stripe.position.y = h * 0.55;
      const stripe2 = mesh(geos.box, mats.blue, 0.05, h * 0.6, t + 0.02);
      stripe2.position.set(-sgn * (w / 4 - 0.04), h / 2, 0);
      g.add(panel, stripe, stripe2);
      this.indicators.push(stripe, stripe2);
      g.userData.base = (sgn * w) / 4;
      g.position.x = g.userData.base;
    }
    this.group.add(postL, postR, header, this.left, this.right, ...this.indicators.filter((m) => !m.parent));
  }

  state() {
    const o = this.obj;
    if (o.sealed || o.locked) return this.mats.red;
    if (!o.blocking) return this.mats.green;
    if (o.role === 'exit') return this.mats.white;
    return o.wantOpen ? this.mats.green : this.mats.blue;
  }

  update() {
    const o = this.obj;
    const w = o.width;
    const k = o.openAmount;
    const e = k * k * (3 - 2 * k);
    this.left.position.x = this.left.userData.base - e * (w / 2 - 0.05);
    this.right.position.x = this.right.userData.base + e * (w / 2 - 0.05);
    const mat = this.state();
    for (const m of this.indicators) m.material = mat;
  }
}

class PlatformView {
  constructor(obj, { mats, geos }) {
    this.obj = obj;
    const [w, d] = obj.size;
    const t = obj.thickness;
    this.group = new THREE.Group();
    const body = mesh(geos.box, mats.block, w, t, d);
    body.position.y = -t / 2;
    const e = 0.06;
    const trims = [
      [w, e, e, 0, -e / 2, d / 2],
      [w, e, e, 0, -e / 2, -d / 2],
      [e, e, d, w / 2, -e / 2, 0],
      [e, e, d, -w / 2, -e / 2, 0],
    ].map(([sx, sy, sz, x, y, z]) => {
      const m = mesh(geos.box, mats.purple, sx, sy, sz);
      m.position.set(x, y, z);
      return m;
    });
    const under = mesh(geos.flatDisc, mats.cyan, Math.min(w, d) * 0.6, 1, Math.min(w, d) * 0.6);
    under.rotation.x = Math.PI;
    under.position.y = -t - 0.01;
    this.glyph = mesh(geos.squareRing, mats.purple, Math.min(w, d) * 0.5, 1, Math.min(w, d) * 0.5);
    this.glyph.position.y = 0.01;
    this.group.add(body, ...trims, under, this.glyph);
    this.tmp = new THREE.Vector3();
  }

  update(time, alpha) {
    const o = this.obj;
    this.group.position.set(
      o.prevPos.x + (o.pos.x - o.prevPos.x) * alpha,
      o.prevPos.y + (o.pos.y - o.prevPos.y) * alpha,
      o.prevPos.z + (o.pos.z - o.prevPos.z) * alpha,
    );
    this.glyph.rotation.y = time * (o.moving ? 1.5 : 0.3);
  }
}

const laserSheetMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOn: { value: 1 }, uColor: { value: new THREE.Color(COLORS.red) }, uLines: { value: 10 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOn;
      uniform vec3 uColor;
      uniform float uLines;
      varying vec2 vUv;
      void main() {
        float lines = pow(abs(sin(vUv.y * 3.14159 * uLines)), 40.0);
        float scan = 0.5 + 0.5 * sin(vUv.x * 30.0 - uTime * 8.0);
        float flick = 0.85 + 0.15 * sin(uTime * 41.0);
        float a = (0.05 + 0.03 * scan + lines * 1.1) * flick * uOn;
        gl_FragColor = vec4(uColor * a * 3.0, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

class LaserView {
  constructor(obj, { mats, geos }) {
    this.obj = obj;
    this.mats = mats;
    const b = obj.box;
    const sx = b.max[0] - b.min[0];
    const sy = b.max[1] - b.min[1];
    const sz = b.max[2] - b.min[2];
    const cx = (b.min[0] + b.max[0]) / 2;
    const cy = (b.min[1] + b.max[1]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    const alongX = sx >= sz;
    const len = alongX ? sx : sz;
    this.group = new THREE.Group();
    this.group.position.set(cx, cy, cz);
    this.beams = [];
    this.emitterStrips = [];
    if (sy > 0.6) {
      this.mat = laserSheetMaterial();
      this.mat.uniforms.uLines.value = Math.round(sy / 0.28);
      const sheet = mesh(geos.plane, this.mat, len, sy, 1);
      if (!alongX) sheet.rotation.y = Math.PI / 2;
      sheet.renderOrder = 6;
      this.group.add(sheet);
      this.beams.push(sheet);
    } else {
      this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.red).multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      this.haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.red).multiplyScalar(0.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const core = mesh(geos.cylinderLow, this.mat, 0.035, len, 0.035);
      const halo = mesh(geos.cylinderLow, this.haloMat, 0.14, len, 0.14);
      for (const m of [core, halo]) {
        if (alongX) m.rotation.z = Math.PI / 2;
        else m.rotation.x = Math.PI / 2;
        this.group.add(m);
        this.beams.push(m);
      }
    }
    const postH = Math.max(0.5, sy + 0.2);
    for (const s of [-1, 1]) {
      const post = mesh(geos.box, mats.metalDark, 0.18, postH, 0.18);
      const off = (len / 2 + 0.05) * s;
      post.position.set(alongX ? off : 0, -sy / 2 + postH / 2 - 0.1, alongX ? 0 : off);
      const strip = mesh(geos.box, mats.red, 0.2, 0.05, 0.2);
      strip.position.set(post.position.x, post.position.y + postH / 2 + 0.02, post.position.z);
      this.group.add(post, strip);
      this.emitterStrips.push(strip);
    }
  }

  update(time) {
    const o = this.obj;
    const on = o.active;
    for (const b of this.beams) b.visible = on;
    if (this.mat.uniforms) this.mat.uniforms.uTime.value = time;
    const warning = o.pulse && !on && o.pulseRemaining() < 0.45 && Math.sin(time * 40) > 0;
    for (const s of this.emitterStrips) s.material = on || warning ? this.mats.red : this.mats.blueDim;
  }
}

/** Echo Furnace: a hungry red vortex (danger to Echoes) that turns green once fed. */
class FurnaceView {
  constructor(obj, { mats, geos, coneRed, coneGreen }) {
    this.obj = obj;
    this.mats = mats;
    const [w, d] = obj.size;
    this.group = new THREE.Group();
    this.group.position.set(obj.pos.x, obj.pos.y, obj.pos.z);
    const base = mesh(geos.box, mats.metalDark, w + 0.3, 0.06, d + 0.3);
    base.position.y = 0.03;
    this.ring = mesh(geos.squareRing, mats.red, w, 1, d);
    this.ring.position.y = 0.07;
    this.grate = mesh(geos.squareRing, mats.redDim, w * 0.6, 1, d * 0.6);
    this.grate.position.y = 0.075;
    this.core = mesh(geos.icosa, mats.red, 0.45, 0.45, 0.45);
    this.core.position.y = 1.1;
    this.flames = [];
    for (let i = 0; i < 4; i++) {
      const f = mesh(geos.box, mats.red, 0.05, 1.6, 0.05);
      this.flames.push(f);
      this.group.add(f);
    }
    this.cone = createLightCone(geos, coneRed, { x: 0, y: 3.2, z: 0 }, 3.1, Math.min(w, d) * 0.55);
    this.coneLit = createLightCone(geos, coneGreen, { x: 0, y: 3.2, z: 0 }, 3.1, Math.min(w, d) * 0.55);
    this.group.add(base, this.ring, this.grate, this.core, this.cone, this.coneLit);
  }

  update(time) {
    const lit = this.obj.lit;
    const mat = lit ? this.mats.green : this.mats.red;
    this.ring.material = mat;
    this.core.material = mat;
    this.grate.material = lit ? this.mats.wireOn : this.mats.redDim;
    const speed = lit ? 0.6 : 2.4;
    this.core.rotation.set(time * speed, time * speed * 1.3, 0);
    this.core.position.y = 1.1 + Math.sin(time * 3) * 0.08;
    const r = Math.min(this.obj.size[0], this.obj.size[1]) * 0.32;
    this.flames.forEach((f, i) => {
      const a = time * speed + (i / this.flames.length) * Math.PI * 2;
      f.position.set(Math.cos(a) * r, 0.8 + Math.sin(time * 5 + i) * 0.1, Math.sin(a) * r);
      f.material = mat;
      f.scale.y = lit ? 0.6 : 1.6 + Math.sin(time * 7 + i * 2) * 0.3;
    });
    this.cone.visible = !lit;
    this.coneLit.visible = lit;
  }
}

class NodeView {
  constructor(obj, { mats, geos, coneWhite, coneGreen }) {
    this.obj = obj;
    this.mats = mats;
    const k = obj.objective ? 1 : 0.8;
    this.group = new THREE.Group();
    this.group.position.set(obj.pos.x, obj.pos.y, obj.pos.z);
    const ped = mesh(geos.cylinder, mats.metal, 0.9 * k, 0.8, 0.9 * k);
    ped.position.y = 0.4;
    const cap = mesh(geos.cylinder, mats.metalDark, 1.0 * k, 0.08, 1.0 * k);
    cap.position.y = 0.84;
    this.ring = mesh(geos.torus, mats.white, 0.95 * k, 0.95 * k, 0.95 * k);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.88;
    this.core = mesh(geos.octa, mats.white, 0.55 * k, 0.8 * k, 0.55 * k);
    this.core.position.y = 1.5;
    this.cage = mesh(geos.torus, mats.white, 0.9 * k, 0.9 * k, 0.9 * k);
    this.cage.position.y = 1.5;
    this.cage2 = mesh(geos.torus, mats.white, 0.75 * k, 0.75 * k, 0.75 * k);
    this.cage2.position.y = 1.5;
    this.group.add(ped, cap, this.ring, this.core, this.cage, this.cage2);
    const top = obj.room.h;
    this.cone = createLightCone(geos, coneWhite, { x: 0, y: top - obj.pos.y, z: 0 }, top - obj.pos.y - 0.8, 0.9);
    this.coneGreen = createLightCone(geos, coneGreen, { x: 0, y: top - obj.pos.y, z: 0 }, top - obj.pos.y - 0.8, 0.9);
    this.group.add(this.cone, this.coneGreen);
  }

  update(time) {
    const o = this.obj;
    const mat = o.activated ? this.mats.green : o.enabled ? this.mats.white : this.mats.blue;
    this.ring.material = mat;
    this.core.material = mat;
    this.cage.material = mat;
    this.cage2.material = mat;
    const speed = o.activated ? 2.5 : 0.8;
    this.core.rotation.y = time * speed;
    this.core.position.y = 1.5 + Math.sin(time * 1.6) * 0.08;
    this.cage.rotation.set(time * 0.7 * speed, time * 0.5, 0);
    this.cage2.rotation.set(0, time * 0.9 * speed, time * 0.6 * speed);
    this.cone.visible = o.enabled && !o.activated;
    this.coneGreen.visible = o.activated;
  }
}

/** Glowing floor conduits from each signal source to the objects it drives. */
class WireView {
  constructor(room, { mats, geos }) {
    this.mats = mats;
    this.group = new THREE.Group();
    this.links = [];
    for (const target of room.objects) {
      for (const ref of target.condRefs) {
        const sources = ref === 'room.complete' ? room.nodes.filter((n) => n.objective) : [room.byId[ref]];
        for (const src of sources) {
          if (!src || src === target) continue;
          this.links.push({ src, segs: this.build(src.pos, target.pos, geos) });
        }
      }
    }
  }

  build(a, b, geos) {
    const y = 0.012;
    const w = 0.07;
    const segs = [];
    const add = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05) return;
      const m = mesh(geos.box, this.mats.wireOff, x1 !== x0 ? len + w : w, 0.01, z1 !== z0 ? len + w : w);
      m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      this.group.add(m);
      segs.push(m);
    };
    add(a.x, a.z, b.x, a.z);
    add(b.x, a.z, b.x, b.z);
    return segs;
  }

  update() {
    for (const l of this.links) {
      const mat = l.src.signal ? this.mats.wireOn : this.mats.wireOff;
      for (const s of l.segs) s.material = mat;
    }
  }
}

export function createObjectView(obj, ctx) {
  if (obj instanceof PressurePlate) return new PlateView(obj, ctx);
  if (obj instanceof Switch || obj instanceof TimedButton) return new ConsoleView(obj, ctx);
  if (obj instanceof Door) return new DoorView(obj, ctx);
  if (obj instanceof MovingPlatform) return new PlatformView(obj, ctx);
  if (obj instanceof Laser) return new LaserView(obj, ctx);
  if (obj instanceof EnergyNode) return new NodeView(obj, ctx);
  if (obj instanceof EchoFurnace) return new FurnaceView(obj, ctx);
  return null;
}

export function createWireView(room, ctx) {
  return new WireView(room, ctx);
}

export function createNodeConeMaterials() {
  return {
    coneWhite: createConeMaterial(COLORS.white, 0.16),
    coneGreen: createConeMaterial(COLORS.green, 0.07),
    coneRed: createConeMaterial(COLORS.red, 0.14),
  };
}
