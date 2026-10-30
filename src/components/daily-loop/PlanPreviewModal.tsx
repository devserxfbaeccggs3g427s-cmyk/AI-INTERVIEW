"use client";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toaster";
import { DOMAIN_CHIP_CLASS } from "@/lib/ui";
import { DOMAIN_LABELS, type PlanSlot } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * `PlanPreviewModal` — "Lập lại kế hoạch hôm nay (AI)" (task 4.11).
 *
 * Luồng:
 *   1. Mở modal → `POST /api/plan/generate` với `{ apply: false }` → nhận
 *      6 slot MỚI (chưa ghi DB).
 *   2. So sánh với 6 slot HIỆN TẠI → hiện diff (thêm / sửa / giữ).
 *   3. Bấm "Áp dụng" → `POST /api/plan/generate` với `{ apply: true }`.
 *
 * Slot đã `done` được **giữ nguyên** — FR-DL-06. Việc giữ đó do server thực
 * hiện (`applyPlanSlots`), phía UI chỉ hiển thị để người dùng thấy trước.
 *
 * ⚠️ Route `/api/plan/generate` là file của agent khác — mọi lời gọi đều bọc
 * try/catch để trang KHÔNG crash nếu route chưa sẵn sàng (design.md §7.2).
 *
 * Xem design.md §4.1 / §7.2 · requirements.md FR-DL-06.
 */
export function PlanPreviewModal({
  currentSlots,
  open,
  onClose,
}: {
  currentSlots: PlanSlot[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [preview, setPreview] = useState<PlanSlot[] | null>(null);
  const [meta, setMeta] = useState<{ provider: string; model: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mỗi lần mở → gọi AI lấy preview mới.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      setPreview(null);
      try {
        const res = await fetch("/api/plan/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apply: false }),
        });
        const payload = (await res.json()) as {
          ok: boolean;
          data?: { slots: PlanSlot[]; meta?: { provider: string; model: string } };
          error?: { code: string; message: string };
        };

        if (cancelled) return;

        if (!res.ok || !payload.ok || !payload.data) {
          setError(payload.error?.message ?? "Không sinh được kế hoạch mới.");
          return;
        }

        setPreview(payload.data.slots);
        setMeta(payload.data.meta ?? null);
      } catch {
        if (!cancelled) {
          setError("Không kết nối được tới máy chủ — thử lại sau.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const apply = async () => {
    if (applying) return;
    setApplying(true);
    try {
      const res = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true }),
      });
      const payload = (await res.json()) as {
        ok: boolean;
        error?: { code: string; message: string };
      };

      if (!res.ok || !payload.ok) {
        toast({
          tone: "error",
          title: "Không áp dụng được",
          description: payload.error?.message ?? "Thử lại sau.",
        });
        return;
      }

      toast({
        tone: "success",
        title: "Đã lập lại kế hoạch",
        description: "Slot đã hoàn thành được giữ nguyên.",
      });
      onClose();
      router.refresh();
    } catch {
      toast({
        tone: "error",
        title: "Không áp dụng được",
        description: "Mất kết nối — thử lại sau.",
      });
    } finally {
      setApplying(false);
    }
  };

  const diffs = preview ? buildDiff(currentSlots, preview) : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lập lại kế hoạch hôm nay (AI)"
      subtitle="Xem trước thay đổi trước khi áp dụng. Hành động đã hoàn thành được giữ nguyên."
      icon="auto_awesome"
      width="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={applying}>
            Huỷ
          </Button>
          <Button
            variant="primary"
            onClick={apply}
            loading={applying}
            disabled={loading || !preview}
            icon="check"
          >
            Áp dụng
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-gutter" aria-live="polite">
        {meta ? (
          <div className="flex flex-wrap items-center gap-space-sm text-body-sm text-on-surface-variant">
            <span className="font-label-sm uppercase tracking-widest text-outline">Provider</span>
            <Badge tone={meta.provider === "local" ? "secondary" : "primary"}>
              {meta.provider === "local" ? "Local" : "Anthropic"} · {meta.model}
            </Badge>
          </div>
        ) : null}

        {loading ? (
          <p className="text-body-md text-on-surface-variant">Đang sinh kế hoạch mới…</p>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-error/40 bg-error-container/20 p-gutter">
            <p className="text-body-md text-error">{error}</p>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Kế hoạch hiện tại vẫn giữ nguyên — bạn có thể đóng modal này.
            </p>
          </div>
        ) : null}

        {preview ? (
          <div className="flex flex-col gap-space-md">
            {diffs.map((d) => (
              <div
                key={d.slot}
                className="rounded-lg border border-outline-variant/30 bg-surface-container-low p-gutter"
              >
                <div className="flex flex-wrap items-center gap-space-sm">
                  <span
                    className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-label-md ${DOMAIN_CHIP_CLASS[d.domain]}`}
                  >
                    Slot {d.slot + 1} · {DOMAIN_LABELS[d.domain]}
                  </span>
                  <Badge tone={d.kind === "keep" ? "outline" : d.kind === "add" ? "primary" : "tertiary"}>
                    {d.kind === "keep" ? "Giữ nguyên" : d.kind === "add" ? "Thêm mới" : "Thay đổi"}
                  </Badge>
                  {d.current?.done ? <Badge tone="tertiary">Đã xong — giữ nguyên</Badge> : null}
                </div>

                {d.kind === "change" ? (
                  <div className="mt-space-md grid grid-cols-1 gap-space-md sm:grid-cols-2">
                    <div>
                      <div className="font-label-sm uppercase tracking-widest text-outline">Hiện tại</div>
                      <p className="text-body-sm text-on-surface-variant line-through">
                        {d.current?.action ?? "—"} · {d.current?.minutes ?? 0}′
                      </p>
                    </div>
                    <div>
                      <div className="font-label-sm uppercase tracking-widest text-outline">Mới</div>
                      <p className="text-body-sm text-on-surface">
                        {d.next?.action ?? "—"} · {d.next?.minutes ?? 0}′
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-space-sm text-body-md text-on-surface">
                    {d.next?.action ?? d.current?.action ?? "—"}
                  </p>
                )}

                {d.next?.detail ? (
                  <p className="mt-1 text-body-sm text-on-surface-variant">{d.next.detail}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

type DiffKind = "keep" | "change" | "add";

type DiffRow = {
  slot: number;
  domain: PlanSlot["domain"];
  kind: DiffKind;
  current: PlanSlot | null;
  next: PlanSlot | null;
};

/**
 * Wrapper client: giữ state mở/đóng + nút CTA.
 *
 * `page.tsx` là Server Component nên không tự quản lý `open` được — state
 * phải nằm trong 1 component client, ta gói cả nút + modal vào đây.
 */
export function PlanPreviewTrigger({ currentSlots }: { currentSlots: PlanSlot[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ai" size="sm" icon="auto_awesome" onClick={() => setOpen(true)}>
        Lập lại kế hoạch hôm nay (AI)
      </Button>
      <PlanPreviewModal
        currentSlots={currentSlots}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/**
 * So sánh slot hiện tại với slot mới.
 *
 * - `add`    — hôm nay chưa có slot này.
 * - `change` — nội dung/thời lượng khác.
 * - `keep`   — giống nhau (hoặc slot hiện tại đã `done` → giữ nguyên theo
 *              FR-DL-06).
 */
export function buildDiff(current: PlanSlot[], next: PlanSlot[]): DiffRow[] {
  const bySlot = new Map(current.map((s) => [s.slot, s]));
  const rows: DiffRow[] = [];

  for (const n of next) {
    const c = bySlot.get(n.slot) ?? null;
    if (!c) {
      rows.push({ slot: n.slot, domain: n.domain, kind: "add", current: null, next: n });
      continue;
    }
    if (c.done) {
      // Slot đã xong → server sẽ giữ nguyên; đánh dấu "keep".
      rows.push({ slot: n.slot, domain: c.domain, kind: "keep", current: c, next: n });
      continue;
    }
    const same = c.action === n.action && c.minutes === n.minutes && c.detail === n.detail;
    rows.push({ slot: n.slot, domain: c.domain, kind: same ? "keep" : "change", current: c, next: n });
  }

  return rows.sort((a, b) => a.slot - b.slot);
}
