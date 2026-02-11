import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  base: './',
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,bin,woff,woff2}'],
        navigateFallbackDenylist: [/^\/~oauth/],
      },
      manifest: {
        name: 'CodeSync™',
        short_name: 'CodeSync',
        description: 'Industrial Printer Control Software',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        icons: [
          { src: '/codesync-icon.png?v=3', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/codesync-icon.png?v=3', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/codesync-icon.png?v=3', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/codesync-icon.png?v=3', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
