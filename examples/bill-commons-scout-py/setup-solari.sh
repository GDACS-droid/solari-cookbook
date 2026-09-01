#!/usr/bin/env bash
# Writes only an ignored local dotenv file. It never prints the supplied key.
set -euo pipefail

example_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "$example_dir" rev-parse --show-toplevel)"
env_file="$example_dir/.env.local"
relative_path="${env_file#"$repo_root"/}"

if git -C "$repo_root" ls-files --error-unmatch -- "$relative_path" >/dev/null 2>&1; then
  printf '%s\n' "Refusing to overwrite a tracked file." >&2
  exit 1
fi
if ! git -C "$repo_root" check-ignore -q -- "$relative_path"; then
  printf '%s\n' "Refusing to write a file that is not ignored by Git." >&2
  exit 1
fi

read -r -s -p "Solari API key: " solari_key
printf '\n'
if [[ -z "$solari_key" || "$solari_key" == *$'\n'* || "$solari_key" == *$'\r'* ]]; then
  printf '%s\n' "No valid key supplied; nothing was written." >&2
  unset solari_key
  exit 1
fi

umask 077
temp_file="$(mktemp "$example_dir/.env.local.XXXXXX")"
if [[ -f "$env_file" ]]; then
  awk '!/^[[:space:]]*SOLARI_API_KEY[[:space:]]*=/' "$env_file" > "$temp_file"
fi
printf 'SOLARI_API_KEY=%s\n' "$solari_key" >> "$temp_file"
chmod 600 "$temp_file"
mv "$temp_file" "$env_file"
unset solari_key
printf '%s\n' "Saved SOLARI_API_KEY to ignored .env.local."
