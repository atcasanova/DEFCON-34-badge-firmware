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
  "eye behavior",
  "left eye red",
  "left eye green",
  "left eye blue",
  "right eye red",
  "right eye green",
  "right eye blue",
  "eye tempo (25 ms)",
  "eye brightness",
];

export const EYE_BEHAVIORS = Object.freeze({
  follow: 0,
  off: 1,
  steady: 2,
  blink: 3,
  wink: 4,
  breathe: 5,
});

const MAGIC = [0x44, 0x43, 0x33, 0x34];
const LEGACY_VERSION = 1;
const VERSION = 2;
const FLAGS = 0;
const GENE_BYTES = 9;
const EYE_BYTES = 9;
const LEGACY_RECORD_BYTES = 4 + 1 + 1 + GENE_BYTES + 2;
const RECORD_BYTES = LEGACY_RECORD_BYTES + EYE_BYTES;

const DEFAULT_EYES = Uint8Array.of(
  EYE_BEHAVIORS.follow,
  255, 255, 255,
  255, 255, 255,
  60,
  255,
);

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

export function hexToRgb(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error("Eye colors must use six-digit hex values");
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
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
  if (bytes.length !== GENE_BYTES) throw new Error("A light phenotype must contain 9 bytes");
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

export function eyeBytes(settings) {
  const behavior = EYE_BEHAVIORS[settings.eyeBehavior];
  if (behavior === undefined) throw new Error("Choose a supported eye behavior");
  const left = hexToRgb(settings.eyeLeft);
  const right = hexToRgb(settings.eyeRight);
  const intervalMs = Number(settings.eyeInterval);
  const brightness = Number(settings.eyeBrightness);
  if (!Number.isFinite(intervalMs) || intervalMs < 200 || intervalMs > 6000) {
    throw new Error("Eye tempo must be between 0.2 and 6 seconds");
  }
  if (!Number.isInteger(brightness) || brightness < 0 || brightness > 255) {
    throw new Error("Eye brightness must be between 0 and 255");
  }
  const bytes = Uint8Array.of(
    behavior,
    ...left,
    ...right,
    Math.round(intervalMs / 25),
    brightness,
  );
  validateEyes(bytes);
  return bytes;
}

export function validateEyes(bytes) {
  if (bytes.length !== EYE_BYTES) throw new Error("An eye phenotype must contain 9 bytes");
  if (bytes[0] > EYE_BEHAVIORS.breathe || bytes[7] < 8 || bytes[7] > 240) {
    throw new Error("Eye fields are outside the firmware's canonical range");
  }
}

export function encodeLightQr(settings) {
  const gene = patternBytes(settings);
  const eyes = eyeBytes(settings);
  const payload = Uint8Array.from([...gene, ...eyes]);
  const body = Uint8Array.from([...MAGIC, VERSION, FLAGS, ...payload]);
  const crc = crc16CcittFalse(body);
  const record = Uint8Array.from([...body, crc >> 8, crc & 0xff]);
  return {
    uri: URI_PREFIX + encodeBase45(record),
    record,
    gene,
    eyes,
    payload,
    crc,
  };
}

export function decodeLightQr(uri) {
  if (!uri.startsWith(URI_PREFIX)) throw new Error("Not a DC34 Light Studio URI");
  const record = decodeBase45(uri.slice(URI_PREFIX.length));
  if (record.length !== LEGACY_RECORD_BYTES && record.length !== RECORD_BYTES) {
    throw new Error("Invalid record length");
  }
  if (!MAGIC.every((byte, index) => record[index] === byte)) throw new Error("Invalid magic");
  const version = record[4];
  if (version !== LEGACY_VERSION && version !== VERSION) throw new Error("Unsupported version");
  if (
    (version === LEGACY_VERSION && record.length !== LEGACY_RECORD_BYTES) ||
    (version === VERSION && record.length !== RECORD_BYTES)
  ) {
    throw new Error("Invalid record length");
  }
  if (record[5] !== FLAGS) throw new Error("Unsupported flags");
  const checksumOffset = record.length - 2;
  const expected = (record[checksumOffset] << 8) | record[checksumOffset + 1];
  if (crc16CcittFalse(record.slice(0, checksumOffset)) !== expected) throw new Error("Checksum mismatch");
  const gene = record.slice(6, 15);
  const eyes = version === VERSION ? record.slice(15, 24) : DEFAULT_EYES.slice();
  validatePattern(gene);
  validateEyes(eyes);
  return {
    version,
    flags: record[5],
    gene,
    eyes,
    payload: Uint8Array.from([...gene, ...eyes]),
    crc: expected,
    record,
  };
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
