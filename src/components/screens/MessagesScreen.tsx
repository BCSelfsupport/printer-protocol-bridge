import { Printer as PrinterIcon, Check, Plus, Pencil, Trash2, Globe } from 'lucide-react';
import { PrintMessage } from '@/types/printer';
import { useState } from 'react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';

interface MessagesScreenProps {
  messages: PrintMessage[];
  onSelect: (message: PrintMessage) => Promise<boolean>;
  onEdit: (message: PrintMessage) => void;
  onNew: () => void;
  onDelete: (message: PrintMessage) => void;
  onHome: () => void;
}

export function MessagesScreen({ 
  messages, 
  onSelect, 
  onEdit, 
  onNew, 
  onDelete, 
  onHome 
}: MessagesScreenProps) {
  const [selectedMessage, setSelectedMessage] = useState<PrintMessage | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

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

  return (
    <div className="flex-1 p-4 flex flex-col">
      <SubPageHeader 
        title={`Messages: ${messages.length}`} 
        onHome={onHome}
      />

      {/* Message list */}
      <div className="flex-1 bg-card rounded-lg p-4 mb-4">
        <div className="flex items-start gap-4">
          <PrinterIcon className="w-16 h-16 text-muted-foreground" />
          <div className="flex-1">
            {messages.map((message) => (
              <div
                key={message.id}
                onClick={() => handleMessageClick(message)}
                className={`flex items-center py-3 border-b cursor-pointer hover:bg-muted/50 ${
                  selectedMessage?.id === message.id ? 'bg-primary/10' : ''
                }`}
              >
                <span className="w-12 text-primary font-medium">{message.id}</span>
                <span className="flex-1 text-center text-lg">{message.name}</span>
              </div>
            ))}
          </div>
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
          onClick={onNew}
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
    </div>
  );
}
