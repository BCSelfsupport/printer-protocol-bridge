import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageDetails, MessageField } from '@/components/screens/EditMessageScreen';
import { getHardcodedMessage, isHardcodedMessage } from '@/lib/hardcodedMessages';
import { buildScanTestMessage, SCAN_TEST_MESSAGE_NAME, SCAN_TEST_SEED_VERSION } from '@/lib/scanTestMessage';

const STORAGE_KEY = 'bestcode-messages-v2'; // v2: keyed by printerId:messageName
const LEGACY_STORAGE_KEY = 'bestcode-messages'; // v1: keyed by messageName only
const PC_LIBRARY_KEY = 'bestcode-pc-library'; // PC Library: overflow messages stored on PC
const SWAP_SLOT_KEY = 'bestcode-swap-slot'; // Per-printer swap slot name

// Hard-coded printer messages that cannot be edited or stored locally
const READONLY_MESSAGES = ['BestCode', 'BestCode auto', 'QUANTUM', 'QUANTUM AUTO'];

export function isReadOnlyMessage(messageName: string): boolean {
  return READONLY_MESSAGES.includes(messageName);
}

// Composite key: "printerId:messageName"
function makeKey(printerId: number, messageName: string): string {
  return `${printerId}:${messageName}`;
}

interface StoredMessages {
  [compositeKey: string]: MessageDetails;
}

export interface PcLibraryEntry {
  message: MessageDetails;
  sourcePrinterId: number;
}

interface PcLibraryMessages {
  [compositeKey: string]: MessageDetails; // keyed by "printerId:messageName"
}

function ensureSeededScanTest(messages: StoredMessages): StoredMessages {
  const key = makeKey(1, SCAN_TEST_MESSAGE_NAME);
  if (messages[key]) return messages;
  return {
    ...messages,
    [key]: buildScanTestMessage(),
  };
}

function loadAllMessages(): StoredMessages {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = ensureSeededScanTest(JSON.parse(stored));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      return parsed;
    }

    // Migrate from v1 (unscoped) storage if it exists
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed: Record<string, MessageDetails> = JSON.parse(legacy);
      const migrated: StoredMessages = {};
      for (const [name, details] of Object.entries(parsed)) {
        migrated[makeKey(0, name)] = details;
      }
       const seeded = ensureSeededScanTest(migrated);
       localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
       return seeded;
    }

     const seeded = ensureSeededScanTest({});
     localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
     return seeded;
  } catch {
    console.warn('Failed to load messages from localStorage');
    return {};
  }
}

function saveAllMessages(messages: StoredMessages): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch (e) {
    console.error('Failed to save messages to localStorage', e);
  }
}

function loadPcLibrary(): PcLibraryMessages {
  try {
    const stored = localStorage.getItem(PC_LIBRARY_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function savePcLibrary(library: PcLibraryMessages): void {
  try {
    localStorage.setItem(PC_LIBRARY_KEY, JSON.stringify(library));
  } catch (e) {
    console.error('Failed to save PC library to localStorage', e);
  }
}

function loadSwapSlot(printerId: number): string | null {
  try {
    const stored = localStorage.getItem(SWAP_SLOT_KEY);
    if (!stored) return null;
    const map: Record<string, string> = JSON.parse(stored);
    return map[String(printerId)] ?? null;
  } catch {
    return null;
  }
}

function saveSwapSlot(printerId: number, messageName: string | null): void {
  try {
    const stored = localStorage.getItem(SWAP_SLOT_KEY);
    const map: Record<string, string> = stored ? JSON.parse(stored) : {};
    if (messageName) {
      map[String(printerId)] = messageName;
    } else {
      delete map[String(printerId)];
    }
    localStorage.setItem(SWAP_SLOT_KEY, JSON.stringify(map));
  } catch {}
}

export function useMessageStorage() {
  const [messages, setMessages] = useState<StoredMessages>(() => loadAllMessages());
  const [pcLibrary, setPcLibrary] = useState<PcLibraryMessages>(() => loadPcLibrary());
  // Active printer context — set by the caller via setPrinterId
  const [printerId, setPrinterId] = useState<number>(0);

  // Save a message (will not save read-only messages)
  const saveMessage = useCallback((message: MessageDetails, overridePrinterId?: number) => {
    if (isReadOnlyMessage(message.name)) {
      console.log(`Skipping storage for read-only message: ${message.name}`);
      return;
    }

    const pid = overridePrinterId ?? printerId;
    const key = makeKey(pid, message.name);

    console.log('[AdjustDebug][storage.save]', {
      printerId: pid,
      key,
      messageName: message.name,
      adjustSettings: message.adjustSettings ?? null,
    });

    setMessages((prev) => {
      const updated = { ...prev, [key]: message };
      saveAllMessages(updated);
      return updated;
    });
  }, [printerId]);

  // Get a specific message by name (scoped to current printer, with fallback to legacy/printer-0)
  const getMessage = useCallback((messageName: string, overridePrinterId?: number): MessageDetails | null => {
    const hardcoded = getHardcodedMessage(messageName);
    if (hardcoded) return hardcoded;

    const pid = overridePrinterId ?? printerId;
    const key = makeKey(pid, messageName);
    const fallbackKey = pid !== 0 ? makeKey(0, messageName) : null;
    const resolved = messages[key] || (fallbackKey ? messages[fallbackKey] : null) || null;

    console.log('[AdjustDebug][storage.get]', {
      requestedPrinterId: pid,
      messageName,
      directKey: key,
      fallbackKey,
      resolvedFrom: messages[key] ? key : (fallbackKey && messages[fallbackKey] ? fallbackKey : null),
      adjustSettings: resolved?.adjustSettings ?? null,
    });

    return resolved;
  }, [messages, printerId]);

  // Delete a message
  const deleteMessage = useCallback((messageName: string, overridePrinterId?: number) => {
    if (isReadOnlyMessage(messageName)) {
      console.log(`Cannot delete read-only message: ${messageName}`);
      return;
    }

    const pid = overridePrinterId ?? printerId;
    const key = makeKey(pid, messageName);

    setMessages((prev) => {
      const updated = { ...prev };
      delete updated[key];
      saveAllMessages(updated);
      return updated;
    });
  }, [printerId]);

  // Get all message names for the current printer
  const getMessageNames = useCallback((): string[] => {
    const prefix = `${printerId}:`;
    return Object.keys(messages)
      .filter(k => k.startsWith(prefix))
      .map(k => k.slice(prefix.length));
  }, [messages, printerId]);

  // Rename a message
  const renameMessage = useCallback((oldName: string, newName: string, overridePrinterId?: number) => {
    if (isReadOnlyMessage(oldName) || isReadOnlyMessage(newName)) {
      console.log(`Cannot rename read-only messages`);
      return;
    }

    const pid = overridePrinterId ?? printerId;
    const oldKey = makeKey(pid, oldName);
    const newKey = makeKey(pid, newName);

    setMessages((prev) => {
      if (!prev[oldKey]) return prev;
      
      const message = prev[oldKey];
      const updated = { ...prev };
      delete updated[oldKey];
      updated[newKey] = { ...message, name: newName };
      saveAllMessages(updated);
      return updated;
    });
  }, [printerId]);

  // --- PC Library methods ---

  /** Save a message to the PC Library (overflow storage) */
  const saveToPcLibrary = useCallback((message: MessageDetails, overridePrinterId?: number) => {
    const pid = overridePrinterId ?? printerId;
    const key = makeKey(pid, message.name);
    setPcLibrary((prev) => {
      const updated = { ...prev, [key]: message };
      savePcLibrary(updated);
      return updated;
    });
  }, [printerId]);

  /** Get all PC Library messages across ALL printers (unified pool) */
  const getAllPcLibraryMessages = useCallback((): PcLibraryEntry[] => {
    return Object.entries(pcLibrary).map(([key, message]) => {
      const colonIdx = key.indexOf(':');
      const sourcePrinterId = colonIdx > -1 ? parseInt(key.slice(0, colonIdx), 10) : 0;
      return { message, sourcePrinterId };
    });
  }, [pcLibrary]);

  /** Get PC Library messages for a specific printer only */
  const getPcLibraryMessages = useCallback((overridePrinterId?: number): MessageDetails[] => {
    const pid = overridePrinterId ?? printerId;
    const prefix = `${pid}:`;
    return Object.entries(pcLibrary)
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v);
  }, [pcLibrary, printerId]);

  /** Get a specific PC Library message */
  const getPcLibraryMessage = useCallback((messageName: string, overridePrinterId?: number): MessageDetails | null => {
    const pid = overridePrinterId ?? printerId;
    const key = makeKey(pid, messageName);
    return pcLibrary[key] ?? null;
  }, [pcLibrary, printerId]);

  /** Delete a message from the PC Library */
  const deleteFromPcLibrary = useCallback((messageName: string, overridePrinterId?: number) => {
    const pid = overridePrinterId ?? printerId;
    const key = makeKey(pid, messageName);
    setPcLibrary((prev) => {
      const updated = { ...prev };
      delete updated[key];
      savePcLibrary(updated);
      return updated;
    });
  }, [printerId]);

  /** Get the swap slot name for a printer */
  const getSwapSlot = useCallback((overridePrinterId?: number): string | null => {
    const pid = overridePrinterId ?? printerId;
    return loadSwapSlot(pid);
  }, [printerId]);

  /** Set the swap slot name for a printer */
  const setSwapSlot = useCallback((messageName: string | null, overridePrinterId?: number) => {
    const pid = overridePrinterId ?? printerId;
    saveSwapSlot(pid, messageName);
  }, [printerId]);

  return {
    messages,
    saveMessage,
    getMessage,
    deleteMessage,
    getMessageNames,
    renameMessage,
    isReadOnlyMessage,
    setPrinterId,
    printerId,
    // PC Library
    saveToPcLibrary,
    getAllPcLibraryMessages,
    getPcLibraryMessages,
    getPcLibraryMessage,
    deleteFromPcLibrary,
    getSwapSlot,
    setSwapSlot,
  };
}
