import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { cpSync, mkdirSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';

const public2D = resolve('apps/pc-app/ui/.generated-public');
for (const directory of ['brand', 'illustrations']) {
  mkdirSync(resolve(public2D, directory), { recursive: true });
  cpSync(resolve('apps/pc-app/runtime/assets', directory), resolve(public2D, directory), { recursive: true });
}

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], build: { outDir: 'apps/pc-app/dist/main', rollupOptions: { input: 'apps/pc-app/runtime/main/index.ts', output: { entryFileNames: 'index.cjs', format: 'cjs' } } } },
  preload: { plugins: [externalizeDepsPlugin()], build: { outDir: 'apps/pc-app/dist/preload', rollupOptions: { input: 'apps/pc-app/runtime/preload/index.ts', output: { entryFileNames: 'index.cjs', format: 'cjs' } } } },
  renderer: { root: 'apps/pc-app/ui', publicDir: public2D, plugins: [react(), tailwindcss()], resolve: { alias: { '@': resolve('apps/pc-app/ui/src') } }, build: { minify: true, outDir: resolve('apps/pc-app/dist/ui'), rollupOptions: { input: 'apps/pc-app/ui/index.html' } } }
});
