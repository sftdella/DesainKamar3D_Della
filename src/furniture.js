import * as THREE from 'three';
import { box, bevelBox, cylinder, lathe, random } from './helpers.js';

// Dekorasi umum (BUKAN produk katalog): lukisan, tanaman, laptop & buku di meja.
// Furnitur utama sekarang berasal dari katalog produk (lihat src/products/).

// Tanaman sederhana: pot + kumpulan daun.
function plant(m, rand, { potR, potH, height, leafLen, count, pot = m.ceramic }) {
  const g = new THREE.Group();
  g.add(lathe([[0, 0], [potR * 0.78, 0], [potR * 0.95, potH * 0.5], [potR, potH * 0.97], [potR * 0.93, potH], [0, potH]], pot));
  g.add(cylinder(potR * 0.9, potR * 0.9, 0.01, m.soil, 0, potH - 0.02, 0));
  const leafGeometry = new THREE.SphereGeometry(1, 12, 8);
  const spread = potR * 0.4;
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * spread;
    const leaf = new THREE.Mesh(leafGeometry, rand() > 0.5 ? m.leaf : m.leafDark);
    leaf.scale.set(leafLen * 0.35, leafLen, 0.01);
    leaf.position.set(Math.cos(a) * r, potH + leafLen * 0.6 + rand() * (height - leafLen), Math.sin(a) * r);
    leaf.rotation.set((rand() - 0.5) * 0.9, -a, (rand() - 0.5) * 1.4);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

// Tanaman lantai (pot keramik besar)
export function decorPlant(m) {
  const g = plant(m, random(2024), { potR: 0.16, potH: 0.35, height: 0.75, leafLen: 0.14, count: 22 });
  g.name = 'Tanaman (dekorasi)';
  return g;
}

// Lukisan berbingkai; titik (0,0,0) = tengah bawah bingkai, menempel dinding belakang.
export function decorArtwork(m) {
  const g = new THREE.Group();
  g.name = 'Lukisan (dekorasi)';
  g.add(bevelBox(0.94, 0.64, 0.03, m.oak, 0, 0, 0.015, 0.004));
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.56), m.art);
  canvas.position.set(0, 0.32, 0.031);
  canvas.receiveShadow = true;
  g.add(canvas);
  g.position.set(-0.5, 1.45, -1.5);
  return g;
}

// Laptop, buku, gelas, dan tanaman kecil di atas meja.
// Koordinat lokal: x sepanjang meja (x negatif = sisi lampu meja), z dari dinding ke depan.
export function decorDeskItems(m, { width, depth, top, hutch }) {
  const g = new THREE.Group();
  g.name = 'Dekorasi meja';
  const rand = random(77);

  // Laptop di tengah, layar menghadap ke depan meja
  const laptop = new THREE.Group();
  laptop.position.set(0.05, top, depth - 0.2);
  laptop.add(bevelBox(0.32, 0.014, 0.23, m.aluminium, 0, 0, 0, 0.004));
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.014, -0.115);
  hinge.rotation.x = -0.28;
  hinge.add(bevelBox(0.32, 0.21, 0.007, m.aluminium, 0, 0, 0.0035, 0.003));
  hinge.add(box(0.3, 0.19, 0.001, m.screen, 0, 0.01, 0.0075));
  laptop.add(hinge);
  g.add(laptop);

  if (width >= 0.95) {
    // Tumpukan buku dan tanaman kecil di ujung meja dekat jendela
    for (let i = 0; i < 3; i++) g.add(bevelBox(0.16, 0.03, 0.22 - i * 0.02, m.books[i + 1], width / 2 - 0.3, top + i * 0.03, hutch ? 0.4 : 0.15));
    const small = plant(m, rand, { potR: 0.05, potH: 0.09, height: 0.25, leafLen: 0.07, count: 9, pot: m.terracotta });
    small.position.set(width / 2 - 0.09, top, hutch ? 0.36 : 0.1);
    g.add(small);
  }
  g.add(lathe([[0, 0], [0.038, 0], [0.04, 0.09], [0.036, 0.09], [0.034, 0.006], [0, 0.006]], m.ceramic, Math.min(0.28, width / 2 - 0.08), top, depth - 0.12, 24));
  return g;
}
