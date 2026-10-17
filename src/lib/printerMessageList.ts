/** Emulator lists are authoritative, even when a connected snapshot is stale. */
export function resolvePrinterMessageList(
  emulatorNames: string[] | undefined,
  connectedMessages: { id: number; name: string }[],
  isConnectedTarget: boolean,
): { id: number; name: string }[] {
  if (emulatorNames !== undefined) return emulatorNames.map((name, index) => ({ id: index + 1, name }));
  return isConnectedTarget ? connectedMessages : [];
}