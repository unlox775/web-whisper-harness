import { formatBytes } from './format';

/** Public storage chip label — never surfaces the retention sentinel. */
export function formatStorageMeterLabel(input: {
  usedBytes: number;
  capBytes: number;
  usedBytesKnown: boolean;
  usedBytesStatus?: 'known' | 'unknown' | 'rebuilding';
}): string {
  const cap = formatCap(input.capBytes);
  if (!input.usedBytesKnown || input.usedBytes == null) {
    const pending =
      input.usedBytesStatus === 'rebuilding' || input.usedBytesStatus === 'unknown'
        ? 'Calculating…'
        : 'Calculating…';
    return `${pending} / ${cap}`;
  }
  return `${formatBytes(input.usedBytes)} / ${cap}`;
}

function formatCap(bytes: number): string {
  return formatBytes(bytes);
}
