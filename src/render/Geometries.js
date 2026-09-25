import * as THREE from 'three';

/** Shared geometries; every mesh in the game reuses these (scaled) instead of allocating its own. */
export function createGeometries() {
  const squareRing = new THREE.RingGeometry(0.86, 1, 4, 1);
  squareRing.rotateZ(Math.PI / 4);
  squareRing.rotateX(-Math.PI / 2);
  squareRing.scale(Math.SQRT1_2, 1, Math.SQRT1_2);
  const flatDisc = new THREE.CircleGeometry(0.5, 28);
  flatDisc.rotateX(-Math.PI / 2);
  return {
    squareRing,
    flatDisc,
    box: new THREE.BoxGeometry(1, 1, 1),
    plane: new THREE.PlaneGeometry(1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
    cylinderLow: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
    disc: new THREE.CircleGeometry(0.5, 28),
    ring: new THREE.RingGeometry(0.42, 0.5, 40),
    torus: new THREE.TorusGeometry(0.5, 0.035, 8, 40),
    octa: new THREE.OctahedronGeometry(0.5, 0),
    icosa: new THREE.IcosahedronGeometry(0.5, 1),
    sphere: new THREE.SphereGeometry(0.5, 16, 12),
    capsule: new THREE.CapsuleGeometry(0.28, 1.0, 5, 12),
    cone: new THREE.ConeGeometry(0.5, 1, 28, 1, true),
  };
}
