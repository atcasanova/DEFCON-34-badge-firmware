# DC34 BadgeBloom: Premium AI SLOP

Design DEF CON 34 badge light patterns and monochrome wallpapers in a browser, then fire them into the badge through its rear camera because apparently USB cables were not sufficiently dramatic.

**Live AI SLOP:** https://atcasanova.github.io/DEFCON-34-badge-firmware/

Let us establish provenance immediately: this entire project is **AI SLOP**. The web app is AI SLOP. The JavaScript QR protocol is AI SLOP. The Rust firmware patch is artisanal, small-batch, locally sourced AI SLOP. Even this README is free-range AI SLOP.

I made this while drinking at a bar in Las Vegas, without access to a computer. I am sincerely hoping the AI can make all of this work. This is either the future of software engineering or a compelling argument for keeping the factory firmware.

> [!CAUTION]
> The jokes stop here for a moment. Installing custom firmware is a one-way transition into developer mode. According to the official badge documentation, this erases the provisioned light-exchange secret and disables official encrypted badge-to-badge light exchange. There is no undo button for that secret. Review the patch, build it yourself, and flash only if you accept that consequence.

## What this particular pile of slop does

- Edits the native 9-byte `Haploid` LED phenotype
- Controls hue range, saturation, waves, speed, direction, hue drift, white chaser, and contrast
- Previews the real eight-LED diamond layout: four corners and four side midpoints
- Imports local PNG, JPEG, and WebP files without sending them anywhere
- Crops or fits images to 128×128, then applies thresholding or Floyd–Steinberg dithering
- Packs wallpapers exactly like the official DC34 image uploader
- Transfers a wallpaper through a slow, duplicate-safe eight-frame QR carousel
- Validates light data with CRC-16 and wallpaper frames/images with CRC-32
- Previews both light patterns and wallpapers before **Keep / Revert**
- Stores accepted settings in PDDB and restores them after boot
- Contains no backend, analytics, cookies, accounts, cloud image upload, or adult supervision

## The three-button constitution

In developer idle mode:

| Button | Highly sophisticated operation |
|---|---|
| Left | Open the camera and scan BadgeBloom light or wallpaper QR codes |
| Middle | Display the saved wallpaper full-screen |
| Right | Display a QR linking back to this repository, completing the circle of slop |

Any button exits the wallpaper or repository display. Factory tests, menus, confirmation controls, update mode, and recovery behavior retain their normal mappings.

## Light patterns: one QR, nine glorious bytes

The app maps friendly controls to the badge console's native 9-byte phenotype. The record is wrapped as:

```text
dc34light://<Base45 record>
```

The firmware checks the magic, version, flags, exact length, canonical field ranges, and CRC-16/CCITT-FALSE. It then uses the console's existing `Force` opcode so the browser phenotype is displayed exactly instead of being altered by genetic dominance rules.

```text
gene:   03 A0 FF DC F5 00 80 FF FF
record: 44 43 33 34 01 00 03 A0 FF DC F5 00 80 FF FF BA AF
uri:    dc34light://FS8DL6V50SK0PFWZ/U%DG EW+3
```

## Wallpapers: eight QRs, zero cinema

A 128×128 one-bit wallpaper is 2,048 bytes. Stuffing that into one QR produces a version-39 optical brick that the badge camera would be expected to read while everyone nearby is moving and yelling. That seemed rude.

BadgeBloom therefore creates eight QR frames containing 256 bytes each:

```text
dc34image://<Base45 frame record>
```

Every frame includes `D34I` magic, protocol version, reserved flags, a whole-image CRC-32 transfer ID, frame index/count, payload length, payload, and its own CRC-32. The all-zero bitmap has transfer ID `F1E8BA9E`; its first frame CRC is `FF566FB0`.

The carousel defaults to one completely stationary frame every 2.5 seconds—not video FPS. The badge:

1. Accepts frames in any order.
2. Ignores duplicates.
3. Shows received-frame progress.
4. Reopens the camera until all eight frames arrive or the user cancels.
5. Validates the complete image before showing a preview.
6. Writes to PDDB only after **Keep**.

If the camera misses something, leave it aimed at the carousel for another lap. Manual Previous/Next controls are included for artisanal frame delivery.

### Image guardrails, because even slop needs a bowl

- Accepted formats: PNG, JPEG, and WebP
- Rejected: SVG, animation formats, HEIC, and unknown MIME types
- Maximum file size: 5 MiB
- Maximum decoded dimensions: 4096×4096 and 16 megapixels
- Transparent pixels are composited onto white
- Output is always 128×128, one bit per pixel, exactly 2,048 bytes
- Conversion and QR generation happen entirely in the browser

## Using it

1. Open the [live editor](https://atcasanova.github.io/DEFCON-34-badge-firmware/).
2. Create a light pattern or select a wallpaper image.
3. Press the badge's left button.
4. Scan the single light QR, or start the slow wallpaper carousel and keep the camera aimed at it.
5. Inspect the physical result and choose **Keep** or **Revert**.

The QR formats are intentionally unauthenticated. Their checksums detect corruption, not hostile input. Scan only data you intend to preview. Las Vegas already contains enough untrusted input.

## Developing the web-flavored AI SLOP

Node.js 22 or newer is required:

```bash
npm ci
npm test
npm run dev
```

Build the production bundle with:

```bash
npm run build
```

The build also synchronizes the compiled bundle to the repository root so both GitHub Pages publishing modes serve the same files. Tests cover Base45, CRC-16, CRC-32, light records, wallpaper records, corruption rejection, out-of-order assembly, duplicates, and the official wallpaper bit/word ordering.

## Building the firmware-flavored AI SLOP

The `v1.1.0` release includes `dc34-badgebloom-firmware.patch`, produced and apply-checked against official vault commit [`7954e620`](https://github.com/bunnie/dc34-vault/commit/7954e6200df67580795b12602e1a7235ed434ca6).

```bash
git clone https://github.com/bunnie/dc34-vault.git
cd dc34-vault
git checkout 7954e6200df67580795b12602e1a7235ed434ca6
git apply ../dc34-badgebloom-firmware.patch
```

Use the official sibling layout:

```text
workspace/
├── dc34-api/
├── dc34-console/
├── dc34-vault/
└── xous-core/
```

Build with the official Xous toolkit. Flashing requires `loader.uf2`, `xous.uf2`, and `swap.uf2`. No prebuilt UF2 is provided by this project: the browser implementation and protocol tests can be automated here, but camera timing and final firmware behavior deserve validation on actual hardware before anyone pretends this is aerospace.

## Flashing, or: the irreversible part

1. Hold any badge button while pressing reset or power cycling.
2. Confirm the screen says **Update mode** and connect USB.
3. Copy `loader.uf2`, `xous.uf2`, and `swap.uf2` to the mass-storage device.
4. On Linux, unmount it or run `sync`.
5. Press any badge button to commit the files.

Forgetting `sync` or the final button press can leave the update incomplete. If it aborts, enter Update mode and try again after reconsidering the life choices that led here.

## Serious acknowledgements hiding below the jokes

This is an independent community project, not affiliated with or endorsed by DEF CON, Baochip, or the upstream badge authors. It stands on substantial real engineering from the [official DC34 badge guide](https://defcon.org/34b/), [vault firmware](https://github.com/bunnie/dc34-vault), [LED console](https://github.com/bunnie/dc34-console), [shared badge API](https://github.com/bunnie/dc34-api), and [official image uploader](https://github.com/bunnie/dc34-image).

Their work is engineering. This repository is **AI SLOP**, assembled in spirit from a Las Vegas bar stool.

Released under the [MIT License](./LICENSE).
