import { defineConfig } from 'vite';

export default defineConfig({
  // Alamat relatif agar hasil build (folder dist) bisa dibuka dari subfolder,
  // misalnya GitHub Pages: https://nama-akun.github.io/nama-repo/
  base: './',
  build: {
    // Three.js memang besar (~600 kB); batas peringatan dinaikkan agar log build tetap bersih
    chunkSizeWarningLimit: 1200,
  },
});
