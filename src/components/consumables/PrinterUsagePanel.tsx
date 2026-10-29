import { useState } from 'react';
import { FluidUsageTool } from '@/components/consumables/FluidUsageTool';
import { loadFluidUsageProfile, saveFluidUsageProfile } from '@/lib/fluidUsageProfile';
import type { Printer, PrintMessage } from '@/types/printer';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';

export function PrinterUsagePanel({ printer, messages, selectedName, getStored, readMessage }: {
  printer: Printer; messages: PrintMessage[]; selectedName?: string;
  getStored?: (name: string) => MessageDetails | null;
  readMessage?: (name: string) => Promise<MessageDetails | null>;
}) {
  const [profile, setProfile] = useState(() => loadFluidUsageProfile(localStorage, printer.id));
  return <div className="flex-1 min-h-0 overflow-y-auto">
    <div className="px-4 pt-3 text-sm text-muted-foreground">{printer.name} · Confirm nozzle and solvent for this printer.</div>
    <FluidUsageTool
      messages={messages.map(message => ({ key: message.name, label: message.name, message: getStored?.(message.name) ?? undefined }))}
      initialMessageKey={selectedName}
      onReadMessage={readMessage}
      profile={profile}
      onProfileChange={value => { setProfile(value); try { saveFluidUsageProfile(localStorage, printer.id, value); } catch { /* Keep editable session values if storage is unavailable. */ } }}
    />
  </div>;
}