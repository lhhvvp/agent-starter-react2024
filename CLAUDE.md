# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React-based voice assistant application built with Next.js and LiveKit. It provides a real-time voice interface for interacting with LiveKit agents, supporting voice communication, chat, video streaming, and screen sharing capabilities.

## Core Architecture

### Key Components

- **App Component** (`components/app.tsx`): Main application shell that manages room state and connection lifecycle
- **SessionView** (`components/session-view.tsx`): Primary interface during active sessions, handles agent interactions
- **Welcome Component** (`components/welcome.tsx`): Initial landing page with connection controls
- **AgentControlBar** (`components/livekit/agent-control-bar/`): Control panel for voice, video, chat, and screen sharing
- **MediaTiles** (`components/livekit/media-tiles.tsx`): Video/audio tile management for participants

### State Management

- **Room Management**: Uses LiveKit's Room class for connection state and participant management
- **Agent State**: Tracked via `useVoiceAssistant` hook from `@livekit/components-react`
- **Connection Details**: Generated via `/api/connection-details` endpoint with random room/participant names
- **Chat & Transcription**: Combined in `useChatAndTranscription` hook for unified messaging

### Configuration System

- **App Config** (`app-config.ts`): Centralized configuration for branding, features, and UI text
- **Environment Variables**: LiveKit credentials in `.env.local` (LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL)
- **Feature Flags**: `supportsChatInput`, `supportsVideoInput`, `supportsScreenShare`, `isPreConnectBufferEnabled`

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development server with Turbopack
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Linting and formatting
pnpm lint
pnpm format
pnpm format:check
```

## Task Management (Optional)

The project includes a `taskfile.yaml` for automation:

```bash
# Install dependencies (interactive)
task install

# Start development server (interactive)
task dev
```

## Key Dependencies

- **LiveKit**: `livekit-client`, `livekit-server-sdk`, `@livekit/components-react` for real-time communication
- **UI Framework**: Next.js with Tailwind CSS and Radix UI components
- **Animation**: Motion (Framer Motion) for smooth transitions
- **State Management**: React hooks with LiveKit's built-in state management

## Environment Setup

Requires `.env.local` with LiveKit credentials:

```env
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_URL=https://your-livekit-server-url
```

## Agent Integration

The app expects a LiveKit agent to be running separately. Agent states are monitored:

- `connecting`: Initial connection phase
- `listening`: Ready to receive voice input
- `thinking`: Processing user input
- `speaking`: Agent is responding

The app includes a 10-second timeout to detect if agents fail to join or initialize properly.

## Styling and Theming

- Uses CSS custom properties for dynamic theming (accent colors)
- Supports light/dark mode with system preference detection
- Font loading: Public Sans (Google Fonts) + Commit Mono (local)
- Responsive design with mobile-first approach
