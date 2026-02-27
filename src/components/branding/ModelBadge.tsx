/**
 * Printer model badge — displays the Bestcode printer model
 * with blue/green gradient branding matching the official logos.
 *
 * Supports models: Q, Qx, 82, 86, 87, 88, 88S (+ variants)
 */

interface ModelBadgeProps {
  model: string | null | undefined;
  variant?: string | null;
  className?: string;
}

export function ModelBadge({ model, variant, className = '' }: ModelBadgeProps) {
  if (!model) return null;

  // Determine if this is an "S" model (88S variants)
  const isS = variant && /HS|OPQ|FG|MICRO|SEC|HIGH|OPAQUE|FOOD|SECURITY/i.test(variant);
  const displayModel = isS ? `${model}S` : model;

  // Map variant codes to readable subtitles
  const getSubtitle = (): string | null => {
    if (!variant) return null;
    const v = variant.toUpperCase();
    if (/HS\s*1|HIGH\s*SPEED\s*1/i.test(v)) return 'HIGH SPEED 1';
    if (/HS|HIGH\s*SPEED/i.test(v)) return 'HIGH SPEED';
    if (/OPQ|OPAQUE/i.test(v)) return 'OPAQUE';
    if (/FG|FOOD/i.test(v)) return 'FOOD GRADE';
    if (/MICRO/i.test(v)) return 'MICRO';
    if (/SEC|SECURITY/i.test(v)) return 'SECURITY';
    if (/STD|STANDARD/i.test(v)) return null; // Standard — no subtitle
    return null;
  };

  const subtitle = getSubtitle();

  // Q and Qx get a different treatment (smaller, icon-like)
  const isQModel = /^[Qq][Xx]?$/.test(model);

  return (
    <div className={`flex flex-col items-center justify-center leading-none select-none ${className}`}>
      <div className="flex items-baseline gap-0">
        {isQModel ? (
          /* Q / Qx models — stylised letter */
          <span
            className="font-black italic tracking-tight"
            style={{
              fontSize: '1.5rem',
              background: 'linear-gradient(135deg, #1e40af 30%, #10b981 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {model}
          </span>
        ) : (
          /* Numeric models — bold gradient number */
          <span
            className="font-black italic tracking-tighter"
            style={{
              fontSize: '1.75rem',
              lineHeight: 1,
              background: 'linear-gradient(135deg, #1e40af 30%, #10b981 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {displayModel}
          </span>
        )}
      </div>
      {subtitle && (
        <span
          className="font-bold uppercase tracking-widest"
          style={{
            fontSize: '0.4rem',
            lineHeight: 1,
            marginTop: '1px',
            background: 'linear-gradient(135deg, #1e40af 30%, #10b981 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}
