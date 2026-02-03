import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { BottomNav, NavItem } from '@/components/layout/BottomNav';
import { Dashboard } from '@/components/screens/Dashboard';
import { PrintersScreen } from '@/components/screens/PrintersScreen';
import { MessagesScreen } from '@/components/screens/MessagesScreen';
import { AdjustScreen } from '@/components/screens/AdjustScreen';
import { SetupScreen } from '@/components/screens/SetupScreen';
import { ServiceScreen } from '@/components/screens/ServiceScreen';
import { CleanScreen } from '@/components/screens/CleanScreen';
import { usePrinterConnection } from '@/hooks/usePrinterConnection';

const Index = () => {
  const [currentScreen, setCurrentScreen] = useState<NavItem | 'printers'>('home');
  const {
    printers,
    connectionState,
    connect,
    disconnect,
    startPrint,
    stopPrint,
    updateSettings,
    selectMessage,
  } = usePrinterConnection();

  const handleNavigate = (item: NavItem) => {
    setCurrentScreen(item);
  };

  const handleHome = () => {
    setCurrentScreen('home');
  };

  const handleTurnOff = () => {
    disconnect();
    setCurrentScreen('home');
  };

  const handleConnect = async (printer: typeof printers[0]) => {
    await connect(printer);
    setCurrentScreen('home');
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'printers':
        return (
          <PrintersScreen
            printers={printers}
            onConnect={handleConnect}
            onHome={handleHome}
          />
        );
      case 'messages':
        return (
          <MessagesScreen
            messages={connectionState.messages}
            onSelect={selectMessage}
            onHome={handleHome}
          />
        );
      case 'adjust':
        return (
          <AdjustScreen
            settings={connectionState.settings}
            onUpdate={updateSettings}
            onSave={() => {}}
            onHome={handleHome}
          />
        );
      case 'clean':
        return <CleanScreen onHome={handleHome} />;
      case 'setup':
        return <SetupScreen onHome={handleHome} />;
      case 'service':
        return (
          <ServiceScreen
            metrics={connectionState.metrics}
            onHome={handleHome}
          />
        );
      default:
        return (
          <Dashboard
            status={connectionState.status}
            isConnected={connectionState.isConnected}
            onStart={startPrint}
            onStop={stopPrint}
            onNewMessage={() => setCurrentScreen('messages')}
            onEditMessage={() => setCurrentScreen('messages')}
            onSignIn={() => {}}
            onHelp={() => {}}
            onPrinters={() => setCurrentScreen('printers')}
          />
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header
        isConnected={connectionState.isConnected}
        connectedIp={connectionState.connectedPrinter?.ipAddress}
      />

      <main className="flex-1 flex flex-col">
        {renderScreen()}
      </main>

      <BottomNav
        activeItem={currentScreen === 'printers' ? 'home' : currentScreen}
        onNavigate={handleNavigate}
        onTurnOff={handleTurnOff}
      />

      {/* Footer */}
      <footer className="bg-sidebar text-sidebar-foreground px-4 py-2 flex justify-between text-sm">
        <span>Build 4.24.0620 | Application is licensed to Bestcode for showtime and testing purposes</span>
        <span>v01.09.00.14</span>
      </footer>
    </div>
  );
};

export default Index;
