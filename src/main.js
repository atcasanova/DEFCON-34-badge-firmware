import QRCode from "qrcode";
import "./styles.css";
import { encodeLightQr, FIELD_NAMES, hsvToCss } from "./protocol.js";

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
};
const qrCanvas = document.querySelector("#qrCanvas");
const payloadText = document.querySelector("#payloadText");
const byteReadout = document.querySelector("#byteReadout");
const status = document.querySelector("#transferStatus");
const ledRing = document.querySelector("#ledRing");
const eyes = [...document.querySelectorAll(".eye")];
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
    hueReverse: true, chaser: false, gamma: true,
  },
  ember: {
    colorStart: "#ff2600", colorEnd: "#ffb000", saturation: 255,
    waves: 2, speed: 210, hueRate: 2, pulseReverse: true,
    hueReverse: false, chaser: true, gamma: true,
  },
  violet: {
    colorStart: "#5424ff", colorEnd: "#ff42cf", saturation: 245,
    waves: 5, speed: 105, hueRate: 8, pulseReverse: false,
    hueReverse: false, chaser: false, gamma: false,
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
  update();
}

function updateOutputs() {
  document.querySelector('output[for="saturation"]').value = controls.saturation.value;
  document.querySelector('output[for="waves"]').value = controls.waves.value;
  document.querySelector('output[for="speed"]').value = controls.speed.value;
  document.querySelector('output[for="hueRate"]').value = controls.hueRate.value;
}

async function updateQr() {
  const revision = ++qrRevision;
  try {
    currentEncoding = encodeLightQr(readSettings());
    payloadText.textContent = currentEncoding.uri;
    byteReadout.replaceChildren();
    currentEncoding.gene.forEach((value, index) => {
      const term = document.createElement("dt");
      term.textContent = FIELD_NAMES[index];
      const detail = document.createElement("dd");
      detail.textContent = `${value} / 0x${value.toString(16).padStart(2, "0").toUpperCase()}`;
      byteReadout.append(term, detail);
    });
    await QRCode.toCanvas(qrCanvas, currentEncoding.uri, {
      errorCorrectionLevel: "M",
      margin: 3,
      width: 280,
      color: { dark: "#10130fff", light: "#f3f1e8ff" },
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
  if (gene) {
    const [periods, rateByte, direction, saturation, huePacked, hueStart, hueEnd, chaser, gamma] = gene;
    const tau = 60 + rateByte * (700 - 60) / 255;
    const loop = Math.floor(timeMs / 35) & 0x1ff;
    const hueRate = huePacked & 0x0f;
    const hueDirection = (huePacked >> 4) > 10 ? -1 : 1;
    const values = [];

    leds.forEach((led, index) => {
      const huePhase = triangle(32 * index + hueDirection * loop * hueRate);
      const hue = hueStart + (hueEnd - hueStart) * huePhase / 255;
      const space = Math.PI * 2 * periods * index / 7;
      const travel = Math.PI * 2 * timeMs / (tau * 10) * (direction > 128 ? 1 : -1);
      let value = 127 * (1 + Math.cos(space + travel));
      if (gamma > 127) value = value * value / 255;
      const isChaser = chaser < 88 && Math.floor(loop / 2) % 8 === index;
      const color = isChaser ? "rgb(220 220 220)" : hsvToCss(hue, saturation, value);
      const glow = Math.max(5, value / 7);
      led.style.background = color;
      led.style.boxShadow = `0 0 ${glow}px ${color}`;
      values.push({ color, glow });
    });

    [0, 4].forEach((source, index) => {
      eyes[index].style.background = values[source].color;
      eyes[index].style.boxShadow = `0 0 ${values[source].glow}px ${values[source].color}`;
    });
  }
  requestAnimationFrame(animate);
}

form.addEventListener("input", update);
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

update();
requestAnimationFrame(animate);
