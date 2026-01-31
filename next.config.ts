import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // LiveKit's client-side subscriptions (e.g. text stream handlers) can break under
  // React StrictMode's double-invocation of effects in dev, causing duplicate
  // handler registration errors like:
  // "A text stream handler for topic \"lk.transcription\" has already been set."
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
