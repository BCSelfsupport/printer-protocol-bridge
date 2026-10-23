/** A bare ^LF reads the selected message, not necessarily the requested one. */
export async function readNamedMessageFields(
  name: string,
  send: (command: string) => Promise<{ success: boolean; response?: string; error?: string } | null | undefined>,
  isFailure: (response: string) => boolean,
  settle: () => Promise<void>,
): Promise<string | null> {
  const named = await send(`^LF ${name}`);
  if (named?.success && named.response && !isFailure(named.response)) return named.response;

  const selected = await send(`^SM ${name}`);
  if (!selected?.success || isFailure(selected.response ?? selected.error ?? '')) return null;
  await settle();
  const fallback = await send('^LF');
  return fallback?.success && fallback.response && !isFailure(fallback.response)
    ? fallback.response : null;
}