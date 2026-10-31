import { defineConfig } from 'vitest/config';
import { precachePlugin } from './scripts/precache';

export default defineConfig({
  // Chemins relatifs : le site reste utilisable dans un sous-dossier (GitHub Pages).
  base: './',
  // Les cartes de débogage servent en développement ; une version publiée (BT_RELEASE=1) n'en embarque pas.
  build: { target: 'es2022', sourcemap: process.env['BT_RELEASE'] !== '1' },
  plugins: [precachePlugin()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
