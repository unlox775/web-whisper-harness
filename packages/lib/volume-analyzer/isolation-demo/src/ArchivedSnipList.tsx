import type { ArchivedLiveSnip } from './archiveSource';

function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds - mins * 60;
  if (mins <= 0) return `${secs.toFixed(1)}s`;
  const whole = Math.floor(secs);
  const frac = secs - whole;
  const fracLabel = frac >= 0.05 ? `.${Math.round(frac * 10)}` : '';
  return `${mins}:${String(whole).padStart(2, '0')}${fracLabel}`;
}

interface ArchivedSnipListProps {
  snips: ArchivedLiveSnip[];
  exportEnabled?: boolean;
  exportingKey?: string | null;
  onExport?: (snip: ArchivedLiveSnip, label: string) => void;
}

function ArchivedSnipList({
  snips,
  exportEnabled = false,
  exportingKey = null,
  onExport,
}: ArchivedSnipListProps) {
  if (snips.length === 0) {
    return <div className="snip-placeholder">No live snips in this archive</div>;
  }

  return (
    <div className="snip-list archived-snip-list">
      {snips.map((snip, index) => {
        const exportLabel = `live-${index + 1}`;
        const exporting = exportingKey === exportLabel;
        return (
        <div key={snip.id} className="snip-item archived">
          <div className="snip-item-header">
            <div className="snip-id">
              Live {index + 1} · {snip.id}
            </div>
            {onExport ? (
              <div className="snip-play-controls">
                <button
                  type="button"
                  className="snip-export-btn"
                  onClick={() => onExport(snip, exportLabel)}
                  disabled={!exportEnabled || exporting}
                >
                  {exporting ? 'Exporting…' : 'Export'}
                </button>
              </div>
            ) : null}
          </div>
          <div className="snip-detail">
            Time: {formatClock(snip.startTime)} → {formatClock(snip.endTime)}
          </div>
          <div className="snip-detail">Duration: {snip.duration.toFixed(1)}s</div>
          {snip.startChunkIndex != null && snip.endChunkIndex != null ? (
            <div className="snip-detail">
              Chunks: {snip.startChunkIndex}–{snip.endChunkIndex}
            </div>
          ) : null}
          {typeof snip.confidence === 'number' ? (
            <div className="snip-detail">Confidence: {(snip.confidence * 100).toFixed(0)}%</div>
          ) : null}
          {typeof snip.text === 'string' && snip.text.length > 0 ? (
            <p className="archived-snip-text">{snip.text}</p>
          ) : (
            <p className="archived-snip-text muted">No transcript text in archive</p>
          )}
        </div>
        );
      })}
    </div>
  );
}

export default ArchivedSnipList;
