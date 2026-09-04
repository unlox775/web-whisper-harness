const WAV_SAMPLE_RATE = 44100;

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function writeWavHeader(view: DataView, dataSize: number, sampleRate: number): void {
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
}

export function encodeSineWavBlob(
  durationSeconds: number,
  frequency: number,
  sampleRate = WAV_SAMPLE_RATE
): Blob {
  const numSamples = Math.floor(durationSeconds * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeWavHeader(view, dataSize, sampleRate);
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
    const s = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function findWavDataChunk(bytes: Uint8Array): Uint8Array {
  if (bytes.byteLength < 44) {
    return bytes;
  }
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    const size = bytes[offset + 4]
      | (bytes[offset + 5] << 8)
      | (bytes[offset + 6] << 16)
      | (bytes[offset + 7] << 24);
    if (id === 'data') {
      return bytes.subarray(offset + 8, offset + 8 + size);
    }
    offset += 8 + size;
  }
  return bytes.subarray(44);
}

async function concatWavBlobs(blobs: Blob[]): Promise<Blob> {
  const pcmParts: Uint8Array[] = [];
  let total = 0;
  for (const blob of blobs) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pcm = findWavDataChunk(bytes);
    pcmParts.push(pcm);
    total += pcm.byteLength;
  }
  const buffer = new ArrayBuffer(44 + total);
  const view = new DataView(buffer);
  writeWavHeader(view, total, WAV_SAMPLE_RATE);
  const out = new Uint8Array(buffer);
  let offset = 44;
  for (const part of pcmParts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function isWavBlob(blob: Blob): boolean {
  return blob.type === 'audio/wav' || blob.type === 'audio/wave';
}

/** Concatenate same-kind blobs. WAV parts are remuxed; MP3 parts stay byte-concatenated. */
export async function concatAudioBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 1) {
    return blobs[0];
  }
  if (blobs.every(isWavBlob)) {
    return concatWavBlobs(blobs);
  }
  return new Blob(blobs, { type: blobs[0]?.type || 'audio/mpeg' });
}
