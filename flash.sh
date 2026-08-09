#!/usr/bin/env bash
set -Eeuo pipefail

readonly REPOSITORY="atcasanova/DEFCON-34-badge-firmware"
readonly BADGE_LABEL="BAOCHIP"
readonly UF2_FAMILY="0xa7d76373"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly ARTIFACTS=(loader.uf2 xous.uf2 swap.uf2)

SOURCE_DIR=""
MOUNT_OVERRIDE=""
KEEP_MOUNTED=0
FLASH_TEMP_DIR=""

usage() {
  printf '%s\n' \
    "Usage: ./flash.sh [--source DIRECTORY] [--mount DIRECTORY] [--keep-mounted]" \
    "" \
    "Flashes the three matched BadgeBloom UF2 images to a mounted BAOCHIP volume." \
    "Local artifacts are preferred; otherwise the latest GitHub release is downloaded." \
    "" \
    "  --source DIR     Read UF2 files and SHA256SUMS from DIR." \
    "  --mount DIR      Select one mounted BAOCHIP volume when more than one exists." \
    "  --keep-mounted   Sync but do not unmount the badge after copying." \
    "  -h, --help       Show this help."
}

fail() {
  local message="$1"
  local status="${2:-1}"
  printf 'BadgeBloom flash: %s\n' "${message}" >&2
  exit "${status}"
}

cleanup() {
  if [[ -n "${FLASH_TEMP_DIR}" && -d "${FLASH_TEMP_DIR}" ]]; then
    rm -r -- "${FLASH_TEMP_DIR}"
  fi
}
trap cleanup EXIT

while (($#)); do
  case "$1" in
    --source)
      (($# >= 2)) || fail "--source needs a directory"
      SOURCE_DIR="$2"
      shift 2
      ;;
    --mount)
      (($# >= 2)) || fail "--mount needs a directory"
      MOUNT_OVERRIDE="$2"
      shift 2
      ;;
    --keep-mounted)
      KEEP_MOUNTED=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

run_as_admin() {
  if ((EUID == 0)); then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    fail "missing dependencies and sudo is unavailable; install curl, jq, coreutils, file, util-linux, and udisks2"
  fi
}

install_dependencies() {
  local dependency
  local -a missing=()
  for dependency in awk basename cp curl file find findmnt head jq lsblk mktemp readlink rm sed sha256sum sort stat sync udisksctl; do
    command -v "${dependency}" >/dev/null 2>&1 || missing+=("${dependency}")
  done
  ((${#missing[@]} == 0)) && return

  printf 'Installing missing dependencies: %s\n' "${missing[*]}"
  if command -v apt-get >/dev/null 2>&1; then
    run_as_admin apt-get update
    run_as_admin apt-get install -y curl jq coreutils file findutils gawk sed util-linux udisks2
  elif command -v dnf >/dev/null 2>&1; then
    run_as_admin dnf install -y curl jq coreutils file findutils gawk sed util-linux udisks2
  elif command -v yum >/dev/null 2>&1; then
    run_as_admin yum install -y curl jq coreutils file findutils gawk sed util-linux udisks2
  elif command -v pacman >/dev/null 2>&1; then
    run_as_admin pacman -Sy --needed --noconfirm curl jq coreutils file findutils gawk sed util-linux udisks2
  elif command -v zypper >/dev/null 2>&1; then
    run_as_admin zypper --non-interactive install curl jq coreutils file findutils gawk sed util-linux udisks2
  elif command -v apk >/dev/null 2>&1; then
    run_as_admin apk add curl jq coreutils file findutils gawk sed util-linux udisks2
  else
    fail "unsupported package manager; install curl, jq, coreutils, file, util-linux, and udisks2"
  fi

  for dependency in awk basename cp curl file find findmnt head jq lsblk mktemp readlink rm sed sha256sum sort stat sync udisksctl; do
    command -v "${dependency}" >/dev/null 2>&1 || fail "dependency installation did not provide ${dependency}"
  done
}

badge_rows() {
  lsblk --json --paths --output PATH,LABEL,MOUNTPOINTS | jq -r --arg badge_label "${BADGE_LABEL}" '
    .. | objects | select(.label? == $badge_label) |
    [.path, ((.mountpoints // []) | map(select(. != null and . != "")) | .[0] // "")] | @tsv
  '
}

select_badge() {
  local requested_mount requested_target requested_device requested_label
  local -a rows=()

  if [[ -n "${MOUNT_OVERRIDE}" ]]; then
    [[ -d "${MOUNT_OVERRIDE}" ]] || fail "mount directory does not exist: ${MOUNT_OVERRIDE}"
    requested_mount="$(readlink -f -- "${MOUNT_OVERRIDE}")"
    requested_target="$(findmnt -rn -T "${requested_mount}" -o TARGET | head -n 1)"
    requested_device="$(findmnt -rn -T "${requested_mount}" -o SOURCE | head -n 1)"
    [[ -n "${requested_target}" && "$(readlink -f -- "${requested_target}")" == "${requested_mount}" ]] ||
      fail "--mount must be the root of a mounted filesystem"
    requested_label="$(lsblk -dn -o LABEL -- "${requested_device}" | sed -n '1{s/^[[:space:]]*//;s/[[:space:]]*$//;p;}')"
    [[ "${requested_label}" == "${BADGE_LABEL}" ]] ||
      fail "refusing ${requested_mount}: its volume label is '${requested_label:-none}', not ${BADGE_LABEL}"
    printf '%s\t%s\n' "${requested_device}" "${requested_mount}"
    return
  fi

  mapfile -t rows < <(badge_rows)
  ((${#rows[@]} > 0)) || fail "no BAOCHIP volume found; hold any badge button while connecting USB and confirm Update mode" 2
  ((${#rows[@]} == 1)) || fail "multiple BAOCHIP volumes found; select one with --mount"

  local badge_device badge_mount
  IFS=$'\t' read -r badge_device badge_mount <<<"${rows[0]}"
  if [[ -z "${badge_mount}" ]]; then
    printf 'Found %s but it is not mounted; mounting it now.\n' "${badge_device}" >&2
    udisksctl mount -b "${badge_device}" >/dev/null
    badge_mount="$(findmnt -rn -S "${badge_device}" -o TARGET | head -n 1)"
  fi
  [[ -n "${badge_mount}" && -d "${badge_mount}" ]] || fail "BAOCHIP was found but could not be mounted"
  printf '%s\t%s\n' "${badge_device}" "${badge_mount}"
}

has_artifacts() {
  local directory="$1"
  local artifact
  for artifact in "${ARTIFACTS[@]}"; do
    [[ -f "${directory}/${artifact}" ]] || return 1
  done
}

find_checksum_file() {
  local directory="$1"
  local candidate
  if [[ -f "${directory}/SHA256SUMS.txt" ]]; then
    printf '%s\n' "${directory}/SHA256SUMS.txt"
    return
  fi
  while IFS= read -r candidate; do
    printf '%s\n' "${candidate}"
    return
  done < <(find "${directory}" -maxdepth 1 -type f -name 'dc34-badgebloom-firmware-*-SHA256SUMS.txt' -print | sort)
}

download_latest_release() {
  local release_json release_tag release_base checksum_name artifact
  FLASH_TEMP_DIR="$(mktemp -d -t badgebloom-flash.XXXXXXXX)"
  release_json="$(curl --fail --silent --show-error --location --retry 3 \
    -H 'Accept: application/vnd.github+json' \
    -H 'User-Agent: BadgeBloom-flash-script' \
    "https://api.github.com/repos/${REPOSITORY}/releases/latest")"
  release_tag="$(jq -er '.tag_name' <<<"${release_json}")" || fail "GitHub did not return a release tag"
  release_base="https://github.com/${REPOSITORY}/releases/download/${release_tag}"
  checksum_name="dc34-badgebloom-firmware-${release_tag}-SHA256SUMS.txt"

  printf 'Downloading BadgeBloom %s...\n' "${release_tag}" >&2
  for artifact in "${ARTIFACTS[@]}"; do
    curl --fail --silent --show-error --location --retry 3 \
      "${release_base}/${artifact}" -o "${FLASH_TEMP_DIR}/${artifact}"
  done
  curl --fail --silent --show-error --location --retry 3 \
    "${release_base}/${checksum_name}" -o "${FLASH_TEMP_DIR}/SHA256SUMS.txt"
  SOURCE_DIR="${FLASH_TEMP_DIR}"
}

verify_artifacts() {
  local directory="$1"
  local checksum_file="$2"
  local artifact listed size description
  [[ -n "${checksum_file}" && -f "${checksum_file}" ]] || fail "no firmware SHA256SUMS file found in ${directory}"

  for artifact in "${ARTIFACTS[@]}"; do
    [[ -f "${directory}/${artifact}" ]] || fail "missing ${artifact} in ${directory}"
    listed="$(awk -v target="${artifact}" '{ name=$2; sub(/^\*/, "", name); if (name == target) print $1 }' "${checksum_file}")"
    [[ "${listed}" =~ ^[0-9a-fA-F]{64}$ ]] || fail "${artifact} is not covered by ${checksum_file}"
  done

  (cd -- "${directory}" && sha256sum -c --strict "$(basename -- "${checksum_file}")")
  for artifact in "${ARTIFACTS[@]}"; do
    size="$(stat -c '%s' -- "${directory}/${artifact}")"
    ((size >= 512 && size % 512 == 0)) || fail "${artifact} does not have a valid UF2 block size"
    description="$(file -b -- "${directory}/${artifact}")"
    [[ "${description,,}" == *"uf2 firmware image"*"family ${UF2_FAMILY}"* ]] ||
      fail "${artifact} is not a Baochip ${UF2_FAMILY} UF2 image: ${description}"
  done
}

install_dependencies

badge_selection="$(select_badge)"
IFS=$'\t' read -r badge_device badge_mount <<<"${badge_selection}"
[[ -w "${badge_mount}" ]] || fail "BAOCHIP mount is not writable: ${badge_mount}"

if [[ -n "${SOURCE_DIR}" ]]; then
  SOURCE_DIR="$(readlink -f -- "${SOURCE_DIR}")"
  [[ -d "${SOURCE_DIR}" ]] || fail "source directory does not exist: ${SOURCE_DIR}"
elif has_artifacts "${SCRIPT_DIR}/firmware-build"; then
  SOURCE_DIR="${SCRIPT_DIR}/firmware-build"
  printf 'Using locally built firmware from %s.\n' "${SOURCE_DIR}"
elif has_artifacts "${SCRIPT_DIR}"; then
  SOURCE_DIR="${SCRIPT_DIR}"
  printf 'Using firmware beside flash.sh.\n'
else
  download_latest_release
fi

checksum_file="$(find_checksum_file "${SOURCE_DIR}")"
verify_artifacts "${SOURCE_DIR}" "${checksum_file}"

printf 'Flashing verified firmware to %s (%s)...\n' "${badge_mount}" "${badge_device}"
for artifact in "${ARTIFACTS[@]}"; do
  printf '  copying %s\n' "${artifact}"
  cp -- "${SOURCE_DIR}/${artifact}" "${badge_mount}/${artifact}"
done
sync -f "${badge_mount}" 2>/dev/null || sync

if ((KEEP_MOUNTED == 0)); then
  if udisksctl unmount -b "${badge_device}" >/dev/null; then
    printf 'Safely unmounted %s.\n' "${badge_device}"
  else
    printf 'Firmware copied and synced, but automatic unmount failed. Eject %s manually before continuing.\n' \
      "${badge_mount}" >&2
  fi
else
  printf 'Firmware copied and synced; --keep-mounted left the badge mounted.\n'
fi

printf '%s\n' \
  "Flash complete." \
  "While the badge remains powered, press any badge button to finalize the update and boot."
