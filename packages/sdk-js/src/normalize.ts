import type { BinaryInput } from './types.js';

export async function toUint8Array(input: BinaryInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    const buf = await input.arrayBuffer();
    return new Uint8Array(buf);
  }
  throw new TypeError('Unsupported input type — expected Uint8Array, ArrayBuffer, or Blob');
}

export function toBytes(value: string | Uint8Array): Uint8Array {
  if (typeof value === 'string') {
    return new TextEncoder().encode(value);
  }
  return value;
}

export function utf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}
