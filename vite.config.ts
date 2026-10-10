import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: { '/api': 'http://localhost:3001' },
  },
  test: { include: ['src/**/*.test.ts'] },
} as never)
