import { useCallback, useEffect, useRef } from 'react';
import {
  HISTOGRAM_PADDING,
  isZoomedIn,
  scrollLeftForViewStart,
  sessionDurationFromProfile,
  timeToX,
  viewStartFromScrollLeft,
  xToTime,
} from './histogramViewport';
import {
  SAMPLE_WINDOW_MS,
  type ChunkVolumeProfile,
  type Snip,
} from './volumeAnalyzer';

interface VolumeHistogramProps {
  volumeProfile: ChunkVolumeProfile[];
  threshold: number;
  snips: Snip[] | null;
  viewStart: number;
  windowSeconds: number;
  /** Session-relative seconds, or null when idle. */
  playheadTime: number | null;
  onViewStartChange: (start: number) => void;
  onSnipActivate?: (snip: Snip) => void;
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

function drawHistogram(
  canvas: HTMLCanvasElement,
  volumeProfile: ChunkVolumeProfile[],
  threshold: number,
  snips: Snip[] | null,
  viewStart: number,
  windowSeconds: number,
  playheadTime: number | null
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  const padding = HISTOGRAM_PADDING;
  const chartWidth = Math.max(1, width - padding.left - padding.right);
  const chartHeight = Math.max(1, height - padding.top - padding.bottom);
  const viewEnd = viewStart + windowSeconds;

  const minDb = -60;
  const maxDb = 0;
  const dbRange = maxDb - minDb;
  const dbToY = (db: number) =>
    padding.top +
    chartHeight -
    ((Math.max(minDb, Math.min(maxDb, db)) - minDb) / dbRange) * chartHeight;

  const points = flattenSamples(volumeProfile);
  const toX = (time: number) => timeToX(time, viewStart, windowSeconds, chartWidth, padding.left);

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(padding.left, padding.top, chartWidth, chartHeight);
  ctx.clip();

  if (snips && snips.length > 0) {
    const palette = ['rgba(6, 182, 212, 0.22)', 'rgba(99, 102, 241, 0.22)', 'rgba(16, 185, 129, 0.22)'];
    snips.forEach((snip, index) => {
      if (snip.endTime < viewStart || snip.startTime > viewEnd) {
        return;
      }
      const x1 = toX(snip.startTime);
      const x2 = toX(snip.endTime);
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
    const barW = Math.max(1, chartWidth / Math.max(1, (windowSeconds * 1000) / SAMPLE_WINDOW_MS));
    points.forEach((point) => {
      if (point.time < viewStart - SAMPLE_WINDOW_MS / 1000 || point.time > viewEnd) {
        return;
      }
      const x = toX(point.time);
      const y = dbToY(point.db);
      const loud = point.db >= threshold;
      ctx.fillStyle = loud ? '#34d399' : '#f87171';
      ctx.fillRect(x, y, Math.max(1, barW - 0.5), padding.top + chartHeight - y);
    });
  }

  if (playheadTime !== null && playheadTime >= viewStart && playheadTime <= viewEnd) {
    const px = toX(playheadTime);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, padding.top);
    ctx.lineTo(px, padding.top + chartHeight);
    ctx.stroke();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.moveTo(px, padding.top);
    ctx.lineTo(px - 5, padding.top - 8);
    ctx.lineTo(px + 5, padding.top - 8);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();

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
  ctx.fillText(
    `Noise floor ${threshold.toFixed(0)} dB`,
    padding.left + 8,
    Math.max(padding.top + 12, thresholdY - 6)
  );

  ctx.fillStyle = '#6b7280';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  const tickEvery = Math.max(1, Math.ceil(windowSeconds / 6));
  const firstTick = Math.ceil(viewStart / tickEvery) * tickEvery;
  for (let t = firstTick; t <= viewEnd + 0.01; t += tickEvery) {
    ctx.fillText(`${t.toFixed(0)}s`, toX(t), padding.top + chartHeight + 18);
  }
}

const VolumeHistogram: React.FC<VolumeHistogramProps> = ({
  volumeProfile,
  threshold,
  snips,
  viewStart,
  windowSeconds,
  playheadTime,
  onViewStartChange,
  onSnipActivate,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ignoreScrollRef = useRef(false);

  const totalDuration = sessionDurationFromProfile(volumeProfile);
  const zoomed = isZoomedIn(totalDuration, windowSeconds);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawHistogram(canvas, volumeProfile, threshold, snips, viewStart, windowSeconds, playheadTime);
  }, [volumeProfile, threshold, snips, viewStart, windowSeconds, playheadTime]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      redraw();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !zoomed) return;
    const target = scrollLeftForViewStart(viewStart, totalDuration, windowSeconds, el.clientWidth);
    if (Math.abs(el.scrollLeft - target) > 1) {
      ignoreScrollRef.current = true;
      el.scrollLeft = target;
      requestAnimationFrame(() => {
        ignoreScrollRef.current = false;
      });
    }
  }, [viewStart, windowSeconds, totalDuration, zoomed]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || ignoreScrollRef.current) return;
    onViewStartChange(
      viewStartFromScrollLeft(el.scrollLeft, totalDuration, windowSeconds, el.clientWidth)
    );
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSnipActivate || !snips || snips.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const chartWidth = Math.max(1, rect.width - HISTOGRAM_PADDING.left - HISTOGRAM_PADDING.right);
    const time = xToTime(x, viewStart, windowSeconds, chartWidth, HISTOGRAM_PADDING.left);
    const hit = snips.find((snip) => time >= snip.startTime && time < snip.endTime);
    if (hit) {
      onSnipActivate(hit);
    }
  };

  const scrollInnerWidthPct =
    zoomed && windowSeconds > 0 ? Math.max(100, (totalDuration / windowSeconds) * 100) : 100;

  return (
    <div className="histogram-viewport">
      <canvas
        ref={canvasRef}
        className="histogram-canvas"
        style={{ width: '100%', height: '100%' }}
        onClick={handleCanvasClick}
      />
      {zoomed ? (
        <div
          ref={scrollRef}
          className="histogram-hscroll"
          onScroll={handleScroll}
          aria-label="Histogram timeline pan"
        >
          <div className="histogram-hscroll-inner" style={{ width: `${scrollInnerWidthPct}%` }} />
        </div>
      ) : null}
    </div>
  );
};

export default VolumeHistogram;
