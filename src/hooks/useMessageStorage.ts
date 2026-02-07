import { useState, useEffect, useCallback } from 'react';
import { MessageDetails, MessageField } from '@/components/screens/EditMessageScreen';

const STORAGE_KEY = 'bestcode-messages';

// Hard-coded printer messages that cannot be edited or stored locally
const READONLY_MESSAGES = ['BestCode', 'BestCode auto'];

export function isReadOnlyMessage(messageName: string): boolean {
  return READONLY_MESSAGES.includes(messageName);
}

interface StoredMessages {
  [messageName: string]: MessageDetails;
}

function loadAllMessages(): StoredMessages {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
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

  // Save a message (will not save read-only messages)
  const saveMessage = useCallback((message: MessageDetails) => {
    if (isReadOnlyMessage(message.name)) {
      console.log(`Skipping storage for read-only message: ${message.name}`);
      return;
    }

    setMessages((prev) => {
      const updated = { ...prev, [message.name]: message };
      saveAllMessages(updated);
      return updated;
    });
  }, []);

  // Get a specific message by name
  const getMessage = useCallback((messageName: string): MessageDetails | null => {
    return messages[messageName] || null;
  }, [messages]);

  // Delete a message
  const deleteMessage = useCallback((messageName: string) => {
    if (isReadOnlyMessage(messageName)) {
      console.log(`Cannot delete read-only message: ${messageName}`);
      return;
    }

    setMessages((prev) => {
      const updated = { ...prev };
      delete updated[messageName];
      saveAllMessages(updated);
      return updated;
    });
  }, []);

  // Get all message names (including read-only for display)
  const getMessageNames = useCallback((): string[] => {
    return Object.keys(messages);
  }, [messages]);

  // Rename a message
  const renameMessage = useCallback((oldName: string, newName: string) => {
    if (isReadOnlyMessage(oldName) || isReadOnlyMessage(newName)) {
      console.log(`Cannot rename read-only messages`);
      return;
    }

    setMessages((prev) => {
      if (!prev[oldName]) return prev;
      
      const message = prev[oldName];
      const updated = { ...prev };
      delete updated[oldName];
      updated[newName] = { ...message, name: newName };
      saveAllMessages(updated);
      return updated;
    });
  }, []);

  return {
    messages,
    saveMessage,
    getMessage,
    deleteMessage,
    getMessageNames,
    renameMessage,
    isReadOnlyMessage,
  };
}
