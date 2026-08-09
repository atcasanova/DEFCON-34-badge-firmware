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
  assert.strictEqual(decoded.crc, encoded.crc);
});

test("a changed QR record fails validation", () => {
  const encoded = encodeLightQr(SETTINGS);
  const replacement = encoded.uri.endsWith("0") ? "1" : "0";
  assert.throws(() => decodeLightQr(encoded.uri.slice(0, -1) + replacement));
});

if (failures > 0) process.exit(1);
