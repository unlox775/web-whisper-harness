import { formatTimestamp } from './format.ts';

export type BuildIdentity = {
  version: string;
  gitSha: string;
  gitShaFull: string;
  buildTimeIso: string;
};

type BuildIdentityEnv = {
  VITE_APP_VERSION?: string;
  VITE_GIT_SHA?: string;
  VITE_GIT_SHA_FULL?: string;
  VITE_BUILD_TIME?: string;
};

function envText(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function resolveBuildIdentity(env: BuildIdentityEnv): BuildIdentity {
  return {
    version: envText(env.VITE_APP_VERSION, 'unknown'),
    gitSha: envText(env.VITE_GIT_SHA, 'unknown'),
    gitShaFull: envText(env.VITE_GIT_SHA_FULL, 'unknown'),
    buildTimeIso: envText(env.VITE_BUILD_TIME, 'unknown'),
  };
}

export function readBuildIdentity(): BuildIdentity {
  return resolveBuildIdentity({
    VITE_APP_VERSION: import.meta.env.VITE_APP_VERSION,
    VITE_GIT_SHA: import.meta.env.VITE_GIT_SHA,
    VITE_GIT_SHA_FULL: import.meta.env.VITE_GIT_SHA_FULL,
    VITE_BUILD_TIME: import.meta.env.VITE_BUILD_TIME,
  });
}

export function formatBuiltAt(iso: string): string | null {
  if (!iso || iso === 'unknown') return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return formatTimestamp(iso);
}

export function buildIdentityLines(identity: BuildIdentity): string[] {
  const lines = [`Version ${identity.version}`, `Build ${identity.gitSha || 'unknown'}`];
  const built = formatBuiltAt(identity.buildTimeIso);
  if (built) lines.push(`Built ${built}`);
  return lines;
}
