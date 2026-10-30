"use client";

/**
 * S15 — Tab 3 "Chi phí AI & Prompt Caching" (tasks.md 17.1–17.11).
 *
 * Hiển thị toàn bộ số liệu chi phí từ `AiCall` — không bao giờ hardcode con số
 * mockup (design.md §4.15). Gồm:
 *   - Thanh ngân sách tháng + cảnh báo ≥80%.
 *   - Card cache: cacheRead tổng, hit rate, số lượt ok/fallback, độ trễ TB.
 *   - Badge "Prompt Cache Engine: ACTIVE" + Cache Hit Rate %.
 *   - Nút xuất CSV / JSON, toggle thứ tự sổ, phân trang, eye (ẩn/hiện cột).
 *   - Toggle chế độ khẩn cấp tiết kiệm.
 *
 * Xem tasks.md 17.1, 17.2, 17.5, 17.6, 17.11.
 */

import { use, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Label } from "@/components/ui/Card";
import { Badge, Chip, ProgressBar, Stat, StatusDot } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toaster";
import type { TableData } from "@/lib/settings/cost-data";

import { CostBar } from "./CostBar";
import { CostTable } from "./CostTable";
import { CallLogTable } from "./CallLogTable";
import { LocalModelPanel } from "./LocalModelPanel";

/** Định dạng số thành VNĐ / USD tùy settings. */
function formatMoney(value: number): string {
  if (value === 0) return "$0.00";
  return `$${value.toFixed(2)}`;
}

/** Định dạng phần trăm (trong 1 chữ số thập phân). */
function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Chuyển Date ISO → chuỗi đọc dễ trên UI. */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("vi-VN")} ${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
}

export function CostTab({
  dataPromise,
  routeOverrides,
}: {
  dataPromise: Promise<TableData>;
  /** Ghi đè model local hiện tại — server đọc từ bảng `RouteOverride`. */
  routeOverrides: Array<{ task: string; model: string }>;
}) {
  const { budget, cache, aggregate, providers, features, rows, calls, emergencyMode } = use(dataPromise);
  const { toast } = useToast();
  const [emergency, setEmergency] = useState(emergencyMode);
  /** Sắp xếp nhật ký theo thời gian (toggle 17.5). */
  const [sortAsc, setSortAsc] = useState(false);
  /** Ô nhập ngân sách tháng (17.1). */
  const [budgetInput, setBudgetInput] = useState(budget.budget > 0 ? String(budget.budget) : "");
  const [savingBudget, setSavingBudget] = useState(false);

  /** Nhật ký đã sắp xếp — `calls` mặc định mới → cũ. */
  const sortedCalls = useMemo(
    () =>
      sortAsc
        ? [...calls].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        : [...calls].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [calls, sortAsc],
  );

  /** Badge trạng thái cache engine — luôn ACTIVE nếu có lịch sử gọi. */
  const cacheActive = cache.totalCacheRead > 0 || aggregate.totalCalls > 0;

  /** Xuất CSV. */
  const exportCsv = () => {
    const csvRows = sortedCalls.map((c) => [
      formatDateTime(c.createdAt),
      c.feature,
      c.provider,
      c.model,
      c.ok ? "ok" : "error",
      c.inputTokens,
      c.outputTokens,
      c.cacheRead,
      formatMoney(c.estimatedCost),
      c.latencyMs,
      c.fallbackFrom ?? "",
    ]);
    const header = ["Thời gian", "Tính năng", "Provider", "Model", "Trạng thái", "Input", "Output", "Cache Read", "Chi phí", "Latency(ms)", "Fallback từ"];
    const csv = [header, ...csvRows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-loop-cost-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ tone: "success", title: "Đã xuất CSV", description: `${sortedCalls.length} bản ghi.` });
  };

  /** Xuất JSON. */
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(sortedCalls, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-loop-calls-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ tone: "success", title: "Đã xuất JSON", description: `${sortedCalls.length} bản ghi.` });
  };

  /** Xuất toàn bộ DB (JSON) — gọi `/api/export` rồi tải file. */
  const exportWholeDb = async () => {
    try {
      const res = await fetch("/api/export", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `daily-loop-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ tone: "success", title: "Đã xuất toàn bộ DB", description: "File backup JSON đã tải xuống." });
    } catch {
      toast({ tone: "error", title: "Lỗi", description: "Không xuất được file." });
    }
  };

  /** Lưu ngân sách tháng (task 17.1). */
  const saveBudget = async () => {
    const raw = budgetInput.trim();
    const value = raw === "" ? null : Number(raw);

    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      toast({ tone: "error", title: "Lỗi", description: "Ngân sách phải là số ≥ 0." });
      return;
    }

    setSavingBudget(true);
    try {
      const res = await fetch("/api/settings/budget", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ monthlyBudgetUsd: value }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({
          tone: "success",
          title: "Đã lưu ngân sách",
          description: value === null ? "Đã bỏ giới hạn ngân sách." : `Ngân sách: ${formatMoney(value)} / tháng.`,
        });
      } else {
        toast({ tone: "error", title: "Lỗi", description: json.error?.message ?? "Không lưu được." });
      }
    } catch {
      toast({ tone: "error", title: "Lỗi", description: "Không kết nối được tới server." });
    } finally {
      setSavingBudget(false);
    }
  };

  /** Bật/tắt chế độ khẩn cấp tiết kiệm (task 17.6). */
  const toggleEmergencyMode = async () => {
    const next = !emergency;
    setEmergency(next);
    try {
      const res = await fetch("/api/settings/emergency", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emergencyMode: next }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({
          tone: "success",
          title: next ? "Chế độ tiết kiệm đã bật" : "Chế độ tiết kiệm đã tắt",
          description: next
            ? "Task cloud sẽ dùng claude-haiku-4-5; task local giữ nguyên Ollama."
            : "Đã khôi phục bảng định tuyến gốc.",
        });
      } else {
        // Revert UI nếu server lỗi.
        setEmergency(!next);
        toast({ tone: "error", title: "Lỗi", description: json.error?.message ?? "Không cập nhật được trạng thái." });
      }
    } catch {
      setEmergency(!next);
      toast({ tone: "error", title: "Lỗi", description: "Không kết nối được tới server." });
    }
  };

  return (
    <div className="space-y-gutter">
      {/* ── Dải trạng thái cache engine (17.11) ── */}
      <Card tone="low" padded>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusDot tone={cacheActive ? "primary" : "outline"} pulse={cacheActive} />
            <span className="font-label-md text-on-surface">Prompt Cache Engine</span>
            <Badge tone="tertiary">ACTIVE</Badge>
          </div>
          <div className="flex items-center gap-4">
            <Stat
              label="Cache Hit Rate"
              value={`${formatPercent(cache.hitRate)}`}
              hint={`Từ ${formatMoney(aggregate.totalCost)} • ${aggregate.totalCalls} lượt`}
            />
            <Stat
              label="cacheRead tổng"
              value={cache.totalCacheRead.toLocaleString("vi-VN")}
              hint="tokens"
            />
          </div>
        </div>
      </Card>

      {/* ── Card cache (17.2) ── */}
      <div className="grid gap-gutter md:grid-cols-4">
        <Stat
          label="Tổng cacheRead"
          value={cache.totalCacheRead.toLocaleString("vi-VN")}
          hint="tokens"
          icon="cached"
        />
        <Stat
          label="Hit Rate"
          value={`${formatPercent(cache.hitRate)}`}
          hint="cacheRead / (cacheRead + inputTokens)"
          icon="percent"
        />
        <Stat
          label="Lượt ok / fallback"
          value={`${cache.okCalls}/${cache.fallbackCalls}`}
          hint="offline fallback"
          icon="cloud_off"
        />
        <Stat
          label="Độ trễ TB"
          value={`${cache.avgLatencyMs.toFixed(0)} ms`}
          hint="từ createdAt kế tiếp − trước"
          icon="schedule"
        />
      </div>

      {/* ── Thanh ngân sách tháng (17.1) ── */}
      <Card padded>
        <CardHeader
          title="Ngân sách tháng này"
          subtitle={
            budget.budget > 0
              ? `${formatMoney(budget.spent)} / ${formatMoney(budget.budget)} — ${formatPercent(budget.percent)}`
              : "Chưa đặt ngân sách"
          }
          icon="account_balance_wallet"
        />
        {budget.budget > 0 ? (
          <div className="space-y-2">
            <ProgressBar value={budget.percent} tone={budget.warning || budget.percent >= 100 ? "tertiary" : "primary"} />
            {budget.warning ? (
              <Chip tone="error" icon="warning">
                Cảnh báo: chi phí đã đạt {formatPercent(budget.percent)} ngân sách
              </Chip>
            ) : null}
            {budget.percent >= 100 ? (
              <Chip tone="error" icon="error">
                Đã vượt quá ngân sách!
              </Chip>
            ) : null}
          </div>
        ) : (
          <Label>Chưa đặt ngân sách — nhập bên dưới để bật theo dõi chi phí.</Label>
        )}

        {/* Ô đặt ngân sách — ghi vào `UserProfile.monthlyBudgetUsd`. */}
        <div className="mt-gutter flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Input
              id="cost-budget"
              type="number"
              min={0}
              step={0.5}
              label="Ngân sách tháng (USD)"
              hint="Để trống = không giới hạn."
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              placeholder="VD: 5"
            />
          </div>
          <Button variant="secondary" icon="save" loading={savingBudget} onClick={saveBudget}>
            Lưu ngân sách
          </Button>
        </div>
      </Card>

      {/* ── Toggle chế độ khẩn cấp (17.6) ── */}
      <Card padded>
        <CardHeader
          title="Chế độ khẩn cấp tiết kiệm"
          subtitle={
            emergency
              ? "Đang bật — task cloud dùng claude-haiku-4-5"
              : "Đang tắt — dùng bảng định tuyến gốc"
          }
          icon="savings"
          action={
            <Button variant={emergency ? "primary" : "secondary"} icon="power_settings_new" onClick={toggleEmergencyMode}>
              {emergency ? "Tắt chế độ" : "Bật chế độ"}
            </Button>
          }
        />
      </Card>

      {/* ── CostBar: phân bổ chi phí theo 8 feature (17.3) ── */}
      <CostBar features={features} providers={providers} />

      {/* ── Toolbar xuất / toggle / eye / phân trang (17.5) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon="download" onClick={exportCsv}>
            Xuất CSV
          </Button>
          <Button variant="secondary" size="sm" icon="download" onClick={exportJson}>
            Xuất JSON (AiCall)
          </Button>
          <Button variant="secondary" size="sm" icon="import_export" onClick={exportWholeDb}>
            Toàn bộ DB (JSON)
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={sortAsc ? "arrow_upward" : "arrow_downward"}
            onClick={() => setSortAsc((v) => !v)}
          >
            {sortAsc ? "Cũ → Mới" : "Mới → Cũ"}
          </Button>
        </div>
      </div>

      {/* ── Bảng chi tiết provider/model (17.4) ── */}
      <CostTable rows={rows} />

      {/* ── Bảng nhật ký gọi API gần nhất (17.4) ── */}
      <CallLogTable calls={sortedCalls} />

      {/* ── Panel model local (17.10) ── */}
      <LocalModelPanel initialOverrides={routeOverrides} />
    </div>
  );
}
