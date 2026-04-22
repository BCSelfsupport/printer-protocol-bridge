/**
 * Crop the top N pixels off a video Blob by re-encoding through a canvas.
 * Returns a new webm Blob with the cropped dimensions.
 *
 * Note: audio tracks from the source video are preserved by piping them
 * through a captureStream + MediaRecorder.
 */
export async function cropVideoTop(
  sourceBlob: Blob,
  cropTopPx: number,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const url = URL.createObjectURL(sourceBlob);
  try {
    const video = document.createElement('video');
    video.src = url;
    video.muted = false;
    video.playsInline = true;
    // Required so captureStream picks up audio
    (video as any).crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load source video'));
    });

    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    const crop = Math.max(0, Math.min(cropTopPx, srcH - 10));
    const outW = srcW;
    const outH = srcH - crop;

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not available');

    const fps = 30;
    const canvasStream = (canvas as any).captureStream(fps) as MediaStream;

    // Pull audio from the source video element via WebAudio for reliable capture
    let audioTrack: MediaStreamTrack | null = null;
    try {
      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaElementSource(video);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      // Also connect to ctx.destination muted so source still plays through
      const gain = audioCtx.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(audioCtx.destination);
      audioTrack = dest.stream.getAudioTracks()[0] || null;
    } catch (e) {
      console.warn('[cropVideoTop] audio capture failed, output will be silent', e);
    }

    const tracks = [...canvasStream.getVideoTracks()];
    if (audioTrack) tracks.push(audioTrack);
    const combined = new MediaStream(tracks);

    const mimeCandidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const mimeType = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(combined, { mimeType });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const stopped = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    });

    recorder.start(1000);

    // Drive playback at real time and copy frames into the canvas
    await video.play();

    let raf = 0;
    const draw = () => {
      if (video.ended || video.paused) return;
      ctx.drawImage(video, 0, crop, srcW, outH, 0, 0, outW, outH);
      if (onProgress && video.duration) {
        onProgress(Math.min(100, (video.currentTime / video.duration) * 100));
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });
    cancelAnimationFrame(raf);

    // Final frame
    ctx.drawImage(video, 0, crop, srcW, outH, 0, 0, outW, outH);

    // Give the recorder a moment to flush the last chunk
    await new Promise(r => setTimeout(r, 200));
    recorder.stop();
    const blob = await stopped;
    onProgress?.(100);
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
