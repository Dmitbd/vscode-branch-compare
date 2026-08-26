import { GitOutputError } from './GitOutputError';

export interface GitPathIdentity {
  readonly path: string;
  readonly pathKey: string;
}

export function splitNul(output: Buffer, message: string): Buffer[] {
  if (output.length === 0) return [];
  const fields: Buffer[] = [];
  let start = 0;
  for (let index = 0; index < output.length; index += 1) {
    if (output[index] === 0) {
      fields.push(output.subarray(start, index));
      start = index + 1;
    }
  }
  if (start !== output.length) fields.push(output.subarray(start));
  if (fields.some((field) => field.length === 0)) throw new GitOutputError(message);
  return fields;
}

export function gitPath(bytes: Buffer): GitPathIdentity {
  if (bytes.length === 0 || bytes.includes(0) || bytes[0] === 0x2f) {
    throw new GitOutputError('Invalid Git path output.');
  }
  const segments = splitByte(bytes, 0x2f);
  if (segments.some((segment) => segment.equals(Buffer.from('.')) || segment.equals(Buffer.from('..')))) {
    throw new GitOutputError('Invalid Git path output.');
  }
  return Object.freeze({ path: displayPath(bytes), pathKey: bytes.toString('base64url') });
}

function displayPath(bytes: Buffer): string {
  try {
    return escapeDisplay(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return [...bytes].map((byte) => (
      byte === 0x5c ? '\\\\' : byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : `\\x${byte.toString(16).padStart(2, '0').toUpperCase()}`
    )).join('');
  }
}

function escapeDisplay(value: string): string {
  return [...value].map((character) => {
    const code = character.codePointAt(0)!;
    if (character === '\\') return '\\\\';
    if (character === '\t') return '\\t';
    if (character === '\n') return '\\n';
    if (character === '\r') return '\\r';
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return `\\x${code.toString(16).padStart(2, '0').toUpperCase()}`;
    if (/\p{Cf}/u.test(character)) return `\\u{${code.toString(16).toUpperCase()}}`;
    return character;
  }).join('');
}

function splitByte(value: Buffer, delimiter: number): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  for (let index = 0; index <= value.length; index += 1) {
    if (index === value.length || value[index] === delimiter) {
      parts.push(value.subarray(start, index));
      start = index + 1;
    }
  }
  return parts;
}
