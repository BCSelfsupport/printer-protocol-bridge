import { buildMessageDetails, parseGmResponse, parseLfResponse } from '@/lib/messageProtocol';

/** Usage reads must never select a message, even if firmware rejects named reads. */
export async function readUsageMessage(name: string, send: (command: string) => Promise<{ success: boolean; response?: string } | null | undefined>) {
  if (!name.trim() || /[\r\n^]/.test(name)) return null;
  const fields = await send(`^LF ${name}`);
  if (!fields?.success || !fields.response || /\?\s*\d+\s*:|\bERROR\b|\bFAILED\b/i.test(fields.response)) return null;
  const parsed = parseLfResponse(fields.response, name);
  if (!parsed.length) return null;
  const params = await send(`^GM ${name}`);
  return buildMessageDetails(name, parsed, params?.success && params.response ? parseGmResponse(params.response) : null);
}