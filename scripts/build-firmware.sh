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
PATCH_FILE="${REPO_ROOT}/firmware/dc34-badgebloom-firmware.patch"

for command in cargo curl file git rustc rustup sha256sum; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Missing required command: ${command}" >&2
    exit 1
  fi
done

if [[ ! -f "${PATCH_FILE}" ]]; then
  echo "Firmware patch not found: ${PATCH_FILE}" >&2
  exit 1
fi

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

echo "==> Applying BadgeBloom firmware patch"
git -C "${BUILD_ROOT}/dc34-vault" apply --check "${PATCH_FILE}"
git -C "${BUILD_ROOT}/dc34-vault" apply "${PATCH_FILE}"

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
  echo "Firmware patch SHA-256: $(sha256sum "${PATCH_FILE}" | cut -d' ' -f1)"
  echo "Signing: public Xous developer key"
} > "${OUTPUT_DIR}/BUILD-MANIFEST.txt"

(
  cd -- "${OUTPUT_DIR}"
  sha256sum loader.uf2 xous.uf2 swap.uf2 > SHA256SUMS.txt
)

echo "==> Firmware ready in ${OUTPUT_DIR}"
ls -lh "${OUTPUT_DIR}/loader.uf2" "${OUTPUT_DIR}/xous.uf2" "${OUTPUT_DIR}/swap.uf2"
