import * as THREE from 'three';
import { COLORS } from '../core/config.js';
import { createConeMaterial, createLightCone } from './LightCones.js';
import { CORRIDOR_HEIGHT } from '../puzzle/LabLayout.js';

const ACCENT = {
  blue: [COLORS.blue, COLORS.purple],
  purple: [COLORS.purple, COLORS.blue],
  white: [COLORS.white, COLORS.cyan],
};

/** Collects boxes and emits a single InstancedMesh (optionally with per-instance HDR colours). */
class InstanceBatch {
  constructor() {
    this.items = [];
  }

  add(x0, y0, z0, x1, y1, z1, color = null, intensity = 1) {
    this.items.push({ x0, y0, z0, x1, y1, z1, color, intensity });
  }

  addBox(b, color = null, intensity = 1) {
    this.add(b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2], color, intensity);
  }

  build(geometry, material) {
    const n = this.items.length;
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, n));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    this.items.forEach((it, i) => {
      p.set((it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, (it.z0 + it.z1) / 2);
      s.set(Math.max(0.001, it.x1 - it.x0), Math.max(0.001, it.y1 - it.y0), Math.max(0.001, it.z1 - it.z0));
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      if (it.color !== null) mesh.setColorAt(i, c.set(it.color).multiplyScalar(it.intensity));
    });
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

function makeSign(lines, color = '#8fd0ff') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(6,10,24,0.92)';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.strokeRect(6, 6, 500, 116);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 16;
  g.font = 'bold 54px Consolas, "Courier New", monospace';
  g.fillText(lines[0], 256, lines[1] ? 50 : 64);
  if (lines[1]) {
    g.font = '24px Consolas, "Courier New", monospace';
    g.fillStyle = color;
    g.fillText(lines[1], 256, 98);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.6, 1.6, 1.6) });
  return mat;
}

const pitMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vW;
      void main() {
        vec2 g = abs(fract(vW.xz * 0.8) - 0.5);
        float line = smoothstep(0.44, 0.5, max(g.x, g.y));
        float pulse = 0.6 + 0.4 * sin(uTime * 2.0 + vW.x * 0.3 + vW.z * 0.2);
        vec3 c = vec3(1.0, 0.08, 0.16) * (0.08 + line * 2.2 * pulse);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });

/**
 * Builds all static lab geometry as a handful of instanced draw calls:
 * floors, walls, blocks, ceilings, neon trims; plus signs, pits and ceiling light cones.
 * Returns per-room light anchor positions for the LightRig.
 */
export function buildLabGeometry(sim, mats, geos) {
  const group = new THREE.Group();
  const floors = new InstanceBatch();
  const walls = new InstanceBatch();
  const blocks = new InstanceBatch();
  const ceilings = new InstanceBatch();
  const neon = new InstanceBatch();
  const fixtures = new InstanceBatch();
  const roomInfo = [];
  const pitMat = pitMaterial();
  const coneMats = {};
  const coneMat = (hex) => (coneMats[hex] ??= createConeMaterial(hex, 0.1));

  for (const room of sim.rooms) {
    const [c1, c2] = ACCENT[room.cfg.accent] ?? ACCENT.blue;
    const { minX, maxX, minZ, maxZ } = room.bounds;
    const h = room.h;
    const info = { room, lights: [], cones: [], signs: [] };

    for (const b of room.geometry.floors) floors.addBox(b);
    for (const b of room.geometry.walls) walls.addBox(b);
    for (const b of room.geometry.blocks) {
      blocks.addBox(b);
      const t = 0.05;
      const y = b.max[1];
      neon.add(b.min[0], y - t, b.max[2] - t, b.max[0], y + 0.005, b.max[2] + 0.005, c2, 2.2);
      neon.add(b.min[0], y - t, b.min[2] - 0.005, b.max[0], y + 0.005, b.min[2] + t, c2, 2.2);
      neon.add(b.min[0] - 0.005, y - t, b.min[2], b.min[0] + t, y + 0.005, b.max[2], c2, 2.2);
      neon.add(b.max[0] - t, y - t, b.min[2], b.max[0] + 0.005, y + 0.005, b.max[2], c2, 2.2);
    }
    ceilings.add(minX - 0.2, h, minZ - 0.2, maxX + 0.2, h + 0.3, maxZ + 0.2);

    for (const p of room.geometry.pits) {
      const mesh = new THREE.Mesh(geos.plane, pitMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(p.max[0] - p.min[0], p.max[2] - p.min[2], 1);
      mesh.position.set((p.min[0] + p.max[0]) / 2, -5.8, (p.min[2] + p.max[2]) / 2);
      group.add(mesh);
      const t = 0.2;
      walls.add(p.min[0], -6, p.min[2] - t, p.max[0], -0.5, p.min[2]);
      walls.add(p.min[0], -6, p.max[2], p.max[0], -0.5, p.max[2] + t);
      walls.add(p.min[0] - t, -6, p.min[2], p.min[0], -0.5, p.max[2]);
      walls.add(p.max[0], -6, p.min[2], p.max[0] + t, -0.5, p.max[2]);
      neon.add(p.min[0], -0.04, p.min[2] - 0.08, p.max[0], 0.005, p.min[2], COLORS.red, 2.5);
      neon.add(p.min[0], -0.04, p.max[2], p.max[0], 0.005, p.max[2] + 0.08, COLORS.red, 2.5);
    }

    const inset = 0.22;
    const strip = (x0, z0, x1, z1, color, k = 2) => neon.add(x0, 0.02, z0, x1, 0.07, z1, color, k);
    strip(minX + inset, minZ + 0.3, minX + inset + 0.06, maxZ - 0.3, c1);
    strip(maxX - inset - 0.06, minZ + 0.3, maxX - inset, maxZ - 0.3, c1);
    const gapStrip = (z, gapX) => {
      const gx0 = gapX - 1.5;
      const gx1 = gapX + 1.5;
      if (gx0 > minX + 0.4) strip(minX + 0.3, z - 0.03, gx0, z + 0.03, c2);
      if (gx1 < maxX - 0.4) strip(gx1, z - 0.03, maxX - 0.3, z + 0.03, c2);
    };
    gapStrip(maxZ - inset, room.spawn.x);
    if (room.kind !== 'escape') gapStrip(minZ + inset, room.origin.x + (room.cfg.exitX ?? 0));

    for (let z = minZ + 2; z < maxZ - 1.5; z += 3) {
      neon.add(minX + 0.2, 1.1, z - 0.05, minX + 0.25, 2.9, z + 0.05, z % 2 ? c1 : c2, 1.6);
      neon.add(maxX - 0.25, 1.1, z - 0.05, maxX - 0.2, 2.9, z + 0.05, z % 2 ? c2 : c1, 1.6);
    }
    for (let x = minX + 3; x < maxX - 2; x += 4) {
      neon.add(x - 0.08, h - 0.06, minZ + 1, x + 0.08, h, maxZ - 1, c1, 1.3);
    }

    const lightDefs = room.cfg.lights ?? [
      { pos: [-room.w / 4, h - 0.7, room.d / 5], color: c1 },
      { pos: [room.w / 4, h - 0.7, -room.d / 5], color: c2 },
      { pos: [0, h - 0.7, -room.d / 2 + 2.5], color: room.kind === 'escape' ? COLORS.white : 0x9ab8ff },
    ];
    for (const L of lightDefs) {
      const p = room.toWorld(L.pos[0], L.pos[1], L.pos[2]);
      info.lights.push({ pos: new THREE.Vector3(p.x, p.y, p.z), color: new THREE.Color(L.color) });
      fixtures.add(p.x - 0.5, h - 0.08, p.z - 0.5, p.x + 0.5, h, p.z + 0.5);
      neon.add(p.x - 0.4, h - 0.1, p.z - 0.4, p.x + 0.4, h - 0.08, p.z + 0.4, L.color, 3);
      const cone = createLightCone(geos, coneMat(L.color), { x: p.x, y: h - 0.1, z: p.z }, h - 0.1, Math.min(2.4, h * 0.42));
      group.add(cone);
      info.cones.push(cone);
    }

    if (room.kind !== 'escape') {
      const code = String(room.cfg.id).padStart(2, '0');
      const signMat = makeSign([`ROOM ${code}`, room.cfg.name], '#' + new THREE.Color(c1).getHexString());
      const sign = new THREE.Mesh(geos.plane, signMat);
      const ex = room.origin.x + (room.cfg.exitX ?? 0);
      sign.scale.set(2.4, 0.6, 1);
      sign.position.set(ex, Math.min(h - 0.5, 4.0), minZ + 0.22);
      group.add(sign);
      info.signs.push(sign);
    } else {
      const signMat = makeSign(['EXIT', 'SURFACE ACCESS'], '#eef6ff');
      const sign = new THREE.Mesh(geos.plane, signMat);
      sign.scale.set(2.4, 0.6, 1);
      sign.position.set(room.origin.x, 4.2, minZ + 0.22);
      group.add(sign);
      info.signs.push(sign);
      const beam = createLightCone(geos, coneMat(COLORS.white), { x: room.origin.x, y: h - 0.05, z: room.origin.z }, h, 2.2);
      beam.material = createConeMaterial(COLORS.white, 0.45);
      group.add(beam);
      info.cones.push(beam);
    }
    roomInfo.push(info);
  }

  for (const c of sim.corridors) {
    floors.addBox(c.floor);
    for (const w of c.walls) walls.addBox(w);
    ceilings.addBox(c.ceiling);
    neon.add(c.x - 1.15, 0.02, c.z1, c.x - 1.1, 0.07, c.z0, COLORS.cyan, 2);
    neon.add(c.x + 1.1, 0.02, c.z1, c.x + 1.15, 0.07, c.z0, COLORS.cyan, 2);
    neon.add(c.x - 0.1, CORRIDOR_HEIGHT - 0.05, c.z1 + 0.4, c.x + 0.1, CORRIDOR_HEIGHT, c.z0 - 0.4, COLORS.cyan, 2.2);
  }

  const meshes = {
    floors: floors.build(geos.box, mats.floor),
    walls: walls.build(geos.box, mats.wall),
    blocks: blocks.build(geos.box, mats.block),
    ceilings: ceilings.build(geos.box, mats.ceiling),
    neon: neon.build(geos.box, mats.neon),
    fixtures: fixtures.build(geos.box, mats.metalDark),
  };
  for (const m of Object.values(meshes)) group.add(m);
  return { group, roomInfo, meshes, pitMat, coneMats };
}
