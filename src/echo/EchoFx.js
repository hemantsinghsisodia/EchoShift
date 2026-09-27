import * as THREE from 'three';

/** Horizontal speed above which the motion ribbon records a new point. */
export const TRAIL_SPEED = 0.5;

/** Extra draw-call budget. Touch quality uses the shorter trail and fewer motes. */
export function fxBudget(quality) {
  if (quality === 'low') return { trail: 8, particles: 12 };
  return { trail: 16, particles: 24 };
}

/**
 * Hologram extras for one Echo: a spinning chrono-ring bone, a world-space motion
 * ribbon, a pulsing floor ring and rising projector motes. The ribbon and motes are
 * skipped for the timeline ghost.
 */
export class EchoFx {
  constructor(group, hue, quality = 'high', preview = false) {
    this.group = group;
    this.preview = preview;
    this.budget = fxBudget(quality);
    this.trail = [];
    this.ringAngle = 0;
    this.ringBone = null;
    this.ringRest = null;
    this.chest = null;
    this._world = new THREE.Vector3();
    this._local = new THREE.Vector3();
    this._inverse = new THREE.Matrix4();
    this.hue = hue;
    this.pulse = null;
    this.trailMesh = null;
    this.points = null;
    if (preview) return;
    this._buildPulse(hue);
    this._buildTrail(hue);
    this._buildParticles(hue);
  }

  attachRig(rig) {
    this.ringBone = rig.getObjectByName('ChronoRing');
    this.ringRest = this.ringBone ? this.ringBone.quaternion.clone() : null;
    this.chest = rig.getObjectByName('Torso') || rig.getObjectByName('Abdomen') || rig.getObjectByName('Hips');
  }

  /**
   * Record or drop ribbon points. A swap clears the history so the ribbon never
   * stretches across the room.
   */
  noteMotion({ speed, swapped, x, y, z }) {
    if (this.preview) return;
    if (swapped) {
      this.trail.length = 0;
      return;
    }
    if (speed >= TRAIL_SPEED) {
      const last = this.trail[this.trail.length - 1];
      if (!last || (last.x - x) ** 2 + (last.z - z) ** 2 > 0.008) {
        this.trail.push({ x, y: y + 1.05, z });
      }
      while (this.trail.length > this.budget.trail) this.trail.shift();
    } else if (this.trail.length) {
      this.trail.shift();
    }
  }

  update({ dt, speed, swapped, frozen, dissolve, x, y, z, time }) {
    this.noteMotion({ speed, swapped, x, y, z });
    if (this.ringBone && this.ringRest) {
      if (!frozen) this.ringAngle += dt * 2.4;
      this.ringBone.quaternion.copy(this.ringRest);
      this.ringBone.rotateY(this.ringAngle);
    }
    if (this.preview) return;
    this._writeTrail(dissolve);
    this._stepParticles(dt, dissolve, frozen);
    if (this.pulse) {
      const k = (time % 1.4) / 1.4;
      this.pulse.scale.setScalar(0.85 + k * 1.15);
      this.pulse.material.opacity = dissolve * (1 - k) * 0.85;
    }
  }

  dispose() {
    this.trailMesh?.geometry.dispose();
    this.trailMesh?.material.dispose();
    this.points?.geometry.dispose();
    this.points?.material.dispose();
    this.pulse?.geometry.dispose();
    this.pulse?.material.dispose();
  }

  _buildPulse(hue) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(0.55 + hue, 1, 0.65).multiplyScalar(2.2),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.pulse = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 40), mat);
    this.pulse.rotation.x = -Math.PI / 2;
    this.pulse.position.y = 0.045;
    this.group.add(this.pulse);
  }

  _buildTrail(hue) {
    const n = this.budget.trail;
    const positions = new Float32Array(n * 2 * 3);
    const fade = new Float32Array(n * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color().setHSL(0.55 + hue, 1, 0.62).multiplyScalar(1.8) },
        uOpacity: { value: 1 },
      },
      vertexShader: `
        attribute float aFade;
        varying float vFade;
        void main() {
          vFade = aFade;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vFade;
        void main() {
          float a = vFade * uOpacity;
          gl_FragColor = vec4(uColor * a, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.trailMesh = new THREE.Mesh(geo, mat);
    this.trailMesh.frustumCulled = false;
    this.trailMesh.visible = false;
    this.group.add(this.trailMesh);
  }

  _writeTrail(dissolve) {
    const mesh = this.trailMesh;
    const pts = this.trail;
    mesh.material.uniforms.uOpacity.value = dissolve;
    if (pts.length < 2) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    this.group.updateWorldMatrix(true, false);
    this._inverse.copy(this.group.matrixWorld).invert();
    const pos = mesh.geometry.attributes.position;
    const fade = mesh.geometry.attributes.aFade;
    const width = 0.07;
    const n = pts.length;
    for (let i = 0; i < this.budget.trail; i++) {
      const a = pts[Math.min(i, n - 1)];
      const b = pts[Math.min(i + 1, n - 1)];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const px = -dz * width;
      const pz = dx * width;
      const t = n <= 1 ? 1 : i / (n - 1);
      for (const side of [-1, 1]) {
        this._world.set(a.x + px * side, a.y, a.z + pz * side);
        this._local.copy(this._world).applyMatrix4(this._inverse);
        const vi = i * 2 + (side < 0 ? 0 : 1);
        pos.setXYZ(vi, this._local.x, this._local.y, this._local.z);
        fade.setX(vi, i < n ? t : 0);
      }
    }
    pos.needsUpdate = true;
    fade.needsUpdate = true;
    mesh.geometry.setDrawRange(0, n * 2);
  }

  _buildParticles(hue) {
    const count = this.budget.particles;
    const positions = new Float32Array(count * 3);
    this.motes = [];
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const rad = 0.25 + (i % 5) * 0.06;
      const y = (i / count) * 1.6;
      positions[i * 3] = Math.cos(ang) * rad;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(ang) * rad;
      this.motes.push({ ang, rad, y, speed: 0.35 + (i % 4) * 0.12 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color().setHSL(0.55 + hue, 1, 0.7).multiplyScalar(2),
      size: 0.045,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  _stepParticles(dt, dissolve, frozen) {
    if (!this.points) return;
    this.points.material.opacity = 0.85 * dissolve;
    if (frozen) return;
    const pos = this.points.geometry.attributes.position;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.y += dt * m.speed;
      if (m.y > 1.7) m.y = 0;
      pos.setXYZ(i, Math.cos(m.ang) * m.rad, m.y, Math.sin(m.ang) * m.rad);
    }
    pos.needsUpdate = true;
  }
}
