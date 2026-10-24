import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { HALF_L, WINDOW } from './layout.js';

// Langit bergradasi (atas biru, cakrawala terang, bawah tanah) sebagai latar belakang.
function skyTexture(top, horizon, ground) {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, top);
  grad.addColorStop(0.48, horizon);
  grad.addColorStop(0.5, horizon);
  grad.addColorStop(0.53, ground);
  grad.addColorStop(1, ground);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Cahaya alami (matahari + langit + cahaya jendela) dan pengaturan suasana siang/malam.
// getLamps() = daftar lampu buatan (plafon, lampu tidur, lampu meja) yang punya userData { day, night }.
export function createLighting(scene, { getLamps, glowMaterials }) {
  RectAreaLightUniformsLib.init();

  // Cahaya langit merata (pengganti pantulan antar dinding). Dibuat lemah agar ada kontras.
  const sky = new THREE.HemisphereLight('#e4ecf7', '#c2ab8c', 0.5);
  scene.add(sky);

  // Cahaya lembut dari bidang jendela: sisi kamar dekat jendela lebih terang, sisi jauh lebih redup,
  // seperti di foto interior sungguhan.
  const windowLight = new THREE.RectAreaLight('#e6eefa', 4, WINDOW.width, WINDOW.height);
  windowLight.position.set(HALF_L - 0.01, WINDOW.sill + WINDOW.height / 2, WINDOW.centerZ);
  windowLight.lookAt(0, WINDOW.sill + WINDOW.height / 2, WINDOW.centerZ);
  scene.add(windowLight);

  // Matahari dari luar jendela (dinding kanan): sinar tajam di lantai & kasur.
  // Area bayangan harus mencakup seluruh kamar (termasuk sudut atas dinding & plafon)
  // dan bayangan bangunan di tanah; jika tidak, cahaya "bocor" menembus plafon.
  const sun = new THREE.DirectionalLight('#fff0d8', 3.2);
  sun.position.set(7, 6.2, 1.0);
  sun.target.position.set(0, 1.2, 0.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -5.5, right: 5.5, top: 5.5, bottom: -5.5, near: 1, far: 20 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // Tanah di luar kamar
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({ color: '#c4c0b0', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.051;
  ground.receiveShadow = true;
  scene.add(ground);

  const backgrounds = {
    day: skyTexture('#86aed6', '#e9eff3', '#c9c6b8'),
    night: skyTexture('#070c18', '#1b2540', '#10141c'),
  };

  function setMode(mode) {
    const night = mode === 'night';
    sky.intensity = night ? 0.04 : 0.75;
    sky.color.set(night ? '#4a5a80' : '#e4ecf7');
    windowLight.intensity = night ? 0.25 : 4;
    windowLight.color.set(night ? '#7d93c9' : '#e6eefa');
    sun.intensity = night ? 0 : 3.2;
    scene.environmentIntensity = night ? 0.03 : 0.4;
    scene.background = night ? backgrounds.night : backgrounds.day;
    for (const lamp of getLamps()) lamp.intensity = night ? lamp.userData.night : lamp.userData.day;
    for (const mat of glowMaterials) mat.emissiveIntensity = night ? mat.userData.night : mat.userData.day;
  }

  return { setMode };
}
