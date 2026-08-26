import { useEffect, useRef } from 'react';
import type { ChunkVolumeProfile, Snip } from './volumeAnalyzer';

interface VolumeHistogramProps {
  volumeProfile: ChunkVolumeProfile[];
  threshold: number;
  snips: Snip[] | null;
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

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw axes
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Y-axis (dB scale: -60 to 0)
    const minDb = -60;
    const maxDb = 0;
    const dbRange = maxDb - minDb;

    const dbToY = (db: number) => {
      return padding + chartHeight - ((db - minDb) / dbRange) * chartHeight;
    };

    // Draw Y-axis
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + chartHeight);
    ctx.stroke();

    // Draw Y-axis labels
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    for (let db = minDb; db <= maxDb; db += 10) {
      const y = dbToY(db);
      ctx.fillText(`${db}dB`, padding - 10, y + 4);
      
      // Grid line
      ctx.strokeStyle = '#f0f0f0';
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + chartWidth, y);
      ctx.stroke();
    }

    // Draw X-axis
    ctx.strokeStyle = '#ddd';
    ctx.beginPath();
    ctx.moveTo(padding, padding + chartHeight);
    ctx.lineTo(padding + chartWidth, padding + chartHeight);
    ctx.stroke();

    // Draw bars
    const barWidth = chartWidth / volumeProfile.length;
    const barPadding = 2;

    volumeProfile.forEach((chunk, index) => {
      const x = padding + index * barWidth;
      const barHeight = ((chunk.peakDb - minDb) / dbRange) * chartHeight;
      const y = padding + chartHeight - barHeight;

      // Color based on threshold
      const isLoud = chunk.peakDb >= threshold;
      ctx.fillStyle = isLoud ? '#4ade80' : '#f87171';

      ctx.fillRect(
        x + barPadding,
        y,
        barWidth - barPadding * 2,
        barHeight
      );
    });

    // Draw threshold line
    const thresholdY = dbToY(threshold);
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding, thresholdY);
    ctx.lineTo(padding + chartWidth, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw threshold label
    ctx.fillStyle = '#667eea';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Threshold: ${threshold}dB`, padding + 10, thresholdY - 5);

    // Draw snip boundaries
    if (snips && snips.length > 0) {
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 3;

      snips.forEach(snip => {
        // Draw start line
        const startX = padding + snip.startChunkIndex * barWidth;
        ctx.beginPath();
        ctx.moveTo(startX, padding);
        ctx.lineTo(startX, padding + chartHeight);
        ctx.stroke();

        // Draw end line
        const endX = padding + (snip.endChunkIndex + 1) * barWidth;
        ctx.beginPath();
        ctx.moveTo(endX, padding);
        ctx.lineTo(endX, padding + chartHeight);
        ctx.stroke();
      });
    }

    // Draw X-axis labels (chunk indices)
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    volumeProfile.forEach((_chunk, index) => {
      if (index % Math.ceil(volumeProfile.length / 10) === 0) {
        const x = padding + index * barWidth + barWidth / 2;
        ctx.fillText(`${index}`, x, padding + chartHeight + 20);
      }
    });

  }, [volumeProfile, threshold, snips]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
};

export default VolumeHistogram;
