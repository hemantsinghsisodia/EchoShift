import * as THREE from 'three';

/** Fake volumetric light: an open additive cone that fades toward its base and its silhouette edges. */
export function createConeMaterial(color, intensity = 0.2) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying float vH;
      void main() {
        vH = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vN;
      varying vec3 vV;
      varying float vH;
      void main() {
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float a = facing * facing * pow(clamp(vH, 0.0, 1.0), 1.6) * uIntensity;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Cone whose tip sits at `top` and spreads to `radius` at `top.y - height`. */
export function createLightCone(geos, material, top, height, radius) {
  const mesh = new THREE.Mesh(geos.cone, material);
  mesh.scale.set(radius * 2, height, radius * 2);
  mesh.position.set(top.x, top.y - height / 2, top.z);
  mesh.renderOrder = 5;
  mesh.frustumCulled = true;
  return mesh;
}
