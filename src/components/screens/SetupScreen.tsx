import { useState, useEffect } from 'react';
import { Send } from 'lucide-react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';

interface SetupScreenProps {
  onHome: () => void;
}

export function SetupScreen({ onHome }: SetupScreenProps) {
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex-1 p-4 flex flex-col">
      <SubPageHeader title="Settings" onHome={onHome} />

      <div className="grid grid-cols-2 gap-4">
        {/* Date setting */}
        <div className="bg-card rounded-lg p-4 flex items-center justify-between">
          <span className="text-primary text-xl">
            Date: {date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}
          </span>
          <button className="industrial-button text-white px-4 py-3 rounded-lg flex items-center gap-2">
            <Send className="w-6 h-6" />
            <span className="font-medium">Set</span>
          </button>
        </div>

        {/* Time setting */}
        <div className="bg-card rounded-lg p-4 flex items-center justify-between">
          <span className="text-primary text-xl">
            Time: {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button className="industrial-button text-white px-4 py-3 rounded-lg flex items-center gap-2">
            <Send className="w-6 h-6" />
            <span className="font-medium">Set</span>
          </button>
        </div>

        {/* Empty slots for future settings */}
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-card rounded-lg p-4 min-h-[80px]" />
        ))}
      </div>
    </div>
  );
}
