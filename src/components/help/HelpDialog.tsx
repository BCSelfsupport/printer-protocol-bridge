import { useState } from 'react';
import { HelpCircle, ChevronRight, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

// Help topics available via ^HE command per v2.0 protocol
const HELP_TOPICS = [
  { command: '', label: 'Command List', description: 'List of all recognized commands' },
  { command: 'Bar', label: 'Bar Codes', description: 'Bar code types' },
  { command: 'Date', label: 'Date Formats', description: 'Date format codes' },
  { command: 'DMAT', label: 'Data Matrix', description: 'Data Matrix options' },
  { command: 'DOT', label: 'Dot Code', description: 'Dot Code options' },
  { command: 'Font', label: 'Fonts', description: 'Available font sizes' },
  { command: 'Mode', label: 'Print Modes', description: 'Normal, Auto, Repeat, Reverse' },
  { command: 'Orient', label: 'Orientation', description: 'Message orientation options' },
  { command: 'QRCode', label: 'QR Code', description: 'QR Code options' },
  { command: 'Speed', label: 'Print Speeds', description: 'Fast, Faster, Fastest, Ultra Fast' },
  { command: 'Temp', label: 'Templates', description: 'Message template sizes' },
  { command: 'Time', label: 'Time Formats', description: 'Time format codes' },
] as const;

interface HelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendCommand: (command: string) => Promise<{ success: boolean; response: string }>;
  isConnected: boolean;
}

export function HelpDialog({
  open,
  onOpenChange,
  onSendCommand,
  isConnected,
}: HelpDialogProps) {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [helpContent, setHelpContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleTopicClick = async (topic: string) => {
    setSelectedTopic(topic);
    setIsLoading(true);
    setHelpContent('');

    try {
      const command = topic ? `^HE ${topic}` : '^HE';
      const result = await onSendCommand(command);
      
      if (result.success) {
        setHelpContent(result.response || 'No help content available.');
      } else {
        setHelpContent('Failed to retrieve help content.');
      }
    } catch (error) {
      setHelpContent('Error retrieving help content.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setSelectedTopic(null);
    setHelpContent('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[80vh] p-4 md:p-6 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base md:text-lg text-white flex items-center gap-2">
            <HelpCircle className="w-5 h-5" />
            {selectedTopic !== null ? (
              <span>Help: {HELP_TOPICS.find(t => t.command === selectedTopic)?.label || 'Commands'}</span>
            ) : (
              <span>Printer Help</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="bg-gradient-to-b from-slate-700 to-slate-800 rounded-xl p-4 border border-slate-600 shadow-xl">
          {selectedTopic !== null ? (
            // Show help content
            <div className="space-y-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="text-slate-300 hover:text-white hover:bg-slate-600"
              >
                ← Back to Topics
              </Button>
              
              <ScrollArea className="h-[300px] rounded-md border border-slate-600 bg-slate-900 p-3">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  </div>
                ) : (
                  <pre className="text-sm text-slate-200 whitespace-pre-wrap font-mono">
                    {helpContent}
                  </pre>
                )}
              </ScrollArea>
            </div>
          ) : (
            // Show topic list
            <div className="space-y-2">
              <p className="text-xs text-slate-400 mb-3">
                Select a topic to view help from the printer (^HE command)
              </p>
              
              <ScrollArea className="h-[300px]">
                <div className="space-y-1">
                  {HELP_TOPICS.map((topic) => (
                    <button
                      key={topic.command || 'commands'}
                      onClick={() => handleTopicClick(topic.command)}
                      disabled={!isConnected}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-600/50 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
                    >
                      <div>
                        <div className="text-sm font-medium text-white">{topic.label}</div>
                        <div className="text-xs text-slate-400">{topic.description}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </button>
                  ))}
                </div>
              </ScrollArea>
              
              {!isConnected && (
                <p className="text-xs text-amber-400 text-center mt-2">
                  Connect to a printer to view help
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
