import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    // Add the lines below to permit your domain
    allowedHosts: [
      'dukemidscapstone.com',
      '.dukemidscapstone.com' // The dot prefix allows all subdomains
    ],
    proxy: {
      '/api': {
        target: 'http://api:8000',
        changeOrigin: true,
      },
    },
  },
})