/**
 * Printer model badge — displays the official Bestcode printer model logo.
 * Uses pre-generated badge images for each model.
 */

import badge82 from '@/assets/badge-82.png';
import badge86 from '@/assets/badge-86.png';
import badge88 from '@/assets/badge-88.png';
import badge88s from '@/assets/badge-88s.png';
import badgeQ from '@/assets/badge-q.png';
import badgeQx from '@/assets/badge-qx.png';

interface ModelBadgeProps {
  model: string | null | undefined;
  variant?: string | null;
  className?: string;
}

const BADGE_MAP: Record<string, string> = {
  '82': badge82,
  '86': badge86,
  '87': badge86, // Discontinued, same class
  '88': badge88,
  '88S': badge88s,
  'Q': badgeQ,
  'Qx': badgeQx,
};

export function ModelBadge({ model, variant, className = '' }: ModelBadgeProps) {
  if (!model) return null;

  // Determine if this is an "S" model (88S variants)
  const isS = variant && /HS|OPQ|FG|MICRO|SEC|HIGH|OPAQUE|FOOD|SECURITY/i.test(variant);
  const displayModel = isS ? `${model}S` : model;

  // Try exact match, then base model
  const badge = BADGE_MAP[displayModel] || BADGE_MAP[model] || null;

  if (!badge) return null;

  return (
    <div className={`select-none ${className}`}>
      <img
        src={badge}
        alt={`Bestcode Model ${displayModel}`}
        className="h-9 md:h-10 w-auto object-contain"
        draggable={false}
      />
    </div>
  );
}
