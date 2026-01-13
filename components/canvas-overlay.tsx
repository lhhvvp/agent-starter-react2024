'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface CanvasOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
  title?: string;
}

// A lightweight, always-available canvas overlay. It renders a full-screen
// canvas with a simple grid background as a placeholder for future features.
export function CanvasOverlay({ open, onClose, title = 'Canvas', className }: CanvasOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Resize and draw a basic grid to indicate the canvas is active
  useEffect(() => {
    if (!open) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      canvas.width = Math.floor(clientWidth * dpr);
      canvas.height = Math.floor(clientHeight * dpr);
      canvas.style.width = `${clientWidth}px`;
      canvas.style.height = `${clientHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // draw background
      ctx.fillStyle = 'hsl(0 0% 100% / 1)';
      ctx.fillRect(0, 0, clientWidth, clientHeight);

      // draw grid
      const step = 24;
      ctx.strokeStyle = 'hsl(0 0% 90% / 1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < clientWidth; x += step) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, clientHeight);
      }
      for (let y = 0; y < clientHeight; y += step) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(clientWidth, y + 0.5);
      }
      ctx.stroke();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    return () => ro.disconnect();
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn(
        'bg-background/80 fixed inset-0 z-[100] backdrop-blur supports-[backdrop-filter]:backdrop-blur',
        className
      )}
      aria-modal="true"
      role="dialog"
    >
      <div className="pointer-events-none absolute inset-0" />
      <div className="fixed inset-0 mx-auto flex max-w-5xl flex-col p-3 md:p-6">
        <div className="bg-background border-bg2 relative z-[101] flex items-center justify-between rounded-t-lg border px-3 py-2 md:px-4">
          <span className="font-mono text-sm font-semibold tracking-wider uppercase">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-muted rounded px-2 py-1 font-mono text-xs"
            aria-label="Close canvas"
          >
            CLOSE
          </button>
        </div>
        <div
          ref={containerRef}
          className="bg-background border-bg2 relative -mt-px flex-1 overflow-hidden rounded-b-lg border"
        >
          <canvas ref={canvasRef} className="block h-full w-full" />
        </div>
      </div>
    </div>
  );
}
