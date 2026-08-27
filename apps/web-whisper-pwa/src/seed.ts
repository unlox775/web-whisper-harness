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
  const duration = 1025;
  
  await sessionStore.updateSession(sessionId, {
    duration,
    chunkCount: 256,
    createdAt: createdAt.toISOString(),
  });
  
  const sampleAudioData = new Uint8Array(1024).fill(0);
  const sampleBlob = new Blob([sampleAudioData], { type: 'audio/mpeg' });
  
  for (let i = 0; i < 4; i++) {
    await sessionStore.putChunk({
      id: crypto.randomUUID(),
      sessionId,
      seq: i,
      startTime: i * 4,
      duration: 4,
      sizeBytes: 1024,
      format: 'audio/mpeg',
      createdAt: new Date(createdAt.getTime() + i * 4000).toISOString(),
      blob: sampleBlob,
    });
  }
  
  const snips = [
    { startTime: 0, endTime: 20.6, duration: 20.6, text: 'Paó er hann hann. Hvað er það? Paó er hann. Paó er hann. Paó er hann. Who am I? I am... Ah, why do you ask? No. Doesn\'t matter. Yeah, my mask. Where am I masking from? And. Bang, bang, bang. Pin and... I\'m sorry. Charla doesn\'t want to talk to me about... Charla. Thank you.' },
    { startTime: 20.6, endTime: 45.2, duration: 24.6, text: 'Charlotte wants me to pretend to be someone else. I myself who wants to look at my marriage to her. has this wonderful new opportunity basically she has a medical thing in the last year.' },
    { startTime: 45.2, endTime: 75.8, duration: 30.6, text: 'Because her argument of, no, let\'s not talk about that. La, la, la, la, la, la, la, la, la, la, la. Not listening. La, la, la, la, la, la. That is not working anymore because she has to either. Take care of her health or we get a divorce.' },
    { startTime: 75.8, endTime: 90.0, duration: 14.2, text: 'This is a test snip with a rate limit error.' },
  ];
  
  for (let i = 0; i < snips.length; i++) {
    const snip = snips[i];
    const snipId = crypto.randomUUID();
    
    await sessionStore.putSnip({
      id: snipId,
      sessionId,
      startTime: snip.startTime,
      endTime: snip.endTime,
      duration: snip.duration,
      sizeBytes: 31500,
      createdAt: new Date(createdAt.getTime() + snip.startTime * 1000).toISOString(),
      blob: sampleBlob,
    });
    
    if (i < snips.length - 1) {
      await sessionStore.putTranscript({
        id: crypto.randomUUID(),
        sessionId,
        snipId,
        text: snip.text,
        createdAt: new Date(createdAt.getTime() + snip.endTime * 1000).toISOString(),
      });
    }
  }
  
  const volumeProfile = {
    sessionId,
    chunkVolumes: Array.from({ length: 256 }, (_, i) => ({
      chunkSeq: i,
      rms: 0.1 + Math.random() * 0.3,
      peak: 0.3 + Math.random() * 0.5,
    })),
    createdAt: new Date().toISOString(),
  };
  
  await sessionStore.putVolumeProfile(volumeProfile);
  
  console.log('Seeded test session with 4 snips (3 transcribed, 1 failed)');
  console.log('Session ID:', sessionId);
  console.log('Duration:', duration, 'seconds');
  console.log('Navigate to session detail to view');
  
  return sessionId;
}

if (typeof window !== 'undefined') {
  (window as any).seedTestSession = seedTestSession;
}
