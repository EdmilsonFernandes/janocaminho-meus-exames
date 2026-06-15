#!/usr/bin/env bash
set -u
cd "C:/Users/esantos/Desktop/Exame Edmilson"
API=http://localhost:4001/api
TOKEN=$(curl -s -X POST $API/auth/login -H "Content-Type: application/json" \
  -d '{"username":"edmilson@exemplo.com","password":"troque123"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
echo "[$(date +%H:%M:%S)] token ok"

classify() {
  local t
  t=$(pdftotext -enc UTF-8 -l 2 "$1" - 2>/dev/null | head -c 4000 | tr '[:lower:]' '[:upper:]')
  if echo "$t" | grep -qE 'TOMOGRAFI|RESSON|ULTRASSON|ECOGRAF|LAUDO|ELETROCARDIO|ECG|RADIOGRAF|MAMOGRAF'; then
    echo "IMAGING"
  else
    echo "LAB_PANEL"
  fi
}

for pdf in samples/*.pdf; do
  name=$(basename "$pdf")
  kind=$(classify "$pdf")
  echo "[$(date +%H:%M:%S)] >>> $name (kind=$kind)"
  RESP=$(curl -s -X POST $API/exams -H "Authorization: Bearer $TOKEN" \
    -F "file=@$pdf" -F "title=$name" -F "kind=$kind")
  EID=$(echo "$RESP" | python -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  if [ -z "$EID" ]; then echo "    falha upload: $RESP"; continue; fi
  S=""
  for i in $(seq 1 40); do
    S=$(curl -s "$API/exams/$EID" -H "Authorization: Bearer $TOKEN" | python -c "import sys,json;print(json.load(sys.stdin)['status'])" 2>/dev/null)
    { [ "$S" = "EXTRACTED" ] || [ "$S" = "FAILED" ]; } && break
    sleep 5
  done
  curl -s "$API/exams/$EID" -H "Authorization: Bearer $TOKEN" | python -c "
import sys,json
d=json.load(sys.stdin)
n=len(d.get('items',[]))
err=d.get('extractionError') or ''
print('    -> '+d['status']+' | kind='+d['kind']+' | itens='+str(n)+(' | ERRO: '+err[:120] if err else ''))
"
done

echo "[$(date +%H:%M:%S)] ===== TODOS OS EXAMES NO SISTEMA ====="
curl -s "$API/exams?_start=0&_end=50" -H "Authorization: Bearer $TOKEN" | python -c "
import sys,json
for e in json.load(sys.stdin):
    print(f\"- {e['title'][:45]:45} | {e['status']:9} | {e['kind']}\")
"
echo "[$(date +%H:%M:%S)] FIM"
