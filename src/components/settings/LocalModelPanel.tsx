"use client";

/**
 * S15 — Panel model local (task 17.10 · FR-AI-12).
 *
 * Hiển thị:
 *   - Trạng thái Ollama (online / offline) — dùng `/api/ai/models`.
 *   - Danh sách model local đã cài + kích thước.
 *   - Cho phép chọn model cho từng task local (ghi đè qua `/api/settings/route-override`).
 *
 * Vì sao cần bảng `RouteOverride`:
 *   `ROUTES` trong `router.ts` là hằng số `const` — không sửa được lúc chạy.
 *   Người dùng chọn model khác ở đây → ghi vào bảng → `resolveRoute()` đọc lại.
 *
 * Xem tasks.md 17.10 · design.md §6.1 / §6.9.
 */

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Label } from "@/components/ui/Card";
import { Badge, Chip, Stat, StatusDot } from "@/components/ui/Chip";
import { Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toaster";
import { LOCAL_TASK_IDS, LOCAL_TASK_LABELS, type LocalTaskId } from "@/lib/ai/tasks";

/** Model local đã cài — đọc từ `/api/ai/models`. */
type LocalModel = { name: string; size: number };

/** Ghi đè model cho 1 task — đọc từ `/api/settings/route-override`. */
type RouteOverride = { task: string; model: string };

export function LocalModelPanel({
  initialOverrides,
}: {
  /** Ghi đè hiện tại — server đọc từ bảng `RouteOverride`. */
  initialOverrides: RouteOverride[];
}) {
  const { toast } = useToast();
  const [available, setAvailable] = useState(false);
  const [models, setModels] = useState<LocalModel[]>([]);
  const [baseUrl, setBaseUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState<RouteOverride[]>(initialOverrides);
  const [savingTask, setSavingTask] = useState<string | null>(null);

  // Dò Ollama + lấy danh sách model.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/models");
        const json = await res.json();
        if (cancelled) return;
        setAvailable(Boolean(json.available));
        setModels(Array.isArray(json.models) ? json.models : []);
        setBaseUrl(json.baseUrl ?? "");
      } catch {
        if (!cancelled) setAvailable(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Model đang dùng cho 1 task — override nếu có, không thì "mặc định". */
  const currentModel = (task: LocalTaskId): string => {
    const found = overrides.find((o) => o.task === task);
    return found?.model ?? "";
  };

  /** Ghi đè model cho 1 task local. */
  const saveOverride = async (task: LocalTaskId, model: string) => {
    const previous = overrides;
    setSavingTask(task);

    if (model === "") {
      // Xoá override → dùng lại model mặc định trong ROUTES.
      setOverrides((prev) => prev.filter((o) => o.task !== task));
    } else {
      setOverrides((prev) => [...prev.filter((o) => o.task !== task), { task, model }]);
    }

    try {
      const res = await fetch("/api/settings/route-override", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task, model }),
      });
      const json = await res.json();
      if (!json.ok) {
        setOverrides(previous);
        toast({ tone: "error", title: "Lỗi", description: json.error?.message ?? "Không lưu được model." });
        return;
      }
      toast({
        tone: "success",
        title: "Đã cập nhật model local",
        description: `${LOCAL_TASK_LABELS[task]} → ${model || "mặc định"}`,
      });
    } catch {
      setOverrides(previous);
      toast({ tone: "error", title: "Lỗi", description: "Không kết nối được server." });
    } finally {
      setSavingTask(null);
    }
  };

  return (
    <Card padded>
      <CardHeader
        title="Panel Model Local (Ollama)"
        subtitle="Provider local chạy offline — 0 token, 0 chi phí"
        icon="memory"
        action={
          <div className="flex items-center gap-2">
            <StatusDot tone={available ? "primary" : "outline"} pulse={available} />
            <Badge tone={available ? "primary" : "outline"}>{available ? "ONLINE" : "OFFLINE"}</Badge>
          </div>
        }
      />

      {loading ? (
        <Label>Đang dò Ollama...</Label>
      ) : !available ? (
        <div className="space-y-2">
          <Label>
            Không kết nối được Ollama tại <code className="font-code-md">{baseUrl || "http://localhost:11434"}</code>.
          </Label>
          <p className="text-body-sm text-on-surface-variant">
            Khởi động Ollama rồi cài model:{" "}
            <code className="font-code-md text-primary">ollama pull qwen2.5:7b</code>
          </p>
        </div>
      ) : (
        <div className="space-y-gutter">
          <div className="grid gap-gutter sm:grid-cols-3">
            <Stat label="Model đã cài" value={models.length.toLocaleString("vi-VN")} hint="model local" icon="memory" />
            <Stat
              label="Tổng dung lượng"
              value={formatBytes(models.reduce((s, m) => s + m.size, 0))}
              hint="trên đĩa"
              icon="storage"
            />
            <Stat label="Endpoint" value={baseUrl || "—"} hint="Ollama" icon="terminal" />
          </div>

          {models.length === 0 ? (
            <Label>Chưa có model nào. Chạy `ollama pull qwen2.5:7b` để bắt đầu.</Label>
          ) : (
            <div className="flex flex-wrap gap-2">
              {models.map((m) => (
                <Chip key={m.name} tone="secondary" icon="memory">
                  {m.name} · {formatBytes(m.size)}
                </Chip>
              ))}
            </div>
          )}

          {/* Chọn model cho từng task local */}
          <div className="border-t border-outline-variant/30 pt-gutter space-y-3">
            <span className="font-label-sm uppercase tracking-widest text-outline">
              Ghi đè model theo tính năng
            </span>
            <div className="grid gap-gutter sm:grid-cols-2">
              {LOCAL_TASK_IDS.map((task) => (
                <div key={task} className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Select
                      label={LOCAL_TASK_LABELS[task]}
                      value={currentModel(task)}
                      onChange={(e) => void saveOverride(task, e.target.value)}
                      disabled={savingTask === task}
                    >
                      <option value="">Mặc định (ROUTES)</option>
                      {models.map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {savingTask === task ? (
                    <span className="font-label-sm text-outline">...</span>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="text-body-sm text-on-surface-variant">
              Ghi đè chỉ áp dụng cho 7 task chạy provider local. Task cloud luôn dùng model Anthropic.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Định dạng byte → MB/GB cho dễ đọc. */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
