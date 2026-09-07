/**
 * Serialize Isolation Demo archive / fixture / mic ticks.
 *
 * Clock `setInterval` used to fire `stepArchiveOnce` / `stepFixtureOnce`
 * without awaiting. If a tick was slower than the interval, two steps
 * captured the same snapshot; the later `apply` could overwrite and drop
 * a newlyClosed freeze.
 *
 * Skip-if-busy is for wall-clock fires only (skip that *timer* fire, not
 * a chunk). Mic / Replay remaining must queue — never drop a chunk.
 */

export type StepGate = {
  isBusy: () => boolean;
  runExclusive: <T>(fn: () => Promise<T>) => Promise<T>;
  tryRunExclusive: <T>(fn: () => Promise<T>) => Promise<T | 'skipped'>;
};

export function createStepGate(): StepGate {
  let busy = false;
  let tail: Promise<void> = Promise.resolve();

  const runExclusive = <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(async () => {
      busy = true;
      try {
        return await fn();
      } finally {
        busy = false;
      }
    });
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

  const tryRunExclusive = <T,>(fn: () => Promise<T>): Promise<T | 'skipped'> => {
    if (busy) return Promise.resolve('skipped');
    busy = true;
    const run = tail.then(async () => {
      try {
        return await fn();
      } finally {
        busy = false;
      }
    });
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

  return {
    isBusy: () => busy,
    runExclusive,
    tryRunExclusive,
  };
}
