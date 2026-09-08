/**
 * Assemble one Groq payload per snip: audio for [startTime, endTime], not a
 * raw 4s chunk and not the union of overlapping whole chunks.
 *
 * volume-analyzer stores chunkIds as every chunk that overlaps the snip range.
 * Adjacent snips that cut mid-chunk therefore share an entire ~4s MP3. Byte-
 * concatenating those refs sent overlapping windows to Groq and produced
 * ~3–4s phrase repeats (BLT-like, but a full chunk long).
 *
 * Shared by the PWA Transcribe path and the transcription Isolation Demo.
 */

const TIME_EPS = 1e-4;

export function rangesOverlap(aStart, aEnd, bStart, bEnd, epsilon = TIME_EPS) {
  return aStart < bEnd - epsilon && bStart < aEnd - epsilon;
}

export function sliceDuration(slice) {
  return Math.max(0, slice.sliceEndTime - slice.sliceStartTime);
}

/**
 * Chunks that actually overlap the snip time range. Prefers session chunk
 * times over stored chunkIds so imported / remapped snips still assemble
 * correctly. Falls back to chunkIds when times are missing.
 * @param {{ startTime: number, endTime: number, chunkIds?: string[] }} snip
 * @param {Array<{ id: string, startTime: number, endTime: number }>} chunks
 */
export function chunksOverlappingSnip(snip, chunks) {
  const timed = chunks.filter(
    (chunk) =>
      Number.isFinite(chunk.startTime) &&
      Number.isFinite(chunk.endTime) &&
      chunk.endTime > chunk.startTime
  );
  if (timed.length > 0 && Number.isFinite(snip.startTime) && Number.isFinite(snip.endTime)) {
    return timed
      .filter((chunk) => rangesOverlap(snip.startTime, snip.endTime, chunk.startTime, chunk.endTime))
      .sort((a, b) => a.startTime - b.startTime || String(a.id).localeCompare(String(b.id)));
  }
  const wanted = new Set(snip.chunkIds || []);
  return chunks.filter((chunk) => wanted.has(chunk.id));
}

/**
 * One trimmed slice per overlapping chunk. Adjacent snips that abut at T
 * share a chunk ref but not a slice window: [..., T) then [T, ...).
 */
export function planSnipAudioSlices(snip, chunks) {
  const overlapping = chunksOverlappingSnip(snip, chunks);
  const plans = [];
  for (const chunk of overlapping) {
    const sliceStartTime = Math.max(snip.startTime, chunk.startTime);
    const sliceEndTime = Math.min(snip.endTime, chunk.endTime);
    if (sliceEndTime - sliceStartTime <= TIME_EPS) continue;
    plans.push({
      chunkId: chunk.id,
      chunkStartTime: chunk.startTime,
      chunkEndTime: chunk.endTime,
      sliceStartTime,
      sliceEndTime,
    });
  }
  return plans;
}

export function describeSnipTranscriptionJobs(snips, chunks) {
  return snips.map((snip, index) => {
    const slices = planSnipAudioSlices(snip, chunks);
    return {
      snipId: snip.id || `snip-${index}`,
      startTime: snip.startTime,
      endTime: snip.endTime,
      groqCalls: 1,
      slices,
      assembledDuration: slices.reduce((sum, slice) => sum + sliceDuration(slice), 0),
      overlappingChunkCount: chunksOverlappingSnip(snip, chunks).length,
    };
  });
}

/** True when two adjacent snip jobs would send the same session-time audio. */
export function transcriptionWindowsOverlap(jobs) {
  const windows = jobs
    .flatMap((job) =>
      job.slices.map((slice) => ({
        snipId: job.snipId,
        start: slice.sliceStartTime,
        end: slice.sliceEndTime,
      }))
    )
    .sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < windows.length; i++) {
    if (rangesOverlap(windows[i - 1].start, windows[i - 1].end, windows[i].start, windows[i].end)) {
      return true;
    }
  }
  return false;
}

export function encodePcmWav(channelData, sampleRate) {
  const dataSize = channelData.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < channelData.length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export function wavDurationSeconds(blobBytes) {
  if (blobBytes.byteLength < 44) return 0;
  const view = new DataView(blobBytes);
  const sampleRate = view.getUint32(24, true);
  const dataSize = view.getUint32(40, true);
  if (!sampleRate) return 0;
  return dataSize / (sampleRate * 2);
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function mixToMono(channelData, length) {
  if (channelData.length === 1) return channelData[0];
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channelData) sum += channel[i] ?? 0;
    mono[i] = sum / channelData.length;
  }
  return mono;
}

function resampleLinear(input, fromRate, toRate) {
  if (fromRate === toRate || input.length === 0) return input;
  const outLength = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const output = new Float32Array(outLength);
  const scale = (input.length - 1) / Math.max(1, outLength - 1);
  for (let i = 0; i < outLength; i++) {
    const src = i * scale;
    const lo = Math.floor(src);
    const hi = Math.min(lo + 1, input.length - 1);
    const t = src - lo;
    output[i] = input[lo] * (1 - t) + input[hi] * t;
  }
  return output;
}

async function defaultDecode(blob) {
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('audio_context_unavailable');
  }
  const context = new AudioCtx();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
    const channels = [];
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      channels.push(audioBuffer.getChannelData(ch));
    }
    return {
      channelData: mixToMono(channels, audioBuffer.length),
      sampleRate: audioBuffer.sampleRate,
      duration: audioBuffer.duration,
    };
  } finally {
    await context.close();
  }
}

function sliceDecodedPcm(decoded, chunkStartTime, sliceStartTime, sliceEndTime) {
  const decodedEnd = chunkStartTime + decoded.duration;
  const from = Math.max(sliceStartTime, chunkStartTime);
  const to = Math.min(sliceEndTime, decodedEnd);
  if (to <= from + TIME_EPS) return new Float32Array(0);
  const startSample = Math.max(0, Math.floor((from - chunkStartTime) * decoded.sampleRate));
  const endSample = Math.min(
    decoded.channelData.length,
    Math.ceil((to - chunkStartTime) * decoded.sampleRate)
  );
  return decoded.channelData.subarray(startSample, Math.max(startSample, endSample));
}

/**
 * Exclusive fallback when decode is unavailable: keep whole chunks whose
 * midpoint sits in [snip.start, snip.end). Adjacent snips will not share a
 * chunk. Short edge snips with no midpoint fall back to overlap refs.
 */
export function exclusiveChunkIdsForSnip(snip, chunks) {
  const overlapping = chunksOverlappingSnip(snip, chunks);
  const owned = overlapping.filter((chunk) => {
    const mid = (chunk.startTime + chunk.endTime) / 2;
    return mid >= snip.startTime && mid < snip.endTime;
  });
  return (owned.length > 0 ? owned : overlapping).map((chunk) => chunk.id);
}

async function loadChunks(snip, options) {
  const listed = options.sessionChunks || [];
  let candidates = chunksOverlappingSnip(snip, listed);
  if (candidates.length === 0 && snip.chunkIds?.length) {
    const byId = new Map(listed.map((chunk) => [chunk.id, chunk]));
    candidates = snip.chunkIds.map((id) => byId.get(id) || { id, startTime: NaN, endTime: NaN });
  }
  if (!options.getChunk) return candidates;
  const loaded = [];
  for (const candidate of candidates) {
    const full = await options.getChunk(candidate.id);
    if (!full) continue;
    loaded.push({
      id: full.id || candidate.id,
      startTime: Number.isFinite(full.startTime) ? full.startTime : candidate.startTime,
      endTime: Number.isFinite(full.endTime) ? full.endTime : candidate.endTime,
      duration: full.duration ?? candidate.duration,
      blob: full.blob,
    });
  }
  return loaded;
}

function concatMp3(chunks, ids) {
  const wanted = new Set(ids);
  const blobs = chunks
    .filter((chunk) => wanted.has(chunk.id) && chunk.blob && chunk.blob.size > 0)
    .map((chunk) => chunk.blob);
  return new Blob(blobs, { type: 'audio/mpeg' });
}

/**
 * Build the blob sent to `transcribeAudio` for one snip.
 * Prefer decode → time-trim → WAV so Groq hears [startTime, endTime] only.
 * @param {{ id?: string, startTime: number, endTime: number, chunkIds?: string[] }} snip
 * @param {{ sessionChunks?: object[], getChunk?: Function, decode?: Function }} [options]
 */
export async function assembleSnipTranscriptionBlob(snip, options = {}) {
  const chunks = await loadChunks(snip, options);
  const slices = planSnipAudioSlices(snip, chunks);
  const decode = options.decode || defaultDecode;

  try {
    const parts = [];
    let sampleRate = 0;
    for (const slice of slices) {
      const chunk = chunks.find((item) => item.id === slice.chunkId);
      if (!chunk?.blob || chunk.blob.size <= 0) continue;
      const decoded = await decode(chunk.blob);
      if (!sampleRate) sampleRate = decoded.sampleRate;
      let pcm = sliceDecodedPcm(
        decoded,
        slice.chunkStartTime,
        slice.sliceStartTime,
        slice.sliceEndTime
      );
      if (decoded.sampleRate !== sampleRate) {
        pcm = resampleLinear(pcm, decoded.sampleRate, sampleRate);
      }
      if (pcm.length > 0) parts.push(pcm);
    }
    if (sampleRate > 0 && parts.length > 0) {
      const total = parts.reduce((sum, part) => sum + part.length, 0);
      const channelData = new Float32Array(total);
      let offset = 0;
      for (const part of parts) {
        channelData.set(part, offset);
        offset += part.length;
      }
      return {
        blob: encodePcmWav(channelData, sampleRate),
        kind: 'trimmed-wav',
        slices,
      };
    }
  } catch {
    // Decode unavailable (tests / missing AudioContext) or a bad chunk.
  }

  const exclusiveIds = exclusiveChunkIdsForSnip(snip, chunks);
  return {
    blob: concatMp3(chunks, exclusiveIds.length ? exclusiveIds : snip.chunkIds || []),
    kind: 'concat-mp3',
    slices,
  };
}
