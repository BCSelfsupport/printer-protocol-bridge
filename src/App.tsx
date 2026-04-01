import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { UpdateNotification } from "./components/UpdateNotification";
import { SplashScreen } from "./components/SplashScreen";
import { LicenseProvider } from "./contexts/LicenseContext";
import { DemoWatermark } from "./components/license/DemoWatermark";
import { ErrorBoundary } from "./components/ErrorBoundary";

const queryClient = new QueryClient();
const Index = lazy(() => import("./pages/Index"));
const TelemetryPage = lazy(() => import("./pages/TelemetryPage"));
const DiagnosticsPage = lazy(() => import("./pages/DiagnosticsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const RouteFallback = () => (
  <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
    Loading CodeSync…
  </div>
);

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
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/telemetry" element={<TelemetryPage />} />
                    <Route path="/diagnostics" element={<DiagnosticsPage />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </HashRouter>
            </TooltipProvider>
          </LicenseProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
