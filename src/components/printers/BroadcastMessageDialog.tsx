import { useState, useEffect } from 'react';
import { Radio, Send, Users, FileText, Edit3 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Printer } from '@/types/printer';
import { toast } from 'sonner';

interface SlaveUserDefine {
  printerId: number;
  printerName: string;
  ipAddress: string;
  userDefineValue: string;
}

interface BroadcastMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  master: Printer;
  slaves: Printer[];
  messages: { id: number; name: string }[];
  currentMessage?: string | null;
  onBroadcast: (messageName: string, slaveValues: { printerId: number; userDefineValue: string }[]) => Promise<void>;
}

export function BroadcastMessageDialog({
  open,
  onOpenChange,
  master,
  slaves,
  messages,
  currentMessage,
  onBroadcast,
}: BroadcastMessageDialogProps) {
  const [selectedMessage, setSelectedMessage] = useState<string>('');
  const [slaveDefines, setSlaveDefines] = useState<SlaveUserDefine[]>([]);
  const [isSending, setIsSending] = useState(false);

  // Initialize slave defines when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedMessage(currentMessage || (messages.length > 0 ? messages[0].name : ''));
      setSlaveDefines(
        slaves.map(s => ({
          printerId: s.id,
          printerName: s.name,
          ipAddress: s.ipAddress,
          userDefineValue: s.expiryOffsetDays ? `+${s.expiryOffsetDays}` : '',
        }))
      );
    }
  }, [open, slaves, currentMessage, messages]);

  const handleUserDefineChange = (printerId: number, value: string) => {
    setSlaveDefines(prev =>
      prev.map(s => s.printerId === printerId ? { ...s, userDefineValue: value } : s)
    );
  };

  const handleBroadcast = async () => {
    if (!selectedMessage) {
      toast.error('Select a message first');
      return;
    }
    setIsSending(true);
    try {
      await onBroadcast(
        selectedMessage,
        slaveDefines.map(s => ({ printerId: s.printerId, userDefineValue: s.userDefineValue }))
      );
      toast.success(`Broadcast "${selectedMessage}" to ${slaves.length} printer(s)`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Broadcast failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSending(false);
    }
  };

  const availableSlaves = slaves.filter(s => s.isAvailable);
  const offlineSlaves = slaves.filter(s => !s.isAvailable);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Radio className="w-5 h-5 text-primary" />
            Broadcast Message
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Master info */}
          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <Users className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-amber-300">
              Master: <span className="font-bold">{master.name}</span> → {availableSlaves.length} online slave{availableSlaves.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Message selector */}
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">Message to broadcast</Label>
            <Select value={selectedMessage} onValueChange={setSelectedMessage}>
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                <SelectValue placeholder="Select message..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                {messages.map(m => (
                  <SelectItem key={m.id} value={m.name} className="text-white hover:bg-slate-700">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3 h-3" />
                      {m.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Per-slave User Define values */}
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs flex items-center gap-1.5">
              <Edit3 className="w-3 h-3" />
              Per-Printer User Define (optional)
            </Label>
            <p className="text-[10px] text-slate-500">
              Enter different values per printer (e.g. different lot numbers, expiry offsets). Leave blank to skip.
            </p>
            <ScrollArea className="max-h-48">
              <div className="space-y-2 pr-2">
                {slaveDefines.map(slave => {
                  const isOffline = offlineSlaves.some(s => s.id === slave.printerId);
                  return (
                    <div
                      key={slave.printerId}
                      className={`flex items-center gap-2 p-2 rounded-lg border ${
                        isOffline
                          ? 'bg-slate-800/30 border-slate-700/50 opacity-50'
                          : 'bg-slate-800/60 border-slate-700'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{slave.printerName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{slave.ipAddress}</div>
                      </div>
                      <Input
                        value={slave.userDefineValue}
                        onChange={(e) => handleUserDefineChange(slave.printerId, e.target.value)}
                        placeholder="User Define"
                        className="w-32 h-7 text-xs bg-slate-700 border-slate-600 text-white"
                        disabled={isOffline}
                      />
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {offlineSlaves.length > 0 && (
            <p className="text-[10px] text-warning">
              {offlineSlaves.length} offline printer{offlineSlaves.length !== 1 ? 's' : ''} will be skipped.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleBroadcast}
            disabled={!selectedMessage || availableSlaves.length === 0 || isSending}
            className="bg-primary hover:bg-primary/90"
          >
            <Send className="w-4 h-4 mr-1" />
            {isSending ? 'Sending...' : `Broadcast to ${availableSlaves.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
