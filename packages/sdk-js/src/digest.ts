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
