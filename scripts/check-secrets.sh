#!/usr/bin/env bash
# Rà key — phần kiểm được offline của T-5.5. Không gọi API, không cần key.
# Chạy: bash scripts/check-secrets.sh
#
# Mỗi mẫu phải bỏ qua chú thích. Không lọc thì mỗi lần thêm giải thích vào code
# sẽ báo động giả — và một báo động giả dẫn tới việc bỏ qua cả báo động thật.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0

# `grep -rn` ghi tiền tố "tệp:dòng:", nên dấu nhận dạng chú thích phải nằm SAU tiền tố.
COMMENT='^[^:]*:[0-9]+:[[:space:]]*(//|\*|/\*)'
note() { printf '%s\n' "$*"; }

# expect_absent <mô tả> <đường dẫn> <mẫu ERE> — mẫu KHÔNG được xuất hiện.
expect_absent() {
  local label="$1" path="$2" pattern="$3" hits
  hits=$(grep -rnE "$pattern" $path 2>/dev/null | grep -vE "$COMMENT" || true)
  if [ -n "$hits" ]; then
    fail=$((fail+1)); note "LOI  $label"; note "$hits" | sed 's/^/        /'
  else
    note "OK   $label"
  fi
}

# expect_absent_n <mô tả> <đường dẫn> <mẫu ERE> <số lần tối đa>
expect_absent_n() {
  local label="$1" path="$2" pattern="$3" max="$4" n
  n=$(grep -rnE "$pattern" $path 2>/dev/null | grep -vcE "$COMMENT" || true)
  if [ "$n" -gt "$max" ]; then
    fail=$((fail+1)); note "LOI  $label (${n} lần, tối đa $max)"
  else
    note "OK   $label ($n lần)"
  fi
}

# expect_in <mô tả> <đường dẫn> <mẫu ERE> — mẫu PHẢI xuất hiện.
expect_in() {
  local label="$1" path="$2" pattern="$3"
  if grep -rqE "$pattern" $path 2>/dev/null; then note "OK   $label"
  else fail=$((fail+1)); note "LOI  $label — không thấy mẫu"; fi
}

# block <mô tả> <tệp> <tên interface> — in nội dung một khối khai báo.
block() { awk -v b="$3" 'index($0,"interface " b){i=1} i{print} i&&/^\}/{exit}' "$2"; }

note "=== 1. Server không đọc key từ process.env ==="
# Nếu adapter đọc env, người quên dán key sẽ âm thầm dùng key của chủ dự án —
# request vẫn thành công, chỉ là hoá đơn rơi vào tài khoản của chủ dự án.
expect_absent "không đọc process.env.<BIẾN>"     "src/lib" 'process\.env\.[A-Za-z_]'
expect_absent "không destructure process.env"    "src/lib" '(const|let|var)[[:space:]]*\{[^}]*\}[[:space:]]*=[[:space:]]*process\.env'
expect_absent "không đưa process.env cho client" "src/lib" 'apiKey[[:space:]]*:[[:space:]]*process\.env'

note ""
note "=== 2. Key chỉ nằm trong ProviderAuth, không trong AiConfig ==="
# AiConfig đi vào body request và localStorage; một trường key ở đó rất dễ bị lộ.
if block "" src/lib/providers/types.ts AiConfig | grep -qE 'apiKey'; then
  fail=$((fail+1)); note "LOI  interface AiConfig chứa apiKey"
else
  note "OK   interface AiConfig không có apiKey"
fi
if block "" src/lib/providers/types.ts ProviderAuth | grep -qE 'apiKey'; then
  note "OK   interface ProviderAuth có apiKey (đúng thiết kế)"
else
  fail=$((fail+1)); note "LOI  interface ProviderAuth thiếu apiKey"
fi

note ""
note "=== 3. Key chỉ đi qua header, không qua body hay query string ==="
body_hits=$(grep -rhoE 'JSON\.stringify\([^;]*' src/lib | grep -E 'apiKey' || true)
if [ -n "$body_hits" ]; then
  fail=$((fail+1)); note "LOI  thân request chứa apiKey"; note "$body_hits" | sed 's/^/        /'
else
  note "OK   không thân request nào chứa apiKey"
fi
expect_absent "guard không nối key vào query string" "src/lib/providers/outbound-guard.ts" \
  'url\.(searchParams|search)[[:space:]]*\+?=[^;]*(apiKey|key)'
expect_absent_n "header Authorization đặt đúng một chỗ" \
  "src/lib/providers/outbound-guard.ts" 'Authorization[[:space:]]*:' 1

note ""
note "=== 4. Đường direct không kéo code server vào bundle trình duyệt ==="
note "     import của src/lib/direct:"; grep -rhoE 'from "[^"]*"' src/lib/direct | sort -u | sed 's/^/       /'
expect_absent "không import server adapter"  "src/lib/direct" 'from "\.\./providers/(anthropic|openai|gemini|custom)"'
expect_absent "không import outbound-guard" "src/lib/direct" 'outbound-guard'
expect_absent "không import registry server" "src/lib/direct" 'from "\.\./providers/registry"'
expect_absent "không import node: builtins"  "src/lib/direct" 'from "node:'

note ""
note "=== 5. Module đi vào bundle trình duyệt không được import SDK ==="
# `zod` là dependency thuần của trình duyệt nên được phép; chỉ SDK hãng mô hình bị cấm.
for f in src/lib/providers/capabilities.ts src/lib/providers/types.ts src/lib/usage.ts \
         src/lib/schemas.ts src/lib/interview.ts; do
  expect_absent "$(basename "$f") không import SDK" "$f" '^import .*from "(@anthropic-ai|openai|@google/genai)'
done
# `capabilities.ts` nằm trong đồ thị import của trình duyệt; nó không được biết tới
# cả SDK lẫn `interview.ts` (module cùng nằm trong đồ thị đó) — nếu không,
# `interview.ts` kéo cả `../prompts` và cả logic layout vào bundle người dùng.
expect_absent "capabilities.ts không biết tới interview" "src/lib/providers/capabilities.ts" 'from "\.\./interview"'

note ""
note "=== 6. Không ghi nội dung CV hay key ra log ==="
expect_absent "không console.log trong lib" "src/lib" 'console\.(log|debug|info|dir)\('

note ""
if [ "$fail" -eq 0 ]; then note "TẤT CẢ ĐÚNG"; else note "$fail NHÓM SAI"; fi
exit $((fail == 0 ? 0 : 1))