import type { MessageDetails } from '@/components/screens/EditMessageScreen';
import type { Printer } from '@/types/printer';

/** Commit local bookkeeping only after the destination accepts the message. */
export async function transferPcLibraryMessage(
  message: MessageDetails,
  target: Printer,
  sourcePrinterId: number,
  actions: {
    write: (target: Printer, message: MessageDetails) => Promise<boolean>;
    save: (message: MessageDetails, printerId: number) => void;
    remove: (name: string, printerId: number) => void;
    setSlot: (name: string, printerId: number) => void;
  },
): Promise<boolean> {
  if (message.fields.length === 0 || !await actions.write(target, message)) return false;
  actions.save(message, target.id);
  actions.remove(message.name, sourcePrinterId);
  actions.setSlot(message.name, target.id);
  return true;
}