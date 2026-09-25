import * as THREE from 'three';

/**
 * Holographic echo shader: fresnel rim glow, world-space scanlines, vertex jitter with
 * occasional horizontal slice glitches, and a noise dissolve for spawning/collapsing.
 */
export function createEchoMaterial(hue = 0) {
  const base = new THREE.Color().setHSL(0.53 + hue, 0.95, 0.6);
  const rim = new THREE.Color().setHSL(0.76 + hue * 0.5, 0.95, 0.65);
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: Math.random() * 100 },
      uDissolve: { value: 1 },
      uColor: { value: base },
      uRim: { value: rim },
      uIntensity: { value: 1 },
      uGlitch: { value: 0 },
      uFrozen: { value: 0 },
      uFlash: { value: 0 },
      uCorrupt: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      uniform float uGlitch;
      uniform float uFrozen;
      uniform float uCorrupt;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vW;
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        vec3 p = position;
        float slice = floor((p.y + uTime * 0.5) * 9.0);
        float g = step(0.93 - uGlitch * 0.4, hash(slice + floor(uTime * 12.0) + uSeed));
        float live = 1.0 - uFrozen;
        p.x += (hash(slice * 1.7 + floor(uTime * 20.0)) - 0.5) * 0.14 * g * live * (1.0 + uCorrupt * 5.0);
        p += normal * sin(uTime * 7.0 + p.y * 12.0 + uSeed) * 0.006 * live;
        vec4 w = modelMatrix * vec4(p, 1.0);
        vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      uniform float uDissolve;
      uniform vec3 uColor;
      uniform vec3 uRim;
      uniform float uIntensity;
      uniform float uFrozen;
      uniform float uFlash;
      uniform float uCorrupt;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vW;
      float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        float n = mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
                      mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
        return n;
      }
      void main() {
        float n = noise(vW * 6.0 + uSeed);
        if (n > uDissolve) discard;
        float edge = smoothstep(uDissolve - 0.08, uDissolve, n) * step(uDissolve, 0.999);
        float fres = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.2);
        float scan = 0.55 + 0.45 * sin(vW.y * 60.0 - uTime * 6.0);
        float band = smoothstep(0.0, 0.05, fract(vW.y * 0.8 - uTime * 0.35)) * 0.25;
        float flicker = 0.9 + 0.1 * sin(uTime * 31.0 + uSeed);
        vec3 col = uColor * (0.18 + 0.35 * scan + band) + uRim * fres * 2.4 + vec3(1.0) * edge * 3.0;
        vec3 facets = abs(fract(vW * 3.5) - 0.5);
        float crack = smoothstep(0.46, 0.5, max(max(facets.x, facets.y), facets.z));
        vec3 ice = vec3(0.75, 0.95, 1.0) * (0.35 + fres * 2.2 + crack * 1.6);
        col = mix(col, ice, uFrozen) + vec3(0.6, 0.9, 1.0) * uFlash * 3.0;
        float corruptBand = step(0.78, fract(vW.y * 3.0 + uTime * 2.0));
        col += vec3(uCorrupt * corruptBand * 1.5, 0.0, uCorrupt * (1.0 - corruptBand));
        col *= 1.0 + uCorrupt * (0.4 + 0.6 * sin(uTime * 80.0 + vW.y * 20.0));
        flicker = mix(flicker, 1.0, uFrozen);
        float a = (0.22 + 0.25 * scan + fres * 0.9 + edge + uFlash) * flicker;
        gl_FragColor = vec4(col * uIntensity * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Solid back-face shell drawn slightly inflated to give the echo a glowing outline. */
export function createOutlineMaterial(hue = 0) {
  const c = new THREE.Color().setHSL(0.72 + hue * 0.5, 1, 0.6).multiplyScalar(1.6);
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: c }, uOpacity: { value: 1 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      void main() {
        vec3 p = position + normal * (0.035 + 0.008 * sin(uTime * 9.0 + position.y * 8.0));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() { gl_FragColor = vec4(uColor * uOpacity, uOpacity); }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
