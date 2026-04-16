import { Printer as PrinterIcon, Check, Plus, Pencil, Trash2, Globe, Leaf, HardDrive, Upload, Download, ChevronDown, ChevronRight, ArrowUpFromLine } from 'lucide-react';
import { PcLibraryEntry } from '@/hooks/useMessageStorage';
import { PrintMessage } from '@/types/printer';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { isReadOnlyMessage } from '@/hooks/useMessageStorage';

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
  /** Select the message and write prompted values via full message rewrite */
  onApplyPromptValues?: (message: PrintMessage, updatedDetails: MessageDetails) => Promise<boolean>;
  /** Get locally stored message details (includes promptBeforePrint metadata) */
  onGetStoredMessage?: (name: string) => MessageDetails | null;
  /** Save message content to printer (^DM + ^NM + ^SV) — used to write prompted field values */
  onSaveMessageContent?: (
    messageName: string,
    fields: MessageDetails['fields'],
    templateValue?: string,
    isNew?: boolean,
    messageSettings?: {
      speed?: 'Fast' | 'Faster' | 'Fastest' | 'Ultra Fast';
      rotation?: string;
      printMode?: 'Normal' | 'Auto' | 'Repeat' | 'Reverse' | 'Auto Encoder' | 'Auto Encoder Reverse';
    },
  ) => Promise<boolean>;
  /** Save updated message details to local storage */
  onSaveStoredMessage?: (details: MessageDetails) => void;
  /** Called after dynamic field values are saved — updates active preview immediately */
  onPromptSaved?: (details: MessageDetails) => void;
  connectedPrinterLineId?: string;
  // PC Library props
  allPcLibraryMessages?: PcLibraryEntry[];
  printerNameMap?: Record<number, string>;
  pcLibraryMessages?: MessageDetails[];
  onSaveToPcLibrary?: (message: PrintMessage) => void;
  onPushToprinter?: (libraryMessage: MessageDetails, swapSlotName: string | null) => Promise<boolean>;
  onDeleteFromPcLibrary?: (messageName: string, sourcePrinterId?: number) => void;
  swapSlotName?: string | null;
  onSetSwapSlot?: (messageName: string | null) => void;
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
  onApplyPromptValues,
  onGetStoredMessage,
  onSaveMessageContent,
  onSaveStoredMessage,
  onPromptSaved,
  connectedPrinterLineId,
  allPcLibraryMessages,
  printerNameMap,
  pcLibraryMessages,
  onSaveToPcLibrary,
  onPushToprinter,
  onDeleteFromPcLibrary,
  swapSlotName,
  onSetSwapSlot,
}: MessagesScreenProps) {
  const [selectedMessage, setSelectedMessage] = useState<PrintMessage | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newMessageName, setNewMessageName] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userDefineEntryOpen, setUserDefineEntryOpen] = useState(false);
  const [userDefinePrompts, setUserDefinePrompts] = useState<UserDefinePrompt[]>([]);
  const [pendingMessageDetails, setPendingMessageDetails] = useState<MessageDetails | null>(null);
  const [pcLibraryOpen, setPcLibraryOpen] = useState(false);
  const [selectedLibraryMessage, setSelectedLibraryMessage] = useState<MessageDetails | null>(null);
  const [selectedLibrarySourcePrinterId, setSelectedLibrarySourcePrinterId] = useState<number | undefined>(undefined);
  const [isPushing, setIsPushing] = useState(false);
  const [swapSlotDialogOpen, setSwapSlotDialogOpen] = useState(false);
  const [deleteLibraryConfirmOpen, setDeleteLibraryConfirmOpen] = useState(false);

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

      // If the message has prompted fields, show the entry dialog so the operator
      // can type values. On confirm we'll do a single atomic write (^DM + ^NM + ^SV)
      // with all values and settings baked in, then ^SM to select — no runtime
      // field mutation that would risk a firmware lockup.
      if (promptedFields.length > 0 && resolvedStored && onSaveMessageContent) {
        const prompts: UserDefinePrompt[] = promptedFields.map(f => ({
          fieldId: f.id,
          label: f.promptLabel || f.data || 'ENTER VALUE',
          length: f.promptLength || 20,
        }));
        setPendingMessageDetails(resolvedStored);
        setUserDefinePrompts(prompts);
        setUserDefineEntryOpen(true);
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
      if (!success) {
        toast.error(`Failed to select "${selectedMessage.name}" on the printer`);
        return;
      }
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
      <div className="flex-1 min-h-0 bg-card rounded-lg p-4 mb-4 flex flex-col">
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

      {/* PC Library - Collapsible overflow section */}
      {allPcLibraryMessages && allPcLibraryMessages.length > 0 && (
        <Collapsible open={pcLibraryOpen} onOpenChange={setPcLibraryOpen} className="mb-2">
          <CollapsibleTrigger className="flex items-center gap-2 w-full px-4 py-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
            {pcLibraryOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <HardDrive className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">PC Library</span>
            <span className="text-xs text-muted-foreground ml-auto">{allPcLibraryMessages.length} message{allPcLibraryMessages.length !== 1 ? 's' : ''}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="bg-card rounded-b-lg border border-t-0 border-border max-h-[200px] overflow-y-auto">
              {allPcLibraryMessages.map((entry) => {
                const isSelected = selectedLibraryMessage?.name === entry.message.name && selectedLibrarySourcePrinterId === entry.sourcePrinterId;
                const sourceName = printerNameMap?.[entry.sourcePrinterId] || `Printer ${entry.sourcePrinterId}`;
                return (
                  <div
                    key={`${entry.sourcePrinterId}:${entry.message.name}`}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedLibraryMessage(null);
                        setSelectedLibrarySourcePrinterId(undefined);
                      } else {
                        setSelectedLibraryMessage(entry.message);
                        setSelectedLibrarySourcePrinterId(entry.sourcePrinterId);
                      }
                    }}
                    className={`flex items-center py-2.5 px-4 border-b cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-primary/20 border-primary/30'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <HardDrive className="w-4 h-4 text-muted-foreground mr-3 shrink-0" />
                    <span className="flex-1 text-sm truncate">{entry.message.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">{entry.message.fields?.length ?? 0} fields</span>
                  </div>
                );
              })}
            </div>
            {/* PC Library actions */}
            <div className="flex gap-2 mt-2 px-1">
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedLibraryMessage || isPushing || !onPushToprinter}
                onClick={async () => {
                  if (!selectedLibraryMessage || !onPushToprinter) return;
                  if (!swapSlotName) {
                    setSwapSlotDialogOpen(true);
                    return;
                  }
                  setIsPushing(true);
                  try {
                    const ok = await onPushToprinter(selectedLibraryMessage, swapSlotName);
                    if (ok) {
                      toast.success(`"${selectedLibraryMessage.name}" pushed to printer`);
                      setSelectedLibraryMessage(null);
                      setSelectedLibrarySourcePrinterId(undefined);
                    } else {
                      toast.error('Failed to push message to printer');
                    }
                  } finally {
                    setIsPushing(false);
                  }
                }}
                className="flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                {isPushing ? 'Pushing...' : 'Push to Printer'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedLibraryMessage}
                onClick={() => selectedLibraryMessage && setDeleteLibraryConfirmOpen(true)}
                className="flex items-center gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Action buttons - horizontal scroll on mobile */}
      <div className="shrink-0 overflow-x-auto -mx-4 px-4 py-2 bg-background/95 backdrop-blur-sm border-t border-border">
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

          {/* Save to PC Library button */}
          {onSaveToPcLibrary && (
            <button 
              onClick={() => selectedMessage && onSaveToPcLibrary(selectedMessage)}
              disabled={!selectedMessage}
              className="industrial-button-gray text-white px-8 py-4 rounded-lg flex flex-col items-center min-w-[120px] disabled:opacity-50"
            >
              <Download className="w-8 h-8 mb-1" />
              <span className="font-medium">Save to PC</span>
            </button>
          )}

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
          if (pendingMessageDetails && selectedMessage && onSaveMessageContent) {
            // Bake prompted values into the field data
            const updatedDetails = {
              ...pendingMessageDetails,
              fields: pendingMessageDetails.fields.map(f => {
                if (f.promptBeforePrint && entries[f.id] !== undefined) {
                  return { ...f, data: entries[f.id].trim() || f.data };
                }
                return f;
              }),
            };

            try {
              toast.loading('Writing message to printer...', { id: 'prompt-save' });

              // Single atomic write: ^DM + ^NM (with all fields, settings, template) + ^SV
              // This avoids runtime field mutation that causes firmware lockups.
              const saved = await onSaveMessageContent(
                selectedMessage.name,
                updatedDetails.fields,
                updatedDetails.templateValue,
                false,
                updatedDetails.settings ? {
                  speed: updatedDetails.settings.speed,
                  rotation: updatedDetails.settings.rotation,
                  printMode: updatedDetails.settings.printMode,
                } : undefined,
              );

              if (!saved) {
                toast.error('Failed to write message to printer', { id: 'prompt-save' });
                return;
              }

              // Now select the message cleanly — it's already fully written
              const selected = await onSelect(selectedMessage);
              if (!selected) {
                toast.error('Message saved but failed to select', { id: 'prompt-save' });
                return;
              }

              // Persist locally so preview and storage stay in sync
              onSaveStoredMessage?.(updatedDetails);
              onPromptSaved?.(updatedDetails);
              toast.success('Message loaded with entered values', { id: 'prompt-save' });
            } catch (e) {
              console.error('[MessagesScreen] Failed to write prompt values:', e);
              toast.error('Failed to write message to printer', { id: 'prompt-save' });
            }
          } else if (onSendCommand) {
            // Legacy: send ^MD^TD for native userdefine fields (per v2.6 §5.28.2)
            const tdEntries = Object.entries(entries).filter(([, value]) => value.trim());
            if (tdEntries.length > 0) {
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

      {/* Swap Slot Selection Dialog */}
      <Dialog open={swapSlotDialogOpen} onOpenChange={setSwapSlotDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set Swap Slot</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-3">
              Select a printer message to use as the swap slot. This message will be temporarily replaced when loading overflow messages from the PC Library. It remains safely stored on the PC.
            </p>
            <Label>Swap Slot Message</Label>
            <div className="mt-2 max-h-[200px] overflow-y-auto border rounded-md">
              {messages
                .filter(m => m.name !== currentMessageName && !isReadOnlyMessage(m.name))
                .map((m) => (
                  <div
                    key={m.id}
                    onClick={() => {
                      onSetSwapSlot?.(m.name);
                      setSwapSlotDialogOpen(false);
                      toast.success(`Swap slot set to "${m.name}"`);
                    }}
                    className="px-3 py-2 cursor-pointer hover:bg-muted/50 border-b last:border-b-0 text-sm"
                  >
                    {m.name}
                  </div>
                ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSwapSlotDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete from PC Library Confirmation */}
      <AlertDialog open={deleteLibraryConfirmOpen} onOpenChange={setDeleteLibraryConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete from PC Library</AlertDialogTitle>
            <AlertDialogDescription>
              Remove "{selectedLibraryMessage?.name}" from the PC Library? This only removes the local copy — it won't affect the printer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedLibraryMessage) {
                  onDeleteFromPcLibrary?.(selectedLibraryMessage.name, selectedLibrarySourcePrinterId);
                  setSelectedLibraryMessage(null);
                  setSelectedLibrarySourcePrinterId(undefined);
                  toast.success('Removed from PC Library');
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
