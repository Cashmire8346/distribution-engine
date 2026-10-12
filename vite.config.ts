import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The built app is served by server.js under /app. In dev, /api is proxied to
// the real server so the UI always talks to real endpoints (start it with
// `npm start`).
export default defineConfig({
  base: '/app/',
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: { '/api': 'http://localhost:3000' }
  }
});
