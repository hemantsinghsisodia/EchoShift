import * as THREE from 'three';
import { COLORS } from '../core/config.js';
import { createConeMaterial, createLightCone } from './LightCones.js';

export class HunterView {
  constructor(hunter, { mats, geos }) {
    this.hunter = hunter;
    this.group = new THREE.Group();
    this.body = new THREE.Mesh(geos.octa, mats.metalDark);
    this.body.scale.set(0.85, 1.2, 0.85);
    this.body.position.y = 1.05;
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.red).multiplyScalar(3) });
    this.eye = new THREE.Mesh(geos.sphere, this.eyeMat);
    this.eye.scale.setScalar(0.12);
    this.eye.position.set(0, 1.2, -0.42);
    this.shards = [];
    for (let i = 0; i < 4; i++) {
      const shard = new THREE.Mesh(geos.octa, mats.red);
      shard.scale.set(0.16, 0.35, 0.16);
      this.shards.push(shard);
      this.group.add(shard);
    }
    this.scan = createLightCone(geos, createConeMaterial(COLORS.red, 0.09), { x: 0, y: 1.3, z: -0.3 }, 4, 2.4);
    this.scan.rotation.x = Math.PI / 2;
    this.group.add(this.body, this.eye, this.scan);
  }

  update(time, alpha) {
    const h = this.hunter;
    this.group.position.set(
      h.prevPos.x + (h.pos.x - h.prevPos.x) * alpha,
      0,
      h.prevPos.z + (h.pos.z - h.prevPos.z) * alpha,
    );
    const target = h.target?.pos;
    this.group.rotation.y = target
      ? Math.atan2(-(target.x - h.pos.x), -(target.z - h.pos.z))
      : Math.sin(time * 0.5) * 0.4;
    this.body.position.y = 1.05 + Math.sin(time * 2.2) * 0.08;
    this.shards.forEach((shard, i) => {
      const a = time * 1.4 + (i / this.shards.length) * Math.PI * 2;
      shard.position.set(Math.cos(a) * 0.65, 1.05 + Math.sin(a * 2) * 0.2, Math.sin(a) * 0.65);
      shard.rotation.set(time + i, time * 1.3, 0);
    });
    this.eyeMat.color.set(h.target ? 0xffffff : COLORS.red).multiplyScalar(3);
    this.scan.visible = !h.target;
    this.scan.rotation.z = Math.sin(time * 1.3) * 0.7;
  }
}
