import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const TARGET_HEIGHT = 1.75;

let template = null;
let clips = null;
let pending = null;

/**
 * Loads the CC0 Quaternius character once. The game keeps the procedural body until this
 * resolves, and if the file fails to load.
 */
export function loadEchoModel() {
  if (template) return Promise.resolve(true);
  if (pending) return pending;
  pending = new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load(
      import.meta.env.BASE_URL + 'models/echo.glb',
      (gltf) => {
        template = normalize(gltf.scene);
        clips = {
          idle: clipNamed(gltf.animations, 'idle'),
          walk: clipNamed(gltf.animations, 'walk'),
          run: clipNamed(gltf.animations, 'run'),
          jump: clipNamed(gltf.animations, 'jump'),
        };
        resolve(true);
      },
      undefined,
      () => resolve(false),
    );
  });
  return pending;
}

export function echoModelReady() {
  return template != null && clips?.idle != null;
}

/** A fresh rig. SkeletonUtils.clone keeps skinning intact; plain clone() does not. */
export function cloneEchoModel() {
  if (!echoModelReady()) return null;
  return { rig: SkeletonUtils.clone(template), clips };
}

function normalize(scene) {
  const box = new THREE.Box3().setFromObject(scene);
  const height = Math.max(0.001, box.max.y - box.min.y);
  scene.scale.setScalar(TARGET_HEIGHT / height);
  scene.position.y = -box.min.y * (TARGET_HEIGHT / height);
  scene.rotation.y = Math.PI;
  scene.updateMatrixWorld(true);
  return scene;
}

function clipNamed(animations, want) {
  const tail = (name) => name.split('|').pop().toLowerCase();
  return (
    animations.find((clip) => {
      const name = tail(clip.name);
      if (want === 'run') return name.endsWith('run');
      if (want === 'jump') return name.endsWith('jump') && !name.includes('running');
      return name.endsWith(want);
    }) ?? null
  );
}
