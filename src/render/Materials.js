import * as THREE from 'three';
import { COLORS } from '../core/config.js';

/**
 * Adds procedural metal panel seams + per-panel tint/roughness variation using world-space
 * coordinates, so any box (including instanced, non-uniformly scaled ones) gets consistent panels.
 */
export function applyPanels(mat, sizeX, sizeY, seamDark = 0.6) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPanel = { value: new THREE.Vector2(sizeX, sizeY) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 wp4 = vec4(transformed, 1.0);
        vec3 n4 = objectNormal;
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
          n4 = mat3(instanceMatrix) * n4;
        #endif
        wp4 = modelMatrix * wp4;
        vWPos = wp4.xyz;
        vWNorm = normalize(mat3(modelMatrix) * n4);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\nuniform vec2 uPanel;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 an = abs(vWNorm);
        vec2 puv = an.y > 0.5 ? vWPos.xz : (an.x > 0.5 ? vWPos.zy : vWPos.xy);
        vec2 cell = floor(puv / uPanel);
        vec2 local = abs(fract(puv / uPanel) - 0.5) * uPanel;
        vec2 edge = 0.5 * uPanel - local;
        float seam = 1.0 - smoothstep(0.0, 0.035, min(edge.x, edge.y));
        float hsh = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        diffuseColor.rgb *= (0.78 + 0.4 * hsh) * (1.0 - seam * ${seamDark.toFixed(3)});`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.7 + 0.6 * hsh) + seam * 0.3, 0.05, 1.0);`,
      );
  };
  mat.customProgramCacheKey = () => `panels-${sizeX}-${sizeY}-${seamDark}`;
  return mat;
}

/** Unlit HDR colour (values > 1 feed the bloom pass). */
export function glow(hex, intensity = 3, opts = {}) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(intensity), ...opts });
  m.userData.baseColor = m.color.clone();
  return m;
}

export function createMaterials() {
  const m = {
    floor: applyPanels(new THREE.MeshStandardMaterial({ color: 0x1c2130, metalness: 0.85, roughness: 0.34, envMapIntensity: 0.9 }), 2, 2, 0.7),
    wall: applyPanels(new THREE.MeshStandardMaterial({ color: 0x2a3042, metalness: 0.75, roughness: 0.45, envMapIntensity: 0.7 }), 1.6, 1.2, 0.55),
    ceiling: applyPanels(new THREE.MeshStandardMaterial({ color: 0x12151e, metalness: 0.6, roughness: 0.6, envMapIntensity: 0.4 }), 2, 2, 0.5),
    block: applyPanels(new THREE.MeshStandardMaterial({ color: 0x343b52, metalness: 0.8, roughness: 0.35, envMapIntensity: 0.9 }), 1, 0.9, 0.6),
    door: applyPanels(new THREE.MeshStandardMaterial({ color: 0x3a4258, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.0 }), 0.6, 0.8, 0.5),
    metal: new THREE.MeshStandardMaterial({ color: 0x3b4256, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.0 }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x151923, metalness: 0.8, roughness: 0.45, envMapIntensity: 0.7 }),
    pitFloor: new THREE.MeshBasicMaterial({ color: 0x050208 }),
    neon: new THREE.MeshBasicMaterial({ color: 0xffffff }),

    blue: glow(COLORS.blue, 2.0),
    blueDim: glow(COLORS.blue, 0.9),
    wireOff: glow(COLORS.blue, 0.55),
    wireOn: glow(COLORS.green, 0.9),
    green: glow(COLORS.green, 2.0),
    red: glow(COLORS.red, 3.2),
    redDim: glow(COLORS.red, 0.8),
    white: glow(COLORS.white, 2.4),
    purple: glow(COLORS.purple, 2.4),
    cyan: glow(COLORS.cyan, 2.6),
    off: glow(0x1a2233, 1),
  };
  m.neon.userData.baseColor = m.neon.color.clone();
  return m;
}

/** Visual-language material for a state name. */
export function stateMaterial(mats, state) {
  switch (state) {
    case 'active':
      return mats.green;
    case 'danger':
      return mats.red;
    case 'objective':
      return mats.white;
    case 'off':
      return mats.off;
    default:
      return mats.blue;
  }
}
