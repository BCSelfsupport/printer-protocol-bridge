import { useEffect, useState } from 'react';
import codesyncIcon from '@/assets/codesync-icon.png';

interface SplashScreenProps {
  onComplete: () => void;
  minimumDuration?: number;
}

export function SplashScreen({ onComplete, minimumDuration = 2500 }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadeOut(true), minimumDuration - 500);
    const completeTimer = setTimeout(onComplete, minimumDuration);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete, minimumDuration]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-white transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <img
        src={codesyncIcon}
        alt="CodeSync™ Pro"
        className="w-40 h-40 md:w-56 md:h-56 mb-6 animate-pulse rounded-2xl shadow-2xl"
      />
      <div className="flex items-baseline mb-2">
        <span className="text-4xl md:text-5xl font-bold italic text-blue-600">Code</span>
        <span className="text-4xl md:text-5xl font-bold italic text-emerald-500">Sync</span>
        <span className="text-sm font-normal text-gray-400 align-top ml-0.5">™</span>
      </div>
      <div className="px-3 py-1 bg-gradient-to-r from-blue-600 to-emerald-500 rounded text-sm font-bold text-white uppercase tracking-widest mb-8">
        Pro
      </div>
      <div className="text-gray-400 text-sm tracking-wide">Loading...</div>
    </div>
  );
}
