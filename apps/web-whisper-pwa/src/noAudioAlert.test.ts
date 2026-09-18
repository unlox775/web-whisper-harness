import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BEEP_COUNT,
  NO_AUDIO_BEEP_DELAY_MS,
  NO_AUDIO_BEEP_INTERVAL_MS,
  firstBeepDelayMs,
  playThreeBeepPattern,
  scheduleNoAudioBeeps,
  pcmHeartbeatFromStatus,
  shouldShowNoAudioAlert,
} from './noAudioAlert.ts';

describe('shouldShowNoAudioAlert', () => {
  it('does not alert on Start while live PCM heartbeats are flowing, even before the first 4s chunk', () => {
    assert.equal(
      shouldShowNoAudioAlert({
        recording: true,
        pcmHeartbeat: true,
        chunksEncoded: 0,
        msSinceRecordingStart: 250,
      }),
      false
    );
  });

  it('does not flash no-audio in the first second before a heartbeat is observed', () => {
    assert.equal(
      shouldShowNoAudioAlert({
        recording: true,
        pcmHeartbeat: false,
        chunksEncoded: 0,
        msSinceRecordingStart: 200,
      }),
      false
    );
  });

  it('alerts when recording is up and no PCM heartbeats arrive after the grace window', () => {
    assert.equal(
      shouldShowNoAudioAlert({
        recording: true,
        pcmHeartbeat: false,
        chunksEncoded: 0,
        msSinceRecordingStart: 1200,
      }),
      true
    );
  });

  it('alerts on mid-stream stall even after chunks exist', () => {
    assert.equal(
      shouldShowNoAudioAlert({
        recording: true,
        pcmHeartbeat: false,
        chunksEncoded: 3,
        stalled: true,
      }),
      true
    );
  });

  it('alerts on no_audio_received without requiring a stall flag', () => {
    assert.equal(
      shouldShowNoAudioAlert({
        recording: true,
        pcmHeartbeat: false,
        chunksEncoded: 0,
        noAudioReceived: true,
      }),
      true
    );
  });

  it('clears once PCM heartbeats are flowing and the stream is not stalled', () => {
    assert.equal(
      shouldShowNoAudioAlert({
        recording: true,
        pcmHeartbeat: true,
        chunksEncoded: 1,
        stalled: false,
      }),
      false
    );
  });

  it('does not alert when not recording', () => {
    assert.equal(shouldShowNoAudioAlert({ recording: false, pcmHeartbeat: false }), false);
  });
});

describe('pcmHeartbeatFromStatus', () => {
  it('treats live PCM queue samples as a heartbeat before any chunk encodes', () => {
    assert.equal(
      pcmHeartbeatFromStatus({ bufferSamples: 2048, currentDuration: 0, stalled: false }),
      true
    );
  });

  it('treats growing capture duration as a heartbeat while the stream is live', () => {
    assert.equal(
      pcmHeartbeatFromStatus({ bufferSamples: 0, currentDuration: 0.4, stalled: false }),
      true
    );
  });

  it('is false when the stream is stalled even if duration is non-zero', () => {
    assert.equal(
      pcmHeartbeatFromStatus({ bufferSamples: 0, currentDuration: 8, stalled: true }),
      false
    );
  });
});

describe('no-audio beep schedule', () => {
  it('waits ~5s from alert start before the first pattern', () => {
    assert.equal(firstBeepDelayMs(1_000, 1_000), NO_AUDIO_BEEP_DELAY_MS);
    assert.equal(firstBeepDelayMs(1_000, 4_000), 2_000);
    assert.equal(firstBeepDelayMs(1_000, 8_000), 0);
  });

  it('plays immediately then every ~5s when the stall is already past the delay', () => {
    const plays: number[] = [];
    const timeouts: Array<{ id: number; fn: () => void; ms: number }> = [];
    const intervals: Array<{ id: number; fn: () => void; ms: number }> = [];
    let nextId = 1;

    const cancel = scheduleNoAudioBeeps({
      alertActive: true,
      startedAt: 0,
      now: () => 12_000,
      play: () => plays.push(plays.length + 1),
      setTimeoutFn: ((fn: () => void, ms?: number) => {
        const id = nextId++;
        timeouts.push({ id, fn, ms: ms ?? 0 });
        return id;
      }) as typeof setTimeout,
      setIntervalFn: ((fn: () => void, ms?: number) => {
        const id = nextId++;
        intervals.push({ id, fn, ms: ms ?? 0 });
        return id;
      }) as typeof setInterval,
      clearTimeoutFn: () => undefined,
      clearIntervalFn: () => undefined,
    });

    assert.equal(timeouts.length, 1);
    assert.equal(timeouts[0]?.ms, 0);
    timeouts[0]?.fn();
    assert.equal(plays.length, 1);
    assert.equal(intervals.length, 1);
    assert.equal(intervals[0]?.ms, NO_AUDIO_BEEP_INTERVAL_MS);
    intervals[0]?.fn();
    intervals[0]?.fn();
    assert.equal(plays.length, 3);
    cancel();
  });

  it('does not schedule when the alert is inactive', () => {
    let scheduled = false;
    scheduleNoAudioBeeps({
      alertActive: false,
      startedAt: Date.now(),
      play: () => {
        scheduled = true;
      },
      setTimeoutFn: (() => {
        scheduled = true;
        return 1;
      }) as typeof setTimeout,
    });
    assert.equal(scheduled, false);
  });
});

describe('playThreeBeepPattern', () => {
  it('starts three oscillators on the provided context', () => {
    const oscillators: Array<{ start: number; stop: number }> = [];
    const context = {
      currentTime: 10,
      resume: async () => undefined,
      createOscillator: () => {
        const node = {
          type: 'sine',
          frequency: { value: 0 },
          connect: () => undefined,
          start: (at: number) => {
            oscillators.push({ start: at, stop: 0 });
          },
          stop: (at: number) => {
            oscillators[oscillators.length - 1]!.stop = at;
          },
        };
        return node;
      },
      createGain: () => ({
        gain: { value: 0 },
        connect: () => undefined,
      }),
      destination: {},
    };

    const played = playThreeBeepPattern(context as unknown as AudioContext);
    assert.equal(played, true);
    assert.equal(oscillators.length, BEEP_COUNT);
    assert.ok(oscillators[0]!.stop > oscillators[0]!.start);
    assert.ok(oscillators[2]!.start > oscillators[0]!.start);
  });

  it('returns false when no audio context is available', () => {
    assert.equal(playThreeBeepPattern(null), false);
  });
});
