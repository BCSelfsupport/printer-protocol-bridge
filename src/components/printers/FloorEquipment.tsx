import type { FloorKind } from '@/lib/floorPlan';

export function FloorEquipment({ kind, headSide = 'right', width = 100, status }: { kind: FloorKind; headSide?: 'left' | 'right'; width?: number; status?: string }) {
  // Width changes only the grey belt; machine (blue) parts keep their size.
  const bh = 60 * width / 100, by = 55 - bh / 2;
  const tall = kind === 'roundtable' ? '0 -55 220 220' : kind === 'labeler' ? '0 -25 220 170' : null;
  if (kind === 'label') return null;
  return (
    <svg viewBox={tall ?? '0 0 220 110'} width="220" height={tall ? Number(tall.split(' ')[3]) : 110} className="floor-equipment" aria-hidden="true">
      {kind === 'printer' ? <g transform={headSide === 'left' ? 'translate(220 0) scale(-1 1)' : undefined}>
        <rect x="65" y="14" width="90" height="82" rx="4" className="floor-belt" />
        <rect x="77" y="24" width="66" height="24" rx="2" className="floor-machine" />
        <path d="M88 35h42M155 62h25v25h20" className="floor-direction" />
        <rect x="196" y="76" width="18" height="22" rx="2" className="floor-machine" />
        {status && <g className={`floor-beacon floor-beacon-${status}`}>
          <circle cx="110" cy="72" r="24" className="floor-beacon-halo" />
          <circle cx="110" cy="72" r="13" className="floor-beacon-light" />
        </g>}
      </g> : kind === 'straight' ? <>
        <rect x="4" y={by} width="212" height={bh} rx="4" className="floor-belt" />
        {Array.from({ length: 15 }, (_, i) => <path key={i} d={`M${12 + i * 14} ${by + 5}v${Math.max(0, bh - 10)}`} className="floor-roller" />)}
        <path d="M90 55h40m-12-9 12 9-12 9" className="floor-direction" />
      </> : kind === 'sidegrip' ? <>
        <rect x="4" y={by} width="212" height={bh} rx="4" className="floor-belt" />
        {Array.from({ length: 15 }, (_, i) => <path key={i} d={`M${12 + i * 14} ${by + 5}v${Math.max(0, bh - 10)}`} className="floor-roller" />)}
        {/* Grip belts on both sides of the conveyor */}
        <rect x="30" y={by - 15} width="160" height="14" rx="7" className="floor-machine" />
        <rect x="30" y={by + bh + 1} width="160" height="14" rx="7" className="floor-machine" />
        {[37, 183].flatMap(x => [by - 8, by + bh + 8].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" className="floor-roller" />))}
        <path d="M90 55h40m-12-9 12 9-12 9" className="floor-direction" />
      </> : kind === 'roundtable' ? <>
        <circle cx="128" cy="55" r="88" className="floor-belt" />
        <circle cx="128" cy="55" r="30" className="floor-machine" />
        <path d="M128 -10a65 65 0 0 1 60 40m-2-13 2 13-12-5" className="floor-direction" />
        <rect x="0" y={by} width="44" height={bh} rx="3" className="floor-belt" />
      </> : kind === 'labeler' ? <>
        {/* Top-down labeler: frame, bottle separators/trimmers, labeling engine with reel, brush */}
        <rect x="92" y="0" width="112" height="78" rx="8" className="floor-machine" />
        <rect x="172" y="6" width="22" height="16" rx="2" className="floor-belt" />
        <rect x="4" y={by} width="212" height={bh} rx="4" className="floor-belt" />
        {Array.from({ length: 15 }, (_, i) => <path key={i} d={`M${12 + i * 14} ${by + 5}v${Math.max(0, bh - 10)}`} className="floor-roller" />)}
        {[24, 62].flatMap(x => [6, 86].map(y => <g key={`${x}-${y}`}><rect x={x} y={y} width="30" height="18" rx="3" className="floor-machine" /><circle cx={x + 22} cy={y + 9} r="4" className="floor-roller" /></g>))}
        <path d="M100 85l42-6 14 28-30 22-34-12Z" className="floor-machine" />
        <circle cx="124" cy="100" r="9" className="floor-roller" />
        <circle cx="78" cy="122" r="22" className="floor-belt" />
        <circle cx="78" cy="122" r="7" className="floor-machine" />
        <rect x="152" y="78" width="6" height="18" rx="1" className="floor-machine" />
        <path d="M90 55h40m-12-9 12 9-12 9" className="floor-direction" />
      </> : kind === 'bend' ? <>
        {(() => { const h = 29 * width / 100, ro = 71 + h, ri = 71 - h; return <>
          <path d={`M5 ${86 - ro}h88a${ro} ${ro} 0 0 1 ${ro} ${ro}h${-2 * h}a${ri} ${ri} 0 0 0 ${-ri} ${-ri}H5Z`} className="floor-belt" />
          {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${15 + i * 12} ${86 - ro + 4}v${Math.max(0, 2 * h - 8)}`} className="floor-roller" />)}
        </>; })()}
        <path d="M115 27q45 10 47 60m-9-10 9 10 9-10" className="floor-direction" />
      </> : <>
        {/* Same belt as a straight conveyor so machines line up at any matching size. */}
        <rect x="4" y={by} width="212" height={bh} rx="4" className="floor-belt" />
        {Array.from({ length: 15 }, (_, i) => <path key={i} d={`M${12 + i * 14} ${by + 5}v${Math.max(0, bh - 10)}`} className="floor-roller" />)}
        <rect x="50" y="4" width="120" height="102" rx="6" className="floor-machine" />
        {kind === 'filler' ? [74, 98, 122, 146].map(x => <g key={x}><path d={`M${x - 8} 30h16l-8 14Z`} className="floor-machine" /><path d={`M${x} 46v6m0 6v6m0 6v6`} className="floor-direction" /></g>)
        : kind === 'capper' ? <>
          <circle cx="110" cy="55" r="34" className="floor-machine" />
          {[0, 60, 120, 180, 240, 300].map(a => <circle key={a} cx={110 + 24 * Math.cos(a * Math.PI / 180)} cy={55 + 24 * Math.sin(a * Math.PI / 180)} r="6" className="floor-roller" />)}
          <path d="M98 55a12 12 0 1 1 12 12m-6-6 6 6-6 6" className="floor-direction" />
        </> : <>
          <rect x="70" y="25" width="80" height="60" rx="4" className="floor-machine" />
          <path d={'M80 35h60v40H80Zm0 0 30 20 30-20m-30 20v20'} className="floor-direction" />
        </>}
      </>}
    </svg>
  );
}