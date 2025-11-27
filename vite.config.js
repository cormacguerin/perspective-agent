// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3173,
    proxy: {
      '/agent': {
        target: 'http://localhost:3007',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
