import { useState, useEffect, useCallback } from 'react';
import './App.css';
import { FIXTURE_PATTERNS, generateFixturePattern } from './fixtures';
import {
  analyzeChunksVolume,
  proposeSnipsFromProfile,
  type ChunkWithBlob,
  type ChunkVolumeProfile,
  type Snip,
} from './volumeAnalyzer';
import VolumeHistogram from './VolumeHistogram';
import SnipList from './SnipList';

// Storage: in-memory fixture chunks only. Must never open IndexedDB
// `web-whisper-db`. Live-capture toggle stays unimplemented. Reserved unused
// namespace: `web-whisper-isolation-demo-volume-analyzer`.

function App() {
  const [selectedPattern, setSelectedPattern] = useState(FIXTURE_PATTERNS[0].id);
  const [liveCaptureEnabled, setLiveCaptureEnabled] = useState(false);
  const [threshold, setThreshold] = useState(-40);
  
  const [chunks, setChunks] = useState<ChunkWithBlob[]>([]);
  const [volumeProfile, setVolumeProfile] = useState<ChunkVolumeProfile[] | null>(null);
  const [snips, setSnips] = useState<Snip[] | null>(null);
  
  const [isComputing, setIsComputing] = useState(false);
  const [isProposing, setIsProposing] = useState(false);

  // Generate fixture pattern when selection changes
  useEffect(() => {
    if (!liveCaptureEnabled) {
      const pattern = FIXTURE_PATTERNS.find(p => p.id === selectedPattern);
      if (pattern) {
        generateFixturePattern(pattern).then(setChunks);
      }
    }
  }, [selectedPattern, liveCaptureEnabled]);

  const handleComputeVolume = useCallback(async () => {
    if (chunks.length === 0) return;
    
    setIsComputing(true);
    try {
      const profiles = await analyzeChunksVolume(chunks);
      setVolumeProfile(profiles);
    } catch (error) {
      console.error('Volume computation failed:', error);
      alert('Failed to compute volume. Check console for details.');
    } finally {
      setIsComputing(false);
    }
  }, [chunks]);

  const handleProposeSnips = useCallback(() => {
    if (!volumeProfile) return;
    
    setIsProposing(true);
    try {
      const chunkMetadata = chunks.map(c => ({
        id: c.id,
        seq: c.seq,
        startTime: c.startTime,
        endTime: c.endTime,
        duration: c.duration,
      }));
      
      const proposedSnips = proposeSnipsFromProfile(
        volumeProfile,
        chunkMetadata,
        { quietThreshold: threshold }
      );
      
      setSnips(proposedSnips);
    } catch (error) {
      console.error('Snip proposal failed:', error);
      alert('Failed to propose snips. Check console for details.');
    } finally {
      setIsProposing(false);
    }
  }, [volumeProfile, chunks, threshold]);

  const handleThresholdChange = (newThreshold: number) => {
    setThreshold(newThreshold);
    
    // Auto-recompute snips if volume profile exists
    if (volumeProfile) {
      const chunkMetadata = chunks.map(c => ({
        id: c.id,
        seq: c.seq,
        startTime: c.startTime,
        endTime: c.endTime,
        duration: c.duration,
      }));
      
      const proposedSnips = proposeSnipsFromProfile(
        volumeProfile,
        chunkMetadata,
        { quietThreshold: newThreshold }
      );
      
      setSnips(proposedSnips);
    }
  };

  const handleReset = () => {
    setVolumeProfile(null);
    setSnips(null);
  };

  return (
    <div className="app">
      {/* Top Chrome */}
      <header className="top-chrome">
        <h1>Volume Analyzer Isolation Demo</h1>
        <div className="data-mode-chip">
          {liveCaptureEnabled ? 'LIVE FROM CAPTURE (in-memory)' : 'FIXTURE AUDIO'}
        </div>
        <div className="live-capture-toggle">
          <input
            type="checkbox"
            id="live-capture"
            checked={liveCaptureEnabled}
            onChange={(e) => setLiveCaptureEnabled(e.target.checked)}
            disabled
          />
          <label htmlFor="live-capture">Enable Live Capture (not implemented)</label>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Control Panel */}
        <aside className="control-panel">
          {!liveCaptureEnabled && (
            <div className="control-section">
              <label htmlFor="fixture-pattern">Fixture Pattern</label>
              <select
                id="fixture-pattern"
                value={selectedPattern}
                onChange={(e) => setSelectedPattern(e.target.value)}
                disabled={volumeProfile !== null}
              >
                {FIXTURE_PATTERNS.map(pattern => (
                  <option key={pattern.id} value={pattern.id}>
                    {pattern.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            className="primary"
            onClick={handleComputeVolume}
            disabled={isComputing || volumeProfile !== null || chunks.length === 0}
          >
            {isComputing ? 'Computing...' : 'Compute Volume'}
          </button>

          <button
            className="primary"
            onClick={handleProposeSnips}
            disabled={isProposing || !volumeProfile || snips !== null}
          >
            {isProposing ? 'Proposing...' : 'Propose Snips'}
          </button>

          <div className="control-section">
            <label htmlFor="threshold">Silence Threshold</label>
            <input
              type="range"
              id="threshold"
              min="-60"
              max="-20"
              step="1"
              value={threshold}
              onChange={(e) => handleThresholdChange(Number(e.target.value))}
            />
            <div className="threshold-value">{threshold} dB</div>
          </div>

          <button
            className="secondary"
            onClick={handleReset}
          >
            Reset
          </button>
        </aside>

        {/* Volume Histogram */}
        <section className="histogram-panel">
          <h2>Volume Profile (Peak dB per Chunk)</h2>
          <div className="histogram-container">
            {volumeProfile ? (
              <VolumeHistogram
                volumeProfile={volumeProfile}
                threshold={threshold}
                snips={snips}
              />
            ) : (
              <div className="histogram-placeholder">
                Click "Compute Volume" to generate profile
              </div>
            )}
          </div>
        </section>

        {/* Snip List */}
        <aside className="snip-list-panel">
          <h2>Proposed Snips</h2>
          {snips !== null ? (
            <SnipList snips={snips} />
          ) : (
            <div className="snip-placeholder">
              Click "Propose Snips" after volume computed
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

export default App;
