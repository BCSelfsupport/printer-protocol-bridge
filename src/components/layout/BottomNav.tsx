import { Power, FileText, SlidersHorizontal, Brush, Settings, Wrench } from 'lucide-react';

export type NavItem = 'home' | 'messages' | 'adjust' | 'clean' | 'setup' | 'service';

interface BottomNavProps {
  activeItem: NavItem;
  onNavigate: (item: NavItem) => void;
  onTurnOff: () => void;
  showPrinterControls?: boolean;
}

const navItems: { id: NavItem; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
  { id: 'messages', label: 'Messages', icon: <FileText className="w-6 h-6 md:w-8 md:h-8" /> },
  { id: 'adjust', label: 'Adjust', icon: <SlidersHorizontal className="w-6 h-6 md:w-8 md:h-8" /> },
  { id: 'clean', label: 'Clean', icon: <Brush className="w-6 h-6 md:w-8 md:h-8" />, disabled: true },
  { id: 'setup', label: 'Setup', icon: <Settings className="w-6 h-6 md:w-8 md:h-8" />, disabled: true },
  { id: 'service', label: 'Service', icon: <Wrench className="w-6 h-6 md:w-8 md:h-8" /> },
];

export function BottomNav({ activeItem, onNavigate, onTurnOff, showPrinterControls = true }: BottomNavProps) {
  if (!showPrinterControls) {
    return null;
  }

  return (
    <nav className="h-20 md:h-24 bg-sidebar overflow-x-auto">
      <div className="flex h-full min-w-max">
        <button 
          onClick={onTurnOff}
          className="flex flex-col items-center justify-center gap-1 px-4 md:px-6 industrial-button-gray text-white min-w-[90px] md:min-w-[120px] flex-shrink-0"
        >
          <Power className="w-6 h-6 md:w-8 md:h-8" />
          <span className="text-xs md:text-sm font-medium">Turn Off</span>
        </button>

        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => !item.disabled && onNavigate(item.id)}
            disabled={item.disabled}
            className={`min-w-[70px] md:min-w-[100px] px-3 md:px-4 flex flex-col items-center justify-center gap-1 transition-all flex-shrink-0 ${
              item.disabled
                ? 'bg-sidebar/50 text-sidebar-foreground/40 cursor-not-allowed'
                : activeItem === item.id 
                  ? 'industrial-button text-white' 
                  : 'bg-sidebar hover:bg-sidebar-accent text-sidebar-foreground'
            }`}
          >
            {item.icon}
            <span className="text-xs md:text-sm font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
