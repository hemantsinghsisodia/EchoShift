import * as THREE from 'three';

const DUST = 700;
const BURST = 900;

/** Ambient dust (GPU-animated) plus a pooled CPU burst system for sparks and echo effects. */
export class Particles {
  constructor(scene, pixelRatio = 1) {
    const dustGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(DUST * 3);
    const seed = new Float32Array(DUST);
    for (let i = 0; i < DUST; i++) {
      pos[i * 3] = Math.random() - 0.5;
      pos[i * 3 + 1] = Math.random() - 0.5;
      pos[i * 3 + 2] = Math.random() - 0.5;
      seed[i] = Math.random();
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dustGeo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.dustMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uSize: { value: new THREE.Vector3(10, 5, 10) },
        uScale: { value: 14 * pixelRatio },
        uColor: { value: new THREE.Color(0.45, 0.6, 1.0) },
        uFade: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float uTime;
        uniform vec3 uCenter;
        uniform vec3 uSize;
        uniform float uScale;
        varying float vSeed;
        void main() {
          vec3 p = position;
          p.y = fract(p.y + 0.5 + uTime * 0.008 * (0.3 + seed)) - 0.5;
          p.x += sin(uTime * 0.25 + seed * 40.0) * 0.015;
          p.z += cos(uTime * 0.21 + seed * 23.0) * 0.015;
          vec4 mv = modelViewMatrix * vec4(uCenter + p * uSize, 1.0);
          gl_PointSize = (0.5 + seed * 1.2) * uScale / max(1.0, -mv.z);
          vSeed = seed;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uFade;
        varying float vSeed;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = (1.0 - smoothstep(0.0, 0.5, d)) * (0.18 + 0.14 * sin(uTime * 1.5 + vSeed * 30.0)) * uFade;
          gl_FragColor = vec4(uColor * a, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(dustGeo, this.dustMat);
    this.dust.frustumCulled = false;
    scene.add(this.dust);

    this.bPos = new Float32Array(BURST * 3);
    this.bVel = new Float32Array(BURST * 3);
    this.bCol = new Float32Array(BURST * 3);
    this.bLife = new Float32Array(BURST);
    this.bMax = new Float32Array(BURST).fill(1);
    this.bSize = new Float32Array(BURST);
    this.bGrav = new Float32Array(BURST);
    this.bAlpha = new Float32Array(BURST);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.bPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.bCol, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.bSize, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.bAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.burstGeo = g;
    this.burstMat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 40 * pixelRatio } },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float alpha;
        attribute vec3 color;
        uniform float uScale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(0.5, -mv.z);
          vColor = color;
          vAlpha = alpha;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = (1.0 - smoothstep(0.05, 0.5, d)) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor * a * 1.4, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.burstPoints = new THREE.Points(g, this.burstMat);
    this.burstPoints.frustumCulled = false;
    scene.add(this.burstPoints);
    this.tmpColor = new THREE.Color();
  }

  setRoom(room) {
    this.dustMat.uniforms.uCenter.value.set(room.origin.x, room.h / 2, room.origin.z);
    this.dustMat.uniforms.uSize.value.set(room.w, room.h, room.d);
  }

  /**
   * opts: count, color, speed, up, spread (sphere radius), life, gravity, size, ring (horizontal ring emission)
   */
  burst(pos, opts = {}) {
    const { count = 40, color = 0x5fe3ff, speed = 2, up = 1, spread = 0.2, life = 1, gravity = 3, size = 0.12, ring = false, height = 0 } = opts;
    const c = this.tmpColor.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % BURST;
      const th = Math.random() * Math.PI * 2;
      const ph = ring ? Math.PI / 2 : Math.acos(2 * Math.random() - 1);
      const dx = Math.sin(ph) * Math.cos(th);
      const dy = ring ? 0 : Math.cos(ph);
      const dz = Math.sin(ph) * Math.sin(th);
      this.bPos[i * 3] = pos.x + dx * spread;
      this.bPos[i * 3 + 1] = pos.y + (ring ? Math.random() * height : dy * spread);
      this.bPos[i * 3 + 2] = pos.z + dz * spread;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.bVel[i * 3] = dx * s;
      this.bVel[i * 3 + 1] = dy * s + up * (0.5 + Math.random());
      this.bVel[i * 3 + 2] = dz * s;
      this.bCol[i * 3] = c.r;
      this.bCol[i * 3 + 1] = c.g;
      this.bCol[i * 3 + 2] = c.b;
      this.bMax[i] = life * (0.6 + Math.random() * 0.6);
      this.bLife[i] = this.bMax[i];
      this.bSize[i] = size * (0.6 + Math.random() * 0.8);
      this.bGrav[i] = gravity;
    }
    this.burstGeo.attributes.color.needsUpdate = true;
    this.burstGeo.attributes.size.needsUpdate = true;
  }

  update(dt, time) {
    this.dustMat.uniforms.uTime.value = time;
    for (let i = 0; i < BURST; i++) {
      if (this.bLife[i] <= 0) {
        this.bAlpha[i] = 0;
        continue;
      }
      this.bLife[i] -= dt;
      const k = i * 3;
      this.bVel[k + 1] -= this.bGrav[i] * dt;
      this.bVel[k] *= 1 - 1.5 * dt;
      this.bVel[k + 2] *= 1 - 1.5 * dt;
      this.bPos[k] += this.bVel[k] * dt;
      this.bPos[k + 1] += this.bVel[k + 1] * dt;
      this.bPos[k + 2] += this.bVel[k + 2] * dt;
      this.bAlpha[i] = Math.max(0, this.bLife[i] / this.bMax[i]);
    }
    this.burstGeo.attributes.position.needsUpdate = true;
    this.burstGeo.attributes.alpha.needsUpdate = true;
  }
}
