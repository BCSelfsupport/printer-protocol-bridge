/**
 * Printer model badge — displays the official Bestcode printer model logo.
 * Uses stable public asset URLs so startup does not depend on image module transforms.
 */

interface ModelBadgeProps {
  model: string | null | undefined;
  variant?: string | null;
  className?: string;
}

const BADGE_MAP: Record<string, string> = {
  '82': '/badge-82.png',
  '86': '/badge-86.png',
  '87': '/badge-86.png', // Discontinued, same class
  '88': '/badge-88.png',
  '88S': '/badge-88s.png',
  'Q': '/badge-q.png',
  'Qx': '/badge-qx.png',
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
        className="h-10 md:h-12 w-auto object-contain"
        draggable={false}
      />
    </div>
  );
}
