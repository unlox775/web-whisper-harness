import { useEffect, useRef } from 'react';
import {
  SAMPLE_WINDOW_MS,
  type ChunkVolumeProfile,
  type Snip,
} from './volumeAnalyzer';

interface VolumeHistogramProps {
  volumeProfile: ChunkVolumeProfile[];
  threshold: number;
  snips: Snip[] | null;
}

function flattenSamples(volumeProfile: ChunkVolumeProfile[]): { time: number; db: number }[] {
  const points: { time: number; db: number }[] = [];
  let t = 0;
  for (const chunk of volumeProfile) {
    for (let i = 0; i < chunk.samples.length; i++) {
      points.push({ time: t + (i * SAMPLE_WINDOW_MS) / 1000, db: chunk.samples[i] });
    }
    t += (chunk.samples.length * SAMPLE_WINDOW_MS) / 1000;
  }
  return points;
}

const VolumeHistogram: React.FC<VolumeHistogramProps> = ({
  volumeProfile,
  threshold,
  snips,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    const padding = { left: 48, right: 16, top: 28, bottom: 36 };
    const chartWidth = Math.max(1, width - padding.left - padding.right);
    const chartHeight = Math.max(1, height - padding.top - padding.bottom);

    const minDb = -60;
    const maxDb = 0;
    const dbRange = maxDb - minDb;
    const dbToY = (db: number) =>
      padding.top + chartHeight - ((Math.max(minDb, Math.min(maxDb, db)) - minDb) / dbRange) * chartHeight;

    const points = flattenSamples(volumeProfile);
    const totalTime =
      points.length > 0 ? points[points.length - 1].time + SAMPLE_WINDOW_MS / 1000 : 1;
    const timeToX = (time: number) => padding.left + (time / totalTime) * chartWidth;

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'right';
    for (let db = minDb; db <= maxDb; db += 10) {
      const y = dbToY(db);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
      ctx.fillText(`${db}`, padding.left - 8, y + 4);
    }

    if (snips && snips.length > 0) {
      const palette = ['rgba(6, 182, 212, 0.22)', 'rgba(99, 102, 241, 0.22)', 'rgba(16, 185, 129, 0.22)'];
      snips.forEach((snip, index) => {
        const x1 = timeToX(snip.startTime);
        const x2 = timeToX(snip.endTime);
        ctx.fillStyle = palette[index % palette.length];
        ctx.fillRect(x1, padding.top, Math.max(2, x2 - x1), chartHeight);
        ctx.strokeStyle = '#0891b2';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, padding.top);
        ctx.lineTo(x1, padding.top + chartHeight);
        ctx.moveTo(x2, padding.top);
        ctx.lineTo(x2, padding.top + chartHeight);
        ctx.stroke();
        ctx.fillStyle = '#0e7490';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`S${snip.snipId} ${snip.duration.toFixed(1)}s`, x1 + 4, padding.top + 14);
      });
    }

    if (points.length > 0) {
      const barW = Math.max(1, chartWidth / points.length);
      points.forEach((point) => {
        const x = timeToX(point.time);
        const y = dbToY(point.db);
        const loud = point.db >= threshold;
        ctx.fillStyle = loud ? '#34d399' : '#f87171';
        ctx.fillRect(x, y, Math.max(1, barW - 0.5), padding.top + chartHeight - y);
      });
    }

    const thresholdY = dbToY(threshold);
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, thresholdY);
    ctx.lineTo(padding.left + chartWidth, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#7c3aed';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Noise floor ${threshold.toFixed(0)} dB`, padding.left + 8, Math.max(padding.top + 12, thresholdY - 6));

    ctx.fillStyle = '#6b7280';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    const tickEvery = Math.max(1, Math.ceil(totalTime / 6));
    for (let t = 0; t <= totalTime + 0.01; t += tickEvery) {
      ctx.fillText(`${t.toFixed(0)}s`, timeToX(t), padding.top + chartHeight + 18);
    }
  }, [volumeProfile, threshold, snips]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
};

export default VolumeHistogram;
