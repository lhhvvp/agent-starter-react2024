import { useRef, useState } from 'react';
import { PaperPlaneRightIcon, SpinnerIcon } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/livekit/button';
import { Toggle } from '@/components/livekit/toggle';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend?: (message: string) => Promise<void> | void;
  disabled?: boolean;
  className?: string;
  onToggleCanvas?: () => void;
  canvasOpen?: boolean;
}

export function ChatInput({
  onSend = async () => {},
  disabled = false,
  className,
  onToggleCanvas,
  canvasOpen,
}: ChatInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      setIsSending(true);
      await onSend(message);
      setMessage('');
    } catch (error) {
      console.error(error);
    } finally {
      setIsSending(false);
    }
  };

  const isDisabled = disabled || isSending || message.trim().length === 0;

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('flex w-full items-end gap-2 rounded-md pl-1 text-sm', className)}
    >
      <input
        autoFocus
        ref={inputRef}
        type="text"
        value={message}
        disabled={disabled}
        placeholder="Type something..."
        onChange={(e) => setMessage(e.target.value)}
        className="h-8 flex-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      {onToggleCanvas && (
        <Toggle
          type="button"
          size="sm"
          variant="secondary"
          pressed={!!canvasOpen}
          onPressedChange={() => onToggleCanvas()}
          disabled={disabled}
          className="self-start font-mono"
        >
          CANVAS
        </Toggle>
      )}
      <Button
        size="icon"
        type="submit"
        disabled={isDisabled}
        variant={isDisabled ? 'secondary' : 'primary'}
        title={isSending ? 'Sending...' : 'Send'}
        className="self-start"
      >
        {isSending ? (
          <SpinnerIcon className="animate-spin" weight="bold" />
        ) : (
          <PaperPlaneRightIcon weight="bold" />
        )}
      </Button>
    </form>
  );
}
