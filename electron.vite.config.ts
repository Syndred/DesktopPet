import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], build: { outDir: 'apps/pc-app/dist/main', rollupOptions: { input: 'apps/pc-app/runtime/main/index.ts', output: { entryFileNames: 'index.cjs', format: 'cjs' } } } },
  preload: { plugins: [externalizeDepsPlugin()], build: { outDir: 'apps/pc-app/dist/preload', rollupOptions: { input: 'apps/pc-app/runtime/preload/index.ts', output: { entryFileNames: 'index.cjs', format: 'cjs' } } } },
  renderer: { root: 'apps/pc-app/ui', publicDir: '../runtime/assets', plugins: [react()], resolve: { alias: { '@': resolve('apps/pc-app/ui/src') } }, build: { minify: true, outDir: resolve('apps/pc-app/dist/ui'), rollupOptions: { input: 'apps/pc-app/ui/index.html' } } }
});
