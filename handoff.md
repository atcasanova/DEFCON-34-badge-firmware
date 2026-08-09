# BadgeBloom firmware recovery and debugging handoff

Read this before flashing anything.

The physical badge is currently healthy and running the official stock firmware. It displays **DEV MODE**, which is expected after developer-signed firmware has ever been installed. Do not spend time trying to clear that label: developer mode is a one-way device state, and reinstalling stock firmware does not restore the erased factory/provisioned secrets.

The immediate task is to fix BadgeBloom's custom firmware so it boots on real hardware. The published **v1.3.1 custom firmware is known bad on this badge**: it stops at the boot logo with the progress bar visually around 50%. Do not flash v1.3.1 again except as part of a deliberate diagnostic experiment with the official rollback files ready.

## Project in one paragraph

[DC34 BadgeBloom](https://github.com/atcasanova/DEFCON-34-badge-firmware) is an independent DEF CON 34 badge firmware modification plus a 100% client-side JavaScript configurator hosted on [GitHub Pages](https://atcasanova.github.io/DEFCON-34-badge-firmware/). The web app lets a user design the eight perimeter LEDs and two eye LEDs, select eye behavior and animation speed, convert monochrome wallpapers, and send everything to the badge camera through checksummed QR records. Wallpapers use a slow eight-frame QR carousel so the camera does not have to win an FPS race.

The intended physical controls are:

| Control | Intended behavior |
|---|---|
| Left front button | Open the camera and scan a BadgeBloom light or wallpaper QR |
| Middle front button | Show the saved monochrome wallpaper |
| Right front button | Show a QR linking to this repository |
| Side rocker up/down | Increase/decrease animation speed from 0.25x to 2x |
| Side rocker press | Reset animation speed to 1x |

The complete feature description and QR formats are in [README.md](./README.md). The web app is not the current blocker; its JavaScript protocol tests and production build pass. The blocker is booting the custom Xous firmware on the real badge.

## How we got here

1. The project began as a browser editor for the badge's perimeter light phenotype.
2. The physical preview was corrected from a circle to the badge's eight-LED diamond layout, with the two eye LEDs handled separately.
3. Monochrome image conversion and an eight-frame, camera-paced wallpaper QR protocol were added.
4. The badge-side vault patch added QR decoding, previews, Keep/Revert, PDDB persistence, wallpaper display, repository QR display, and button/rocker behavior.
5. A second firmware patch modified `dc34-console` and its generated BIO light engine to restore independent eye control and add runtime animation-speed scaling.
6. A pinned build pipeline successfully compiled and developer-signed `loader.uf2`, `xous.uf2`, and `swap.uf2`. CI checked hashes and UF2 structure, but there had been no physical boot test.
7. Those artifacts were published as v1.3.0 and rebuilt unchanged for v1.3.1. The v1.3.1 source change itself only added cross-platform flashing scripts; its firmware patches are the same as v1.3.0.
8. The first real v1.3.1 flash completed, but the badge stopped at its logo with the progress bar near 50%.
9. The same badge was then flashed with the official `latest.zip` set. That firmware booted and works normally, displaying DEV MODE.

That final experiment is decisive: the badge hardware, boot1/update mode, flash storage, USB cable, and basic update procedure all work. The problem is in the custom build/artifact set.

## Repository state

- Default branch: `main`
- Known-bad release tag: `v1.3.1` at commit `fc435a6666d75cc39b7c76d81372df0f8df5740f`
- `v1.3.0` at `1adbcf2` introduced the console/eye/speed patch and should be presumed bad until tested.
- `v1.2.0` at `e8aa192` predates the console patch. It contains the vault-side QR/wallpaper work and is physically untested; it is useful as a possible binary-bisection candidate, not as a known-good release.
- `main` also contains [rollback.ps1](./rollback.ps1), which can use an already-downloaded official ZIP and does not need TLS when invoked with `-ZipFile`.
- Do not create a new release or move a tag until a complete candidate has booted and passed the physical test checklist below.

Important files:

| File | Purpose |
|---|---|
| [firmware/dc34-badgebloom-firmware.patch](./firmware/dc34-badgebloom-firmware.patch) | `dc34-vault` QR, wallpaper, UI, persistence, button, and rocker changes |
| [firmware/dc34-badgebloom-console.patch](./firmware/dc34-badgebloom-console.patch) | `dc34-console` eyes, BIO engine, and speed changes |
| [scripts/build-firmware.sh](./scripts/build-firmware.sh) | Pinned clone/build/sign/package pipeline |
| [create.ps1](./create.ps1) | Windows flasher for BadgeBloom candidate artifacts |
| [rollback.ps1](./rollback.ps1) | Windows recovery flasher for official stock `latest.zip` |
| [src/protocol.js](./src/protocol.js) | Light QR v1/v2 records |
| [src/image-protocol.js](./src/image-protocol.js) | Wallpaper frame protocol |
| [tests/protocol.test.js](./tests/protocol.test.js) | Browser protocol tests |

The build pins are:

| Component | Commit/version |
|---|---|
| Rust/Xous sysroot | `1.97.1` |
| `dc34-api` | `617f0f3dff3cea1e9421d766b19664f5bec9a54b` |
| `dc34-console` | `bf64e03f019532cca5055fcdbe51977d572e3630` |
| `dc34-vault` | `7954e6200df67580795b12602e1a7235ed434ca6` |
| `xous-core` | `5d5bbbfa95c0dcef26fe1fe9b496b7f6f31d191b` |

The pack command mirrors the upstream `dc34-vault` instructions:

```text
cargo +1.97.1 xtask baosec-lite \
  ../dc34-console/target/riscv32imac-unknown-xous-elf/release/dc34-console~flash \
  ../dc34-vault/target/riscv32imac-unknown-xous-elf/release/dc34-vault \
  --no-timestamp --feature usb --kernel-feature debug-proc --no-verify
```

## Confirmed artifacts

### Known-good official stock set

Source: <https://defcon.org/34b/latest.zip>

The official DEF CON URL and the upstream CI URL currently serve the same archive. This exact archive was flashed successfully on the physical badge:

```text
latest.zip
SHA-256 17f0f4d08debe2481ef7de0a4ab5ec92cc383ab7ed8ec06dc0bf1686852105f7

loader.uf2  353280 bytes  916704a57f766b412c4e19016071a63e93c14b9a66cb1ca5d44196b11a0a3e00
xous.uf2   6358528 bytes  098c2566b8e2fdd9f698c478bd4deeba0c03da26cb679014a99d3951ec044a74
swap.uf2   2343424 bytes  54c400cb37da0a87b48cf775619564096d4b6274cfe39deaf5198b1ce0fd8870
```

Keep this ZIP on the Windows machine throughout testing.

### Known-bad BadgeBloom v1.3.1 set

Source: <https://github.com/atcasanova/DEFCON-34-badge-firmware/releases/tag/v1.3.1>

```text
loader.uf2  353280 bytes  766454d380e80d147fa8f4ddcf8dcb45d798608c84e13f491caa1fe7f8bf51df
xous.uf2   6366720 bytes  3f17d5f77a99d15fc5bf718525cddb0f652e87ff836799c92fc0c1ed7739eb2e
swap.uf2   2384896 bytes  c7f0da3e3bf109cefd0b2940184527ebc161e4a4432eabd9f2bb10033f0c444f
```

These files are structurally valid UF2 images for family `0xA7D76373`, with coherent block counts and target ranges. That validation only proves packaging structure; it does not prove that the contained system can boot.

## Best current failure lead

The displayed 50% is produced by the Xous loader, before the BadgeBloom vault UI or LED application begins executing. The pinned loader's cold-boot sequence calls `phase_1`, then `phase_2`, then displays 100%. In `phase_1`, the bar advances from 5% to 70% while kernel arguments and resident processes are copied.

The custom and official `xous.uf2` files were decoded and their XArg process tables compared:

- Both have the same resident process ordering.
- PID 2 through PID 11 have the same section sizes in stock and v1.3.1.
- PID 11 is `bao-video`.
- PID 12 is `dc34-console`, the first changed resident process.
- Stock `dc34-console` payload: 368,272 bytes, entry point `0x60cb2`.
- BadgeBloom `dc34-console` payload: 372,856 bytes, entry point `0x6256c`.
- The runtime argument list has 16 entries after the swapped vault app is merged. Integer progress increments are four points per entry.
- The bar is approximately 49% immediately before/around the `dc34-console` entry and 53% after it.

Therefore the patched console or its interaction with the selected loader/build is the strongest current suspect. This is an inference, not proof: the user's “50%” was visual rather than an exact numeric reading, and a failure immediately after the console could look nearly identical.

One obvious theory has already been checked: the generated aligned BIO light program is not over its stated size limit. In the built ELF, `BM_LIGHTGENES_BIO_END - BM_LIGHTGENES_BIO_START - 4` is `0xC8C`, below `0xF00`. Do not assume that the BIO source is correct, but do not waste the first debugging cycle merely rediscovering this size measurement.

Relevant upstream loader sources:

- <https://github.com/betrusted-io/xous-core/blob/5d5bbbfa95c0dcef26fe1fe9b496b7f6f31d191b/loader/src/main.rs>
- <https://github.com/betrusted-io/xous-core/blob/5d5bbbfa95c0dcef26fe1fe9b496b7f6f31d191b/loader/src/phase1.rs>
- <https://github.com/betrusted-io/xous-core/blob/5d5bbbfa95c0dcef26fe1fe9b496b7f6f31d191b/loader/src/phase2.rs>

## Recommended diagnostic sequence

Change one variable at a time and always build/flash a complete matched three-file set.

1. **Preserve the recovery baseline.** Confirm `rollback.ps1 -ZipFile ...` and the official ZIP remain available locally.
2. **Fast historical bisect, optional:** test the complete v1.2.0 artifact set. It uses the same Rust/Xous/source pins but predates `dc34-badgebloom-console.patch`. If it boots past 50%, the console patch is strongly implicated. v1.2.0 is not known-good, so treat this as a diagnostic flash and keep rollback ready.
3. **Build an unpatched baseline** from the four pinned upstream repositories using the same pack command. Flash it. If this fails, the problem is the source/toolchain/signing/build selection rather than BadgeBloom patches; align the build with the official CI revision before proceeding.
4. **Build vault-only:** apply `dc34-badgebloom-firmware.patch`, leave `dc34-console` untouched, then build and flash. This tests QR/wallpaper/UI changes independently.
5. **Build console-only:** apply `dc34-badgebloom-console.patch`, leave `dc34-vault` untouched, then build and flash. This should reproduce the 50% boundary if the current lead is correct.
6. **Bisect the console patch** if console-only fails:
   - Start with Rust-side command plumbing while retaining the stock generated light engine.
   - Add independent eye controls.
   - Add the generated BIO C/assembly changes.
   - Add animation-speed accumulation last.
   - Regenerate `lightgenes.rs` from `main.c` with the documented Zig version instead of hand-editing generated assembly.
7. **Instrument the loader if needed.** Add visible before/after checkpoints around each `IniF` copy, or capture its physical UART. The existing approximate bar already points near PID 12, but a precise checkpoint removes ambiguity.
8. Once a candidate boots, combine both patches and run the full physical behavior checklist.

Do not “test” by mixing stock `loader.uf2` with custom `xous.uf2`/`swap.uf2` unless you have first verified their boot format and intentionally accept that experiment. Complete matched sets are the safe default.

## Windows and USB workflow

Builds are most straightforward in WSL2 because the Xous tools are Unix-oriented:

```bash
git clone https://github.com/atcasanova/DEFCON-34-badge-firmware.git
cd DEFCON-34-badge-firmware
npm ci
npm test
npm run build
./scripts/build-firmware.sh ./firmware-build
```

For diagnostic variants, preserve the cloned sibling workspace with `BADGEBLOOM_BUILD_ROOT` and modify only the intended checkout before rebuilding. Record every source commit, patch selection, artifact SHA-256, and physical outcome.

On the Windows host, put the badge into Update mode first, then flash an explicit candidate directory so `create.ps1` cannot silently download the known-bad latest BadgeBloom release:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\create.ps1 -Source "C:\path\to\candidate-firmware"
```

The correct physical update sequence for this badge is:

1. Disconnect USB.
2. Hold any badge key.
3. While holding it, press reset/power-cycle the badge.
4. Release the key when the display says **Update mode**.
5. Connect USB directly to Windows and wait for the `BAOCHIP` volume.
6. Copy the matched `loader.uf2`, `xous.uf2`, and `swap.uf2` set.
7. Wait for writes, safely eject, keep the badge powered, and press any badge button once to commit.

Avoid VirtualBox USB pass-through during debugging. Direct Windows attachment is already proven to work.

To restore stock firmware without a network request:

```powershell
.\rollback.ps1 -ZipFile "C:\path\to\official-latest.zip"
```

### Serial logging limitation

The badge exposes a USB CDC-ACM/COM console after enough of the system boots, but upstream explicitly warns that the virtual USB console cannot capture a crash during early boot. A hang in the loader may therefore never produce a usable Windows COM port.

The fallback early console is on physical pads PB14 (badge TX) and PB13 (badge RX), at 1,000,000 baud, 8N1. **Do not attach a USB-UART adapter until the badge's VDDIO signal level has been verified**; upstream notes it may be 1.8 V or 3.3 V depending on the board. Never inject 5 V. See the upstream [serial console documentation](https://github.com/betrusted-io/xous-core/blob/main/README-consoles.md).

If physical UART is inconvenient, a temporary diagnostic loader that renders explicit stage/tag numbers on the OLED is safer than guessing from the progress-bar width.

## Physical acceptance checklist

A firmware build is not fixed merely because CI compiles it. Before publishing a replacement release, verify on the real badge:

- Cold boot reaches the developer idle screen repeatedly.
- Reset and power-cycle both boot normally.
- Left button opens the camera.
- A v2 light QR previews all eight perimeter LEDs and both eyes.
- Keep persists the ring and eye configuration; Revert restores the previous state.
- Legacy v1 light QR remains accepted and selects stock eye-follow behavior.
- Eye modes work: follow, off, steady, blink, alternating wink, and breathe.
- Side rocker up/down changes speed through 0.25x–2x; press resets to 1x; display indicator updates.
- An eight-frame wallpaper transfer accepts frames in any order, ignores duplicates, shows `FRAME N DONE`/`ALREADY`, and reopens the camera for the next frame.
- Wallpaper preview Keep/Revert works and persists after reboot.
- Middle button shows the wallpaper and exits cleanly.
- Right button shows a readable repository QR and exits cleanly.
- Factory update mode and recovery remain reachable.
- The web-generated QRs used in the test came from the current `main` build.

Only after this checklist passes should the project bump the version, publish a corrected release, and clearly mark v1.3.1 as broken/superseded.

## Known secondary cleanup

- Parts of [README.md](./README.md), [create.ps1](./create.ps1), and [flash.sh](./flash.sh) still describe entering Update mode as holding a button while connecting USB. On the actual battery-powered badge, the reliable sequence was holding a button while pressing reset/power-cycling, waiting for **Update mode**, and only then attaching USB. Correct those instructions with the firmware fix.
- `rollback.ps1` already uses the corrected reset-first wording.
- `rollback.ps1 -ZipFile` exists because SSL negotiation failed on the user's Windows PowerShell during direct download. The local ZIP route was added and tested with the real official archive.
- DEV MODE is expected and permanent after the first developer firmware flash. It is not evidence that the stock rollback failed.

## Definition of done

The task is complete when a clean checkout can reproducibly build a matched three-UF2 candidate, that exact candidate cold-boots on the physical badge, all controls/QR/wallpaper/eye behaviors above pass, recovery remains available, documentation reflects the real update sequence, and a new release supersedes v1.3.1 with recorded hashes and physical-test results.
