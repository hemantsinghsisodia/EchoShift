import * as THREE from 'three';
import { COLORS } from '../core/config.js';

/**
 * Adds procedural metal panel seams + per-panel tint/roughness variation using world-space
 * coordinates, so any box (including instanced, non-uniformly scaled ones) gets consistent panels.
 */
const PANEL_VARYINGS = `#include <common>
varying vec3 vWPos;
varying vec3 vWNorm;`;

const PANEL_WORLD = `#include <worldpos_vertex>
        vec4 wp4 = vec4(transformed, 1.0);
        vec3 n4 = objectNormal;
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
          n4 = mat3(instanceMatrix) * n4;
        #endif
        wp4 = modelMatrix * wp4;
        vWPos = wp4.xyz;
        vWNorm = normalize(mat3(modelMatrix) * n4);`;

/** World-space panel coordinate. Floor uses xz, X-facing walls use zy, the rest use xy. */
const PUV_FN = `
vec2 labPuv() {
  vec3 an = abs(vWNorm);
  return an.y > 0.5 ? vWPos.xz : (an.x > 0.5 ? vWPos.zy : vWPos.xy);
}`;

export function applyPanels(mat, sizeX, sizeY, seamDark = 0.6) {
  const seam = seamDark.toFixed(3);
  mat.onBeforeCompile = (shader) => {
    const maps = mat.userData.surfaceMaps;
    shader.uniforms.uPanel = { value: new THREE.Vector2(sizeX, sizeY) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', PANEL_VARYINGS)
      .replace('#include <worldpos_vertex>', PANEL_WORLD);
    if (!maps) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\nuniform vec2 uPanel;`)
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
        diffuseColor.rgb *= (0.78 + 0.4 * hsh) * (1.0 - seam * ${seam});`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.7 + 0.6 * hsh) + seam * 0.3, 0.05, 1.0);`,
        );
      return;
    }
    shader.uniforms.uAlbedo = { value: maps.albedo };
    shader.uniforms.uSurfNormal = { value: maps.normal };
    shader.uniforms.uOrm = { value: maps.orm };
    shader.uniforms.uEmissive = { value: maps.emissive };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNorm;
        uniform vec2 uPanel;
        uniform sampler2D uAlbedo;
        uniform sampler2D uSurfNormal;
        uniform sampler2D uOrm;
        uniform sampler2D uEmissive;
        ${PUV_FN}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 N = normalize(vWNorm);
          vec3 an2 = abs(N);
          vec3 T = an2.y > 0.5 ? vec3(1.0, 0.0, 0.0) : (an2.x > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0));
          vec3 B = an2.y > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
          if (dot(cross(T, B), N) < 0.0) B = -B;
          vec2 puvN = labPuv();
          vec2 cellN = floor(puvN / uPanel);
          vec2 tuvN = fract(puvN / uPanel);
          float hshN = fract(sin(dot(cellN, vec2(12.9898, 78.233))) * 43758.5453);
          float h2N = fract(hshN * 13.37);
          vec2 flip = vec2(hshN > 0.5 ? -1.0 : 1.0, h2N > 0.5 ? -1.0 : 1.0);
          tuvN = mix(tuvN, 1.0 - tuvN, vec2(step(0.5, hshN), step(0.5, h2N)));
          vec3 tN = texture2D(uSurfNormal, tuvN).xyz * 2.0 - 1.0;
          tN.xy *= flip;
          normal = normalize(mat3(viewMatrix) * normalize(T * tN.x + B * tN.y + N * tN.z));
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 puv = labPuv();
        vec2 cell = floor(puv / uPanel);
        vec2 tuv = fract(puv / uPanel);
        float hsh = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        float h2 = fract(hsh * 13.37);
        tuv = mix(tuv, 1.0 - tuv, vec2(step(0.5, hsh), step(0.5, h2)));
        diffuseColor.rgb *= texture2D(uAlbedo, tuv).rgb * 2.0 * (0.9 + 0.2 * hsh);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * texture2D(uOrm, tuv).g, 0.04, 1.0);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = clamp(metalnessFactor * texture2D(uOrm, tuv).b, 0.0, 1.0);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += texture2D(uEmissive, tuv).rgb * step(0.82, hsh) * 1.2;`,
      );
  };
  mat.customProgramCacheKey = () => `panels-${sizeX}-${sizeY}-${seamDark}-${mat.userData.surfaceMaps ? 'tex2' : 'flat'}`;
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
    glass: new THREE.MeshStandardMaterial({
      color: 0x9fd8ff,
      metalness: 0.1,
      roughness: 0.05,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      envMapIntensity: 1.5,
    }),
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
