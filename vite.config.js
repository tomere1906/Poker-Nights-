import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves the app from /<repo-name>/; dev stays at /.
  base: command === 'build' || isPreview ? '/Poker-Nights-/' : '/',
  plugins: [react(), tailwindcss()],
  // Expose on the local network so the app can be opened from a phone.
  server: { host: true },
  preview: { host: true },
}));
