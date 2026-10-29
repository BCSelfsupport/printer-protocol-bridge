import { describe, expect, it, vi } from 'vitest';
import { loadFluidUsageProfile, saveFluidUsageProfile } from '@/lib/fluidUsageProfile';
import { readUsageMessage } from '@/lib/usageMessageRead';

describe('printer usage scope and safety', () => {
  it('remembers different nozzle and solvent choices for different printers', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    saveFluidUsageProfile(storage, 1, { nozzle: 40, solvent: 'Ethanol' });
    saveFluidUsageProfile(storage, 2, { nozzle: 100, solvent: 'Acetone' });
    expect(loadFluidUsageProfile(storage, 1)).toEqual({ nozzle: 40, solvent: 'Ethanol' });
    expect(loadFluidUsageProfile(storage, 2)).toEqual({ nozzle: 100, solvent: 'Acetone' });
  });
  it('does not select any message when named read fails', async () => {
    const send = vi.fn(async (_command: string) => ({ success: false, response: '? 1: ERROR' }));
    expect(await readUsageMessage('BC-GEN2', send)).toBeNull();
    expect(send.mock.calls).toEqual([['^LF BC-GEN2']]);
  });
  it('rejects command injection from message names', async () => {
    const send = vi.fn();
    expect(await readUsageMessage('A\r^SM B', send)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});