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

## Download the first actually flashable release

Starting with **v1.2.0**, releases contain a complete, developer-signed firmware set instead of making you assemble the Rust cinematic universe yourself:

- `loader.uf2`
- `xous.uf2`
- `swap.uf2`
- `dc34-badgebloom-firmware-v1.2.0.zip` containing all three files, a build manifest, and firmware checksums
- `dc34-badgebloom-firmware.patch` for people who regard prebuilt binaries with healthy suspicion

Download all three UF2 files from the [latest release](https://github.com/atcasanova/DEFCON-34-badge-firmware/releases/latest), or download and extract the firmware ZIP. Keep the three files from the same release together; mixing versions is exciting in the wrong way.

The artifacts are compiled with the public Xous developer key. They were successfully built for the real `riscv32imac-unknown-xous-elf` target and checked as UF2 images for Baochip family `0xA7D76373`. Camera timing and button behavior still deserve validation on physical badge hardware before this AI SLOP is mistaken for avionics.

## Developing and deploying the web-flavored AI SLOP

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

Pushing `main` deploys `dist/` through the GitHub Pages workflow. To deploy it somewhere else, upload the contents of `dist/` to any static host; it needs no server-side code, environment variables, or database.

## Building the firmware-flavored AI SLOP

The reproducible build script clones and pins the exact sources, installs Rust 1.97.1, installs Xous's custom target, applies the BadgeBloom patch, compiles both DC34 applications, packs the operating system, and signs it with the public developer key.

The source set is intentionally pinned:

| Component | Commit |
|---|---|
| `dc34-api` | [`617f0f3`](https://github.com/bunnie/dc34-api/commit/617f0f3dff3cea1e9421d766b19664f5bec9a54b) |
| `dc34-console` | [`bf64e03`](https://github.com/bunnie/dc34-console/commit/bf64e03f019532cca5055fcdbe51977d572e3630) |
| `dc34-vault` | [`7954e62`](https://github.com/bunnie/dc34-vault/commit/7954e6200df67580795b12602e1a7235ed434ca6) |
| `xous-core` | [`5d5bbbfa`](https://github.com/betrusted-io/xous-core/commit/5d5bbbfa95c0dcef26fe1fe9b496b7f6f31d191b) |
| Rust and Xous sysroot | `1.97.1` |

That Xous pin matters. The DC34 Cargo manifests retain an older fallback revision, but the late-July DC34 sources call watchdog, RTC, display, and keystore APIs from the August Xous tree. The official sibling checkout overrides the fallback dependencies; building against the old revision produces a festival of missing-method errors.

### Linux build

On Ubuntu or Debian:

```bash
sudo apt update
sudo apt install -y build-essential curl file git libssl-dev pkg-config zip
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
. "$HOME/.cargo/env"

git clone https://github.com/atcasanova/DEFCON-34-badge-firmware.git
cd DEFCON-34-badge-firmware
./scripts/build-firmware.sh ./firmware-build
```

The finished files are in `firmware-build/`. The script uses a temporary sibling workspace internally:

```text
workspace/
├── dc34-api/
├── dc34-console/
├── dc34-vault/
└── xous-core/
```

Set `BADGEBLOOM_BUILD_ROOT` to an empty directory if you want to preserve that workspace for debugging. Otherwise it is safely removed after the build.

### Windows build

The supported Windows route is WSL2, because Xous's build and packaging scripts are Unix-oriented. Open PowerShell as Administrator:

```powershell
wsl --install -d Ubuntu
```

Restart Windows if requested, open the new Ubuntu terminal, and follow the Linux build commands above. From Explorer, WSL files are available below `\\wsl$\Ubuntu\`; you can also copy the resulting `firmware-build` directory into your Windows Downloads folder.

## Flashing on Windows, or: the irreversible part with drive letters

1. Download and extract `dc34-badgebloom-firmware-v1.2.0.zip` from the release. Do not copy the ZIP itself.
2. Disconnect the badge core. Hold **any badge button** while connecting it with a data-capable USB cable.
3. Confirm the badge screen says **Update mode**. Windows should mount it as a removable drive.
4. Copy `loader.uf2`, `xous.uf2`, and `swap.uf2` to the root of that drive. Copy all three from the same release.
5. Wait for every copy to finish, then use **Eject** or **Safely Remove Hardware** on the removable drive.
6. While the badge is still powered, press any badge button. This final press commits any partially buffered sector and boots the new firmware.

Optional PowerShell checksum inspection:

```powershell
Get-FileHash .\loader.uf2, .\xous.uf2, .\swap.uf2 -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

## Flashing on Linux, or: `sync` is not decorative

1. Download and extract the firmware ZIP.
2. Disconnect the badge core. Hold **any badge button** while reconnecting it over a data-capable USB cable.
3. Confirm **Update mode** appears, then identify the newly mounted removable drive:

   ```bash
   lsblk -o NAME,LABEL,SIZE,MOUNTPOINTS
   ```

4. Using the actual mount point reported on your machine, copy all three matched files. For example:

   ```bash
   cp loader.uf2 xous.uf2 swap.uf2 /media/your-user/BAOCHIP/
   sync
   ```

5. Eject it in your file manager, or unmount the correct partition with `udisksctl unmount -b /dev/sdX1`, replacing `/dev/sdX1` with the device shown by `lsblk`.
6. While the badge remains powered, press any badge button to finalize the update and boot.

Forgetting `sync`/Eject or the final button press can leave the last sector incomplete. If an update aborts, re-enter Update mode and flash the complete matched set again. Do not guess a device path, and do not copy the files onto an ordinary disk that merely happened to be nearby.

## Serious acknowledgements hiding below the jokes

This is an independent community project, not affiliated with or endorsed by DEF CON, Baochip, or the upstream badge authors. It stands on substantial real engineering from the [official DC34 badge guide](https://defcon.org/34b/), [vault firmware](https://github.com/bunnie/dc34-vault), [LED console](https://github.com/bunnie/dc34-console), [shared badge API](https://github.com/bunnie/dc34-api), and [official image uploader](https://github.com/bunnie/dc34-image).

Their work is engineering. This repository is **AI SLOP**, assembled in spirit from a Las Vegas bar stool.

Released under the [MIT License](./LICENSE).
