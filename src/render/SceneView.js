import * as THREE from 'three';
import { COLORS, PLAYER, TICK_RATE } from '../core/config.js';
import { createMaterials } from './Materials.js';
import { createGeometries } from './Geometries.js';
import { buildLabGeometry } from './RoomBuilder.js';
import { LightRig } from './LightRig.js';
import { Particles } from './Particles.js';
import { CameraShake } from './CameraShake.js';
import { EndingFX } from './EndingFX.js';
import { createObjectView, createWireView, createNodeConeMaterials } from './ObjectViews.js';
import { EchoView } from '../echo/EchoView.js';
import { HunterView } from './HunterView.js';
import { FLAG_WALKING } from '../player/Player.js';

/**
 * Binds the simulation to the Three.js scene: builds the lab, keeps object/echo views in sync,
 * drives the first-person camera (interpolated, head-bob, shake) and reacts to sim events with FX.
 */
export class SceneView {
  constructor(sim, renderer) {
    this.sim = sim;
    this.renderer = renderer;
    this.scene = renderer.scene;
    this.camera = renderer.camera;
    this.mats = createMaterials();
    this.geos = createGeometries();

    this.lab = buildLabGeometry(sim, this.mats, this.geos);
    this.scene.add(this.lab.group);
    this.lightRig = new LightRig(this.scene);
    const nodeCones = createNodeConeMaterials();
    const ctx = { mats: this.mats, geos: this.geos, ...nodeCones };

    this.roomGroups = [];
    this.views = [];
    this.hunterViews = [];
    for (const room of sim.rooms) {
      const g = new THREE.Group();
      const roomViews = [];
      for (const obj of room.objects) {
        const v = createObjectView(obj, ctx);
        if (!v) continue;
        obj.view = v;
        g.add(v.group);
        roomViews.push(v);
      }
      const wires = createWireView(room, ctx);
      g.add(wires.group);
      roomViews.push(wires);
      let hunterView = null;
      if (room.hunter) {
        hunterView = new HunterView(room.hunter, ctx);
        g.add(hunterView.group);
      }
      this.hunterViews.push(hunterView);
      this.scene.add(g);
      this.roomGroups.push(g);
      this.views.push(roomViews);
    }

    this.particles = new Particles(this.scene, renderer.pixelRatio);
    this.shake = new CameraShake();
    this.endingFx = new EndingFX({
      lightRig: this.lightRig,
      mats: this.mats,
      scene: this.scene,
      shake: this.shake,
      coneMats: { ...this.lab.coneMats, ...nodeCones },
    });
    this.echoViews = new Map();
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.landDip = 0;
    this.visibleRoom = -1;
    this.bindEvents();
    this.onRoomChange(sim.room.index);
  }

  bindEvents() {
    const bus = this.sim.bus;
    const p = this.particles;
    bus.on('room:enter', ({ index }) => this.onRoomChange(index));
    bus.on('echo:spawn', ({ echo }) => {
      p.burst({ x: echo.pos.x, y: echo.pos.y + 0.1, z: echo.pos.z }, { count: 60, color: COLORS.cyan, speed: 2.2, up: 1.5, ring: true, height: 1.8, life: 1.1, gravity: -0.5, size: 0.1 });
      p.burst({ x: echo.pos.x, y: echo.pos.y + 1, z: echo.pos.z }, { count: 30, color: COLORS.purple, speed: 1, up: 0.5, spread: 0.4, life: 0.9, gravity: 0, size: 0.14 });
      this.shake.add(0.18);
    });
    bus.on('echo:collapse', ({ echo, silent }) => {
      if (silent) return;
      p.burst({ x: echo.pos.x, y: echo.pos.y + 1, z: echo.pos.z }, { count: 70, color: COLORS.purple, speed: 3, up: 0.3, spread: 0.5, life: 0.9, gravity: 1, size: 0.1 });
    });
    bus.on('node:activate', ({ node }) => {
      p.burst({ x: node.pos.x, y: node.pos.y + 1.5, z: node.pos.z }, { count: 120, color: COLORS.green, speed: 4, up: 1.5, spread: 0.3, life: 1.4, gravity: 2.5, size: 0.12 });
      this.shake.add(node.objective ? 0.35 : 0.2);
    });
    bus.on('room:complete', () => this.shake.add(0.2));
    bus.on('player:death', ({ pos }) => {
      p.burst({ x: pos.x, y: pos.y + 1, z: pos.z }, { count: 110, color: COLORS.red, speed: 5, up: 1, spread: 0.3, life: 1, gravity: 6, size: 0.1 });
      this.shake.add(0.8);
    });
    bus.on('player:land', ({ impact }) => {
      this.landDip = Math.min(0.22, this.landDip + impact * 0.018);
      if (impact > 9) this.shake.add(0.15);
    });
    bus.on('door:move', ({ door, opening }) => {
      const d = this.distToPlayer(door.pos);
      if (d < 14 && opening && door.role !== 'puzzle') this.shake.add(0.12);
    });
    const press = ({ pos }) => p.burst({ x: pos.x, y: pos.y + 1.2, z: pos.z }, { count: 16, color: COLORS.green, speed: 1.2, up: 0.8, spread: 0.1, life: 0.5, gravity: 2, size: 0.07 });
    bus.on('switch:press', press);
    bus.on('button:press', press);
    bus.on('plate:change', ({ plate, pressed }) => {
      if (pressed) p.burst({ x: plate.pos.x, y: plate.pos.y + 0.12, z: plate.pos.z }, { count: 24, color: COLORS.green, speed: 1.6, up: 0.4, ring: true, life: 0.6, gravity: 0, size: 0.07 });
    });
    bus.on('echo:swap', ({ from, to }) => {
      const steps = 14;
      for (let i = 0; i <= steps; i++) {
        const k = i / steps;
        const pt = { x: from.x + (to.x - from.x) * k, y: from.y + 1 + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k };
        p.burst(pt, { count: 4, color: i % 2 ? COLORS.cyan : COLORS.purple, speed: 0.6, up: 0.2, spread: 0.15, life: 0.5, gravity: 0, size: 0.09 });
      }
      for (const pt of [from, to]) p.burst({ x: pt.x, y: pt.y + 0.1, z: pt.z }, { count: 40, color: COLORS.cyan, speed: 2.5, up: 1, ring: true, height: 1.8, life: 0.7, gravity: -1, size: 0.08 });
      this.shake.add(0.2);
      this.swapFlash = 1;
    });
    bus.on('echo:freeze', ({ echo }) => {
      p.burst({ x: echo.pos.x, y: echo.pos.y + 0.2, z: echo.pos.z }, { count: 50, color: 0xbfefff, speed: 2.8, up: 0.1, ring: true, height: 0.3, life: 0.8, gravity: 0, size: 0.09 });
      p.burst({ x: echo.pos.x, y: echo.pos.y + 1.1, z: echo.pos.z }, { count: 30, color: 0xffffff, speed: 1.2, up: 0, spread: 0.5, life: 1.2, gravity: -0.3, size: 0.06 });
    });
    bus.on('echo:unfreeze', ({ echo }) => {
      p.burst({ x: echo.pos.x, y: echo.pos.y + 1, z: echo.pos.z }, { count: 24, color: 0xbfefff, speed: 1.6, up: 0.4, spread: 0.4, life: 0.6, gravity: 4, size: 0.06 });
    });
    bus.on('echo:sacrifice', ({ pos }) => {
      p.burst({ x: pos.x, y: pos.y + 0.3, z: pos.z }, { count: 110, color: 0xff6a2a, speed: 1.5, up: 3.5, spread: 0.5, life: 1.6, gravity: -1, size: 0.1 });
      p.burst({ x: pos.x, y: pos.y + 1, z: pos.z }, { count: 50, color: COLORS.red, speed: 3, up: 1, spread: 0.3, life: 0.9, gravity: 2, size: 0.08 });
      this.shake.add(0.25);
    });
    bus.on('echo:blink', ({ pos }) => {
      p.burst({ x: pos.x, y: pos.y + 1, z: pos.z }, { count: 30, color: COLORS.cyan, speed: 1.8, up: 0.3, spread: 0.3, life: 0.5, gravity: 0, size: 0.08 });
    });
    bus.on('ending:start', () => {
      this.shake.add(0.6);
      this.endingFx.start();
    });
    bus.on('game:new', () => {
      this.endingFx.reset();
      this.clearEchoViews();
    });
    bus.on('room:reset', () => this.clearEchoViews());
  }

  distToPlayer(p) {
    const pp = this.sim.player.pos;
    return Math.hypot(p.x - pp.x, p.z - pp.z);
  }

  onRoomChange(index) {
    const info = this.lab.roomInfo;
    this.lightRig.assign(info[index], info[index + 1]);
    this.particles.setRoom(this.sim.rooms[index]);
    this.visibleRoom = index;
    this.roomGroups.forEach((g, i) => (g.visible = Math.abs(i - index) <= 1));
    info.forEach((ri, i) => {
      for (const c of ri.cones) c.visible = Math.abs(i - index) <= 1;
    });
  }

  clearEchoViews() {
    for (const [, v] of this.echoViews) {
      this.scene.remove(v.group);
      v.dispose();
    }
    this.echoViews.clear();
  }

  syncEchoes(time, alpha, dt) {
    const live = this.sim.echoes.echoes;
    for (const echo of live) {
      if (!this.echoViews.has(echo)) {
        const v = new EchoView(echo, this.geos);
        this.echoViews.set(echo, v);
        this.scene.add(v.group);
      }
    }
    for (const [echo, v] of this.echoViews) {
      if (!live.includes(echo)) {
        this.scene.remove(v.group);
        v.dispose();
        this.echoViews.delete(echo);
        continue;
      }
      v.update(time, alpha, dt, this.camera);
    }
  }

  updateCamera(alpha, dt, look) {
    const pl = this.sim.player;
    const x = pl.prevPos.x + (pl.pos.x - pl.prevPos.x) * alpha;
    const y = pl.prevPos.y + (pl.pos.y - pl.prevPos.y) * alpha;
    const z = pl.prevPos.z + (pl.pos.z - pl.prevPos.z) * alpha;
    const walking = pl.grounded && (pl.flags & FLAG_WALKING) !== 0 && this.sim.state !== 'dying';
    const speed = Math.hypot(pl.vel.x, pl.vel.z);
    this.bobAmount += ((walking ? 1 : 0) - this.bobAmount) * Math.min(1, dt * 8);
    this.bobPhase += dt * speed * 2.1;
    this.landDip = Math.max(0, this.landDip - dt * 0.9);
    const bobY = Math.sin(this.bobPhase * 2) * 0.035 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * 0.025 * this.bobAmount;
    const s = this.shake.update(dt);
    const cam = this.camera;
    const yaw = look.yaw;
    cam.position.set(x + Math.cos(yaw) * bobX + s.x, y + PLAYER.eye + bobY - this.landDip + s.y, z - Math.sin(yaw) * bobX + s.z);
    cam.rotation.set(look.pitch + s.pitch, yaw + s.yaw, s.roll + bobX * 0.3);
    this.swapFlash = Math.max(0, (this.swapFlash ?? 0) - dt * 3);
    const fov = 75 + this.swapFlash * 12;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    if (this.sim.state === 'dying') cam.rotation.z += 0.2;
  }

  render(alpha, dt, time, look) {
    this.updateCamera(alpha, dt, look);
    const cur = this.visibleRoom;
    for (let i = Math.max(0, cur - 1); i <= Math.min(this.views.length - 1, cur + 1); i++) {
      for (const v of this.views[i]) v.update(time, alpha, dt);
      this.hunterViews[i]?.update(time, alpha);
    }
    this.syncEchoes(time, alpha, dt);
    this.lightRig.update(time);
    this.particles.update(dt, time);
    const ending = this.sim.state === 'ending' || this.sim.state === 'escaped';
    this.endingFx.update(dt, time, ending ? this.sim.endingTick / TICK_RATE : null);
    this.lab.pitMat.uniforms.uTime.value = time;
    this.renderer.render();
  }

  setTimelinePreview(echo, trackTick) {
    if (!this.timelineGhost) {
      this.timelineGhost = new EchoView(echo, this.geos);
      this.timelineGhost.group.traverse((node) => {
        if (node.material?.uniforms?.uIntensity) node.material.uniforms.uIntensity.value = 0.35;
      });
      this.scene.add(this.timelineGhost.group);
    }
    const sample = echo.track.sample(trackTick, { i: 0 }, this.sim.room.platforms, {});
    this.timelineGhost.group.position.set(
      sample.x + echo.offset.x,
      sample.y + echo.offset.y,
      sample.z + echo.offset.z,
    );
  }

  clearTimelinePreview() {
    if (!this.timelineGhost) return;
    this.scene.remove(this.timelineGhost.group);
    this.timelineGhost.dispose();
    this.timelineGhost = null;
  }
}
