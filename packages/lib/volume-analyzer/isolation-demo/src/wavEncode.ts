/**
 * Encode an AudioBuffer (or raw PCM) to a 16-bit WAV blob.
 * Demo-local helper — not a package export.
 */

export function encodePcmToWav(
  channelData: Float32Array[],
  sampleRate: number
): Blob {
  const channels = channelData.length > 0 ? channelData.length : 1;
  const frameCount = channelData[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let pos = 0;

  const setUint16 = (value: number) => {
    view.setUint16(pos, value, true);
    pos += 2;
  };
  const setUint32 = (value: number) => {
    view.setUint32(pos, value, true);
    pos += 4;
  };

  setUint32(0x46464952);
  setUint32(36 + dataSize);
  setUint32(0x45564157);
  setUint32(0x20746d66);
  setUint32(16);
  setUint16(1);
  setUint16(channels);
  setUint32(sampleRate);
  setUint32(sampleRate * blockAlign);
  setUint16(blockAlign);
  setUint16(16);
  setUint32(0x61746164);
  setUint32(dataSize);

  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const raw = channelData[ch]?.[i] ?? 0;
      const sample = Math.max(-1, Math.min(1, raw));
      view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      pos += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function encodeAudioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const channels: Float32Array[] = [];
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }
  return encodePcmToWav(channels, audioBuffer.sampleRate);
}
