export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API is not available; Node 20+, Bun, Deno, and modern browsers are required');
  }
  const view = new Uint8Array(bytes.byteLength);
  view.set(bytes);
  const hash = await subtle.digest('SHA-256', view.buffer);
  return bytesToHex(new Uint8Array(hash));
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * MD5 of the given bytes, returned as a lowercase hex string.
 *
 * MD5 is cryptographically broken and is used here ONLY because the PDF
 * specification mandates an MD5 /CheckSum on embedded-file /Params (spec §4.1);
 * Web Crypto does not expose MD5, so we provide a small RFC 1321 implementation.
 */
export function md5Hex(bytes: Uint8Array): string {
  const digest = md5(bytes);
  return bytesToHex(digest);
}

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
  21,
];

const K = (() => {
  const out = new Uint32Array(64);
  for (let i = 0; i < 64; i += 1) {
    out[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  }
  return out;
})();

function md5(input: Uint8Array): Uint8Array {
  const originalBitLen = input.length * 8;
  const padLen = ((input.length + 8) >> 6) + 1; // number of 64-byte blocks
  const msg = new Uint8Array(padLen * 64);
  msg.set(input);
  msg[input.length] = 0x80;
  const view = new DataView(msg.buffer);
  view.setUint32(msg.length - 8, originalBitLen >>> 0, true);
  view.setUint32(msg.length - 4, Math.floor(originalBitLen / 2 ** 32) >>> 0, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const m = new Uint32Array(16);
  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i += 1) {
      m[i] = view.getUint32(off + i * 4, true);
    }
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i += 1) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      f = (f + a + K[i]! + m[g]!) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotl(f, S[i]!)) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  return out;
}

function rotl(x: number, c: number): number {
  return ((x << c) | (x >>> (32 - c))) >>> 0;
}
