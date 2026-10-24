import * as THREE from 'three';
import { ROOM, HALF_L, HALF_W, DOOR, WINDOW } from '../layout.js';
import { bedFrameInfo, deskTopHeight, curtainLayout } from './builders.js';

// =====================================================================
// PENEMPATAN FURNITUR
// 1. Setiap slot punya aturan posisi bawaan di kamar 4 x 3 m.
// 2. Pengguna bisa memindahkan/memutar furnitur ("override" posisi), lewat seret di 3D.
// 3. Semua posisi diperiksa: harus di dalam kamar, tidak bertabrakan, tidak menghalangi pintu/jendela.
// Ukuran produk TIDAK pernah diubah agar muat.
// =====================================================================

export const SLOTS = [
  { id: 'bed', label: 'Rangka tempat tidur', category: 'bed', qty: 1 },
  { id: 'mattress', label: 'Kasur', category: 'mattress', qty: 1 },
  { id: 'nightstands', label: 'Meja samping (sepasang)', category: 'nightstand', qty: 2 },
  { id: 'bedsideLamps', label: 'Lampu tidur (sepasang)', category: 'lamp', qty: 2 },
  { id: 'wardrobe', label: 'Lemari pakaian', category: 'wardrobe', qty: 1 },
  { id: 'desk', label: 'Meja belajar', category: 'desk', qty: 1 },
  { id: 'chair', label: 'Kursi', category: 'chair', qty: 1 },
  { id: 'deskLamp', label: 'Lampu meja belajar', category: 'lamp', qty: 1 },
  { id: 'shelf', label: 'Rak dinding', category: 'shelf', qty: 1 },
  { id: 'rug', label: 'Karpet', category: 'rug', qty: 1 },
  { id: 'curtain', label: 'Tirai jendela', category: 'curtain', qty: 1 },
];
export const slotById = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

// Susunan awal kamar (id produk dari src/data/products.json). Ubah di sini untuk desain bawaan lain.
export const DEFAULT_SELECTION = {
  bed: 'ikea-malm-160-oak-white',
  mattress: 'ikea-valevag-160',
  nightstands: 'ikea-grafjallet-nightstand-white',
  bedsideLamps: 'ikea-arstid-nickel-white',
  wardrobe: 'ikea-kleppstad-sliding-white',
  desk: 'ikea-micke-105-white',
  chair: 'ikea-kullaberg-black',
  deskLamp: 'ikea-skurup-black',
  shelf: 'ikea-bergshult-tomthult-80-white',
  rug: 'ikea-hybridspirea-170x230-beige',
  curtain: 'ikea-ginstmott-white',
};

const BED_X = -0.5; // titik tengah tempat tidur di dinding belakang
const GAP = 0.03; // jarak antara tempat tidur dan meja samping
const CHAIR_TUCK = 0.12; // kursi sedikit masuk ke bawah meja
const WIN = {
  z0: WINDOW.centerZ - WINDOW.width / 2,
  z1: WINDOW.centerZ + WINDOW.width / 2,
  sill: WINDOW.sill,
  top: WINDOW.sill + WINDOW.height,
  width: WINDOW.width,
};
export const WINDOW_INFO = WIN;

// Dekorasi umum (bukan produk) yang juga bisa dipindahkan
export const DECOR = {
  plant: { label: 'Tanaman (dekorasi)', extent: { w: 0.4, d: 0.4, h: 1.2 } },
  art: { label: 'Lukisan (dekorasi)', extent: { w: 0.94, d: 0.03, h: 0.64 } },
};

const cm = (v) => v / 100;
const fmtCm = (v) => `${Math.round(v * 100)} cm`;
export const QUARTER = Math.PI / 2;
export const quarterOf = (rotY) => ((Math.round(rotY / QUARTER) % 4) + 4) % 4;

// ---------------------------------------------------------------------
// Geometri posisi. Model setiap produk: x = lebar (tengah di 0), z = 0 di belakang s/d d di depan.
// rotY selalu kelipatan 90°, sehingga kotak pembatas tetap persis sama dengan bentuk tampak atas.
// ---------------------------------------------------------------------
export function rotateXZ(x, z, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c + z * s, -x * s + z * c];
}

// Titik tengah tampak atas dari posisi asal model
export function centerOf(position, rotY, d) {
  const [ox, oz] = rotateXZ(0, d / 2, rotY);
  return [position[0] + ox, position[2] + oz];
}

function originFromCenter(cx, cz, rotY, d) {
  const [ox, oz] = rotateXZ(0, d / 2, rotY);
  return [cx - ox, cz - oz];
}

// Setengah ukuran tampak atas searah sumbu x dan z (setelah diputar)
export function halfExtents(extent, rotY) {
  const odd = quarterOf(rotY) % 2 === 1;
  return odd ? [extent.d / 2, extent.w / 2] : [extent.w / 2, extent.d / 2];
}

function poseBox(position, rotY, extent) {
  const [cx, cz] = centerOf(position, rotY, extent.d);
  const [hx, hz] = halfExtents(extent, rotY);
  return new THREE.Box3(new THREE.Vector3(cx - hx, position[1], cz - hz), new THREE.Vector3(cx + hx, position[1] + extent.h, cz + hz));
}

// Posisi bawaan benda yang menempel dinding. along = titik tengah sepanjang dinding.
function onWall(wall, along, d, y0) {
  if (wall === 'back') return { position: [along, y0, -HALF_W], rotY: 0 };
  if (wall === 'left') return { position: [-HALF_L, y0, along], rotY: QUARTER };
  return { position: [HALF_L, y0, along], rotY: -QUARTER };
}

const dims = (p) => ({ w: cm(p.size.w), d: cm(p.size.d), h: cm(p.size.h ?? 1) });

// Slot yang bisa dipindahkan langsung. Kasur ikut rangka, lampu ikut mejanya, tirai tetap di jendela.
const MOVABLE_SLOTS = new Set(['bed', 'nightstands', 'wardrobe', 'desk', 'chair', 'shelf', 'rug', 'plant', 'art']);
// Benda dinding: hanya bergeser sepanjang dindingnya (dan naik-turun), tidak diputar
export const WALL_ITEMS = { shelf: 'right', art: 'back' };

// Menghitung posisi semua produk terpilih + daftar masalah (tabrakan, tidak muat, dsb.)
// selection = { slotId: productId }, overrides = { kunciItem: { cx, cz, q, y? } } (posisi buatan pengguna)
export function computeLayout(selection, getProduct, overrides = {}) {
  const items = [];
  const problems = [];
  const P = (slot) => (selection[slot] ? getProduct(selection[slot]) : null);
  const add = (key, slot, product, pose, extent, extra = {}) => {
    const item = { key, slot, product, ...pose, extent, movable: MOVABLE_SLOTS.has(slot), ...extra };
    items.push(item);
    return item;
  };
  const problem = (slots, text, severity = 'error') => problems.push({ slots, text, severity, key: `${slots.join('+')}:${text}` });

  // --- Tempat tidur
  const bedP = P('bed');
  let bed = null;
  if (bedP) {
    const e = dims(bedP);
    bed = add('bed', 'bed', bedP, onWall('back', BED_X, e.d, 0), e, { label: 'Tempat tidur' });
  }
  const bedW = bed ? bed.extent.w : 1.6;

  // --- Kasur (ikut rangka)
  const matP = P('mattress');
  if (matP) {
    const e = dims(matP);
    if (bedP) {
      const need = bedP.model.mattress;
      if (need && (need[0] !== matP.size.w || need[1] !== matP.size.d)) {
        problem(['mattress', 'bed'], `Ukuran kasur ${matP.size.w}×${matP.size.d} cm tidak sesuai rangka (butuh kasur ${need[0]}×${need[1]} cm).`);
      }
      const info = bedFrameInfo(bedP);
      const z = -HALF_W + info.z0 + Math.max(0, (info.z1 - info.z0 - e.d) / 2);
      add('mattress', 'mattress', matP, { position: [BED_X, info.deck, z], rotY: 0 }, e, { label: 'Kasur', parent: bed });
    } else {
      add('mattress', 'mattress', matP, onWall('back', BED_X, e.d, 0), e, { label: 'Kasur' });
    }
  }

  // --- Meja samping (kiri & kanan tempat tidur)
  const nsP = P('nightstands');
  const nightstands = [];
  if (nsP) {
    const e = dims(nsP);
    for (const [i, side, label] of [
      [0, -1, 'Meja samping kiri'],
      [1, 1, 'Meja samping kanan'],
    ]) {
      const along = BED_X + side * (bedW / 2 + GAP + e.w / 2);
      nightstands.push(add(`nightstands:${i}`, 'nightstands', nsP, onWall('back', along, e.d, 0), e, { label, side }));
    }
  }

  // --- Lampu tidur di atas meja samping (ikut mejanya)
  const blP = P('bedsideLamps');
  if (blP) {
    const e = dims(blP);
    if (!nightstands.length) {
      problem(['bedsideLamps'], 'Lampu tidur membutuhkan meja samping. Tambahkan meja samping terlebih dahulu.');
    } else {
      const ns = dims(nsP);
      if (e.w > ns.w + 0.02 || e.d > ns.d + 0.02) {
        problem(['bedsideLamps', 'nightstands'], `Alas lampu (${blP.size.w}×${blP.size.d} cm) lebih besar dari permukaan meja samping (${nsP.size.w}×${nsP.size.d} cm).`);
      }
      nightstands.forEach((ns2, i) => {
        const z = -HALF_W + Math.max(0, (ns.d - e.d) / 2);
        add(`bedsideLamps:${i}`, 'bedsideLamps', blP, { position: [ns2.position[0], ns.h, z], rotY: 0 }, e, {
          label: `Lampu tidur ${ns2.side < 0 ? 'kiri' : 'kanan'}`,
          parent: ns2,
          supportedBy: ns2,
        });
      });
    }
  }

  // --- Lemari pakaian: dinding kiri, di pojok dekat dinding depan
  const wrP = P('wardrobe');
  let wardrobe = null;
  if (wrP) {
    const e = dims(wrP);
    wardrobe = add('wardrobe', 'wardrobe', wrP, onWall('left', HALF_W - 0.02 - e.w / 2, e.d, 0), e, { label: 'Lemari pakaian' });
  }

  // --- Meja belajar: dinding kanan, di pojok belakang
  const dkP = P('desk');
  let desk = null;
  if (dkP) {
    const e = dims(dkP);
    desk = add('desk', 'desk', dkP, onWall('right', -HALF_W + e.w / 2, e.d, 0), e, { label: 'Meja belajar' });
  }

  // --- Kursi menghadap meja (ikut meja selama tidak dipindahkan sendiri)
  const chP = P('chair');
  if (chP) {
    const e = dims(chP);
    const along = desk ? desk.position[2] : -0.85;
    const front = desk ? HALF_L - desk.extent.d + CHAIR_TUCK : HALF_L - 0.6;
    add('chair', 'chair', chP, { position: [front - e.d, 0, along], rotY: QUARTER }, e, { label: 'Kursi', parent: desk });
  }

  // --- Lampu meja belajar (ikut meja)
  const dlP = P('deskLamp');
  let deskLamp = null;
  if (dlP) {
    const e = dims(dlP);
    if (!desk) {
      problem(['deskLamp'], 'Lampu meja belajar membutuhkan meja belajar. Tambahkan meja terlebih dahulu.');
    } else {
      const top = deskTopHeight(dkP);
      const hutch = desk.extent.h > top + 0.1 ? Math.min(cm(dkP.model.hutchD ?? 25), desk.extent.d * 0.5) + 0.02 : 0.03;
      if (e.w > desk.extent.w - 0.1 || hutch + e.d > desk.extent.d + 0.01) {
        problem(['deskLamp', 'desk'], `Lampu meja (${dlP.size.w}×${dlP.size.d} cm) tidak muat di permukaan meja belajar.`);
      }
      deskLamp = add('deskLamp', 'deskLamp', dlP, { position: [HALF_L - hutch, top, -HALF_W + 0.05 + e.w / 2], rotY: -QUARTER }, e, {
        label: 'Lampu meja belajar',
        parent: desk,
        supportedBy: desk,
      });
    }
  }

  // --- Rak dinding di atas meja belajar (dinding kanan, di samping jendela)
  const shP = P('shelf');
  if (shP) {
    const e = dims(shP);
    const maxZ = WIN.z0 - 0.3; // sisakan ruang untuk tirai
    if (e.w > maxZ + HALF_W && !overrides.shelf) {
      problem(['shelf'], `Rak sepanjang ${shP.size.w} cm terlalu panjang untuk dinding di samping jendela (maksimal ${Math.round((maxZ + HALF_W) * 100)} cm).`);
    }
    let y0 = 1.4;
    if (desk) {
      const top = deskTopHeight(dkP);
      y0 = Math.max(1.35, desk.extent.h + 0.15, top + (deskLamp ? deskLamp.extent.h + 0.1 : 0.5));
    }
    const along = THREE.MathUtils.clamp(desk ? desk.position[2] : -0.9, -HALF_W + e.w / 2, maxZ - e.w / 2);
    add('shelf', 'shelf', shP, onWall('right', along, e.d, y0), { ...e, h: Math.max(e.h, 0.26) }, { label: 'Rak dinding', wall: 'right' });
  }

  // --- Karpet di bagian kaki tempat tidur (sisi panjang searah panjang kamar)
  const rgP = P('rug');
  if (rgP) {
    const long = cm(Math.max(rgP.size.w, rgP.size.d));
    const short = cm(Math.min(rgP.size.w, rgP.size.d));
    const footZ = bed ? -HALF_W + bed.extent.d : 0.4;
    const zMax = Math.min(footZ + 0.55, HALF_W - 0.05);
    let zc = zMax - short / 2;
    if (zc - short / 2 < -HALF_W) zc = -HALF_W + short / 2;
    let xc = bed ? BED_X : -0.3;
    if (wardrobe) {
      const wb = poseBox(wardrobe.position, wardrobe.rotY, wardrobe.extent);
      if (xc - long / 2 < wb.max.x + 0.05 && zc + short / 2 > wb.min.z) xc = wb.max.x + 0.05 + long / 2;
    }
    add('rug', 'rug', rgP, { position: [xc, 0, zc - short / 2], rotY: 0 }, { w: long, d: short, h: cm(rgP.size.h ?? 1) }, {
      label: 'Karpet',
      rugSize: { w: long, d: short },
    });
  }

  // --- Tirai di jendela (dinding kanan, tidak bisa dipindahkan)
  const cuP = P('curtain');
  if (cuP) {
    const lay = curtainLayout(cuP, WIN);
    if (lay.style === 'panels' && cm(cuP.size.h) > 2.9) {
      problem(['curtain'], `Tirai setinggi ${cuP.size.h} cm melebihi tinggi pemasangan maksimal (290 cm) di kamar ini.`);
    }
    if (lay.style === 'roller' && cm(cuP.size.w) < WIN.width) {
      problem(['curtain'], `Tirai gulung selebar ${cuP.size.w} cm lebih sempit dari jendela (${Math.round(WIN.width * 100)} cm), sebagian kaca tidak tertutup.`, 'warning');
    }
    const top = lay.style === 'roller' ? lay.top : lay.rodY;
    const bottom = Math.max(0, lay.bottom);
    const pose = { position: [HALF_L, 0, WINDOW.centerZ], rotY: -QUARTER };
    // tirai panel: dua tumpukan kain di tepi jendela (kotak terpisah agar meja di bawah jendela tidak dianggap tabrakan)
    const zs = lay.style === 'roller' ? [WINDOW.centerZ] : [WIN.z0, WIN.z1];
    zs.forEach((z, i) => {
      add(`curtain:${i}`, 'curtain', cuP, pose, null, {
        label: 'Tirai jendela',
        fixed: true,
        boxOnly: i > 0,
        box: new THREE.Box3(new THREE.Vector3(HALF_L - lay.depth, bottom, z - lay.stack / 2), new THREE.Vector3(HALF_L, top + 0.03, z + lay.stack / 2)),
      });
    });
  }

  // --- Dekorasi: lukisan di atas tempat tidur, tanaman dekat jendela
  const artY = Math.max(1.4, bed ? bed.extent.h + 0.25 : 1.45);
  add('art', 'art', null, { position: [bed ? BED_X : -0.5, artY, -HALF_W], rotY: 0 }, DECOR.art.extent, { label: DECOR.art.label, decor: true, wall: 'back' });
  add('plant', 'plant', null, { position: [1.6, 0, -0.45], rotY: 0 }, DECOR.plant.extent, { label: DECOR.plant.label, decor: true });

  applyOverrides(items, overrides);

  // Lemari pintu engsel butuh ruang di depannya untuk membuka pintu (selebar satu daun pintu)
  if (wardrobe && wrP.model.doors === 'hinged') {
    const swing = wardrobe.extent.w / (wrP.model.doorCount ?? 2);
    const zone = frontZone(wardrobe, swing).expandByScalar(-0.003);
    for (const it of items) {
      if (['bed', 'nightstands', 'desk', 'chair'].includes(it.slot) && it.box.intersectsBox(zone)) {
        problem(['wardrobe', it.slot], `Pintu lemari (engsel) butuh sekitar ${Math.round(swing * 100)} cm ruang di depannya untuk dibuka, sebagian terhalang ${it.label.toLowerCase()}.`, 'warning');
      }
    }
  }

  checkCollisions(items, problem);
  return { items, problems };
}

// Posisi buatan pengguna. Benda "anak" (kasur, lampu, kursi bila tidak dipindah sendiri)
// ikut bergeser & berputar bersama induknya sebagai satu kesatuan.
function applyOverrides(items, overrides) {
  const moved = new Map();
  for (const it of items) {
    const ov = overrides[it.key];
    if (ov && it.movable) {
      const c0 = centerOf(it.position, it.rotY, it.extent.d);
      const rot1 = it.wall ? it.rotY : ov.q * QUARTER;
      const [ox, oz] = originFromCenter(ov.cx, ov.cz, rot1, it.extent.d);
      const y1 = ov.y ?? it.position[1];
      moved.set(it, { c0, c1: [ov.cx, ov.cz], delta: rot1 - it.rotY, dy: y1 - it.position[1] });
      it.position = [ox, y1, oz];
      it.rotY = rot1;
      it.overridden = true;
    } else if (it.parent && moved.has(it.parent)) {
      const t = moved.get(it.parent);
      const [vx, vz] = rotateXZ(it.position[0] - t.c0[0], it.position[2] - t.c0[1], t.delta);
      it.position = [t.c1[0] + vx, it.position[1] + t.dy, t.c1[1] + vz];
      it.rotY += t.delta;
      moved.set(it, t);
    }
    if (!it.fixed) it.box = poseBox(it.position, it.rotY, it.extent);
  }
}

// Arah depan benda: sumbu ('x'/'z') dan tandanya (+1/-1)
function frontDir(it) {
  return [
    ['z', 1],
    ['x', 1],
    ['z', -1],
    ['x', -1],
  ][quarterOf(it.rotY)];
}

// Kotak ruang tepat di depan benda sedalam "depth"
function frontZone(it, depth) {
  const [axis, sign] = frontDir(it);
  const z = it.box.clone();
  if (sign > 0) {
    z.min[axis] = it.box.max[axis];
    z.max[axis] = it.box.max[axis] + depth;
  } else {
    z.max[axis] = it.box.min[axis];
    z.min[axis] = it.box.min[axis] - depth;
  }
  return z;
}

// Jarak kosong di depan benda sampai furnitur lain atau dinding
function freeInFront(it, others) {
  const [axis, sign] = frontDir(it);
  const lat = axis === 'x' ? 'z' : 'x';
  const face = sign > 0 ? it.box.max[axis] : it.box.min[axis];
  const limit = axis === 'x' ? HALF_L : HALF_W;
  let free = sign > 0 ? limit - face : face + limit;
  for (const o of others) {
    if (o === it || o.box.max[lat] <= it.box.min[lat] || o.box.min[lat] >= it.box.max[lat]) continue;
    const near = sign > 0 ? o.box.min[axis] : o.box.max[axis];
    const dist = sign * (near - face);
    if (dist >= -0.001) free = Math.min(free, dist);
  }
  return free;
}

// Pasangan yang memang boleh bersentuhan/bertumpuk
function allowed(a, b) {
  const pair = [a.slot, b.slot].sort().join('+');
  if (a.slot === 'rug' || b.slot === 'rug') return true;
  if (a.parent === b || b.parent === a) return true;
  if (pair === 'chair+desk') return true;
  if (a.slot === b.slot && a.slot === 'curtain') return true;
  return false;
}

function checkCollisions(items, problem) {
  const room = new THREE.Box3(new THREE.Vector3(-HALF_L, 0, -HALF_W), new THREE.Vector3(HALF_L, ROOM.height, HALF_W)).expandByScalar(0.005);
  const door = new THREE.Box3(
    new THREE.Vector3(DOOR.centerX - DOOR.width / 2, 0, HALF_W - DOOR.width),
    new THREE.Vector3(DOOR.centerX + DOOR.width / 2, DOOR.height, HALF_W),
  );
  const windowZone = new THREE.Box3(new THREE.Vector3(HALF_L - 0.05, WIN.sill, WIN.z0), new THREE.Vector3(HALF_L, WIN.top, WIN.z1));
  const shrink = (b) => b.clone().expandByScalar(-0.003);

  // Masalah satu benda: di luar kamar, menghalangi pintu, menutupi jendela
  const own = (it) => {
    const out = [];
    if (!room.containsBox(it.box)) {
      const over = [];
      if (it.box.min.x < -HALF_L || it.box.max.x > HALF_L) over.push('panjang');
      if (it.box.min.z < -HALF_W || it.box.max.z > HALF_W) over.push('lebar');
      if (it.box.max.y > ROOM.height) over.push('tinggi');
      out.push(`${it.label}${it.product ? ` (${it.product.name})` : ''} melebihi ${over.join(' & ') || 'batas'} kamar.`);
    }
    if (!['rug', 'curtain', 'art'].includes(it.slot) && !it.supportedBy && it.parent?.slot !== 'bed' && shrink(it.box).intersectsBox(door)) {
      out.push(`${it.label} menghalangi area buka pintu kamar.`);
    }
    if (it.slot !== 'curtain' && it.box.max.x > HALF_L - 0.06 && shrink(it.box).intersectsBox(windowZone)) {
      out.push(`${it.label} menutupi jendela.`);
    }
    return out;
  };
  const hits = (a, b) => !allowed(a, b) && shrink(a.box).intersectsBox(shrink(b.box));

  // Dekorasi di posisi bawaan cukup disembunyikan bila tempatnya terpakai (bukan dianggap masalah)
  for (const it of items) {
    if (it.decor && !it.overridden) it.hidden = own(it).length > 0 || items.some((o) => o !== it && !o.decor && hits(it, o));
  }
  const active = items.filter((it) => !it.hidden);
  for (const it of active) for (const text of own(it)) problem([it.slot], text);
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      if (hits(active[i], active[j])) problem([active[i].slot, active[j].slot], `${active[i].label} bertabrakan dengan ${active[j].label}.`);
    }
  }
}

// Perubahan baru dianggap gagal jika memunculkan masalah (error) yang sebelumnya tidak ada.
export function newProblems(before, after) {
  const old = new Set(before.problems.map((p) => p.key));
  return after.problems.filter((p) => p.severity === 'error' && !old.has(p.key));
}

// Jarak antar furnitur di lantai (cm) dan ruang jalan.
export function measureDistances(layout) {
  const floor = layout.items.filter((it) => ['bed', 'nightstands', 'wardrobe', 'desk', 'chair'].includes(it.slot));
  const gap = (a, b) => {
    const dx = Math.max(0, a.box.min.x - b.box.max.x, b.box.min.x - a.box.max.x);
    const dz = Math.max(0, a.box.min.z - b.box.max.z, b.box.min.z - a.box.max.z);
    return Math.hypot(dx, dz);
  };
  const pairs = [];
  for (let i = 0; i < floor.length; i++) {
    for (let j = i + 1; j < floor.length; j++) {
      const a = floor[i];
      const b = floor[j];
      if ([a.slot, b.slot].sort().join('+') === 'chair+desk') continue;
      const g = gap(a, b);
      if (g < 1.2) pairs.push({ a: a.label, b: b.label, gap: g });
    }
  }
  pairs.sort((x, y) => x.gap - y.gap);

  const notes = [];
  const bed = layout.items.find((it) => it.slot === 'bed');
  if (bed) notes.push({ text: 'Ruang kosong di kaki tempat tidur', gap: freeInFront(bed, floor) });
  const wr = layout.items.find((it) => it.slot === 'wardrobe');
  if (wr) notes.push({ text: 'Ruang kosong di depan lemari (titik tersempit)', gap: freeInFront(wr, floor) });
  const area = floor.reduce((s, it) => s + (it.box.max.x - it.box.min.x) * (it.box.max.z - it.box.min.z), 0);
  return { pairs, notes, floorUse: area / (ROOM.length * ROOM.width), fmtCm };
}
