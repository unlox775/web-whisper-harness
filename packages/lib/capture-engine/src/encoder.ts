import lamejs from 'lamejs';

export class MP3Encoder {
  private encoder: any;
  private sampleRate: number;
  private bitrate: number;

  constructor(sampleRate: number, bitrate: number = 128) {
    this.sampleRate = sampleRate;
    this.bitrate = bitrate;
    this.encoder = new lamejs.Mp3Encoder(1, sampleRate, bitrate);
  }

  encode(float32Samples: Float32Array): Uint8Array {
    const int16Samples = this.convertToInt16(float32Samples);
    const mp3Buf = this.encoder.encodeBuffer(int16Samples);
    return new Uint8Array(mp3Buf);
  }

  flush(): Uint8Array {
    const mp3Buf = this.encoder.flush();
    return new Uint8Array(mp3Buf);
  }

  private convertToInt16(float32Samples: Float32Array): Int16Array {
    const int16Samples = new Int16Array(float32Samples.length);
    for (let i = 0; i < float32Samples.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Samples[i]));
      int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Samples;
  }

  createBlob(mp3Data: Uint8Array): Blob {
    return new Blob([mp3Data], { type: 'audio/mpeg' });
  }
}
