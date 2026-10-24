import data from '../data/products.json';

// Katalog produk dari src/data/products.json (dapat diperbarui manual atau dengan `npm run cek-katalog`).

export const CATALOG = data;
export const PRODUCTS = data.products;
const byId = new Map(PRODUCTS.map((p) => [p.id, p]));

export const getProduct = (id) => byId.get(id) ?? null;

export const STORES = ['IKEA', 'INFORMA', 'AZKO'];

export const CATEGORY_LABELS = {
  bed: 'Rangka tempat tidur',
  mattress: 'Kasur',
  wardrobe: 'Lemari pakaian',
  nightstand: 'Meja samping',
  desk: 'Meja belajar',
  chair: 'Kursi',
  lamp: 'Lampu',
  shelf: 'Rak dinding',
  rug: 'Karpet',
  curtain: 'Tirai',
};

export const VERIFICATION_LABELS = {
  verified: 'Terverifikasi',
  partial: 'Sebagian terverifikasi',
  unverified: 'Belum terverifikasi',
};

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
export const formatPrice = (v) => (v == null ? 'Harga belum terverifikasi' : rupiah.format(v));

// Teks ukuran yang jelas per kategori (L = lebar, D = dalam/panjang, T = tinggi)
export function sizeText(p) {
  const s = p.size;
  if (p.category === 'curtain') return `lebar ${s.w} cm × tinggi ${s.h} cm${p.model.panels ? ` (${p.model.panels} panel)` : ''}`;
  if (p.category === 'rug') return `${s.w} × ${s.d} cm`;
  if (p.category === 'bed' || p.category === 'mattress') return `L ${s.w} × P ${s.d} × T ${s.h} cm`;
  return `L ${s.w} × D ${s.d} × T ${s.h} cm`;
}

export function filterProducts({ store = 'all', category = 'all', query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return PRODUCTS.filter(
    (p) =>
      (store === 'all' || p.store === store) &&
      (category === 'all' || p.category === category) &&
      (!q || `${p.name} ${p.store} ${p.sku ?? ''}`.toLowerCase().includes(q)),
  );
}
