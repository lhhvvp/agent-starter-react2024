import { useMemo } from 'react';
import {
  type ReceivedChatMessage,
  useChat,
  useRoomContext,
} from '@livekit/components-react';

export default function useChatAndTranscription() {
  const chat = useChat();
  useRoomContext();

  // NOTE: We intentionally avoid useTranscriptions() here.
  // In some dev environments (React StrictMode / Fast Refresh), LiveKit will throw:
  // "A text stream handler for topic \"lk.transcription\" has already been set."
  // Chat messages still work without transcription aggregation.
  const mergedTranscriptions: Array<ReceivedChatMessage> = useMemo(() => {
    return [...chat.chatMessages].sort((a, b) => a.timestamp - b.timestamp);
  }, [chat.chatMessages]);

  return { messages: mergedTranscriptions, send: chat.send };
}
