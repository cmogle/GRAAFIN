#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "Missing VERCEL_TOKEN. Export it first, then re-run this command." >&2
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "Vercel CLI is not installed." >&2
  exit 1
fi

# Fast preflight: fail early with clear DNS/network error before running a mutating command.
if ! curl -sS -o /dev/null "https://api.vercel.com/v2/user?token=${VERCEL_TOKEN}" ; then
  echo "Cannot reach api.vercel.com (DNS/network issue). Retry when connectivity is restored." >&2
  exit 1
fi

exec vercel "$@" --token "${VERCEL_TOKEN}"
