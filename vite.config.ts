import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ mode }) => ({
  root: "apps/web",
  publicDir: "../../public",
  base: mode === "production" ? "./" : "/",
  resolve: {
    alias: {
      "@gym/contracts": fromRoot("./packages/contracts/src/index.ts"),
      "@gym/catalog": fromRoot("./packages/catalog/src/index.ts"),
      "@gym/workouts": fromRoot("./packages/workouts/src/index.ts"),
      "@gym/nutrition": fromRoot("./packages/nutrition/src/index.ts"),
      "@gym/progress": fromRoot("./packages/progress/src/index.ts"),
      "@gym/storage": fromRoot("./packages/storage/src/index.ts"),
      "@gym/backup": fromRoot("./packages/backup/src/index.ts"),
      "@gym/media": fromRoot("./packages/media/src/index.ts"),
      "@gym/ui": fromRoot("./packages/ui/src/index.tsx")
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: "script-defer",
      manifest: {
        name: "Gym Local",
        short_name: "Gym Local",
        lang: "vi",
        description: "Theo dõi tập luyện và dinh dưỡng, dữ liệu nằm trên thiết bị của bạn.",
        theme_color: "#11120f",
        background_color: "#f4f1e8",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ],
        screenshots: [
          { src: "og-gym-local.png", sizes: "1200x675", type: "image/png", form_factor: "wide", label: "Gym Local" }
        ]
      },
      workbox: {
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        globIgnores: ["og-gym-local.png", "**/*.map"],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/world\.openfoodfacts\.org\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "food-lookups",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
              networkTimeoutSeconds: 4
            }
          }
        ]
      },
      devOptions: { enabled: true }
    })
  ],
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    // ZXing is a separately loaded, self-contained camera dependency. Keep the
    // warning ceiling aligned with the enforced report budget below rather than
    // hiding accidental growth in application or route chunks.
    chunkSizeWarningLimit: 500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "vendor-react", test: /node_modules[\\/](?:react|react-dom|react-router|react-router-dom|scheduler)[\\/]/, priority: 100 },
            { name: "vendor-charts", test: /node_modules[\\/](?:recharts|d3-[^\\/]+|victory-vendor)[\\/]/, priority: 90 },
            { name: "vendor-barcode", test: /node_modules[\\/]@zxing[\\/]/, priority: 80 },
            { name: "vendor-state", test: /node_modules[\\/](?:dexie|zustand)[\\/]/, priority: 70 },
            { name: "vendor-backup", test: /node_modules[\\/](?:jszip|@noble[\\/]hashes)[\\/]/, priority: 60 },
            { name: "vendor-icons", test: /node_modules[\\/]lucide-react[\\/]/, priority: 50 },
            { name: "vendor-validation", test: /node_modules[\\/]zod[\\/]/, priority: 40 }
          ]
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: [fromRoot("./tests/setup.ts")],
    include: ["src/**/*.test.{ts,tsx}", "../../packages/**/*.test.{ts,tsx}"]
  }
}));
