import { useState, useCallback } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import Index from "./pages/Index";
import TelemetryPage from "./pages/TelemetryPage";
import NotFound from "./pages/NotFound";
import { UpdateNotification } from "./components/UpdateNotification";
import { SplashScreen } from "./components/SplashScreen";
import { LicenseProvider } from "./contexts/LicenseContext";
import { DemoWatermark } from "./components/license/DemoWatermark";

const queryClient = new QueryClient();

const App = () => {
  const [showSplash, setShowSplash] = useState(true);
  const handleSplashComplete = useCallback(() => setShowSplash(false), []);

  return (
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
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/telemetry" element={<TelemetryPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </HashRouter>
          </TooltipProvider>
        </LicenseProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
