import assert from "assert";
import {
  crc16CcittFalse,
  decodeBase45,
  decodeLightQr,
  encodeBase45,
  encodeLightQr,
} from "../src/protocol.js";

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
  assert.ok(encoded.uri.startsWith("DC34LIGHT://"));
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

test("the URI prefix is decoded case-insensitively", () => {
  const encoded = encodeLightQr(SETTINGS);
  const lowercase = `dc34light://${encoded.uri.slice("DC34LIGHT://".length)}`;
  assert.deepStrictEqual([...decodeLightQr(lowercase).payload], [...encoded.payload]);
});

test("a changed QR record fails validation", () => {
  const encoded = encodeLightQr(SETTINGS);
  const replacement = encoded.uri.endsWith("0") ? "1" : "0";
  assert.throws(() => decodeLightQr(encoded.uri.slice(0, -1) + replacement));
});

if (failures > 0) process.exit(1);
