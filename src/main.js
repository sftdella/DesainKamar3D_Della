import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createMaterials, setFloorTone, FLOOR_TONES } from './materials.js';
import { buildRoom } from './room.js';
import { createLighting } from './lighting.js';
import { createFurnishing } from './products/furnishing.js';
import { createShopUI } from './products/ui.js';
import { DEFAULT_SELECTION } from './products/placement.js';
import { createArranger } from './products/arrange.js';
import './style.css';

// ---------- Renderer & scene ----------
const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Neutral tone mapping menjaga warna asli material (ACES membuat warna pucat & bergeser).
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // pantulan halus pada material

// ---------- Model kamar ----------
const materials = createMaterials();
const room = buildRoom(materials);

const model = new THREE.Group();
model.name = 'KamarTidur';
model.add(room.root);
scene.add(model);

// Furnitur dari katalog produk (IKEA, INFORMA, AZKO)
const furnishing = createFurnishing({ parent: model, materials, room });

// Lampu produk berubah setiap kali furnitur diganti, jadi daftar lampu dibaca ulang setiap kali
const lighting = createLighting(scene, {
  getLamps: () => [...room.lights, ...furnishing.lights],
  glowMaterials: materials.glowMaterials,
});

// Dinding yang disembunyikan dipindah ke "layer 1": tidak terlihat kamera,
// tetapi tetap ikut dihitung bayangannya (kamera bayangan melihat layer 0 dan 1).
const HIDDEN_LAYER = 1;
scene.traverse((obj) => {
  if (obj.isLight && obj.shadow) obj.shadow.camera.layers.enable(HIDDEN_LAYER);
});

// ---------- Pemeriksaan tata letak ----------
const statusEl = document.querySelector('#layoutStatus');
function updateLayoutStatus() {
  const { items, problems } = furnishing.layout;
  const errors = problems.filter((p) => p.severity === 'error');
  const units = items.filter((it) => !it.boxOnly && !it.decor && it.slot !== 'curtain').length;
  if (errors.length === 0) {
    statusEl.textContent = `✓ Tata letak OK: ${units} furnitur di dalam kamar, tidak ada yang bertabrakan.`;
    statusEl.className = 'status ok';
  } else {
    statusEl.textContent = `⚠ ${errors.map((p) => p.text).join(' ')}`;
    statusEl.className = 'status warn';
  }
}

// ---------- Kamera ----------
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 0.3;
controls.maxDistance = 25;

// Sudut kamera ala fotografi interior:
// - Luar: sudut 3/4 dengan lensa sempit (fov kecil) agar perspektif tidak melebar.
// - Dalam: setinggi mata (1,35 m) dari pojok pintu, kamera hampir datar agar garis tegak dinding tetap lurus.
// - Atas: dari tinggi dengan lensa sempit, mendekati denah.
const VIEWS = {
  luar: { position: [5.9, 4.7, 5.7], target: [-0.25, 0.85, -0.25], fov: 35 },
  dalam: { position: [1.82, 1.35, 1.38], target: [-0.9, 1.15, -0.95], fov: 68 },
  atas: { position: [0, 14, 0.01], target: [0, 0, 0], fov: 24 },
};

let flight = null;
function flyTo(name, instant = false) {
  const v = VIEWS[name];
  const to = { pos: new THREE.Vector3(...v.position), target: new THREE.Vector3(...v.target), fov: v.fov };
  if (instant) {
    camera.position.copy(to.pos);
    controls.target.copy(to.target);
    camera.fov = to.fov;
    camera.updateProjectionMatrix();
  } else {
    flight = { from: { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov }, to, t: 0 };
  }
  setActive('[data-view]', `[data-view="${name}"]`);
}

function updateFlight(dt) {
  if (!flight) return;
  flight.t = Math.min(1, flight.t + dt / 1.2);
  const t = flight.t;
  const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  camera.position.lerpVectors(flight.from.pos, flight.to.pos, k);
  controls.target.lerpVectors(flight.from.target, flight.to.target, k);
  camera.fov = flight.from.fov + (flight.to.fov - flight.from.fov) * k;
  camera.updateProjectionMatrix();
  if (t === 1) flight = null;
}
controls.addEventListener('start', () => (flight = null));

// ---------- Dinding transparan otomatis ----------
// Dinding yang berada di antara kamera dan kamar disembunyikan (seperti rumah boneka),
// tetapi tetap menghasilkan bayangan agar cahaya matahari tetap masuk lewat jendela saja.
const toCamera = new THREE.Vector3();
let cutawayEnabled = true;
function updateCutaway() {
  for (const wall of room.walls) {
    const outside = cutawayEnabled && toCamera.copy(camera.position).sub(wall.point).dot(wall.normal) > 0.05;
    wall.mesh.layers.set(outside ? HIDDEN_LAYER : 0);
    wall.extras.visible = !outside;
  }
}

// ---------- Kualitas gambar ----------
// Tinggi: anti-aliasing + ambient occlusion (bayangan halus di sudut, di bawah & di antara benda).
// Ringan: tanpa efek tambahan, untuk laptop dengan grafis lemah.
const composerTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, composerTarget);
composer.addPass(new RenderPass(scene, camera));
const aoPass = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
aoPass.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1.5, thickness: 1, scale: 1.1, samples: 16 });
aoPass.blendIntensity = 0.85;
composer.addPass(aoPass);
composer.addPass(new OutputPass());

let quality = 'high';
function setQuality(q) {
  quality = q;
  const ratio = q === 'high' ? Math.min(window.devicePixelRatio, 2) : 1;
  renderer.setPixelRatio(ratio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setPixelRatio(ratio);
  composer.setSize(window.innerWidth, window.innerHeight);
  setActive('[data-quality]', `[data-quality="${q}"]`);
}

// ---------- Panel kontrol ----------
function setActive(groupSelector, activeSelector) {
  document.querySelectorAll(groupSelector).forEach((el) => el.classList.remove('active'));
  document.querySelector(activeSelector)?.classList.add('active');
}

document.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => flyTo(btn.dataset.view)));

let currentMode = 'day';
function setMode(mode) {
  currentMode = mode;
  lighting.setMode(mode);
  setActive('[data-mode]', `[data-mode="${mode}"]`);
}
document.querySelectorAll('[data-mode]').forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
document.querySelectorAll('[data-quality]').forEach((btn) => btn.addEventListener('click', () => setQuality(btn.dataset.quality)));

const WALL_COLORS = {
  'Putih krem': '#efe6d6',
  Beige: '#e2d3bd',
  'Putih hangat': '#f5f2ec',
  Sage: '#c9cfbd',
  Greige: '#d6cfc4',
};
const swatches = document.querySelector('#wallSwatches');
const colorInput = document.querySelector('#wallColor');
function setWallColor(hex) {
  materials.wall.color.set(hex);
  colorInput.value = hex;
  swatches.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('active', s.dataset.color === hex));
}
for (const [name, hex] of Object.entries(WALL_COLORS)) {
  const s = document.createElement('button');
  s.className = 'swatch';
  s.title = name;
  s.dataset.color = hex;
  s.style.background = hex;
  s.addEventListener('click', () => setWallColor(hex));
  swatches.insertBefore(s, colorInput);
}
colorInput.addEventListener('input', () => setWallColor(colorInput.value));
setWallColor(WALL_COLORS['Putih krem']);

const floorSelect = document.querySelector('#floorTone');
for (const [key, tone] of Object.entries(FLOOR_TONES)) floorSelect.add(new Option(tone.name, key));
floorSelect.addEventListener('change', () => setFloorTone(materials, floorSelect.value));

// ---------- Ekspor ----------
function download(data, filename, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportModel(format) {
  cutawayEnabled = false; // tampilkan semua dinding agar ikut terekspor dengan material aslinya
  updateCutaway();
  try {
    if (format === 'glb') {
      const glb = await new GLTFExporter().parseAsync(model, { binary: true });
      download(glb, 'kamar-tidur.glb', 'model/gltf-binary');
    } else {
      const stl = new STLExporter().parse(model, { binary: true });
      download(stl, 'kamar-tidur.stl', 'model/stl');
    }
  } catch (err) {
    console.error(err);
    alert(`Ekspor ${format.toUpperCase()} gagal: ${err.message}`);
  } finally {
    cutawayEnabled = true;
  }
}
document.querySelector('#exportGlb').addEventListener('click', () => exportModel('glb'));
document.querySelector('#exportStl').addEventListener('click', () => exportModel('stl'));

// ---------- Katalog produk ----------
// Setiap kali furnitur berubah: lampu produk baru ikut mode siang/malam, status tata letak diperbarui.
furnishing.onChange(() => {
  lighting.setMode(currentMode);
  updateLayoutStatus();
});
createShopUI({
  furnishing,
  renderer,
  environment: scene.environment,
  onFocusSlot: () => {
    if (window.matchMedia('(max-width: 900px)').matches) document.body.classList.remove('shop-open');
  },
});

// ---------- Seret & letakkan furnitur ----------
const selInfo = document.querySelector('#selInfo');
const arrangeMsg = document.querySelector('#arrangeMsg');
const rotateBtn = document.querySelector('#rotateSel');
const deselectBtn = document.querySelector('#deselect');
const SEL_HINT = selInfo.innerHTML;
function arrangeMessage(text, kind = '') {
  arrangeMsg.textContent = text;
  arrangeMsg.className = `status ${kind}`;
}
const arranger = createArranger({
  canvas,
  camera,
  controls,
  scene,
  furnishing,
  ui: {
    message: arrangeMessage,
    onSelect(item) {
      rotateBtn.disabled = !item || Boolean(item.wall);
      deselectBtn.disabled = !item;
      if (!item) {
        selInfo.innerHTML = SEL_HINT;
        return;
      }
      const c = item.box.getCenter(new THREE.Vector3());
      const size = item.box.getSize(new THREE.Vector3());
      const deg = ((Math.round((item.rotY * 180) / Math.PI) % 360) + 360) % 360;
      selInfo.innerHTML = `Dipilih: <strong>${item.label}</strong>${item.product ? `<br><small>${item.product.store} ${item.product.name}</small>` : ''}
        <br><small>Posisi tengah x ${c.x.toFixed(2)} m, z ${c.z.toFixed(2)} m · tampak atas ${Math.round(size.x * 100)} × ${Math.round(size.z * 100)} cm${item.wall ? ` · tinggi dari lantai ${Math.round(item.position[1] * 100)} cm` : ` · rotasi ${deg}°`}</small>`;
    },
  },
});
rotateBtn.addEventListener('click', () => arranger.rotate());
deselectBtn.addEventListener('click', () => arranger.deselect());
document.querySelector('#saveLayout').addEventListener('click', () => {
  const res = furnishing.saveLayout();
  arrangeMessage(res.ok ? `Tata letak disimpan di browser ini (${new Date(res.savedAt).toLocaleString('id-ID')}).` : 'Gagal menyimpan: penyimpanan browser tidak tersedia.', res.ok ? 'ok' : 'warn');
});
document.querySelector('#loadLayout').addEventListener('click', () => {
  const res = furnishing.loadLayout();
  if (!res.ok) arrangeMessage(res.reason, 'warn');
  else if (res.problems.length) arrangeMessage(`Tata letak dimuat, tetapi ada masalah: ${res.problems.map((p) => p.text).join(' ')}`, 'warn');
  else arrangeMessage(`Tata letak tersimpan (${new Date(res.savedAt).toLocaleString('id-ID')}) dimuat.`, 'ok');
});
document.querySelector('#resetPositions').addEventListener('click', () => {
  furnishing.resetPositions();
  arrangeMessage('Semua furnitur kembali ke posisi awal.', 'ok');
});

// ---------- Mulai ----------
// Tampilan awal bisa diatur lewat alamat, misalnya: ?view=dalam&mode=night&quality=low
// Pilihan furnitur disimpan di bagian "#..." alamat, sehingga tautan bisa dibagikan.
const params = new URLSearchParams(window.location.search);
furnishing.loadSelection(DEFAULT_SELECTION);
flyTo(VIEWS[params.get('view')] ? params.get('view') : 'luar', true);
setMode(params.get('mode') === 'night' ? 'night' : 'day');
setQuality(params.get('quality') === 'low' ? 'low' : 'high');

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  updateFlight(clock.getDelta());
  controls.update();
  if (camera.position.y < 0.15) camera.position.y = 0.15; // kamera tidak menembus tanah
  updateCutaway();
  if (quality === 'high') composer.render();
  else renderer.render(scene, camera);
});
