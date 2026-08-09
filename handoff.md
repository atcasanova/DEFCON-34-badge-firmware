# BadgeBloom firmware recovery and debugging handoff

Read this before flashing anything.

The physical badge has permanently entered **DEV MODE**. This is expected after installing developer-signed firmware: the transition erases the provisioned `k0` light-exchange secret. Reinstalling stock firmware does not restore that secret. The stock exchange screens can be restored, but authenticated exchange with factory badges cannot be recovered.

The published **v1.3.1 firmware is known bad** on this badge: it stops at the boot logo near 50%. A corrected loader has already reached the application on real hardware. **v1.4.0 is also superseded:** its QR changed the eyes but still did not change the perimeter LEDs, and the rocker hold never opened the menu.

## Current intended behavior

BadgeBloom is now only a light-pattern configurator. The browser editor defines the eight perimeter LEDs, two eye LEDs, eye behavior, and the pattern's encoded pulse speed, then sends one checksummed `DC34LIGHT://` QR to the badge. The uppercase prefix is intentionally QR-alphanumeric and the decoder remains case-insensitive.

Custom wallpaper transfer was removed after physical testing showed that the badge camera could not reliably read its QR carousel. The badge keeps its normal/default image. Runtime speed adjustment was also removed from the rocker; the speed slider remains in the webapp because it is part of the pattern encoded in the QR.

| Control | Intended behavior |
|---|---|
| Left / Middle | Open the scanner for a BadgeBloom light QR |
| Right | Show the stock gene-exchange nonce QR |
| Rocker up/down | No BadgeBloom speed adjustment |
| Hold rocker for about 1.3 seconds | Open the idle menu with **Power Off** first |

## Current implementation state

- The Xous loader `IniS`/`NOCOPY` boot bug is fixed.
- The badge-side wallpaper, repository-QR, and wallpaper persistence flows are removed.
- The permanent `DEV MODE` overlay is removed; developer mode remains a device state, not an always-on application label.
- Both the previously proven left-button path and the stock middle camera button open the light scanner; right retains the stock nonce QR.
- A long rocker hold opens the idle menu; the Xous keyboard service now permits Select repeats so the application can actually detect that hold. The same physical hold is latched so it cannot immediately activate the selected item.
- **Power Off** is the first idle-menu item.
- Rocker up/down no longer changes animation speed.
- The QR's encoded speed remains active and is kept in the webapp.
- Custom rings no longer use the ineffective scalar `Force` IPC. They use the stock memory-backed `SetGene` IPC with two identical strands marking an exact nine-byte phenotype.
- Custom-eye startup values fail dark instead of defaulting to white at full brightness.
- Keep/Revert closes its menu state immediately, preventing a fast middle-button camera press from being routed back to the stale confirmation menu.
- The webapp exposes stock-follow, off, steady, human blink, alternating wink, and breathe eye behaviors under **Eye animation**.
- Both firmware components and the production webapp build successfully; the matched UF2 set was flashed and byte-verified on the BAOCHIP volume.

Flashed `v1.4.1` SetGene/rocker candidate:

```text
loader.uf2  356352 bytes  b112d47056ec92b90b7cdfa602f7c7cac27cb3a39f1604f5f1510d3ff04e4298
xous.uf2   6358528 bytes  f3c6142e4e8216e2429920dd65f047f6f778ddcccdcd2ce20368197db5c41b7f
swap.uf2   2368000 bytes  24518e35b9be4965e242a21c773254568f6fc2a132ed861c72f0776988652daa
```

## Boot fix confirmed on hardware (2026-08-09)

On-screen loader instrumentation first stopped at `D1B I16 P13 TS`, locating the failure inside phase 1 while loading PID 13 (`dc34-vault`) as an `IniS` swap process. Detailed instrumentation then stopped at `D3R I88 P13 TS`; the two-digit page display is modulo 100, so this meant source page **288**.

The custom vault's final `NOCOPY` sections describe zero-filled memory through source-relative offset `0x120210`, while the encrypted data/MAC boundary is `0x120000` (288 data pages, numbered 0-287). The pinned loader incorrectly advanced the source pointer and attempted to decrypt every `NOCOPY` page, even though those bytes do not exist in the ELF payload. It therefore attempted to decrypt page 288, which is the MAC table.

All 288 encrypted pages in the candidate `swap.uf2` independently authenticated successfully with AES-GCM-SIV, ruling out a corrupt or truncated artifact. `firmware/xous-inis-nocopy-loader.patch` fixes the loader by zero-filling `NOCOPY` destinations without reading, decrypting, or advancing source data. The corrected loader reached `DEV MODE` on the physical badge.

Physically booted loader-fix test set:

```text
loader.uf2  356352 bytes  b112d47056ec92b90b7cdfa602f7c7cac27cb3a39f1604f5f1510d3ff04e4298
xous.uf2   6358528 bytes  86ca351eb0635eb698b36db51bc31edb03b4e3b9cf95a649261af59ba271e221
swap.uf2   2384896 bytes  a743acab3b1203e742ebd8bc8b460f716d1413eea25ea15cd3d250a336e00c59
```

This set proves the loader fix only. It predates the final feature simplification and the ring-force fix and must not be published as the final firmware.

## Ring LED fix

The badge reached the application, accepted the QR, and changed only its eyes. The vault was sending the complete pattern, but `Lightgenes::force()` in the console omitted BIO bit `0x4000_0000`. Without that write bit, every forced perimeter byte was discarded. `firmware/dc34-badgebloom-console-functional.patch` adds the bit while retaining the FIFO guard.

## Important files

| File | Purpose |
|---|---|
| `firmware/dc34-badgebloom-firmware.patch` | Original vault QR/UI implementation |
| `firmware/dc34-badgebloom-vault-functional.patch` | Removes wallpaper/runtime-speed UI and restores the intended controls |
| `firmware/dc34-badgebloom-console.patch` | Original eye/BIO console implementation |
| `firmware/dc34-badgebloom-console-functional.patch` | Fixes forced ring writes |
| `firmware/xous-inis-nocopy-loader.patch` | Correct loader handling for zero-filled swap sections |
| `firmware/dc34-diagnostic-loader.patch` | Optional on-screen early-boot instrumentation |
| `scripts/build-firmware.sh` | Pinned clone/build/sign/package pipeline applying all production patches |
| `create.ps1` | Windows flasher for a matched candidate set |
| `rollback.ps1` | Recovery flasher for the official stock archive |
| `src/protocol.js` | Light QR v1/v2 protocol |
| `tests/protocol.test.js` | Light protocol tests |

Pinned source set:

| Component | Commit/version |
|---|---|
| Rust/Xous sysroot | `1.97.1` |
| `dc34-api` | `617f0f3dff3cea1e9421d766b19664f5bec9a54b` |
| `dc34-console` | `bf64e03f019532cca5055fcdbe51977d572e3630` |
| `dc34-vault` | `7954e6200df67580795b12602e1a7235ed434ca6` |
| `xous-core` | `5d5bbbfa95c0dcef26fe1fe9b496b7f6f31d191b` |

## Known firmware sets

Known-good official stock archive, successfully flashed on this badge:

```text
latest.zip  17f0f4d08debe2481ef7de0a4ab5ec92cc383ab7ed8ec06dc0bf1686852105f7
loader.uf2  353280 bytes  916704a57f766b412c4e19016071a63e93c14b9a66cb1ca5d44196b11a0a3e00
xous.uf2   6358528 bytes  098c2566b8e2fdd9f698c478bd4deeba0c03da26cb679014a99d3951ec044a74
swap.uf2   2343424 bytes  54c400cb37da0a87b48cf775619564096d4b6274cfe39deaf5198b1ce0fd8870
```

Known-bad BadgeBloom v1.3.1 set:

```text
loader.uf2  353280 bytes  766454d380e80d147fa8f4ddcf8dcb45d798608c84e13f491caa1fe7f8bf51df
xous.uf2   6366720 bytes  3f17d5f77a99d15fc5bf718525cddb0f652e87ff836799c92fc0c1ed7739eb2e
swap.uf2   2384896 bytes  c7f0da3e3bf109cefd0b2940184527ebc161e4a4432eabd9f2bb10033f0c444f
```

Keep the official archive locally throughout physical testing.

## Build and flash workflow

The production build applies the original patches, both functional follow-up patches, and the loader fix:

```bash
npm ci
npm test
npm run build
./scripts/build-firmware.sh ./firmware-build
```

The resulting `loader.uf2`, `xous.uf2`, and `swap.uf2` are one matched set. Do not mix them with files from stock or another candidate.

Reliable physical update sequence for this badge:

1. Disconnect USB.
2. Hold any badge key.
3. While holding it, press reset or power-cycle the badge.
4. Release the key when the display says **Update mode**.
5. Connect USB directly to Windows and wait for the `BAOCHIP` volume.
6. Flash an explicit candidate directory: `./create.ps1 -Source "C:\path\to\candidate"`.
7. Wait for writes, safely eject, keep the badge powered, and press any badge button once to commit.

To restore stock without a network request:

```powershell
./rollback.ps1 -ZipFile "C:\path\to\official-latest.zip"
```

## Physical acceptance checklist

- Cold boot, reset, and power-cycle repeatedly reach the normal idle application.
- The screen does not remain covered by a permanent `DEV MODE` status label.
- The default badge image remains available; there is no custom wallpaper transfer UI.
- Left and middle each open the scanner.
- A web-generated v2 QR previews all eight perimeter LEDs and both eyes.
- Changing **Pulse speed** in the webapp changes the speed encoded into and applied by the pattern.
- Keep persists ring, eye, and encoded speed settings across reboot.
- Revert restores the previous ring, eye, and speed settings.
- Legacy v1 light QR remains accepted and selects stock eye-follow behavior.
- Eye modes work: follow, off, steady, blink, alternating wink, and breathe.
- Rocker up/down does not alter the applied animation speed.
- Holding the rocker for about 1.3 seconds opens the menu without selecting an item accidentally.
- **Power Off** is the first menu item and powers the badge off when selected.
- Right shows the stock gene-exchange nonce QR. Do not mistake this UI restoration for recovery of the erased `k0` secret.
- Factory update mode and stock recovery remain reachable.
- The test QR came from the current production web build.

Only after this checklist passes should the version be bumped and a replacement release supersede v1.3.1.

## Definition of done

A clean checkout reproducibly builds the webapp and one matched three-UF2 candidate; that exact candidate cold-boots on the physical badge; every item in the simplified acceptance checklist passes; recovery remains available; and the release records the exact artifact hashes and physical-test result.
