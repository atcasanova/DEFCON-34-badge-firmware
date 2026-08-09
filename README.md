# DC34 BadgeBloom: Premium AI SLOP

Design DEF CON 34 badge light patterns in a browser, then fire one compact QR into the badge through its rear camera because apparently USB cables were not sufficiently dramatic.

**Live AI SLOP:** https://atcasanova.github.io/DEFCON-34-badge-firmware/

Let us establish provenance immediately: this entire project is **AI SLOP**. The web app is AI SLOP. The JavaScript QR protocol is AI SLOP. The Rust firmware patch is artisanal, small-batch, locally sourced AI SLOP. Even this README is free-range AI SLOP.

I made this while drinking at a bar in Las Vegas, without access to a computer. I am sincerely hoping the AI can make all of this work. This is either the future of software engineering or a compelling argument for keeping the factory firmware.

> [!CAUTION]
> The jokes stop here for a moment. Installing custom firmware is a one-way transition into developer mode. According to the official badge documentation, this erases the provisioned light-exchange secret and disables official encrypted badge-to-badge light exchange. There is no undo button for that secret. Review the patch, build it yourself, and flash only if you accept that consequence.

## What this particular pile of slop does

- Edits the native 9-byte `Haploid` perimeter phenotype plus a 9-byte BadgeBloom eye phenotype
- Controls hue range, saturation, waves, speed, direction, hue drift, white chaser, and contrast
- Controls both eye LEDs independently with color, brightness, stock-follow, off, steady, blink, wink, and breathe modes
- Previews all ten LEDs: two eyes plus the eight-LED diamond layout
- Offers native color pickers plus editable R/G/B channel values
- Keeps the pattern's encoded speed exactly as selected in the web editor
- Validates light data with CRC-16
- Previews light patterns before **Keep / Revert**
- Stores accepted settings in PDDB and restores them after boot
- Contains no backend, analytics, cookies, accounts, cloud image upload, or adult supervision

## The button-and-rocker constitution

In developer idle mode:

| Button | Highly sophisticated operation |
|---|---|
| Left / Middle | Open the camera and scan a BadgeBloom light QR |
| Right | Show the stock gene-exchange nonce QR |
| Side rocker hold | Open the menu with **Power Off** selected first |

The rocker no longer changes animation speed. The speed selected in the web editor is encoded directly in the light phenotype. The stock exchange UI is present, but developer mode permanently erases the provisioned `k0` secret, so restoring its buttons does not restore authenticated exchange with factory badges.

## Light patterns: one QR, eighteen glorious bytes

Protocol v2 keeps the badge console's native 9-byte ring phenotype intact and appends nine eye bytes: behavior, left RGB, right RGB, tempo in 25 ms units, and brightness. The record is wrapped as:

```text
DC34LIGHT://<Base45 record>
```

The firmware checks the magic, version, flags, exact length, canonical field ranges, and CRC-16/CCITT-FALSE. The uppercase prefix keeps the complete QR in its lower-density alphanumeric mode; old lowercase codes remain accepted. Ring patterns use the original memory-backed `SetGene` operation. BadgeBloom marks an exact custom phenotype with two identical strands so the console keeps all nine editor bytes instead of blending them with the stock dominance rules. Custom-eye startup also fails dark rather than briefly selecting full-power white. Accepted patterns are persisted together in PDDB. Legacy v1 nine-byte QRs remain accepted and select the stock eye-follow behavior.

```text
ring:  03 A0 FF DC F5 00 80 FF FF
eyes:  04 12 34 56 AB CD EF 3C D2
body:  44 43 33 34 02 00 <ring> <eyes> <CRC-16>
```

## Using it

1. Open the [live editor](https://atcasanova.github.io/DEFCON-34-badge-firmware/).
2. Create a ring-and-eye light pattern, including its encoded pulse speed.
3. Press the badge's left or middle button.
4. Scan the single light QR.
5. Inspect the physical result and choose **Keep** or **Revert**.

The QR formats are intentionally unauthenticated. Their checksums detect corruption, not hostile input. Scan only data you intend to preview. Las Vegas already contains enough untrusted input.

## Download the first actually flashable release

Starting with **v1.2.0**, releases contain a complete, developer-signed firmware set instead of making you assemble the Rust cinematic universe yourself:

- `loader.uf2`
- `xous.uf2`
- `swap.uf2`
- `dc34-badgebloom-firmware-<version>.zip` containing all three files, a build manifest, and firmware checksums
- `dc34-badgebloom-firmware.patch` containing the vault/UI changes
- `dc34-badgebloom-console.patch` containing the eye/BIO changes

Download all three UF2 files from the [latest release](https://github.com/atcasanova/DEFCON-34-badge-firmware/releases/latest), or download and extract the firmware ZIP. Keep the three files from the same release together; mixing versions is exciting in the wrong way.

The artifacts are compiled with the public Xous developer key. They were successfully built for the real `riscv32imac-unknown-xous-elf` target and checked as UF2 images for Baochip family `0xA7D76373`. QR scanning and button behavior still deserve validation on physical badge hardware before this AI SLOP is mistaken for avionics.

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

The build also synchronizes the compiled bundle to the repository root so both GitHub Pages publishing modes serve the same files. Tests cover Base45, CRC-16, v1/v2 light records, eye fields, and corruption rejection.

Pushing `main` deploys `dist/` through the GitHub Pages workflow. To deploy it somewhere else, upload the contents of `dist/` to any static host; it needs no server-side code, environment variables, or database.

## Building the firmware-flavored AI SLOP

The reproducible build script clones and pins the exact sources, installs Rust 1.97.1, installs Xous's custom target, applies both BadgeBloom patches plus the Xous `IniS`/`NOCOPY` loader fix required by the enlarged vault image, compiles the patched LED console and vault, packs the operating system, and signs it with the public developer key. The generated BIO assembly is committed in the console patch, so ordinary firmware builds do not require Zig.

The loader fix prevents zero-filled ELF sections such as `.bss` from advancing or decrypting nonexistent source bytes. Without it, a `NOCOPY` section that crosses the final encrypted data-page boundary is mistaken for source data and the loader attempts to decrypt the swap MAC table. This exact boundary case was reproduced and the corrected loader was physically verified to reach `DEV MODE`.

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

For an early-boot diagnostic build, enable the on-screen loader checkpoints and use a separate output directory:

```bash
BADGEBLOOM_DIAGNOSTIC_LOADER=1 \
  ./scripts/build-firmware.sh ./firmware-build-diagnostic
```

The diagnostic loader replaces the progress bar with a compact checkpoint such as `D1B I11 P12 TF`: phase 1, before item 11, PID 12, `IniF`. `S`, `B`, and `A` mean phase start, before, and after; tag letters `F`, `E`, `S`, `K`, and `O` mean `IniF`, `IniE`, `IniS`, kernel, and other. This mode is for physical boot diagnosis and should not be published as production firmware.

If you modify `firmware/dc34-badgebloom-console.patch` at the C level, regenerate the LED engine with Zig 0.15.2 before building. This is contributor tooling, not required for the normal pinned build:

```bash
python3 -m pip install --user ziglang==0.15.2
cd dc34-console/src/bio
python3 -m ziglang build '-Dmodule=lightgenes' '-Demit-binary=true'
```

The binary-size build must remain below the BIO core's `0xF00`-byte program limit.

### Windows build

The supported Windows route is WSL2, because Xous's build and packaging scripts are Unix-oriented. Open PowerShell as Administrator:

```powershell
wsl --install -d Ubuntu
```

Restart Windows if requested, open the new Ubuntu terminal, and follow the Linux build commands above. From Explorer, WSL files are available below `\\wsl$\Ubuntu\`; you can also copy the resulting `firmware-build` directory into your Windows Downloads folder.

## Flashing on Windows, or: the irreversible part with drive letters

For the one-command route, put the badge in **Update mode**, then run the included PowerShell flasher from the repository. It checks its built-in dependencies, accepts only a volume named `BAOCHIP`, prefers a local `firmware-build` directory, otherwise downloads the latest release, verifies every SHA-256 and UF2 family ID, copies all three images, and requests a safe eject:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\create.ps1
```

Use `-Source C:\path\to\firmware-build` for an explicit artifact directory or `-Drive E:` if more than one badge is connected. The filename is `create.ps1` because naming things remained the hardest part of the bar-based AI SLOP process.

Manual route:

1. Download and extract the firmware ZIP from the latest release. Do not copy the ZIP itself.
2. Disconnect USB. Hold **any badge button**, then press reset or power-cycle the badge while continuing to hold the button.
3. Release the button after the screen says **Update mode**, then connect a data-capable USB cable. Windows should mount it as a removable drive named `BAOCHIP`.
4. Copy `loader.uf2`, `xous.uf2`, and `swap.uf2` to the root of that drive. Copy all three from the same release.
5. Wait for every copy to finish, then use **Eject** or **Safely Remove Hardware** on the removable drive.
6. While the badge is still powered, press any badge button. This final press commits any partially buffered sector and boots the new firmware.

Optional PowerShell checksum inspection:

```powershell
Get-FileHash .\loader.uf2, .\xous.uf2, .\swap.uf2 -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

## Flashing on Linux, or: `sync` is not decorative

For the one-command route, put the badge in **Update mode**, then run:

```bash
chmod +x flash.sh
./flash.sh
```

`flash.sh` installs missing dependencies through `apt`, `dnf`, `yum`, `pacman`, `zypper`, or `apk`; requires the exact `BAOCHIP` volume label; downloads and verifies the latest release when no local `firmware-build` exists; copies the matched UF2 set; calls `sync`; and safely unmounts it. Use `--source /path/to/firmware-build`, `--mount /media/you/BAOCHIP`, or `--keep-mounted` when needed. It refuses missing and ambiguous devices rather than choosing a random disk with main-character energy.

Manual route:

1. Download and extract the firmware ZIP.
2. Disconnect USB. Hold **any badge button**, then press reset or power-cycle the badge while continuing to hold the button.
3. Release the button after **Update mode** appears, reconnect a data-capable USB cable, then identify the newly mounted removable drive:

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

Released into the public domain under [The Unlicense](./LICENSE), because apparently even copyright needed to be told to leave the bar.
