import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const showCrashReport = (err: unknown) => {
  console.error("[main.tsx] Fatal render error:", err);
  const el = document.getElementById("root");
  if (el) {
    const errMsg = String(err);
    const stack = (err as any)?.stack || '';
    const missingEnv = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    el.innerHTML = `<div style="padding:40px;font-family:monospace;color:#ff6b6b;background:#111;min-height:100vh">
      <h1 style="color:#fff">CodeSync™ – Crash Report</h1>
      ${missingEnv ? `<div style="background:#7f1d1d;padding:12px;border-radius:8px;margin-bottom:16px;color:#fca5a5">
        ⚠️ <strong>Missing backend configuration.</strong> VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY was not injected at build time.<br/>
        Ensure GitHub Actions secrets VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set in your repository before triggering a build.
      </div>` : ''}
      <pre style="background:#222;padding:16px;border-radius:8px;white-space:pre-wrap;font-size:12px">${errMsg}\n\n${stack}</pre>
    </div>`;
  }
};

const clearElectronPwaCaches = async () => {
  if (typeof window === "undefined" || !window.electronAPI) return;

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.warn("[main.tsx] Failed to clear Electron cache state:", error);
  }
};

const mountApp = () => {
  const root = createRoot(document.getElementById("root")!);
  root.render(<App />);
  (window as any).__CS_MOUNTED = true;
};

// Clear stale Vite HMR state on full reloads to prevent "startup error" false positives
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeFullReload', () => {
    sessionStorage.clear();
  });
}

// Mark boot as started as soon as the module executes to avoid false watchdog errors
(window as any).__CS_MOUNTED = true;

try {
  mountApp();
} catch (err) {
  showCrashReport(err);
}

// Run Electron cache cleanup in background so UI mount is never blocked
void clearElectronPwaCaches();
