import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: mode === 'production' ? '/Gorbagana-Trashrush/' : '/',
      define: {
        global: 'globalThis',
        'process.env': {},
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          buffer: 'buffer',
        }
      },
      optimizeDeps: {
        include: ['buffer'],
      },
      server: {
        port: 3000,
        host: true,
      }
    };
});
