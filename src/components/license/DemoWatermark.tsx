import { useLicense } from '@/contexts/LicenseContext';

export function DemoWatermark() {
  const { isDemo } = useLicense();
  if (!isDemo) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center overflow-hidden">
      {/* Repeating diagonal watermark */}
      <div className="absolute inset-0 opacity-[0.07] rotate-[-30deg] scale-150">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="text-6xl font-black tracking-widest text-foreground whitespace-nowrap mb-24">
            DEMO &nbsp; DEMO &nbsp; DEMO &nbsp; DEMO &nbsp; DEMO &nbsp; DEMO
          </div>
        ))}
      </div>
      {/* Top banner */}
      <div className="fixed top-0 left-0 right-0 bg-amber-500/90 text-white text-center text-xs font-bold py-1 z-50 pointer-events-auto">
        DEMONSTRATION MODE — NOT FOR PRODUCTION USE
      </div>
    </div>
  );
}
