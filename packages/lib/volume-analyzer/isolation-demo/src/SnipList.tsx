import type { Snip } from './volumeAnalyzer';

interface SnipListProps {
  snips: Snip[];
}

const SnipList: React.FC<SnipListProps> = ({ snips }) => {
  if (snips.length === 0) {
    return (
      <div className="all-quiet-message">
        No speech detected (all-quiet session)
      </div>
    );
  }

  return (
    <div className="snip-list">
      {snips.map(snip => (
        <div key={snip.snipId} className="snip-item">
          <div className="snip-id">Snip {snip.snipId}</div>
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
      ))}
    </div>
  );
};

export default SnipList;
