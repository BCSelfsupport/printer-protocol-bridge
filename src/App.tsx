import { useState, useCallback, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import Index from "./pages/Index";
import TelemetryPage from "./pages/TelemetryPage";
import DiagnosticsPage from "./pages/DiagnosticsPage";
import NotFound from "./pages/NotFound";
import ScanPage from "./pages/ScanPage";
import { UpdateNotification } from "./components/UpdateNotification";
import { SplashScreen } from "./components/SplashScreen";
import { LicenseProvider } from "./contexts/LicenseContext";
import { DemoWatermark } from "./components/license/DemoWatermark";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CompanionScanFab } from "./components/CompanionScanFab";

// Build stamp — bump to force a fresh module graph in the Lovable preview when
// HMR gets stuck serving an old bundle. Imported (not just a sidecar file) so
// Vite actually invalidates downstream modules when this changes.
const BUILD_STAMP = "2026-04-22-fault-no-double-dismiss";
if (typeof window !== "undefined") {
  (window as any).__CS_BUILD_STAMP = BUILD_STAMP;
}

const queryClient = new QueryClient();

const App = () => {
  const [showSplash, setShowSplash] = useState(true);
  const handleSplashComplete = useCallback(() => setShowSplash(false), []);

  // Catch unhandled promise rejections to prevent white-screen crashes
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("[unhandledrejection]", event.reason);
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", handleRejection);
    return () => window.removeEventListener("unhandledrejection", handleRejection);
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <LicenseProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <UpdateNotification />
              <DemoWatermark />
              {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
              <HashRouter>
                <CompanionScanFab />
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/telemetry" element={<TelemetryPage />} />
                  <Route path="/diagnostics" element={<DiagnosticsPage />} />
                  <Route path="/scan" element={<ScanPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </HashRouter>
            </TooltipProvider>
          </LicenseProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
