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

const easeOut = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

interface CardSpec {
  title: string;
  subtitle?: string;
  kicker?: string;
  logo: HTMLImageElement | null;
}

/** Draw one frame of a branded title/closing card. `p` = 0..1 progress. */
function drawCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: number,
  card: CardSpec,
) {
  const s = h / 1080; // scale relative to 1080p design

  // Background: deep navy gradient with a soft blue/emerald glow
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#070b16');
  bg.addColorStop(0.55, '#0d1626');
  bg.addColorStop(1, '#08131a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w * 0.72, h * 0.22, 0, w * 0.72, h * 0.22, w * 0.55);
  glow.addColorStop(0, 'rgba(59,130,246,0.20)');
  glow.addColorStop(1, 'rgba(59,130,246,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const glow2 = ctx.createRadialGradient(w * 0.18, h * 0.85, 0, w * 0.18, h * 0.85, w * 0.45);
  glow2.addColorStop(0, 'rgba(16,185,129,0.16)');
  glow2.addColorStop(1, 'rgba(16,185,129,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, w, h);

  // Subtle grid
  ctx.strokeStyle = 'rgba(148,163,184,0.06)';
  ctx.lineWidth = Math.max(1, s);
  const step = 80 * s;
  for (let x = 0; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  const cx = w / 2;
  const inP = easeOut(p / 0.35);
  const outFade = p > 0.88 ? 1 - (p - 0.88) / 0.12 : 1;
  const alpha = Math.max(0, Math.min(1, inP)) * Math.max(0, outFade);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';

  // Logo
  const logoSize = 190 * s;
  const logoY = h * 0.30 - logoSize / 2 + (1 - inP) * 30 * s;
  if (card.logo) {
    ctx.save();
    ctx.shadowColor = 'rgba(59,130,246,0.55)';
    ctx.shadowBlur = 48 * s;
    ctx.drawImage(card.logo, cx - logoSize / 2, logoY, logoSize, logoSize);
    ctx.restore();
  }

  // Kicker
  if (card.kicker) {
    ctx.fillStyle = 'rgba(148,197,253,0.95)';
    ctx.font = `600 ${Math.round(30 * s)}px "Inter", system-ui, sans-serif`;
    const letters = card.kicker.toUpperCase().split('').join('\u2009 ');
    ctx.fillText(letters, cx, h * 0.50);
  }

  // Accent rule that wipes in
  const ruleW = 420 * s * easeOut((p - 0.15) / 0.4);
  if (ruleW > 0) {
    const g = ctx.createLinearGradient(cx - ruleW / 2, 0, cx + ruleW / 2, 0);
    g.addColorStop(0, 'rgba(59,130,246,0)');
    g.addColorStop(0.5, '#3b82f6');
    g.addColorStop(1, 'rgba(16,185,129,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - ruleW / 2, h * 0.535, ruleW, Math.max(2, 4 * s));
  }

  // Title (wraps to 2 lines)
  const titleP = easeOut((p - 0.12) / 0.4);
  ctx.globalAlpha = alpha * Math.max(0, Math.min(1, titleP));
  ctx.fillStyle = '#f8fafc';
  let fontSize = Math.round(76 * s);
  ctx.font = `700 ${fontSize}px "Inter", system-ui, sans-serif`;
  const maxW = w * 0.8;
  const words = card.title.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  while (lines.length > 2) lines.splice(2);

  const baseY = h * 0.635 + (1 - titleP) * 24 * s;
  lines.forEach((l, i) => ctx.fillText(l, cx, baseY + i * fontSize * 1.15));

  // Subtitle
  if (card.subtitle) {
    const subP = easeOut((p - 0.3) / 0.4);
    ctx.globalAlpha = alpha * Math.max(0, Math.min(1, subP));
    ctx.fillStyle = 'rgba(203,213,225,0.85)';
    ctx.font = `400 ${Math.round(34 * s)}px "Inter", system-ui, sans-serif`;
    ctx.fillText(card.subtitle, cx, baseY + lines.length * fontSize * 1.15 + 26 * s);
  }

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
      await playCard(ctx, outW, outH, Math.max(1, options.introSec ?? 2.6), {
        title: introTitle,
        subtitle: options.introSubtitle?.trim() || 'BestCode CodeSync — Training',
        kicker: 'CodeSync',
        logo,
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
