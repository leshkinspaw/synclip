import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        background: path.resolve(__dirname, 'src/background.js'),
        offscreen: path.resolve(__dirname, 'offscreen.html'),
        shareStream: path.resolve(__dirname, 'share-stream.html'),
        watch: path.resolve(__dirname, 'watch.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          return ['background', 'offscreen'].includes(chunkInfo.name) ? '[name].js' : 'assets/[name]-[hash].js'
        },
      },
    },
  },
})
