/**
 * Video editing helpers for training recordings.
 *
 * `editVideo` re-encodes a recorded blob through a canvas so we can
 *  - trim the timeline (start / end seconds)
 *  - crop pixels off the top of the frame (Lovable banner)
 *
 * MediaRecorder webm blobs usually report `duration === Infinity`, so we force
 * the browser to resolve the real duration with a huge seek before doing
 * anything else.
 */

import fixWebmDuration from 'fix-webm-duration';

const log = (...args: any[]) => console.log('[videoEditor]', ...args);

async function loadVideo(url: string): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.src = url;
  video.muted = false;
  video.playsInline = true;
  video.preload = 'auto';
  (video as any).crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('Timed out loading video metadata')), 15000);
    video.onloadedmetadata = () => { clearTimeout(to); resolve(); };
    video.onerror = () => { clearTimeout(to); reject(new Error('Failed to load source video')); };
  });

  return video;
}

async function resolveDuration(video: HTMLVideoElement): Promise<number> {
  if (isFinite(video.duration) && video.duration > 0) return video.duration;

  const duration = await new Promise<number>((resolve) => {
    const onSeeked = () => {
      const d = video.duration;
      video.removeEventListener('seeked', onSeeked);
      resolve(isFinite(d) && d > 0 ? d : 0);
    };
    video.addEventListener('seeked', onSeeked);
    try {
      video.currentTime = 1e9;
    } catch {
      video.removeEventListener('seeked', onSeeked);
      resolve(0);
    }
  });

  await seekTo(video, 0);
  return duration;
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const to = setTimeout(() => { video.removeEventListener('seeked', onSeeked); resolve(); }, 5000);
    const onSeeked = () => { clearTimeout(to); video.removeEventListener('seeked', onSeeked); resolve(); };
    video.addEventListener('seeked', onSeeked);
    try { video.currentTime = time; } catch { clearTimeout(to); resolve(); }
  });
}

/** Probe a recorded blob for its real duration and pixel dimensions. */
export async function probeVideo(blob: Blob): Promise<{ duration: number; width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const video = await loadVideo(url);
    const duration = await resolveDuration(video);
    return { duration, width: video.videoWidth, height: video.videoHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface EditVideoOptions {
  /** Pixels to remove from the top of the frame. */
  cropTopPx?: number;
  /** Trim start in seconds. */
  startSec?: number;
  /** Trim end in seconds (defaults to full duration). */
  endSec?: number;
  /** Branded opening card: the video title (omit to skip the intro). */
  introTitle?: string;
  /** Small line under the title on the opening card. */
  introSubtitle?: string;
  /** Seconds of opening card (default 2.6). */
  introSec?: number;
  /** Branded closing card (default on when introTitle is set). */
  outro?: boolean;
  /** Seconds of closing card (default 2.2). */
  outroSec?: number;
}

const BRAND_LOGO_SRC = '/codesync-icon.png';

function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = BRAND_LOGO_SRC;
  });
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

interface CardSpec {
  title: string;
  subtitle?: string;
  kicker?: string;
  logo: HTMLImageElement | null;
  variant: 'intro' | 'outro';
}

const INK = '#3b82f6';
const INK_2 = '#10b981';

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, max = 2): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, max);
}

/**
 * Dot-matrix "print head" field — a nod to how a CIJ printer lays down a code.
 * A vertical head sweeps across the frame; dots behind it are inked, ahead dim.
 */
function drawDotField(ctx: CanvasRenderingContext2D, w: number, h: number, p: number, s: number) {
  const gap = 26 * s;
  const r = 1.7 * s;
  const head = easeInOut(p / 0.72) * (w + gap * 6) - gap * 3;

  for (let x = gap / 2; x < w; x += gap) {
    const behind = head - x;
    if (behind < -gap) continue;
    // Fresh ink glows, then settles into a faint dot.
    const fresh = clamp01(1 - behind / (gap * 10));
    for (let y = gap / 2; y < h; y += gap) {
      const wave = 0.5 + 0.5 * Math.sin(x * 0.008 + y * 0.011 + p * 5);
      const a = 0.045 + fresh * 0.5 * wave;
      ctx.fillStyle = fresh > 0.05
        ? `rgba(96,165,250,${a})`
        : `rgba(148,163,184,${0.05 + wave * 0.03})`;
      ctx.beginPath();
      ctx.arc(x, y, r * (1 + fresh * 1.3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The head itself
  if (head > 0 && head < w) {
    const g = ctx.createLinearGradient(head - 90 * s, 0, head + 6 * s, 0);
    g.addColorStop(0, 'rgba(59,130,246,0)');
    g.addColorStop(1, 'rgba(147,197,253,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(head - 90 * s, 0, 96 * s, h);
    ctx.fillStyle = 'rgba(191,219,254,0.55)';
    ctx.fillRect(head, 0, Math.max(1, 2 * s), h);
  }
}

/** Draw one frame of a branded title / closing card. `p` = 0..1 progress. */
function drawCard(ctx: CanvasRenderingContext2D, w: number, h: number, p: number, card: CardSpec) {
  const s = h / 1080;
  const outFade = p > 0.9 ? 1 - (p - 0.9) / 0.1 : 1;
  const A = clamp01(outFade);

  // --- Background -----------------------------------------------------------
  const bg = ctx.createLinearGradient(0, 0, w * 0.4, h);
  bg.addColorStop(0, '#080c15');
  bg.addColorStop(0.6, '#050810');
  bg.addColorStop(1, '#04070c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const glowA = ctx.createRadialGradient(w * 0.14, h * 0.9, 0, w * 0.14, h * 0.9, w * 0.6);
  glowA.addColorStop(0, 'rgba(37,99,235,0.28)');
  glowA.addColorStop(1, 'rgba(37,99,235,0)');
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, w, h);

  const glowB = ctx.createRadialGradient(w * 0.88, h * 0.08, 0, w * 0.88, h * 0.08, w * 0.5);
  glowB.addColorStop(0, 'rgba(16,185,129,0.16)');
  glowB.addColorStop(1, 'rgba(16,185,129,0)');
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, w, h);

  drawDotField(ctx, w, h, p, s);

  // Vignette
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.95);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = A;

  // Corner brackets
  const m = 56 * s;
  const len = 70 * s * easeOut((p - 0.05) / 0.35);
  ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.lineWidth = Math.max(1, 2 * s);
  if (len > 1) {
    const corners: Array<[number, number, number, number]> = [
      [m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + dx * len, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * len);
      ctx.stroke();
    }
  }

  const centered = card.variant === 'outro';
  const left = w * 0.115;
  const cx = centered ? w / 2 : left;
  ctx.textAlign = centered ? 'center' : 'left';

  // --- Logo -----------------------------------------------------------------
  const logoP = easeOut(p / 0.3);
  if (card.logo) {
    const size = (centered ? 200 : 108) * s;
    const lx = centered ? cx - size / 2 : left;
    const ly = centered ? h * 0.24 : h * 0.30 - size;
    ctx.save();
    ctx.globalAlpha = A * logoP;
    ctx.shadowColor = 'rgba(59,130,246,0.6)';
    ctx.shadowBlur = 60 * s;
    const pop = 0.92 + 0.08 * logoP;
    ctx.drawImage(
      card.logo,
      lx + (size * (1 - pop)) / 2,
      ly + (size * (1 - pop)) / 2 + (1 - logoP) * 18 * s,
      size * pop,
      size * pop,
    );
    ctx.restore();
  }

  // --- Kicker ---------------------------------------------------------------
  const kickP = easeOut((p - 0.1) / 0.3);
  if (card.kicker && kickP > 0) {
    ctx.globalAlpha = A * kickP;
    ctx.fillStyle = 'rgba(147,197,253,0.9)';
    ctx.font = `600 ${Math.round(24 * s)}px "JetBrains Mono", "SFMono-Regular", ui-monospace, monospace`;
    const spaced = card.kicker.toUpperCase().split('').join('\u2009');
    const ky = centered ? h * 0.60 : h * 0.395;
    ctx.fillText(spaced, cx, ky);
  }

  // --- Accent rule ----------------------------------------------------------
  const ruleP = easeOut((p - 0.16) / 0.4);
  if (ruleP > 0) {
    const rw = (centered ? 340 : 260) * s * ruleP;
    const rx = centered ? cx - rw / 2 : left;
    const ry = centered ? h * 0.635 : h * 0.435;
    const g = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    g.addColorStop(0, INK);
    g.addColorStop(1, centered ? 'rgba(16,185,129,0)' : INK_2);
    ctx.globalAlpha = A;
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, Math.max(2, 5 * s));
  }

  // --- Title (word-by-word reveal) -----------------------------------------
  let fontSize = Math.round((centered ? 96 : 88) * s);
  const maxW = w * (centered ? 0.74 : 0.78);
  ctx.font = `800 ${fontSize}px "Inter", system-ui, sans-serif`;
  let lines = wrapLines(ctx, card.title, maxW);
  while (lines.length && ctx.measureText(lines[0]).width > maxW && fontSize > 30 * s) {
    fontSize = Math.round(fontSize * 0.92);
    ctx.font = `800 ${fontSize}px "Inter", system-ui, sans-serif`;
    lines = wrapLines(ctx, card.title, maxW);
  }

  const baseY = centered ? h * 0.76 : h * 0.56;
  let wordIndex = 0;
  const totalWords = Math.max(1, card.title.split(/\s+/).length);
  lines.forEach((lineText, li) => {
    const words = lineText.split(' ');
    const lineW = ctx.measureText(lineText).width;
    let penX = centered ? cx - lineW / 2 : left;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    for (const word of words) {
      const delay = 0.2 + (wordIndex / totalWords) * 0.35;
      const wp = easeOut((p - delay) / 0.32);
      ctx.globalAlpha = A * clamp01(wp);
      ctx.fillStyle = '#f8fafc';
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 18 * s;
      ctx.fillText(word, penX, baseY + li * fontSize * 1.12 + (1 - clamp01(wp)) * 26 * s);
      ctx.restore();
      penX += ctx.measureText(word + ' ').width;
      wordIndex++;
    }
    ctx.textAlign = prevAlign;
  });

  // --- Subtitle -------------------------------------------------------------
  if (card.subtitle) {
    const subP = easeOut((p - 0.45) / 0.35);
    ctx.globalAlpha = A * clamp01(subP);
    ctx.fillStyle = 'rgba(203,213,225,0.82)';
    ctx.font = `400 ${Math.round(34 * s)}px "Inter", system-ui, sans-serif`;
    ctx.fillText(
      card.subtitle,
      cx,
      baseY + (lines.length - 1) * fontSize * 1.12 + 62 * s,
    );
  }

  // --- Footer rule + marks --------------------------------------------------
  ctx.globalAlpha = A;
  const fy = h - 56 * s;
  const fw = (w - 2 * left) * easeOut((p - 0.25) / 0.5);
  const fg = ctx.createLinearGradient(left, 0, left + fw, 0);
  fg.addColorStop(0, 'rgba(59,130,246,0.75)');
  fg.addColorStop(1, 'rgba(16,185,129,0)');
  ctx.fillStyle = fg;
  ctx.fillRect(left, fy, fw, Math.max(1, 2 * s));

  ctx.globalAlpha = A * easeOut((p - 0.35) / 0.4);
  ctx.fillStyle = 'rgba(148,163,184,0.75)';
  ctx.font = `500 ${Math.round(20 * s)}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('BESTCODE  ·  CODESYNC', left, fy + 34 * s);
  ctx.textAlign = 'right';
  ctx.fillText(card.variant === 'intro' ? 'TRAINING' : 'END OF LESSON', w - left, fy + 34 * s);

  ctx.restore();
}

function playCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  durationSec: number,
  card: CardSpec,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const p = (performance.now() - start) / (durationSec * 1000);
      drawCard(ctx, w, h, Math.min(1, p), card);
      if (p >= 1) { resolve(); return; }
      requestAnimationFrame(tick);
    };
    tick();
  });
}



export async function editVideo(
  sourceBlob: Blob,
  options: EditVideoOptions,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const url = URL.createObjectURL(sourceBlob);

  try {
    const video = await loadVideo(url);
    const duration = await resolveDuration(video);

    const cropTopPx = Math.max(0, options.cropTopPx ?? 0);
    const startSec = Math.max(0, options.startSec ?? 0);
    const endSec = Math.min(
      duration > 0 ? duration : Number.MAX_SAFE_INTEGER,
      options.endSec && options.endSec > 0 ? options.endSec : (duration || Number.MAX_SAFE_INTEGER),
    );
    const span = Math.max(0.1, endSec - startSec);

    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    const crop = Math.max(0, Math.min(cropTopPx, srcH - 10));
    const outW = srcW;
    const outH = srcH - crop;
    log('source', srcW, 'x', srcH, '→', outW, 'x', outH, 'trim', startSec, '→', endSec, 'of', duration);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not available');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, outW, outH);

    // Move the playhead to the trim start before we start recording.
    if (startSec > 0) await seekTo(video, startSec);

    const fps = 30;
    const canvasStream = (canvas as any).captureStream(fps) as MediaStream;

    let audioTrack: MediaStreamTrack | null = null;
    let audioCtx: AudioContext | null = null;
    try {
      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      audioCtx = new AudioCtx();
      const source = audioCtx.createMediaElementSource(video);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      const gain = audioCtx.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(audioCtx.destination);
      audioTrack = dest.stream.getAudioTracks()[0] ?? null;
    } catch (e) {
      log('no audio track captured', e);
    }

    const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
    if (audioTrack) tracks.push(audioTrack);
    const combined = new MediaStream(tracks);

    const mimeCandidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const mimeType = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 8_000_000 });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    const stopped = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    });

    const recordStartedAt = performance.now();
    recorder.start(500);

    // Branded opening card
    const introTitle = options.introTitle?.trim();
    if (introTitle) {
      const logo = await loadLogo();
      await playCard(ctx, outW, outH, Math.max(1, options.introSec ?? 3.2), {
        title: introTitle,
        subtitle: options.introSubtitle?.trim() || 'BestCode CodeSync — Training',
        kicker: 'Training',
        logo,
        variant: 'intro',
      });
    }

    let raf = 0;
    let stopRequested = false;


    const draw = () => {
      if (stopRequested) return;
      try {
        ctx.drawImage(video, 0, crop, srcW, outH, 0, 0, outW, outH);
      } catch {
        // ignore transient draw errors
      }
      onProgress?.(Math.max(0, Math.min(99, ((video.currentTime - startSec) / span) * 100)));
      raf = requestAnimationFrame(draw);
    };

    try {
      await video.play();
    } catch (e) {
      log('video.play() rejected', e);
    }
    draw();

    await new Promise<void>((resolve) => {
      let resolved = false;
      let lastTime = -1;
      let stallCount = 0;
      const finish = (reason: string) => {
        if (resolved) return;
        resolved = true;
        log('finish:', reason, 'at', video.currentTime);
        resolve();
      };

      video.onended = () => finish('ended event');

      const watchdog = window.setInterval(() => {
        if (resolved) { clearInterval(watchdog); return; }
        const t = video.currentTime;
        if (t >= endSec - 0.03) {
          clearInterval(watchdog);
          finish('reached trim end');
          return;
        }
        if (Math.abs(t - lastTime) < 0.01) {
          stallCount++;
          if (stallCount >= 5) {
            clearInterval(watchdog);
            finish(`stalled at ${t}s`);
          }
        } else {
          stallCount = 0;
        }
        lastTime = t;
      }, 100);

      window.setTimeout(() => {
        clearInterval(watchdog);
        finish('hard timeout 10min');
      }, 10 * 60 * 1000);
    });

    stopRequested = true;
    cancelAnimationFrame(raf);
    try { video.pause(); } catch {}
    try { ctx.drawImage(video, 0, crop, srcW, outH, 0, 0, outW, outH); } catch {}

    // Branded closing card
    const wantOutro = options.outro ?? Boolean(options.introTitle?.trim());
    if (wantOutro) {
      const logo = await loadLogo();
      await playCard(ctx, outW, outH, Math.max(1, options.outroSec ?? 2.2), {
        title: 'BestCode CodeSync',
        subtitle: 'Smarter coding. Connected printers.',
        kicker: 'Thanks for watching',
        logo,
      });
    }

    await new Promise(r => setTimeout(r, 300));

    if (recorder.state !== 'inactive') recorder.stop();
    let blob = await stopped;
    const recordedMs = Math.max(100, Math.round(performance.now() - recordStartedAt));
    try { await audioCtx?.close(); } catch {}

    // MediaRecorder webm files carry no duration in their header, so players
    // report 0:00. Patch the duration into the container before returning.
    try {
      blob = await fixWebmDuration(blob, recordedMs, { logger: false });
    } catch (e) {
      log('webm duration fix failed', e);
    }

    onProgress?.(100);
    log('done, output blob', blob.size, 'bytes,', recordedMs, 'ms');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
