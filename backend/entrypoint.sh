#!/usr/bin/env sh
set -e

if [ -z "$TEAMMATE_PREFS_KEY" ]; then
  echo "ERROR: TEAMMATE_PREFS_KEY is not set." >&2
  echo "Generate one with:" >&2
  echo "  python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"" >&2
  echo "Then export TEAMMATE_PREFS_KEY or add it to your env file." >&2
  exit 1
fi

exec "$@"
