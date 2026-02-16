import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import '@/types/electron.d.ts';

export function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [version, setVersion] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      // Query cached state to catch updates that fired before React mounted
      (window.electronAPI.app.getUpdateState() as Promise<any>).then((state: any) => {
        if (state?.stage === 'downloading' && state.info) {
          setUpdateAvailable(true);
          setVersion(state.info.version);
          if (state.progress) {
            setDownloadPercent(Math.round(state.progress.percent));
            setDownloadSpeed(state.progress.bytesPerSecond);
          }
        } else if (state?.stage === 'ready' && state.info) {
          setUpdateAvailable(true);
          setUpdateReady(true);
          setVersion(state.info.version);
        }
      }).catch(() => {});

      // Also listen for future events
      window.electronAPI.onUpdateAvailable((info) => {
        setUpdateAvailable(true);
        setVersion(info.version);
      });

      window.electronAPI.onUpdateDownloadProgress((progress) => {
        setDownloadPercent(Math.round(progress.percent));
        setDownloadSpeed(progress.bytesPerSecond);
      });

      window.electronAPI.onUpdateDownloaded((info) => {
        setUpdateReady(true);
        setVersion(info.version);
      });
    }
  }, []);

  const handleInstall = () => {
    if (window.electronAPI) {
      window.electronAPI.app.installUpdate();
    }
  };

  const formatSpeed = (bps: number) => {
    if (bps > 1048576) return `${(bps / 1048576).toFixed(1)} MB/s`;
    if (bps > 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
    return `${bps} B/s`;
  };

  if (dismissed || (!updateAvailable && !updateReady)) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-primary text-primary-foreground rounded-lg shadow-lg p-4 max-w-sm animate-in slide-in-from-bottom-5">
      <div className="flex items-start gap-3">
        <Download className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h4 className="font-semibold">
            {updateReady ? 'Update Ready' : 'Downloading Update'}
          </h4>
          {updateReady ? (
            <p className="text-sm opacity-90 mt-1">
              Version {version} is ready. Restart to apply.
            </p>
          ) : (
            <div className="mt-2 space-y-1.5">
              <Progress value={downloadPercent} className="h-2 bg-primary-foreground/20" />
              <p className="text-xs opacity-80">
                v{version} — {downloadPercent}% · {formatSpeed(downloadSpeed)}
              </p>
            </div>
          )}
          {updateReady && (
            <Button 
              variant="secondary" 
              size="sm" 
              className="mt-3"
              onClick={handleInstall}
            >
              Restart & Update
            </Button>
          )}
        </div>
        <button 
          onClick={() => setDismissed(true)}
          className="opacity-70 hover:opacity-100 transition-opacity"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
