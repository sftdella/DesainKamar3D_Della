import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Membuat koordinat tekstur (UV) dalam satuan meter berdasarkan arah permukaan,
// sehingga tekstur kayu/kain tidak melar pada objek yang besar.
export function boxUV(geometry) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let u;
    let v;
    if (ax >= ay && ax >= az) {
      u = pos.getZ(i);
      v = pos.getY(i);
    } else if (ay >= az) {
      u = pos.getX(i);
      v = pos.getZ(i);
    } else {
      u = pos.getX(i);
      v = pos.getY(i);
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

function withShadows(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Kotak bersudut tajam. w = lebar (x), h = tinggi (y), d = dalam (z).
// (x, y, z) = titik tengah bagian BAWAH kotak.
export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = withShadows(new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, h, d)), material));
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}

// Kotak bersudut bulat (untuk kasur, kain pelapis).
export function roundBox(w, h, d, radius, material, x = 0, y = 0, z = 0, segments = 3) {
  const mesh = withShadows(new THREE.Mesh(boxUV(new RoundedBoxGeometry(w, h, d, segments, radius)), material));
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}

// Kotak dengan tepi sedikit membulat (3 mm), seperti papan furnitur sungguhan.
// Tepi yang membulat menangkap pantulan cahaya sehingga tidak terlihat seperti balok polos.
export function bevelBox(w, h, d, material, x = 0, y = 0, z = 0, radius = 0.003) {
  return roundBox(w, h, d, radius, material, x, y, z, 1);
}

// Bentuk bantal: dua permukaan menggembung yang bertemu di jahitan tepi,
// dengan sudut sedikit "bertelinga" seperti bantal sungguhan.
// w = lebar (x), d = panjang (z), h = ketebalan (y). Titik tengah di (0,0,0).
// pinch = seberapa dalam bagian tengah tepi menyempit (0 = tepi lurus).
export function pillowGeometry(w, d, h, segments = 24, pinch = 0.06) {
  const parts = [];
  for (const side of [1, -1]) {
    const g = new THREE.PlaneGeometry(1, 1, segments, segments);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) * 2;
      const v = pos.getY(i) * 2;
      const bulge = Math.sqrt(Math.max(0, 1 - u ** 4)) * Math.sqrt(Math.max(0, 1 - v ** 4));
      const x = (u * w) / 2 * (1 - pinch * (1 - v * v));
      const z = (v * d) / 2 * (1 - pinch * (1 - u * u));
      pos.setXYZ(i, x, (side * h) / 2 * bulge, z);
      uv.setXY(i, x, z);
    }
    if (side === 1) {
      // Membalik urutan segitiga agar permukaan atas menghadap ke atas
      const idx = g.index.array;
      for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    }
    parts.push(g);
  }
  const geometry = mergeGeometries(parts);
  geometry.computeVertexNormals();
  return geometry;
}

// Kain yang menjuntai (selimut, throw blanket): menutup permukaan datar selebar 2 x halfWidth
// sepanjang "length", lalu melengkung dan menjuntai sejauh "drop" di kedua sisi (dan di ujung kaki).
// Permukaan atas diberi gembungan (puff) dan kerutan halus, bagian menjuntai diberi lipatan.
export function drapeGeometry({ halfWidth, length, drop, radius = 0.035, foot = true, puff = 0.03, seed = 1 }) {
  const arc = (Math.PI / 2) * radius;
  const U = halfWidth + arc + drop;
  const V = length + (foot ? arc + drop : 0);
  const geometry = new THREE.PlaneGeometry(2 * U, V, 96, 80);
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const rand = random(seed);
  const waves = Array.from({ length: 4 }, () => ({ k: 6 + rand() * 14, k2: 4 + rand() * 10, p: rand() * 6.28, a: 0.4 + rand() * 0.6 }));

  // s = jarak dari tengah sepanjang kain -> posisi horizontal, turun vertikal, dan seberapa jauh menjuntai (0..1)
  const fold = (s, half) => {
    const a = Math.abs(s);
    const sign = Math.sign(s) || 1;
    if (a <= half) return [s, 0, 0];
    const d = a - half;
    const hang = d / (arc + drop);
    if (d <= arc) {
      const th = d / radius;
      return [sign * (half + radius * Math.sin(th)), -(radius - radius * Math.cos(th)), hang];
    }
    return [sign * (half + radius), -(radius + d - arc), hang];
  };

  for (let i = 0; i < pos.count; i++) {
    const s = pos.getX(i);
    const t = V / 2 - pos.getY(i); // 0 = ujung kepala
    let [x, dyx, hx] = fold(s, halfWidth);
    let z = t;
    let dyz = 0;
    let hz = 0;
    if (foot && t > length) {
      const [zz, dy, h] = fold(t - length, 0);
      z = length + zz;
      dyz = dy;
      hz = h;
    }
    let y = Math.max(dyx + dyz, -(radius + drop));

    // Gembungan di permukaan atas, mengecil ke arah tepi
    const edgeX = Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(s) / halfWidth), 4));
    const edgeZ = foot ? Math.max(0, 1 - Math.pow(Math.max(0, t - length + 0.2) / 0.2, 2)) : 1;
    let wrinkle = 0;
    for (const w of waves) wrinkle += w.a * Math.sin(s * w.k + w.p) * Math.sin(t * w.k2 + w.p * 1.7);
    y += puff * edgeX * edgeZ + 0.003 * wrinkle * edgeX;

    // Lipatan vertikal pada bagian yang menjuntai (makin ke bawah makin jelas)
    if (hx > 0) x += Math.sign(s) * 0.012 * hx * (0.5 + 0.5 * Math.sin(t * 9 + waves[0].p) * Math.sin(t * 3.3 + waves[1].p));
    if (hz > 0) z += 0.012 * hz * (0.5 + 0.5 * Math.sin(s * 9 + waves[2].p) * Math.sin(s * 3.1 + waves[3].p));

    pos.setXYZ(i, x, y, z);
    uv.setXY(i, s, t);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Benda bulat hasil putaran profil (vas, dudukan lampu). points = [[jari-jari, tinggi], ...]
export function lathe(points, material, x = 0, y = 0, z = 0, segments = 40) {
  const geometry = boxUV(new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), segments));
  const mesh = withShadows(new THREE.Mesh(geometry, material));
  mesh.position.set(x, y, z);
  return mesh;
}

// Silinder tegak. (x, y, z) = titik tengah alas.
export function cylinder(rTop, rBottom, h, material, x = 0, y = 0, z = 0, { open = false, segments = 32 } = {}) {
  const geometry = boxUV(new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1, open));
  const mesh = withShadows(new THREE.Mesh(geometry, material));
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}

// Bola. (x, y, z) = titik pusat.
export function sphere(r, material, x = 0, y = 0, z = 0) {
  const mesh = withShadows(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), material));
  mesh.position.set(x, y, z);
  return mesh;
}

// Angka acak yang selalu sama setiap kali dijalankan (agar desain tidak berubah-ubah).
export function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
