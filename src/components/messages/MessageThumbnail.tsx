import { useEffect, useRef } from 'react';
import { renderText } from '@/lib/dotMatrixFonts';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';

interface MessageThumbnailProps {
  details: MessageDetails;
  /** Pixel size of each dot. Smaller = more compact thumbnail. */
  dotSize?: number;
  /** Max display height in CSS pixels (canvas will scale to fit) */
  maxHeight?: number;
}

/**
 * Compact dot-matrix preview of a message, suitable for tile views.
 * Uses the same renderText engine as the main canvas so the look matches.
 */
export function MessageThumbnail({ details, dotSize = 2, maxHeight = 80 }: MessageThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const totalRows = 32; // canvas vertical space (matches MessageCanvas)
    const widthDots = Math.max(details.width || 200, 60);

    canvas.width = widthDots * dotSize;
    canvas.height = totalRows * dotSize;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = 'hsl(220, 13%, 12%)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle dot grid
    ctx.fillStyle = 'hsl(220, 13%, 18%)';
    for (let r = 0; r < totalRows; r += 4) {
      for (let c = 0; c < widthDots; c += 4) {
        ctx.fillRect(c * dotSize, r * dotSize, 1, 1);
      }
    }

    // Render each field
    ctx.fillStyle = 'hsl(160, 84%, 55%)'; // emerald — printer ink look
    for (const field of details.fields || []) {
      // Skip non-renderable types (graphics, barcodes) — show placeholder
      if (field.type === 'logo' || field.type === 'barcode') {
        ctx.save();
        ctx.fillStyle = 'hsl(160, 84%, 55%)';
        ctx.fillRect(
          field.x * dotSize,
          field.y * dotSize,
          field.width * dotSize,
          field.height * dotSize,
        );
        ctx.restore();
        continue;
      }

      const text = field.data || '';
      if (!text) continue;
      try {
        renderText(
          ctx,
          text,
          field.x * dotSize,
          field.y * dotSize,
          field.fontSize || 'Standard16High',
          dotSize,
          field.gap ?? 1,
        );
      } catch {
        // ignore render errors per-field
      }
    }
  }, [details, dotSize]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        maxHeight,
        maxWidth: '100%',
        height: 'auto',
        width: 'auto',
        imageRendering: 'pixelated',
      }}
    />
  );
}
