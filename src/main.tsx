import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

try {
  const root = createRoot(document.getElementById("root")!);
  root.render(<App />);
  // Signal to HTML fallback that React mounted
  (window as any).__CS_MOUNTED = true;
} catch (err) {
  console.error("[main.tsx] Fatal render error:", err);
  const el = document.getElementById("root");
  if (el) {
    el.innerHTML = `<div style="padding:40px;font-family:monospace;color:#ff6b6b;background:#111;min-height:100vh">
      <h1 style="color:#fff">CodeSync™ – Crash Report</h1>
      <pre style="background:#222;padding:16px;border-radius:8px;white-space:pre-wrap">${String(err)}\n${(err as any)?.stack || ''}</pre>
    </div>`;
  }
}
