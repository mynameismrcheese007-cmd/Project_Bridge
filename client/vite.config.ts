import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const proxy = { '/api': 'http://localhost:4000', '^/p/': 'http://localhost:4000' };

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin API calls in development, so the session cookie just works.
    // '^/p/' only: a plain '/p' would also catch /projects and break those pages.
    proxy,
  },
  // `npm run preview` serves the production build with the same API proxy, for checking it locally.
  preview: { port: 4173, proxy },
});
