import { Power, FileText, SlidersHorizontal, Brush, Settings, Wrench } from 'lucide-react';

export type NavItem = 'home' | 'messages' | 'adjust' | 'clean' | 'setup' | 'service';

interface BottomNavProps {
  activeItem: NavItem;
  onNavigate: (item: NavItem) => void;
  onTurnOff: () => void;
  showPrinterControls?: boolean;
}

const navItems: { id: NavItem; label: string; icon: React.ReactNode }[] = [
  { id: 'messages', label: 'Messages', icon: <FileText className="w-8 h-8" /> },
  { id: 'adjust', label: 'Adjust', icon: <SlidersHorizontal className="w-8 h-8" /> },
  { id: 'clean', label: 'Clean', icon: <Brush className="w-8 h-8" /> },
  { id: 'setup', label: 'Setup', icon: <Settings className="w-8 h-8" /> },
  { id: 'service', label: 'Service', icon: <Wrench className="w-8 h-8" /> },
];

export function BottomNav({ activeItem, onNavigate, onTurnOff, showPrinterControls = true }: BottomNavProps) {
  if (!showPrinterControls) {
    return null;
  }

  return (
    <nav className="flex h-24 bg-sidebar">
      <button 
        onClick={onTurnOff}
        className="flex flex-col items-center justify-center gap-1 px-6 industrial-button-gray text-white min-w-[120px]"
      >
        <Power className="w-8 h-8" />
        <span className="text-sm font-medium">Turn Off</span>
      </button>

      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${
            activeItem === item.id 
              ? 'industrial-button text-white' 
              : 'bg-sidebar hover:bg-sidebar-accent text-sidebar-foreground'
          }`}
        >
          {item.icon}
          <span className="text-sm font-medium">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
