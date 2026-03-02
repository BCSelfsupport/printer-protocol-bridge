import { useState, useRef, useCallback } from 'react';

const MAX_DURATION = 300; // 5 minutes

export interface ScreenRecorderState {
  isRecording: boolean;
  elapsed: number;
  recordedBlob: Blob | null;
  recordedUrl: string | null;
}

export interface ScreenRecorderActions {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  discardRecording: () => void;
}

async function getElectronStream(): Promise<MediaStream> {
  const sources = await window.electronAPI!.app.getScreenSources();
  if (!sources.length) throw new Error('No screen sources available');
  // Use the first screen source
  const sourceId = sources[0].id;
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      // @ts-ignore — Electron-specific chromeMediaSource constraint
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxFrameRate: 15,
      },
    },
  });
}

export function useScreenRecorder(onRecordingStart?: () => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async () => {
    try {
      let stream: MediaStream;

      if (window.electronAPI?.isElectron) {
        // Electron: use desktopCapturer via main process
        stream = await getElectronStream();
      } else if (navigator.mediaDevices?.getDisplayMedia) {
        // Browser: use standard getDisplayMedia
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 15 },
          audio: false,
        });
      } else {
        throw new Error('Screen recording is not supported in this environment.');
      }

      streamRef.current = stream;
      chunksRef.current = [];
      setElapsed(0);

      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
      };

      stream.getVideoTracks()[0].onended = () => {
        if (recorder.state === 'recording') recorder.stop();
        setIsRecording(false);
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      onRecordingStart?.();

      timerRef.current = setInterval(() => {
        setElapsed(prev => {
          if (prev + 1 >= MAX_DURATION) {
            recorder.stop();
            setIsRecording(false);
            return MAX_DURATION;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        throw err;
      }
    }
  }, [onRecordingStart]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const discardRecording = useCallback(() => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setElapsed(0);
  }, [recordedUrl]);

  return {
    state: { isRecording, elapsed, recordedBlob, recordedUrl },
    actions: { startRecording, stopRecording, discardRecording },
  };
}
