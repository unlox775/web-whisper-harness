export type SessionRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  duration: number;
  chunkCount: number;
  sizeBytes: number;
  hasVolumeProfile: boolean;
  hasSnips: boolean;
  hasTranscript: boolean;
  status?: 'recording' | 'ready' | 'error';
};

export type ChunkRecord = {
  id: string;
  sessionId: string;
  seq: number;
  startTime: number;
  endTime: number;
  duration: number;
  sizeBytes: number;
  blob?: Blob;
  audioPurgedAt?: number | string | null;
};

export type SnipRecord = {
  id: string;
  sessionId: string;
  startChunkIndex: number;
  endChunkIndex: number;
  startTime: number;
  endTime: number;
  duration: number;
  chunkIds: string[];
  confidence: number;
  createdAt: string;
  audioPurgedAt?: number | string | null;
};

export type TranscriptRecord = {
  snipId: string;
  sessionId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type ToastTone = 'success' | 'warning' | 'error';

export type ToastMessage = {
  id: number;
  text: string;
  tone: ToastTone;
};

export type Screen = 'home' | 'recording' | 'session';

export type AppSettings = {
  groqApiKey: string;
  storageCapMb: number;
  developerModeEnabled: boolean;
  onboardingDismissed: boolean;
  keyValid: boolean | null;
  keyStatus: string;
};
