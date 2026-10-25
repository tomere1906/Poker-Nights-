import os from 'node:os';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Supabase Auth won't redirect back to a bare IP (http://192.168.1.6:5173), so
// phones on the LAN use this computer's nip.io name instead
// (http://192-168-1-6.nip.io:5173 resolves to 192.168.1.6). Only this
// machine's own addresses are allowed, not all of nip.io.
const lanNipHosts = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => `${i.address.replaceAll('.', '-')}.nip.io`);

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves the app from /<repo-name>/; dev stays at /.
  base: command === 'build' || isPreview ? '/Poker-Nights-/' : '/',
  plugins: [react(), tailwindcss()],
  // Expose on the local network so the app can be opened from a phone.
  server: { host: true, allowedHosts: lanNipHosts },
  preview: { host: true, allowedHosts: lanNipHosts },
}));
