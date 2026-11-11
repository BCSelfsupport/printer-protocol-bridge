import { act, renderHook, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePrinterStorage } from '@/hooks/usePrinterStorage';
import { usePrinterConnection } from '@/hooks/usePrinterConnection';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';
import { printerEmulator } from '@/lib/printerEmulator';

const printer = { id: 3, name: 'Printer 3', ipAddress: '192.168.0.33', port: 23, isConnected: true, isAvailable: true, status: 'not_ready', hasActiveErrors: false };

beforeEach(() => {
  printerEmulator.enabled = false;
  multiPrinterEmulator.enabled = false;
  localStorage.clear();
  localStorage.setItem('codesync-printers', JSON.stringify([printer]));
});
afterEach(() => { cleanup(); multiPrinterEmulator.enabled = false; localStorage.clear(); });

describe('printer connection evidence', () => {
  it('keeps Printer 3 offline when connect is requested without a local transport', async () => {
    const { result } = renderHook(() => usePrinterConnection());
    await act(async () => { await result.current.connect(result.current.printers[0]); });
    expect(result.current.printers[0]).toMatchObject({ id: 3, isAvailable: false, isConnected: false });
    expect(result.current.connectionState.isConnected).toBe(false);
  });
  it('disconnects the selected simulated Printer 3 when emulation is turned off', async () => {
    const { result } = renderHook(() => usePrinterConnection());
    act(() => { multiPrinterEmulator.enabled = true; });
    await act(async () => { await result.current.connect(result.current.printers[0]); });
    expect(result.current.connectionState.isConnected).toBe(true);
    act(() => { multiPrinterEmulator.enabled = false; });
    await waitFor(() => expect(result.current.connectionState.isConnected).toBe(false));
    expect(result.current.printers[0]).toMatchObject({ id: 3, isAvailable: false, isConnected: false });
  });
  it('does not restore a saved connection as live after reload', () => {
    const { result } = renderHook(() => usePrinterStorage());
    expect(result.current.printers[0]).toMatchObject({ id: 3, isConnected: false, isAvailable: false, status: 'offline' });
  });
  it('clears an active simulated printer at a custom IP when emulation is switched off', async () => {
    const { result } = renderHook(() => usePrinterStorage());
    act(() => { multiPrinterEmulator.enabled = true; });
    await waitFor(() => expect(result.current.printers[0].isAvailable).toBe(true));
    act(() => result.current.updatePrinter(3, { isConnected: true }));
    act(() => { multiPrinterEmulator.enabled = false; });
    expect(result.current.printers[0]).toMatchObject({ id: 3, ipAddress: '192.168.0.33', isConnected: false, isAvailable: false, status: 'offline' });
  });
});