import { decodeBase45, encodeBase45 } from "./protocol.js";

export const IMAGE_URI_PREFIX = "dc34image://";
export const IMAGE_WIDTH = 128;
export const IMAGE_HEIGHT = 128;
export const IMAGE_BYTES = (IMAGE_WIDTH * IMAGE_HEIGHT) / 8;
export const IMAGE_FRAME_BYTES = 256;
export const IMAGE_FRAME_COUNT = IMAGE_BYTES / IMAGE_FRAME_BYTES;

const MAGIC = Uint8Array.of(0x44, 0x33, 0x34, 0x49); // D34I
const VERSION = 1;
const FLAGS = 0;
const HEADER_BYTES = 14;
const FRAME_CRC_BYTES = 4;

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU32(bytes, offset, value) {
  bytes[offset] = value >>> 24;
  bytes[offset + 1] = value >>> 16;
  bytes[offset + 2] = value >>> 8;
  bytes[offset + 3] = value;
}

function readU32(bytes, offset) {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  ) >>> 0;
}

export function ditherGrayscale(grayscale, options = {}) {
  if (grayscale.length !== IMAGE_WIDTH * IMAGE_HEIGHT) {
    throw new Error("Wallpaper source must contain exactly 128×128 luminance values");
  }
  const threshold = Number(options.threshold ?? 128);
  const algorithm = options.algorithm ?? "floyd-steinberg";
  const invert = Boolean(options.invert);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 255) {
    throw new Error("Wallpaper threshold must be between 0 and 255");
  }
  if (!new Set(["threshold", "floyd-steinberg"]).has(algorithm)) {
    throw new Error("Unsupported dithering algorithm");
  }

  const work = Float32Array.from(grayscale, (value) => invert ? 255 - value : value);
  const blackPixels = new Uint8Array(work.length);
  for (let y = 0; y < IMAGE_HEIGHT; y += 1) {
    const reverse = algorithm === "floyd-steinberg" && y % 2 === 1;
    for (let column = 0; column < IMAGE_WIDTH; column += 1) {
      const x = reverse ? IMAGE_WIDTH - 1 - column : column;
      const index = y * IMAGE_WIDTH + x;
      const oldValue = Math.max(0, Math.min(255, work[index]));
      const quantized = oldValue < threshold ? 0 : 255;
      blackPixels[index] = quantized === 0 ? 1 : 0;
      if (algorithm !== "floyd-steinberg") continue;

      const error = oldValue - quantized;
      const direction = reverse ? -1 : 1;
      const spread = (dx, dy, weight) => {
        const nextX = x + dx * direction;
        const nextY = y + dy;
        if (nextX >= 0 && nextX < IMAGE_WIDTH && nextY < IMAGE_HEIGHT) {
          work[nextY * IMAGE_WIDTH + nextX] += error * weight / 16;
        }
      };
      spread(1, 0, 7);
      spread(-1, 1, 3);
      spread(0, 1, 5);
      spread(1, 1, 1);
    }
  }
  return blackPixels;
}

// Matches the official dc34-image uploader: horizontal flip, black=1, MSB-first
// u32 packing, reverse each group of four words, then serialize words big-endian.
export function packMonochromeBitmap(blackPixels) {
  if (blackPixels.length !== IMAGE_WIDTH * IMAGE_HEIGHT) {
    throw new Error("Wallpaper bitmap must contain exactly 16,384 pixels");
  }
  const words = new Uint32Array(IMAGE_BYTES / 4);
  for (let y = 0; y < IMAGE_HEIGHT; y += 1) {
    for (let x = 0; x < IMAGE_WIDTH; x += 1) {
      if (!blackPixels[y * IMAGE_WIDTH + x]) continue;
      const flippedIndex = y * IMAGE_WIDTH + (IMAGE_WIDTH - 1 - x);
      words[Math.floor(flippedIndex / 32)] |= 1 << (31 - (flippedIndex % 32));
    }
  }

  const output = new Uint8Array(IMAGE_BYTES);
  for (let group = 0; group < words.length; group += 4) {
    for (let offset = 0; offset < 4; offset += 1) {
      writeU32(output, (group + offset) * 4, words[group + 3 - offset]);
    }
  }
  return output;
}

export function encodeImageFrames(bitmapBytes) {
  if (!(bitmapBytes instanceof Uint8Array) || bitmapBytes.length !== IMAGE_BYTES) {
    throw new Error(`Wallpaper payload must be exactly ${IMAGE_BYTES} bytes`);
  }
  const transferId = crc32(bitmapBytes);
  const frames = [];
  for (let index = 0; index < IMAGE_FRAME_COUNT; index += 1) {
    const payload = bitmapBytes.slice(
      index * IMAGE_FRAME_BYTES,
      (index + 1) * IMAGE_FRAME_BYTES,
    );
    const body = new Uint8Array(HEADER_BYTES + payload.length);
    body.set(MAGIC, 0);
    body[4] = VERSION;
    body[5] = FLAGS;
    writeU32(body, 6, transferId);
    body[10] = index;
    body[11] = IMAGE_FRAME_COUNT;
    body[12] = payload.length >>> 8;
    body[13] = payload.length;
    body.set(payload, HEADER_BYTES);

    const checksum = crc32(body);
    const record = new Uint8Array(body.length + FRAME_CRC_BYTES);
    record.set(body);
    writeU32(record, body.length, checksum);
    frames.push({
      index,
      count: IMAGE_FRAME_COUNT,
      transferId,
      checksum,
      payload,
      record,
      uri: IMAGE_URI_PREFIX + encodeBase45(record),
    });
  }
  return frames;
}

export function decodeImageFrame(uri) {
  if (!uri.startsWith(IMAGE_URI_PREFIX)) throw new Error("Not a DC34 wallpaper URI");
  const record = decodeBase45(uri.slice(IMAGE_URI_PREFIX.length));
  if (record.length < HEADER_BYTES + FRAME_CRC_BYTES) throw new Error("Wallpaper frame is truncated");
  if (!MAGIC.every((byte, index) => record[index] === byte)) throw new Error("Invalid wallpaper magic");
  if (record[4] !== VERSION) throw new Error("Unsupported wallpaper protocol version");
  if (record[5] !== FLAGS) throw new Error("Unsupported wallpaper flags");

  const transferId = readU32(record, 6);
  const index = record[10];
  const count = record[11];
  const payloadLength = (record[12] << 8) | record[13];
  if (count !== IMAGE_FRAME_COUNT || index >= count || payloadLength !== IMAGE_FRAME_BYTES) {
    throw new Error("Wallpaper frame dimensions are not canonical");
  }
  if (record.length !== HEADER_BYTES + payloadLength + FRAME_CRC_BYTES) {
    throw new Error("Wallpaper frame has the wrong length");
  }
  const body = record.slice(0, -FRAME_CRC_BYTES);
  const expected = readU32(record, body.length);
  if (crc32(body) !== expected) throw new Error("Wallpaper frame checksum failed");
  return {
    index,
    count,
    transferId,
    checksum: expected,
    payload: record.slice(HEADER_BYTES, body.length),
    record,
  };
}

export function assembleImageFrames(frameUris) {
  const decoded = frameUris.map(decodeImageFrame);
  if (decoded.length !== IMAGE_FRAME_COUNT) throw new Error("A wallpaper transfer requires 8 frames");
  const transferId = decoded[0].transferId;
  const slots = new Array(IMAGE_FRAME_COUNT);
  for (const frame of decoded) {
    if (frame.transferId !== transferId) throw new Error("Wallpaper frames belong to different transfers");
    if (slots[frame.index]) throw new Error("Wallpaper transfer contains a duplicate frame");
    slots[frame.index] = frame.payload;
  }
  if (slots.some((slot) => !slot)) throw new Error("Wallpaper transfer is incomplete");
  const bitmap = new Uint8Array(IMAGE_BYTES);
  slots.forEach((payload, index) => bitmap.set(payload, index * IMAGE_FRAME_BYTES));
  if (crc32(bitmap) !== transferId) throw new Error("Complete wallpaper checksum failed");
  return bitmap;
}
