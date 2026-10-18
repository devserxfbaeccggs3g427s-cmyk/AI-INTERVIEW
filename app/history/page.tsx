"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Chip } from "@/components/Chip";

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

interface DbStatus { ok: boolean; dbPath: string; counters?: { sessions: number; turns: number; cv: number; evaluations: number; modelConfigs: number } }

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
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
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
      const safeFetch = (url: string) =>
        fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);

      const [r, d] = await Promise.all([
        safeFetch(u.toString()),
        safeFetch("/api/admin/db"),
      ]);
      setItems(r?.sessions ?? []);
      setDb(d ?? { ok: false, dbPath: "—" });
    } finally {
      setLoading(false);
    }
  }, [provider, status, mode, sort, q]);

  useEffect(() => { void reload(); }, [reload]);

  const admin = async (action: "wipe-sessions" | "wipe-all" | "vacuum" | "backup" | "import", payload?: string) => {
    setBusy(action);
    setMsg(null);
    try {
      if (action === "backup") {
        const res = await fetch("/api/admin/db", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const blob = await res.blob();
        download(blob, `interview-backup-${Date.now()}.sql`);
        setMsg("Đã tải file backup SQL.");
      } else {
        const res = await fetch("/api/admin/db", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, payload }),
        });
        const j = await res.json();
        if (!j.ok) throw new Error(j.error);
        setMsg(`Đã chạy ${action}.`);
        await reload();
      }
    } catch (e) {
      setMsg(`Lỗi: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const onImport = async (file: File) => {
    const text = await file.text();
    await admin("import", text);
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
        <Stat label="Message Turns" value={db?.counters?.turns ?? 0} icon="forum" tone="emerald" />
        <Stat label="CV Extracts" value={db?.counters?.cv ?? 0} icon="description" tone="amber" />
        <Stat label="Evaluations" value={db?.counters?.evaluations ?? 0} icon="verified" tone="rose" />
      </div>

      <div className="card p-space-md flex flex-col gap-space-md">
        <div className="flex flex-wrap items-end gap-space-sm">
          <Filter label="Provider" value={provider} onChange={setProvider} options={[["all", "Tất cả"], ["anthropic", "Anthropic"], ["openai", "OpenAI"], ["gemini", "Gemini"], ["custom", "Custom"]]} />
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
        <div className="card p-space-md flex items-center gap-space-sm">
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
                  <th key={h} className="px-space-md py-space-sm label-caps text-on-surface-variant uppercase">{h}</th>
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
                        onClick={async () => {
                          if (!confirm(`Xoá phiên ${s.id}?`)) return;
                          await fetch(`/api/sessions/${s.id}`, { method: "DELETE" });
                          await reload();
                        }}
                        className="btn btn-destructive text-label-code-sm py-1 px-2"
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
            Backup xuất ra file SQL chứa toàn bộ INSERT statements. Import cần file SQL cùng schema.
          </p>
          <div className="flex flex-wrap gap-space-sm">
            <button onClick={() => admin("backup")} className="btn btn-ghost" disabled={busy !== null}>
              <span className="material-symbols-outlined text-[18px]">download</span> Backup SQL
            </button>
            <label className="btn btn-ghost cursor-pointer">
              <span className="material-symbols-outlined text-[18px]">upload</span> Import SQL
              <input
                type="file"
                accept=".sql,text/plain"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
              />
            </label>
            <a href="/api/admin/schema" target="_blank" className="btn btn-ghost">
              <span className="material-symbols-outlined text-[18px]">code</span> Xem schema
            </a>
          </div>
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
      <select className="input cursor-pointer" value={value} onChange={(e) => onChange(e.target.value)}>
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
