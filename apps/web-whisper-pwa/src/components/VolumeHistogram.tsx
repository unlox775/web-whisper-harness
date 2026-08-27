import { useEffect, useRef } from 'react';
import type { SnipRecord } from '../types';

type Props = {
  profile: {
    chunkVolumes: Array<{
      chunkId: string;
      peakDb?: number;
      samples?: number[];
    }>;
  };
  snips: SnipRecord[];
};

export function VolumeHistogram({ profile, snips }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const samples = profile.chunkVolumes.flatMap((chunk) =>
    chunk.samples && chunk.samples.length ? chunk.samples : [chunk.peakDb ?? -100]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a0f18';
    ctx.fillRect(0, 0, width, height);

    const padding = 36;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    const minDb = -80;
    const maxDb = 0;
    const dbToY = (db: number) =>
      padding + chartHeight - ((Math.max(minDb, Math.min(maxDb, db)) - minDb) / (maxDb - minDb)) * chartHeight;

    ctx.strokeStyle = 'rgba(156,163,175,0.35)';
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + chartHeight);
    ctx.lineTo(padding + chartWidth, padding + chartHeight);
    ctx.stroke();

    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    for (let db = minDb; db <= maxDb; db += 20) {
      const y = dbToY(db);
      ctx.fillText(`${db}`, padding - 6, y + 4);
    }

    if (samples.length > 1) {
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      samples.forEach((db, index) => {
        const x = padding + (index / (samples.length - 1)) * chartWidth;
        const y = dbToY(db);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    const total = samples.length * 0.1;
    snips.forEach((snip, index) => {
      if (!total) return;
      const x = padding + (snip.startTime / total) * chartWidth;
      ctx.strokeStyle = '#f59e0b';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, padding + chartHeight);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f59e0b';
      ctx.textAlign = 'left';
      ctx.fillText(String(index + 1), x + 4, padding + 12);
    });
  }, [profile, snips, samples]);

  return <canvas ref={canvasRef} className="histogram" />;
}
