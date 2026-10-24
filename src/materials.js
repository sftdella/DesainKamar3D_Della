import * as THREE from 'three';
import { random } from './helpers.js';

// Semua tekstur digambar dengan kode (canvas), jadi tidak perlu file gambar tambahan.
// Setiap tekstur warna juga dibuatkan "normal map" agar permukaannya punya relief
// (celah papan, serat kayu, tenunan kain) yang bereaksi terhadap arah cahaya.

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const rgb = (c, k = 1, a = 1) => `rgba(${clamp(c[0] * k)},${clamp(c[1] * k)},${clamp(c[2] * k)},${a})`;

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

// tileSize = ukuran satu ulangan tekstur dalam meter.
function toTexture(canvas, tileSize = 1, isColor = true) {
  const texture = new THREE.CanvasTexture(canvas);
  if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / tileSize, 1 / tileSize);
  texture.anisotropy = 8;
  return texture;
}

// Normal map dari kecerahan gambar: bagian gelap dianggap lebih rendah (celah, serat).
function normalFromCanvas(src, strength) {
  const w = src.width;
  const h = src.height;
  const data = src.getContext('2d').getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11) / 255;
  const out = makeCanvas(w, h);
  const g = out.getContext('2d');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = lum[y * w + ((x - 1 + w) % w)];
      const r = lum[y * w + ((x + 1) % w)];
      const u = lum[((y - 1 + h) % h) * w + x];
      const d = lum[((y + 1) % h) * w + x];
      const nx = (l - r) * strength;
      const ny = (d - u) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return out;
}

// Pasangan tekstur warna + normal map dengan ukuran ulangan yang sama.
function makeMaps(canvas, tileSize, strength) {
  return { map: toTexture(canvas, tileSize), normalMap: toTexture(normalFromCanvas(canvas, strength), tileSize, false) };
}

// Garis serat kayu bergelombang.
function drawGrain(g, x, y, w, h, color, rand, count, period) {
  for (let i = 0; i < count; i++) {
    const yy = y + rand() * h;
    const k = 0.62 + rand() * 0.25;
    const amp = 1 + rand() * 4;
    const freq = (Math.PI * 2 * (1 + Math.floor(rand() * 3))) / period;
    const phase = rand() * Math.PI * 2;
    g.strokeStyle = rgb(color, k, 0.1 + rand() * 0.25);
    g.lineWidth = 0.6 + rand() * 1.8;
    g.beginPath();
    for (let xx = x; xx <= x + w + 8; xx += 8) {
      const yv = yy + Math.sin(xx * freq + phase) * amp;
      if (xx === x) g.moveTo(xx, yv);
      else g.lineTo(xx, yv);
    }
    g.stroke();
  }
}

// Mata kayu (knot) kecil dengan lingkaran tahun.
function drawKnot(g, x, y, color, rand) {
  const rx = 6 + rand() * 10;
  for (let r = 4; r > 0; r--) {
    g.strokeStyle = rgb(color, 0.55, 0.25);
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(x, y, rx * r * 0.6, rx * r * 0.22, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = rgb(color, 0.45, 0.7);
  g.beginPath();
  g.ellipse(x, y, rx * 0.5, rx * 0.2, 0, 0, Math.PI * 2);
  g.fill();
}

export const FLOOR_TONES = {
  oak: { name: 'Oak terang', color: [206, 168, 124] },
  jati: { name: 'Jati', color: [168, 114, 68] },
  walnut: { name: 'Walnut gelap', color: [118, 82, 56] },
  ash: { name: 'Ash keabuan', color: [176, 166, 152] },
};

// Lantai papan kayu: tekstur 2,4 x 2,4 m, papan lebar 20 cm dan panjang 1,1–1,8 m.
// Tiap papan punya warna, rona, dan arah gradasi sendiri; beberapa papan punya mata kayu.
function makeFloorCanvas(tone) {
  const S = 2048;
  const canvas = makeCanvas(S, S);
  const g = canvas.getContext('2d');
  const rand = random(7);
  const rows = 12;
  const rowH = S / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    let x = rand() * S;
    const end = x + S;
    while (x < end) {
      const len = Math.min(S * (0.45 + rand() * 0.3), end - x);
      const k = 0.9 + rand() * 0.18;
      const hue = (rand() - 0.5) * 0.07;
      const c = [tone.color[0] * k * (1 + hue), tone.color[1] * k, tone.color[2] * k * (1 - hue)];
      const knot = rand() < 0.25 ? rand() : -1;
      const seed = Math.floor(rand() * 1e9);
      for (const offset of [0, -S]) {
        const px = (x % S) + offset;
        g.save();
        g.beginPath();
        g.rect(px, y, len, rowH);
        g.clip();
        g.fillStyle = rgb(c);
        g.fillRect(px, y, len, rowH);
        const grad = g.createLinearGradient(px, 0, px + len, 0);
        grad.addColorStop(0, rgb(c, 0.92, 0.5));
        grad.addColorStop(0.5, rgb(c, 1.06, 0));
        grad.addColorStop(1, rgb(c, 0.94, 0.5));
        g.fillStyle = grad;
        g.fillRect(px, y, len, rowH);
        drawGrain(g, px, y, len, rowH, c, random(seed), 34, S);
        if (knot >= 0) drawKnot(g, px + len * (0.2 + knot * 0.6), y + rowH * (0.3 + knot * 0.4), c, random(seed + 1));
        // tepi papan sedikit dibevel: garis gelap + garis terang
        g.fillStyle = 'rgba(35,22,12,0.75)';
        g.fillRect(px, y, 3, rowH);
        g.fillStyle = 'rgba(255,240,220,0.18)';
        g.fillRect(px + 3, y, 2, rowH);
        g.restore();
      }
      x += len;
    }
    g.fillStyle = 'rgba(35,22,12,0.75)';
    g.fillRect(0, y, S, 3);
    g.fillStyle = 'rgba(255,240,220,0.18)';
    g.fillRect(0, y + 3, S, 2);
  }
  return canvas;
}

// Kayu untuk furnitur: serat memanjang dengan pola "katedral" halus.
function makeWoodCanvas(color, seed) {
  const S = 1024;
  const canvas = makeCanvas(S, S);
  const g = canvas.getContext('2d');
  const rand = random(seed);
  g.fillStyle = rgb(color);
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = rgb(color, 0.85 + rand() * 0.3, 0.22);
    g.fillRect(0, rand() * S, S, 20 + rand() * 90);
  }
  drawGrain(g, 0, 0, S, S, color, rand, 260, S);
  for (let i = 0; i < 3; i++) {
    const cy = rand() * S;
    g.strokeStyle = rgb(color, 0.7, 0.18);
    g.lineWidth = 2;
    for (let k = 1; k < 6; k++) {
      g.beginPath();
      g.ellipse(S / 2, cy, S * 0.12 * k, 10 * k, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  return canvas;
}

// Tenunan kain: benang horizontal & vertikal dengan sedikit ketidakrataan.
function makeFabricCanvas(seed, coarse = 1) {
  const S = 512;
  const canvas = makeCanvas(S, S);
  const g = canvas.getContext('2d');
  const rand = random(seed);
  g.fillStyle = '#e6e6e6';
  g.fillRect(0, 0, S, S);
  const step = 2 * coarse;
  for (let i = 0; i < S; i += step) {
    g.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.35})`;
    g.fillRect(0, i, S, coarse);
    g.fillStyle = `rgba(0,0,0,${0.04 + rand() * 0.08})`;
    g.fillRect(i, 0, coarse, S);
  }
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${rand() * 0.25})` : `rgba(0,0,0,${rand() * 0.07})`;
    g.fillRect(rand() * S, rand() * S, 1 + rand() * 3, 1);
  }
  return canvas;
}

// Cat dinding: permukaan halus dengan butiran sangat kecil seperti hasil roller
// (tanpa bercak, tidak mengilap seperti plastik).
function makePaintCanvas() {
  const S = 512;
  const canvas = makeCanvas(S, S);
  const g = canvas.getContext('2d');
  const rand = random(11);
  g.fillStyle = '#fbfbfb';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 60000; i++) {
    g.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.035)';
    g.fillRect(rand() * S, rand() * S, 1, 1);
  }
  return canvas;
}

// Karpet: serat pendek ke berbagai arah + motif.
// pattern: 'border' (bingkai + motif wajik), 'plain' (polos), 'stripe' (garis), 'diamond' (wajik penuh).
function makeRugCanvas({ base = '#dccfbb', accent = '#a8957a', pattern = 'border', seed = 5 } = {}) {
  const S = 1024;
  const canvas = makeCanvas(S, S);
  const g = canvas.getContext('2d');
  const rand = random(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  g.strokeStyle = accent;
  if (pattern === 'border') {
    g.lineWidth = 34;
    g.strokeRect(40, 40, S - 80, S - 80);
    g.lineWidth = 4;
    g.strokeRect(100, 100, S - 200, S - 200);
  }
  if (pattern === 'border' || pattern === 'diamond') {
    const inset = pattern === 'border' ? 110 : 0;
    g.globalAlpha = pattern === 'border' ? 0.35 : 0.6;
    g.lineWidth = 4;
    for (let i = -S; i < S * 2; i += 90) {
      g.beginPath();
      g.moveTo(i, inset);
      g.lineTo(i + (S - 2 * inset), S - inset);
      g.moveTo(i + (S - 2 * inset), inset);
      g.lineTo(i, S - inset);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  if (pattern === 'stripe') {
    g.fillStyle = accent;
    for (let x = 60; x < S; x += 140) g.fillRect(x, 0, 30, S);
  }
  // serat wol
  for (let i = 0; i < 60000; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const a = rand() * Math.PI * 2;
    const l = 2 + rand() * 4;
    g.strokeStyle = rand() > 0.5 ? `rgba(255,255,255,${0.1 + rand() * 0.15})` : `rgba(70,50,30,${0.05 + rand() * 0.1})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return canvas;
}

// Lukisan abstrak bernuansa hangat, dengan tekstur kanvas.
function makeArtCanvas() {
  const canvas = makeCanvas(900, 600);
  const g = canvas.getContext('2d');
  const rand = random(9);
  g.fillStyle = '#efe7da';
  g.fillRect(0, 0, 900, 600);
  g.fillStyle = '#d9c3a0';
  g.fillRect(520, 0, 380, 600);
  g.fillStyle = '#c4825f';
  g.beginPath();
  g.arc(330, 360, 170, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#9fa98f';
  g.beginPath();
  g.arc(640, 600, 190, Math.PI, 0);
  g.fill();
  g.strokeStyle = '#3b3029';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(470, 230, 120, Math.PI * 0.9, Math.PI * 1.9);
  g.stroke();
  for (let i = 0; i < 20000; i++) {
    g.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
    g.fillRect(rand() * 900, rand() * 600, 2, 1);
  }
  return canvas;
}

const std = (params) => new THREE.MeshStandardMaterial(params);
const phys = (params) => new THREE.MeshPhysicalMaterial(params);
const scale = (v) => new THREE.Vector2(v, v);

// Kain: "sheen" memberi kilau lembut di tepi seperti serat kain sungguhan.
function fabric(color, maps, extra = {}) {
  return phys({
    color,
    map: maps.map,
    normalMap: maps.normalMap,
    normalScale: scale(0.5),
    roughness: 0.92,
    sheen: 1,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.4).multiplyScalar(0.45),
    ...extra,
  });
}

// Salinan tekstur dengan ukuran ulangan berbeda (gambarnya tetap dipakai bersama).
function retile(maps, tileSize) {
  const copy = (t) => {
    const c = t.clone();
    c.repeat.set(1 / tileSize, 1 / tileSize);
    return c;
  };
  return { map: copy(maps.map), normalMap: copy(maps.normalMap) };
}

export function createMaterials() {
  const floor = makeMaps(makeFloorCanvas(FLOOR_TONES.oak), 2.4, 6);
  const oak = makeMaps(makeWoodCanvas([186, 142, 98], 21), 1, 3);
  const walnut = makeMaps(makeWoodCanvas([104, 70, 45], 33), 1, 3);
  const weave = makeMaps(makeFabricCanvas(3), 0.2, 2);
  const linen = makeMaps(makeFabricCanvas(4, 2), 0.35, 3);
  const paint = makeMaps(makePaintCanvas(), 0.5, 1.5);

  const m = {
    // Lantai berpernis: lapisan clearcoat tipis memberi pantulan lembut dari jendela
    floor: phys({
      map: floor.map,
      normalMap: floor.normalMap,
      normalScale: scale(0.6),
      roughness: 0.55,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
    }),
    // Cat dinding matte: kasar (roughness tinggi) dan pantulan lingkungan dikurangi
    wall: std({
      color: '#efe6d6',
      map: paint.map,
      normalMap: paint.normalMap,
      normalScale: scale(0.15),
      roughness: 0.93,
      envMapIntensity: 0.5,
    }),
    ceiling: std({ color: '#f7f3ec', roughness: 0.95, envMapIntensity: 0.5 }),
    trim: std({ color: '#f4efe6', roughness: 0.4 }),
    oak: phys({ map: oak.map, normalMap: oak.normalMap, normalScale: scale(0.4), roughness: 0.5, clearcoat: 0.15, clearcoatRoughness: 0.4 }),
    walnut: phys({ map: walnut.map, normalMap: walnut.normalMap, normalScale: scale(0.4), roughness: 0.45, clearcoat: 0.2, clearcoatRoughness: 0.35 }),
    cream: phys({ color: '#ebe2d1', roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
    groove: std({ color: '#3a2a1e', roughness: 0.8 }),
    metalBlack: std({ color: '#2a2a2a', roughness: 0.38, metalness: 0.75, side: THREE.DoubleSide }),
    brass: std({ color: '#c9a46a', roughness: 0.28, metalness: 1 }),
    aluminium: std({ color: '#a7abb0', roughness: 0.32, metalness: 0.9 }),
    frame: std({ color: '#2e2e2e', roughness: 0.45, metalness: 0.4 }),
    // Kaca sungguhan: meneruskan cahaya (transmission) dan memantulkan langit
    glass: phys({
      color: '#ffffff',
      metalness: 0,
      roughness: 0.02,
      transmission: 1,
      thickness: 0.006,
      ior: 1.5,
      attenuationColor: new THREE.Color('#dcefe8'),
      attenuationDistance: 0.3,
    }),
    sheet: fabric('#f7f4ef', weave),
    duvet: fabric('#e8dcc8', weave, { side: THREE.DoubleSide }),
    pillow: fabric('#f3eee6', weave),
    accent: fabric('#a9825d', retile(linen, 0.25), { side: THREE.DoubleSide }),
    upholstery: fabric('#cbbda8', retile(linen, 0.2)),
    art: std({ map: toTexture(makeArtCanvas(), 1), roughness: 0.9 }),
    ceramic: phys({ color: '#ece6dc', roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    terracotta: std({ color: '#b6764f', roughness: 0.85 }),
    soil: std({ color: '#3b2e24', roughness: 1 }),
    leaf: std({ color: '#5a7744', roughness: 0.55, side: THREE.DoubleSide }),
    leafDark: std({ color: '#3f5a33', roughness: 0.55, side: THREE.DoubleSide }),
    screen: std({ color: '#0b0d12', emissive: '#2a3b52', roughness: 0.15 }),
    // Material yang menyala (kap lampu, bohlam, lampu plafon)
    shade: std({ color: '#f4ead8', emissive: '#ffcf8a', roughness: 1, side: THREE.DoubleSide }),
    bulb: std({ color: '#fff4e0', emissive: '#ffe2b0' }),
    glow: std({ color: '#fbf7f0', emissive: '#fff0d8', roughness: 0.6 }),
    books: ['#8a6f5a', '#c9b79c', '#5f6b5a', '#a85f45', '#e8e0d2', '#3e4a57'].map((c) =>
      std({ color: c, roughness: 0.75 }),
    ),
  };

  // Seberapa terang material menyala pada siang & malam.
  m.shade.userData = { day: 0.25, night: 1.1 };
  m.bulb.userData = { day: 0.8, night: 3 };
  m.glow.userData = { day: 0.03, night: 1.8 };
  m.screen.userData = { day: 0.4, night: 0.9 };
  m.glowMaterials = [m.shade, m.bulb, m.glow, m.screen];
  m.maps = { weave, linen };

  return m;
}

// ---------------------------------------------------------------------
// Pustaka "finishing" untuk model produk: warna/material sesuai nama warna produk.
// Material dibuat saat pertama kali diminta lalu disimpan (cache).
// ---------------------------------------------------------------------
const WOOD_FINISHES = {
  oak: [196, 156, 110],
  'oak-white': [226, 214, 196],
  'oak-dark': [92, 70, 52],
  walnut: [104, 70, 45],
  'black-brown': [58, 45, 38],
  pine: [214, 176, 124],
  maple: [196, 140, 92],
  beech: [208, 164, 116],
  bamboo: [206, 172, 120],
  teak: [150, 100, 60],
};
const PAINT_FINISHES = {
  white: ['#f1efe9', 0.45],
  cream: ['#e9dfcd', 0.5],
  beige: ['#d9c9ae', 0.55],
  grey: ['#9a9b9b', 0.5],
  'light-grey': ['#c9c9c6', 0.5],
  anthracite: ['#3d3e40', 0.5],
  black: ['#252525', 0.45],
  terracotta: ['#b8694a', 0.6],
  sage: ['#a7b29a', 0.6],
  blue: ['#8fa9c4', 0.5],
};
const FABRIC_FINISHES = {
  'fabric-grey': '#9a9896',
  'fabric-dark-grey': '#5d5d5f',
  'fabric-cream': '#e6dccb',
  'fabric-beige': '#cbb79a',
  'fabric-brown': '#7a5a43',
  'fabric-white': '#f3f1ec',
  'fabric-blue': '#6f86a0',
  'velvet-grey': '#8a8a8c',
  'velvet-cream': '#e2d6c2',
  'velvet-brown': '#6e4f3c',
};
const METAL_FINISHES = {
  'metal-black': ['#262626', 0.4, 0.7],
  'metal-white': ['#ecebe8', 0.35, 0.3],
  'metal-grey': ['#8c8f93', 0.35, 0.8],
  chrome: ['#d9dcdf', 0.12, 1],
  brass: ['#c9a46a', 0.28, 1],
};

export function createFinishLibrary(m) {
  const cache = new Map();
  function get(key) {
    if (cache.has(key)) return cache.get(key);
    let mat;
    if (WOOD_FINISHES[key]) {
      const maps = makeMaps(makeWoodCanvas(WOOD_FINISHES[key], key.length * 17 + 3), 1, 3);
      mat = phys({ map: maps.map, normalMap: maps.normalMap, normalScale: scale(0.4), roughness: 0.5, clearcoat: 0.15, clearcoatRoughness: 0.4 });
    } else if (PAINT_FINISHES[key]) {
      const [color, roughness] = PAINT_FINISHES[key];
      mat = phys({ color, roughness, clearcoat: 0.15, clearcoatRoughness: 0.5 });
    } else if (FABRIC_FINISHES[key]) {
      const velvet = key.startsWith('velvet');
      mat = fabric(FABRIC_FINISHES[key], velvet ? m.maps.weave : retile(m.maps.linen, 0.2), velvet ? { sheen: 1, sheenRoughness: 0.35 } : {});
    } else if (METAL_FINISHES[key]) {
      const [color, roughness, metalness] = METAL_FINISHES[key];
      mat = std({ color, roughness, metalness });
    } else if (key === 'mirror') {
      mat = std({ color: '#dfe5e8', roughness: 0.04, metalness: 1 });
    } else if (key === 'plastic-white') {
      mat = phys({ color: '#f2f1ee', roughness: 0.35, clearcoat: 0.3 });
    } else if (key === 'plastic-black') {
      mat = phys({ color: '#2a2a2a', roughness: 0.4, clearcoat: 0.2 });
    } else if (key.startsWith('#')) {
      mat = phys({ color: key, roughness: 0.5 });
    } else {
      console.warn(`Finishing "${key}" tidak dikenal, memakai putih.`);
      return get('white');
    }
    cache.set(key, mat);
    return mat;
  }
  // Kain dengan warna bebas (tirai, kap lampu)
  function fabricColor(color, extra = {}) {
    const key = `fabric:${color}:${JSON.stringify(extra)}`;
    if (!cache.has(key)) cache.set(key, fabric(color, m.maps.linen, extra));
    return cache.get(key);
  }
  // Kap lampu yang menyala; tiap warna punya material sendiri tetapi ikut pengaturan siang/malam
  function shade(color) {
    const key = `shade:${color}`;
    if (!cache.has(key)) {
      const mat = std({ color, emissive: '#ffcf8a', roughness: 1, side: THREE.DoubleSide });
      mat.userData = { day: 0.25, night: 1.1 };
      m.glowMaterials.push(mat);
      cache.set(key, mat);
    }
    return cache.get(key);
  }
  // Karpet: tekstur digambar sekali per produk, dipetakan tepat satu kali ke ukuran karpet
  function rug(id, { w, d, base, accent, pattern }) {
    const key = `rug:${id}`;
    if (!cache.has(key)) {
      const maps = makeMaps(makeRugCanvas({ base, accent, pattern, seed: id.length }), 1, 4);
      for (const t of [maps.map, maps.normalMap]) {
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.repeat.set(1 / w, 1 / d);
        t.offset.set(0.5, 0.5);
      }
      cache.set(key, fabric('#ffffff', maps, { roughness: 1, normalScale: scale(0.8), sheenRoughness: 0.9 }));
    }
    return cache.get(key);
  }
  return { get, fabricColor, shade, rug };
}

// Mengganti warna/jenis kayu lantai.
export function setFloorTone(m, key) {
  const old = [m.floor.map, m.floor.normalMap];
  const maps = makeMaps(makeFloorCanvas(FLOOR_TONES[key]), 2.4, 6);
  m.floor.map = maps.map;
  m.floor.normalMap = maps.normalMap;
  m.floor.needsUpdate = true;
  old.forEach((t) => t.dispose());
}
