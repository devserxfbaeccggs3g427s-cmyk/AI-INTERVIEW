#!/usr/bin/env python3
"""
Kiểm tra bộ spec .kiro của Daily Loop OS.

Checks:
  1. Mỗi feature có đủ spec.md / design.md / tasks.md
  2. spec.md có đủ heading bắt buộc + ASCII wireframe + >= 3 AC
  3. design.md có code block TypeScript + đủ heading kiến trúc
  4. tasks.md có >= 15 task dạng "- [ ]"
  5. Coverage: 79 FR của SPEC.md gốc, 13 AC, 9 NFR, 21 màn hình đều được nhắc
  6. Mỗi FR/AC/NFR/màn hình được nhắc trong ĐÚNG feature được giao

Usage:  python3 .kiro/scripts/validate_specs.py
Exit:   0 = PASS, 1 = FAIL
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPECS = os.path.join(ROOT, "specs")
SOURCE_SPEC = os.path.join(os.path.dirname(ROOT), "system-design", "SPEC.md")

# ── ánh xạ chính thức ────────────────────────────────────────────────────────
FR_OWNER = {   # nhóm FR -> feature(s) sở hữu (theo §2 của SPEC.md)
    "FR-DL": ["daily-loop-core", "quick-log"],
    "FR-SK": ["skill-tree-evidence"],
    "FR-LG": ["srs-language-review", "language-test", "communication-training"],
    "FR-CM": ["communication-training"],
    "FR-PS": ["personal-state-journal"],
    "FR-WR": ["weekly-progress-report"],
    "FR-AI": ["ai-foundation", "settings-cost"],
    "FR-MI": ["mock-interview"],
    "FR-LT": ["language-test"],
}
AC_OWNER = {
    "AC-1": "daily-loop-core", "AC-2": "quick-log", "AC-3": "skill-tree-evidence",
    "AC-4": "srs-language-review", "AC-5": "ai-foundation", "AC-6": "communication-training",
    "AC-7": "ai-foundation", "AC-8": "ai-foundation", "AC-9": "mock-interview",
    "AC-10": "mock-interview", "AC-11": "language-test", "AC-12": "language-test",
    "AC-13": "mock-interview",
}
SCREEN_OWNER = {
    "S01": "daily-loop-core", "S02": "daily-loop-core", "S03": "skill-tree-evidence",
    "S04": "skill-tree-evidence", "S05": "quick-log", "S06": "personal-state-journal",
    "S07": "communication-training", "S08": "communication-training",
    "S09": "srs-language-review", "S10": "srs-language-review",
    "S11": "communication-training", "S12": "personal-state-journal",
    "S13": "weekly-progress-report", "S14": "weekly-progress-report",
    "S15": "settings-cost", "S16": "mock-interview", "S17": "mock-interview",
    "S18": "mock-interview", "S19": "language-test", "S20": "language-test",
    "S21": "language-test",
}
FEATURES = sorted(set(SCREEN_OWNER.values()) |
                  {v for vs in FR_OWNER.values() for v in vs})

errs, oks = [], []


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def has_heading(text, keyword, flags=re.M):
    return re.search(r"^#{1,4} .*" + re.escape(keyword), text, flags) is not None


# ── 1–4: cấu trúc từng feature ──────────────────────────────────────────────
for feat in FEATURES:
    d = os.path.join(SPECS, feat)
    if not os.path.isdir(d):
        errs.append(f"[{feat}] thiếu thư mục specs/{feat}/")
        continue
    for fn in ("spec.md", "design.md", "tasks.md"):
        p = os.path.join(d, fn)
        if not os.path.exists(p):
            errs.append(f"[{feat}] thiếu {fn}")
            continue
        t = read(p)
        if len(t) < 1500:
            errs.append(f"[{feat}/{fn}] quá ngắn ({len(t)} ký tự)")
        if fn == "spec.md":
            for h in ("Tổng quan", "Yêu cầu chức năng", "Yêu cầu phi chức năng",
                      "Mô hình dữ liệu", "Tiêu chí nghiệm thu"):
                if not has_heading(t, h):
                    errs.append(f"[{feat}/spec.md] thiếu heading '{h}'")
            if feat != "ai-foundation" and not has_heading(t, "Giao diện"):
                errs.append(f"[{feat}/spec.md] thiếu heading 'Giao diện'")
            if "```" not in t:
                errs.append(f"[{feat}/spec.md] thiếu ASCII wireframe")
            n_ac = len(re.findall(r"\*Given\*", t))
            if n_ac < 3:
                errs.append(f"[{feat}/spec.md] chỉ {n_ac} AC (cần >= 3)")
            else:
                oks.append(f"[{feat}/spec.md] {n_ac} AC")
        elif fn == "design.md":
            if "```ts" not in t:
                errs.append(f"[{feat}/design.md] thiếu code block TypeScript")
            for h in ("Kiến trúc", "Thành phần", "Luồng dữ liệu", "Xử lý lỗi"):
                if not has_heading(t, h):
                    errs.append(f"[{feat}/design.md] thiếu heading '{h}'")
            if not has_heading(t, "kiểm thử", re.I | re.M):
                errs.append(f"[{feat}/design.md] thiếu heading 'kiểm thử'")
        elif fn == "tasks.md":
            n = len(re.findall(r"^- \[ \] ", t, re.M))
            if n < 15:
                errs.append(f"[{feat}/tasks.md] chỉ {n} task (cần >= 15)")
            else:
                oks.append(f"[{feat}/tasks.md] {n} task")

# ── 5–6: coverage so với SPEC.md gốc ────────────────────────────────────────
if not os.path.exists(SOURCE_SPEC):
    errs.append(f"không tìm thấy nguồn {SOURCE_SPEC}")
else:
    src = read(SOURCE_SPEC)
    all_fr = sorted(set(re.findall(r"\bFR-[A-Z]{2}-\d{2}\b", src)))
    all_ac = sorted(set(re.findall(r"\bAC-\d+\b", src)), key=lambda x: int(x.split("-")[1]))
    all_nfr = sorted(set(re.findall(r"\bNFR-\d{2}\b", src)))

    feat_text = {}
    for feat in FEATURES:
        p = os.path.join(SPECS, feat, "spec.md")
        feat_text[feat] = read(p) if os.path.exists(p) else ""

    for fr in all_fr:
        grp = "-".join(fr.split("-")[:2])
        owners = FR_OWNER.get(grp, [])
        if not owners:
            errs.append(f"{fr}: chưa map owner")
        elif not any(fr in feat_text.get(o, "") for o in owners):
            errs.append(f"{fr} chưa được nhắc trong {owners}")
    for ac in all_ac:
        owner = AC_OWNER.get(ac)
        if owner and ac not in feat_text.get(owner, ""):
            errs.append(f"{ac} chưa được nhắc trong {owner}")
    for nfr in all_nfr:
        if not any(nfr in t for t in feat_text.values()):
            errs.append(f"{nfr} chưa được nhắc trong bất kỳ feature nào")
    for sid, owner in SCREEN_OWNER.items():
        if sid not in feat_text.get(owner, ""):
            errs.append(f"{sid} chưa được nhắc trong {owner}")

    for f in ("steering/product.md", "steering/tech.md", "steering/design-system.md",
              "steering/project.md", "steering/data-model-registry.md",
              "CONVENTIONS.md", "README.md"):
        p = os.path.join(ROOT, f)
        if not os.path.exists(p):
            errs.append(f"thiếu {f}")
        elif f.startswith("steering/") and not read(p).lstrip().startswith("---"):
            errs.append(f"[{f}] thiếu frontmatter YAML")

    # ── 7: không trùng tên field mới giữa các feature (xung đột schema) ──────
    base_models = set(re.findall(r"model (\w+) \{", src))
    field_owner = {}
    for feat in FEATURES:
        for fn in ("spec.md", "design.md"):
            fp = os.path.join(SPECS, feat, fn)
            if not os.path.exists(fp):
                continue
            ft = read(fp)
            for m in re.finditer(r"^\|\s*`(\w+)`\s*\|\s*`([A-Za-z]\w*)`\s*\|", ft, re.M):
                model, field = m.group(1), m.group(2)
                if model in base_models:
                    field_owner.setdefault((model, field), set()).add(feat)
    # field gốc của SPEC §4
    orig_fields = {}
    for mm in re.finditer(r"model (\w+) \{(.*?)\n\}", src, re.S):
        orig_fields[mm.group(1)] = set(re.findall(r"^\s{2}(\w+)\s", mm.group(2), re.M))

    # field đã chốt trong registry: field -> [owner feature]
    # cột owner là cột thứ 6 trong bảng | C# | Model | Field | Kiểu | Mặc định | Feature | Lý do |
    registry_fields = {}
    reg_path = os.path.join(ROOT, "steering", "data-model-registry.md")
    if os.path.exists(reg_path):
        reg = read(reg_path)
        for rm in re.finditer(r"^\|\s*C\d+\s*\|\s*`\w+`\s*\|\s*`(\w+)`\s*\|[^|]*\|[^|]*\|\s*([^|]+?)\s*\|",
                              reg, re.M):
            field, owner_cell = rm.groups()
            owners = [o.strip() for o in re.split(r"\s*\+\s*", owner_cell) if o.strip()]
            registry_fields.setdefault(field, []).extend(owners)

    for (model, field), owners in field_owner.items():
        if model in orig_fields and field not in orig_fields[model] and len(owners) > 1:
            # field đã được chốt trong registry (có owner list) → không phải xung đột
            if field in registry_fields:
                reg_owners = registry_fields[field]
                if not set(reg_owners) & owners:
                    errs.append(f"xung đột schema: {model}.{field} được {sorted(owners)} "
                                f"đề xuất nhưng registry chốt owner {reg_owners} — "
                                f"cập nhật registry/data-model-registry.md")
            else:
                errs.append(f"xung đột schema: {model}.{field} được {len(owners)} feature "
                            f"cùng đề xuất → {sorted(owners)}. Phải chốt 1 tên trong "
                            f"steering/data-model-registry.md")

    # ── 8: model mới phải được đăng ký trong registry ────────────────────────
    reg_models = set()
    if os.path.exists(reg_path):
        for rm in re.finditer(r"^\|\s*M\d+\s*\|\s*`(\w+)`\s*\|", read(reg_path), re.M):
            reg_models.add(rm.group(1))
    new_models = {}
    for feat in FEATURES:
        for fn in ("spec.md", "design.md"):
            fp = os.path.join(SPECS, feat, fn)
            if not os.path.exists(fp):
                continue
            for mm in re.finditer(r"^\s*model (\w+) \{", read(fp), re.M):
                mname = mm.group(1)
                if mname not in base_models and mname not in reg_models:
                    new_models.setdefault(mname, set()).add(feat)
    for mname, owners in sorted(new_models.items()):
        errs.append(f"model mới '{mname}' chưa đăng ký trong data-model-registry.md "
                    f"({sorted(owners)}) — thêm vào bảng M* kèm nhánh dự phòng")

    # ── 9: hệ level phải thống nhất (CEFR), không có 2 bảng cạnh tranh ─────────
    # Bảng cũ "zero|beginner|elementary|intermediate|upper_intermediate" đã bị
    # thay bằng CEFR — nếu còn sót thì feature sẽ dùng 2 thang khác nhau.
    legacy_levels = {"beginner", "elementary", "intermediate", "upper_intermediate"}
    for feat in FEATURES:
        for fn in ("spec.md", "design.md"):
            fp = os.path.join(SPECS, feat, fn)
            if not os.path.exists(fp):
                continue
            ft = read(fp)
            hits = {lv for lv in legacy_levels
                    if re.search(r'"' + lv + r'"', ft) or re.search(r'\|\s*' + lv + r'\s*\|', ft)}
            if hits:
                errs.append(f"[{feat}/{fn}] còn dùng thang level cũ {sorted(hits)} — "
                            f"phải dùng CEFR `zero·A1·A2·B1·B2·C1·C2` "
                            f"(steering/user-profile-decisions.md §4.1)")

    print("=" * 72)
    print("KIRO SPEC VALIDATION — Daily Loop OS")
    print("=" * 72)
    print(f"Features      : {len(FEATURES)}")
    print(f"Màn hình      : {len(SCREEN_OWNER)}")
    print(f"FR (SPEC.md)  : {len(all_fr)}")
    print(f"AC (SPEC.md)  : {len(all_ac)}")
    print(f"NFR (SPEC.md) : {len(all_nfr)}")
    print("-" * 72)
    for i in oks:
        print("  ok  ", i)
    if errs:
        print("-" * 72)
        for e in errs:
            print("  ERR ", e)
        print("-" * 72)
        print(f"KẾT QUẢ: FAIL — {len(errs)} lỗi")
        sys.exit(1)
    print("-" * 72)
    print("KẾT QUẢ: PASS — không có lỗi")
