import QRCode from "qrcode";
import "./styles.css";
import { EYE_BEHAVIORS, encodeLightQr, FIELD_NAMES, hexToRgb, hsvToCss } from "./protocol.js";

const form = document.querySelector("#patternForm");
const controls = {
  colorStart: document.querySelector("#colorStart"),
  colorEnd: document.querySelector("#colorEnd"),
  saturation: document.querySelector("#saturation"),
  waves: document.querySelector("#waves"),
  speed: document.querySelector("#speed"),
  hueRate: document.querySelector("#hueRate"),
  pulseReverse: document.querySelector("#pulseReverse"),
  hueReverse: document.querySelector("#hueReverse"),
  chaser: document.querySelector("#chaser"),
  gamma: document.querySelector("#gamma"),
  eyeBehavior: document.querySelector("#eyeBehavior"),
  eyeLeft: document.querySelector("#eyeLeft"),
  eyeRight: document.querySelector("#eyeRight"),
  eyeInterval: document.querySelector("#eyeInterval"),
  eyeBrightness: document.querySelector("#eyeBrightness"),
};
const qrCanvas = document.querySelector("#qrCanvas");
const payloadText = document.querySelector("#payloadText");
const byteReadout = document.querySelector("#byteReadout");
const status = document.querySelector("#transferStatus");
const ledRing = document.querySelector("#ledRing");
const eyeLeds = [document.querySelector("#leftEyeLed"), document.querySelector("#rightEyeLed")];
const rgbTriplets = [...document.querySelectorAll("[data-color-target]")];
let currentEncoding;
let qrRevision = 0;

for (let index = 0; index < 8; index += 1) {
  const led = document.createElement("span");
  led.className = "led";
  led.style.setProperty("--i", index);
  ledRing.append(led);
}
const leds = [...document.querySelectorAll(".led")];

const presets = {
  tide: {
    colorStart: "#33ff99", colorEnd: "#5267ff", saturation: 230,
    waves: 3, speed: 150, hueRate: 5, pulseReverse: false,
    hueReverse: true, chaser: false, gamma: true, eyeBehavior: "blink",
    eyeLeft: "#33ff99", eyeRight: "#5267ff", eyeInterval: 1500, eyeBrightness: 220,
  },
  ember: {
    colorStart: "#ff2600", colorEnd: "#ffb000", saturation: 255,
    waves: 2, speed: 210, hueRate: 2, pulseReverse: true,
    hueReverse: false, chaser: true, gamma: true, eyeBehavior: "wink",
    eyeLeft: "#ff2600", eyeRight: "#ffb000", eyeInterval: 900, eyeBrightness: 255,
  },
  violet: {
    colorStart: "#5424ff", colorEnd: "#ff42cf", saturation: 245,
    waves: 5, speed: 105, hueRate: 8, pulseReverse: false,
    hueReverse: false, chaser: false, gamma: false, eyeBehavior: "breathe",
    eyeLeft: "#9f5cff", eyeRight: "#ff42cf", eyeInterval: 2200, eyeBrightness: 230,
  },
};

function readSettings() {
  return Object.fromEntries(Object.entries(controls).map(([name, input]) => [
    name,
    input.type === "checkbox" ? input.checked : input.value,
  ]));
}

function applySettings(settings) {
  for (const [name, value] of Object.entries(settings)) {
    const input = controls[name];
    if (!input) continue;
    if (input.type === "checkbox") input.checked = value;
    else input.value = value;
  }
  syncAllRgbTriplets();
  update();
}

function byteToHex(value) {
  return Math.max(0, Math.min(255, Number(value) || 0)).toString(16).padStart(2, "0");
}

function syncRgbTripletFromColor(triplet) {
  const target = document.querySelector(`#${triplet.dataset.colorTarget}`);
  const rgb = hexToRgb(target.value);
  triplet.querySelectorAll("input").forEach((input, index) => {
    input.value = rgb[index];
  });
}

function syncColorFromRgbTriplet(triplet) {
  const target = document.querySelector(`#${triplet.dataset.colorTarget}`);
  const channels = [...triplet.querySelectorAll("input")].map((input) => {
    const value = Math.max(0, Math.min(255, Number(input.value) || 0));
    input.value = value;
    return value;
  });
  target.value = `#${channels.map(byteToHex).join("")}`;
}

function syncAllRgbTriplets() {
  rgbTriplets.forEach(syncRgbTripletFromColor);
}

function updateOutputs() {
  document.querySelector('output[for="saturation"]').value = controls.saturation.value;
  document.querySelector('output[for="waves"]').value = controls.waves.value;
  document.querySelector('output[for="speed"]').value = controls.speed.value;
  document.querySelector('output[for="hueRate"]').value = controls.hueRate.value;
  document.querySelector('output[for="eyeInterval"]').value =
    `${(Number(controls.eyeInterval.value) / 1000).toFixed(1)}s`;
  document.querySelector('output[for="eyeBrightness"]').value = controls.eyeBrightness.value;
}

async function updateQr() {
  const revision = ++qrRevision;
  try {
    currentEncoding = encodeLightQr(readSettings());
    payloadText.textContent = currentEncoding.uri;
    byteReadout.replaceChildren();
    currentEncoding.payload.forEach((value, index) => {
      const term = document.createElement("dt");
      term.textContent = FIELD_NAMES[index];
      const detail = document.createElement("dd");
      detail.textContent = `${value} / 0x${value.toString(16).padStart(2, "0").toUpperCase()}`;
      byteReadout.append(term, detail);
    });
    await QRCode.toCanvas(qrCanvas, currentEncoding.uri, {
      errorCorrectionLevel: "M",
      margin: 4,
      width: 360,
      color: { dark: "#000000ff", light: "#ffffffff" },
    });
    if (revision === qrRevision) status.textContent = "QR is ready.";
  } catch (error) {
    status.textContent = error.message;
  }
}

function update() {
  updateOutputs();
  updateQr();
}

function triangle(value) {
  const wrapped = ((value % 512) + 512) % 512;
  return wrapped <= 255 ? wrapped : 511 - wrapped;
}

function animate(timeMs) {
  const gene = currentEncoding?.gene;
  const ringColors = [];
  if (gene) {
    const [periods, rateByte, direction, saturation, huePacked, hueStart, hueEnd, chaser, gamma] = gene;
    const tau = 60 + rateByte * (700 - 60) / 255;
    const loop = Math.floor(timeMs / 35) & 0x1ff;
    const hueRate = huePacked & 0x0f;
    const hueDirection = (huePacked >> 4) > 10 ? -1 : 1;

    leds.forEach((led, index) => {
      const huePhase = triangle(32 * index + hueDirection * loop * hueRate);
      const hue = hueStart + (hueEnd - hueStart) * huePhase / 255;
      const space = Math.PI * 2 * periods * index / 7;
      const travel = Math.PI * 2 * timeMs / (tau * 10) * (direction > 128 ? 1 : -1);
      let value = 127 * (1 + Math.cos(space + travel));
      if (gamma > 127) value = value * value / 255;
      const isChaser = chaser < 88 && Math.floor(loop / 2) % 8 === index;
      const color = isChaser ? "rgb(220 220 220)" : hsvToCss(hue, saturation, value);
      ringColors[index] = color;
      const glow = Math.max(5, value / 7);
      led.style.background = color;
      led.style.boxShadow = `0 0 ${glow}px ${color}`;
    });
    animateEyes(timeMs, ringColors);
  }
  requestAnimationFrame(animate);
}

function scaledRgb(color, intensity) {
  const [r, g, b] = hexToRgb(color);
  const scale = Math.max(0, Math.min(255, intensity)) / 255;
  return `rgb(${Math.round(r * scale)} ${Math.round(g * scale)} ${Math.round(b * scale)})`;
}

function setEye(eye, color, intensity) {
  const rendered = intensity <= 0 ? "rgb(0 0 0)" : scaledRgb(color, intensity);
  eye.style.background = rendered;
  eye.style.boxShadow = intensity <= 0 ? "none" : `0 0 ${5 + intensity / 8}px ${rendered}`;
  eye.style.transform = `scaleY(${intensity <= 0 ? 0.12 : 1})`;
}

function animateEyes(timeMs, ringColors) {
  const behavior = EYE_BEHAVIORS[controls.eyeBehavior.value];
  const brightness = Number(controls.eyeBrightness.value);
  const period = Number(controls.eyeInterval.value);
  const phase = timeMs % period;
  let leftIntensity = brightness;
  let rightIntensity = brightness;

  if (behavior === EYE_BEHAVIORS.follow) {
    eyeLeds[0].style.background = ringColors[0] ?? "transparent";
    eyeLeds[1].style.background = ringColors[4] ?? "transparent";
    eyeLeds.forEach((eye, index) => {
      eye.style.boxShadow = `0 0 18px ${ringColors[index * 4] ?? "transparent"}`;
      eye.style.transform = "scaleY(1)";
    });
    return;
  }
  if (behavior === EYE_BEHAVIORS.off) {
    leftIntensity = 0;
    rightIntensity = 0;
  } else if (behavior === EYE_BEHAVIORS.blink && phase < 140) {
    leftIntensity = 0;
    rightIntensity = 0;
  } else if (behavior === EYE_BEHAVIORS.wink) {
    const half = period / 2;
    if (phase < 140) leftIntensity = 0;
    if (phase >= half && phase < half + 140) rightIntensity = 0;
  } else if (behavior === EYE_BEHAVIORS.breathe) {
    const wave = 1 - Math.abs(2 * phase / period - 1);
    leftIntensity = Math.max(10, brightness * wave);
    rightIntensity = Math.max(10, brightness * wave);
  }

  setEye(eyeLeds[0], controls.eyeLeft.value, leftIntensity);
  setEye(eyeLeds[1], controls.eyeRight.value, rightIntensity);
}

form.addEventListener("input", (event) => {
  if (event.target.matches('input[type="color"]')) {
    const triplet = rgbTriplets.find((item) => item.dataset.colorTarget === event.target.id);
    if (triplet) syncRgbTripletFromColor(triplet);
  } else if (event.target.closest("[data-color-target]")) {
    syncColorFromRgbTriplet(event.target.closest("[data-color-target]"));
  }
  update();
});
document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => applySettings(presets[button.dataset.preset]));
});
document.querySelector("#randomize").addEventListener("click", () => {
  const randomHue = () => `hsl(${Math.floor(Math.random() * 360)} 100% 55%)`;
  const toHex = (css) => {
    const canvas = document.createElement("canvas").getContext("2d");
    canvas.fillStyle = css;
    return canvas.fillStyle;
  };
  applySettings({
    colorStart: toHex(randomHue()),
    colorEnd: toHex(randomHue()),
    saturation: 160 + Math.floor(Math.random() * 96),
    waves: Math.floor(Math.random() * 7),
    speed: Math.floor(Math.random() * 256),
    hueRate: Math.floor(Math.random() * 16),
    pulseReverse: Math.random() > 0.5,
    hueReverse: Math.random() > 0.5,
    chaser: Math.random() > 0.75,
    gamma: Math.random() > 0.35,
    eyeBehavior: ["steady", "blink", "wink", "breathe"][Math.floor(Math.random() * 4)],
    eyeLeft: toHex(randomHue()),
    eyeRight: toHex(randomHue()),
    eyeInterval: 500 + Math.floor(Math.random() * 36) * 100,
    eyeBrightness: 120 + Math.floor(Math.random() * 136),
  });
});

document.querySelector("#copyPayload").addEventListener("click", async () => {
  await navigator.clipboard.writeText(currentEncoding.uri);
  status.textContent = "Payload copied.";
});
document.querySelector("#downloadQr").addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "dc34-badgebloom-pattern.png";
  link.href = qrCanvas.toDataURL("image/png");
  link.click();
  status.textContent = "QR downloaded.";
});
syncAllRgbTriplets();
update();
requestAnimationFrame(animate);
