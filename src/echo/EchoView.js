import * as THREE from 'three';
import { createEchoMaterial, createOutlineMaterial } from './EchoMaterial.js';
import { FLAG_WALKING } from '../player/Player.js';

/**
 * Render-side hologram for an Echo: capsule body, head with visor, arms, a floor ring and a
 * number badge. Interpolates the echo's simulated position/rotation for smooth motion.
 */
export class EchoView {
  constructor(echo, geos) {
    this.echo = echo;
    const hue = ((echo.serial - 1) % 4) * 0.045;
    this.mat = createEchoMaterial(hue);
    this.outline = createOutlineMaterial(hue);
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);

    const torso = new THREE.Mesh(geos.capsule, this.mat);
    torso.scale.set(1, 0.72, 0.8);
    torso.position.y = 0.95;
    const torsoOut = new THREE.Mesh(geos.capsule, this.outline);
    torsoOut.scale.copy(torso.scale);
    torsoOut.position.copy(torso.position);

    this.head = new THREE.Group();
    this.head.position.y = 1.58;
    const skull = new THREE.Mesh(geos.sphere, this.mat);
    skull.scale.set(0.34, 0.36, 0.34);
    const skullOut = new THREE.Mesh(geos.sphere, this.outline);
    skullOut.scale.copy(skull.scale);
    const visorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.8 + hue, 1, 0.7).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.visorMat = visorMat;
    const visor = new THREE.Mesh(geos.box, visorMat);
    visor.scale.set(0.26, 0.06, 0.04);
    visor.position.set(0, 0.02, -0.16);
    this.head.add(skull, skullOut, visor);

    this.legs = [];
    this.arms = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(0.11 * s, 0.62, 0);
      const legMesh = new THREE.Mesh(geos.capsule, this.mat);
      legMesh.scale.set(0.38, 0.4, 0.38);
      legMesh.position.y = -0.3;
      leg.add(legMesh);
      this.legs.push(leg);
      const arm = new THREE.Group();
      arm.position.set(0.3 * s, 1.28, 0);
      const armMesh = new THREE.Mesh(geos.capsule, this.mat);
      armMesh.scale.set(0.28, 0.36, 0.28);
      armMesh.position.y = -0.26;
      arm.add(armMesh);
      this.arms.push(arm);
      this.body.add(leg, arm);
    }
    this.body.add(torso, torsoOut, this.head);

    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.55 + hue, 1, 0.6).multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(geos.ring, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.ring.scale.setScalar(1.0);
    this.group.add(this.ring);

    this.badge = makeBadge(echo.serial, hue);
    this.badge.position.y = 2.15;
    this.group.add(this.badge);

    this.walkPhase = 0;
    this.localTime = Math.random() * 10;
    this.frozenK = 0;
    this.flash = 0;
    this.seenSwap = echo.lastSwapTick;
    this.outlineBase = this.outline.uniforms.uColor.value.clone();
    this.outlineIce = new THREE.Color(1.4, 1.9, 2.2);
    this.yaw = echo.yaw;
    this.lastPos = new THREE.Vector3(echo.pos.x, echo.pos.y, echo.pos.z);
  }

  update(time, alpha, dt, camera) {
    const e = this.echo;
    const x = e.prevPos.x + (e.pos.x - e.prevPos.x) * alpha;
    const y = e.prevPos.y + (e.pos.y - e.prevPos.y) * alpha;
    const z = e.prevPos.z + (e.pos.z - e.prevPos.z) * alpha;
    if (e.ghostPauseTicks === 0) {
      this.group.position.set(x, y, z);
    }
    let d = e.yaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 20);
    this.body.rotation.y = this.yaw;
    if (e.stareTicks > 0) {
      this.body.rotation.y = Math.atan2(-(camera.position.x - x), -(camera.position.z - z));
    }
    this.head.rotation.x = e.pitch * 0.6;

    const speed = Math.hypot(x - this.lastPos.x, z - this.lastPos.z) / Math.max(dt, 1e-4);
    this.lastPos.set(x, y, z);
    const frozen = e.isFrozen;
    this.frozenK += ((frozen ? 1 : 0) - this.frozenK) * Math.min(1, dt * 10);
    if (!frozen) this.localTime += dt;
    if (e.lastSwapTick !== this.seenSwap) {
      this.seenSwap = e.lastSwapTick;
      this.flash = 1;
      this.lastPos.set(x, y, z);
    }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    const walking = !frozen && (e.flags & FLAG_WALKING) !== 0 && e.state !== 'holding' && speed > 0.3;
    this.walkPhase += dt * (walking ? Math.min(14, 4 + speed * 1.6) : 0);
    const swing = walking ? Math.sin(this.walkPhase) * 0.6 : 0;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing * 0.8;
    this.arms[1].rotation.x = swing * 0.8;
    if (!frozen) this.body.position.y = walking ? Math.abs(Math.cos(this.walkPhase)) * 0.04 : Math.sin(time * 1.8 + e.serial) * 0.015;

    let dissolve = e.spawnProgress;
    let glitch = 0;
    if (e.state === 'collapsing') {
      dissolve = 1 - e.collapseProgress;
      glitch = 1;
    }
    if (e.state === 'holding') glitch = 0.15;
    if (camera) {
      const near = Math.hypot(camera.position.x - x, camera.position.z - z);
      dissolve *= THREE.MathUtils.smoothstep(near, 0.35, 1.3);
    }
    const u = this.mat.uniforms;
    u.uTime.value = this.localTime;
    u.uDissolve.value = dissolve * 1.02;
    u.uGlitch.value = glitch * (1 - this.frozenK);
    u.uFrozen.value = this.frozenK;
    u.uFlash.value = this.flash;
    const corrupt = e.visualGlitch ? 1 : e.stareTicks > 0 || e.ghostPauseTicks > 0 ? 0.55 : 0;
    u.uCorrupt.value += (corrupt - u.uCorrupt.value) * Math.min(1, dt * 16);
    this.outline.uniforms.uTime.value = this.localTime;
    this.outline.uniforms.uColor.value.copy(this.outlineBase).lerp(this.outlineIce, this.frozenK);
    this.outline.uniforms.uOpacity.value = 0.55 * dissolve * (0.85 + 0.15 * Math.sin(time * 17 + e.serial));
    this.visorMat.opacity = dissolve;
    this.ringMat.opacity = dissolve * (0.6 + 0.4 * Math.sin(time * 4));
    this.ring.scale.setScalar(0.9 + 0.1 * Math.sin(time * 3));
    this.badge.material.opacity = dissolve;
    if (camera) this.badge.quaternion.copy(camera.quaternion);
  }

  dispose() {
    this.mat.dispose();
    this.outline.dispose();
    this.visorMat.dispose();
    this.ringMat.dispose();
    this.badge.material.map.dispose();
    this.badge.material.dispose();
    this.badge.geometry.dispose();
  }
}

function makeBadge(n, hue) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  const col = `hsl(${Math.round((0.55 + hue) * 360)}, 100%, 70%)`;
  g.strokeStyle = col;
  g.lineWidth = 4;
  g.strokeRect(6, 6, 116, 52);
  g.fillStyle = col;
  g.font = 'bold 34px Consolas, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(`E${n}`, 64, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(2, 2, 2) });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), mat);
  return m;
}
