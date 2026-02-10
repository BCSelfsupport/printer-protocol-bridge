import { useEffect, useState } from 'react';


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
      <div className="flex items-start mb-8">
        <span className="text-5xl md:text-6xl font-bold italic text-blue-600">Code</span>
        <span className="text-5xl md:text-6xl font-bold italic text-emerald-500">Sync</span>
        <span className="text-sm md:text-base font-normal text-gray-400 mt-1 ml-0.5 leading-none">™</span>
      </div>
      <div className="text-gray-400 text-sm tracking-wide">Loading...</div>
    </div>
  );
}
