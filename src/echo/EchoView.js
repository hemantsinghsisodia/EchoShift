import * as THREE from 'three';
import { createEchoMaterial, createOutlineMaterial } from './EchoMaterial.js';
import { FLAG_WALKING, FLAG_SPRINTING, FLAG_JUMPING } from '../player/Player.js';
import { cloneEchoModel, echoModelReady } from '../render/EchoModel.js';

const FADE = 0.2;
const WALK_GROUND_SPEED = 1.55;
const RUN_GROUND_SPEED = 5.0;
const IDLE_ENTER = 0.25;
const IDLE_EXIT = 0.5;
const RUN_ENTER = 2.9;
const RUN_EXIT = 2.4;
const PITCH_AXIS = new THREE.Vector3(1, 0, 0);

/**
 * Render-side hologram for an Echo. Uses the rigged human when it has loaded, otherwise the
 * procedural capsule body. Interpolates the echo's simulated position and rotation.
 */
export class EchoView {
  constructor(echo, geos) {
    this.echo = echo;
    this.geos = geos;
    const hue = ((echo.serial - 1) % 4) * 0.045;
    this.mat = createEchoMaterial(hue);
    this.outline = createOutlineMaterial(hue);
    this.hue = hue;
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);

    this.visorMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(0.8 + hue, 1, 0.7).multiplyScalar(3),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.visorOwnsGeometry = false;
    this.legs = null;
    this.arms = null;
    this.head = null;
    this.headBone = null;
    this.headRestQuat = null;
    this.headRestFromBody = null;
    this.headPitch = 0;
    this._headWorld = new THREE.Quaternion();
    this._bodyWorld = new THREE.Quaternion();
    this._stableWorld = new THREE.Quaternion();
    this._parentWorld = new THREE.Quaternion();
    this._pitchQuat = new THREE.Quaternion();
    this.rig = null;
    this.mixer = null;
    this.actions = null;
    this.clipName = null;
    this.previewSample = null;

    if (!this.buildRig()) this.buildProcedural();

    this.ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(0.55 + hue, 1, 0.6).multiplyScalar(2.5),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
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
    this.vel = new THREE.Vector3();
    this.lastPos = new THREE.Vector3(echo.pos.x, echo.pos.y, echo.pos.z);
  }

  buildRig() {
    const cloned = cloneEchoModel();
    if (!cloned) return false;
    const { rig, clips } = cloned;
    this.rig = rig;
    this.body.add(rig);
    // The character is several overlapping meshes. Additive blending would stack them
    // into a white pillar; standard alpha keeps the hologram readable.
    this.mat.blending = THREE.NormalBlending;
    if (this.mat.uniforms.uIntensity.value >= 1) this.mat.uniforms.uIntensity.value = 1.3;
    this.mixer = new THREE.AnimationMixer(rig);
    this.actions = {};
    for (const name of ['idle', 'walk', 'run', 'jump']) {
      if (!clips[name]) continue;
      const action = this.mixer.clipAction(clips[name]);
      action.enabled = true;
      action.setEffectiveWeight(0);
      if (name === 'jump') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions[name] = action;
    }
    const meshes = [];
    rig.traverse((node) => {
      if (node.isSkinnedMesh) meshes.push(node);
    });
    for (const mesh of meshes) {
      mesh.material = this.mat;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const shell = new THREE.SkinnedMesh(mesh.geometry, this.outline);
      shell.bind(mesh.skeleton, mesh.bindMatrix);
      shell.position.copy(mesh.position);
      shell.quaternion.copy(mesh.quaternion);
      shell.scale.copy(mesh.scale);
      shell.frustumCulled = false;
      mesh.parent.add(shell);
    }
    this.headBone = rig.getObjectByName('Head') || rig.getObjectByName('Neck');
    if (this.headBone) {
      rig.updateMatrixWorld(true);
      const worldScale = this.headBone.getWorldScale(new THREE.Vector3()).x || 1;
      this.rigVisorMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.8 + this.hue, 1, 0.7).multiplyScalar(1.2),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const visor = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.rigVisorMat);
      visor.scale.set(0.16 / worldScale, 0.035 / worldScale, 0.01 / worldScale);
      visor.position.set(0, 0.08 / worldScale, 0.11 / worldScale);
      this.headBone.add(visor);
      this.visor = visor;
      this.visorOwnsGeometry = true;
      this.body.updateWorldMatrix(true, true);
      this.headRestQuat = this.headBone.quaternion.clone();
      const headW = new THREE.Quaternion();
      const bodyW = new THREE.Quaternion();
      this.headBone.getWorldQuaternion(headW);
      this.body.getWorldQuaternion(bodyW);
      this.headRestFromBody = bodyW.invert().multiply(headW);
    }
    return true;
  }

  buildProcedural() {
    const geos = this.geos;
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
    const visor = new THREE.Mesh(geos.box, this.visorMat);
    visor.scale.set(0.26, 0.06, 0.04);
    visor.position.set(0, 0.02, -0.16);
    this.visor = visor;
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
  }

  ensureAvatar() {
    if (this.rig || !echoModelReady()) return false;
    this.body.clear();
    this.legs = null;
    this.arms = null;
    this.head = null;
    this.visor = null;
    return this.buildRig();
  }

  playClip(name, fade) {
    const next = this.actions?.[name];
    if (!next || this.clipName === name) return;
    const prev = this.actions[this.clipName];
    const locomotion = (this.clipName === 'walk' || this.clipName === 'run') && (name === 'walk' || name === 'run');
    next.reset();
    if (locomotion && prev) {
      const prevDur = prev.getClip().duration || 1;
      const nextDur = next.getClip().duration || 1;
      next.time = ((prev.time % prevDur) / prevDur) * nextDur;
    }
    // fadeIn multiplies this weight. It must be 1, or the new clip stays invisible.
    next.setEffectiveWeight(1).play();
    next.timeScale = 1;
    if (prev) {
      prev.fadeOut(fade);
      next.fadeIn(fade);
    }
    this.clipName = name;
  }

  /** Pull the head toward the body's facing so torso twist does not wag it, then add a clamped pitch. */
  applyHead(pitch, dt) {
    const head = this.headBone;
    if (!head || !this.headRestQuat) return;
    this.body.updateWorldMatrix(true, false);
    head.updateWorldMatrix(true, false);
    head.getWorldQuaternion(this._headWorld);
    this.body.getWorldQuaternion(this._bodyWorld);
    this._stableWorld.copy(this._bodyWorld).multiply(this.headRestFromBody);
    this._headWorld.slerp(this._stableWorld, 0.65);
    head.parent.updateWorldMatrix(true, false);
    head.parent.getWorldQuaternion(this._parentWorld);
    head.quaternion.copy(this._parentWorld.invert()).multiply(this._headWorld);
    const target = THREE.MathUtils.clamp(pitch * 0.5, -0.35, 0.35);
    if (dt == null) this.headPitch = target;
    else this.headPitch += (target - this.headPitch) * (1 - Math.exp(-dt * 10));
    this._pitchQuat.setFromAxisAngle(PITCH_AXIS, this.headPitch);
    head.quaternion.multiply(this._pitchQuat);
  }

  /** One pose for the timeline ghost. The mixer is not left running. */
  posePreview(sample) {
    this.previewSample = sample;
    this.ensureAvatar();
    this.body.rotation.y = sample.yaw || 0;
    if (!this.mixer) {
      if (this.head) this.head.rotation.x = (sample.pitch || 0) * 0.6;
      return;
    }
    const name = clipForFlags(sample.flags | 0);
    if (this.clipName !== name) {
      this.mixer.stopAllAction();
      const action = this.actions[name];
      if (action) {
        action.reset().play();
        action.setEffectiveWeight(1);
        action.time = Math.min(0.35, action.getClip().duration * 0.4);
        this.clipName = name;
        this.mixer.timeScale = 1;
        this.mixer.update(0.001);
      }
    }
    if (this.headBone && this.headRestQuat) this.headBone.quaternion.copy(this.headRestQuat);
    this.mixer.timeScale = 0;
    this.mixer.update(0);
    this.applyHead(sample.pitch || 0, null);
  }

  syncPreview() {
    if (this.previewSample && !this.rig && echoModelReady()) this.posePreview(this.previewSample);
  }

  update(time, alpha, dt, camera) {
    this.ensureAvatar();
    const e = this.echo;
    const x = e.prevPos.x + (e.pos.x - e.prevPos.x) * alpha;
    const y = e.prevPos.y + (e.pos.y - e.prevPos.y) * alpha;
    const z = e.prevPos.z + (e.pos.z - e.prevPos.z) * alpha;
    if (e.ghostPauseTicks === 0) {
      this.group.position.set(x, y, z);
    }
    const swapped = e.lastSwapTick !== this.seenSwap;
    if (swapped) {
      this.seenSwap = e.lastSwapTick;
      this.flash = 1;
      this.lastPos.set(x, y, z);
      this.vel.set(0, 0, 0);
    }
    const dtSafe = Math.max(dt, 1e-4);
    const instVx = swapped ? 0 : (x - this.lastPos.x) / dtSafe;
    const instVz = swapped ? 0 : (z - this.lastPos.z) / dtSafe;
    const velK = 1 - Math.exp(-dt * 12);
    this.vel.x += (instVx - this.vel.x) * velK;
    this.vel.z += (instVz - this.vel.z) * velK;
    this.lastPos.set(x, y, z);
    const speed = Math.hypot(this.vel.x, this.vel.z);

    const moving = e.state !== 'holding' && speed >= IDLE_EXIT;
    const targetYaw = moving ? Math.atan2(-this.vel.x, -this.vel.z) : e.yaw;
    let d = targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-dt * 10));
    this.body.rotation.y = this.yaw;
    if (e.stareTicks > 0 && camera) {
      this.body.rotation.y = Math.atan2(-(camera.position.x - x), -(camera.position.z - z));
    }

    const frozen = e.isFrozen;
    this.frozenK += ((frozen ? 1 : 0) - this.frozenK) * Math.min(1, dt * 10);
    if (!frozen) this.localTime += dt;
    this.flash = Math.max(0, this.flash - dt * 2.5);

    if (this.mixer) {
      this.body.position.y = 0;
      if (this.headBone && this.headRestQuat) this.headBone.quaternion.copy(this.headRestQuat);
      if (frozen) {
        this.mixer.timeScale = 0;
      } else {
        this.mixer.timeScale = 1;
        const name = clipForMotion(e, speed, this.clipName);
        this.playClip(name, FADE);
        const action = this.actions[name];
        if (action && name === 'walk') {
          action.timeScale = THREE.MathUtils.clamp(speed / WALK_GROUND_SPEED, 0.6, 1.9);
        } else if (action && name === 'run') {
          action.timeScale = THREE.MathUtils.clamp(speed / RUN_GROUND_SPEED, 0.7, 1.6);
        }
      }
      this.mixer.update(dt);
      this.applyHead(e.pitch, dt);
    } else if (this.legs) {
      if (this.head) this.head.rotation.x = e.pitch * 0.6;
      const walking = !frozen && (e.flags & FLAG_WALKING) !== 0 && e.state !== 'holding' && speed > 0.3;
      this.walkPhase += dt * (walking ? Math.min(14, 4 + speed * 1.6) : 0);
      const swing = walking ? Math.sin(this.walkPhase) * 0.6 : 0;
      this.legs[0].rotation.x = swing;
      this.legs[1].rotation.x = -swing;
      this.arms[0].rotation.x = -swing * 0.8;
      this.arms[1].rotation.x = swing * 0.8;
      if (!frozen) this.body.position.y = walking ? Math.abs(Math.cos(this.walkPhase)) * 0.04 : Math.sin(time * 1.8 + e.serial) * 0.015;
    }

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
    if (this.rigVisorMat) this.rigVisorMat.opacity = dissolve;
    this.ringMat.opacity = dissolve * (0.6 + 0.4 * Math.sin(time * 4));
    this.ring.scale.setScalar(0.9 + 0.1 * Math.sin(time * 3));
    this.badge.material.opacity = dissolve;
    if (camera) this.badge.quaternion.copy(camera.quaternion);
  }

  dispose() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      if (this.rig) this.mixer.uncacheRoot(this.rig);
      this.mixer = null;
    }
    this.mat.dispose();
    this.outline.dispose();
    this.visorMat.dispose();
    this.rigVisorMat?.dispose();
    if (this.visorOwnsGeometry && this.visor) this.visor.geometry.dispose();
    this.ringMat.dispose();
    this.badge.material.map.dispose();
    this.badge.material.dispose();
    this.badge.geometry.dispose();
  }
}

function clipForMotion(echo, speed, current) {
  if (echo.state === 'holding') return 'idle';
  if ((echo.flags & FLAG_JUMPING) !== 0) return 'jump';
  const moving = current === 'walk' || current === 'run';
  if (speed < (moving ? IDLE_ENTER : IDLE_EXIT)) return 'idle';
  if (current === 'run') return speed < RUN_EXIT ? 'walk' : 'run';
  if (speed >= RUN_ENTER) return 'run';
  return 'walk';
}

function clipForFlags(flags) {
  if (flags & FLAG_JUMPING) return 'jump';
  if (flags & FLAG_SPRINTING) return 'run';
  if (flags & FLAG_WALKING) return 'run';
  return 'idle';
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
