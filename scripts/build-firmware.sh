#!/usr/bin/env bash
set -euo pipefail

readonly RUST_TOOLCHAIN="1.97.1"
readonly DC34_API_COMMIT="617f0f3dff3cea1e9421d766b19664f5bec9a54b"
readonly DC34_CONSOLE_COMMIT="bf64e03f019532cca5055fcdbe51977d572e3630"
readonly DC34_VAULT_COMMIT="7954e6200df67580795b12602e1a7235ed434ca6"
readonly XOUS_COMMIT="5d5bbbfa95c0dcef26fe1fe9b496b7f6f31d191b"
readonly XOUS_TARGET="riscv32imac-unknown-xous-elf"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_DIR="${1:-${REPO_ROOT}/firmware-build}"
VAULT_PATCH_FILE="${REPO_ROOT}/firmware/dc34-badgebloom-firmware.patch"
CONSOLE_PATCH_FILE="${REPO_ROOT}/firmware/dc34-badgebloom-console.patch"
VAULT_FUNCTIONAL_PATCH_FILE="${REPO_ROOT}/firmware/dc34-badgebloom-vault-functional.patch"
CONSOLE_FUNCTIONAL_PATCH_FILE="${REPO_ROOT}/firmware/dc34-badgebloom-console-functional.patch"
DIAGNOSTIC_LOADER_PATCH_FILE="${REPO_ROOT}/firmware/dc34-diagnostic-loader.patch"
XOUS_SWAP_PATCH_FILE="${REPO_ROOT}/firmware/xous-inis-nocopy-loader.patch"
XOUS_ROCKER_PATCH_FILE="${REPO_ROOT}/firmware/xous-rocker-hold.patch"
DIAGNOSTIC_LOADER="${BADGEBLOOM_DIAGNOSTIC_LOADER:-0}"

if [[ "${DIAGNOSTIC_LOADER}" != 0 && "${DIAGNOSTIC_LOADER}" != 1 ]]; then
  echo "BADGEBLOOM_DIAGNOSTIC_LOADER must be 0 or 1" >&2
  exit 1
fi

for command in cargo curl file git grep rustc rustup sha256sum; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Missing required command: ${command}" >&2
    exit 1
  fi
done

if [[ "${DIAGNOSTIC_LOADER}" == 1 && ! -f "${DIAGNOSTIC_LOADER_PATCH_FILE}" ]]; then
  echo "Diagnostic loader patch not found: ${DIAGNOSTIC_LOADER_PATCH_FILE}" >&2
  exit 1
fi

for patch_file in \
  "${VAULT_PATCH_FILE}" \
  "${CONSOLE_PATCH_FILE}" \
  "${VAULT_FUNCTIONAL_PATCH_FILE}" \
  "${CONSOLE_FUNCTIONAL_PATCH_FILE}" \
  "${XOUS_SWAP_PATCH_FILE}" \
  "${XOUS_ROCKER_PATCH_FILE}"; do
  if [[ ! -f "${patch_file}" ]]; then
    echo "Firmware patch not found: ${patch_file}" >&2
    exit 1
  fi
done

mkdir -p -- "${OUTPUT_DIR}"
OUTPUT_DIR="$(cd -- "${OUTPUT_DIR}" && pwd)"

cleanup_build_root=false
if [[ -n "${BADGEBLOOM_BUILD_ROOT:-}" ]]; then
  BUILD_ROOT="${BADGEBLOOM_BUILD_ROOT}"
  mkdir -p -- "${BUILD_ROOT}"
  BUILD_ROOT="$(cd -- "${BUILD_ROOT}" && pwd)"
  if [[ -n "$(find "${BUILD_ROOT}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    echo "BADGEBLOOM_BUILD_ROOT must be an empty directory: ${BUILD_ROOT}" >&2
    exit 1
  fi
else
  BUILD_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/dc34-badgebloom-build.XXXXXX")"
  cleanup_build_root=true
fi

cleanup() {
  if [[ "${cleanup_build_root}" == true && "${BUILD_ROOT}" == */dc34-badgebloom-build.* ]]; then
    rm -rf -- "${BUILD_ROOT}"
  fi
}
trap cleanup EXIT

clone_pin() {
  local url="$1"
  local destination="$2"
  local commit="$3"
  git clone --filter=blob:none --no-checkout "${url}" "${destination}"
  git -C "${destination}" checkout --detach "${commit}"
  test "$(git -C "${destination}" rev-parse HEAD)" = "${commit}"
}

echo "==> Installing Rust ${RUST_TOOLCHAIN}"
rustup toolchain install "${RUST_TOOLCHAIN}" --profile minimal

echo "==> Cloning pinned DC34 and Xous sources"
clone_pin https://github.com/bunnie/dc34-api.git "${BUILD_ROOT}/dc34-api" "${DC34_API_COMMIT}"
clone_pin https://github.com/bunnie/dc34-console.git "${BUILD_ROOT}/dc34-console" "${DC34_CONSOLE_COMMIT}"
clone_pin https://github.com/bunnie/dc34-vault.git "${BUILD_ROOT}/dc34-vault" "${DC34_VAULT_COMMIT}"
clone_pin https://github.com/betrusted-io/xous-core.git "${BUILD_ROOT}/xous-core" "${XOUS_COMMIT}"

echo "==> Applying BadgeBloom console and vault patches"
git -C "${BUILD_ROOT}/dc34-console" apply --check "${CONSOLE_PATCH_FILE}"
git -C "${BUILD_ROOT}/dc34-console" apply "${CONSOLE_PATCH_FILE}"
git -C "${BUILD_ROOT}/dc34-console" apply --check "${CONSOLE_FUNCTIONAL_PATCH_FILE}"
git -C "${BUILD_ROOT}/dc34-console" apply "${CONSOLE_FUNCTIONAL_PATCH_FILE}"
git -C "${BUILD_ROOT}/dc34-vault" apply --check "${VAULT_PATCH_FILE}"
git -C "${BUILD_ROOT}/dc34-vault" apply "${VAULT_PATCH_FILE}"
git -C "${BUILD_ROOT}/dc34-vault" apply --check "${VAULT_FUNCTIONAL_PATCH_FILE}"
git -C "${BUILD_ROOT}/dc34-vault" apply "${VAULT_FUNCTIONAL_PATCH_FILE}"
git -C "${BUILD_ROOT}/xous-core" apply --check "${XOUS_SWAP_PATCH_FILE}"
git -C "${BUILD_ROOT}/xous-core" apply "${XOUS_SWAP_PATCH_FILE}"
git -C "${BUILD_ROOT}/xous-core" apply --check "${XOUS_ROCKER_PATCH_FILE}"
git -C "${BUILD_ROOT}/xous-core" apply "${XOUS_ROCKER_PATCH_FILE}"

if [[ "${DIAGNOSTIC_LOADER}" == 1 ]]; then
  echo "==> Applying on-screen early-boot diagnostics"
  git -C "${BUILD_ROOT}/xous-core" apply --check "${DIAGNOSTIC_LOADER_PATCH_FILE}"
  git -C "${BUILD_ROOT}/xous-core" apply "${DIAGNOSTIC_LOADER_PATCH_FILE}"
fi

echo "==> Verifying BadgeBloom BIO control-state layout"
LIGHTGENES_C="${BUILD_ROOT}/dc34-console/src/bio/lightgenes/main.c"
LIGHTGENES_RS="${BUILD_ROOT}/dc34-console/src/bio/lightgenes/lightgenes.rs"
readonly LIGHTGENES_C LIGHTGENES_RS
for symbol in \
  eye_mode \
  custom_eye_left_r custom_eye_left_g custom_eye_left_b \
  custom_eye_right_r custom_eye_right_g custom_eye_right_b \
  eye_rate_25ms eye_brightness; do
  grep -Fq "static uint32_t ${symbol}" "${LIGHTGENES_C}" || {
    echo "BIO control is not word-aligned in main.c: ${symbol}" >&2
    exit 1
  }
  grep -Fq "rodata: ${symbol} (4 entries, 1 words)" "${LIGHTGENES_RS}" || {
    echo "Generated BIO control layout is unsafe: ${symbol}" >&2
    exit 1
  }
done
grep -Fq "unaligned .set aliases" "${BUILD_ROOT}/dc34-console/src/bio/clang2rustasm.py" || {
  echo "BIO converter is missing the unaligned-alias safety check" >&2
  exit 1
}
grep -Fq "*mrna as u32 | 0x4000_0000" "${BUILD_ROOT}/dc34-console/src/bio/lightgenes/mod.rs" || {
  echo "Forced ring pattern is missing the BIO write tag" >&2
  exit 1
}
grep -Fq "Diploid([pattern, pattern]).send(self.led_server, LedManagerOp::SetGene" "${BUILD_ROOT}/dc34-vault/src/config.rs" || {
  echo "Custom ring pattern is not using the stock SetGene transport" >&2
  exit 1
}
grep -Fq "let exact_phenotype = gene.0[0].serialize() == gene.0[1].serialize()" "${BUILD_ROOT}/dc34-console/src/leds.rs" || {
  echo "Console is missing the exact custom phenotype marker" >&2
  exit 1
}
if grep -Fq "animation_speed_percent" "${LIGHTGENES_C}"; then
  echo "Retired runtime speed multiplier is still present in the BIO engine" >&2
  exit 1
fi

echo "==> Installing the matching Xous target and build tools"
(
  cd -- "${BUILD_ROOT}/xous-core"
  cargo "+${RUST_TOOLCHAIN}" xtask install-toolkit
)

echo "==> Building the DC34 LED console"
cargo "+${RUST_TOOLCHAIN}" build \
  --manifest-path "${BUILD_ROOT}/dc34-console/Cargo.toml" \
  --release \
  --target "${XOUS_TARGET}" \
  --features board-baosec \
  --features oem-baosec-lite \
  --features bao1x \
  --features utralib/bao1x

echo "==> Building the patched DC34 vault"
cargo "+${RUST_TOOLCHAIN}" build \
  --manifest-path "${BUILD_ROOT}/dc34-vault/Cargo.toml" \
  --release \
  --target "${XOUS_TARGET}" \
  --features board-baosec

echo "==> Packing and developer-signing the complete badge firmware"
(
  cd -- "${BUILD_ROOT}/xous-core"
  cargo "+${RUST_TOOLCHAIN}" xtask baosec-lite \
    "${BUILD_ROOT}/dc34-console/target/${XOUS_TARGET}/release/dc34-console~flash" \
    "${BUILD_ROOT}/dc34-vault/target/${XOUS_TARGET}/release/dc34-vault" \
    --no-timestamp \
    --feature usb \
    --kernel-feature debug-proc \
    --no-verify
)

ARTIFACT_ROOT="${BUILD_ROOT}/xous-core/target/${XOUS_TARGET}/release"
for artifact in loader.uf2 xous.uf2 swap.uf2; do
  if [[ ! -s "${ARTIFACT_ROOT}/${artifact}" ]]; then
    echo "Expected artifact was not produced: ${artifact}" >&2
    exit 1
  fi
  install -m 0644 "${ARTIFACT_ROOT}/${artifact}" "${OUTPUT_DIR}/${artifact}"
  uf2_description="$(file -b "${OUTPUT_DIR}/${artifact}")"
  if [[ "${uf2_description}" != *"UF2 firmware image, family 0xa7d76373"* ]]; then
    echo "Artifact does not identify as a DC34/Baochip UF2 image: ${artifact}" >&2
    echo "${uf2_description}" >&2
    exit 1
  fi
done

{
  echo "DC34 BadgeBloom firmware build"
  echo "BadgeBloom commit: $(git -C "${REPO_ROOT}" rev-parse HEAD)"
  echo "Rust: ${RUST_TOOLCHAIN}"
  echo "dc34-api: ${DC34_API_COMMIT}"
  echo "dc34-console: ${DC34_CONSOLE_COMMIT}"
  echo "dc34-vault: ${DC34_VAULT_COMMIT}"
  echo "xous-core: ${XOUS_COMMIT}"
  echo "Console patch SHA-256: $(sha256sum "${CONSOLE_PATCH_FILE}" | cut -d' ' -f1)"
  echo "Console functional patch SHA-256: $(sha256sum "${CONSOLE_FUNCTIONAL_PATCH_FILE}" | cut -d' ' -f1)"
  echo "Vault patch SHA-256: $(sha256sum "${VAULT_PATCH_FILE}" | cut -d' ' -f1)"
  echo "Vault functional patch SHA-256: $(sha256sum "${VAULT_FUNCTIONAL_PATCH_FILE}" | cut -d' ' -f1)"
  echo "Xous IniS NOCOPY patch SHA-256: $(sha256sum "${XOUS_SWAP_PATCH_FILE}" | cut -d' ' -f1)"
  echo "Xous rocker hold patch SHA-256: $(sha256sum "${XOUS_ROCKER_PATCH_FILE}" | cut -d' ' -f1)"
  echo "Diagnostic loader: ${DIAGNOSTIC_LOADER}"
  if [[ "${DIAGNOSTIC_LOADER}" == 1 ]]; then
    echo "Diagnostic loader patch SHA-256: $(sha256sum "${DIAGNOSTIC_LOADER_PATCH_FILE}" | cut -d' ' -f1)"
  fi
  echo "Signing: public Xous developer key"
} > "${OUTPUT_DIR}/BUILD-MANIFEST.txt"

(
  cd -- "${OUTPUT_DIR}"
  sha256sum loader.uf2 xous.uf2 swap.uf2 > SHA256SUMS.txt
)

echo "==> Firmware ready in ${OUTPUT_DIR}"
ls -lh "${OUTPUT_DIR}/loader.uf2" "${OUTPUT_DIR}/xous.uf2" "${OUTPUT_DIR}/swap.uf2"
