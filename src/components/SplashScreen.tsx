import { useEffect, useState } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
  minimumDuration?: number;
}

function ConnectionNode({ x, y, delay, size = 8 }: { x: number; y: number; delay: number; size?: number }) {
  return (
    <circle
      cx={x}
      cy={y}
      r={size}
      className="fill-blue-500"
      opacity="0"
    >
      <animate attributeName="opacity" values="0;1;1" dur="0.4s" begin={`${delay}s`} fill="freeze" />
      <animate attributeName="r" values={`0;${size + 3};${size}`} dur="0.5s" begin={`${delay}s`} fill="freeze" />
    </circle>
  );
}

function ConnectionLine({ x1, y1, x2, y2, delay }: { x1: number; y1: number; x2: number; y2: number; delay: number }) {
  const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      className="stroke-emerald-500/60"
      strokeWidth="2"
      strokeDasharray={length}
      strokeDashoffset={length}
    >
      <animate attributeName="stroke-dashoffset" from={`${length}`} to="0" dur="0.4s" begin={`${delay}s`} fill="freeze" />
    </line>
  );
}

function PulseRing({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <circle cx={x} cy={y} r="8" className="stroke-blue-400/40" fill="none" strokeWidth="2" opacity="0">
      <animate attributeName="opacity" values="0;0.6;0" dur="1.5s" begin={`${delay}s`} repeatCount="indefinite" />
      <animate attributeName="r" values="8;28;40" dur="1.5s" begin={`${delay}s`} repeatCount="indefinite" />
    </circle>
  );
}

export function SplashScreen({ onComplete, minimumDuration = 4000 }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);
  const [showBrand, setShowBrand] = useState(false);
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    const brandTimer = setTimeout(() => setShowBrand(true), 800);
    const loadingTimer = setTimeout(() => setShowLoading(true), 1400);
    const fadeTimer = setTimeout(() => setFadeOut(true), minimumDuration - 500);
    const completeTimer = setTimeout(onComplete, minimumDuration);
    return () => {
      clearTimeout(brandTimer);
      clearTimeout(loadingTimer);
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete, minimumDuration]);

  // Node positions (centered around 200,150 in a 400x300 viewBox)
  const nodes = [
    { x: 200, y: 100, delay: 0, size: 12 },    // center top (main)
    { x: 120, y: 60, delay: 0.2, size: 7 },     // top-left
    { x: 280, y: 60, delay: 0.3, size: 7 },     // top-right
    { x: 80, y: 140, delay: 0.4, size: 6 },     // left
    { x: 320, y: 140, delay: 0.5, size: 6 },    // right
    { x: 140, y: 160, delay: 0.35, size: 8 },   // mid-left
    { x: 260, y: 160, delay: 0.45, size: 8 },   // mid-right
    { x: 200, y: 180, delay: 0.55, size: 6 },   // bottom-center
    { x: 100, y: 100, delay: 0.5, size: 5 },    // far left
    { x: 300, y: 100, delay: 0.6, size: 5 },    // far right
  ];

  const lines = [
    { x1: 200, y1: 100, x2: 120, y2: 60, delay: 0.25 },
    { x1: 200, y1: 100, x2: 280, y2: 60, delay: 0.35 },
    { x1: 200, y1: 100, x2: 140, y2: 160, delay: 0.4 },
    { x1: 200, y1: 100, x2: 260, y2: 160, delay: 0.5 },
    { x1: 120, y1: 60, x2: 80, y2: 140, delay: 0.5 },
    { x1: 280, y1: 60, x2: 320, y2: 140, delay: 0.55 },
    { x1: 140, y1: 160, x2: 200, y2: 180, delay: 0.6 },
    { x1: 260, y1: 160, x2: 200, y2: 180, delay: 0.65 },
    { x1: 120, y1: 60, x2: 100, y2: 100, delay: 0.55 },
    { x1: 280, y1: 60, x2: 300, y2: 100, delay: 0.65 },
    { x1: 80, y1: 140, x2: 140, y2: 160, delay: 0.6 },
    { x1: 320, y1: 140, x2: 260, y2: 160, delay: 0.65 },
  ];

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Network animation */}
      <svg viewBox="0 0 400 240" className="w-64 h-40 md:w-80 md:h-48 mb-6">
        {/* Lines first (behind nodes) */}
        {lines.map((l, i) => (
          <ConnectionLine key={`l${i}`} {...l} />
        ))}
        {/* Pulse rings on main node */}
        <PulseRing x={200} y={100} delay={0.6} />
        <PulseRing x={200} y={100} delay={1.4} />
        {/* Nodes */}
        {nodes.map((n, i) => (
          <ConnectionNode key={`n${i}`} {...n} />
        ))}
      </svg>

      {/* Brand text */}
      <div
        className={`flex items-start transition-all duration-700 ${
          showBrand ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <span className="text-4xl md:text-5xl font-bold italic text-blue-500">Code</span>
        <span className="text-4xl md:text-5xl font-bold italic text-emerald-500">Sync</span>
        <span className="text-sm md:text-base font-normal text-slate-500 mt-1 ml-0.5 leading-none">™</span>
      </div>

      {/* Loading indicator */}
      <div
        className={`mt-6 flex items-center gap-2 transition-all duration-500 ${
          showLoading ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '0s' }} />
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: '0.3s' }} />
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '0.6s' }} />
        </div>
        <span className="text-slate-500 text-sm tracking-widest uppercase">Connecting</span>
      </div>
    </div>
  );
}
