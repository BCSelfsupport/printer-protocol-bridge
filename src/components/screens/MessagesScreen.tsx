import { Printer as PrinterIcon, Check, Plus, Pencil, Trash2, Globe } from 'lucide-react';
import { PrintMessage } from '@/types/printer';
import { useState, useEffect } from 'react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
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

interface MessagesScreenProps {
  messages: PrintMessage[];
  currentMessageName: string | null;
  onSelect: (message: PrintMessage) => Promise<boolean>;
  onEdit: (message: PrintMessage) => void;
  onNew: (name: string) => void;
  onDelete: (message: PrintMessage) => void;
  onHome: () => void;
  openNewDialogOnMount?: boolean;
  onNewDialogOpened?: () => void;
}

export function MessagesScreen({ 
  messages, 
  currentMessageName,
  onSelect, 
  onEdit, 
  onNew, 
  onDelete, 
  onHome,
  openNewDialogOnMount,
  onNewDialogOpened,
}: MessagesScreenProps) {
  const [selectedMessage, setSelectedMessage] = useState<PrintMessage | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newMessageName, setNewMessageName] = useState('');

  // Auto-open the new dialog when navigating from Dashboard "New" button
  useEffect(() => {
    if (openNewDialogOnMount) {
      setNewDialogOpen(true);
      onNewDialogOpened?.();
    }
  }, [openNewDialogOnMount, onNewDialogOpened]);

  const handleMessageClick = (message: PrintMessage) => {
    // If already selected, open edit
    if (selectedMessage?.id === message.id) {
      onEdit(message);
    } else {
      setSelectedMessage(message);
    }
  };

  const handleSelectMessage = async () => {
    if (!selectedMessage || isSelecting) return;
    
    setIsSelecting(true);
    try {
      const success = await onSelect(selectedMessage);
      if (success) {
        // Navigate to home screen after successful selection
        onHome();
      }
    } finally {
      setIsSelecting(false);
    }
  };

  const handleNewMessage = () => {
    if (newMessageName.trim()) {
      onNew(newMessageName.trim().toUpperCase());
      setNewDialogOpen(false);
      setNewMessageName('');
    }
  };

  return (
    <div className="flex-1 p-4 flex flex-col">
      <SubPageHeader 
        title={`Messages: ${messages.length}`} 
        onHome={onHome}
      />

      {/* Message list */}
      <div className="flex-1 bg-card rounded-lg p-4 mb-4">
        <div className="flex-1">
          {messages.map((message) => (
            <div
              key={message.id}
              onClick={() => handleMessageClick(message)}
              className={`flex items-center py-3 border-b cursor-pointer transition-colors ${
                selectedMessage?.id === message.id 
                  ? 'bg-primary/20 border-primary/30' 
                  : 'hover:bg-muted/50'
              }`}
            >
              <div className="w-10 flex justify-center">
                {currentMessageName === message.name ? (
                  <PrinterIcon className="w-5 h-5 text-primary" />
                ) : null}
              </div>
              <span className="w-12 text-primary font-medium">{message.id}</span>
              <span className="flex-1 text-center text-lg">{message.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-4 justify-center">
        <button
          onClick={handleSelectMessage}
          disabled={!selectedMessage || isSelecting}
          className="industrial-button text-white px-8 py-4 rounded-lg flex flex-col items-center min-w-[120px] disabled:opacity-50"
        >
          <Check className="w-8 h-8 mb-1" />
          <span className="font-medium">{isSelecting ? 'Selecting...' : 'Select'}</span>
        </button>

        <button 
          onClick={() => {
            setNewMessageName('');
            setNewDialogOpen(true);
          }}
          className="industrial-button text-white px-8 py-4 rounded-lg flex flex-col items-center min-w-[120px]"
        >
          <Plus className="w-8 h-8 mb-1" />
          <span className="font-medium">New</span>
        </button>

        <button 
          onClick={() => selectedMessage && onEdit(selectedMessage)}
          disabled={!selectedMessage}
          className="industrial-button-gray text-white px-8 py-4 rounded-lg flex flex-col items-center min-w-[120px] disabled:opacity-50"
        >
          <Pencil className="w-8 h-8 mb-1" />
          <span className="font-medium">Edit</span>
        </button>

        <button 
          onClick={() => selectedMessage && onDelete(selectedMessage)}
          disabled={!selectedMessage}
          className="industrial-button text-white px-8 py-4 rounded-lg flex flex-col items-center min-w-[120px] disabled:opacity-50"
        >
          <Trash2 className="w-8 h-8 mb-1" />
          <span className="font-medium">Delete</span>
        </button>

        <button className="industrial-button text-white px-8 py-4 rounded-lg flex flex-col items-center min-w-[120px]">
          <Globe className="w-8 h-8 mb-1" />
          <span className="font-medium">Graphics</span>
        </button>
      </div>

      {/* New Message Dialog */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="newMsgName">Message Name</Label>
            <Input
              id="newMsgName"
              value={newMessageName}
              onChange={(e) => setNewMessageName(e.target.value.toUpperCase())}
              placeholder="Enter message name"
              className="mt-2"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleNewMessage();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleNewMessage}
              disabled={!newMessageName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
