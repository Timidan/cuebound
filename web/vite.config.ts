import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The UI talks to a running CueBound server (bun server.ts). Point it elsewhere with CUEBOUND_API.
const target = process.env.CUEBOUND_API ?? 'http://127.0.0.1:3000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': target, '/media': target },
  },
})
