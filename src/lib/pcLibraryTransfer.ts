import type { MessageDetails } from '@/components/screens/EditMessageScreen';
import type { Printer } from '@/types/printer';

/** Copy to the destination; the saved PC Library original is never removed. */
export async function transferPcLibraryMessage(
  message: MessageDetails,
  target: Printer,
  _sourcePrinterId: number,
  actions: {
    existingNames: string[];
    write: (target: Printer, message: MessageDetails) => Promise<boolean>;
    save: (message: MessageDetails, printerId: number) => void;
  },
): Promise<boolean> {
  if (actions.existingNames.some(name => name.toUpperCase() === message.name.toUpperCase())) return false;
  if (message.fields.length === 0 || !await actions.write(target, message)) return false;
  actions.save(message, target.id);
  return true;
}