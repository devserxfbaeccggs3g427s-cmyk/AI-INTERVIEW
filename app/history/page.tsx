"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Chip } from "@/components/Chip";
import { PROVIDER_IDS, PROVIDER_REGISTRY } from "@/lib/providers/registry";

/** Rows requested per page. Matches the server default so the counter math is exact. */
const PAGE_SIZE = 50;

/** GET /api/sessions response shape (cursor pagination, T-05.1).
 *  `total` is read defensively below: the server is not required to report a
 *  grand total yet, and every field is treated as optional at runtime. */
type ApiListResponse = { sessions: SessionListItem[]; nextCursor: string | null; hasMore: boolean; limit: number };

interface SessionListItem {
  id: string;
  role: string;
  language: "vi" | "en";
  mode: "strict" | "coaching";
  status: "active" | "evaluating" | "completed" | "failed";
  provider: string;
  model: string;
  planned_rounds: number;
  created_at: number;
  ended_at: number | null;
  cv_source: string;
  cv_filename: string | null;
  overall_score: number | null;
  recommendation: string | null;
  evaluated_turns: number;
}

function comparableRole(role: string): string {
  return role.trim().replace(/\s+/gu, " ").toLowerCase();
}

interface DbStatus { ok: boolean; dbPath: string; counters?: RestoreCounts }

const RESTORE_TABLES = ["sessions", "message_turns", "cv_extracts", "evaluations", "evaluation_attempts", "model_configs", "learning_lessons", "learning_check_attempts"] as const;
type RestoreCounts = Record<(typeof RESTORE_TABLES)[number], number>;
interface RestorePreview {
  file: File;
  token: string;
  expiresAt: string | number;
  incomingCounts: RestoreCounts;
  currentCounts: RestoreCounts;
  /** Short content fingerprint of the database state this preview was taken against. */
  revision?: string;
}

function isRestoreCounts(value: unknown): value is RestoreCounts {
  return typeof value === "object" && value !== null && RESTORE_TABLES.every((table) => {
    const count = (value as Record<string, unknown>)[table];
    return typeof count === "number" && Number.isSafeInteger(count) && count >= 0;
  });
}

async function responseError(res: Response): Promise<Error> {
  if (res.status === 413) return new Error("File quá lớn để phục hồi qua trình duyệt. Hãy sao lưu và phục hồi ngoại tuyến trên máy chủ bằng công cụ SQLite an toàn, không gửi file lớn qua giao diện này.");
  const data = await res.json().catch(() => null);
  return new Error(typeof data?.error === "string" ? data.error : `Yêu cầu thất bại (HTTP ${res.status}).`);
}

function totalCounts(counts: RestoreCounts): number {
  return RESTORE_TABLES.reduce((sum, table) => sum + counts[table], 0);
}

function expiryTime(value: string | number): number {
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  return Date.parse(value);
}

export default function HistoryPage() {
  const [items, setItems] = useState<SessionListItem[]>([]);
  /** Keep the selected summaries across cursor pages and filters, never the full list rows. */
  const [compareSelection, setCompareSelection] = useState<Pick<SessionListItem, "id" | "role">[]>([]);
  const [db, setDb] = useState<DbStatus | null>(null);
  const [loading, setLoading] = useState(true);
  /** A background/page load while rows are already on screen. Distinct from
   *  `loading` so the table can say "Đang tải trang tiếp…" instead of implying
   *  the (still populated) list is empty. */
  const [pageLoading, setPageLoading] = useState<boolean>(false);
  const [provider, setProvider] = useState<string>("all");
  const [status, setStatus] = useState<string>("completed");
  const [mode, setMode] = useState<string>("all");
  const [sort, setSort] = useState<string>("newest");
  const [q, setQ] = useState<string>("");
  /** Network-facing copy of `q`: the input echoes keystrokes instantly, the
   *  request only fires once the user pauses (see the debounce effect). */
  const [debouncedQ, setDebouncedQ] = useState<string>(q);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [total, setTotal] = useState<number | null>(null);
  /** Rows already shown on previous pages — the base of the "Đang hiển thị a–b" counter. */
  const [pageOffset, setPageOffset] = useState<number>(0);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [replaceAcknowledged, setReplaceAcknowledged] = useState(false);
  const selectedFileRef = useRef<File | null>(null);
  const selectionVersion = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  /** Synchronous mirror of `cursor`: Next/Prev mutate it before calling
   *  reload() in the same tick, where the state value captured by the
   *  useCallback closure is still one render behind. */
  const cursorRef = useRef<string | null>(null);
  /** In-flight request controller; a newer reload() aborts the older one. */
  const abortRef = useRef<AbortController | null>(null);
  /** Monotonic request id: a response is applied only if it is still the newest. */
  const fetchSeqRef = useRef(0);
  /** Pages walked through, innermost last. Each entry keeps the cursor that
   *  fetched that page AND the offset it was rendered at, so Prev restores
   *  both without a second parallel stack. */
  const cursorHistoryRef = useRef<{ cursor: string | null; offset: number }[]>([]);

  useEffect(() => {
    if (!restorePreview) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [restorePreview]);

  const reload = useCallback(async (): Promise<boolean> => {
    // AbortController is the primary race guard; the sequence number is
    // belt-and-suspenders for the window where the response is already in
    // flight and cannot be cancelled any more.
    const seq = ++fetchSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setPageLoading(true);
    try {
      const u = new URL("/api/sessions", window.location.origin);
      if (provider !== "all") u.searchParams.set("provider", provider);
      if (status !== "all") u.searchParams.set("status", status);
      if (mode !== "all") u.searchParams.set("mode", mode);
      if (debouncedQ.trim()) u.searchParams.set("q", debouncedQ.trim());
      if (sort !== "newest") u.searchParams.set("sort", sort);
      u.searchParams.set("limit", String(PAGE_SIZE));
      if (cursorRef.current) u.searchParams.set("cursor", cursorRef.current);

      // Each fetch is wrapped so a transient failure on one route
      // (server restart, dev hot-reload, etc.) does not abort the other
      // and does not throw an unhandled rejection into React. Aborts land
      // here as a caught failure too — the checks below tell them apart.
      const safeFetch = async <T,>(url: string): Promise<{ ok: true; data: T } | { ok: false }> => {
        try {
          const res = await fetch(url, { signal: controller.signal });
          if (!res.ok) return { ok: false };
          return { ok: true, data: (await res.json()) as T };
        } catch {
          return { ok: false };
        }
      };

      const [r, d] = await Promise.all([
        safeFetch<ApiListResponse & { total?: number }>(u.toString()),
        safeFetch<DbStatus>("/api/admin/db"),
      ]);
      // Stale answer: a newer reload() has already started (or we were
      // aborted). Drop it instead of overwriting fresher rows with older ones.
      if (seq !== fetchSeqRef.current || controller.signal.aborted) return false;
      // A failed fetch must never be rendered as "zero rows": after a restore
      // that would read as if the operator had just wiped their data. Equally,
      // `items` is only replaced once the new response arrives, so a fast
      // filter change keeps showing the previous rows instead of a flash of
      // an empty table.
      if (r.ok) {
        const data = r.data;
        setItems(data?.sessions ?? []);
        setNextCursor(typeof data?.nextCursor === "string" && data.nextCursor ? data.nextCursor : null);
        setHasMore(data?.hasMore === true);
        setTotal(typeof data?.total === "number" && data.total >= 0 ? data.total : null);
      }
      if (d.ok) setDb(d.data);
      const ok = r.ok && d.ok;
      setLoadFailed(!ok);
      return ok;
    } finally {
      // Only the newest request owns the spinner.
      if (seq === fetchSeqRef.current) {
        setLoading(false);
        setPageLoading(false);
      }
    }
  }, [provider, status, mode, sort, debouncedQ]);

  // Debounce the search box. The input still echoes every keystroke (`q`); only
  // the debounced copy reaches the request.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  // Any filter/sort/search change invalidates the cursor: back to page 1.
  // Declared BEFORE the reload effect on purpose — effects run in source order
  // within a commit, so the ref reset below is already visible to the reload()
  // the same commit fires. The state update is not applied yet, but reload()
  // reads cursorRef.current, so the request is issued with cursor = null. A
  // setCursor(null) landing one render late would be harmless anyway: it can
  // only make the in-flight older request stale, and that one is aborted by the
  // next reload() regardless.
  useEffect(() => {
    cursorRef.current = null;
    cursorHistoryRef.current.length = 0;
    setCursor(null);
    setPageOffset(0);
  }, [provider, status, mode, sort, debouncedQ]);

  // `reload` depends on the same values as the reset effect above, so every
  // filter/sort/search change re-fires the fetch after the cursor is cleared.
  useEffect(() => { void reload(); }, [reload]);

  // Never leave a request running after unmount.
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // Prev walks back through the cursor stack (a real "one page back" button)
  // rather than resetting to page 1; the offset travels with the cursor so the
  // "Đang hiển thị a–b" counter is exact in both directions.
  const goNext = () => {
    if (busyRef.current || pageLoading || !hasMore || !nextCursor) return;
    cursorHistoryRef.current.push({ cursor: cursorRef.current, offset: pageOffset });
    cursorRef.current = nextCursor;
    setCursor(nextCursor);
    setPageOffset(pageOffset + items.length);
    void reload();
  };

  const goPrev = () => {
    if (busyRef.current || pageLoading || !cursorRef.current) return;
    const prev = cursorHistoryRef.current.pop() ?? { cursor: null, offset: 0 };
    cursorRef.current = prev.cursor;
    setCursor(prev.cursor);
    setPageOffset(prev.offset);
    void reload();
  };

  const beginBusy = (action: string) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(action);
    setMsg(null);
    return true;
  };
  const endBusy = () => {
    busyRef.current = false;
    setBusy(null);
  };

  const admin = async (action: "wipe-sessions" | "wipe-all" | "vacuum" | "backup") => {
    if (!beginBusy(action)) return;
    try {
      const res = await fetch("/api/admin/db", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw await responseError(res);
      if (action === "backup") {
        if (!/^application\/json(?:\s*;|\s*$)/i.test(res.headers.get("content-type") ?? "")) {
          throw new Error("Backup không phải JSON; không tải file để tránh lưu nội dung không hợp lệ.");
        }
        download(await res.blob(), `interview-backup-${Date.now()}.json`);
        setMsg("Đã tải file backup JSON.");
      } else {
        const result = await res.json();
        if (result.ok !== true) throw new Error(result.error ?? "Thao tác thất bại.");
        if (action === "wipe-all" || action === "wipe-sessions") setCompareSelection([]);
        setMsg(`Đã chạy ${action}.`);
        await reload();
      }
    } catch (e) {
      setMsg(`Lỗi: ${(e as Error).message}`);
    } finally {
      endBusy();
    }
  };

  const validateRestore = async () => {
    if (!selectedFile || !beginBusy("validate-restore")) return;
    const file = selectedFile;
    const version = selectionVersion.current;
    setRestorePreview(null);
    setReplaceAcknowledged(false);
    try {
      const res = await fetch("/api/admin/db/validate-restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: file,
      });
      if (!res.ok) throw await responseError(res);
      const data = await res.json();
      if (data.ok !== true || typeof data.token !== "string" || !isRestoreCounts(data.incomingCounts) || !isRestoreCounts(data.currentCounts)) {
        throw new Error(data.error ?? "Phản hồi kiểm tra backup không hợp lệ.");
      }
      if ((typeof data.expiresAt !== "number" && typeof data.expiresAt !== "string") || !Number.isFinite(expiryTime(data.expiresAt)) || expiryTime(data.expiresAt) <= Date.now()) {
        throw new Error("Token kiểm tra đã hết hạn hoặc không hợp lệ. Vui lòng kiểm tra lại.");
      }
      if (selectedFileRef.current !== file || selectionVersion.current !== version) return;
      setNow(Date.now());
      setRestorePreview({
        file, token: data.token, expiresAt: data.expiresAt,
        incomingCounts: data.incomingCounts, currentCounts: data.currentCounts,
        revision: typeof data.revision === "string" ? data.revision : undefined,
      });
      setMsg("Đã kiểm tra file. Đối chiếu số lượng trước khi xác nhận phục hồi.");
    } catch (e) {
      if (selectedFileRef.current === file && selectionVersion.current === version) setMsg(`Lỗi: ${(e as Error).message}`);
    } finally {
      endBusy();
    }
  };

  const commitRestore = async () => {
    if (!restorePreview || !replaceAcknowledged || selectedFileRef.current !== restorePreview.file || busyRef.current) return;
    if (expiryTime(restorePreview.expiresAt) <= Date.now()) {
      setRestorePreview(null);
      setReplaceAcknowledged(false);
      setMsg("Token đã hết hạn. Vui lòng kiểm tra lại file trước khi phục hồi.");
      return;
    }
    if (!confirm("Xác nhận lần cuối: THAY THẾ TOÀN BỘ dữ liệu SQLite hiện tại bằng file đã kiểm tra? Hành động này không thể hoàn tác. Bạn đã sao lưu dữ liệu hiện tại chưa?")) return;
    if (selectedFileRef.current !== restorePreview.file || expiryTime(restorePreview.expiresAt) <= Date.now()) {
      setRestorePreview(null);
      setReplaceAcknowledged(false);
      setMsg("File đã thay đổi hoặc token hết hạn. Vui lòng kiểm tra lại.");
      return;
    }
    if (!beginBusy("commit-restore")) return;
    const preview = restorePreview;
    setRestorePreview(null); // Token chỉ dùng cho đúng một lần thử; lỗi cần kiểm tra lại.
    try {
      const res = await fetch("/api/admin/db/commit-restore", {
        method: "POST",
        headers: { "content-type": "application/json", "x-restore-token": preview.token },
        body: preview.file,
      });
      if (!res.ok) throw await responseError(res);
      const data = await res.json();
      if (data.ok !== true) throw new Error(data.error ?? "Phục hồi thất bại.");
      selectedFileRef.current = null;
      selectionVersion.current += 1;
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setReplaceAcknowledged(false);
      setCompareSelection([]);
      const reloaded = await reload();
      setMsg(reloaded
        ? "Đã phục hồi dữ liệu. Danh sách và thống kê đã được tải lại."
        : "Đã phục hồi dữ liệu, nhưng danh sách chưa tải lại được. Vui lòng tải lại trang để xác nhận.");
    } catch (e) {
      setMsg(`Lỗi: ${(e as Error).message} Vui lòng kiểm tra lại file trước khi thử lại.`);
    } finally {
      endBusy();
    }
  };

  const deleteSession = async (id: string) => {
    if (busyRef.current || !confirm(`Xoá phiên ${id}?`) || !beginBusy("delete")) return;
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw await responseError(res);
      setCompareSelection((selected) => selected.filter((s) => s.id !== id));
      setMsg("Đã xoá phiên.");
      await reload();
    } catch (e) {
      setMsg(`Lỗi: ${(e as Error).message}`);
    } finally {
      endBusy();
    }
  };

  const toggleCompare = (s: SessionListItem) => {
    setCompareSelection((selected) => {
      if (selected.some((picked) => picked.id === s.id)) return selected.filter((picked) => picked.id !== s.id);
      if (s.status !== "completed" || selected.length >= 2 ||
          (selected.length === 1 && comparableRole(selected[0].role) !== comparableRole(s.role))) return selected;
      return [...selected, { id: s.id, role: s.role }];
    });
  };

  return (
    <div className="w-full px-gutter py-space-lg max-w-7xl mx-auto flex flex-col gap-space-lg">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
        <div className="flex flex-col gap-space-xs max-w-3xl">
          <div className="flex items-center gap-space-xs">
            <Chip tone="emerald">FR-18 · FR-19 · FR-20</Chip>
            <Chip tone="indigo">SQLite Server-side</Chip>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Lịch sử & Dữ liệu SQLite</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
             Toàn bộ phiên phỏng vấn, transcript kèm raw blocks, CV extract, báo cáo đánh giá, bài học AI và bài tự kiểm tra được lưu trong một file SQLite duy nhất trên máy chủ.
            Không lưu API key.
          </p>
        </div>
        <div className="flex items-center gap-space-sm bg-surface-subtle p-space-sm rounded-xl">
          <span className="material-symbols-outlined text-[24px] text-primary">database</span>
          <div className="flex flex-col">
            <span className="label-caps text-on-surface uppercase">SQLite Path</span>
            <span className="label-code-sm text-tertiary">{db?.dbPath ?? "—"}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-space-md">
        <Stat label="Sessions" value={db?.counters?.sessions ?? 0} icon="work" tone="indigo" />
        <Stat label="Message Turns" value={db?.counters?.message_turns ?? 0} icon="forum" tone="emerald" />
        <Stat label="CV Extracts" value={db?.counters?.cv_extracts ?? 0} icon="description" tone="amber" />
        <Stat label="Evaluations" value={db?.counters?.evaluations ?? 0} icon="verified" tone="rose" />
      </div>

      {loadFailed ? (
        <div role="alert" className="flex items-start gap-space-sm rounded-xl border border-amber-500/40 bg-amber-500/10 p-space-md">
          <span className="material-symbols-outlined text-[20px] text-amber-600">warning</span>
          <span className="font-body-md text-body-md text-on-surface">
            Không tải được danh sách hoặc thống kê từ máy chủ. Số liệu bên trên có thể đã cũ — không phải dữ liệu đã bị xoá. Vui lòng tải lại trang.
          </span>
        </div>
      ) : null}

      <div className="card p-space-md flex flex-col gap-space-md">
        <div className="flex flex-wrap items-end gap-space-sm">
          <Filter label="Provider" value={provider} onChange={setProvider} options={[["all", "Tất cả"], ...PROVIDER_IDS.map((id): [string, string] => [id, PROVIDER_REGISTRY[id].title])]} />
          <Filter label="Trạng thái" value={status} onChange={setStatus} options={[["all", "Tất cả"], ["active", "Active"], ["evaluating", "Evaluating"], ["completed", "Completed"], ["failed", "Failed"]]} />
          <Filter label="Chế độ" value={mode} onChange={setMode} options={[["all", "Tất cả"], ["strict", "Strict"], ["coaching", "Coaching"]]} />
          <Filter label="Sắp xếp" value={sort} onChange={setSort} options={[["newest", "Mới nhất"], ["score", "Điểm cao"], ["duration", "Thời lượng"]]} />
          <div className="flex-1 min-w-[200px]">
            <label className="label-caps text-on-surface uppercase">Tìm kiếm</label>
            <input
              className="input mt-1"
              placeholder="ID, role, tên CV…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
      </div>

      {msg ? (
        <div role="status" className="card p-space-md flex items-center gap-space-sm">
          <span className="material-symbols-outlined text-primary">info</span>
          <span className="font-body-md text-body-md text-on-surface">{msg}</span>
        </div>
      ) : null}

      <div className="card p-space-md flex flex-wrap items-center gap-space-sm" aria-label="Chọn hai phiên để so sánh">
        <div className="flex-1 min-w-[220px]">
          <p className="font-body-md text-body-md text-on-surface">So sánh hai báo cáo cùng vị trí</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Chọn A rồi B trong danh sách phiên hoàn tất. Lựa chọn được giữ khi chuyển trang hoặc lọc.</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            A: {compareSelection[0]?.role ?? "Chưa chọn"} {compareSelection[0] ? `(${compareSelection[0].id})` : ""} · B: {compareSelection[1]?.role ?? "Chưa chọn"} {compareSelection[1] ? `(${compareSelection[1].id})` : ""}
          </p>
        </div>
        {compareSelection.length === 2 ? (
          <Link className="btn btn-primary" href={`/compare?a=${encodeURIComponent(compareSelection[0].id)}&b=${encodeURIComponent(compareSelection[1].id)}`}>
            So sánh A và B
          </Link>
        ) : null}
        {compareSelection.length > 0 ? <button type="button" className="btn btn-ghost" onClick={() => setCompareSelection([])}>Bỏ chọn</button> : null}
      </div>

      {/* Pager. Counter shows the current page range (pageOffset + 1 – pageOffset + rows);
          with `total` reported by the server it appends the grand total. Hidden entirely on
          an empty first page so the table never shows a lonely control row. */}
      {items.length > 0 || hasMore || cursor !== null ? (
        <div className="flex items-center justify-between text-on-surface-variant label-code-sm">
          <span>
            Đang hiển thị {pageOffset + 1}–{pageOffset + items.length}
            {total != null ? ` / ${total}` : ""}
          </span>
          <div className="flex items-center gap-space-sm">
            <button
              className="btn btn-ghost"
              disabled={busy !== null || pageLoading || !cursor}
              onClick={goPrev}
              aria-label="Trang trước"
            >
              ← Trước
            </button>
            <button
              className="btn btn-ghost"
              disabled={busy !== null || pageLoading || !hasMore}
              onClick={goNext}
              aria-label="Trang sau"
            >
              Sau →
            </button>
          </div>
        </div>
      ) : null}

      {/* Sessions table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border-hairline)" }}>
                {["So sánh", "ID", "Vị trí", "Provider / Model", "Trạng thái", "Chế độ", "Câu", "Điểm", "Ngày tạo", ""].map((h) => (
                  <th key={h} scope="col" className="px-space-md py-space-sm label-caps text-on-surface-variant uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* First load: nothing on screen yet, so the spinner replaces the body. */}
              {loading && items.length === 0 ? (
                <tr><td colSpan={10} role="status" className="px-space-md py-space-md text-on-surface-variant">Đang tải…</td></tr>
              ) : null}
              {/* Page/filter change: previous rows stay mounted underneath, the strip
                  above them says work is in progress instead of blanking the table. */}
              {pageLoading && items.length > 0 ? (
                <tr><td colSpan={10} role="status" className="px-space-md py-space-sm text-on-surface-variant">
                  {pageOffset > 0 ? "Đang tải trang tiếp…" : "Đang tải…"}
                </td></tr>
              ) : null}
              {!loading && !pageLoading && items.length === 0 ? (
                <tr><td colSpan={10} className="px-space-md py-space-md text-on-surface-variant">
                  {status === "completed" ? "Chưa có phiên hoàn thành nào phù hợp với bộ lọc. Bạn có thể chọn Tất cả để xem các phiên khác." : "Chưa có phiên nào phù hợp với bộ lọc."}
                </td></tr>
              ) : null}
              {items.map((s) => (
                <tr key={s.id} className="border-b hover:bg-surface-elevated transition-colors" style={{ borderColor: "var(--border-hairline)" }}>
                  <td className="px-space-md py-space-sm">
                    <input
                      type="checkbox"
                      aria-label={`Chọn phiên ${s.id} để so sánh`}
                      checked={compareSelection.some((picked) => picked.id === s.id)}
                      disabled={pageLoading || busy !== null || s.status !== "completed" ||
                        (compareSelection.length >= 2 && !compareSelection.some((picked) => picked.id === s.id)) ||
                        (compareSelection.length > 0 && !compareSelection.some((picked) => picked.id === s.id) && comparableRole(compareSelection[0].role) !== comparableRole(s.role))}
                      onChange={() => toggleCompare(s)}
                    />
                  </td>
                  <td className="px-space-md py-space-sm"><span className="label-code-sm text-on-surface">{s.id}</span></td>
                  <td className="px-space-md py-space-sm"><span className="font-body-md text-body-md text-on-surface">{s.role}</span></td>
                  <td className="px-space-md py-space-sm"><span className="label-code-sm text-on-surface-variant">{s.provider} · {s.model}</span></td>
                  <td className="px-space-md py-space-sm"><StatusChip status={s.status} /></td>
                  <td className="px-space-md py-space-sm"><Chip tone={s.mode === "coaching" ? "emerald" : "neutral"}>{s.mode}</Chip></td>
                  <td className="px-space-md py-space-sm"><span className="label-code-sm">{s.evaluated_turns}/{s.planned_rounds}</span></td>
                  <td className="px-space-md py-space-sm">
                    {s.overall_score != null ? <span className="label-code-sm text-tertiary">{s.overall_score}/100</span> : <span className="label-code-sm text-on-surface-variant">—</span>}
                  </td>
                  <td className="px-space-md py-space-sm"><span className="label-code-sm text-on-surface-variant">{new Date(s.created_at * 1000).toLocaleString("vi-VN")}</span></td>
                  <td className="px-space-md py-space-sm">
                    <div className="flex gap-space-xs">
                      {s.status === "completed" ? (
                        <>
                          <Link href={`/session/${s.id}`} className="btn btn-ghost text-label-code-sm py-1 px-2 whitespace-nowrap">
                            <span className="material-symbols-outlined text-[14px]">forum</span> Xem hội thoại
                          </Link>
                          <Link href={`/report/${s.id}`} className="btn btn-ghost text-label-code-sm py-1 px-2 whitespace-nowrap">
                            <span className="material-symbols-outlined text-[14px]">analytics</span> Báo cáo
                          </Link>
                        </>
                      ) : (
                        <Link href={`/session/${s.id}`} className="btn btn-ghost text-label-code-sm py-1 px-2">
                          <span className="material-symbols-outlined text-[14px]">play_arrow</span> Mở
                        </Link>
                      )}
                      <button
                        onClick={() => void deleteSession(s.id)}
                        className="btn btn-destructive text-label-code-sm py-1 px-2"
                        disabled={busy !== null}
                        aria-label={`Xoá phiên ${s.id}`}
                      >
                        <span className="material-symbols-outlined text-[14px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
        <div className="card p-space-md flex flex-col gap-space-sm">
          <span className="label-caps text-on-surface uppercase">Quản trị SQLite</span>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            <strong className="text-on-surface">FR-19</strong>: Tuỳ chọn xóa dữ liệu cục bộ. Hành động này không thể hoàn tác.
          </p>
          <div className="flex flex-wrap gap-space-sm">
            <button
               onClick={() => { if (confirm("Xoá tất cả sessions? Cascade sẽ xóa cả turns, CV, evaluations, bài học và các lần tự kiểm tra.")) admin("wipe-sessions"); }}
              className="btn btn-destructive"
              disabled={busy !== null}
            >
              <span className="material-symbols-outlined text-[18px]">folder_delete</span> Xoá tất cả sessions
            </button>
            <button
              onClick={() => { if (confirm("Xoá TOÀN BỘ cơ sở dữ liệu?")) admin("wipe-all"); }}
              className="btn btn-destructive"
              disabled={busy !== null}
            >
              <span className="material-symbols-outlined text-[18px]">delete_forever</span> Wipe All
            </button>
            <button
              onClick={() => admin("vacuum")}
              className="btn btn-ghost"
              disabled={busy !== null}
            >
              <span className="material-symbols-outlined text-[18px]">compress</span> VACUUM
            </button>
          </div>
        </div>

        <div className="card p-space-md flex flex-col gap-space-sm">
          <span className="label-caps text-on-surface uppercase">Sao lưu / Phục hồi</span>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
             Sao lưu JSON v3 gồm 8 bảng: CV, transcript, raw model output, báo cáo, bài học AI, đáp án quiz, các lần tự kiểm tra và URL endpoint (không chứa API key hoặc PDF gốc). File chứa dữ liệu riêng tư: lưu mã hóa ngoài webroot, giới hạn quyền truy cập. Nên tải bản sao lưu dữ liệu hiện tại trước khi phục hồi.
             Phục hồi sẽ <strong className="text-error">thay thế toàn bộ dữ liệu hiện tại, không thể hoàn tác</strong>.
          </p>
          <div className="flex flex-wrap gap-space-sm">
            <button onClick={() => void admin("backup")} className="btn btn-ghost" disabled={busy !== null}>
              <span className="material-symbols-outlined text-[18px]">download</span> Tải backup JSON
            </button>
            <a href="/api/admin/schema" target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              <span className="material-symbols-outlined text-[18px]">code</span> Xem schema
            </a>
          </div>
          <label className="font-body-sm text-body-sm text-on-surface" htmlFor="restore-file">Chọn file backup JSON để kiểm tra</label>
          <input
            id="restore-file"
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="input"
            disabled={busy !== null}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              selectedFileRef.current = file;
              selectionVersion.current += 1;
              setSelectedFile(file);
              setRestorePreview(null);
              setReplaceAcknowledged(false);
              setMsg(null);
            }}
          />
          <button onClick={() => void validateRestore()} className="btn btn-ghost self-start" disabled={busy !== null || !selectedFile}>
            <span className="material-symbols-outlined text-[18px]">fact_check</span> Kiểm tra file
          </button>
          {restorePreview && expiryTime(restorePreview.expiresAt) > now ? (
            <div className="flex flex-col gap-space-sm" aria-live="polite">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                File đã kiểm tra: <strong className="text-on-surface">{restorePreview.file.name}</strong>. Token hết hạn: {new Date(expiryTime(restorePreview.expiresAt)).toLocaleString("vi-VN")}.
                {restorePreview.revision ? <> Mã trạng thái DB: <span className="label-code-sm">{restorePreview.revision}</span>.</> : null}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-body-sm text-body-sm">
                  <thead><tr className="border-b" style={{ borderColor: "var(--border-hairline)" }}>
                    <th scope="col" className="py-space-xs">Bảng</th><th scope="col" className="py-space-xs">Hiện tại</th><th scope="col" className="py-space-xs">File phục hồi</th>
                  </tr></thead>
                  <tbody>
                    {RESTORE_TABLES.map((table) => (
                      <tr key={table} className="border-b" style={{ borderColor: "var(--border-hairline)" }}>
                        <td className="py-space-xs label-code-sm">{table}</td>
                        <td className="py-space-xs">{restorePreview.currentCounts[table].toLocaleString("vi-VN")}</td>
                        <td className="py-space-xs">{restorePreview.incomingCounts[table].toLocaleString("vi-VN")}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold text-on-surface">
                      <td className="py-space-xs">Tổng</td>
                      <td className="py-space-xs">{totalCounts(restorePreview.currentCounts).toLocaleString("vi-VN")}</td>
                      <td className="py-space-xs">{totalCounts(restorePreview.incomingCounts).toLocaleString("vi-VN")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <label className="flex items-start gap-space-xs font-body-sm text-body-sm text-error">
                <input type="checkbox" checked={replaceAcknowledged} disabled={busy !== null} onChange={(e) => setReplaceAcknowledged(e.target.checked)} />
                Tôi đã xem số lượng, hiểu dữ liệu hiện tại sẽ bị thay thế vĩnh viễn và đã cân nhắc sao lưu trước.
              </label>
              <button onClick={() => void commitRestore()} className="btn btn-destructive self-start" disabled={busy !== null || !replaceAcknowledged || selectedFile !== restorePreview.file}>
                <span className="material-symbols-outlined text-[18px]">restore</span> Xác nhận phục hồi
              </button>
            </div>
          ) : restorePreview ? (
            <p className="font-body-sm text-body-sm text-error" role="status">Token đã hết hạn. Kiểm tra lại file trước khi phục hồi.</p>
          ) : null}
        </div>
      </div>

      <div className="card p-space-md flex items-start gap-space-sm" style={{ borderColor: "rgba(244,63,94,0.4)" }}>
        <span className="material-symbols-outlined text-error flex-shrink-0">warning</span>
        <div className="flex flex-col">
          <span className="font-headline-sm text-headline-sm text-on-surface">NFR-11 · Minh bạch rủi ro</span>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Instance là <strong className="text-on-surface">single-tenant / không xác thực</strong>.
            Không expose cổng 3000 ra internet công cộng. Triển khai kèm reverse proxy + firewall nếu cần.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: string; tone: "indigo" | "emerald" | "amber" | "rose" }) {
  return (
    <div className="card p-space-md flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
        <span className="label-caps text-on-surface-variant uppercase">{label}</span>
        <span className={`material-symbols-outlined text-[20px] text-${tone === "indigo" ? "primary" : tone === "emerald" ? "tertiary" : tone === "amber" ? "warning" : "error"}`}>{icon}</span>
      </div>
      <span className="font-display text-display text-on-surface">{value.toLocaleString("vi-VN")}</span>
    </div>
  );
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex flex-col gap-1 min-w-[120px]">
      <label className="label-caps text-on-surface uppercase">{label}</label>
      <select className="input cursor-pointer" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  if (status === "completed") return <Chip tone="emerald">Completed</Chip>;
  if (status === "active") return <Chip tone="indigo">Active</Chip>;
  if (status === "evaluating") return <Chip tone="amber">Evaluating</Chip>;
  return <Chip tone="rose">Failed</Chip>;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
