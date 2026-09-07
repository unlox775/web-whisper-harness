import { useRef, useState } from 'react';
import * as sessionStore from '@web-whisper/session-store';
import { useApp } from '../context';
import {
  ARCHIVE_IMPORT_ACCEPT,
  ARCHIVE_IMPORT_HELP,
  archiveImportErrorMessage,
  importedArchiveSuccessMessage,
  importSessionZipFile,
  isArchiveImportError,
} from '../importSession';

type ImportSessionZipControlProps = {
  variant?: 'home' | 'settings';
};

export function ImportSessionZipControl({ variant = 'home' }: ImportSessionZipControlProps) {
  const app = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [tone, setTone] = useState<'idle' | 'error' | 'success'>('idle');
  const statusId = variant === 'settings' ? 'settings-import-status' : 'home-import-status';

  async function handleFile(file: File) {
    setBusy(true);
    setTone('idle');
    setStatus(`Importing ${file.name}…`);
    try {
      const result = await importSessionZipFile(file, sessionStore.importSessionArchive);
      if (isArchiveImportError(result)) {
        const message = archiveImportErrorMessage(result.error);
        setTone('error');
        setStatus(message);
        app.showToast(message, 'error');
        return;
      }

      const session = await sessionStore.getSession(result.sessionId);
      const flags = {
        hasSnips: Boolean(session?.hasSnips),
        hasTranscript: Boolean(session?.hasTranscript),
        hasVolumeProfile: Boolean(session?.hasVolumeProfile),
      };
      const message = importedArchiveSuccessMessage(flags);
      setTone('success');
      setStatus(message);
      app.showToast(message, 'success');
      app.setSettingsOpen(false);
      await app.refresh();
      app.openSession(result.sessionId);
    } catch (error) {
      const message = archiveImportErrorMessage(
        error instanceof Error && error.message === 'database_unavailable'
          ? 'database_unavailable'
          : 'not_a_zip'
      );
      setTone('error');
      setStatus(message);
      app.showToast(message, 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className={`import-session ${variant === 'settings' ? 'import-session-settings' : ''}`}>
      <input
        ref={inputRef}
        id={`${variant}-import-session-zip`}
        className="import-session-input"
        type="file"
        accept={ARCHIVE_IMPORT_ACCEPT}
        disabled={busy}
        aria-label="Import session zip"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <button
        type="button"
        className={variant === 'settings' ? 'cta-outline' : 'cta-outline'}
        disabled={busy}
        aria-controls={statusId}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Importing…' : 'Import session zip'}
      </button>
      <p className="help import-session-help">{ARCHIVE_IMPORT_HELP}</p>
      {status ? (
        <p
          id={statusId}
          className={`import-session-status ${tone === 'error' ? 'danger-text' : ''} ${
            tone === 'success' ? 'import-session-status-ok' : ''
          }`}
          role="status"
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}
