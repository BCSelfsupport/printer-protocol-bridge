import { defineConfig, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "node:fs";
import { componentTagger } from "lovable-tagger";
import pkg from "./package.json";
import type { IncomingMessage, ServerResponse } from "node:http";

const SOURCE_VERSION_PATHS = ["src", "index.html", "package.json", "vite.config.ts"];

const getLatestSourceMtime = (root: string): number => {
  let latest = 0;

  const walk = (target: string) => {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(target);
    } catch {
      return;
    }

    latest = Math.max(latest, Math.floor(stat.mtimeMs));

    if (!stat.isDirectory()) return;

    for (const entry of fs.readdirSync(target)) {
      if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
      walk(path.join(target, entry));
    }
  };

  for (const sourcePath of SOURCE_VERSION_PATHS) {
    walk(path.resolve(root, sourcePath));
  }

  return latest;
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const root = process.cwd();

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
        configureServer(server: ViteDevServer) {
          server.middlewares.use("/__codesync_version.json", (_req: IncomingMessage, res: ServerResponse) => {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
            res.end(JSON.stringify({
              version: pkg.version,
              sourceVersion: getLatestSourceMtime(root),
            }));
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
