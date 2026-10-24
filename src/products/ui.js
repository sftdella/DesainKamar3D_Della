import * as THREE from 'three';
import { PRODUCTS, CATALOG, STORES, CATEGORY_LABELS, VERIFICATION_LABELS, formatPrice, sizeText, filterProducts, getProduct } from './catalog.js';
import { SLOTS, slotById, measureDistances, DEFAULT_SELECTION } from './placement.js';
import { ROOM } from '../layout.js';

// Panel katalog, "Di kamar", dan daftar belanja.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slotsFor = (p) => SLOTS.filter((s) => s.category === p.category);
const cmText = (m) => `${Math.round(m * 100)} cm`;
// Gambar kosong sementara selama gambar kecil model 3D sedang dibuat
const PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%224%22 height=%223%22/%3E';

// ---------------------------------------------------------------------
// Gambar kecil produk: hasil render model 3D pendekatan (bukan foto resmi)
// ---------------------------------------------------------------------
function createThumbnailer(renderer, environment, buildPreview) {
  const W = 240;
  const H = 180;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f1ece4');
  scene.environment = environment;
  scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight('#ffffff', '#b8a68e', 1.2));
  const sun = new THREE.DirectionalLight('#fff3e2', 2.2);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.01, 50);
  const target = new THREE.WebGLRenderTarget(W * 2, H * 2);
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const pixels = new Uint8Array(W * 2 * H * 2 * 4);
  const big = document.createElement('canvas');
  big.width = W * 2;
  big.height = H * 2;
  const small = document.createElement('canvas');
  small.width = W;
  small.height = H;
  const cache = new Map();
  const queue = new Map(); // productId -> { p, imgs: Set<img> }
  let busy = false;

  function render(p) {
    const model = buildPreview(p);
    scene.add(model);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.08);
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.95;
    camera.position.copy(center).add(new THREE.Vector3(0.75, 0.55, 1).normalize().multiplyScalar(dist));
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, W * 2, H * 2, pixels);
    renderer.setRenderTarget(null);
    scene.remove(model);
    model.traverse((o) => o.geometry?.dispose());
    // Gambar dari GPU tersimpan terbalik (bawah ke atas)
    const img = new ImageData(W * 2, H * 2);
    const row = W * 2 * 4;
    for (let y = 0; y < H * 2; y++) img.data.set(pixels.subarray((H * 2 - 1 - y) * row, (H * 2 - y) * row), y * row);
    big.getContext('2d').putImageData(img, 0, 0);
    const ctx = small.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(big, 0, 0, W, H);
    return small.toDataURL('image/png');
  }

  // Satu gambar dibuat per jeda, agar tampilan 3D utama tetap lancar
  function pump() {
    if (busy || !queue.size) return;
    busy = true;
    const [id, job] = queue.entries().next().value;
    queue.delete(id);
    setTimeout(() => {
      try {
        cache.set(id, render(job.p));
        for (const img of job.imgs) if (img.isConnected) img.src = cache.get(id);
      } catch (e) {
        console.warn('Gagal membuat gambar kecil', id, e);
      }
      busy = false;
      pump();
    }, 30);
  }

  // Gambar hanya dibuat untuk kartu yang terlihat di layar
  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      observer.unobserve(e.target);
      const p = e.target._product;
      if (cache.has(p.id)) {
        e.target.src = cache.get(p.id);
        continue;
      }
      const job = queue.get(p.id) ?? { p, imgs: new Set() };
      job.imgs.add(e.target);
      queue.set(p.id, job);
    }
    pump();
  });

  return {
    request(p, img) {
      if (cache.has(p.id)) {
        img.src = cache.get(p.id);
        return;
      }
      img._product = p;
      observer.observe(img);
    },
    // Dipanggil sebelum daftar kartu dibuat ulang
    reset() {
      observer.disconnect();
      queue.clear();
    },
  };
}

export function createShopUI({ furnishing, renderer, environment, onFocusSlot }) {
  const el = (id) => document.getElementById(id);
  const panel = el('shop');
  const thumbs = createThumbnailer(renderer, environment, furnishing.buildPreview);
  const DEFAULTS = DEFAULT_SELECTION;
  const state = { store: 'all', category: 'all', query: '', verifiedOnly: false };

  // ---------- Tab ----------
  function showTab(name) {
    panel.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    panel.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== name));
  }
  panel.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ---------- Filter ----------
  const storeChips = el('storeChips');
  for (const s of ['all', ...STORES]) {
    const b = document.createElement('button');
    b.className = 'chip' + (s === 'all' ? ' active' : '');
    b.textContent = s === 'all' ? 'Semua toko' : s;
    b.dataset.store = s;
    b.addEventListener('click', () => {
      state.store = s;
      storeChips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === b));
      renderCatalog();
    });
    storeChips.appendChild(b);
  }
  const catSelect = el('catFilter');
  catSelect.add(new Option('Semua kategori', 'all'));
  for (const [k, v] of Object.entries(CATEGORY_LABELS)) catSelect.add(new Option(v, k));
  catSelect.addEventListener('change', () => {
    state.category = catSelect.value;
    renderCatalog();
  });
  el('searchBox').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderCatalog();
  });
  el('verifiedOnly').addEventListener('change', (e) => {
    state.verifiedOnly = e.target.checked;
    renderCatalog();
  });

  function filterTo(category) {
    state.category = category;
    catSelect.value = category;
    showTab('catalog');
    renderCatalog();
    el('cards').scrollTop = 0;
  }

  // ---------- Pemberitahuan ----------
  const notice = el('notice');
  function showNotice(html, kind = 'warn') {
    notice.className = `notice ${kind}`;
    notice.innerHTML = `${html}<button class="close" aria-label="Tutup">×</button>`;
    notice.hidden = false;
    notice.querySelector('.close').addEventListener('click', () => (notice.hidden = true));
    notice.querySelectorAll('[data-use]').forEach((b) =>
      b.addEventListener('click', () => place(b.dataset.slot, b.dataset.use, b.dataset.mattress ? { mattress: b.dataset.mattress } : {})),
    );
  }

  function place(slotId, productId, also = {}) {
    const p = productId ? getProduct(productId) : null;
    const res = furnishing.trySet(slotId, productId, also);
    if (!res.ok) {
      // Rangka baru butuh ukuran kasur lain: tawarkan mengganti rangka + kasur sekaligus
      const combos = slotId === 'bed' && productId ? furnishing.mattressOptionsFor(productId) : [];
      const comboHtml = combos.length
        ? `<p>Rangka ini butuh kasur ${p.model.mattress.join('×')} cm. Ganti rangka dan kasur sekaligus:</p><ul class="suggest">${combos
            .map(
              (mt) => `<li><span><strong>${esc(mt.store)}</strong> ${esc(mt.name)}<br><small>${esc(sizeText(mt))} · ${esc(formatPrice(mt.price))}</small></span>
              <button data-slot="bed" data-use="${productId}" data-mattress="${mt.id}">Pakai keduanya</button></li>`,
            )
            .join('')}</ul>`
        : '';
      const sug = res.suggestions
        .map(
          (s) => `<li><span><strong>${esc(s.store)}</strong> ${esc(s.name)}<br><small>${esc(sizeText(s))} · ${esc(formatPrice(s.price))}</small></span>
            <button data-slot="${slotId}" data-use="${s.id}">Pakai ini</button></li>`,
        )
        .join('');
      showNotice(
        `<strong>${esc(p?.name ?? 'Perubahan')}</strong> tidak bisa ditempatkan:
        <ul>${res.problems.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul>
        <p>Ukuran produk tidak diubah agar tetap sesuai ukuran aslinya.</p>
        ${comboHtml}
        ${sug ? `<p>Produk ${esc(CATEGORY_LABELS[slotById[slotId].category].toLowerCase())} lain yang muat:</p><ul class="suggest">${sug}</ul>` : '<p>Tidak ada produk lain di kategori ini yang muat dengan susunan sekarang. Coba ganti atau hapus furnitur di sekitarnya.</p>'}`,
      );
      return false;
    }
    const warn = res.problems.filter((x) => x.severity === 'warning');
    if (warn.length) showNotice(`<ul>${warn.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul>`, 'info');
    else notice.hidden = true;
    if (productId) onFocusSlot?.(slotId);
    return true;
  }

  // ---------- Katalog ----------
  function card(p) {
    const placedIn = SLOTS.filter((s) => furnishing.selection[s.id] === p.id);
    const v = p.verification;
    const art = document.createElement('article');
    art.className = 'card';
    const actions = slotsFor(p)
      .map((s) => {
        const cur = furnishing.selection[s.id];
        const where = slotsFor(p).length > 1 ? ` · ${s.label.replace(/ \(sepasang\)/, '').toLowerCase()}` : '';
        if (cur === p.id) return `<button class="ghost" data-remove="${s.id}">Hapus dari kamar${esc(where)}</button>`;
        if (cur) return `<button data-slot="${s.id}" data-add="${p.id}">Ganti produk${esc(where)}</button>`;
        return `<button class="primary" data-slot="${s.id}" data-add="${p.id}">Tambah ke kamar${esc(where)}</button>`;
      })
      .join('');
    art.innerHTML = `
      <div class="thumb"><img src="${PLACEHOLDER}" alt="Ilustrasi model 3D ${esc(p.name)}" width="240" height="180"><span>Ilustrasi model 3D</span></div>
      <div class="info">
        <div class="meta"><span class="store s-${p.store.toLowerCase()}">${esc(p.store)}</span>
          <span class="badge v-${v.status}">${esc(VERIFICATION_LABELS[v.status])}</span>
          ${placedIn.length ? '<span class="badge placed">Di kamar</span>' : ''}</div>
        <h3>${esc(p.name)}</h3>
        <p class="price">${esc(formatPrice(p.price))}${p.stock === 'OutOfStock' ? ' <span class="stock">stok online habis</span>' : ''}</p>
        <p class="size">${esc(sizeText(p))}</p>
        <details><summary>Detail & sumber data</summary>
          <dl>
            <dt>Kode/No. artikel</dt><dd>${esc(p.sku ?? 'Belum terverifikasi')}</dd>
            ${p.specs ? `<dt>Ukuran resmi</dt><dd>${esc(p.specs)}</dd>` : ''}
            <dt>Status data</dt><dd>${esc(VERIFICATION_LABELS[v.status])}${v.checked ? ` (diperiksa ${esc(v.checked)})` : ''}</dd>
            <dt>Sumber</dt><dd>${esc(v.source)}</dd>
            ${v.note ? `<dt>Catatan</dt><dd>${esc(v.note)}</dd>` : ''}
          </dl>
        </details>
        <div class="actions">${actions}<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Lihat di toko ↗</a></div>
      </div>`;
    thumbs.request(p, art.querySelector('img'));
    art.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => place(b.dataset.slot, b.dataset.add)));
    art.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => place(b.dataset.remove, null)));
    return art;
  }

  function renderCatalog() {
    const list = filterProducts(state).filter((p) => !state.verifiedOnly || p.verification.status === 'verified');
    thumbs.reset();
    const cards = el('cards');
    cards.replaceChildren(...list.map(card));
    el('resultCount').textContent = `${list.length} produk`;
  }

  // ---------- Di kamar ----------
  function renderRoom() {
    const lay = furnishing.layout;
    const dist = measureDistances(lay);
    const rows = SLOTS.map((s) => {
      const p = getProduct(furnishing.selection[s.id]);
      const probs = lay.problems.filter((x) => x.slots.includes(s.id));
      return `<li class="slot ${probs.some((x) => x.severity === 'error') ? 'has-problem' : ''}">
        <div><span class="slot-label">${esc(s.label)}</span>
        ${p ? `<span class="slot-product"><span class="store s-${p.store.toLowerCase()}">${esc(p.store)}</span> ${esc(p.name)}</span><small>${esc(sizeText(p))}</small>` : '<span class="slot-empty">Kosong</span>'}</div>
        <div class="slot-actions">
          <button data-pick="${s.category}">${p ? 'Ganti' : 'Pilih'}</button>
          ${p ? `<button class="ghost" data-clear="${s.id}">Hapus</button>` : ''}
        </div></li>`;
    }).join('');
    const problems = lay.problems.length
      ? `<div class="problems"><strong>Perlu perhatian:</strong><ul>${lay.problems.map((x) => `<li class="${x.severity}">${esc(x.text)}</li>`).join('')}</ul></div>`
      : '<p class="ok">✓ Semua produk berada di dalam kamar dan tidak saling bertabrakan.</p>';
    const notes = dist.notes.map((n) => `<li>${esc(n.text)}: <strong>${cmText(Math.max(0, n.gap))}</strong>${n.gap < 0.6 ? ' <span class="tight">sempit (&lt; 60 cm)</span>' : ''}</li>`).join('');
    const pairs = dist.pairs.map((d) => `<li>${esc(d.a)} ↔ ${esc(d.b)}: <strong>${cmText(d.gap)}</strong></li>`).join('');
    el('roomPane').innerHTML = `
      <p class="room-size">Kamar <strong>${ROOM.length.toFixed(2).replace('.', ',')} × ${ROOM.width.toFixed(2).replace('.', ',')} m</strong>, tinggi ${ROOM.height.toFixed(2).replace('.', ',')} m · luas ${ROOM.length * ROOM.width} m² · furnitur memakai <strong>${Math.round(dist.floorUse * 100)}%</strong> lantai</p>
      ${problems}
      <ul class="slots">${rows}</ul>
      <h4>Ruang gerak</h4><ul class="dist">${notes || '<li>—</li>'}</ul>
      <h4>Jarak antar furnitur</h4><ul class="dist">${pairs || '<li>Tidak ada furnitur yang berdekatan (&lt; 120 cm).</li>'}</ul>
      <p class="hint">Jarak diukur dari kotak terluar setiap produk (tampak atas). Ruang jalan yang nyaman umumnya sekitar 60 cm atau lebih.</p>
      <button class="ghost wide" id="resetRoom">Kembalikan susunan awal</button>`;
    el('roomPane').querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => filterTo(b.dataset.pick)));
    el('roomPane').querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', () => place(b.dataset.clear, null)));
    el('resetRoom').addEventListener('click', () => {
      furnishing.reset(DEFAULTS);
      notice.hidden = true;
    });
  }

  // ---------- Daftar belanja ----------
  function renderCart() {
    const list = furnishing.shoppingList();
    const known = list.filter((r) => r.subtotal != null);
    const total = known.reduce((s, r) => s + r.subtotal, 0);
    const missing = list.filter((r) => r.subtotal == null && r.qty > 0);
    const byStore = STORES.map((s) => ({ s, sum: known.filter((r) => r.product.store === s).reduce((a, r) => a + r.subtotal, 0), n: list.filter((r) => r.product.store === s).length })).filter((x) => x.n);
    el('cartCount').textContent = list.length ? `(${list.length})` : '';
    el('cartPane').innerHTML = list.length
      ? `<table class="cart">
          <thead><tr><th>Produk</th><th>Harga</th><th>Jml</th><th>Subtotal</th></tr></thead>
          <tbody>${list
            .map(
              (r) => `<tr>
              <td><span class="store s-${r.product.store.toLowerCase()}">${esc(r.product.store)}</span>
                <a href="${esc(r.product.url)}" target="_blank" rel="noopener noreferrer">${esc(r.product.name)} ↗</a>
                <small>${esc(r.slots.join(', '))}${r.product.verification.status !== 'verified' ? ` · ${esc(VERIFICATION_LABELS[r.product.verification.status].toLowerCase())}` : ''}</small></td>
              <td class="num">${esc(r.product.price == null ? '—' : formatPrice(r.product.price))}</td>
              <td><input type="number" min="0" max="20" value="${r.qty}" data-qty="${r.product.id}" aria-label="Jumlah ${esc(r.product.name)}"></td>
              <td class="num">${r.subtotal == null ? '—' : esc(formatPrice(r.subtotal))}</td></tr>`,
            )
            .join('')}</tbody>
          <tfoot>${byStore.map((x) => `<tr class="store-sum"><td colspan="3">Subtotal ${esc(x.s)}</td><td class="num">${esc(formatPrice(x.sum))}</td></tr>`).join('')}
            <tr class="total"><td colspan="3">Total estimasi</td><td class="num">${esc(formatPrice(total))}</td></tr></tfoot>
        </table>
        ${missing.length ? `<p class="warn-text">${missing.length} produk belum memiliki harga terverifikasi dan <strong>tidak dihitung</strong> dalam total: ${missing.map((r) => esc(r.product.name)).join('; ')}.</p>` : ''}
        <ul class="disclaimer">${CATALOG.meta.notes.map((n) => `<li>${esc(n)}</li>`).join('')}<li>Data harga diperiksa pada ${esc(CATALOG.meta.updated)}.</li></ul>
        <div class="row"><button id="copyList">Salin daftar</button><button id="downloadCsv">Unduh CSV</button><button id="shareLink">Salin tautan desain</button></div>`
      : '<p class="hint">Belum ada produk di kamar. Tambahkan dari tab Katalog.</p>';
    el('cartPane').querySelectorAll('[data-qty]').forEach((i) => i.addEventListener('change', () => furnishing.setQuantity(i.dataset.qty, Number(i.value))));
    if (!list.length) return;
    const lines = () => [
      ...list.map((r) => `${r.product.store} | ${r.product.name} | ${r.product.price == null ? 'harga belum terverifikasi' : formatPrice(r.product.price)} x ${r.qty} = ${r.subtotal == null ? '-' : formatPrice(r.subtotal)} | ${r.product.url}`),
      `Total estimasi: ${formatPrice(total)}${missing.length ? ` (+${missing.length} produk tanpa harga)` : ''}`,
      'Harga & stok dapat berubah; belum termasuk ongkos kirim/perakitan.',
    ];
    el('copyList').addEventListener('click', () => copy(lines().join('\n'), el('copyList')));
    el('shareLink').addEventListener('click', () => copy(location.href, el('shareLink')));
    el('downloadCsv').addEventListener('click', () => {
      const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
      const csv = [
        ['Toko', 'Produk', 'Kode', 'Harga satuan (IDR)', 'Jumlah', 'Subtotal (IDR)', 'Status data', 'Tautan'].map(q).join(','),
        ...list.map((r) => [r.product.store, r.product.name, r.product.sku, r.product.price, r.qty, r.subtotal, VERIFICATION_LABELS[r.product.verification.status], r.product.url].map(q).join(',')),
        ['', 'Total estimasi', '', '', '', total, '', ''].map(q).join(','),
      ].join('\r\n');
      const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'daftar-belanja-kamar.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  }

  async function copy(text, button) {
    const label = button.textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Tersalin ✓';
    } catch {
      button.textContent = 'Gagal menyalin';
    }
    setTimeout(() => (button.textContent = label), 1500);
  }

  // Tombol buka/tutup panel (untuk layar kecil)
  el('toggleShop').addEventListener('click', () => document.body.classList.toggle('shop-open'));

  furnishing.onChange(() => {
    renderCatalog();
    renderRoom();
    renderCart();
  });
  renderCatalog();
  renderRoom();
  renderCart();
  el('catalogInfo').textContent = `${PRODUCTS.length} produk dari ${STORES.join(', ')} · data diperiksa ${CATALOG.meta.updated}`;
  return { defaults: DEFAULTS };
}
