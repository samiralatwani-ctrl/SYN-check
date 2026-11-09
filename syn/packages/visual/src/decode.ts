import jpeg from 'jpeg-js';
import UPNG from 'upng-js';
import type { Pixels } from './vector';

/** Decodes JPEG or PNG bytes to RGBA (server / tooling only). Rejects oversized images instead of guessing. */
export function decodeImage(bytes: Uint8Array, maxPixels = 4_000_000): Pixels {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: maxPixels / 1e6, maxMemoryUsageInMB: 256 });
    return { width: img.width, height: img.height, rgba: img.data };
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const img = UPNG.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    if (img.width * img.height > maxPixels) throw new Error('image too large');
    return { width: img.width, height: img.height, rgba: new Uint8Array(UPNG.toRGBA8(img)[0]) };
  }
  throw new Error('unsupported image format');
}
