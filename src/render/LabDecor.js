import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, DOOR_WIDTH } from '../core/config.js';

/** Placement data for the decoration kit. Geometry lives in lab_kit.glb; planning never loads it. */
export const KIT_CATALOG = {
  decor_pipe: { slot: 'wall', depth: 0.16, width: 1.4, top: 0.66, role: 'root' },
  decor_elbow: { slot: 'wall', depth: 0.28, width: 0.7, top: 0.5, role: 'root' },
  decor_cable: { slot: 'wall', depth: 0.1, width: 1.0, top: 0.64, role: 'root' },
  decor_rack: { slot: 'wall', depth: 0.24, width: 0.7, top: 1.88, role: 'root' },
  decor_console: { slot: 'wall', depth: 0.16, width: 1.1, top: 1.13, role: 'root' },
  decor_vent: { slot: 'wall', depth: 0.08, width: 0.85, top: 0.94, role: 'root' },
  decor_conduit: { slot: 'wall', depth: 0.12, width: 1.2, top: 0.63, role: 'root' },
  decor_placard: { slot: 'wall', depth: 0.03, width: 0.45, top: 0.83, role: 'root' },
  decor_crate: { slot: 'floor', depth: 0.55, width: 0.7, top: 0.46, role: 'root' },
  decor_canister: { slot: 'floor', depth: 0.36, width: 0.36, top: 0.9, role: 'root' },
  decor_pillar: { slot: 'floor', depth: 0.24, width: 0.28, top: 2.07, role: 'root' },
  decor_duct: { slot: 'ceiling', depth: 0.45, width: 1.6, top: 0, hang: 0.21, role: 'root' },
  decor_truss: { slot: 'ceiling', depth: 0.12, width: 1.4, top: 0, hang: 0.06, role: 'root' },
};

const THEMES = {
  lab: ['decor_console', 'decor_rack', 'decor_placard', 'decor_cable', 'decor_pipe'],
  security: ['decor_vent', 'decor_conduit', 'decor_placard', 'decor_pipe'],
  industrial: ['decor_pipe', 'decor_elbow', 'decor_crate', 'decor_canister', 'decor_duct'],
  data: ['decor_rack', 'decor_cable', 'decor_console', 'decor_placard'],
  reactor: ['decor_pipe', 'decor_canister', 'decor_pillar', 'decor_truss', 'decor_duct'],
};

const THEME_BY_ID = {
  1: 'lab',
  2: 'lab',
  3: 'security',
  4: 'security',
  5: 'industrial',
  6: 'data',
  7: 'data',
  8: 'reactor',
  9: 'lab',
};

const WALL_FACE = 0.2;
const CORNER = 0.5;
const OBJECT_PAD = 1.8;
const DOOR_PAD = 1.2;
const PIT_PAD = 0;
const WALL_PAD = 0.25;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function aabb(x0, z0, x1, z1) {
  return {
    minX: Math.min(x0, x1),
    maxX: Math.max(x0, x1),
    minZ: Math.min(z0, z1),
    maxZ: Math.max(z0, z1),
  };
}

function overlaps(a, b, pad) {
  return a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;
}

/** Horizontal footprint of a placed prop. Local +Z points into the room after rotY. */
export function decorFootprint(p, spec) {
  const tx = Math.cos(p.rotY);
  const tz = -Math.sin(p.rotY);
  const ix = Math.sin(p.rotY);
  const iz = Math.cos(p.rotY);
  const hw = spec.width / 2;
  const d = spec.depth;
  const xs = [0, tx * hw, -tx * hw, ix * d, ix * d + tx * hw, ix * d - tx * hw].map((v) => p.x + v);
  const zs = [0, tz * hw, -tz * hw, iz * d, iz * d + tz * hw, iz * d - tz * hw].map((v) => p.z + v);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

/** Puzzle-object boxes in room-local metres, from config only. */
export function puzzleAabbs(cfg) {
  const out = [];
  for (const o of cfg.objects ?? []) {
    if (o.min && o.max) {
      out.push(aabb(o.min[0], o.min[2], o.max[0], o.max[2]));
      continue;
    }
    if (!o.pos) continue;
    const x = o.pos[0];
    const z = o.pos[2];
    let hx = 0.5;
    let hz = 0.5;
    if (o.type === 'plate') {
      hx = hz = (o.size ?? 1.6) / 2;
    } else if (o.type === 'door') {
      const hw = (o.width ?? DOOR_WIDTH) / 2;
      const ht = (o.thickness ?? 0.35) / 2;
      if ((o.axis ?? 'x') === 'z') {
        hx = ht;
        hz = hw;
      } else {
        hx = hw;
        hz = ht;
      }
    } else if (o.type === 'platform') {
      hx = (o.size?.[0] ?? 3) / 2;
      hz = (o.size?.[1] ?? 3) / 2;
      if (o.to) {
        out.push(aabb(Math.min(x, o.to[0]) - hx, Math.min(z, o.to[2]) - hz, Math.max(x, o.to[0]) + hx, Math.max(z, o.to[2]) + hz));
        continue;
      }
    } else if (o.type === 'furnace') {
      hx = (o.size?.[0] ?? 2) / 2;
      hz = (o.size?.[1] ?? 2) / 2;
    } else if (o.type === 'node') {
      hx = hz = 0.45;
    } else if (o.type === 'switch' || o.type === 'button') {
      hx = hz = 0.3;
    }
    out.push(aabb(x - hx, z - hz, x + hx, z + hz));
  }
  return out;
}

function doorAabbs(cfg) {
  const hd = cfg.d / 2;
  const half = DOOR_WIDTH / 2;
  const doors = [aabb((cfg.entranceX ?? 0) - half, hd - 0.4, (cfg.entranceX ?? 0) + half, hd + 0.4)];
  if ((cfg.kind ?? 'puzzle') !== 'escape') {
    doors.push(aabb((cfg.exitX ?? 0) - half, -hd - 0.4, (cfg.exitX ?? 0) + half, -hd + 0.4));
  }
  return doors;
}

function themeNames(cfg, catalog) {
  const theme = cfg.decor?.theme ?? THEME_BY_ID[cfg.id] ?? 'lab';
  const names = (THEMES[theme] ?? THEMES.lab).filter((n) => catalog[n] && catalog[n].role !== 'fan');
  return {
    wall: names.filter((n) => catalog[n].slot === 'wall'),
    floor: names.filter((n) => catalog[n].slot === 'floor'),
    ceiling: names.filter((n) => catalog[n].slot === 'ceiling'),
  };
}

/**
 * Seeded, render-only dressing. Positions are room-local. The same cfg and rng sequence
 * always return the same list. density below 1 drops candidates in rng order.
 */
export function planDecor(cfg, catalog, rng, { density = 1 } = {}) {
  const names = themeNames(cfg, catalog);
  const hw = cfg.w / 2;
  const hd = cfg.d / 2;
  const h = cfg.h ?? 5;
  const objects = puzzleAabbs(cfg);
  const doors = doorAabbs(cfg);
  const pits = (cfg.pits ?? []).map((p) => aabb(p[0], p[1], p[2], p[3]));
  const solids = [...(cfg.blocks ?? []), ...(cfg.glass ?? []), ...(cfg.walls ?? [])].map((b) => aabb(b[0], b[2], b[3], b[5]));
  const out = [];

  function blocked(p, spec) {
    const box = decorFootprint(p, spec);
    if (box.minX < -hw - 0.02 || box.maxX > hw + 0.02 || box.minZ < -hd - 0.02 || box.maxZ > hd + 0.02) return true;
    if (spec.slot !== 'ceiling') {
      const top = p.y + spec.top;
      if (p.y < -0.02 || top > h + 0.02) return true;
    }
    for (const pit of pits) if (overlaps(box, pit, PIT_PAD)) return true;
    for (const door of doors) if (overlaps(box, door, DOOR_PAD)) return true;
    for (const o of objects) if (overlaps(box, o, OBJECT_PAD)) return true;
    for (const s of solids) if (overlaps(box, s, WALL_PAD)) return true;
    return false;
  }

  function add(name, x, y, z, rotY) {
    const spec = catalog[name];
    if (!spec || rng() > density) return;
    const p = { name, slot: spec.slot, x, y, z, rotY };
    if (!blocked(p, spec)) out.push(p);
  }

  function wallY(spec) {
    if (spec.top >= 1.5) return 0;
    const choices = [0.25, 1.1, 1.75].filter((y) => y + spec.top <= h - 0.15);
    if (!choices.length) return 0;
    return choices[Math.floor(rng() * choices.length)];
  }

  function walkWall(along0, along1, rotY, place) {
    const pool = names.wall;
    const floors = names.floor;
    if (!pool.length && !floors.length) return;
    let cursor = along0 + CORNER;
    const end = along1 - CORNER;
    let i = 0;
    while (cursor < end - 0.15) {
      const useFloor = floors.length > 0 && i % 4 === 3;
      const list = useFloor ? floors : pool;
      if (!list.length) break;
      const name = list[i % list.length];
      const spec = catalog[name];
      if (cursor + spec.width > end) break;
      const center = cursor + spec.width / 2;
      cursor += spec.width + 0.5;
      i += 1;
      const y = useFloor ? 0 : wallY(spec);
      place(name, center, y, rotY);
    }
  }

  walkWall(-hw, hw, Math.PI, (name, x, y, rotY) => add(name, x, y, hd - WALL_FACE, rotY));
  walkWall(-hw, hw, 0, (name, x, y, rotY) => add(name, x, y, -hd + WALL_FACE, rotY));
  walkWall(-hd, hd, -Math.PI / 2, (name, z, y, rotY) => add(name, hw - WALL_FACE, y, z, rotY));
  walkWall(-hd, hd, Math.PI / 2, (name, z, y, rotY) => add(name, -hw + WALL_FACE, y, z, rotY));

  if (names.ceiling.length) {
    let row = 0;
    for (let z = -hd + 1.3; z <= hd - 1.3; z += 2.6) {
      let col = 0;
      for (let x = -hw + 1.3; x <= hw - 1.3; x += 2.8) {
        const name = names.ceiling[(row + col) % names.ceiling.length];
        add(name, x, h, z, col % 2 === 0 ? 0 : Math.PI / 2);
        col += 1;
      }
      row += 1;
    }
  }

  return out;
}

const KIND = { Kit_Metal: 0, Kit_Paint: 1, Kit_Emissive: 2 };

let kitPromise = null;
let kitGltf = null;

/** Loads the decoration kit. Resolves to null when the file is missing. */
export function loadLabKit() {
  if (kitGltf) return Promise.resolve(kitGltf);
  if (kitPromise) return kitPromise;
  kitPromise = new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load(
      import.meta.env.BASE_URL + 'models/lab_kit.glb',
      (gltf) => {
        kitGltf = gltf;
        resolve(gltf);
      },
      undefined,
      () => resolve(null),
    );
  });
  return kitPromise;
}

function findNode(root, name) {
  let found = null;
  root.traverse((o) => {
    if (o.name === name) found = o;
  });
  return found;
}

function propGeometry(node) {
  node.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
  const parts = [];
  node.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const kind = KIND[mat?.name] ?? 0;
    const g = mesh.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().copy(inv).multiply(mesh.matrixWorld));
    const count = g.getAttribute('position').count;
    const kinds = new Float32Array(count);
    kinds.fill(kind);
    g.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
    parts.push(g);
  });
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
}

function decorMaterial(uTime) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0.5,
    emissive: 0x000000,
    envMapIntensity: 0.85,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aKind;\nvarying float vKind;\nvarying float vFlick;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKind = aKind;\nvFlick = float(gl_InstanceID);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vKind;\nvarying float vFlick;\nuniform float uTime;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
          vec3 accent = vColor.rgb;
        #else
          vec3 accent = vec3(0.45, 0.75, 1.0);
        #endif
        vec3 metalCol = vec3(0.42, 0.46, 0.52);
        vec3 paintCol = mix(vec3(0.12, 0.14, 0.18), accent, 0.42);
        if (vKind < 0.5) diffuseColor.rgb = metalCol;
        else if (vKind < 1.5) diffuseColor.rgb = paintCol;
        else diffuseColor.rgb = accent * 0.2;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = vKind < 0.5 ? 0.32 : (vKind < 1.5 ? 0.55 : 0.22);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = vKind < 0.5 ? 0.92 : (vKind < 1.5 ? 0.18 : 0.35);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (vKind > 1.5) {
          float flick = 0.78 + 0.22 * sin(uTime * 5.0 + vFlick);
          totalEmissiveRadiance = accent * (1.8 * flick);
        } else {
          totalEmissiveRadiance = vec3(0.0);
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'lab-decor-v1';
  return mat;
}

/**
 * One instanced mesh per prop, plus a spinning fan mesh. Missing kit meshes are skipped.
 * Returns null when nothing could be built.
 */
export function buildDecor(gltf, rooms, quality = 'high') {
  const density = quality === 'low' ? 0.6 : 1;
  const scene = gltf.scene;
  const uTime = { value: 0 };
  const material = decorMaterial(uTime);
  const group = new THREE.Group();
  group.name = 'lab-decor';
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();

  const buckets = new Map();
  const vents = [];
  for (const room of rooms) {
    const placed = planDecor(room.cfg, KIT_CATALOG, mulberry32(room.cfg.id), { density });
    const accent = new THREE.Color(COLORS[room.cfg.accent] ?? COLORS.blue);
    for (const p of placed) {
      if (!findNode(scene, p.name)) continue;
      const world = {
        name: p.name,
        x: room.origin.x + p.x,
        y: p.y,
        z: room.origin.z + p.z,
        rotY: p.rotY,
        color: accent,
      };
      if (!buckets.has(p.name)) buckets.set(p.name, []);
      buckets.get(p.name).push(world);
      if (p.name === 'decor_vent') vents.push(world);
    }
  }

  for (const [name, items] of buckets) {
    const node = findNode(scene, name);
    let geo = null;
    try {
      geo = node ? propGeometry(node) : null;
    } catch {
      geo = null;
    }
    if (!geo || !items.length) continue;
    const mesh = new THREE.InstancedMesh(geo, material, items.length);
    mesh.name = name;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      q.setFromAxisAngle(up, it.rotY);
      pos.set(it.x, it.y, it.z);
      m.compose(pos, q, one);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, it.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  let fans = null;
  const fanNode = findNode(scene, 'decor_vent_fan');
  if (fanNode && vents.length) {
    let geo = null;
    try {
      geo = propGeometry(fanNode);
    } catch {
      geo = null;
    }
    if (geo) {
      const offset = fanNode.position.clone();
      if (offset.lengthSq() < 1e-6) offset.set(0, 0.55, 0.07);
      fans = new THREE.InstancedMesh(geo, material, vents.length);
      fans.name = 'decor_vent_fan';
      const bases = [];
      const qYaw = new THREE.Quaternion();
      const shifted = new THREE.Vector3();
      for (let i = 0; i < vents.length; i++) {
        const it = vents[i];
        qYaw.setFromAxisAngle(up, it.rotY);
        shifted.copy(offset).applyQuaternion(qYaw);
        const p = new THREE.Vector3(it.x + shifted.x, it.y + shifted.y, it.z + shifted.z);
        const yaw = qYaw.clone();
        bases.push({ pos: p, yaw });
        m.compose(p, yaw, one);
        fans.setMatrixAt(i, m);
        fans.setColorAt(i, it.color);
      }
      fans.userData.bases = bases;
      fans.instanceMatrix.needsUpdate = true;
      if (fans.instanceColor) fans.instanceColor.needsUpdate = true;
      fans.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      fans.computeBoundingSphere();
      group.add(fans);
    }
  }

  if (!group.children.length) return null;
  return new DecorView(group, fans, uTime);
}

class DecorView {
  constructor(group, fans, uTime) {
    this.group = group;
    this.fans = fans;
    this.uTime = uTime;
    this.qSpin = new THREE.Quaternion();
    this.q = new THREE.Quaternion();
    this.m = new THREE.Matrix4();
    this.axis = new THREE.Vector3(0, 0, 1);
    this.scale = new THREE.Vector3(1, 1, 1);
  }

  update(time) {
    this.uTime.value = time;
    const fans = this.fans;
    if (!fans) return;
    const bases = fans.userData.bases;
    for (let i = 0; i < bases.length; i++) {
      this.qSpin.setFromAxisAngle(this.axis, time * 2.2 + i * 0.65);
      this.q.multiplyQuaternions(bases[i].yaw, this.qSpin);
      this.m.compose(bases[i].pos, this.q, this.scale);
      fans.setMatrixAt(i, this.m);
    }
    fans.instanceMatrix.needsUpdate = true;
  }
}
