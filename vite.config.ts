import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import pkg from "./package.json";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_BUILD_TOKEN__: JSON.stringify(`${pkg.version}-${Date.now()}`),
    },
    base: './',
    server: {
      host: "::",
      port: 8080,
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
      hmr: {
        overlay: false,
      },
    },
    plugins: [
      {
        name: "codesync-live-version-endpoint",
        configureServer(server) {
          server.middlewares.use("/__codesync_version.json", (_req, res) => {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
            res.end(JSON.stringify({ version: pkg.version }));
          });
        },
      },
      react(),
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
