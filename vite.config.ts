import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      {
        // يرفع سقف الطيران من 260م إلى 2200م (قرب الفضاء) وقت البيلد من غير لمس DragonEngine.ts
        name: 'engine-ceiling-patch',
        enforce: 'pre' as const,
        transform(code: string, id: string) {
          if (!id.replace(/\\/g, '/').endsWith('/src/game/DragonEngine.ts')) return null;
          const next = code.replace(
            /if \(this\.playerPos\.y > 260\) \{\s*this\.playerPos\.y = 260;/,
            'if (this.playerPos.y > 2200) {\n      this.playerPos.y = 2200;',
          );
          if (next === code) this.warn('ceiling patch not applied');
          return {code: next, map: null};
        },
      },
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(rootDir, 'dist');
          const srcAssets = path.resolve(rootDir, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
      },
    },
    build: {
      // three.js كبيرة بطبيعتها؛ نرفع حد التحذير بدل ما يظهر في كل بيلد.
      chunkSizeWarningLimit: 1600,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
