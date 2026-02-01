'use client';

import * as React from 'react';
import { useCallback } from 'react';
import { Track } from 'livekit-client';
import { BarVisualizer } from '@livekit/components-react';
import { ChatTextIcon, PhoneDisconnectIcon } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/livekit/button';
import { Toggle } from '@/components/livekit/toggle';
import { AppConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ChatInput } from './chat-input';
import { UseAgentControlBarProps, useAgentControlBar } from './hooks/use-input-controls';
import { TrackDeviceSelect } from './track-device-select';
import { TrackToggle } from './track-toggle';

export interface AgentControlBarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    UseAgentControlBarProps {
  capabilities: Pick<
    AppConfig,
    'supportsChatInput' | 'supportsAudioInput' | 'supportsVideoInput' | 'supportsScreenShare'
  >;
  onChatOpenChange?: (open: boolean) => void;
  /**
   * Optional controlled prop for chat open state. If provided, the control bar
   * will treat chat visibility as controlled by the parent and will not manage
   * internal state for it.
   */
  chatOpen?: boolean;
  onSendMessage?: (message: string) => Promise<void>;
  onDisconnect?: () => void;
  onDeviceError?: (error: { source: Track.Source; error: Error }) => void;
  onToggleCanvas?: () => void;
  canvasOpen?: boolean;
  // Optional surface selector: show a tri-state control (none/canvas/workspace)
  onSelectSurface?: (surface: 'none' | 'canvas' | 'workspace') => void;
  surface?: 'none' | 'canvas' | 'workspace';
}

/**
 * A control bar specifically designed for voice assistant interfaces
 */
export function AgentControlBar({
  controls,
  saveUserChoices = true,
  capabilities,
  className,
  onSendMessage,
  onChatOpenChange,
  chatOpen: controlledChatOpen,
  onDisconnect,
  onDeviceError,
  onToggleCanvas,
  canvasOpen,
  onSelectSurface,
  surface,
  ...props
}: AgentControlBarProps) {
  // Support controlled/uncontrolled chatOpen
  const [uncontrolledChatOpen, setUncontrolledChatOpen] = React.useState(false);
  const isChatOpenControlled = controlledChatOpen !== undefined;
  const chatOpen = isChatOpenControlled ? controlledChatOpen! : uncontrolledChatOpen;
  const setChatOpen = (next: boolean) => {
    if (!isChatOpenControlled) setUncontrolledChatOpen(next);
    onChatOpenChange?.(next);
  };
  const [isSendingMessage, setIsSendingMessage] = React.useState(false);

  const isInputDisabled = !chatOpen || isSendingMessage;

  const [isDisconnecting, setIsDisconnecting] = React.useState(false);

  const {
    micTrackRef,
    visibleControls,
    cameraToggle,
    microphoneToggle,
    screenShareToggle,
    handleAudioDeviceChange,
    handleVideoDeviceChange,
    handleDisconnect,
  } = useAgentControlBar({
    controls,
    saveUserChoices,
    onDeviceError,
  });

  const handleSendMessage = async (message: string) => {
    setIsSendingMessage(true);
    try {
      await onSendMessage?.(message);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const onLeave = async () => {
    setIsDisconnecting(true);
    await handleDisconnect();
    setIsDisconnecting(false);
    onDisconnect?.();
  };

  // Notify parent only when toggled via control; avoid duplicate effects.

  const onMicrophoneDeviceSelectError = useCallback(
    (error: Error) => {
      onDeviceError?.({ source: Track.Source.Microphone, error });
    },
    [onDeviceError]
  );
  const onCameraDeviceSelectError = useCallback(
    (error: Error) => {
      onDeviceError?.({ source: Track.Source.Camera, error });
    },
    [onDeviceError]
  );

  return (
    <div
      aria-label="Voice assistant controls"
      className={cn(
        'bg-background border-bg2 dark:border-separator1 flex flex-col rounded-[31px] border p-3 drop-shadow-md/3',
        className
      )}
      {...props}
    >
      <div
        inert={!chatOpen || !capabilities.supportsChatInput}
        className={cn(
          'overflow-hidden transition-[height] duration-300 ease-out',
          chatOpen && capabilities.supportsChatInput ? 'h-[57px]' : 'h-0'
        )}
      >
        <div className="flex h-8 w-full">
          <ChatInput
            onSend={handleSendMessage}
            disabled={isInputDisabled || !capabilities.supportsChatInput}
            // If a tri-state surface selector is provided, hide the inline CANVAS toggle
            onToggleCanvas={onSelectSurface ? undefined : onToggleCanvas}
            canvasOpen={onSelectSurface ? false : canvasOpen}
            className="w-full"
          />
        </div>
        <hr className="border-bg2 my-3" />
      </div>

      <div className="flex flex-row justify-between gap-1">
        <div className="flex gap-1">
          {visibleControls.microphone && (
            <div className="flex items-center gap-0">
              <TrackToggle
                variant="primary"
                source={Track.Source.Microphone}
                pressed={microphoneToggle.enabled}
                disabled={microphoneToggle.pending || !capabilities.supportsAudioInput}
                onPressedChange={microphoneToggle.toggle}
                pending={microphoneToggle.pending}
                className="peer/track group/track relative w-auto pr-3 pl-3 md:rounded-r-none md:border-r-0 md:pr-2"
              >
                <BarVisualizer
                  barCount={3}
                  trackRef={micTrackRef}
                  options={{ minHeight: 5 }}
                  className="flex h-full w-auto items-center justify-center gap-0.5"
                >
                  <span
                    className={cn([
                      'h-full w-0.5 origin-center rounded-2xl',
                      'group-data-[state=on]/track:bg-fg1 group-data-[state=off]/track:bg-destructive-foreground',
                      'data-lk-muted:bg-muted',
                    ])}
                  ></span>
                </BarVisualizer>
              </TrackToggle>
              <hr className="bg-separator1 peer-data-[state=off]/track:bg-separatorSerious relative z-10 -mr-px hidden h-4 w-px md:block" />
              <TrackDeviceSelect
                size="sm"
                kind="audioinput"
                onMediaDeviceError={onMicrophoneDeviceSelectError}
                onActiveDeviceChange={handleAudioDeviceChange}
                disabled={!capabilities.supportsAudioInput}
                className={cn([
                  'pl-2',
                  'peer-data-[state=off]/track:text-destructive-foreground',
                  'hover:text-fg1 focus:text-fg1',
                  'hover:peer-data-[state=off]/track:text-destructive-foreground focus:peer-data-[state=off]/track:text-destructive-foreground',
                  'hidden rounded-l-none md:block',
                ])}
              />
            </div>
          )}

          {visibleControls.camera && (
            <div className="flex items-center gap-0">
              <TrackToggle
                variant="primary"
                source={Track.Source.Camera}
                pressed={cameraToggle.enabled}
                pending={cameraToggle.pending}
                disabled={cameraToggle.pending || !capabilities.supportsVideoInput}
                onPressedChange={cameraToggle.toggle}
                className="peer/track relative w-auto rounded-r-none pr-3 pl-3 disabled:opacity-100 md:border-r-0 md:pr-2"
              />
              <hr className="bg-separator1 peer-data-[state=off]/track:bg-separatorSerious relative z-10 -mr-px hidden h-4 w-px md:block" />
              <TrackDeviceSelect
                size="sm"
                kind="videoinput"
                onMediaDeviceError={onCameraDeviceSelectError}
                onActiveDeviceChange={handleVideoDeviceChange}
                disabled={!capabilities.supportsVideoInput}
                className={cn([
                  'pl-2',
                  'peer-data-[state=off]/track:text-destructive-foreground',
                  'hover:text-fg1 focus:text-fg1',
                  'hover:peer-data-[state=off]/track:text-destructive-foreground focus:peer-data-[state=off]/track:text-destructive-foreground',
                  'rounded-l-none',
                ])}
              />
            </div>
          )}

          {visibleControls.screenShare && (
            <div className="flex items-center gap-0">
              <TrackToggle
                variant="secondary"
                source={Track.Source.ScreenShare}
                pressed={screenShareToggle.enabled}
                disabled={screenShareToggle.pending || !capabilities.supportsScreenShare}
                onPressedChange={screenShareToggle.toggle}
                className="relative w-auto"
              />
            </div>
          )}

          {visibleControls.chat && (
            <Toggle
              variant="secondary"
              aria-label="Toggle chat"
              pressed={chatOpen}
              onPressedChange={setChatOpen}
              disabled={!capabilities.supportsChatInput}
              className="lk-tooltip aspect-square h-full"
              data-tooltip="Toggle chat"
              data-side="top"
            >
              <ChatTextIcon weight="bold" />
            </Toggle>
          )}

          {/* Surface selector: NONE / CANVAS / WORK */}
          {onSelectSurface && (
            <div className="ml-1 flex items-center gap-1">
              <Toggle
                variant="secondary"
                aria-label="Hide workspace panes"
                pressed={surface === 'none'}
                onPressedChange={() => onSelectSurface('none')}
                className="h-full px-2 font-mono"
              >
                NONE
              </Toggle>
              <Toggle
                variant="secondary"
                aria-label="Show canvas pane"
                pressed={surface === 'canvas'}
                onPressedChange={() => onSelectSurface('canvas')}
                className="h-full px-2 font-mono"
              >
                CANVAS
              </Toggle>
              <Toggle
                variant="secondary"
                aria-label="Show workspace pane"
                pressed={surface === 'workspace'}
                onPressedChange={() => onSelectSurface('workspace')}
                className="h-full px-2 font-mono"
              >
                WORK
              </Toggle>
            </div>
          )}
        </div>
        {visibleControls.leave && (
          <Button
            variant="destructive"
            onClick={onLeave}
            disabled={isDisconnecting}
            className="font-mono"
          >
            <PhoneDisconnectIcon weight="bold" />
            <span className="hidden md:inline">END CALL</span>
            <span className="inline md:hidden">END</span>
          </Button>
        )}
      </div>
    </div>
  );
}
