#!/usr/bin/env bash
# T-0553 (REFUND-WALLET-1026, operator decision 2 = B): generate one wallet key ON THE SERVER, store it
# only in ~/apibase/.env and print only its ADDRESS. Run by hand, once per rail or lane, as `apibase` in an
# interactive shell, on the operator's written order. Never from a card, CI, cron or taskloop.
# Generic: 0655 reuses it for UPSTREAM_PAYER_KEY_*.
#
#   scripts/server-wallet-init.sh <ENV_NAME> <base|tempo|genlayer>
#
# There is no replace flag by design: replacing a funded key is a hand ceremony.
set -euo pipefail
set +x
umask 077

NAME="${1:-}"
RAIL="${2:-}"
if [[ ! "$NAME" =~ ^[A-Z][A-Z0-9_]*$ ]] || [[ "$RAIL" != "base" && "$RAIL" != "tempo" && "$RAIL" != "genlayer" ]]; then
  echo "usage: $0 <ENV_NAME> <base|tempo|genlayer>" >&2
  exit 64
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${APIBASE_ENV_FILE:-$HOME/apibase/.env}"
ENV_DIR="$(dirname "$ENV_FILE")"
RECORD="${REFUND_WALLET_RECORD:-$ENV_DIR/wallets/server-wallets.json}"
RECORD_DIR="$(dirname "$RECORD")"

# T-0698: check the record directory BEFORE any change to the env file. It is mounted read-only into
# api and worker, so it must be traversable (755) and writable by the user running this script.
# A directory that already exists is left as it is (never loosened); a new one is created 755 despite umask 077.
if [[ ! -d "$RECORD_DIR" ]]; then
  mkdir -p -m 755 "$RECORD_DIR" 2>/dev/null || true
  chmod 755 "$RECORD_DIR" 2>/dev/null || true
fi
if [[ ! -d "$RECORD_DIR" || ! -w "$RECORD_DIR" ]]; then
  echo "record directory $RECORD_DIR is not writable; create it as the user running this script (Docker creates a missing bind source as root) and run again" >&2
  exit 3
fi

if { [[ -f "$ENV_FILE" ]] && grep -Eq "^${NAME}=" "$ENV_FILE"; } \
  || { [[ -f "$RECORD" ]] && grep -Eq "\"name\": *\"${NAME}\"" "$RECORD"; }; then
  echo "key exists; replacing a funded key is a hand ceremony: sweep the balance by hand, delete the .env line and the record by hand, run again" >&2
  exit 2
fi

TMPKEY="$ENV_DIR/.env.keytmp.$$"
ENV_TMP="$ENV_FILE.tmp"
cleanup() {
  if [[ -e "$TMPKEY" ]]; then
    if command -v shred >/dev/null 2>&1; then shred -u "$TMPKEY"; else rm -f "$TMPKEY"; fi
  fi
  rm -f "$ENV_TMP"
}
trap cleanup EXIT

ADDR="$(node "$HERE/server-wallet-init.mjs" gen "$NAME" "$TMPKEY")"

if [[ -f "$ENV_FILE" ]]; then cp "$ENV_FILE" "$ENV_TMP"; else : >"$ENV_TMP"; fi
chmod 600 "$ENV_TMP"
if [[ -s "$ENV_TMP" && -n "$(tail -c1 "$ENV_TMP")" ]]; then echo >>"$ENV_TMP"; fi
cat "$TMPKEY" >>"$ENV_TMP"
mv "$ENV_TMP" "$ENV_FILE"
chmod 600 "$ENV_FILE"

node "$HERE/server-wallet-init.mjs" record "$RECORD" "$NAME" "$RAIL" "$ADDR"

echo "address: $ADDR"
if [[ "$RAIL" == "base" ]]; then
  echo "fund: send USDC only to $ADDR on Base (chain 8453); no ETH needed, gas comes from the operator wallet"
elif [[ "$RAIL" == "genlayer" ]]; then
  echo "fund: send at least 5 test GEN from https://testnet-faucet.genlayer.foundation/ to $ADDR on GenLayer Bradbury Phase 2 (chain 4221); test GEN is not money; balance: https://scan.bradbury.genlayer.com/address/$ADDR"
else
  echo "fund: send USDC.e only to $ADDR on Tempo (chain 4217); the fee is paid in the same token"
fi
echo "the directory is mounted read-only into api and worker at /app/wallets; recreate both containers if the directory did not exist before they started"
if [[ "$RAIL" == "genlayer" ]]; then
  echo "then recreate the worker (docker compose up -d --no-deps worker); the lane stays off until GL_DISPUTE_CONTRACT is set"
else
  echo "then restart the worker; GET /health/refund-wallet must show key: ok"
fi
