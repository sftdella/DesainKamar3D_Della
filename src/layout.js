// =====================================================================
// SEMUA UKURAN DALAM METER.
// Titik (0, 0, 0) = tengah lantai kamar.
// Sumbu X = panjang kamar (4 m)  -> dinding kiri x = -2, dinding kanan x = +2
// Sumbu Z = lebar kamar (3 m)    -> dinding belakang z = -1.5, dinding depan z = +1.5
// Sumbu Y = tinggi (lantai y = 0, plafon y = 3)
// Posisi furnitur diatur di src/products/placement.js.
// =====================================================================

export const ROOM = { length: 4, width: 3, height: 3, wallThickness: 0.1 };
export const HALF_L = ROOM.length / 2;
export const HALF_W = ROOM.width / 2;

// Pintu di dinding depan, jendela di dinding kanan.
export const DOOR = { centerX: 1.35, width: 0.9, height: 2.1 };
export const WINDOW = { centerZ: 0.45, width: 1.2, height: 1.3, sill: 0.9 };
