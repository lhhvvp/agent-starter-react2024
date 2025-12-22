import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Toggle } from '@/components/ui/toggle';

interface ChatInputProps extends React.HTMLAttributes<HTMLFormElement> {
  onSend?: (message: string) => void;
  disabled?: boolean;
  onToggleCanvas?: () => void; // optional toolbar action to open/close canvas overlay
  canvasOpen?: boolean;
}

export function ChatInput({
  onSend,
  className,
  disabled,
  onToggleCanvas,
  canvasOpen,
  ...props
}: ChatInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string>('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    props.onSubmit?.(e);
    onSend?.(message);
    setMessage('');
  };

  const isDisabled = disabled || message.trim().length === 0;

  useEffect(() => {
    if (disabled) return;
    // when not disabled refocus on input
    inputRef.current?.focus();
  }, [disabled]);

  // keyboard shortcut: Alt + C toggles canvas (when available)
  useEffect(() => {
    if (!onToggleCanvas || disabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && (e.key.toLowerCase() === 'c' || e.code === 'KeyC')) {
        e.preventDefault();
        onToggleCanvas();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onToggleCanvas, disabled]);

  return (
    <form
      {...props}
      onSubmit={handleSubmit}
      className={cn('flex items-center gap-2 rounded-md pl-1 text-sm', className)}
    >
      {onToggleCanvas && (
        <Toggle
          pressed={!!canvasOpen}
          onPressedChange={() => onToggleCanvas?.()}
          disabled={disabled}
          aria-label="Toggle Canvas"
          className="font-mono"
        >
          CANVAS
        </Toggle>
      )}

      <input
        autoFocus
        ref={inputRef}
        type="text"
        value={message}
        disabled={disabled}
        placeholder="Type something..."
        onChange={(e) => setMessage(e.target.value)}
        className="flex-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <Button
        size="sm"
        type="submit"
        variant={isDisabled ? 'secondary' : 'primary'}
        disabled={isDisabled}
        className="font-mono"
      >
        SEND
      </Button>
    </form>
  );
}
