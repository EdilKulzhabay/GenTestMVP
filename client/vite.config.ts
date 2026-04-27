import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const fromApiUrl = env.VITE_API_URL?.replace(/\/api\/v\d+\/?$/, '');
  const API_TARGET = env.VITE_DEV_API_TARGET || fromApiUrl || 'http://127.0.0.1:5000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: API_TARGET, changeOrigin: true },
        '/socket.io': { target: API_TARGET, changeOrigin: true, ws: true }
      }
    }
  };
});
