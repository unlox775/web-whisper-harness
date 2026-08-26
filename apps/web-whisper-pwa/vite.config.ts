import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Web Whisper',
        short_name: 'Web Whisper',
        description: 'Durable audio recording with transcription',
        theme_color: '#0a0f18',
        background_color: '#0a0f18',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@session-store': path.resolve(__dirname, '../../packages/datastore/session-store/src'),
      '@capture-engine': path.resolve(__dirname, '../../packages/lib/capture-engine/src'),
      '@playback-engine': path.resolve(__dirname, '../../packages/lib/playback-engine/src'),
      '@transcription-client': path.resolve(__dirname, '../../packages/lib/transcription-client/src'),
      '@volume-analyzer': path.resolve(__dirname, '../../packages/lib/volume-analyzer/src'),
      'lamejs': path.resolve(__dirname, './node_modules/lamejs')
    }
  },
  optimizeDeps: {
    include: ['lamejs'],
    esbuildOptions: {
      target: 'es2020'
    }
  },
  ssr: {
    noExternal: ['@capture-engine', '@playback-engine', '@volume-analyzer']
  },
  build: {
    target: 'es2020',
    commonjsOptions: {
      include: [/lamejs/, /node_modules/],
      transformMixedEsModules: true
    }
  }
})
