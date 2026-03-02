import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageDetails, MessageField } from '@/components/screens/EditMessageScreen';

const STORAGE_KEY = 'bestcode-messages-v2'; // v2: keyed by printerId:messageName
const LEGACY_STORAGE_KEY = 'bestcode-messages'; // v1: keyed by messageName only

// Hard-coded printer messages that cannot be edited or stored locally
const READONLY_MESSAGES = ['BestCode', 'BestCode auto'];

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

function loadAllMessages(): StoredMessages {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);

    // Migrate from v1 (unscoped) storage if it exists
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      // Legacy messages are unscoped — we can't retroactively assign a printer ID.
      // Keep them under a "0:" prefix so they're still accessible as a fallback.
      const parsed: Record<string, MessageDetails> = JSON.parse(legacy);
      const migrated: StoredMessages = {};
      for (const [name, details] of Object.entries(parsed)) {
        migrated[makeKey(0, name)] = details;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }

    return {};
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

export function useMessageStorage() {
  const [messages, setMessages] = useState<StoredMessages>(() => loadAllMessages());
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

    setMessages((prev) => {
      const updated = { ...prev, [key]: message };
      saveAllMessages(updated);
      return updated;
    });
  }, [printerId]);

  // Get a specific message by name (scoped to current printer, with fallback to legacy/printer-0)
  const getMessage = useCallback((messageName: string, overridePrinterId?: number): MessageDetails | null => {
    const pid = overridePrinterId ?? printerId;
    const key = makeKey(pid, messageName);
    // Try printer-scoped first, then fallback to legacy (printer 0)
    return messages[key] || (pid !== 0 ? messages[makeKey(0, messageName)] : null) || null;
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
  };
}
