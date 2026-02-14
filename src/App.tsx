import { useState, useCallback } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { UpdateNotification } from "./components/UpdateNotification";
import { SplashScreen } from "./components/SplashScreen";
import { LicenseProvider } from "./contexts/LicenseContext";

const queryClient = new QueryClient();

const App = () => {
  const [showSplash, setShowSplash] = useState(true);
  const handleSplashComplete = useCallback(() => setShowSplash(false), []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <LicenseProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <UpdateNotification />
            {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
            <HashRouter>
              <Routes>
                <Route path="/" element={<Index />} />
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
