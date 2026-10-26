#!/usr/bin/env bash
# layer3-review.sh -- T-0569: nightly entry for the layer-3 catalog re-review. No model logic here;
# see layer3_review.py. Scheduled by the operator: 30 2 * * * <this file> >> ~/apibase/scripts/moderation/logs/cron.log 2>&1
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 -I "$HERE/layer3_review.py" "$@"
