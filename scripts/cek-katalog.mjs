// Memeriksa ulang harga & stok produk di src/data/products.json dari halaman produk resmi.
//
// Pemakaian (dari folder proyek):
//   npm run cek-katalog            -> periksa semua produk lalu simpan perubahan
//   npm run cek-katalog -- --coba  -> hanya tampilkan perubahan, tanpa menyimpan
//   npm run cek-katalog -- --toko IKEA
//
// Etika pengambilan data:
// - Hanya membuka halaman produk yang tercantum di katalog (bukan seluruh situs).
// - Jeda 2 detik antar permintaan.
// - Jika situs mulai menolak/menantang permintaan otomatis, pemeriksaan toko itu dihentikan.
//   Lakukan pemeriksaan manual untuk produk yang tersisa.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../src/data/products.json', import.meta.url);
const args = process.argv.slice(2);
const dryRun = args.includes('--coba');
const onlyStore = args.includes('--toko') ? args[args.indexOf('--toko') + 1]?.toUpperCase() : null;
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rupiah = (v) => (v == null ? '-' : `Rp${v.toLocaleString('id-ID')}`);

function productLd(html) {
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)) {
    try {
      const j = JSON.parse(m[1]);
      if (j['@type'] === 'Product') return j;
    } catch {
      // abaikan blok JSON yang tidak valid
    }
  }
  return null;
}

// Gangguan koneksi sesaat (mis. DNS) dicoba ulang 2 kali sebelum menyerah
async function fetchWithRetry(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (cek-katalog desain kamar)' } });
    } catch (e) {
      if (i >= tries) throw new Error(`koneksi gagal (${e.cause?.code ?? e.message}). Periksa internet lalu coba lagi.`);
      await sleep(5000);
    }
  }
}

async function check(p) {
  const res = await fetchWithRetry(p.url);
  if (res.status !== 200) return { blocked: true, reason: `status ${res.status}` };
  const html = await res.text();
  const ld = productLd(html);
  if (!ld?.offers) return { blocked: true, reason: 'data produk tidak ditemukan di halaman' };
  return {
    price: ld.offers.price != null ? Number(ld.offers.price) : null,
    stock: ld.offers.availability?.replace(/https?:\/\/schema.org\//, '') ?? null,
    sku: ld.sku ?? null,
    dim: (html.match(/Dimensi produk\s*:\s*([^<\\"]{3,60})/) || [])[1]?.trim() ?? null,
  };
}

const data = JSON.parse(readFileSync(FILE, 'utf8'));
const blockedStores = new Set();
let changed = 0;
let checked = 0;

// Produk yang belum pernah/paling lama tidak diperiksa didahulukan,
// sehingga pemeriksaan yang terhenti bisa dilanjutkan pada percobaan berikutnya.
const order = [...data.products].sort((a, b) => (a.verification.checked ?? '').localeCompare(b.verification.checked ?? ''));
for (const p of order) {
  if (onlyStore && p.store !== onlyStore) continue;
  const host = new URL(p.url).host;
  if (blockedStores.has(host)) continue;
  let r;
  try {
    r = await check(p);
  } catch (e) {
    r = { blocked: true, reason: e.message };
  }
  await sleep(2000);
  if (r.blocked) {
    console.log(`! ${p.store} ${p.name}: ${r.reason}`);
    blockedStores.add(host);
    console.log(`  Pemeriksaan otomatis untuk ${host} dihentikan. Periksa produk tersisa secara manual.`);
    continue;
  }
  checked++;
  const notes = [];
  if (r.price !== p.price) notes.push(`harga ${rupiah(p.price)} -> ${rupiah(r.price)}`);
  if (r.stock !== p.stock) notes.push(`stok ${p.stock ?? '-'} -> ${r.stock ?? '-'}`);
  if (r.sku && r.sku !== p.sku) notes.push(`kode ${p.sku ?? '-'} -> ${r.sku}`);
  p.price = r.price;
  p.stock = r.stock;
  if (r.sku) p.sku = r.sku;
  if (r.dim) p.specs = `Dimensi produk: ${r.dim}`;
  p.verification.checked = today;
  if (p.verification.status === 'unverified') {
    // Data dari halaman resmi kini tersedia; ukuran untuk model tetap perlu dicocokkan manual
    p.verification.status = 'partial';
    p.verification.note = `Harga & stok terbaca dari halaman resmi pada ${today}. Cocokkan ukuran model (${p.size.w}×${p.size.d}×${p.size.h} cm) dengan "${r.dim ?? 'dimensi di halaman'}" lalu ubah status menjadi "verified".`;
  }
  if (notes.length) {
    changed++;
    console.log(`* ${p.store} ${p.name}: ${notes.join(', ')}`);
  }
}

if (checked) data.meta.updated = today;
console.log(`\nDiperiksa: ${checked} produk, berubah: ${changed}.`);
if (blockedStores.size) console.log(`Tidak bisa diperiksa otomatis: ${[...blockedStores].join(', ')}`);
if (dryRun) {
  console.log('Mode --coba: file tidak diubah.');
} else {
  writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
  console.log('Tersimpan ke src/data/products.json');
}
