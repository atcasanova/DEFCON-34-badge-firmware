# DC34 BadgeBloom

Design a native DEF CON 34 badge light phenotype in the browser, turn it into a compact QR code, and apply it through the badge's rear camera.

**Live app:** https://atcasanova.github.io/DEFCON-34-badge-firmware/

BadgeBloom is unofficial, completely client-side, and built for the open DC34 badge platform. Nothing is uploaded: the editor, animation preview, Base45 encoder, CRC implementation, and QR renderer all run locally in your browser.

> [!CAUTION]
> Installing custom firmware is a one-way transition into developer mode. Per the official badge documentation, it erases the provisioned light-exchange secret and disables the official encrypted badge-to-badge light exchange. The source patch is attached to the GitHub release; review and build it before flashing.

## Features

- Two-color native hue-range editor
- Saturation, wave count, pulse speed, and direction controls
- Independent hue drift speed and direction
- Native white-chaser and nonlinear contrast toggles
- Animated approximation of all 8 body LEDs and 2 eyes
- Presets, randomizer, QR download, and payload inspection
- Versioned 17-byte record with strict field validation and CRC-16/CCITT-FALSE
- No backend, account, analytics, cookies, or network requests at runtime

## How it works

The app maps friendly controls directly to the badge console's 9-byte `Haploid` phenotype. It prefixes the record with `DC34`, a protocol version, and reserved flags; appends a big-endian CRC-16; Base45-encodes the result; and wraps it as:

```text
dc34light://<Base45 record>
```

The companion firmware recognizes that scheme in the existing camera pipeline, validates the record, and sends the phenotype through the console's existing `Force` opcode. This bypasses genetic dominance rules, so the previewed phenotype is applied exactly. The stock **Keep / Revert** menu remains the confirmation boundary, and **Keep** persists the pattern in PDDB.

The QR is intentionally unauthenticated. CRC detects scan corruption, not malicious input. Only scan patterns you intend to preview, and use **Revert** when something looks wrong.

## Use

1. Open the [live editor](https://atcasanova.github.io/DEFCON-34-badge-firmware/).
2. Design a pattern or choose a preset.
3. On a badge running the companion custom firmware, press the middle button from the idle screen.
4. Point the rear camera at the generated QR.
5. Choose **Keep** to save or **Revert** to restore the previous pattern.

## Develop locally

Requires Node.js 22 or newer.

```bash
npm ci
npm test
npm run dev
```

Create the production bundle with:

```bash
npm run build
```

The test suite verifies Base45 binary round-tripping, the standard CRC check vector, record round-tripping, and corruption rejection.

## Protocol test vector

```text
gene:   03 A0 FF DC F5 00 80 FF FF
record: 44 43 33 34 01 00 03 A0 FF DC F5 00 80 FF FF BA AF
uri:    dc34light://FS8DL6V50SK0PFWZ/U%DG EW+3
```

## Firmware and flashing

The `v1.0.0` release includes `dc34-lightqr-firmware.patch`, based on the official `bunnie/dc34-vault` source. It adds the QR decoder, exact phenotype rendering, PDDB persistence, and boot restoration. The patch was produced and apply-checked against upstream commit [`7954e620`](https://github.com/bunnie/dc34-vault/commit/7954e6200df67580795b12602e1a7235ed434ca6).

Apply the patch from a clean checkout of the official vault source:

```bash
git clone https://github.com/bunnie/dc34-vault.git
cd dc34-vault
git checkout 7954e6200df67580795b12602e1a7235ed434ca6
git apply ../dc34-lightqr-firmware.patch
```

Build it using the official sibling layout (`dc34-api`, `dc34-console`, `dc34-vault`, and `xous-core`) and the official Xous toolkit. Flashing requires `loader.uf2`, `xous.uf2`, and `swap.uf2`; follow the official update procedure and press a badge button after copying to commit the update.

No prebuilt UF2 is included because the firmware could not be compiled in the authoring environment without the Rust/Xous toolchain. The JavaScript application and static release bundle are fully built and tested.

## Project status

This is an independent community project, not affiliated with or endorsed by DEF CON, Baochip, or the upstream badge authors. Hardware behavior is based on the public DC34 source and documentation.

Upstream references: [official DC34 badge guide](https://defcon.org/34b/), [vault firmware](https://github.com/bunnie/dc34-vault), [LED console](https://github.com/bunnie/dc34-console), and [shared badge API](https://github.com/bunnie/dc34-api).

Released under the [MIT License](./LICENSE).
