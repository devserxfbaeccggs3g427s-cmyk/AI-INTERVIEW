#!/usr/bin/env python3
"""Báo cáo tiến độ roadmap — đo được, không đoán.

Cho ra 2 con số tách biệt:
  1. **Task ledger** — số task đã tick trong `tasks.md`.
  2. **FR coverage** — số yêu cầu chức năng đã có ít nhất một test truy vết
     được (tên test chứa mã FR).

⚠️ Vì sao cần con số thứ hai: task ledger có thể lệch với thực tế — một task
được tick sớm, hoặc một task ghi rất chi tiết (VD "tính khoảng cách
LEVEL_ORDER") mà implementation đã gộp vào hàm khác. Độ phủ FR có test là
thước đo không phụ thuộc vào việc tick tay.

Dùng: `python3 .kiro/scripts/roadmap_progress.py`
"""

from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPECS = os.path.join(ROOT, ".kiro", "specs")

FR_RE = re.compile(r"\bFR-[A-Z]{2,3}-\d{2}\b")
TICK_RE = re.compile(r"^\s*- \[x\] ", re.M)
OPEN_RE = re.compile(r"^\s*- \[ \] ", re.M)


def fr_ids(text: str) -> set[str]:
    return set(FR_RE.findall(text))


def collect_test_fr() -> set[str]:
    """FR nào đã có test truy vết — test trong `tests/` hoặc `e2e/`."""
    found: set[str] = set()
    for sub in ("tests", "e2e"):
        base = os.path.join(ROOT, sub)
        if not os.path.isdir(base):
            continue
        for root, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if d not in {"node_modules", ".next"}]
            for name in files:
                if not name.endswith((".ts", ".tsx")):
                    continue
                try:
                    with open(os.path.join(root, name), encoding="utf-8") as fh:
                        found |= fr_ids(fh.read())
                except OSError:
                    continue
    return found


def main() -> int:
    test_fr = collect_test_fr()

    rows: list[tuple[str, int, int, int, int]] = []
    for feat in sorted(os.listdir(SPECS)):
        d = os.path.join(SPECS, feat)
        if not os.path.isdir(d):
            continue
        spec_p = os.path.join(d, "spec.md")
        task_p = os.path.join(d, "tasks.md")
        if not (os.path.exists(spec_p) and os.path.exists(task_p)):
            continue
        with open(spec_p, encoding="utf-8") as fh:
            spec_fr = fr_ids(fh.read())
        with open(task_p, encoding="utf-8") as fh:
            tasks = fh.read()
        done = len(TICK_RE.findall(tasks))
        rem = len(OPEN_RE.findall(tasks))
        covered = len(spec_fr & test_fr)
        rows.append((feat, done, rem, len(spec_fr), covered))

    header = f"{'feature':26s} {'task tick':>12s} {'FR spec':>9s} {'FR test':>9s} {'%':>5s}"
    print(header)
    print("-" * len(header))
    for feat, done, rem, nfr, cov in rows:
        pct = (cov * 100 // nfr) if nfr else 100
        print(f"{feat:26s} {done:5d}/{done + rem:<6d} {nfr:9d} {cov:9d} {pct:4d}%")

    tot_done = sum(r[1] for r in rows)
    tot_rem = sum(r[2] for r in rows)
    tot_fr = sum(r[3] for r in rows)
    tot_cov = sum(r[4] for r in rows)
    pct = (tot_cov * 100 // tot_fr) if tot_fr else 100
    print("-" * len(header))
    print(f"{'TỔNG':26s} {tot_done:5d}/{tot_done + tot_rem:<6d} {tot_fr:9d} {tot_cov:9d} {pct:4d}%")

    # Cảnh báo: FR không còn test nào bảo vệ.
    orphans = sorted(t for t in test_fr if not any(
        t in fr_ids(open(os.path.join(SPECS, f, "spec.md"), encoding="utf-8").read())
        for f in os.listdir(SPECS)
        if os.path.isdir(os.path.join(SPECS, f))
        and os.path.exists(os.path.join(SPECS, f, "spec.md"))
    ))
    if orphans:
        print(f"\n⚠️ {len(orphans)} FR có test nhưng không có trong spec nào:")
        print("   " + ", ".join(orphans[:20]))

    return 0


if __name__ == "__main__":
    sys.exit(main())
