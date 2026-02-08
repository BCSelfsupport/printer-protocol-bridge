import { useState } from 'react';
import { Plus, ArrowLeft, RefreshCw, ArrowUp, ArrowDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface UserDefineConfig {
  id: string;
  length: number;
  keepUserData: boolean;
  allowPartialEntry: boolean;
}

interface UserDefineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  onAddField: (config: UserDefineConfig) => void;
}

export function UserDefineDialog({ 
  open, 
  onOpenChange, 
  onBack,
  onAddField 
}: UserDefineDialogProps) {
  const [id, setId] = useState('USER1');
  const [length, setLength] = useState(3);
  const [keepUserData, setKeepUserData] = useState(false);
  const [allowPartialEntry, setAllowPartialEntry] = useState(false);

  const handleBack = () => {
    onOpenChange(false);
    onBack();
  };

  const handleAdd = () => {
    onAddField({
      id,
      length,
      keepUserData,
      allowPartialEntry,
    });
    onOpenChange(false);
    // Reset state
    setId('USER1');
    setLength(3);
    setKeepUserData(false);
    setAllowPartialEntry(false);
  };

  const toggleKeepUserData = () => setKeepUserData(prev => !prev);
  const toggleAllowPartialEntry = () => setAllowPartialEntry(prev => !prev);

  const adjustLength = (delta: number) => {
    setLength(prev => Math.max(1, Math.min(99, prev + delta)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-b from-muted to-muted/80 px-4 py-3 flex items-center gap-3 border-b">
          <button
            onClick={handleBack}
            className="industrial-button p-2 rounded"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <DialogTitle className="flex-1 text-center text-lg font-semibold pr-10">
            User Define
          </DialogTitle>
        </div>

        {/* User Define options */}
        <div className="bg-card p-4 space-y-3">
          {/* ID row */}
          <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3">
            <Label className="text-foreground font-medium text-sm">
              ID:
            </Label>
            <div className="flex items-center gap-2">
              <Input
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="w-28 h-8 text-sm"
                placeholder="USER1"
              />
              <button
                onClick={handleAdd}
                className="industrial-button p-2 rounded"
              >
                <Plus className="w-5 h-5 text-primary" />
              </button>
            </div>
          </div>

          {/* Length row */}
          <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3">
            <Label className="text-foreground font-medium text-sm">
              Length: {length}
            </Label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => adjustLength(-1)}
                className="industrial-button p-2 rounded"
              >
                <ArrowDown className="w-5 h-5" />
              </button>
              <button
                onClick={() => adjustLength(1)}
                className="industrial-button p-2 rounded"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Keep user data toggle */}
          <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3">
            <Label className="text-foreground font-medium text-sm">
              Keep user data: {keepUserData ? 'yes' : 'no'}
            </Label>
            <button
              onClick={toggleKeepUserData}
              className="industrial-button p-2 rounded"
              title="Toggle keep user data"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          {/* Allow partial entry toggle */}
          <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3">
            <Label className="text-foreground font-medium text-sm">
              Allow partial entry: {allowPartialEntry ? 'yes' : 'no'}
            </Label>
            <button
              onClick={toggleAllowPartialEntry}
              className="industrial-button p-2 rounded"
              title="Toggle allow partial entry"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
