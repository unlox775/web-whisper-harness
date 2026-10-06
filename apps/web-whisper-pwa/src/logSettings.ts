import { formatBytes } from './format';

/** Frozen package ids shown in Advanced Settings. Must match session-store. */
export const LOG_PACKAGE_IDS = [
  'session-store',
  'capture-engine',
  'volume-analyzer',
  'transcription-client',
  'playback-engine',
  'web-whisper-pwa',
] as const;

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'off'] as const;

export type LogPackageId = (typeof LOG_PACKAGE_IDS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];
export type PackageLogLevels = Record<LogPackageId, LogLevel>;

export const DEFAULT_LOG_LEVEL: LogLevel = 'info';
export const LOG_LEVELS_STORAGE_KEY = 'package_log_levels';

export function defaultPackageLogLevels(): PackageLogLevels {
  return {
    'session-store': DEFAULT_LOG_LEVEL,
    'capture-engine': DEFAULT_LOG_LEVEL,
    'volume-analyzer': DEFAULT_LOG_LEVEL,
    'transcription-client': DEFAULT_LOG_LEVEL,
    'playback-engine': DEFAULT_LOG_LEVEL,
    'web-whisper-pwa': DEFAULT_LOG_LEVEL,
  };
}

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value);
}

export function parsePackageLogLevels(raw: string | null | undefined): PackageLogLevels {
  const next = defaultPackageLogLevels();
  if (!raw) return next;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return next;
    const record = parsed as Record<string, unknown>;
    for (const packageId of LOG_PACKAGE_IDS) {
      if (isLogLevel(record[packageId])) {
        next[packageId] = record[packageId];
      }
    }
    return next;
  } catch {
    return next;
  }
}

export function serializePackageLogLevels(levels: PackageLogLevels): string {
  return JSON.stringify(levels);
}

export function withPackageLogLevel(
  current: PackageLogLevels,
  packageId: LogPackageId,
  level: LogLevel
): PackageLogLevels {
  return { ...current, [packageId]: level };
}

/** Total size line, same family as the DATA chip (`1.2 MB logs`). */
export function formatLogBytesLine(logBytes: number): string {
  return `${formatBytes(logBytes)} logs`;
}

export type LogByteSizeRow = { bytes: number; count: number };

export function formatLogPackageSize(packageId: string, row: LogByteSizeRow): string {
  return `${packageId} · ${formatBytes(row.bytes)}`;
}

export type LoggerConfigPatch = {
  levels?: Record<string, LogLevel>;
  activeSessionId?: string | null;
};

/**
 * Call session-store `configureLogger`. Passing `levels` replaces the in-memory
 * map; `activeSessionId: null` clears the take id.
 */
export function applyLoggerConfig(
  configureLogger: (options: LoggerConfigPatch) => unknown,
  options: { levels: PackageLogLevels; activeSessionId?: string | null }
): unknown {
  const patch: LoggerConfigPatch = { levels: { ...options.levels } };
  if (Object.prototype.hasOwnProperty.call(options, 'activeSessionId')) {
    patch.activeSessionId = options.activeSessionId ?? null;
  }
  return configureLogger(patch);
}
