import * as THREE from 'three';
import { ROOM, HALF_L, HALF_W, DOOR, WINDOW } from './layout.js';
import { box, bevelBox, cylinder, boxUV } from './helpers.js';

const T = ROOM.wallThickness;
const H = ROOM.height;

// Dinding sebagai bidang 2D yang ditebalkan. Pintu = coakan di bawah, jendela = lubang.
// u = posisi sepanjang dinding, v = tinggi.
function wallGeometry(length, height, thickness, { door, window } = {}) {
  const L = length / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-L, 0);
  if (door) {
    const a = door.u - door.width / 2;
    const b = door.u + door.width / 2;
    shape.lineTo(a, 0);
    shape.lineTo(a, door.height);
    shape.lineTo(b, door.height);
    shape.lineTo(b, 0);
  }
  shape.lineTo(L, 0);
  shape.lineTo(L, height);
  shape.lineTo(-L, height);
  shape.lineTo(-L, 0);

  if (window) {
    const a = window.u - window.width / 2;
    const b = window.u + window.width / 2;
    const hole = new THREE.Path();
    hole.moveTo(a, window.sill);
    hole.lineTo(b, window.sill);
    hole.lineTo(b, window.sill + window.height);
    hole.lineTo(a, window.sill + window.height);
    hole.lineTo(a, window.sill);
    shape.holes.push(hole);
  }
  return boxUV(new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }));
}

function buildDoor(m, group) {
  const a = DOOR.centerX - DOOR.width / 2;
  const b = DOOR.centerX + DOOR.width / 2;
  const zMid = HALF_W + T / 2;
  const lining = 0.02;
  const trimW = 0.07;
  const trimT = 0.015;

  // Kusen di dalam lubang pintu
  group.add(box(lining, DOOR.height, T, m.trim, a + lining / 2, 0, zMid));
  group.add(box(lining, DOOR.height, T, m.trim, b - lining / 2, 0, zMid));
  group.add(box(DOOR.width, lining, T, m.trim, DOOR.centerX, DOOR.height - lining, zMid));

  // Lis pintu di sisi dalam dan luar
  const sideH = DOOR.height - lining + trimW;
  for (const z of [HALF_W - trimT / 2, HALF_W + T + trimT / 2]) {
    group.add(box(trimW, sideH, trimT, m.trim, a + lining - trimW / 2, 0, z));
    group.add(box(trimW, sideH, trimT, m.trim, b - lining + trimW / 2, 0, z));
    group.add(box(DOOR.width - 2 * lining + 2 * trimW, trimW, trimT, m.trim, DOOR.centerX, DOOR.height - lining, z));
  }

  // Daun pintu kayu walnut
  const leafW = DOOR.width - 2 * lining - 0.006;
  const leafH = DOOR.height - lining - 0.012;
  const leafT = 0.04;
  group.add(bevelBox(leafW, leafH, leafT, m.walnut, DOOR.centerX, 0.008, zMid, 0.004));

  for (const side of [-1, 1]) {
    const face = zMid + side * (leafT / 2);
    // Alur dekoratif horizontal
    for (const y of [0.7, 1.4]) {
      group.add(box(leafW - 0.16, 0.006, 0.0015, m.groove, DOOR.centerX, y, face + side * 0.0008));
    }
    // Gagang pintu tipe tuas (engsel di sisi kiri, gagang di sisi kanan)
    const hx = b - lining - 0.07;
    const rose = cylinder(0.026, 0.026, 0.012, m.metalBlack);
    rose.rotation.x = Math.PI / 2;
    rose.position.set(hx, 1.0, face + side * 0.006);
    const neck = cylinder(0.009, 0.009, 0.05, m.metalBlack);
    neck.rotation.x = Math.PI / 2;
    neck.position.set(hx, 1.0, face + side * 0.035);
    const lever = box(0.13, 0.016, 0.018, m.metalBlack, hx - 0.055, 1.0 - 0.008, face + side * 0.06);
    group.add(rose, neck, lever);
  }
}

function buildWindow(m, group) {
  const W = WINDOW.width;
  const Hh = WINDOW.height;
  const zc = WINDOW.centerZ;
  const z0 = zc - W / 2;
  const z1 = zc + W / 2;
  const y0 = WINDOW.sill;
  const y1 = WINDOW.sill + Hh;
  const xc = HALF_L + T / 2;
  const f = 0.05; // lebar profil kusen
  const fd = 0.07; // tebal kusen

  // Kusen aluminium hitam
  group.add(box(fd, f, W, m.frame, xc, y0, zc));
  group.add(box(fd, f, W, m.frame, xc, y1 - f, zc));
  group.add(box(fd, Hh - 2 * f, f, m.frame, xc, y0 + f, z0 + f / 2));
  group.add(box(fd, Hh - 2 * f, f, m.frame, xc, y0 + f, z1 - f / 2));
  group.add(box(fd, Hh - 2 * f, 0.04, m.frame, xc, y0 + f, zc));

  // Dua panel kaca
  const paneW = (W - 2 * f - 0.04) / 2;
  for (const s of [-1, 1]) {
    const pane = box(0.008, Hh - 2 * f, paneW, m.glass, xc, y0 + f, zc + s * (0.02 + paneW / 2));
    pane.castShadow = false;
    pane.receiveShadow = false;
    group.add(pane);
  }

  // Ambang jendela dalam & luar
  const sillIn = HALF_L - 0.035;
  const sillOut = xc - fd / 2;
  group.add(box(sillOut - sillIn, 0.025, W, m.trim, (sillIn + sillOut) / 2, y0 - 0.025, zc));
  group.add(box(0.06, 0.03, W + 0.06, m.trim, HALF_L + T + 0.02, y0 - 0.03, zc));
  // Tirai & relnya sekarang berasal dari katalog produk (src/products/).
}

export function buildRoom(m) {
  const root = new THREE.Group();
  root.name = 'Ruangan';

  // Setiap dinding punya grup "detail" (pintu, jendela, lis, dll.)
  // yang ikut disembunyikan ketika kamera berada di luar dinding tersebut.
  const walls = [];
  const extras = {};
  function addSurface(key, name, mesh, normal, point) {
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.name = `${name} - detail`;
    root.add(mesh, group);
    walls.push({
      mesh,
      material: mesh.material,
      extras: group,
      normal: new THREE.Vector3(...normal),
      point: new THREE.Vector3(...point),
    });
    extras[key] = group;
  }

  const back = new THREE.Mesh(wallGeometry(ROOM.length + 2 * T, H, T), m.wall);
  back.position.set(0, 0, -HALF_W - T);
  addSurface('back', 'Dinding belakang', back, [0, 0, -1], [0, 0, -HALF_W]);

  const front = new THREE.Mesh(
    wallGeometry(ROOM.length + 2 * T, H, T, { door: { u: DOOR.centerX, width: DOOR.width, height: DOOR.height } }),
    m.wall,
  );
  front.position.set(0, 0, HALF_W);
  addSurface('front', 'Dinding depan', front, [0, 0, 1], [0, 0, HALF_W]);

  const right = new THREE.Mesh(
    wallGeometry(ROOM.width, H, T, {
      window: { u: WINDOW.centerZ, width: WINDOW.width, height: WINDOW.height, sill: WINDOW.sill },
    }),
    m.wall,
  );
  right.rotation.y = -Math.PI / 2;
  right.position.set(HALF_L + T, 0, 0);
  addSurface('right', 'Dinding kanan', right, [1, 0, 0], [HALF_L, 0, 0]);

  const left = new THREE.Mesh(wallGeometry(ROOM.width, H, T), m.wall);
  left.rotation.y = -Math.PI / 2;
  left.position.set(-HALF_L, 0, 0);
  addSurface('left', 'Dinding kiri', left, [-1, 0, 0], [-HALF_L, 0, 0]);

  const ceiling = box(ROOM.length + 2 * T, 0.1, ROOM.width + 2 * T, m.ceiling, 0, H, 0);
  addSurface('ceiling', 'Plafon', ceiling, [0, 1, 0], [0, H, 0]);

  // Lantai kayu
  const floor = box(ROOM.length, 0.05, ROOM.width, m.floor, 0, -0.05, 0);
  floor.name = 'Lantai kayu';
  floor.castShadow = false;
  root.add(floor);

  // Lis bawah (plint) di sepanjang dinding
  const sk = 0.08;
  const st = 0.012;
  extras.back.add(box(ROOM.length, sk, st, m.trim, 0, 0, -HALF_W + st / 2));
  extras.left.add(box(st, sk, ROOM.width, m.trim, -HALF_L + st / 2, 0, 0));
  extras.right.add(box(st, sk, ROOM.width, m.trim, HALF_L - st / 2, 0, 0));
  const doorL = DOOR.centerX - DOOR.width / 2 - 0.05;
  const doorR = DOOR.centerX + DOOR.width / 2 + 0.05;
  extras.front.add(box(doorL + HALF_L, sk, st, m.trim, (doorL - HALF_L) / 2, 0, HALF_W - st / 2));
  extras.front.add(box(HALF_L - doorR, sk, st, m.trim, (doorR + HALF_L) / 2, 0, HALF_W - st / 2));

  buildDoor(m, extras.front);
  buildWindow(m, extras.right);

  // Lampu utama di plafon
  const fixture = cylinder(0.26, 0.26, 0.05, m.glow, 0, H - 0.05, 0, { segments: 48 });
  fixture.castShadow = false;
  const ring = cylinder(0.27, 0.27, 0.012, m.brass, 0, H - 0.012, 0, { segments: 48 });
  extras.ceiling.add(fixture, ring);

  const ceilingLight = new THREE.PointLight('#ffe2bf', 0, 0, 2);
  ceilingLight.name = 'Lampu plafon';
  ceilingLight.position.set(0, H - 0.22, 0);
  ceilingLight.castShadow = true;
  ceilingLight.shadow.mapSize.set(1024, 1024);
  ceilingLight.shadow.bias = -0.003;
  ceilingLight.shadow.radius = 3;
  ceilingLight.userData = { day: 0, night: 12 };
  root.add(ceilingLight);

  // Pemeriksaan area buka pintu dan tabrakan furnitur ada di src/products/placement.js
  return { root, walls, extras, lights: [ceilingLight] };
}
