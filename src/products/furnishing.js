import * as THREE from 'three';
import { buildProductModel, deskTopHeight } from './builders.js';
import { computeLayout, newProblems, SLOTS, WINDOW_INFO } from './placement.js';
import { getProduct, PRODUCTS } from './catalog.js';
import { createFinishLibrary } from '../materials.js';
import { decorPlant, decorArtwork, decorDeskItems } from '../furniture.js';

// Mengelola produk yang ditempatkan di kamar: membangun model 3D, lampu, dekorasi,
// posisi buatan pengguna (seret & putar), menolak perubahan yang tidak muat,
// dan menyimpan pilihan (alamat URL + localStorage).

const STORAGE_KEY = 'desain-kamar-pilihan-v1';
const SAVED_LAYOUT_KEY = 'desain-kamar-tata-letak-tersimpan';

// Posisi buatan pengguna disimpan di alamat sebagai "o.<kunci>=cx,cz,q[,y]"
const encodePose = (p) => [p.cx, p.cz, p.q, p.y].filter((v) => v != null).map((v) => +v.toFixed(4)).join(',');
function decodePose(text) {
  const [cx, cz, q, y] = text.split(',').map(Number);
  if (![cx, cz, q].every(Number.isFinite)) return null;
  return Number.isFinite(y) ? { cx, cz, q, y } : { cx, cz, q };
}

export function createFurnishing({ parent, materials, room }) {
  const fin = createFinishLibrary(materials);
  const ctx = { m: materials, fin };
  const root = new THREE.Group();
  root.name = 'Furnitur';
  parent.add(root);
  const decor = new THREE.Group();
  decor.name = 'Dekorasi';
  parent.add(decor);
  // Benda yang menempel di dinding ikut grup dinding itu,
  // sehingga ikut disembunyikan saat kamera melihat dari luar dinding tersebut.
  const onRightWall = new THREE.Group();
  onRightWall.name = 'Furnitur di dinding kanan';
  room.extras.right.add(onRightWall);
  const onBackWall = new THREE.Group();
  onBackWall.name = 'Dekorasi di dinding belakang';
  room.extras.back.add(onBackWall);

  let selection = {};
  let quantities = {};
  let overrides = {};
  let layout = { items: [], problems: [] };
  let lights = [];
  const models = new Map(); // kunci item -> model 3D
  const listeners = new Set();

  const compute = (sel = selection, ov = overrides) => computeLayout(sel, getProduct, ov);

  function emit() {
    for (const fn of listeners) fn();
  }

  // Menyamakan posisi model 3D dengan hasil perhitungan tata letak (tanpa membangun ulang model)
  function applyPoses(lay) {
    for (const it of lay.items) {
      const model = models.get(it.key);
      if (!model) continue;
      model.position.set(...it.position);
      model.rotation.y = it.rotY;
      model.visible = !it.hidden;
    }
    const desk = lay.items.find((it) => it.slot === 'desk');
    const deskDecor = models.get('deskDecor');
    if (desk && deskDecor) {
      deskDecor.position.set(...desk.position);
      deskDecor.rotation.y = desk.rotY;
    }
  }

  function rebuild() {
    for (const g of [root, decor, onRightWall, onBackWall]) g.clear();
    models.clear();
    lights = [];
    layout = compute();
    for (const it of layout.items) {
      if (it.boxOnly) continue;
      let model;
      if (it.slot === 'art') {
        model = decorArtwork(materials);
        onBackWall.add(model);
      } else if (it.slot === 'plant') {
        // model tanaman berpusat di tengah pot; digeser agar titik asalnya di sisi belakang seperti produk lain
        model = new THREE.Group();
        const plant = decorPlant(materials);
        plant.position.z = it.extent.d / 2;
        model.add(plant);
        decor.add(model);
      } else {
        const p = it.slot === 'rug' ? { ...it.product, size: { ...it.product.size, w: it.rugSize.w * 100, d: it.rugSize.d * 100 } } : it.product;
        model = buildProductModel(p, ctx, WINDOW_INFO);
        lights.push(...model.userData.lights);
        (it.slot === 'curtain' || it.slot === 'shelf' ? onRightWall : root).add(model);
      }
      model.userData.itemKey = it.key;
      models.set(it.key, model);
    }

    // Laptop & buku di meja (menyesuaikan ukuran meja, ikut posisi meja)
    const desk = layout.items.find((it) => it.slot === 'desk');
    if (desk) {
      const top = deskTopHeight(desk.product);
      const items = decorDeskItems(materials, { width: desk.extent.w, depth: desk.extent.d, top, hutch: desk.extent.h > top + 0.1 });
      items.userData.itemKey = 'deskDecor';
      decor.add(items);
      models.set('deskDecor', items);
    }
    applyPoses(layout);
    saveSelection();
    emit();
  }

  // ---------- Mengganti produk ----------
  // Mencoba mengubah satu slot (dan slot tambahan di "also", mis. kasur yang ikut diganti).
  function trySet(slotId, productId, also = {}) {
    const before = compute();
    const next = { ...selection };
    const nextOv = { ...overrides };
    for (const [s, id] of Object.entries({ [slotId]: productId, ...also })) {
      if (id) next[s] = id;
      else {
        delete next[s];
        for (const k of Object.keys(nextOv)) if (k === s || k.startsWith(`${s}:`)) delete nextOv[k];
      }
    }
    const after = compute(next, nextOv);
    const fresh = newProblems(before, after);
    if (fresh.length) {
      return { ok: false, problems: fresh, suggestions: productId ? suggest(slotId, productId) : [] };
    }
    selection = next;
    overrides = nextOv;
    rebuild();
    return { ok: true, problems: after.problems.filter((p) => p.slots.includes(slotId)) };
  }

  // Produk lain di kategori yang sama yang muat tanpa masalah baru (diurutkan dari yang paling mirip ukurannya).
  function suggest(slotId, productId) {
    const slot = SLOTS.find((s) => s.id === slotId);
    const target = getProduct(productId);
    const before = compute();
    const area = (p) => p.size.w * (p.size.d ?? 1);
    return PRODUCTS.filter((p) => p.category === slot.category && p.id !== productId && p.id !== selection[slotId])
      .filter((p) => !newProblems(before, compute({ ...selection, [slotId]: p.id })).length)
      .sort((a, b) => Math.abs(area(a) - area(target)) - Math.abs(area(b) - area(target)))
      .slice(0, 4);
  }

  // Kasur yang ukurannya cocok dengan rangka baru dan muat bila diganti bersamaan.
  function mattressOptionsFor(bedId) {
    const bed = getProduct(bedId);
    const need = bed?.model.mattress;
    if (!need || !selection.mattress) return [];
    const before = compute();
    return PRODUCTS.filter((p) => p.category === 'mattress' && p.size.w === need[0] && p.size.d === need[1])
      .filter((p) => !newProblems(before, compute({ ...selection, bed: bedId, mattress: p.id })).length)
      .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
      .slice(0, 3);
  }

  // ---------- Memindahkan & memutar ----------
  // Pratinjau selama menyeret: model digeser langsung, hasil pemeriksaan dikembalikan.
  function preview(key, pose) {
    const lay = compute(selection, { ...overrides, [key]: pose });
    applyPoses(lay);
    return { layout: lay, problems: newProblems(layout, lay) };
  }

  // Menyimpan posisi baru bila valid; bila tidak, model dikembalikan ke posisi sebelumnya.
  function commitMove(key, pose) {
    const lay = compute(selection, { ...overrides, [key]: pose });
    const fresh = newProblems(layout, lay);
    if (fresh.length) {
      applyPoses(layout);
      return { ok: false, problems: fresh };
    }
    overrides = { ...overrides, [key]: pose };
    layout = lay;
    applyPoses(layout);
    saveSelection();
    emit();
    return { ok: true };
  }

  // Membatalkan pratinjau (mis. tombol Esc saat menyeret)
  const restorePoses = () => applyPoses(layout);

  // Kembali ke posisi bawaan semua furnitur (produk yang dipilih tetap)
  function resetPositions() {
    overrides = {};
    rebuild();
  }

  // ---------- Simpan / muat tata letak ----------
  function saveLayout() {
    const snapshot = { selection, quantities, overrides, savedAt: new Date().toISOString() };
    try {
      localStorage.setItem(SAVED_LAYOUT_KEY, JSON.stringify(snapshot));
      return { ok: true, savedAt: snapshot.savedAt };
    } catch {
      return { ok: false };
    }
  }

  function loadLayout() {
    let snapshot;
    try {
      snapshot = JSON.parse(localStorage.getItem(SAVED_LAYOUT_KEY) ?? 'null');
    } catch {
      snapshot = null;
    }
    if (!snapshot) return { ok: false, reason: 'Belum ada tata letak yang disimpan di browser ini.' };
    const sel = Object.fromEntries(Object.entries(snapshot.selection ?? {}).filter(([k, v]) => SLOTS.some((s) => s.id === k) && getProduct(v)));
    selection = sel;
    quantities = snapshot.quantities ?? {};
    overrides = snapshot.overrides ?? {};
    rebuild();
    return { ok: true, savedAt: snapshot.savedAt, problems: layout.problems.filter((p) => p.severity === 'error') };
  }

  // ---------- Daftar belanja ----------
  function setQuantity(productId, qty) {
    quantities[productId] = Math.max(0, Math.round(qty));
    saveSelection();
    emit();
  }

  // Jumlah bawaan = jumlah unit yang ditempatkan (mis. meja samping = 2)
  function shoppingList() {
    const rows = new Map();
    for (const slot of SLOTS) {
      const id = selection[slot.id];
      if (!id) continue;
      const row = rows.get(id) ?? { product: getProduct(id), placed: 0, slots: [] };
      row.placed += slot.qty;
      row.slots.push(slot.label);
      rows.set(id, row);
    }
    return [...rows.values()].map((r) => {
      const qty = quantities[r.product.id] ?? r.placed;
      return { ...r, qty, subtotal: r.product.price == null ? null : r.product.price * qty };
    });
  }

  // ---------- Penyimpanan otomatis di alamat URL ----------
  function saveSelection() {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(selection)) params.set(k, v);
    for (const [k, v] of Object.entries(quantities)) params.set(`q.${k}`, String(v));
    for (const [k, v] of Object.entries(overrides)) params.set(`o.${k}`, encodePose(v));
    const hash = params.toString();
    history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
    try {
      localStorage.setItem(STORAGE_KEY, hash);
    } catch {
      // penyimpanan browser tidak tersedia (mis. mode privat) — pilihan tetap ada di alamat URL
    }
  }

  function loadSelection(defaults) {
    let hash = location.hash.slice(1);
    if (!hash) {
      try {
        hash = localStorage.getItem(STORAGE_KEY) ?? '';
      } catch {
        hash = '';
      }
    }
    const params = new URLSearchParams(hash);
    const sel = {};
    const qty = {};
    const ov = {};
    for (const [k, v] of params) {
      if (k.startsWith('q.')) qty[k.slice(2)] = Number(v);
      else if (k.startsWith('o.')) {
        const pose = decodePose(v);
        if (pose) ov[k.slice(2)] = pose;
      } else if (SLOTS.some((s) => s.id === k) && getProduct(v)) sel[k] = v;
    }
    selection = Object.keys(sel).length ? sel : { ...defaults };
    quantities = qty;
    overrides = ov;
    rebuild();
  }

  function reset(defaults) {
    selection = { ...defaults };
    quantities = {};
    overrides = {};
    rebuild();
  }

  return {
    root,
    trySet,
    suggest,
    mattressOptionsFor,
    preview,
    commitMove,
    restorePoses,
    resetPositions,
    saveLayout,
    loadLayout,
    setQuantity,
    shoppingList,
    loadSelection,
    reset,
    onChange: (fn) => listeners.add(fn),
    getItem: (key) => layout.items.find((it) => it.key === key) ?? null,
    pickables: () => [root, onRightWall, onBackWall, decor],
    get selection() {
      return selection;
    },
    get overrides() {
      return overrides;
    },
    get layout() {
      return layout;
    },
    get lights() {
      return lights;
    },
    buildPreview: (p) => buildProductModel(p, ctx, WINDOW_INFO),
  };
}
