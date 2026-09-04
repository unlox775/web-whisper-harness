/**
 * Store-only ZIP (compression method 0) for session archives.
 * Works in the browser and in node:test (no extra dependency).
 */

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const UTF8_FLAG = 0x0800;
const VERSION_NEEDED = 20;

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let crc = i;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  CRC_TABLE[i] = crc >>> 0;
}

/**
 * @param {Uint8Array} bytes
 * @returns {number}
 */
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * @param {Array<{ name: string, data: Uint8Array }>} entries
 * @returns {Uint8Array}
 */
export function createZip(entries) {
  const encoder = new TextEncoder();
  const locals = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, LOCAL_SIG, true);
    view.setUint16(4, VERSION_NEEDED, true);
    view.setUint16(6, UTF8_FLAG, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, checksum, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push({
      local,
      nameBytes,
      checksum,
      size: data.length,
      offset,
    });
    offset += local.length;
  }

  const centralParts = [];
  let centralSize = 0;
  for (const item of locals) {
    const central = new Uint8Array(46 + item.nameBytes.length);
    const view = new DataView(central.buffer);
    view.setUint32(0, CENTRAL_SIG, true);
    view.setUint16(4, VERSION_NEEDED, true);
    view.setUint16(6, VERSION_NEEDED, true);
    view.setUint16(8, UTF8_FLAG, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, item.checksum, true);
    view.setUint32(20, item.size, true);
    view.setUint32(24, item.size, true);
    view.setUint16(28, item.nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, item.offset, true);
    central.set(item.nameBytes, 46);
    centralParts.push(central);
    centralSize += central.length;
  }

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, EOCD_SIG, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, locals.length, true);
  eocdView.setUint16(10, locals.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);
  eocdView.setUint16(20, 0, true);

  const out = new Uint8Array(offset + centralSize + eocd.length);
  let cursor = 0;
  for (const item of locals) {
    out.set(item.local, cursor);
    cursor += item.local.length;
  }
  for (const part of centralParts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  out.set(eocd, cursor);
  return out;
}

function findEocdOffset(bytes) {
  const min = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * @param {Uint8Array | ArrayBuffer} buffer
 * @returns {{ error: string } | { files: Map<string, Uint8Array> }}
 */
export function readZip(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 22) {
    return { error: 'not_a_zip' };
  }
  const eocdOffset = findEocdOffset(bytes);
  if (eocdOffset < 0) {
    return { error: 'not_a_zip' };
  }
  const eocd = new DataView(bytes.buffer, bytes.byteOffset + eocdOffset, 22);
  if (eocd.getUint32(0, true) !== EOCD_SIG) {
    return { error: 'not_a_zip' };
  }
  const entryCount = eocd.getUint16(10, true);
  const centralSize = eocd.getUint32(12, true);
  const centralOffset = eocd.getUint32(16, true);
  if (centralOffset + centralSize > bytes.length) {
    return { error: 'not_a_zip' };
  }

  const decoder = new TextDecoder();
  const files = new Map();
  let cursor = centralOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (cursor + 46 > bytes.length) {
      return { error: 'not_a_zip' };
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset + cursor, 46);
    if (view.getUint32(0, true) !== CENTRAL_SIG) {
      return { error: 'not_a_zip' };
    }
    const compression = view.getUint16(10, true);
    const size = view.getUint32(24, true);
    const nameLen = view.getUint16(28, true);
    const extraLen = view.getUint16(30, true);
    const commentLen = view.getUint16(32, true);
    const localOffset = view.getUint32(42, true);
    const nameStart = cursor + 46;
    const nameBytes = bytes.subarray(nameStart, nameStart + nameLen);
    const name = decoder.decode(nameBytes);
    cursor = nameStart + nameLen + extraLen + commentLen;

    if (compression !== 0) {
      return { error: 'not_a_zip' };
    }
    if (localOffset + 30 > bytes.length) {
      return { error: 'not_a_zip' };
    }
    const local = new DataView(bytes.buffer, bytes.byteOffset + localOffset, 30);
    if (local.getUint32(0, true) !== LOCAL_SIG) {
      return { error: 'not_a_zip' };
    }
    const localNameLen = local.getUint16(26, true);
    const localExtraLen = local.getUint16(28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + size > bytes.length) {
      return { error: 'not_a_zip' };
    }
    files.set(name, bytes.subarray(dataStart, dataStart + size));
  }

  return { files };
}
