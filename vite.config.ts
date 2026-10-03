import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': `http://localhost:${process.env.API_PORT ?? 3001}`,
      '/library': `http://localhost:${process.env.API_PORT ?? 3001}`,
    },
  },
});
