import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import '@/types/electron.d.ts';

export function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [version, setVersion] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.onUpdateAvailable((info) => {
        setUpdateAvailable(true);
        setVersion(info.version);
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

  if (dismissed || (!updateAvailable && !updateReady)) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-primary text-primary-foreground rounded-lg shadow-lg p-4 max-w-sm animate-in slide-in-from-bottom-5">
      <div className="flex items-start gap-3">
        <Download className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h4 className="font-semibold">
            {updateReady ? 'Update Ready' : 'Update Available'}
          </h4>
          <p className="text-sm opacity-90 mt-1">
            {updateReady 
              ? `Version ${version} is ready to install. Restart to apply the update.`
              : `Version ${version} is downloading...`
            }
          </p>
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
