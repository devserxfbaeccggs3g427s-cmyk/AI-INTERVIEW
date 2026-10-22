# Stitch Project Index — AI Interview Practice Platform

> Project ID: `7152366827888150836` · Synced: 2026-10-22
> Design system: `assets/876803d92a6c482fbf1fbe78f8547f9a` (v1) — AI Mock Interview Studio

## Source records and local assets

| Source record | Stitch screen ID | Local HTML / Markdown | Local screenshot (actual format and size) |
|---|---|---|---|
| Requirements specification | `30f674e9d97b4bad89dc3e4831562fc0` | `00-requirements.md` | None |
| Cấu hình AI (BYOK) | `f1eb8a78745149de987fc81ca8910ed4` | `01-byok-config.html` | `01-byok-config.png` — PNG, 2560×2526 |
| Bắt đầu phỏng vấn | `5282ae1d49fb4528987e1c5357dd1020` | `02-start-interview.html` | `02-start-interview.png` — PNG, 2560×4182 |
| Phiên đang diễn ra | `392921d1447d49b1bb27e06c9f51ad69` | `03-active-session.html` | `03-active-session.png` — PNG, 2560×3984 |
| Báo cáo đánh giá chi tiết | `f698edb312ee4350a201d4781f51332e` | `04-evaluation-report.html` | `04-evaluation-report.jpg` — JPEG, 1280×2999 |
| Lịch sử & Dữ liệu SQLite | `dbf19795aa99465c9318b3bcb0499e59` | `05-history-sqlite.html` | `05-history-sqlite.jpg` — JPEG, 1280×1426 |
| Lịch sử & Dữ liệu SQLite (variant) | `09e5bc7a1e1c40a29b82e2cdefb4d287` | `05-history-sqlite-variant.html` | None supplied by Stitch |
| Học & Tự kiểm tra chủ đề đề xuất | `7689b44258f94aaa97ae04e764156326` | `06-learning-self-test.html` | `06-learning-self-test.jpg` — JPEG, 1280×2694 |

**Inventory:** 8 Stitch records represented by 8 text assets and 6 screenshots (14 files, excluding this index). The two history HTML assets are byte-identical but retained under separate names because Stitch assigns them different screen IDs. Screenshot dimensions and formats above describe the downloaded images, not the screen metadata in Stitch. The earlier `05-history-sqlite.png` contained JPEG bytes and was renamed to `.jpg`; the earlier high-resolution `04-evaluation-report.png` was replaced by the current JPEG and remains recoverable from Git history.

## Refreshing the references

Use the Stitch MCP `list_screens` tool with project ID `7152366827888150836` to retrieve current screen IDs and the `html_code.name` / `screenshot.name` file resource names. Match records by **screen ID**, not title, then retrieve each supplied resource with `download_file`. For screenshots, decode the returned base64 as **binary bytes**, inspect their MIME/signature and dimensions, and name them with the matching extension. Compare downloaded content before replacing local references; update this index when records or formats change. Do not fetch the `download_url` directly or store credentials in the repository.

These are standalone Stitch design references, not the running Next.js interface. See `../01-design-system.md` for visual tokens and `00-requirements.md` for product requirements.
