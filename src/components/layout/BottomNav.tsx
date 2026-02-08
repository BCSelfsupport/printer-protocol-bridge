import { Power, FileText, SlidersHorizontal, Brush, Settings, Wrench, ChevronUp, ChevronDown } from 'lucide-react';
import { useState } from 'react';

export type NavItem = 'home' | 'messages' | 'adjust' | 'clean' | 'setup' | 'service';

interface BottomNavProps {
  activeItem: NavItem;
  onNavigate: (item: NavItem) => void;
  onTurnOff: () => void;
  showPrinterControls?: boolean;
}

const navItems: { id: NavItem; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
  { id: 'messages', label: 'Messages', icon: <FileText className="w-6 h-6" /> },
  { id: 'adjust', label: 'Adjust', icon: <SlidersHorizontal className="w-6 h-6" /> },
  { id: 'clean', label: 'Clean', icon: <Brush className="w-6 h-6" />, disabled: true },
  { id: 'setup', label: 'Setup', icon: <Settings className="w-6 h-6" />, disabled: true },
  { id: 'service', label: 'Service', icon: <Wrench className="w-6 h-6" /> },
];

export function BottomNav({ activeItem, onNavigate, onTurnOff, showPrinterControls = true }: BottomNavProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!showPrinterControls) {
    return null;
  }

  return (
    <div className="relative">
      {/* Collapse/Expand toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -top-6 left-1/2 -translate-x-1/2 bg-sidebar hover:bg-sidebar-accent text-sidebar-foreground px-3 py-1 rounded-t-md z-10 flex items-center gap-1 text-xs"
      >
        {isCollapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {isCollapsed ? 'Show' : 'Hide'}
      </button>

      {/* Nav bar - evenly distributed buttons */}
      <nav className={`bg-sidebar transition-all duration-200 ${isCollapsed ? 'h-0 overflow-hidden' : 'h-16'}`}>
        <div className="flex h-full">
          {/* Turn Off button */}
          <button 
            onClick={onTurnOff}
            className="flex-1 flex flex-col items-center justify-center gap-1 industrial-button-gray text-white"
          >
            <Power className="w-6 h-6" />
            <span className="text-xs font-medium">Turn Off</span>
          </button>

          {/* Nav items - evenly distributed */}
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => !item.disabled && onNavigate(item.id)}
              disabled={item.disabled}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${
                item.disabled
                  ? 'bg-sidebar/50 text-sidebar-foreground/40 cursor-not-allowed'
                  : activeItem === item.id 
                    ? 'industrial-button text-white' 
                    : 'bg-sidebar hover:bg-sidebar-accent text-sidebar-foreground'
              }`}
            >
              {item.icon}
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
