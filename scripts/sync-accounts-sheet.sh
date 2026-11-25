#!/bin/bash
# Append new OmniCRM accounts (staff logins + signups) to the live "OmniCRM Accounts & Logins" sheet.
# Runs on a host crontab every 15 min. Idempotent: acked rows are never re-sent.
SECRET='omnicrm-sync-local'
SHEET_ID='1U6I51McNhmCjfA5lkcUaoT01hXdQ4INwKTMZlN2oPcw'
COMPOSIO="$HOME/.local/bin/composio"
PY=/usr/bin/python3
API=http://localhost:4200

TODAY=$(date +%F)
ROWS=$($PY - <<PYEOF
import json, urllib.request
req = urllib.request.Request('$API/internal/sync-queue')
req.add_header('x-sync-secret', '$SECRET')
try:
    with urllib.request.urlopen(req, timeout=10) as r:
        print(json.dumps(json.load(r).get('rows', [])))
except Exception:
    print('[]')
PYEOF
)

COUNT=$($PY -c "import json,sys; print(len(json.loads(sys.argv[1])))" "$ROWS")
[ "$COUNT" = "0" ] && exit 0

NEXT=$($COMPOSIO execute GOOGLESHEETS_BATCH_GET -d "{\"spreadsheet_id\": \"$SHEET_ID\", \"ranges\": [\"Sheet1!A1:G500\"]}" 2>/dev/null | $PY -c "
import json, sys
try:
    d = json.load(sys.stdin)
    vals = d.get('data', {}).get('valueRanges', [{}])[0].get('values', [])
    print(len(vals) + 1)
except Exception:
    print(1)
")

VALUES=$($PY - "$ROWS" "$TODAY" <<'PYEOF'
import json, sys
rows, today = json.loads(sys.argv[1]), sys.argv[2]
out = []
for r in rows:
    if r.get('kind') == 'staff_login':
        dept = (r.get('dept') or 'sales').strip().title()
        out.append([
            f"Staff - {dept}",
            r.get('email', ''),
            r.get('password', ''),
            r.get('org', 'OmniCRM'),
            f"Dept: {dept} · {r.get('role') or 'Staff'}",
            'ACTIVE',
            today,
        ])
    else:
        out.append([
            'Other signups',
            r.get('email', ''),
            r.get('password', ''),
            r.get('org', ''),
            'Organic signup',
            'ACTIVE',
            today,
        ])
print(json.dumps(out))
PYEOF
)

$COMPOSIO execute GOOGLESHEETS_UPDATE_VALUES_BATCH -d "$($PY - "$VALUES" "$NEXT" <<'PYEOF'
import json, sys
values, next_row = json.loads(sys.argv[1]), int(sys.argv[2])
last = next_row + len(values) - 1
rng = f"Sheet1!A{next_row}:G{last}"
print(json.dumps({
    "spreadsheet_id": "1U6I51McNhmCjfA5lkcUaoT01hXdQ4INwKTMZlN2oPcw",
    "valueInputOption": "RAW",
    "data": [{"range": rng, "values": values}],
}))
PYEOF
)" >/dev/null 2>&1

$PY - "$ROWS" <<'PYEOF'
import json, sys, urllib.request
rows = json.loads(sys.argv[1])
ids = [r['id'] for r in rows]
req = urllib.request.Request('http://localhost:4200/internal/sync-queue/ack', method='POST')
req.add_header('Content-Type', 'application/json')
req.add_header('x-sync-secret', 'omnicrm-sync-local')
try:
    with urllib.request.urlopen(req, data=json.dumps({'ids': ids}).encode(), timeout=10) as r:
        print('synced', len(ids), 'account rows')
except Exception as e:
    print('ack failed:', e)
PYEOF
