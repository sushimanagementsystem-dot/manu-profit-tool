import type { SniffedType } from './upload-limits';

export type SniffResult =
  | { ok: true; type: SniffedType }
  | { ok: false; reason: 'legacy_xls' | 'heic' | 'unknown' };

const startsWith = (buffer: Buffer, bytes: number[]) =>
  bytes.every((byte, index) => buffer[index] === byte);

/**
 * Identifies a file by its content, never by the name or browser-reported MIME type.
 * The filename is only used to tell CSV (plain text) apart from other text.
 */
export function sniffFile(buffer: Buffer, fileName: string): SniffResult {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return { ok: true, type: 'pdf' };
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ok: true, type: 'png' };
  }
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return { ok: true, type: 'jpeg' };
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    return isXlsxZip(buffer) ? { ok: true, type: 'xlsx' } : { ok: false, reason: 'unknown' };
  }
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0])) return { ok: false, reason: 'legacy_xls' };
  if (buffer.subarray(4, 12).toString('latin1').match(/^ftyp(heic|heix|mif1)/)) {
    return { ok: false, reason: 'heic' };
  }
  if (/\.(csv|txt)$/i.test(fileName) && looksLikeText(buffer)) return { ok: true, type: 'csv' };
  return { ok: false, reason: 'unknown' };
}

function isXlsxZip(buffer: Buffer): boolean {
  // ZIP entry names are stored uncompressed, so the workbook part name is visible in the bytes.
  return buffer.includes('xl/workbook.xml') && buffer.includes('[Content_Types].xml');
}

function looksLikeText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8192);
  if (sample.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample);
    return true;
  } catch {
    // Allow Windows-1252 exports from older POS systems as long as they are printable.
    return sample.every((byte) => byte >= 0x09);
  }
}

/** Best-effort PDF page count; null when the structure is compressed and can't be counted cheaply. */
export function countPdfPages(buffer: Buffer): number | null {
  const matches = buffer.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  return matches ? matches.length : null;
}

/**
 * Sum of the uncompressed sizes declared in a ZIP's central directory.
 * Guards against zip bombs before a spreadsheet library inflates the file in memory.
 */
export function zipUncompressedSize(buffer: Buffer): number {
  let total = 0;
  let offset = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (offset < 0) return Number.POSITIVE_INFINITY;
  const entries = buffer.readUInt16LE(offset + 10);
  offset = buffer.readUInt32LE(offset + 16);
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      return Number.POSITIVE_INFINITY;
    }
    total += buffer.readUInt32LE(offset + 24);
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
  return total;
}
