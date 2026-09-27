import * as THREE from 'three';

const KINDS = {
  floor: ['albedo', 'normal', 'orm', 'emissive'],
  wall: ['albedo', 'normal', 'orm', 'emissive'],
  ceiling: ['albedo', 'normal', 'orm'],
};

let black = null;

function blackEmissive() {
  if (black) return black;
  black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  black.colorSpace = THREE.NoColorSpace;
  black.wrapS = black.wrapT = THREE.RepeatWrapping;
  black.needsUpdate = true;
  return black;
}

function loadTexture(url, srgb, anisotropy) {
  const loader = new THREE.TextureLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = anisotropy;
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        resolve(tex);
      },
      undefined,
      () => reject(new Error(url)),
    );
  });
}

/**
 * Loads the baked floor, wall and ceiling sets. `quality` 'low' uses the 512 maps.
 * Resolves to null if any file fails, so the flat panel materials stay in place.
 */
export function loadLabSurfaces(quality = 'high') {
  const size = quality === 'low' ? '512' : '1k';
  const anisotropy = quality === 'low' ? 2 : 8;
  const base = import.meta.env.BASE_URL;
  const jobs = [];
  for (const [kind, maps] of Object.entries(KINDS)) {
    for (const map of maps) {
      const srgb = map === 'albedo' || map === 'emissive';
      const url = `${base}textures/${kind}_${map}_${size}.webp`;
      jobs.push(loadTexture(url, srgb, anisotropy).then((tex) => [kind, map, tex]));
    }
  }
  return Promise.all(jobs)
    .then((loaded) => {
      const pack = {
        floor: { emissive: blackEmissive() },
        wall: { emissive: blackEmissive() },
        ceiling: { emissive: blackEmissive() },
      };
      for (const [kind, map, tex] of loaded) pack[kind][map] = tex;
      return pack;
    })
    .catch(() => null);
}
