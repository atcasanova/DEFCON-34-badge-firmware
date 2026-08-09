export const URI_PREFIX = "dc34light://";
export const BASE45_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
export const FIELD_NAMES = [
  "wave count",
  "pulse rate",
  "pulse direction",
  "saturation",
  "hue rate/direction",
  "hue start",
  "hue end",
  "white chaser",
  "deep contrast",
];

const MAGIC = [0x44, 0x43, 0x33, 0x34];
const VERSION = 1;
const FLAGS = 0;

export function crc16CcittFalse(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

export function encodeBase45(bytes) {
  let output = "";
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      let value = bytes[i] * 256 + bytes[i + 1];
      output += BASE45_CHARSET[value % 45];
      value = Math.floor(value / 45);
      output += BASE45_CHARSET[value % 45];
      output += BASE45_CHARSET[Math.floor(value / 45)];
    } else {
      const value = bytes[i];
      output += BASE45_CHARSET[value % 45];
      output += BASE45_CHARSET[Math.floor(value / 45)];
    }
  }
  return output;
}

export function decodeBase45(encoded) {
  if (encoded.length % 3 === 1) throw new Error("Invalid Base45 length");
  const bytes = [];
  for (let i = 0; i < encoded.length; ) {
    const remaining = encoded.length - i;
    const count = remaining >= 3 ? 3 : 2;
    const a = BASE45_CHARSET.indexOf(encoded[i]);
    const b = BASE45_CHARSET.indexOf(encoded[i + 1]);
    const c = count === 3 ? BASE45_CHARSET.indexOf(encoded[i + 2]) : 0;
    if (a < 0 || b < 0 || c < 0) throw new Error("Invalid Base45 character");
    const value = a + b * 45 + c * 45 * 45;
    if ((count === 3 && value > 0xffff) || (count === 2 && value > 0xff)) {
      throw new Error("Invalid Base45 value");
    }
    if (count === 3) bytes.push(value >> 8);
    bytes.push(value & 0xff);
    i += count;
  }
  return Uint8Array.from(bytes);
}

export function hexToHue(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 0xff) / 255;
  const g = ((value >> 8) & 0xff) / 255;
  const b = (value & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return Math.round((((hue * 60) + 360) % 360) * 255 / 360);
}

export function patternBytes(settings) {
  const hueA = hexToHue(settings.colorStart);
  const hueB = hexToHue(settings.colorEnd);
  const bytes = Uint8Array.of(
    Number(settings.waves),
    255 - Number(settings.speed),
    settings.pulseReverse ? 255 : 0,
    Number(settings.saturation),
    (settings.hueReverse ? 0xf0 : 0) | Number(settings.hueRate),
    Math.min(hueA, hueB),
    Math.max(hueA, hueB),
    settings.chaser ? 0 : 255,
    settings.gamma ? 255 : 0,
  );
  validatePattern(bytes);
  return bytes;
}

export function validatePattern(bytes) {
  if (bytes.length !== 9) throw new Error("A light phenotype must contain 9 bytes");
  const hueDirection = bytes[4] >> 4;
  if (
    bytes[0] > 6 ||
    bytes[5] > bytes[6] ||
    (hueDirection !== 0 && hueDirection !== 15) ||
    (bytes[7] !== 0 && bytes[7] !== 255) ||
    (bytes[8] !== 0 && bytes[8] !== 255)
  ) {
    throw new Error("Pattern fields are outside the firmware's canonical range");
  }
}

export function encodeLightQr(settings) {
  const gene = patternBytes(settings);
  const body = Uint8Array.from([...MAGIC, VERSION, FLAGS, ...gene]);
  const crc = crc16CcittFalse(body);
  const record = Uint8Array.from([...body, crc >> 8, crc & 0xff]);
  return {
    uri: URI_PREFIX + encodeBase45(record),
    record,
    gene,
    crc,
  };
}

export function decodeLightQr(uri) {
  if (!uri.startsWith(URI_PREFIX)) throw new Error("Not a DC34 Light Studio URI");
  const record = decodeBase45(uri.slice(URI_PREFIX.length));
  if (record.length !== 17) throw new Error("Invalid record length");
  if (!MAGIC.every((byte, index) => record[index] === byte)) throw new Error("Invalid magic");
  if (record[4] !== VERSION) throw new Error("Unsupported version");
  if (record[5] !== FLAGS) throw new Error("Unsupported flags");
  const expected = (record[15] << 8) | record[16];
  if (crc16CcittFalse(record.slice(0, 15)) !== expected) throw new Error("Checksum mismatch");
  const gene = record.slice(6, 15);
  validatePattern(gene);
  return { version: record[4], flags: record[5], gene, crc: expected, record };
}

export function hsvToCss(hueByte, saturationByte, valueByte) {
  const h = hueByte * 360 / 255;
  const s = saturationByte * 100 / 255;
  const v = valueByte / 255;
  const c = v * (s / 100);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return `rgb(${rgb.map((part) => Math.round((part + m) * 255)).join(" ")})`;
}
