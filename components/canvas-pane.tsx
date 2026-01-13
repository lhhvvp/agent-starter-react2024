'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface CanvasPaneProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
}

// A docked canvas pane for the right side of the workspace when canvas is active.
// It only handles layout and a placeholder canvas drawing a subtle grid.
export function CanvasPane({ title = 'Canvas', className, ...props }: CanvasPaneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const draw = () => {
      const { clientWidth, clientHeight } = container;
      canvas.width = Math.floor(clientWidth * dpr);
      canvas.height = Math.floor(clientHeight * dpr);
      canvas.style.width = `${clientWidth}px`;
      canvas.style.height = `${clientHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // background
      ctx.fillStyle = 'hsl(0 0% 100% / 1)';
      ctx.fillRect(0, 0, clientWidth, clientHeight);

      // grid
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

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)} {...props}>
      <div className="bg-background border-bg2 flex items-center justify-between border-b px-3 py-2 md:px-4">
        <span className="font-mono text-xs font-semibold tracking-wider uppercase">{title}</span>
      </div>
      <div ref={containerRef} className="relative flex-1 overflow-hidden">
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>
    </div>
  );
}
