import * as THREE from 'three';
import { ROOM, HALF_L, HALF_W } from '../layout.js';
import { centerOf, halfExtents, quarterOf, WALL_ITEMS } from './placement.js';

// =====================================================================
// SERET & LETAKKAN FURNITUR
// - Klik furnitur untuk memilih, seret untuk memindahkan.
// - Furnitur lantai bergeser pada bidang datar sejajar lantai (setinggi titik yang diklik,
//   sehingga benda tetap tepat di bawah kursor). Rak & lukisan bergeser di sepanjang dindingnya.
// - Posisi dibatasi di dalam kamar, menempel ke dinding bila dekat, dan dibulatkan per 1 cm.
// - Saat dilepas: bila bertabrakan/menghalangi, furnitur kembali ke posisi sebelumnya.
// - Kamera tetap bisa diputar/zoom selama tidak sedang menyeret furnitur.
// =====================================================================

const SNAP = 0.06; // jarak (m) untuk menempel ke dinding
const GRID = 0.01; // pembulatan posisi 1 cm

// Klik pada bagian "anak" memilih induknya (mis. klik kasur = pilih tempat tidur)
function movableKey(key) {
  if (!key) return null;
  if (key === 'mattress') return 'bed';
  if (key.startsWith('bedsideLamps:')) return `nightstands:${key.split(':')[1]}`;
  if (key === 'deskLamp' || key === 'deskDecor') return 'desk';
  if (key.startsWith('curtain')) return null;
  return key;
}

export function createArranger({ canvas, camera, controls, scene, furnishing, ui }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  let selected = null; // kunci item yang dipilih
  let drag = null;
  let downAt = null; // posisi kursor saat menekan di area kosong (untuk membatalkan pilihan dengan klik)

  // ---------- Penanda objek terpilih ----------
  const COLORS = { ok: 0x3d9a5b, bad: 0xd0453a };
  const boxHelper = new THREE.Box3Helper(new THREE.Box3(), COLORS.ok);
  boxHelper.visible = false;
  const footprint = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: COLORS.ok, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  footprint.rotation.x = -Math.PI / 2;
  footprint.renderOrder = 2;
  footprint.visible = false;
  scene.add(boxHelper, footprint);

  function showIndicator(item, valid) {
    if (!item) {
      boxHelper.visible = footprint.visible = false;
      return;
    }
    const color = valid ? COLORS.ok : COLORS.bad;
    boxHelper.box.copy(item.box).expandByScalar(0.01);
    boxHelper.material.color.setHex(color);
    boxHelper.visible = true;
    // Jejak di lantai (hanya untuk furnitur lantai)
    footprint.visible = !item.wall;
    if (!item.wall) {
      const size = item.box.getSize(new THREE.Vector3());
      footprint.scale.set(size.x + 0.02, size.z + 0.02, 1);
      footprint.position.set((item.box.min.x + item.box.max.x) / 2, 0.004, (item.box.min.z + item.box.max.z) / 2);
      footprint.material.color.setHex(color);
    }
  }

  // ---------- Pemilihan ----------
  const poseOf = (it) => {
    const [cx, cz] = centerOf(it.position, it.rotY, it.extent.d);
    const pose = { cx, cz, q: quarterOf(it.rotY) };
    if (it.wall) pose.y = it.position[1];
    return pose;
  };

  function select(key) {
    selected = key;
    const it = key ? furnishing.getItem(key) : null;
    if (key && !it) selected = null;
    showIndicator(selected ? it : null, true);
    ui.onSelect(selected ? it : null);
  }

  // ---------- Batas kamar, menempel ke dinding, pembulatan ----------
  function constrain(it, pose) {
    const p = { ...pose };
    // Bulatkan dulu per 1 cm, baru dibatasi ke dalam kamar (agar pembulatan tidak mendorong keluar dinding)
    for (const k of ['cx', 'cz', 'y']) if (p[k] != null) p[k] = Math.round(p[k] / GRID) * GRID;
    if (WALL_ITEMS[it.key] === 'right') {
      // rak: bergeser sepanjang dinding kanan (z) dan naik-turun (y)
      p.cz = THREE.MathUtils.clamp(p.cz, -HALF_W + it.extent.w / 2, HALF_W - it.extent.w / 2);
      p.y = THREE.MathUtils.clamp(p.y, 0.3, ROOM.height - it.extent.h - 0.02);
    } else if (WALL_ITEMS[it.key] === 'back') {
      // lukisan: bergeser sepanjang dinding belakang (x) dan naik-turun (y)
      p.cx = THREE.MathUtils.clamp(p.cx, -HALF_L + it.extent.w / 2, HALF_L - it.extent.w / 2);
      p.y = THREE.MathUtils.clamp(p.y, 0.3, ROOM.height - it.extent.h - 0.02);
    } else {
      const [hx, hz] = halfExtents(it.extent, p.q * (Math.PI / 2));
      const clamp = (v, h, lim) => (h >= lim ? 0 : THREE.MathUtils.clamp(v, -lim + h, lim - h));
      p.cx = clamp(p.cx, hx, HALF_L);
      p.cz = clamp(p.cz, hz, HALF_W);
      // menempel ke dinding bila sudah dekat
      if (p.cx - hx < -HALF_L + SNAP) p.cx = -HALF_L + hx;
      if (p.cx + hx > HALF_L - SNAP) p.cx = HALF_L - hx;
      if (p.cz - hz < -HALF_W + SNAP) p.cz = -HALF_W + hz;
      if (p.cz + hz > HALF_W - SNAP) p.cz = HALF_W - hz;
    }
    return p;
  }

  // ---------- Raycasting ----------
  function setRay(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }

  const visibleChain = (o) => {
    for (let n = o; n; n = n.parent) if (!n.visible) return false;
    return true;
  };

  function pick(e) {
    setRay(e);
    for (const h of raycaster.intersectObjects(furnishing.pickables(), true)) {
      if (!visibleChain(h.object)) continue;
      let n = h.object;
      while (n && !n.userData.itemKey) n = n.parent;
      if (!n) continue;
      if (n.userData.itemKey.startsWith('curtain')) return { key: null, curtain: true };
      const key = movableKey(n.userData.itemKey);
      if (key && furnishing.getItem(key)?.movable) return { key, point: h.point.clone() };
    }
    return null;
  }

  // ---------- Seret ----------
  function onPointerDown(e) {
    if (e.target !== canvas || e.button !== 0 || drag) return;
    const found = pick(e);
    if (!found?.key) {
      downAt = { x: e.clientX, y: e.clientY };
      if (found?.curtain) ui.message('Tirai terpasang di jendela dan tidak bisa dipindahkan.', 'info');
      return;
    }
    const it = furnishing.getItem(found.key);
    select(found.key);
    // Matikan kontrol kamera selama menyeret (dipanggil sebelum OrbitControls menerima klik ini)
    controls.enabled = false;
    const plane = new THREE.Plane();
    if (WALL_ITEMS[found.key] === 'right') plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(1, 0, 0), found.point);
    else if (WALL_ITEMS[found.key] === 'back') plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), found.point);
    else plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), found.point);
    drag = { key: found.key, plane, start: found.point, pose0: poseOf(it), pose: null, valid: true, pointerId: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  }

  function onPointerMove(e) {
    if (!drag) {
      // Kursor tangan saat berada di atas furnitur yang bisa dipindahkan
      if (e.target === canvas && e.buttons === 0) canvas.style.cursor = pick(e)?.key ? 'grab' : '';
      return;
    }
    setRay(e);
    if (!raycaster.ray.intersectPlane(drag.plane, hit)) return;
    const d = hit.clone().sub(drag.start);
    if (!drag.pose && d.length() < 0.005) return;
    const it = furnishing.getItem(drag.key);
    const p = { ...drag.pose0 };
    if (WALL_ITEMS[drag.key] === 'right') {
      p.cz += d.z;
      p.y += d.y;
    } else if (WALL_ITEMS[drag.key] === 'back') {
      p.cx += d.x;
      p.y += d.y;
    } else {
      p.cx += d.x;
      p.cz += d.z;
    }
    drag.pose = constrain(it, p);
    const res = furnishing.preview(drag.key, drag.pose);
    drag.valid = !res.problems.length;
    showIndicator(res.layout.items.find((i) => i.key === drag.key), drag.valid);
    ui.message(drag.valid ? '' : `Posisi tidak valid: ${res.problems[0].text}`, drag.valid ? '' : 'warn');
  }

  function endDrag(cancel = false) {
    if (!drag) return;
    const { key, pose } = drag;
    try {
      canvas.releasePointerCapture(drag.pointerId);
    } catch {
      // penangkapan pointer sudah dilepas oleh browser
    }
    drag = null;
    controls.enabled = true;
    canvas.style.cursor = '';
    if (!pose) return; // hanya klik (memilih), tidak digeser
    if (cancel) {
      furnishing.restorePoses();
      ui.message('Pemindahan dibatalkan.', 'info');
    } else {
      const res = furnishing.commitMove(key, pose);
      if (res.ok) ui.message(`${furnishing.getItem(key).label} dipindahkan.`, 'ok');
      else ui.message(`Posisi tidak valid (${res.problems.map((p) => p.text).join(' ')}). Furnitur dikembalikan ke posisi sebelumnya.`, 'warn');
    }
    select(key);
  }

  function onPointerUp(e) {
    if (drag) {
      endDrag();
      return;
    }
    // Klik (tanpa menggeser kamera) di area kosong = batal memilih
    if (downAt && e.target === canvas && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4) select(null);
    downAt = null;
  }

  // ---------- Putar 90° ----------
  function rotate() {
    const it = selected && furnishing.getItem(selected);
    if (!it || it.wall) return;
    const pose = poseOf(it);
    const next = constrain(it, { ...pose, q: (pose.q + 1) % 4 });
    const res = furnishing.commitMove(selected, next);
    if (res.ok) ui.message(`${it.label} diputar 90°.`, 'ok');
    else ui.message(`Tidak bisa diputar di sini (${res.problems.map((p) => p.text).join(' ')}). Geser dulu ke tempat yang lebih lapang.`, 'warn');
    select(selected);
  }

  // Tangkap klik lebih dulu (fase capture) agar kamera tidak ikut berputar saat menyeret furnitur
  window.addEventListener('pointerdown', onPointerDown, { capture: true });
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', () => endDrag(true));
  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, select, textarea')) return;
    if (e.key === 'Escape') {
      if (drag) endDrag(true);
      else select(null);
    }
    if ((e.key === 'r' || e.key === 'R') && !drag) rotate();
  });

  // Pilihan tetap sinkron saat produk diganti/dihapus
  furnishing.onChange(() => {
    if (!drag) select(selected);
  });

  return { rotate, deselect: () => select(null), get selected() { return selected; } };
}
