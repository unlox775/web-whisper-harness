import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  STOP_FINISH_WAIT_MS,
  STOP_FINISHING_BUTTON_LABEL,
  STOP_FINISHING_HUD_LABEL,
  busyUiOnStopTap,
  isStopTapIgnored,
  waitForStopReady,
} from './stopFlow.ts';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('Stop flow busy UI', () => {
  it('switches to a disabled finishing state on tap', () => {
    const ui = busyUiOnStopTap('recording');
    assert.equal(ui.phase, 'finishing');
    assert.equal(ui.hudLabel, 'Finishing recording…');
    assert.equal(ui.buttonLabel, 'Saving recording…');
    assert.equal(ui.buttonDisabled, true);
    assert.equal(isStopTapIgnored('recording'), false);
    assert.equal(isStopTapIgnored(ui.phase), true);
  });

  it('ignores a second Stop tap while already finishing', () => {
    const first = busyUiOnStopTap('recording');
    const second = busyUiOnStopTap(first.phase);
    assert.equal(second.phase, 'finishing');
    assert.equal(second.buttonDisabled, true);
    assert.equal(isStopTapIgnored(second.phase), true);
  });

  it('keeps named copy and the 5s cap as constants', () => {
    assert.equal(STOP_FINISH_WAIT_MS, 5_000);
    assert.equal(STOP_FINISHING_HUD_LABEL, 'Finishing recording…');
    assert.equal(STOP_FINISHING_BUTTON_LABEL, 'Saving recording…');
  });
});

describe('waitForStopReady', () => {
  it('returns settled when persist and transcription finish before the cap', async () => {
    let persistDone = false;
    let transcribeDone = false;
    const work = Promise.all([
      delay(5).then(() => {
        persistDone = true;
      }),
      delay(8).then(() => {
        transcribeDone = true;
      }),
    ]);
    const outcome = await waitForStopReady(work, { timeoutMs: 200 });
    assert.equal(outcome, 'settled');
    assert.equal(persistDone, true);
    assert.equal(transcribeDone, true);
  });

  it('returns timed_out when work is still pending at the cap', async () => {
    const outcome = await waitForStopReady(delay(200), { timeoutMs: 15 });
    assert.equal(outcome, 'timed_out');
  });

  it('does not cancel persist/transcription when the UI timeout wins', async () => {
    let persistDone = false;
    const persist = delay(40).then(() => {
      persistDone = true;
    });
    const transcribe = new Promise<void>(() => {
      /* stays pending — coverage/partial status handles the rest */
    });
    const work = Promise.all([persist, transcribe]);
    const outcome = await waitForStopReady(work, { timeoutMs: 10 });
    assert.equal(outcome, 'timed_out');
    assert.equal(persistDone, false);
    await persist;
    assert.equal(persistDone, true);
  });

  it('treats a rejected work promise as settled for UI purposes without cancelling siblings', async () => {
    let siblingDone = false;
    const sibling = delay(20).then(() => {
      siblingDone = true;
    });
    const work = Promise.all([
      Promise.reject(new Error('ingest failed')),
      sibling,
    ]).catch(() => undefined);
    const outcome = await waitForStopReady(work, { timeoutMs: 200 });
    assert.equal(outcome, 'settled');
    await sibling;
    assert.equal(siblingDone, true);
  });
});
