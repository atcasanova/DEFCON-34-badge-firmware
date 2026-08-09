import assert from "assert";
import {
  crc16CcittFalse,
  decodeBase45,
  decodeLightQr,
  encodeBase45,
  encodeLightQr,
} from "../src/protocol.js";
import {
  IMAGE_BYTES,
  IMAGE_FRAME_COUNT,
  assembleImageFrames,
  crc32,
  decodeImageFrame,
  ditherGrayscale,
  encodeImageFrames,
  packMonochromeBitmap,
} from "../src/image-protocol.js";

const SETTINGS = {
  colorStart: "#ff0000",
  colorEnd: "#00ffff",
  saturation: 220,
  waves: 3,
  speed: 95,
  hueRate: 5,
  pulseReverse: true,
  hueReverse: true,
  chaser: false,
  gamma: true,
  eyeBehavior: "wink",
  eyeLeft: "#123456",
  eyeRight: "#abcdef",
  eyeInterval: 1500,
  eyeBrightness: 210,
};

let failures = 0;
function test(name, run) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

test("Base45 round-trips binary values", () => {
  const input = Uint8Array.of(0, 1, 44, 45, 127, 128, 254, 255);
  assert.deepStrictEqual([...decodeBase45(encodeBase45(input))], [...input]);
});

test("CRC-16/CCITT-FALSE matches the standard check value", () => {
  const check = Uint8Array.from("123456789", (character) => character.charCodeAt(0));
  assert.strictEqual(crc16CcittFalse(check), 0x29b1);
});

test("a generated URI decodes to its original native gene", () => {
  const encoded = encodeLightQr(SETTINGS);
  const decoded = decodeLightQr(encoded.uri);
  assert.deepStrictEqual([...decoded.gene], [...encoded.gene]);
  assert.deepStrictEqual([...decoded.eyes], [4, 0x12, 0x34, 0x56, 0xab, 0xcd, 0xef, 60, 210]);
  assert.strictEqual(decoded.version, 2);
  assert.strictEqual(decoded.crc, encoded.crc);
});

test("legacy v1 light QRs remain compatible and use stock eye behavior", () => {
  const decoded = decodeLightQr("dc34light://FS8DL6V50SK0PFWZ/U%DG EW+3");
  assert.strictEqual(decoded.version, 1);
  assert.deepStrictEqual([...decoded.gene], [3, 160, 255, 220, 245, 0, 128, 255, 255]);
  assert.deepStrictEqual([...decoded.eyes], [0, 255, 255, 255, 255, 255, 255, 60, 255]);
});

test("a changed QR record fails validation", () => {
  const encoded = encodeLightQr(SETTINGS);
  const replacement = encoded.uri.endsWith("0") ? "1" : "0";
  assert.throws(() => decodeLightQr(encoded.uri.slice(0, -1) + replacement));
});

test("CRC-32 matches the standard check value", () => {
  const check = Uint8Array.from("123456789", (character) => character.charCodeAt(0));
  assert.strictEqual(crc32(check), 0xcbf43926);
});

test("wallpaper frames round-trip in any order", () => {
  const bitmap = Uint8Array.from({ length: IMAGE_BYTES }, (_, index) => (index * 73 + 19) & 0xff);
  const frames = encodeImageFrames(bitmap);
  assert.strictEqual(frames.length, IMAGE_FRAME_COUNT);
  frames.forEach((frame, index) => {
    const decoded = decodeImageFrame(frame.uri);
    assert.strictEqual(decoded.index, index);
    assert.strictEqual(decoded.count, IMAGE_FRAME_COUNT);
    assert.strictEqual(decoded.transferId, frames[0].transferId);
  });
  const reversed = frames.map((frame) => frame.uri).reverse();
  assert.deepStrictEqual([...assembleImageFrames(reversed)], [...bitmap]);
});

test("a changed wallpaper frame fails validation", () => {
  const bitmap = new Uint8Array(IMAGE_BYTES);
  const frame = encodeImageFrames(bitmap)[0];
  const replacement = frame.uri.endsWith("0") ? "1" : "0";
  assert.throws(() => decodeImageFrame(frame.uri.slice(0, -1) + replacement));
});

test("bitmap packing matches the official horizontal and word ordering", () => {
  const leftPixel = new Uint8Array(128 * 128);
  leftPixel[0] = 1;
  const leftPacked = packMonochromeBitmap(leftPixel);
  assert.deepStrictEqual([...leftPacked.slice(0, 4)], [0, 0, 0, 1]);

  const rightPixel = new Uint8Array(128 * 128);
  rightPixel[127] = 1;
  const rightPacked = packMonochromeBitmap(rightPixel);
  assert.deepStrictEqual([...rightPacked.slice(12, 16)], [0x80, 0, 0, 0]);
});

test("threshold conversion produces canonical black pixels", () => {
  const grayscale = new Uint8Array(128 * 128).fill(255);
  grayscale[0] = 0;
  const pixels = ditherGrayscale(grayscale, { algorithm: "threshold", threshold: 128 });
  assert.strictEqual(pixels[0], 1);
  assert.strictEqual(pixels[1], 0);
});

if (failures > 0) process.exit(1);
