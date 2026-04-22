/**
 * Crop the top N pixels off a video Blob by re-encoding through a canvas.
 * Returns a new webm Blob with the cropped dimensions.
 *
 * Notes:
 * - MediaRecorder-produced webm blobs frequently have an unknown/Infinity
 *   duration in their headers, which means `video.duration` is Infinity and
 *   `video.onended` never fires. We work around this by seeking to a huge
 *   timestamp first to force the browser to compute the real duration, then
 *   driving playback and stopping when `currentTime` stops advancing.
 * - Audio is captured via WebAudio captureStream so it survives the re-encode.
 */
export async function cropVideoTop(
  sourceBlob: Blob,
  cropTopPx: number,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const url = URL.createObjectURL(sourceBlob);
  const log = (...args: any[]) => console.log('[cropVideoTop]', ...args);

  try {
    const video = document.createElement('video');
    video.src = url;
    video.muted = false;
    video.playsInline = true;
    video.preload = 'auto';
    (video as any).crossOrigin = 'anonymous';

    // Wait for metadata
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('Timed out loading video metadata')), 15000);
      video.onloadedmetadata = () => { clearTimeout(to); resolve(); };
      video.onerror = () => { clearTimeout(to); reject(new Error('Failed to load source video')); };
    });

    // Force duration resolution for MediaRecorder blobs (duration === Infinity)
    let duration = video.duration;
    if (!isFinite(duration) || duration <= 0) {
      log('duration is', duration, '— forcing seek to resolve');
      duration = await new Promise<number>((resolve) => {
        const onSeeked = () => {
          const d = video.duration;
          video.removeEventListener('seeked', onSeeked);
          // Reset back to start
          video.currentTime = 0;
          resolve(isFinite(d) && d > 0 ? d : 0);
        };
        video.addEventListener('seeked', onSeeked);
        try {
          video.currentTime = 1e9; // huge seek to force duration calculation
        } catch {
          video.removeEventListener('seeked', onSeeked);
          resolve(0);
        }
      });
      log('resolved duration:', duration);
      // Wait for the reset seek back to 0 to settle
      await new Promise<void>((r) => {
        const onSeeked = () => { video.removeEventListener('seeked', onSeeked); r(); };
        video.addEventListener('seeked', onSeeked);
      });
    }

    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    const crop = Math.max(0, Math.min(cropTopPx, srcH - 10));
    const outW = srcW;
    const outH = srcH - crop;
    log('source', srcW, 'x', srcH, '→ output', outW, 'x', outH, 'duration', duration);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not available');

    // Paint first frame so the canvas stream has data immediately
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, outW, outH);

    const fps = 30;
    const canvasStream = (canvas as any).captureStream(fps) as MediaStream;

    // Pull audio from the source video element via WebAudio
    let audioTrack: MediaStreamTrack | null = null;
    try {
      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaElementSource(video);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      const gain = audioCtx.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(audioCtx.destination);
      audioTrack = dest.stream.getAudioTracks()[0] || null;
    } catch (e) {
      console.warn('[cropVideoTop] audio capture failed, output will be silent', e);
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
    log('using mimeType', mimeType);

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(combined, { mimeType });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const stopped = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    });

    recorder.start(500);

    let raf = 0;
    let stopRequested = false;
    let lastTime = -1;
    let stallCount = 0;

    const draw = () => {
      if (stopRequested) return;
      try {
        ctx.drawImage(video, 0, crop, srcW, outH, 0, 0, outW, outH);
      } catch {
        // ignore transient draw errors
      }
      if (onProgress) {
        if (duration > 0) {
          onProgress(Math.min(99, (video.currentTime / duration) * 100));
        }
      }
      raf = requestAnimationFrame(draw);
    };

    // Begin playback. Some browsers require play() to be called after preparing canvas/recorder.
    try {
      await video.play();
    } catch (e) {
      log('video.play() rejected', e);
    }
    draw();

    // Wait for end of playback. Use both `ended` and a stall watchdog as fallback.
    await new Promise<void>((resolve) => {
      let resolved = false;
      const finish = (reason: string) => {
        if (resolved) return;
        resolved = true;
        log('finish:', reason, 'at', video.currentTime, '/', duration);
        resolve();
      };

      video.onended = () => finish('ended event');

      // Watchdog: poll every 500ms; if currentTime hasn't advanced for ~2.5s, treat as done.
      const watchdog = window.setInterval(() => {
        if (resolved) { clearInterval(watchdog); return; }
        const t = video.currentTime;
        if (Math.abs(t - lastTime) < 0.01) {
          stallCount++;
          if (stallCount >= 5) {
            clearInterval(watchdog);
            finish(`stalled at ${t}s (duration ${duration})`);
          }
        } else {
          stallCount = 0;
        }
        lastTime = t;
        // Safety: if we know duration and we're past it, stop
        if (duration > 0 && t >= duration - 0.05) {
          clearInterval(watchdog);
          finish('reached duration');
        }
      }, 500);

      // Absolute hard cap: 10 minutes of processing
      window.setTimeout(() => {
        clearInterval(watchdog);
        finish('hard timeout 10min');
      }, 10 * 60 * 1000);
    });

    stopRequested = true;
    cancelAnimationFrame(raf);

    // Final frame
    try { ctx.drawImage(video, 0, crop, srcW, outH, 0, 0, outW, outH); } catch {}

    // Flush
    await new Promise(r => setTimeout(r, 300));
    if (recorder.state !== 'inactive') recorder.stop();
    const blob = await stopped;
    onProgress?.(100);
    log('done, output blob', blob.size, 'bytes');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
