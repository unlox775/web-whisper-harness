import * as sessionStore from '@web-whisper/session-store';

export async function seedTestSession() {
  await sessionStore.init({ databaseName: 'web-whisper-db' });
  
  const sessionResult = await sessionStore.createSession();
  if (sessionResult.error || !sessionResult.id) {
    console.error('Failed to create session:', sessionResult.error);
    return null;
  }
  
  const sessionId = sessionResult.id;
  console.log('Created session:', sessionId);
  
  const createdAt = new Date();
  
  const sampleAudioData = new Uint8Array(10240).fill(0);
  const sampleBlob = new Blob([sampleAudioData], { type: 'audio/mpeg' });
  
  const chunkIds: string[] = [];
  for (let i = 0; i < 256; i++) {
    const result = await sessionStore.writeChunk(sessionId, {
      seq: i,
      startTime: i * 4,
      endTime: (i + 1) * 4,
      duration: 4,
      sizeBytes: 1024,
      blob: sampleBlob,
    });
    if (!result.error && result.chunkId) {
      chunkIds.push(result.chunkId);
    }
  }
  
  const snips = [
    { startTime: 0, endTime: 20.6, duration: 20.6, text: 'Paó er hann hann. Hvað er það? Paó er hann. Paó er hann. Paó er hann. Who am I? I am... Ah, why do you ask? No. Doesn\'t matter. Yeah, my mask. Where am I masking from? And. Bang, bang, bang. Pin and... I\'m sorry. Charla doesn\'t want to talk to me about... Charla. Thank you.' },
    { startTime: 20.6, endTime: 45.2, duration: 24.6, text: 'Charlotte wants me to pretend to be someone else. I myself who wants to look at my marriage to her. has this wonderful new opportunity basically she has a medical thing in the last year.' },
    { startTime: 45.2, endTime: 75.8, duration: 30.6, text: 'Because her argument of, no, let\'s not talk about that. La, la, la, la, la, la, la, la, la, la, la. Not listening. La, la, la, la, la, la. That is not working anymore because she has to either. Take care of her health or we get a divorce.' },
    { startTime: 75.8, endTime: 90.0, duration: 14.2, text: 'This is a test snip with a rate limit error.' },
  ];
  
  const snipIds: string[] = [];
  for (let i = 0; i < snips.length; i++) {
    const snip = snips[i];
    const startChunkIndex = Math.floor(snip.startTime / 4);
    const endChunkIndex = Math.floor(snip.endTime / 4);
    
    const result = await sessionStore.writeSnip(sessionId, {
      startChunkIndex,
      endChunkIndex,
      startTime: snip.startTime,
      endTime: snip.endTime,
      duration: snip.duration,
      chunkIds: chunkIds.slice(startChunkIndex, endChunkIndex + 1),
      confidence: 0.85,
    });
    
    if (!result.error && result.snipId) {
      snipIds.push(result.snipId);
      
      if (i < snips.length - 1) {
        await sessionStore.writeTranscript(result.snipId, snip.text);
      }
    }
  }
  
  const volumeProfile = {
    chunkVolumes: chunkIds.map((chunkId, i) => ({
      chunkId,
      peakDb: -20 + Math.random() * 10,
    })),
  };
  
  await sessionStore.writeVolumeProfile(sessionId, volumeProfile);
  
  console.log('✅ Seeded test session successfully!');
  console.log('Session ID:', sessionId);
  console.log('Chunks:', chunkIds.length);
  console.log('Snips:', snipIds.length, '(3 transcribed, 1 failed)');
  console.log('\n📱 Navigate to session detail to view the card');
  
  return sessionId;
}

if (typeof window !== 'undefined') {
  (window as any).seedTestSession = seedTestSession;
}
