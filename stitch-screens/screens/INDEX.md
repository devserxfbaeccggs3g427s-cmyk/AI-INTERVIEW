# Stitch Project Index — AI Interview Practice Platform

> Project ID: `7152366827888150836` · Last synced: 2026-10-18 · API-key sync path proven ✓
> Visibility: PRIVATE · Device: DESKTOP · Origin: STITCH
> Design system asset: `876803d92a6c482fbf1fbe78f8547f9a` (v1) — "AI Mock Interview Studio"

## All files in this folder

| File | Source screen | Resolution | Size |
|---|---|---|---|
| `00-requirements.md` | spec `30f674e9…562fc0` | 600×600 markdown | 6.3 KB |
| `01-byok-config.html` | BYOK setup `f1eb8a78…910ed4` | 2560×2526 | 39 KB |
| `01-byok-config.png` | ″ | ″ | 130 KB |
| `02-start-interview.html` | Bắt đầu phỏng vấn `5282ae1d…d1020` | 2560×4182 | 45 KB |
| `02-start-interview.png` | ″ | ″ | 1.07 MB |
| `03-active-session.html` | Phiên đang diễn ra `392921d1…ad69` | 2560×3984 | 45 KB |
| `03-active-session.png` | ″ | ″ | 1.31 MB |
| `04-evaluation-report.html` | Báo cáo đánh giá `f698edb3…332e` | 2560×5788 | 46 KB |
| `04-evaluation-report.png` | ″ | ″ | 1.41 MB |
| `05-history-sqlite.html` | Lịch sử & SQLite `dbf19795…9e59` | 2560×2852 | 50 KB |
| `05-history-sqlite.png` | ″ | ″ | 83 KB |

**Total: 11 files, ~5.5 MB.** All 5 generated UI screens + 1 spec screen are saved locally.

## Sync method (proven 2026-10-18)

Re-pull từ Stitch bằng 1 lệnh curl + Python decoder. API key lấy từ `~/.claude.json` (`mcpServers.stitch.headers.X-Goog-Api-Key`).

```bash
API_KEY=$(jq -r '.mcpServers.stitch.headers["X-Goog-Api-Key"]' ~/.claude.json)
PROJ=7152366827888150836

# HTML of one screen
curl -sL -H "X-Goog-Api-Key: $API_KEY" \
  "https://stitch.googleapis.com/v1/projects/$PROJ/files/<screen_id>:download" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['dataString'])" \
  > screen.html

# PNG → already base64 in dataString → decode
curl -sL -H "X-Goog-Api-Key: $API_KEY" \
  "https://stitch.googleapis.com/v1/projects/$PROJ/files/<screenshot_id>:download" \
  | python3 -c "import json,base64,sys; print(base64.b64decode(json.load(sys.stdin)['dataString']).decode('latin-1'))" \
  > screen.png
```
