import * as THREE from 'three';
import { box, bevelBox, roundBox, cylinder, sphere, lathe, pillowGeometry, drapeGeometry, random } from '../helpers.js';

// =====================================================================
// MODEL 3D PRODUK (PENDEKATAN)
// Setiap model dibuat dari ukuran produk (cm) di katalog dan parameter bentuk "model".
// Model ini adalah pendekatan berdasarkan ukuran & deskripsi produk, BUKAN model resmi pabrikan.
//
// Koordinat lokal setiap model:
//   x = lebar (sejajar dinding), titik tengah di x = 0
//   z = kedalaman: z = 0 menempel dinding, z = d bagian depan
//   y = tinggi, y = 0 di lantai (atau di permukaan tempat benda diletakkan)
// =====================================================================

const cm = (v) => v / 100;

function mesh(geometry, material, shadows = true) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

// Gagang: 'bar' (batang vertikal/horizontal), 'knob' (kenop bulat), 'groove' (celah tarik), 'none'
function handle(g, type, mat, groove, x, y, z, vertical = true, length = 0.12) {
  if (type === 'knob') {
    const k = sphere(0.013, mat, x, y, z + 0.022);
    const neck = cylinder(0.006, 0.006, 0.018, mat);
    neck.rotation.x = Math.PI / 2;
    neck.position.set(x, y, z + 0.009);
    g.add(k, neck);
  } else if (type === 'bar') {
    const bar = cylinder(0.006, 0.006, length, mat, 0, -length / 2, 0, { segments: 12 });
    if (!vertical) bar.rotation.z = Math.PI / 2;
    bar.position.set(x, y, z + 0.024);
    g.add(bar);
    for (const s of [-1, 1]) {
      const leg = cylinder(0.0045, 0.0045, 0.018, mat, 0, -0.009, 0, { segments: 10 });
      leg.rotation.x = Math.PI / 2;
      const off = s * (length / 2 - 0.015);
      leg.position.set(x + (vertical ? 0 : off), y + (vertical ? off : 0), z + 0.009);
      g.add(leg);
    }
  } else if (type === 'groove') {
    g.add(box(vertical ? 0.012 : length, vertical ? length : 0.012, 0.004, groove, x, y - (vertical ? length / 2 : 0.006), z + 0.001));
  }
}

function legs(g, mat, w, d, h, inset = 0.04, r = 0.018, taper = 0.75) {
  for (const sx of [-1, 1]) {
    for (const sz of [0, 1]) {
      g.add(cylinder(r, r * taper, h, mat, sx * (w / 2 - inset), 0, sz ? d - inset : inset, { segments: 14 }));
    }
  }
}

// ---------------------------------------------------------------------
// Tempat tidur
// style: 'panel' (sandaran & papan kaki berupa panel, mis. MALM)
//        'posts' (tiang di empat sudut + panel, mis. HEMNES/SONGESAND)
//        'storage' (badan kotak dengan laci, mis. BRIMNES/NORDLI)
//        'divan' (dipan rendah tanpa sandaran, mis. INFORMA Linford)
// ---------------------------------------------------------------------

// Posisi permukaan alas kasur (dipakai untuk meletakkan kasur di dalam rangka).
export function bedFrameInfo(p) {
  const o = p.model;
  const d = cm(p.size.d);
  const h = cm(p.size.h);
  if (o.style === 'divan') return { deck: h, z0: 0, z1: d };
  const t = o.style === 'posts' ? 0.06 : 0.05;
  const head = o.style === 'storage' && !(h > cm(o.deck) + 0.05) ? 0 : t;
  const foot = o.style === 'storage' ? 0 : t;
  return { deck: cm(o.deck), z0: head, z1: d - foot };
}

function bed(p, { fin, m }) {
  const g = new THREE.Group();
  const o = p.model;
  const w = cm(p.size.w);
  const d = cm(p.size.d);
  const h = cm(p.size.h);
  const main = fin.get(o.finish);
  const deck = cm(o.deck);
  const foot = cm(o.foot ?? 38);
  const slats = () => g.add(box(w - 0.08, 0.02, d - 0.12, fin.get('pine'), 0, deck - 0.02, d / 2));

  if (o.style === 'panel') {
    const t = 0.05;
    g.add(bevelBox(w, h, t, main, 0, 0, t / 2, 0.005));
    g.add(bevelBox(w, foot, t, main, 0, 0, d - t / 2, 0.005));
    for (const s of [-1, 1]) g.add(bevelBox(0.03, foot - 0.13, d - 2 * t, main, s * (w / 2 - 0.015), 0.13, d / 2, 0.004));
    g.add(box(w - 0.3, 0.13, 0.03, fin.get('black'), 0, 0, d / 2)); // penyangga tengah (tersembunyi di bawah)
    slats();
  } else if (o.style === 'posts') {
    const post = 0.06;
    for (const [x, z, ph] of [
      [-1, 0, h],
      [1, 0, h],
      [-1, 1, foot],
      [1, 1, foot],
    ]) {
      g.add(bevelBox(post, ph, post, main, x * (w / 2 - post / 2), 0, z ? d - post / 2 : post / 2, 0.008));
    }
    g.add(bevelBox(w - 2 * post, h - 0.4, 0.022, main, 0, 0.3, post / 2, 0.004));
    g.add(bevelBox(w - 2 * post + 0.02, 0.06, 0.07, main, 0, h - 0.08, post / 2, 0.008));
    g.add(bevelBox(w - 2 * post, foot - 0.18, 0.022, main, 0, 0.14, d - post / 2, 0.004));
    for (const s of [-1, 1]) g.add(bevelBox(0.03, 0.16, d - 2 * post, main, s * (w / 2 - 0.03), deck - 0.14, d / 2, 0.004));
    slats();
  } else if (o.style === 'storage') {
    const hasHead = h > deck + 0.05;
    const t = hasHead ? 0.05 : 0;
    if (hasHead) g.add(bevelBox(w, h, 0.05, main, 0, 0, 0.025, 0.005));
    g.add(box(w - 0.04, 0.03, d - t - 0.04, fin.get('black'), 0, 0, t + (d - t) / 2)); // plint
    g.add(bevelBox(w, deck - 0.03, d - t, main, 0, 0.03, t + (d - t) / 2, 0.004));
    // Muka laci di kedua sisi panjang
    const drawerL = (d - t - 0.12) / 2;
    for (const s of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const zc = t + 0.06 + drawerL / 2 + i * (drawerL + 0.01);
        g.add(box(0.004, deck - 0.1, drawerL, m.groove, s * (w / 2 + 0.001), 0.06, zc));
        g.add(bevelBox(0.006, deck - 0.11, drawerL - 0.01, main, s * (w / 2 + 0.004), 0.065, zc, 0.002));
      }
    }
  } else {
    // divan
    const legH = 0.03;
    for (const sx of [-1, 1]) for (const sz of [0.15, d / 2, d - 0.15]) g.add(cylinder(0.025, 0.02, legH, fin.get('black'), sx * (w / 2 - 0.12), 0, sz, { segments: 12 }));
    g.add(roundBox(w, h - legH, d, 0.012, main, 0, legH, d / 2, 2));
  }
  return g;
}

// ---------------------------------------------------------------------
// Kasur (+ seprai, bantal, dan selimut sebagai dekorasi umum)
// ---------------------------------------------------------------------
function mattress(p, { m }) {
  const g = new THREE.Group();
  const w = cm(p.size.w);
  const d = cm(p.size.d);
  const h = cm(p.size.h);
  g.add(roundBox(w, h, d, Math.min(0.06, h / 3), m.sheet, 0, 0, d / 2));

  // Dekorasi tempat tidur (bukan produk katalog): selimut, lipatan, throw, bantal
  const z0 = d * 0.36;
  const duvet = mesh(drapeGeometry({ halfWidth: w / 2 + 0.01, length: d - z0 + 0.01, drop: 0.14, radius: 0.035, puff: 0.035, seed: 3 }), m.duvet);
  duvet.position.set(0, h + 0.005, z0);
  g.add(duvet);
  const rollGeo = new THREE.CapsuleGeometry(0.05, w - 0.02, 6, 20);
  rollGeo.rotateZ(Math.PI / 2);
  rollGeo.scale(1, 0.7, 1);
  const roll = mesh(rollGeo, m.duvet);
  roll.position.set(0, h + 0.035, z0 + 0.03);
  g.add(roll);
  const throwBlanket = mesh(drapeGeometry({ halfWidth: w / 2 + 0.03, length: 0.5, drop: 0.13, radius: 0.05, foot: false, puff: 0.04, seed: 5 }), m.accent);
  throwBlanket.position.set(0, h + 0.02, d - 0.62);
  g.add(throwBlanket);

  const two = w >= 1.3;
  const pw = two ? Math.min(0.68, w / 2 - 0.06) : Math.min(0.7, w - 0.15);
  const pillowGeo = pillowGeometry(pw, 0.46, 0.17);
  const cushionGeo = pillowGeometry(0.42, 0.42, 0.14);
  for (const s of two ? [-1, 1] : [0]) {
    const pl = mesh(pillowGeo, m.pillow);
    pl.rotation.set(0.45, s * 0.03, 0);
    pl.position.set(s * (pw / 2 + 0.02), h + 0.11, 0.29);
    g.add(pl);
    const c = mesh(cushionGeo, s < 0 ? m.accent : m.upholstery);
    c.rotation.set(1.22, s * -0.08, 0);
    c.position.set(s * 0.24, h + 0.21, 0.57);
    g.add(c);
  }
  return g;
}

// ---------------------------------------------------------------------
// Lemari pakaian
// doors: 'hinged' (pintu engsel, jumlah doorCount), 'sliding' (2 pintu geser), 'open' (rangka terbuka)
// ---------------------------------------------------------------------
function wardrobe(p, { fin, m }) {
  const g = new THREE.Group();
  const o = p.model;
  const w = cm(p.size.w);
  const d = cm(p.size.d);
  const h = cm(p.size.h);
  const main = fin.get(o.finish);
  const front = fin.get(o.front ?? o.finish);
  const metal = fin.get(o.handleFinish ?? 'metal-black');
  const doorT = 0.02;
  const base = o.legs ? cm(o.legs) : 0.06;

  if (o.legs) legs(g, fin.get(o.legFinish ?? o.finish), w, d - doorT, base, 0.04, 0.02, 0.8);
  else g.add(box(w - 0.04, base, d - doorT - 0.04, main, 0, 0, (d - doorT) / 2));

  if (o.doors === 'open') {
    // Rangka terbuka: dua sisi, atas, bawah, rak atas, rel gantungan + pakaian
    const t = 0.025;
    for (const s of [-1, 1]) g.add(bevelBox(t, h - base, d, main, s * (w / 2 - t / 2), base, d / 2, 0.004));
    g.add(bevelBox(w, t, d, main, 0, h - t, d / 2, 0.004));
    g.add(bevelBox(w - 2 * t, t, d, main, 0, base, d / 2, 0.004));
    g.add(bevelBox(w - 2 * t, t, d, main, 0, h - 0.3, d / 2, 0.004));
    const rail = cylinder(0.012, 0.012, w - 2 * t, fin.get('metal-grey'), 0, -(w - 2 * t) / 2, 0);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, h - 0.38, d / 2);
    g.add(rail);
    const rand = random(p.id.length);
    const colors = ['fabric-cream', 'fabric-blue', 'fabric-grey', 'fabric-beige', 'fabric-white'];
    let x = -w / 2 + t + 0.06;
    while (x < w / 2 - t - 0.06) {
      const len = 0.6 + rand() * 0.45;
      g.add(roundBox(0.035, len, Math.min(0.42, d - 0.08), 0.012, fin.get(colors[Math.floor(rand() * colors.length)]), x, h - 0.42 - len, d / 2));
      x += 0.05 + rand() * 0.03;
    }
    return g;
  }

  const bodyD = d - doorT - (o.doors === 'sliding' ? doorT + 0.004 : 0);
  g.add(bevelBox(w, h - base, bodyD, main, 0, base, bodyD / 2, 0.004));

  // Laci di bagian bawah
  const n = o.drawers ?? 0;
  const drawerH = 0.2;
  for (let i = 0; i < n; i++) {
    const y = base + i * drawerH + 0.003;
    g.add(bevelBox(w - 0.008, drawerH - 0.006, doorT, front, 0, y, d - doorT / 2, 0.003));
    handle(g, o.handle ?? 'bar', metal, m.groove, 0, y + drawerH / 2, d, false, Math.min(0.3, w / 3));
  }
  const y0 = base + n * drawerH + 0.003;
  const doorH = h - y0 - 0.006;

  if (o.doors === 'sliding') {
    const pw = w / 2 + 0.02;
    const zs = [d - doorT * 1.5 - 0.004, d - doorT / 2];
    for (const [i, s] of [-1, 1].entries()) {
      const zc = zs[i];
      g.add(bevelBox(pw, doorH, doorT, i === 0 && o.mirror ? fin.get('mirror') : front, s * (w / 4 - 0.01), y0, zc, 0.003));
      handle(g, o.handle ?? 'groove', metal, m.groove, s * (w / 2 - 0.05), y0 + doorH * 0.55, zc + doorT / 2, true, 0.4);
    }
  } else {
    const count = o.doorCount ?? 2;
    const gap = 0.004;
    const dw = (w - gap * (count + 1)) / count;
    for (let i = 0; i < count; i++) {
      const xc = -w / 2 + gap + dw / 2 + i * (dw + gap);
      const isMirror = o.mirror && i === count - 1;
      g.add(bevelBox(dw, doorH, doorT, front, xc, y0, d - doorT / 2, 0.003));
      if (isMirror) g.add(box(dw - 0.08, doorH - 0.16, 0.003, fin.get('mirror'), xc, y0 + 0.08, d + 0.0015));
      // Gagang di sisi pintu yang bertemu dengan pintu sebelahnya
      const pairLeft = i % 2 === 0 && i + 1 < count;
      const side = count === 1 ? 1 : pairLeft ? 1 : -1;
      handle(g, o.handle ?? 'bar', metal, m.groove, xc + side * (dw / 2 - 0.04), y0 + Math.min(doorH * 0.5, 1.1), d, true, 0.3);
    }
  }
  return g;
}

// ---------------------------------------------------------------------
// Meja samping tempat tidur
// ---------------------------------------------------------------------
function nightstand(p, { fin, m }) {
  const g = new THREE.Group();
  const o = p.model;
  const w = cm(p.size.w);
  const d = cm(p.size.d);
  const h = cm(p.size.h);
  const main = fin.get(o.finish);
  const front = fin.get(o.front ?? o.finish);
  const metal = fin.get(o.handleFinish ?? 'brass');
  const legH = cm(o.legs ?? 0);
  if (legH > 0) legs(g, fin.get(o.legFinish ?? o.finish), w, d, legH, 0.035, 0.016, 0.7);
  const bodyH = h - legH;
  g.add(bevelBox(w, bodyH, d - 0.016, main, 0, legH, (d - 0.016) / 2, 0.005));

  const n = o.drawers ?? 1;
  const zone = o.open ? bodyH * 0.45 : bodyH - 0.02;
  if (o.door) {
    g.add(bevelBox(w - 0.02, zone - 0.01, 0.016, front, 0, legH + bodyH - zone - 0.005, d - 0.008, 0.003));
    handle(g, o.handle ?? 'knob', metal, m.groove, w / 2 - 0.05, legH + bodyH - zone / 2, d, true, 0.08);
  } else {
    const fh = zone / Math.max(n, 1);
    for (let i = 0; i < n; i++) {
      const y = legH + bodyH - (i + 1) * fh - 0.004;
      g.add(bevelBox(w - 0.02, fh - 0.008, 0.016, front, 0, y, d - 0.008, 0.003));
      handle(g, o.handle ?? 'bar', metal, m.groove, 0, y + fh / 2, d, false, Math.min(0.12, w / 3));
    }
  }
  if (o.open) g.add(box(w - 0.05, bodyH - zone - 0.05, 0.004, m.groove, 0, legH + 0.03, d - 0.02)); // ceruk terbuka
  return g;
}

// ---------------------------------------------------------------------
// Meja belajar / meja kerja
// legs: 'metal' (4 kaki logam), 'panel' (2 panel samping)
// unit: 'left' | 'right' (kabinet laci di satu sisi), drawer: laci tipis di bawah daun meja
// hutch: tinggi produk > tinggi daun meja → rak atas di bagian belakang
// ---------------------------------------------------------------------
export function deskTopHeight(p) {
  return cm(p.model.top ?? Math.min(p.size.h, 75));
}

function desk(p, { fin, m }) {
  const g = new THREE.Group();
  const o = p.model;
  const w = cm(p.size.w);
  const d = cm(p.size.d);
  const h = cm(p.size.h);
  const main = fin.get(o.finish);
  const legMat = fin.get(o.legFinish ?? o.finish);
  const topY = deskTopHeight(p);
  const topT = 0.025;
  g.add(bevelBox(w, topT, d, fin.get(o.topFinish ?? o.finish), 0, topY - topT, d / 2, 0.004));

  const unitW = o.unit ? cm(o.unitW ?? 35) : 0;
  const unitX = o.unit === 'left' ? -w / 2 + unitW / 2 : w / 2 - unitW / 2;
  if (o.legs === 'panel') {
    for (const s of [-1, 1]) {
      if (o.unit && Math.sign(unitX) === s) continue;
      g.add(bevelBox(0.025, topY - topT, d - 0.02, legMat, s * (w / 2 - 0.0125), 0, d / 2, 0.003));
    }
    g.add(box(w - 0.06, 0.25, 0.015, legMat, 0, topY - topT - 0.3, 0.03)); // panel belakang
  } else {
    for (const sx of [-1, 1]) {
      if (o.unit && Math.sign(unitX) === sx) continue;
      for (const z of [0.03, d - 0.03]) g.add(bevelBox(0.035, topY - topT, 0.035, legMat, sx * (w / 2 - 0.035), 0, z, 0.004));
    }
  }
  if (o.unit) {
    g.add(bevelBox(unitW, topY - topT, d - 0.02, main, unitX, 0, (d - 0.02) / 2, 0.004));
    const n = o.unitDrawers ?? 3;
    const fh = (topY - topT - 0.06) / n;
    for (let i = 0; i < n; i++) {
      const y = 0.05 + i * fh;
      g.add(bevelBox(unitW - 0.012, fh - 0.006, 0.016, fin.get(o.front ?? o.finish), unitX, y, d - 0.012, 0.003));
      handle(g, o.handle ?? 'bar', fin.get('metal-black'), m.groove, unitX, y + fh / 2, d - 0.004, false, 0.1);
    }
  }
  if (o.drawer) {
    // Laci tipis di bawah daun meja, di sisi yang tidak ada kabinetnya
    const dw = Math.min(0.5, w - unitW - 0.15);
    const dx = !o.unit ? 0 : unitX > 0 ? -w / 2 + 0.06 + dw / 2 : w / 2 - 0.06 - dw / 2;
    g.add(bevelBox(dw, 0.08, d - 0.08, fin.get(o.front ?? o.finish), dx, topY - topT - 0.085, (d - 0.08) / 2 + 0.03, 0.003));
  }
  if (h > topY + 0.1) {
    // Rak atas (hutch) di bagian belakang meja
    const hd = Math.min(cm(o.hutchD ?? 25), d * 0.5);
    const hh = h - topY;
    for (const s of [-1, 1]) g.add(bevelBox(0.02, hh, hd, main, s * (w / 2 - 0.01), topY, hd / 2, 0.003));
    g.add(bevelBox(w, 0.02, hd, main, 0, h - 0.02, hd / 2, 0.003));
    g.add(bevelBox(w - 0.04, 0.02, hd, main, 0, topY + hh * 0.5, hd / 2, 0.003));
    g.add(box(w - 0.04, hh - 0.02, 0.008, main, 0, topY, 0.004));
  }
  return g;
}

// ---------------------------------------------------------------------
// Kursi: 'office' (kaki bintang lima + roda), 'wood' (kayu 4 kaki), 'shell' (dudukan cetak + kaki logam)
// Bagian depan kursi menghadap +z.
// ---------------------------------------------------------------------
function chair(p, { fin }) {
  const g = new THREE.Group();
  const o = p.model;
  const w = cm(p.size.w);
  const d = cm(p.size.d);
  const h = cm(p.size.h);
  const seatY = cm(o.seat ?? 46);
  const seatMat = fin.get(o.seatFinish ?? o.finish);
  const frame = fin.get(o.frameFinish ?? 'metal-black');
  const cz = d / 2;

  if (o.style === 'office') {
    const r = Math.min(w, d) / 2 - 0.03;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leg = box(r, 0.03, 0.04, frame, 0, 0.05, 0);
      leg.position.set((Math.cos(a) * r) / 2, 0.065, cz + (Math.sin(a) * r) / 2);
      leg.rotation.y = -a;
      g.add(leg);
      g.add(sphere(0.025, fin.get('plastic-black'), Math.cos(a) * r, 0.025, cz + Math.sin(a) * r));
    }
    g.add(cylinder(0.025, 0.025, seatY - 0.12, fin.get('chrome'), 0, 0.08, cz));
    g.add(roundBox(w * 0.82, 0.08, d * 0.72, 0.03, seatMat, 0, seatY - 0.08, cz + 0.03, 3));
    const backH = h - seatY - 0.06;
    const back = roundBox(w * 0.78, backH, 0.05, 0.025, fin.get(o.backFinish ?? o.seatFinish ?? o.finish), 0, 0, 0, 3);
    back.position.set(0, seatY + 0.05 + backH / 2, 0.06);
    back.rotation.x = -0.12;
    g.add(back);
    g.add(box(0.05, 0.2, 0.03, frame, 0, seatY - 0.08, 0.1));
    if (o.arms) {
      for (const s of [-1, 1]) {
        g.add(box(0.03, 0.2, 0.03, frame, s * (w * 0.41 + 0.02), seatY - 0.02, cz));
        g.add(roundBox(0.06, 0.03, 0.25, 0.012, fin.get('plastic-black'), s * (w * 0.41 + 0.02), seatY + 0.18, cz, 2));
      }
    }
  } else {
    const legMat = o.style === 'shell' ? frame : fin.get(o.frameFinish ?? o.finish);
    const legR = o.style === 'shell' ? 0.011 : 0.018;
    for (const sx of [-1, 1]) for (const sz of [0.05, d - 0.05]) g.add(cylinder(legR, legR * 0.8, seatY - 0.03, legMat, sx * (w / 2 - 0.05), 0, sz, { segments: 12 }));
    g.add(roundBox(w - 0.04, 0.04, d - 0.04, o.style === 'shell' ? 0.018 : 0.006, seatMat, 0, seatY - 0.04, cz, 2));
    const backH = h - seatY;
    if (o.style === 'shell') {
      const back = roundBox(w - 0.06, backH, 0.03, 0.014, seatMat, 0, 0, 0, 2);
      back.position.set(0, seatY + backH / 2, 0.04);
      back.rotation.x = -0.15;
      g.add(back);
    } else {
      for (const sx of [-1, 1]) {
        const post = cylinder(0.016, 0.016, backH, legMat, sx * (w / 2 - 0.05), seatY, 0.05, { segments: 12 });
        g.add(post);
      }
      g.add(bevelBox(w - 0.1, 0.1, 0.02, legMat, 0, h - 0.13, 0.05, 0.005));
      g.add(bevelBox(w - 0.1, 0.05, 0.02, legMat, 0, seatY + 0.15, 0.05, 0.005));
    }
  }
  return g;
}

// ---------------------------------------------------------------------
// Lampu: 'table' (dudukan + kap), 'task' (lampu kerja berlengan), 'dome' (kap jamur), 'globe' (bola)
// ---------------------------------------------------------------------
function lamp(p, { fin, m }) {
  const g = new THREE.Group();
  const o = p.model;
  const w = cm(p.size.w);
  const d = cm(p.size.d);
  const h = cm(p.size.h);
  const body = fin.get(o.finish);
  const cz = d / 2;
  const light = new THREE.PointLight('#ffc98a', 0, 4, 2);
  light.userData = o.style === 'task' ? { day: 0, night: 1.2 } : { day: 0.3, night: 1.6 };

  if (o.style === 'task') {
    const r = Math.min(w, d) / 2 * 0.8;
    g.add(cylinder(r, r, 0.02, body, 0, 0, 0.02 + r));
    const baseZ = 0.02 + r;
    const headZ = Math.min(d - 0.06, baseZ + 0.25);
    const elbowY = h * 0.6;
    const arm1 = new THREE.Vector3(0, elbowY, baseZ - 0.02);
    const head = new THREE.Vector3(0, h - 0.06, headZ);
    for (const [a, b] of [
      [new THREE.Vector3(0, 0.02, baseZ), arm1],
      [arm1, head],
    ]) {
      const len = a.distanceTo(b);
      const rod = cylinder(0.007, 0.007, len, body, 0, -len / 2, 0, { segments: 10 });
      rod.position.copy(a).add(b).multiplyScalar(0.5);
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(rod);
    }
    const shadeR = Math.min(0.075, w / 2);
    const cone = cylinder(0.02, shadeR, 0.12, body, 0, -0.06, 0, { open: true });
    cone.position.copy(head);
    cone.rotation.x = 0.5;
    g.add(cone);
    const bulb = sphere(0.02, m.bulb, head.x, head.y - 0.04, head.z + 0.02);
    bulb.castShadow = false;
    g.add(bulb);
    light.position.set(head.x, head.y - 0.08, head.z + 0.03);
  } else if (o.style === 'globe') {
    g.add(cylinder(w * 0.3, w * 0.35, 0.03, body, 0, 0, cz));
    const ball = sphere(w / 2 - 0.005, fin.shade(o.shade ?? '#fbf5ea'), 0, h - w / 2, cz);
    ball.castShadow = false;
    g.add(ball);
    light.position.set(0, h - w / 2, cz);
  } else if (o.style === 'dome') {
    g.add(cylinder(w * 0.3, w * 0.32, 0.025, body, 0, 0, cz));
    g.add(cylinder(0.012, 0.012, h - 0.1, body, 0, 0.025, cz, { segments: 12 }));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(w / 2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), fin.shade(o.shade ?? '#f6efe2'));
    dome.position.set(0, h - w / 2 * 0.95, cz);
    dome.castShadow = true;
    g.add(dome);
    light.position.set(0, h - w / 2 - 0.02, cz);
  } else {
    // table: dudukan seperti vas + kap kain
    const br = Math.min(w, d) * 0.22;
    const bh = h * 0.45;
    g.add(lathe([[0, 0], [br * 0.8, 0], [br, bh * 0.2], [br * 1.05, bh * 0.5], [br * 0.75, bh * 0.85], [br * 0.3, bh * 0.97], [0, bh]], body, 0, 0, cz));
    g.add(cylinder(0.006, 0.006, h * 0.12, fin.get('brass'), 0, bh, cz, { segments: 10 }));
    const sh = h * 0.42;
    const shade = cylinder(w / 2 * 0.78, w / 2, sh, fin.shade(o.shade ?? '#f4ead8'), 0, h - sh, cz, { open: true, segments: 40 });
    shade.receiveShadow = false;
    g.add(shade);
    const bulb = sphere(0.025, m.bulb, 0, h - sh * 0.6, cz);
    bulb.castShadow = false;
    g.add(bulb);
    light.position.set(0, h - sh * 0.6, cz);
  }
  g.add(light);
  g.userData.lights = [light];
  return g;
}

// ---------------------------------------------------------------------
// Rak dinding: 'plank' (papan melayang), 'bracket' (papan + siku), 'tiered' (rak 2 tingkat berangka)
// ---------------------------------------------------------------------
function shelf(p, { fin, m }) {
  const g = new THREE.Group();
  const o = p.model;
  const w = cm(p.size.w);
  const d = cm(p.size.d);
  const h = cm(p.size.h);
  const main = fin.get(o.finish);
  const rand = random(p.id.length * 7);
  const books = (y, width, depth) => {
    let x = -width / 2 + 0.03;
    while (x < width * 0.15) {
      const t = 0.022 + rand() * 0.02;
      const bh = Math.min(0.24, 0.16 + rand() * 0.08);
      const bd = Math.min(depth - 0.02, 0.14 + rand() * 0.04);
      g.add(bevelBox(t, bh, bd, m.books[Math.floor(rand() * m.books.length)], x + t / 2, y, bd / 2 + 0.01, 0.003));
      x += t + 0.002;
    }
    if (width > 0.45) g.add(lathe([[0, 0], [0.04, 0], [0.05, 0.05], [0.04, 0.12], [0.025, 0.15], [0, 0.15]], m.ceramic, width / 2 - 0.1, y, depth / 2));
  };

  if (o.style === 'tiered') {
    const t = 0.018;
    for (const s of [-1, 1]) g.add(bevelBox(t, h, d, main, s * (w / 2 - t / 2), 0, d / 2, 0.003));
    g.add(bevelBox(w, t, d, main, 0, 0, d / 2, 0.003));
    g.add(bevelBox(w - 2 * t, t, d, main, 0, h / 2, d / 2, 0.003));
    g.add(bevelBox(w, t, d, main, 0, h - t, d / 2, 0.003));
  } else {
    const t = Math.max(h, 0.018);
    g.add(bevelBox(w, t, d, main, 0, 0, d / 2, 0.003));
    if (o.style === 'bracket') {
      for (const s of [-1, 1]) {
        g.add(box(0.02, 0.12, 0.004, fin.get(o.bracketFinish ?? 'metal-black'), s * (w / 2 - 0.08), -0.12, 0.002));
        g.add(box(0.02, 0.004, d * 0.8, fin.get(o.bracketFinish ?? 'metal-black'), s * (w / 2 - 0.08), -0.004, d * 0.4));
      }
    }
    if (d >= 0.14) books(t, w, d);
  }
  return g;
}

// ---------------------------------------------------------------------
// Karpet
// ---------------------------------------------------------------------
function rug(p, { fin }) {
  const g = new THREE.Group();
  const o = p.model;
  const w = cm(p.size.w);
  const d = cm(p.size.d);
  const h = Math.max(cm(p.size.h ?? 1), 0.006);
  const r = roundBox(w, h, d, Math.min(0.006, h / 2), fin.rug(p.id, { w, d, base: o.base, accent: o.accent, pattern: o.pattern }), 0, 0, d / 2, 2);
  r.castShadow = false;
  g.add(r);
  return g;
}

// ---------------------------------------------------------------------
// Tirai (dipasang di jendela). Koordinat lokal khusus: x sepanjang jendela (0 = tengah jendela),
// z menjauhi dinding, y = tinggi dari lantai.
// 'panels': sepasang panel kain dikumpulkan di kedua sisi jendela; lipatan dihitung agar
//           panjang kain yang terlipat sama dengan lebar kain produk.
// 'roller': tirai gulung di atas jendela.
// ---------------------------------------------------------------------
export function curtainLayout(p, win) {
  const o = p.model;
  const W = cm(p.size.w);
  const L = cm(p.size.h);
  if (o.style === 'roller') {
    const top = win.top + 0.08;
    return { style: 'roller', top, bottom: top - L, stack: W, depth: 0.08 };
  }
  const stack = THREE.MathUtils.clamp(W * 0.3, 0.2, 0.55);
  const rodY = Math.min(2.9, L + 0.03);
  return { style: 'panels', rodY, bottom: rodY - 0.03 - L, stack, depth: 0.14 };
}

function pleatAmplitude(flatWidth, stackWidth, wavelength) {
  const k = (Math.PI * 2) / wavelength;
  const arc = (A) => {
    let sum = 0;
    const n = 200;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * stackWidth;
      sum += Math.sqrt(1 + (A * k * Math.cos(k * x)) ** 2) * (stackWidth / n);
    }
    return sum;
  };
  let lo = 0;
  let hi = stackWidth;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (arc(mid) < flatWidth) lo = mid;
    else hi = mid;
  }
  return lo;
}

function curtain(p, { fin }, win) {
  const g = new THREE.Group();
  const o = p.model;
  const W = cm(p.size.w);
  const L = cm(p.size.h);
  const lay = curtainLayout(p, win);
  const cloth = fin.fabricColor(o.color, { side: THREE.DoubleSide, transparent: o.sheer ?? false, opacity: o.sheer ? 0.75 : 1 });

  if (lay.style === 'roller') {
    const tube = cylinder(0.03, 0.03, W + 0.02, fin.get('metal-white'), 0, -(W + 0.02) / 2, 0);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0, lay.top, 0.05);
    g.add(tube);
    const cover = Math.min(L, (win.top - win.sill) * 0.35);
    const sheet = mesh(new THREE.PlaneGeometry(W, cover), cloth);
    sheet.position.set(0, lay.top - 0.03 - cover / 2, 0.06);
    g.add(sheet);
    g.add(box(W, 0.02, 0.015, fin.get('metal-white'), 0, lay.top - 0.03 - cover - 0.02, 0.06));
    return g;
  }

  const rodLen = win.width + lay.stack + 0.12;
  const rod = cylinder(0.012, 0.012, rodLen, fin.get('metal-black'), 0, -rodLen / 2, 0, { segments: 16 });
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, lay.rodY, 0.08);
  g.add(rod);
  for (const s of [-1, 1]) {
    g.add(sphere(0.022, fin.get('metal-black'), (s * rodLen) / 2, lay.rodY, 0.08));
    g.add(box(0.02, 0.02, 0.08, fin.get('metal-black'), s * (rodLen / 2 - 0.08), lay.rodY - 0.01, 0.04));
  }
  const wavelength = 0.07;
  const A = Math.min(pleatAmplitude(W, lay.stack, wavelength), 0.05);
  for (const s of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(lay.stack, L, Math.ceil(lay.stack / wavelength) * 12, 12);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + lay.stack / 2;
      const yN = 0.5 - pos.getY(i) / L;
      pos.setZ(i, Math.sin((x / wavelength) * Math.PI * 2) * A * (0.9 + 0.2 * yN));
      uv.setXY(i, pos.getX(i), pos.getY(i));
    }
    geo.computeVertexNormals();
    const panel = mesh(geo, cloth);
    panel.position.set((s * win.width) / 2, lay.rodY - 0.03 - L / 2, 0.08);
    g.add(panel);
  }
  return g;
}

const BUILDERS = { bed, mattress, wardrobe, nightstand, desk, chair, lamp, shelf, rug, curtain };

// Membuat model 3D untuk satu produk. win = data jendela (khusus tirai).
export function buildProductModel(p, ctx, win) {
  const builder = BUILDERS[p.category];
  if (!builder) throw new Error(`Tidak ada model untuk kategori "${p.category}"`);
  const g = builder(p, ctx, win);
  g.name = `${p.store} ${p.name}`;
  g.userData.productId = p.id;
  g.userData.lights ??= [];
  return g;
}
