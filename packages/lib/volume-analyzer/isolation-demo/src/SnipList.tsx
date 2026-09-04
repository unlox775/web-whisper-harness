import type { Snip } from './volumeAnalyzer';

export type SnipPlaybackStatus = 'idle' | 'playing' | 'paused' | 'loading';

interface SnipListProps {
  snips: Snip[];
  playbackSnipId: number | null;
  playbackStatus: SnipPlaybackStatus;
  onPlay: (snip: Snip) => void;
  onPause: () => void;
  onStop: () => void;
}

const SnipList: React.FC<SnipListProps> = ({
  snips,
  playbackSnipId,
  playbackStatus,
  onPlay,
  onPause,
  onStop,
}) => {
  if (snips.length === 0) {
    return (
      <div className="all-quiet-message">
        No speech detected (all-quiet session)
      </div>
    );
  }

  return (
    <div className="snip-list">
      {snips.map((snip) => {
        const active = playbackSnipId === snip.snipId;
        const playing = active && playbackStatus === 'playing';
        const paused = active && playbackStatus === 'paused';
        const loading = active && playbackStatus === 'loading';
        return (
          <div
            key={snip.snipId}
            className={`snip-item${active ? ' active' : ''}`}
          >
            <div className="snip-item-header">
              <div className="snip-id">Snip {snip.snipId}</div>
              <div className="snip-play-controls">
                {playing ? (
                  <button type="button" className="snip-play-btn" onClick={onPause}>
                    Pause
                  </button>
                ) : (
                  <button
                    type="button"
                    className="snip-play-btn"
                    onClick={() => onPlay(snip)}
                    disabled={loading}
                  >
                    {loading ? 'Loading…' : paused ? 'Resume' : 'Play'}
                  </button>
                )}
                <button
                  type="button"
                  className="snip-stop-btn"
                  onClick={onStop}
                  disabled={!active || playbackStatus === 'idle'}
                >
                  Stop
                </button>
              </div>
            </div>
            <div className="snip-detail">
              Chunks: {snip.startChunkIndex}–{snip.endChunkIndex}
            </div>
            <div className="snip-detail">
              Time: {snip.startTime.toFixed(1)}s – {snip.endTime.toFixed(1)}s
            </div>
            <div className="snip-detail">
              Duration: {snip.duration.toFixed(1)}s
            </div>
            <div className="snip-detail">
              Confidence: {(snip.confidence * 100).toFixed(0)}%
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SnipList;
