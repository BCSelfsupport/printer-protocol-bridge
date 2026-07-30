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

    await new Promise(r => setTimeout(r, 300));
    if (recorder.state !== 'inactive') recorder.stop();
    const blob = await stopped;
    try { await audioCtx?.close(); } catch {}
    onProgress?.(100);
    log('done, output blob', blob.size, 'bytes');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
