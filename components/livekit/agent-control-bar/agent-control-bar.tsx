'use client';

import { type HTMLAttributes, useCallback, useState } from 'react';
import { Track } from 'livekit-client';
import { useChat, useRemoteParticipants } from '@livekit/components-react';
import { ChatTextIcon, PhoneDisconnectIcon } from '@phosphor-icons/react/dist/ssr';
import { TrackToggle } from '@/components/livekit/agent-control-bar/track-toggle';
import { Button } from '@/components/livekit/button';
import { Toggle } from '@/components/livekit/toggle';
import { cn } from '@/lib/utils';
import { ChatInput } from './chat-input';
import { UseInputControlsProps, useInputControls } from './hooks/use-input-controls';
import { usePublishPermissions } from './hooks/use-publish-permissions';
import { TrackSelector } from './track-selector';

export interface ControlBarControls {
  leave?: boolean;
  camera?: boolean;
  microphone?: boolean;
  screenShare?: boolean;
  chat?: boolean;
}

export interface AgentControlBarProps extends UseInputControlsProps {
  controls?: ControlBarControls;
  isConnected?: boolean;
  onChatOpenChange?: (open: boolean) => void;
<<<<<<< HEAD
=======
  /**
   * Optional controlled prop for chat open state. If provided, the control bar
   * will treat chat visibility as controlled by the parent and will not manage
   * internal state for it.
   */
  chatOpen?: boolean;
  onSendMessage?: (message: string) => Promise<void>;
  onDisconnect?: () => void;
>>>>>>> origin/main
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
  className,
<<<<<<< HEAD
  isConnected = false,
  onDisconnect,
  onDeviceError,
  onChatOpenChange,
=======
  onSendMessage,
  onChatOpenChange,
  chatOpen: controlledChatOpen,
  onDisconnect,
  onDeviceError,
  onToggleCanvas,
  canvasOpen,
  onSelectSurface,
  surface,
>>>>>>> origin/main
  ...props
}: AgentControlBarProps & HTMLAttributes<HTMLDivElement>) {
  const { send } = useChat();
  const participants = useRemoteParticipants();
<<<<<<< HEAD
  const [chatOpen, setChatOpen] = useState(false);
  const publishPermissions = usePublishPermissions();
=======
  // Support controlled/uncontrolled chatOpen
  const [uncontrolledChatOpen, setUncontrolledChatOpen] = React.useState(false);
  const isChatOpenControlled = controlledChatOpen !== undefined;
  const chatOpen = isChatOpenControlled ? controlledChatOpen! : uncontrolledChatOpen;
  const setChatOpen = (next: boolean) => {
    if (!isChatOpenControlled) setUncontrolledChatOpen(next);
    onChatOpenChange?.(next);
  };
  const [isSendingMessage, setIsSendingMessage] = React.useState(false);

  const isAgentAvailable = participants.some((p) => p.isAgent);
  const isInputDisabled = !chatOpen || !isAgentAvailable || isSendingMessage;

  const [isDisconnecting, setIsDisconnecting] = React.useState(false);

>>>>>>> origin/main
  const {
    micTrackRef,
    cameraToggle,
    microphoneToggle,
    screenShareToggle,
    handleAudioDeviceChange,
    handleVideoDeviceChange,
    handleMicrophoneDeviceSelectError,
    handleCameraDeviceSelectError,
  } = useInputControls({ onDeviceError, saveUserChoices });

  const handleSendMessage = async (message: string) => {
    await send(message);
  };

  const handleToggleTranscript = useCallback(
    (open: boolean) => {
      setChatOpen(open);
      onChatOpenChange?.(open);
    },
    [onChatOpenChange, setChatOpen]
  );

  const visibleControls = {
    leave: controls?.leave ?? true,
    microphone: controls?.microphone ?? publishPermissions.microphone,
    screenShare: controls?.screenShare ?? publishPermissions.screenShare,
    camera: controls?.camera ?? publishPermissions.camera,
    chat: controls?.chat ?? publishPermissions.data,
  };

<<<<<<< HEAD
  const isAgentAvailable = participants.some((p) => p.isAgent);
=======
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
>>>>>>> origin/main

  return (
    <div
      aria-label="Voice assistant controls"
      className={cn(
        'bg-background border-input/50 dark:border-muted flex flex-col rounded-[31px] border p-3 drop-shadow-md/3',
        className
      )}
      {...props}
    >
<<<<<<< HEAD
      {/* Chat Input */}
      {visibleControls.chat && (
        <ChatInput
          chatOpen={chatOpen}
          isAgentAvailable={isAgentAvailable}
          onSend={handleSendMessage}
        />
      )}
=======
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
>>>>>>> origin/main

      <div className="flex gap-1">
        <div className="flex grow gap-1">
          {/* Toggle Microphone */}
          {visibleControls.microphone && (
            <TrackSelector
              kind="audioinput"
              aria-label="Toggle microphone"
              source={Track.Source.Microphone}
              pressed={microphoneToggle.enabled}
              disabled={microphoneToggle.pending}
              audioTrackRef={micTrackRef}
              onPressedChange={microphoneToggle.toggle}
              onMediaDeviceError={handleMicrophoneDeviceSelectError}
              onActiveDeviceChange={handleAudioDeviceChange}
            />
          )}

<<<<<<< HEAD
          {/* Toggle Camera */}
          {visibleControls.camera && (
            <TrackSelector
              kind="videoinput"
              aria-label="Toggle camera"
              source={Track.Source.Camera}
              pressed={cameraToggle.enabled}
              pending={cameraToggle.pending}
              disabled={cameraToggle.pending}
              onPressedChange={cameraToggle.toggle}
              onMediaDeviceError={handleCameraDeviceSelectError}
              onActiveDeviceChange={handleVideoDeviceChange}
            />
          )}

          {/* Toggle Screen Share */}
          {visibleControls.screenShare && (
            <TrackToggle
              size="icon"
              variant="secondary"
              aria-label="Toggle screen share"
              source={Track.Source.ScreenShare}
              pressed={screenShareToggle.enabled}
              disabled={screenShareToggle.pending}
              onPressedChange={screenShareToggle.toggle}
            />
          )}

          {/* Toggle Transcript */}
          <Toggle
            size="icon"
            variant="secondary"
            aria-label="Toggle transcript"
            pressed={chatOpen}
            onPressedChange={handleToggleTranscript}
          >
            <ChatTextIcon weight="bold" />
          </Toggle>
=======
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
              <DeviceSelect
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
              disabled={!isAgentAvailable || !capabilities.supportsChatInput}
              className="aspect-square h-full"
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
                className="font-mono h-full px-2"
              >
                NONE
              </Toggle>
              <Toggle
                variant="secondary"
                aria-label="Show canvas pane"
                pressed={surface === 'canvas'}
                onPressedChange={() => onSelectSurface('canvas')}
                className="font-mono h-full px-2"
              >
                CANVAS
              </Toggle>
              <Toggle
                variant="secondary"
                aria-label="Show workspace pane"
                pressed={surface === 'workspace'}
                onPressedChange={() => onSelectSurface('workspace')}
                className="font-mono h-full px-2"
              >
                WORK
              </Toggle>
            </div>
          )}
>>>>>>> origin/main
        </div>

        {/* Disconnect */}
        {visibleControls.leave && (
          <Button
            variant="destructive"
            onClick={onDisconnect}
            disabled={!isConnected}
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
