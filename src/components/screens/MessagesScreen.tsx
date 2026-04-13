import { Printer as PrinterIcon, Check, Plus, Pencil, Trash2, Globe, Leaf } from 'lucide-react';
import { PrintMessage } from '@/types/printer';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { validateMessageName, sanitizeMessageName } from '@/lib/messageNameValidation';
import { UserDefineEntryDialog, UserDefinePrompt } from '@/components/messages/UserDefineEntryDialog';
import { MessageDetails } from '@/components/screens/EditMessageScreen';

interface MessagesScreenProps {
  messages: PrintMessage[];
  currentMessageName: string | null;
  onSelect: (message: PrintMessage) => Promise<boolean>;
  onEdit: (message: PrintMessage) => void;
  onNew: (name: string, preset?: 'metrc-retail-id') => void;
  onDelete: (message: PrintMessage) => void;
  onHome: () => void;
  openNewDialogOnMount?: boolean;
  onNewDialogOpened?: () => void;
  /** Fetch message details (fields) from printer after selecting */
  onFetchMessageDetails?: (name: string) => Promise<MessageDetails | null>;
  /** Send a raw command to the connected printer */
  onSendCommand?: (command: string) => Promise<any>;
  /** Get locally stored message details (includes promptBeforePrint metadata) */
  onGetStoredMessage?: (name: string) => MessageDetails | null;
  /** Save message content to printer (^DM + ^NM + ^SV) — used to write prompted field values */
  onSaveMessageContent?: (
    messageName: string,
    fields: MessageDetails['fields'],
    templateValue?: string,
    isNew?: boolean,
  ) => Promise<boolean>;
  /** Save updated message details to local storage */
  onSaveStoredMessage?: (details: MessageDetails) => void;
  /** Called after dynamic field values are saved — updates active preview immediately */
  onPromptSaved?: (details: MessageDetails) => void;
  connectedPrinterLineId?: string;
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
  onFetchMessageDetails,
  onSendCommand,
  onGetStoredMessage,
  onSaveMessageContent,
  onSaveStoredMessage,
  onPromptSaved,
  connectedPrinterLineId,
}: MessagesScreenProps) {
  const [selectedMessage, setSelectedMessage] = useState<PrintMessage | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newMessageName, setNewMessageName] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userDefineEntryOpen, setUserDefineEntryOpen] = useState(false);
  const [userDefinePrompts, setUserDefinePrompts] = useState<UserDefinePrompt[]>([]);
  // Store the full message details + pending prompts for rewriting after entry
  const [pendingMessageDetails, setPendingMessageDetails] = useState<MessageDetails | null>(null);

  // Auto-open the new dialog when navigating from Dashboard "New" button
  useEffect(() => {
    if (openNewDialogOnMount) {
      setNewDialogOpen(true);
      onNewDialogOpened?.();
    }
  }, [openNewDialogOnMount, onNewDialogOpened]);

  const handleMessageClick = (message: PrintMessage) => {
    // Single click only highlights/selects the message
    setSelectedMessage(message);
  };

  const handleSelectMessage = async () => {
    if (!selectedMessage || isSelecting) return;
    
    setIsSelecting(true);
    try {
      // Before selecting, resolve any printer-driven fields from current printer config
      const stored = onGetStoredMessage?.(selectedMessage.name);
      const resolvedLineId = connectedPrinterLineId?.trim();
      const resolvedStored = stored
        ? {
            ...stored,
            fields: stored.fields.map((field) =>
              field.dynamicSource === 'lineId'
                ? { ...field, data: resolvedLineId || field.data || 'LINE ID' }
                : field
            ),
          }
        : null;
      const lineIdWasResolved = !!stored && !!resolvedStored && resolvedStored.fields.some((field, index) => field.data !== stored.fields[index]?.data);
      const promptedFields = resolvedStored?.fields.filter(f => f.promptBeforePrint) ?? [];

      if (promptedFields.length > 0 && resolvedStored) {
        // Show prompt dialog BEFORE selecting message on printer
        const prompts: UserDefinePrompt[] = promptedFields.map(f => ({
          fieldId: f.id,
          label: f.promptLabel || f.data || 'ENTER VALUE',
          length: f.promptLength || Math.max(f.data?.length || 3, 3),
        }));
        setPendingMessageDetails(resolvedStored);
        setUserDefinePrompts(prompts);
        setUserDefineEntryOpen(true);
        // Don't proceed — wait for user entry, then we'll save + select
        return;
      }

      if (lineIdWasResolved && resolvedStored && onSaveMessageContent) {
        const saved = await onSaveMessageContent(
          selectedMessage.name,
          resolvedStored.fields,
          resolvedStored.templateValue,
          false,
        );

        if (!saved) {
          toast.error('Failed to update Line ID on the printer');
          return;
        }

        onSaveStoredMessage?.(resolvedStored);
        onPromptSaved?.(resolvedStored);
      }

      // No prompted fields — select normally
      const success = await onSelect(selectedMessage);
      if (success) {
        // Legacy: check for native userdefine fields from printer
        if (onFetchMessageDetails) {
          try {
            const details = await Promise.race([
              onFetchMessageDetails(selectedMessage.name),
              new Promise<null>(r => setTimeout(() => r(null), 10000)),
            ]);
            if (details) {
              const udFields = details.fields.filter(f => f.type === 'userdefine');
              if (udFields.length > 0) {
                const prompts: UserDefinePrompt[] = udFields.map(f => {
                  const label = f.data || 'USER';
                  const fontWidth = f.fontSize?.includes('5High') ? 4 : f.fontSize?.includes('7') ? 5 : f.fontSize?.includes('9') ? 7 : f.fontSize?.includes('12') ? 8 : f.fontSize?.includes('16') ? 10 : f.fontSize?.includes('19') ? 12 : f.fontSize?.includes('25') ? 18 : 20;
                  const gap = f.gap ?? 1;
                  const estimatedLen = f.width > 0 ? Math.max(1, Math.round(f.width / (fontWidth + gap))) : (f.data?.length || 3);
                  return { fieldId: f.id, label, length: estimatedLen };
                });
                setPendingMessageDetails(null); // Legacy mode — no rewrite
                setUserDefinePrompts(prompts);
                setUserDefineEntryOpen(true);
                return;
              }
            }
          } catch (e) {
            console.error('[MessagesScreen] Failed to check user define fields:', e);
          }
        }
        onHome();
      }
    } finally {
      setIsSelecting(false);
    }
  };

  const nameValidation = validateMessageName(newMessageName);

  const handleNewMessage = (preset?: 'metrc-retail-id') => {
    if (nameValidation.valid) {
      onNew(newMessageName.trim().toUpperCase(), preset);
      setNewDialogOpen(false);
      setNewMessageName('');
    }
  };

  return (
    <div className="flex-1 p-4 flex flex-col min-h-0">
      <SubPageHeader 
        title={`Messages: ${messages.length}`} 
        onHome={onHome}
      />

      {/* Message list */}
      <div className="flex-1 bg-card rounded-lg p-4 mb-4 flex flex-col">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <PrinterIcon className="w-10 h-10 opacity-30 animate-pulse" />
            <p className="text-sm">Loading messages from printer…</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
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
        )}
      </div>

      {/* Action buttons - horizontal scroll on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 pb-2">
        <div className="flex gap-4 justify-center min-w-max">
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
            onClick={() => {
              if (selectedMessage && selectedMessage.name === currentMessageName) {
                toast.error("Can't delete this message — it is currently selected for printing on the printer.");
                return;
              }
              selectedMessage && setDeleteConfirmOpen(true);
            }}
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
              onChange={(e) => setNewMessageName(sanitizeMessageName(e.target.value))}
              placeholder="Enter message name"
              maxLength={20}
              className="mt-2"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleNewMessage();
                }
              }}
            />
            {newMessageName && !nameValidation.valid && (
              <p className="text-sm text-destructive mt-1">{nameValidation.error}</p>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleNewMessage('metrc-retail-id')}
              disabled={!nameValidation.valid}
              className="mr-auto flex items-center gap-1.5 text-green-600 border-green-600/30 hover:bg-green-600/10"
            >
              <Leaf className="w-4 h-4" />
              METRC Retail ID
            </Button>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => handleNewMessage()}
              disabled={!nameValidation.valid}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedMessage?.name}"? This will also delete it from the printer. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedMessage) {
                  onDelete(selectedMessage);
                  setSelectedMessage(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* User Define / Prompt Before Print Entry Dialog */}
      <UserDefineEntryDialog
        open={userDefineEntryOpen}
        onOpenChange={(open) => {
          setUserDefineEntryOpen(open);
          if (!open) {
            setPendingMessageDetails(null);
            onHome();
          }
        }}
        prompts={userDefinePrompts}
        onConfirm={async (entries) => {
          if (pendingMessageDetails && selectedMessage) {
            // Prompted text fields: write entered values into the fields and save to printer
            const updatedFields = pendingMessageDetails.fields.map(f => {
              if (entries[f.id] !== undefined) {
                return { ...f, data: entries[f.id] };
              }
              return f;
            });

            if (onSaveMessageContent) {
              try {
                toast.loading('Writing field data to printer...', { id: 'prompt-save' });
                // Race against a timeout to prevent locking the printer if the
                // TCP connection stalls mid-sequence.
                const SAVE_TIMEOUT_MS = 12000;
                const savePromise = onSaveMessageContent(
                  selectedMessage.name,
                  updatedFields,
                  pendingMessageDetails.templateValue,
                  false,
                );
                const timeoutPromise = new Promise<false>((resolve) =>
                  setTimeout(() => resolve(false), SAVE_TIMEOUT_MS),
                );
                const saved = await Promise.race([savePromise, timeoutPromise]);

                if (saved) {
                  const updatedDetails = { ...pendingMessageDetails, fields: updatedFields };
                  onSaveStoredMessage?.(updatedDetails);
                  onPromptSaved?.(updatedDetails);
                  // Explicitly select the message after the save sequence completes.
                  // A short delay lets the printer finish persisting to flash before ^SM.
                  await new Promise(resolve => setTimeout(resolve, 500));
                  try {
                    await onSelect(selectedMessage);
                    toast.success('Message loaded with entered values', { id: 'prompt-save' });
                  } catch (e) {
                    console.error('[MessagesScreen] ^SM after prompt save failed:', e);
                    toast.error('Message saved but failed to select — try selecting manually', { id: 'prompt-save', duration: 5000 });
                  }
                } else {
                  const reason = (onSaveMessageContent as any)?.__lastError || '';
                  toast.error(
                    reason
                      ? `Failed to write field data: ${reason}`
                      : 'Timed out writing to printer — check connection and try again',
                    { id: 'prompt-save', duration: 6000 },
                  );
                }
              } catch (e) {
                console.error('[MessagesScreen] Failed to save prompted fields:', e);
                toast.error('Failed to write field data', { id: 'prompt-save' });
              }
            } else {
              // Non-connected printer: can't write fields, but still select the message
              const updatedDetails = { ...pendingMessageDetails, fields: updatedFields };
              onSaveStoredMessage?.(updatedDetails);
              onPromptSaved?.(updatedDetails);
              await onSelect(selectedMessage);
            }
          } else if (onSendCommand) {
            // Legacy: send ^MD^TD for native userdefine fields (per v2.6 §5.28.2)
            const tdEntries = Object.entries(entries).filter(([, value]) => value.trim());
            if (tdEntries.length > 0) {
              // Build combined ^MD command with ^TD subcommands for each field
              const tdSubcommands = tdEntries.map(([, value], idx) => `^TD${idx + 1};${value.trim()}`).join('');
              try {
                await onSendCommand(`^MD${tdSubcommands}`);
              } catch (e) {
                console.error('[MessagesScreen] Failed to send ^MD^TD:', e);
              }
            }
          }
          setUserDefineEntryOpen(false);
          setPendingMessageDetails(null);
          onHome();
        }}
      />
    </div>
  );
}
