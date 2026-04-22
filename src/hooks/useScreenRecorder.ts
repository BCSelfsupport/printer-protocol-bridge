import { useState, useRef, useCallback } from 'react';

const MAX_DURATION = 3600; // 60 minutes
const START_DELAY_SECONDS = 3; // Countdown before recording actually begins

export interface ScreenRecorderState {
  isRecording: boolean;
  elapsed: number;
  recordedBlob: Blob | null;
  recordedUrl: string | null;
  isMicEnabled: boolean;
  countdown: number; // 0 when not counting; 3,2,1 during pre-record delay
}

export interface ScreenRecorderActions {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  discardRecording: () => void;
  toggleMic: () => void;
}

async function getElectronStream(): Promise<MediaStream> {
  const sources = await window.electronAPI!.app.getScreenSources();
  if (!sources.length) throw new Error('No screen sources available');
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

async function getMicStream(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) {
    console.warn('[ScreenRecorder] Microphone access denied or unavailable:', e);
    return null;
  }
}

export function useScreenRecorder(onRecordingStart?: () => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [countdown, setCountdown] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  const toggleMic = useCallback(() => {
    setIsMicEnabled(prev => !prev);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      let screenStream: MediaStream;

      if (window.electronAPI?.isElectron) {
        screenStream = await getElectronStream();
      } else if (navigator.mediaDevices?.getDisplayMedia) {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 15 },
          audio: false,
        });
      } else {
        throw new Error('Screen recording is not supported in this environment.');
      }

      // Combine screen + mic into a single stream
      let combinedStream: MediaStream;
      if (isMicEnabled) {
        const micStream = await getMicStream();
        if (micStream) {
          micStreamRef.current = micStream;
          const tracks = [
            ...screenStream.getVideoTracks(),
            ...micStream.getAudioTracks(),
          ];
          combinedStream = new MediaStream(tracks);
        } else {
          combinedStream = screenStream;
        }
      } else {
        combinedStream = screenStream;
      }

      streamRef.current = combinedStream;
      chunksRef.current = [];
      setElapsed(0);

      const recorder = new MediaRecorder(combinedStream, {
        mimeType: 'video/webm;codecs=vp9',
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        // Stop all tracks (screen + mic)
        screenStream.getTracks().forEach(t => t.stop());
        micStreamRef.current?.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
        if (timerRef.current) clearInterval(timerRef.current);
      };

      screenStream.getVideoTracks()[0].onended = () => {
        if (recorder.state === 'recording') recorder.stop();
        setIsRecording(false);
      };

      // Trigger UI to close panels NOW so they're gone before recording starts
      onRecordingStart?.();

      // Run countdown — gives the user time to close the dev panel
      setCountdown(START_DELAY_SECONDS);
      await new Promise<void>((resolve) => {
        let remaining = START_DELAY_SECONDS;
        countdownTimerRef.current = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
            setCountdown(0);
            resolve();
          } else {
            setCountdown(remaining);
          }
        }, 1000);
      });

      // Bail out if user cancelled the screen share during countdown
      if (screenStream.getVideoTracks()[0].readyState === 'ended') {
        return;
      }

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

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
      setCountdown(0);
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      if (err.name !== 'NotAllowedError') {
        throw err;
      }
    }
  }, [onRecordingStart, isMicEnabled]);

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
    state: { isRecording, elapsed, recordedBlob, recordedUrl, isMicEnabled },
    actions: { startRecording, stopRecording, discardRecording, toggleMic },
  };
}