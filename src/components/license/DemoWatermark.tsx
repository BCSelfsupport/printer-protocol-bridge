import { useLicense } from '@/contexts/LicenseContext';
import { useState, useEffect } from 'react';

export function DemoWatermark() {
  const { isDemo, productKey } = useLicense();
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!isDemo || !productKey) return;

    // Calculate from localStorage activation date, or fallback to 30
    try {
      const saved = localStorage.getItem('codesync-license');
      if (saved) {
        const { activatedAt } = JSON.parse(saved);
        if (activatedAt) {
          const expiry = new Date(activatedAt).getTime() + 30 * 86400000;
          const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 86400000));
          setDaysLeft(remaining);
          return;
        }
      }
    } catch {}
    setDaysLeft(30);
  }, [isDemo, productKey]);

  if (!isDemo) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bg-amber-500 text-white text-center text-xs font-bold py-1.5 z-50 flex items-center justify-center gap-3">
      <span>DEMO VERSION</span>
      {daysLeft !== null && (
        <span className="bg-amber-700/40 px-2 py-0.5 rounded text-[10px] font-mono">
          {daysLeft} {daysLeft === 1 ? 'day' : 'days'} remaining
        </span>
      )}
    </div>
  );
}
