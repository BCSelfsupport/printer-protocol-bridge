import type { FloorKind } from '@/lib/floorPlan';

export function FloorEquipment({ kind, headSide = 'right' }: { kind: FloorKind; headSide?: 'left' | 'right' }) {
  if (kind === 'label') return null;
  return (
    <svg viewBox="0 0 220 110" width="220" height="110" className="floor-equipment" aria-hidden="true">
      {kind === 'printer' ? <g transform={headSide === 'left' ? 'translate(220 0) scale(-1 1)' : undefined}>
        <rect x="65" y="14" width="90" height="82" rx="4" className="floor-belt" />
        <rect x="77" y="24" width="66" height="24" rx="2" className="floor-machine" />
        <path d="M88 35h42M155 62h25v25h20" className="floor-direction" />
        <rect x="196" y="76" width="18" height="22" rx="2" className="floor-machine" />
      </g> : kind === 'straight' ? <>
        <rect x="4" y="25" width="212" height="60" rx="4" className="floor-belt" />
        {Array.from({ length: 15 }, (_, i) => <path key={i} d={`M${12 + i * 14} 30v50`} className="floor-roller" />)}
        <path d="M90 55h40m-12-9 12 9-12 9" className="floor-direction" />
      </> : kind === 'sidegrip' ? <>
        <rect x="4" y="25" width="212" height="60" rx="4" className="floor-belt" />
        {Array.from({ length: 15 }, (_, i) => <path key={i} d={`M${12 + i * 14} 30v50`} className="floor-roller" />)}
        {/* Grip belts on both sides of the conveyor */}
        <rect x="30" y="10" width="160" height="14" rx="7" className="floor-machine" />
        <rect x="30" y="86" width="160" height="14" rx="7" className="floor-machine" />
        {[37, 183].flatMap(x => [17, 93].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" className="floor-roller" />))}
        <path d="M90 55h40m-12-9 12 9-12 9" className="floor-direction" />
      </> : kind === 'roundtable' ? <>
        <circle cx="110" cy="55" r="52" className="floor-belt" />
        <circle cx="110" cy="55" r="20" className="floor-machine" />
        <path d="M110 15a40 40 0 0 1 38 28m-2-11 2 11-10-4" className="floor-direction" />
        <rect x="4" y="25" width="58" height="60" rx="3" className="floor-belt" />
      </> : kind === 'bend' ? <>
        <path d="M5 26h88a100 100 0 0 1 100 100h-58a42 42 0 0 0-42-42H5Z" transform="translate(0 -20)" className="floor-belt" />
        {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${15 + i * 12} 10v50`} className="floor-roller" />)}
        <path d="M115 27q45 10 47 60m-9-10 9 10 9-10" className="floor-direction" />
      </> : <>
        {/* Same belt as a straight conveyor so machines line up at any matching size. */}
        <rect x="4" y="25" width="212" height="60" rx="4" className="floor-belt" />
        {Array.from({ length: 15 }, (_, i) => <path key={i} d={`M${12 + i * 14} 30v50`} className="floor-roller" />)}
        <rect x="50" y="4" width="120" height="102" rx="6" className="floor-machine" />
        {kind === 'filler' ? [74, 98, 122, 146].map(x => <g key={x}><path d={`M${x - 8} 30h16l-8 14Z`} className="floor-machine" /><path d={`M${x} 46v6m0 6v6m0 6v6`} className="floor-direction" /></g>)
        : kind === 'capper' ? <>
          <circle cx="110" cy="55" r="34" className="floor-machine" />
          {[0, 60, 120, 180, 240, 300].map(a => <circle key={a} cx={110 + 24 * Math.cos(a * Math.PI / 180)} cy={55 + 24 * Math.sin(a * Math.PI / 180)} r="6" className="floor-roller" />)}
          <path d="M98 55a12 12 0 1 1 12 12m-6-6 6 6-6 6" className="floor-direction" />
        </> : <>
          <rect x="70" y="25" width="80" height="60" rx="4" className="floor-machine" />
          <path d={kind === 'labeler' ? 'M82 35v40m12-40v40m12-40v40m12-40v40m12-40v40' : 'M80 35h60v40H80Zm0 0 30 20 30-20m-30 20v20'} className="floor-direction" />
        </>}
      </>}
    </svg>
  );
}