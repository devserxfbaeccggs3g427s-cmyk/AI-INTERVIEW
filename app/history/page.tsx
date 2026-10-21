"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Chip } from "@/components/Chip";
import { PROVIDER_IDS, PROVIDER_REGISTRY } from "@/lib/providers/registry";

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

interface DbStatus { ok: boolean; dbPath: string; counters?: RestoreCounts }

const RESTORE_TABLES = ["sessions", "message_turns", "cv_extracts", "evaluations", "evaluation_attempts", "model_configs"] as const;
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
  const [db, setDb] = useState<DbStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [mode, setMode] = useState<string>("all");
  const [sort, setSort] = useState<string>("newest");
  const [q, setQ] = useState<string>("");
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

  useEffect(() => {
    if (!restorePreview) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [restorePreview]);

  const reload = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const u = new URL("/api/sessions", window.location.origin);
      if (provider !== "all") u.searchParams.set("provider", provider);
      if (status !== "all") u.searchParams.set("status", status);
      if (mode !== "all") u.searchParams.set("mode", mode);
      if (q.trim()) u.searchParams.set("q", q.trim());
      if (sort !== "newest") u.searchParams.set("sort", sort);

      // Each fetch is wrapped so a transient failure on one route
      // (server restart, dev hot-reload, etc.) does not abort the other
      // and does not throw an unhandled rejection into React.
      const safeFetch = async <T,>(url: string): Promise<{ ok: true; data: T } | { ok: false }> => {
        try {
          const res = await fetch(url);
          if (!res.ok) return { ok: false };
          return { ok: true, data: (await res.json()) as T };
        } catch {
          return { ok: false };
        }
      };

      const [r, d] = await Promise.all([
        safeFetch<{ sessions?: SessionListItem[] }>(u.toString()),
        safeFetch<DbStatus>("/api/admin/db"),
      ]);
      // A failed fetch must never be rendered as "zero rows": after a restore
      // that would read as if the operator had just wiped their data.
      if (r.ok) setItems(r.data?.sessions ?? []);
      if (d.ok) setDb(d.data);
      const ok = r.ok && d.ok;
      setLoadFailed(!ok);
      return ok;
    } finally {
      setLoading(false);
    }
  }, [provider, status, mode, sort, q]);

  useEffect(() => { void reload(); }, [reload]);

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
      setMsg("Đã xoá phiên.");
      await reload();
    } catch (e) {
      setMsg(`Lỗi: ${(e as Error).message}`);
    } finally {
      endBusy();
    }
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
            Toàn bộ phiên phỏng vấn, transcript kèm raw blocks, CV extract và báo cáo đánh giá được lưu trong một file SQLite duy nhất trên máy chủ.
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

      {/* Sessions table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border-hairline)" }}>
                {["ID", "Vị trí", "Provider / Model", "Trạng thái", "Chế độ", "Câu", "Điểm", "Ngày tạo", ""].map((h) => (
                  <th key={h} scope="col" className="px-space-md py-space-sm label-caps text-on-surface-variant uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-space-md py-space-md text-on-surface-variant">Đang tải…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={9} className="px-space-md py-space-md text-on-surface-variant">Chưa có phiên nào.</td></tr>
              ) : items.map((s) => (
                <tr key={s.id} className="border-b hover:bg-surface-elevated transition-colors" style={{ borderColor: "var(--border-hairline)" }}>
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
                        <Link href={`/report/${s.id}`} className="btn btn-ghost text-label-code-sm py-1 px-2">
                          <span className="material-symbols-outlined text-[14px]">analytics</span> Báo cáo
                        </Link>
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
              onClick={() => { if (confirm("Xoá tất cả sessions? Cascade sẽ xóa cả turns + CV + evaluations.")) admin("wipe-sessions"); }}
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
            Sao lưu dưới dạng JSON. Nên tải bản sao lưu dữ liệu hiện tại trước khi phục hồi.
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
