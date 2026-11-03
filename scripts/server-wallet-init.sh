#!/usr/bin/env bash
# T-0553 (REFUND-WALLET-1026, operator decision 2 = B): generate one wallet key ON THE SERVER, store it
# only in ~/apibase/.env and print only its ADDRESS. Run by hand, once per rail, as `apibase` in an
# interactive shell, on the operator's written order. Never from a card, CI, cron or taskloop.
# Generic: 0655 reuses it for UPSTREAM_PAYER_KEY_*.
#
#   scripts/server-wallet-init.sh <ENV_NAME> <base|tempo>
#
# There is no replace flag by design: replacing a funded key is a hand ceremony.
set -euo pipefail
set +x
umask 077

NAME="${1:-}"
RAIL="${2:-}"
if [[ ! "$NAME" =~ ^[A-Z][A-Z0-9_]*$ ]] || [[ "$RAIL" != "base" && "$RAIL" != "tempo" ]]; then
  echo "usage: $0 <ENV_NAME> <base|tempo>" >&2
  exit 64
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${APIBASE_ENV_FILE:-$HOME/apibase/.env}"
RECORD="${REFUND_WALLET_RECORD:-$HOME/apibase/.server-wallets.json}"
ENV_DIR="$(dirname "$ENV_FILE")"

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
else
  echo "fund: send USDC.e only to $ADDR on Tempo (chain 4217); the fee is paid in the same token"
fi
echo "then restart the worker; GET /health/refund-wallet must show key: ok"
