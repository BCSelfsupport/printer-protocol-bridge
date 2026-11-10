import type { FloorKind } from '@/lib/floorPlan';

export function FloorEquipment({ kind }: { kind: FloorKind }) {
  if (kind === 'label') return null;
  return (
    <svg viewBox="0 0 220 110" width="220" height="110" className="floor-equipment" aria-hidden="true">
      {kind === 'printer' ? <>
        <rect x="65" y="14" width="90" height="82" rx="4" className="floor-belt" />
        <rect x="77" y="24" width="66" height="24" rx="2" className="floor-machine" />
        <path d="M88 35h42M155 62h25v25h20" className="floor-direction" />
        <rect x="196" y="76" width="18" height="22" rx="2" className="floor-machine" />
      </> : kind === 'straight' ? <>
        <rect x="4" y="25" width="212" height="60" rx="4" className="floor-belt" />
        {Array.from({ length: 15 }, (_, i) => <path key={i} d={`M${12 + i * 14} 30v50`} className="floor-roller" />)}
        <path d="M90 55h40m-12-9 12 9-12 9" className="floor-direction" />
      </> : kind === 'bend' ? <>
        <path d="M5 26h88a100 100 0 0 1 100 100h-58a42 42 0 0 0-42-42H5Z" transform="translate(0 -20)" className="floor-belt" />
        {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${15 + i * 12} 10v50`} className="floor-roller" />)}
        <path d="M115 27q45 10 47 60m-9-10 9 10 9-10" className="floor-direction" />
      </> : <>
        <rect x="25" y="10" width="170" height="90" rx="6" className="floor-belt" />
        <rect x="4" y="44" width="212" height="22" rx="2" className="floor-machine" />
        {kind === 'filler' || kind === 'capper' ? [65, 95, 125, 155].map(x => <g key={x}><circle cx={x} cy="32" r="8" className="floor-machine" /><path d={`M${x} 40v30`} className="floor-direction" /></g>) : <>
          <rect x="65" y="25" width="90" height="60" rx="4" className="floor-machine" />
          <path d={kind === 'labeler' ? 'M80 35v40m12-40v40m12-40v40m12-40v40m12-40v40' : 'M80 35h60v40H80Zm0 0 30 20 30-20m-30 20v20'} className="floor-direction" />
        </>}
      </>}
    </svg>
  );
}