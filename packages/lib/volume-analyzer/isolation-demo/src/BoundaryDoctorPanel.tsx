import {
  CONTIGUOUS_REPEAT_HEADLINE,
  NGRAM_SKIPPED_NO_TRANSCRIPTS,
  formatSnipRange,
  type BoundaryScanResult,
} from './volumeAnalyzer';

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(3)}s`;
}

function ScanCounts({
  title,
  result,
  tone,
}: {
  title: string;
  result: BoundaryScanResult;
  tone: 'live' | 'recomputed';
}) {
  return (
    <div className={`doctor-scan-col ${tone}`}>
      <h3>{title}</h3>
      <ul className="doctor-counts">
        <li>
          <strong>{result.snipCount}</strong> snip{result.snipCount === 1 ? '' : 's'}
        </li>
        <li>
          <strong>{result.overlapCount}</strong> overlap pair
          {result.overlapCount === 1 ? '' : 's'}
        </li>
        <li>
          {result.ngramSkipped ? (
            <span className="doctor-skipped">{NGRAM_SKIPPED_NO_TRANSCRIPTS}</span>
          ) : (
            <>
              <strong>{result.ngramHitCount}</strong> n-gram boundar
              {result.ngramHitCount === 1 ? 'y' : 'ies'}
            </>
          )}
        </li>
        <li>
          <strong>{result.contiguousRepeatCount}</strong> contiguous-repeat
          {result.contiguousRepeatCount === 1 ? '' : 's'}
        </li>
      </ul>
    </div>
  );
}

function FlaggedPairs({ result }: { result: BoundaryScanResult }) {
  const overlapKeys = new Set(
    result.overlaps.map((item) => `${item.leftIndex}:${item.rightIndex}`)
  );
  const ngramBoundaries = result.boundaries.filter((item) => item.ngramHits.length > 0);

  if (result.overlaps.length === 0 && ngramBoundaries.length === 0 && !result.ngramSkipped) {
    return <p className="doctor-empty">No overlap or n-gram flags on this set.</p>;
  }

  return (
    <ul className="doctor-pairs">
      {result.overlaps.map((overlap) => (
        <li key={`ov-${overlap.leftIndex}-${overlap.rightIndex}`} className="doctor-pair overlap">
          <div className="doctor-pair-times">
            #{overlap.leftLabel} {formatSnipRange(overlap.leftRange[0], overlap.leftRange[1])}
            {' × '}
            #{overlap.rightLabel} {formatSnipRange(overlap.rightRange[0], overlap.rightRange[1])}
          </div>
          <div className="doctor-pair-meta">
            Time overlap {formatSnipRange(overlap.overlapFrom, overlap.overlapTo)} (
            {formatSeconds(overlap.overlapDuration)})
          </div>
        </li>
      ))}
      {ngramBoundaries.map((boundary) => {
        const tokens = boundary.ngramHits[0]?.tokens.join(' ') ?? '';
        const k = boundary.ngramHits[0]?.k ?? 0;
        return (
          <li
            key={`ng-${boundary.leftIndex}-${boundary.rightIndex}`}
            className={`doctor-pair${boundary.contiguousBoundaryRepeat ? ' contiguous' : ''}`}
          >
            <div className="doctor-pair-times">
              #{boundary.leftLabel} {formatSnipRange(boundary.leftRange[0], boundary.leftRange[1])}
              {' × '}
              #{boundary.rightLabel} {formatSnipRange(boundary.rightRange[0], boundary.rightRange[1])}
            </div>
            <div className="doctor-pair-meta">
              Repeated tokens: <code>{tokens}</code> (k={k})
              {boundary.contiguousBoundaryRepeat
                ? ' · contiguous + repeat (overlap 0)'
                : overlapKeys.has(`${boundary.leftIndex}:${boundary.rightIndex}`)
                  ? ' · also overlaps in time'
                  : ''}
            </div>
          </li>
        );
      })}
      {result.ngramSkipped ? (
        <li className="doctor-pair skipped">
          <div className="doctor-pair-meta">{NGRAM_SKIPPED_NO_TRANSCRIPTS}</div>
        </li>
      ) : null}
    </ul>
  );
}

interface BoundaryDoctorPanelProps {
  liveScan: BoundaryScanResult | null;
  recomputedScan: BoundaryScanResult | null;
}

function BoundaryDoctorPanel({ liveScan, recomputedScan }: BoundaryDoctorPanelProps) {
  const both = liveScan != null && recomputedScan != null;
  const anyContiguous =
    (liveScan?.contiguousRepeatCount ?? 0) + (recomputedScan?.contiguousRepeatCount ?? 0) > 0;
  const anyOverlap =
    (liveScan?.overlapCount ?? 0) + (recomputedScan?.overlapCount ?? 0) > 0;

  return (
    <section className="doctor-panel" aria-label="Doctor boundary panel">
      <h2>Doctor / boundary</h2>
      <p className={`doctor-headline${anyContiguous ? ' finding' : ''}`}>
        {CONTIGUOUS_REPEAT_HEADLINE}
      </p>
      <p className="doctor-copy">
        Contiguous times with repeated words is a finding even when overlap is 0 (Dave’s BLT
        case). Abutting ranges are not counted as time overlaps.
      </p>
      {!anyOverlap && anyContiguous ? (
        <p className="doctor-zero-overlap">
          Overlap count is 0 — still a finding because the cuts abut and the words repeat.
        </p>
      ) : null}

      {both ? (
        <div className="doctor-compare">
          <ScanCounts title="Live (archived)" result={liveScan} tone="live" />
          <ScanCounts title="Recomputed" result={recomputedScan} tone="recomputed" />
        </div>
      ) : liveScan ? (
        <ScanCounts title="Live (archived)" result={liveScan} tone="live" />
      ) : recomputedScan ? (
        <ScanCounts title="Recomputed" result={recomputedScan} tone="recomputed" />
      ) : null}

      {both ? (
        <>
          <h3 className="doctor-subhead">Live flagged pairs</h3>
          <FlaggedPairs result={liveScan} />
          <h3 className="doctor-subhead">Recomputed flagged pairs</h3>
          <FlaggedPairs result={recomputedScan} />
        </>
      ) : liveScan ? (
        <FlaggedPairs result={liveScan} />
      ) : recomputedScan ? (
        <FlaggedPairs result={recomputedScan} />
      ) : null}
    </section>
  );
}

export default BoundaryDoctorPanel;
