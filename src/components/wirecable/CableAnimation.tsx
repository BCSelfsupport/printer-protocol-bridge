import { useEffect, useRef, useState } from 'react';
import { renderText, getFontInfo } from '@/lib/dotMatrixFonts';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MessageFieldForCable {
  data: string;
  x: number;
  y: number;
  fontSize: string;
  type?: string;
}

interface CableAnimationProps {
  pitchMm: number;
  flipFlopEnabled: boolean;
  orientationA: string;
  orientationB: string;
  isRunning: boolean;
  messageFields?: MessageFieldForCable[];
  messageHeight?: number;
  unit?: 'mm' | 'inches';
  desiredPitch?: number;
}

/** Apply printer orientation transform to canvas context.
 *  Tower rotation is handled by pre-rendered tower canvas, so only flip/mirror here. */
function applyOrientation(ctx: CanvasRenderingContext2D, orientation: string) {
  switch (orientation) {
    case 'Flip':
      ctx.scale(1, -1);
      break;
    case 'Mirror':
      ctx.scale(-1, 1);
      break;
    case 'Mirror Flip':
      ctx.scale(-1, -1);
      break;
    case 'Tower':
      // rotation handled by tower canvas
      break;
    case 'Tower Flip':
      ctx.scale(1, -1);
      break;
    case 'Tower Mirror':
      ctx.scale(-1, 1);
      break;
    case 'Tower Mirror Flip':
      ctx.scale(-1, -1);
      break;
    // 'Normal' = no transform
  }
}

export function CableAnimation({ pitchMm, flipFlopEnabled, orientationA, orientationB, isRunning, messageFields, messageHeight, unit = 'mm', desiredPitch }: CableAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const offsetRef = useRef(0);
  const [direction, setDirection] = useState<'left' | 'right'>('left'); // left = cable moves left (right-to-left)

  // Pre-render message to offscreen canvases (normal + tower variant)
  const messageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const towerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!messageFields || messageFields.length === 0 || !messageHeight) {
      messageCanvasRef.current = null;
      towerCanvasRef.current = null;
      return;
    }

    const DOT_SIZE = 6;
    const totalHeight = 32;

    let maxRight = 0;
    for (const field of messageFields) {
      if (field.type === 'barcode') continue;
      const fontInfo = getFontInfo(field.fontSize);
      const fieldRight = field.x + field.data.length * (fontInfo.charWidth + 1);
      if (fieldRight > maxRight) maxRight = fieldRight;
    }

    const canvasW = Math.max(maxRight + 2, 20) * DOT_SIZE;
    const canvasH = totalHeight * DOT_SIZE;

    // --- Normal render ---
    const offscreen = document.createElement('canvas');
    offscreen.width = canvasW;
    offscreen.height = canvasH;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasW, canvasH);
    for (const field of messageFields) {
      if (field.type === 'barcode') continue;
      ctx.fillStyle = '#ffffff';
      renderText(ctx, field.data, field.x * DOT_SIZE, field.y * DOT_SIZE, field.fontSize, DOT_SIZE);
    }

    // --- Tower render: rotate each character 90° individually ---
    // After 90° CW rotation, each char's W and H swap in the output
    // We need a wider canvas to accommodate the swapped dimensions
    let towerTotalW = 0;
    let towerMaxH = 0;
    for (const field of messageFields) {
      if (field.type === 'barcode') continue;
      const fontInfo = getFontInfo(field.fontSize);
      const charH = fontInfo.height * DOT_SIZE; // becomes width after rotation
      towerTotalW += field.data.length * (charH + DOT_SIZE); // rotated chars laid out horizontally
      const charW = (fontInfo.charWidth + 1) * DOT_SIZE; // becomes height after rotation
      if (charW > towerMaxH) towerMaxH = charW;
    }

    const towerOffscreen = document.createElement('canvas');
    towerOffscreen.width = Math.max(towerTotalW + 20, canvasW);
    towerOffscreen.height = canvasH;
    const tCtx = towerOffscreen.getContext('2d');
    if (tCtx) {
      tCtx.clearRect(0, 0, towerOffscreen.width, towerOffscreen.height);

      // Flatten all fields into a single character sequence with spaces between fields
      // so tower layout uses rotated widths consistently
      const allChars: { char: string; fontSize: string; fieldY: number }[] = [];
      const sortedFields = [...messageFields].filter(f => f.type !== 'barcode').sort((a, b) => a.x - b.x);
      
      for (let fi = 0; fi < sortedFields.length; fi++) {
        const field = sortedFields[fi];
        // Add gap between fields as space characters
        if (fi > 0) {
          const prevField = sortedFields[fi - 1];
          const prevFontInfo = getFontInfo(prevField.fontSize);
          const prevEnd = prevField.x + prevField.data.length * (prevFontInfo.charWidth + 1);
          const gapDots = Math.max(0, field.x - prevEnd);
          const gapChars = Math.round(gapDots / (getFontInfo(field.fontSize).charWidth + 1));
          for (let g = 0; g < gapChars; g++) {
            allChars.push({ char: ' ', fontSize: field.fontSize, fieldY: field.y });
          }
        }
        for (const char of field.data) {
          allChars.push({ char, fontSize: field.fontSize, fieldY: field.y });
        }
      }

      let outX = 0;
      for (const { char, fontSize, fieldY } of allChars) {
        const fontInfo = getFontInfo(fontSize);
        const charW = fontInfo.charWidth * DOT_SIZE;
        const charH = fontInfo.height * DOT_SIZE;
        const rotatedW = charH;
        const rotatedH = charW;
        const outY = fieldY * DOT_SIZE;

        // Render single char to temp canvas
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = charW;
        tmpCanvas.height = charH;
        const tmpCtx = tmpCanvas.getContext('2d');
        if (tmpCtx) {
          tmpCtx.fillStyle = '#ffffff';
          renderText(tmpCtx, char, 0, 0, fontSize, DOT_SIZE);

          tCtx.save();
          tCtx.translate(outX + rotatedW / 2, outY + rotatedH / 2);
          tCtx.rotate(-Math.PI / 2);
          tCtx.drawImage(tmpCanvas, -charW / 2, -charH / 2);
          tCtx.restore();
        }
        outX += rotatedW + DOT_SIZE;
      }
    }

    // Crop helper
    function cropCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
      const sCtx = source.getContext('2d');
      if (!sCtx) return source;
      const imageData = sCtx.getImageData(0, 0, source.width, source.height);
      const d = imageData.data;
      let minX = source.width, minY = source.height, maxX = -1, maxY = -1;
      for (let y = 0; y < source.height; y++) {
        for (let x = 0; x < source.width; x++) {
          if (d[(y * source.width + x) * 4 + 3] > 0) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX === -1) return source;
      const pad = 2;
      const cX = Math.max(0, minX - pad);
      const cY = Math.max(0, minY - pad);
      const cW = Math.min(source.width - cX, maxX - minX + 1 + pad * 2);
      const cH = Math.min(source.height - cY, maxY - minY + 1 + pad * 2);
      const cropped = document.createElement('canvas');
      cropped.width = cW;
      cropped.height = cH;
      const croppedCtx = cropped.getContext('2d');
      if (!croppedCtx) return source;
      croppedCtx.drawImage(source, cX, cY, cW, cH, 0, 0, cW, cH);
      return cropped;
    }

    messageCanvasRef.current = cropCanvas(offscreen);
    towerCanvasRef.current = cropCanvas(towerOffscreen);
  }, [messageFields, messageHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;

    // Cable visual parameters
    const cableY = H * 0.5;
    const cableH = 28;
    const spoolR = 40;
    // Spool position depends on direction: left flow = spool on right, right flow = spool on left
    const spoolCX = direction === 'left' ? W - 50 : 50;
    const spoolCY = cableY;

    // Scale: 1 pixel = 1mm, but clamp for display
    const pixelsPerMm = Math.min(1, (W - 140) / Math.max(pitchMm * 3, 300));
    const pitchPx = pitchMm * pixelsPerMm;

    const hasMessage = !!messageCanvasRef.current;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Background grid
      ctx.strokeStyle = 'hsl(220, 20%, 25%)';
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.3;
      for (let x = 0; x < W; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Spool
      ctx.save();
      ctx.translate(spoolCX, spoolCY);
      ctx.strokeStyle = 'hsl(207, 90%, 54%)';
      ctx.lineWidth = 2;

      // Spool outer circle
      ctx.beginPath();
      ctx.arc(0, 0, spoolR, 0, Math.PI * 2);
      ctx.fillStyle = 'hsl(220, 20%, 18%)';
      ctx.fill();
      ctx.stroke();

      // Inner hub
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = 'hsl(220, 20%, 30%)';
      ctx.fill();
      ctx.stroke();

      // Spokes (animated)
      const spokeAngle = (offsetRef.current / 50) % (Math.PI * 2);
      for (let i = 0; i < 6; i++) {
        const a = spokeAngle + (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.lineTo(Math.cos(a) * (spoolR - 4), Math.sin(a) * (spoolR - 4));
        ctx.strokeStyle = 'hsl(207, 50%, 40%)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Cable wraps on spool
      for (let r = spoolR - 6; r > 16; r -= 4) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = `hsl(30, 10%, ${35 + (spoolR - r)}%)`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.restore();

      // Cable strip — extends from the non-spool side
      const cableStart = direction === 'left' ? 20 : spoolCX + spoolR + 5;
      const cableEnd = direction === 'left' ? spoolCX - spoolR - 5 : W - 20;
      const gradient = ctx.createLinearGradient(0, cableY - cableH / 2, 0, cableY + cableH / 2);
      gradient.addColorStop(0, 'hsl(220, 10%, 50%)');
      gradient.addColorStop(0.3, 'hsl(220, 10%, 60%)');
      gradient.addColorStop(0.5, 'hsl(220, 10%, 65%)');
      gradient.addColorStop(0.7, 'hsl(220, 10%, 60%)');
      gradient.addColorStop(1, 'hsl(220, 10%, 45%)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(cableStart, cableY - cableH / 2, cableEnd - cableStart, cableH, 2);
      ctx.fill();

      // Clip print marks to cable strip area (prevent overflow onto spool)
      const clipMargin = spoolR + 15;
      ctx.save();
      ctx.beginPath();
      if (direction === 'left') {
        // Spool on right — clip right edge
        ctx.rect(cableStart, 0, cableEnd - cableStart - clipMargin, H);
      } else {
        // Spool on left — clip left edge (cableStart already accounts for spool)
        ctx.rect(cableStart, 0, cableEnd - cableStart, H);
      }
      ctx.clip();

      // Print head position — 1/4 of cable length from the spool side
      const cableLen = cableEnd - cableStart;
      const printHeadX = direction === 'left' ? cableEnd - cableLen * 0.25 : cableStart + cableLen * 0.25;

      // Print marks on cable — use stable index based on scroll offset
      const markOffset = offsetRef.current % pitchPx;
      const baseIndex = Math.floor(offsetRef.current / pitchPx);
      let markIndex = 0;
      for (let x = cableStart + 20 - markOffset; x < cableEnd - 10; x += pitchPx) {
        if (x < cableStart + 5) { markIndex++; continue; }
        const stableIndex = baseIndex + markIndex;
        const isFlipped = flipFlopEnabled && stableIndex % 2 === 1;
        const currentOrientation = isFlipped ? orientationB : orientationA;

        ctx.save();
        ctx.translate(x, cableY);

        if (hasMessage) {
          // Pick tower canvas for tower orientations, normal canvas otherwise
          const isTower = currentOrientation.startsWith('Tower');
          const msgCanvas = (isTower && towerCanvasRef.current) ? towerCanvasRef.current : messageCanvasRef.current!;
          const maxH = cableH * 0.42;
          const maxW = pitchPx * 0.9;
          const scaleH = maxH / msgCanvas.height;
          const scaleW = maxW > 0 ? maxW / msgCanvas.width : scaleH;
          const scale = Math.min(scaleH, scaleW);
          const drawW = msgCanvas.width * scale;
          const drawH = msgCanvas.height * scale;

          // Progressive reveal clip (before flip transform)
          let shouldDraw = true;
          if (direction === 'left') {
            const visibleW = Math.min(drawW, printHeadX - x);
            if (visibleW <= 0) { shouldDraw = false; }
            else {
              ctx.save();
              ctx.beginPath();
              ctx.rect(0, -drawH, visibleW, drawH * 2);
              ctx.clip();
            }
          } else {
            const clipStart = Math.max(0, printHeadX - x);
            const visibleW = drawW - clipStart;
            if (visibleW <= 0) { shouldDraw = false; }
            else {
              ctx.save();
              ctx.beginPath();
              ctx.rect(clipStart, -drawH, visibleW, drawH * 2);
              ctx.clip();
            }
          }

          if (shouldDraw) {
            // Apply orientation transform AFTER clipping
            // Translate to center of message, apply transform, then draw centered
            ctx.translate(drawW / 2, 0);
            applyOrientation(ctx, currentOrientation);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(msgCanvas, -drawW / 2, -drawH / 2, drawW, drawH);
            ctx.imageSmoothingEnabled = true;
            ctx.restore(); // restore clip
          } else {
            ctx.restore();
            markIndex++;
            continue;
          }
        } else {
          // Fallback: orientation label
          applyOrientation(ctx, currentOrientation);
          const markLabel = currentOrientation.substring(0, 3).toUpperCase();

          ctx.fillStyle = 'hsl(207, 90%, 54%)';
          ctx.globalAlpha = 0.9;
          ctx.fillRect(-15, -8, 30, 16);
          ctx.globalAlpha = 1;

          ctx.fillStyle = '#fff';
          ctx.font = 'bold 7px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(markLabel, 0, 0);
        }

        ctx.restore();

        // Pitch dimension line below cable
        if (x + pitchPx < cableEnd - 10) {
          const nextX = x + pitchPx;
          const dimY = cableY + cableH / 2 + 14;

          ctx.strokeStyle = 'hsl(207, 60%, 50%)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);

          // Left tick
          ctx.beginPath(); ctx.moveTo(x, cableY + cableH / 2 + 4); ctx.lineTo(x, dimY + 4); ctx.stroke();
          // Right tick
          ctx.beginPath(); ctx.moveTo(nextX, cableY + cableH / 2 + 4); ctx.lineTo(nextX, dimY + 4); ctx.stroke();
          // Horizontal
          ctx.beginPath(); ctx.moveTo(x, dimY); ctx.lineTo(nextX, dimY); ctx.stroke();

          ctx.setLineDash([]);

          // Pitch label - show in user's unit
          const pitchLabel = unit === 'inches' && desiredPitch != null
            ? `${desiredPitch.toFixed(2)} in`
            : `${pitchMm.toFixed(0)}mm`;
          ctx.fillStyle = 'hsl(207, 60%, 60%)';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(pitchLabel, (x + nextX) / 2, dimY + 14);
        }

        markIndex++;
      }

      ctx.restore(); // End clip region

      // Print head indicator
      ctx.strokeStyle = 'hsl(0, 70%, 55%)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(printHeadX, cableY - cableH / 2 - 6);
      ctx.lineTo(printHeadX, cableY + cableH / 2 + 6);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrow showing direction of travel — left arrow = flow right-to-left
      const arrowX = direction === 'left' ? cableStart + 15 : cableEnd - 15;
      ctx.fillStyle = 'hsl(142, 71%, 45%)';
      ctx.beginPath();
      if (direction === 'left') {
        // Flow right-to-left: arrow points left
        ctx.moveTo(arrowX, cableY - 6);
        ctx.lineTo(arrowX - 10, cableY);
        ctx.lineTo(arrowX, cableY + 6);
      } else {
        // Flow left-to-right: arrow points right
        ctx.moveTo(arrowX, cableY - 6);
        ctx.lineTo(arrowX + 10, cableY);
        ctx.lineTo(arrowX, cableY + 6);
      }
      ctx.closePath();
      ctx.fill();

      // Animate — left direction = cable content scrolls right-to-left
      if (isRunning) {
        offsetRef.current += direction === 'left' ? 0.5 : -0.5;
      }
      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [pitchMm, flipFlopEnabled, orientationA, orientationB, isRunning, messageFields, messageHeight, direction, unit, desiredPitch]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="panel p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cable Preview</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Direction</span>
          <button
            onClick={() => setDirection('left')}
            className={`p-1 rounded transition-colors ${direction === 'left' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            title="Cable moves left (right-to-left)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDirection('right')}
            className={`p-1 rounded transition-colors ${direction === 'right' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            title="Cable moves right (left-to-right)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full rounded-md bg-card border border-border"
        style={{ height: 160 }}
      />
    </div>
  );
}
