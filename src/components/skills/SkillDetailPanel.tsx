"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Label } from "@/components/ui/Card";
import { Badge, ProgressSegments, Stat } from "@/components/ui/Chip";
import { Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toaster";
import { DOMAIN_LABELS, DOMAINS, type Domain } from "@/lib/types";
import type { SkillNodeDTO } from "@/lib/skills-data";
import { useState } from "react";

/**
 * Panel chi tiết node đang chọn (task 7.2 / 7.3 / 7.4).
 *
 * - "Đặt làm trọng tâm hôm nay" → `POST /api/skills/focus` (route này gọi
 *   `setFocusTarget` trong `src/lib/focus.ts`). S01 đọc `getFocusSkill()` nên
 *   trọng tâm tự đồng bộ sang S01 — chỉ 1 node/ngày (FR-SK-01).
 * - "Luyện tập đo lường ngay" → `POST /api/log` với `source:"practice"`,
 *   `createEvidence:true`, `rating:3` → tạo đúng 1 Activity + 1 Evidence.
 * - "Tạo mục kỹ năng con" → `POST /api/skills` (name, domain, parent, targetLevel).
 *
 * Xem tasks.md 7.2 / 7.3 / 7.4 · design.md §4.3.
 */

export function SkillDetailPanel({
  node,
  focusId,
  onFocusChanged,
  onNodeCreated,
}: {
  /** Node đang chọn — `null` khi chưa chọn gì. */
  node: SkillNodeDTO | null;
  /** Id node đang là trọng tâm hôm nay. */
  focusId: string | null;
  /** Callback sau khi đổi trọng tâm (parent refresh lại danh sách). */
  onFocusChanged: (skillId: string | null) => void;
  /** Callback sau khi tạo mục con (parent thêm node mới vào cây). */
  onNodeCreated: (skillId: string) => void;
}) {
  const { toast } = useToast();

  const [focusing, setFocusing] = useState(false);
  const [practicing, setPracticing] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form "tạo mục kỹ năng con".
  const [showForm, setShowForm] = useState(false);
  const [childName, setChildName] = useState("");
  const [childDomain, setChildDomain] = useState<Domain>("professional");
  const [childTarget, setChildTarget] = useState(3);

  if (!node) {
    return (
      <Card tone="base" className="flex h-full items-center justify-center">
        <div className="py-gutter-lg text-center">
          <span
            className="material-symbols-outlined text-outline"
            style={{ fontSize: "2.5rem" }}
            aria-hidden
          >
            account_tree
          </span>
          <p className="mt-space-md text-body-md text-on-surface-variant">
            Chọn một node trong cây để xem chi tiết và thao tác.
          </p>
        </div>
      </Card>
    );
  }

  const isFocus = focusId === node.id;

  /** Đặt / bỏ trọng tâm hôm nay. */
  const handleFocus = async () => {
    setFocusing(true);
    try {
      const res = await fetch("/api/skills/focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: node.id, clear: isFocus }),
      });
      const data = (await res.json()) as
        | { ok: true; data: { skillId: string | null } }
        | { ok: false; error: { code: string; message: string } };
      if (!data.ok) {
        toast({ tone: "error", title: "Không đổi được trọng tâm", description: data.error.message });
        return;
      }
      onFocusChanged(data.data.skillId);
      toast({
        tone: "success",
        title: isFocus ? "Đã bỏ trọng tâm" : "Đã đặt trọng tâm hôm nay",
        description: isFocus ? undefined : `S01 sẽ ưu tiên "${node.name}" hôm nay.`,
      });
    } catch {
      toast({ tone: "error", title: "Không kết nối được máy chủ", description: "Thử lại sau." });
    } finally {
      setFocusing(false);
    }
  };

  /**
   * "Luyện tập đo lường ngay" → 1 Activity + 1 Evidence gắn node này.
   *
   * `rating: 3` là mặc định trung tính — người dùng chưa tự chấm nên không
   * được tự động cho điểm cao (FR-SK-03: chỉ rating >= 3 mới tăng level).
   */
  const handlePractice = async () => {
    setPracticing(true);
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "practice",
          domain: node.domain,
          type: "study",
          title: `Luyện tập đo lường: ${node.name}`,
          content: "Phiên luyện tập đo lường nhanh tạo từ cây kỹ năng.",
          minutes: 25,
          skillId: node.id,
          rating: 3,
          createEvidence: true,
        }),
      });
      const data = (await res.json()) as
        | { ok: true; data: { activityId: string; evidenceId: string | null } }
        | { ok: false; error: { code: string; message: string } };
      if (!data.ok) {
        toast({ tone: "error", title: "Ghi bằng chứng thất bại", description: data.error.message });
        return;
      }
      toast({
        tone: "success",
        title: "Đã ghi 1 bằng chứng",
        description: `${node.name} +1 evidence (rating 3).`,
      });
    } catch {
      toast({ tone: "error", title: "Không ghi được bằng chứng", description: "Thử lại sau." });
    } finally {
      setPracticing(false);
    }
  };

  /** Tạo mục kỹ năng con — FR-SK-04. */
  const handleCreateChild = async () => {
    if (childName.trim().length === 0) {
      toast({ tone: "warning", title: "Cần nhập tên mục kỹ năng" });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: childName.trim(),
          domain: childDomain,
          parentId: node.id,
          targetLevel: childTarget,
        }),
      });
      const data = (await res.json()) as
        | { ok: true; data: { id: string; name: string } }
        | { ok: false; error: { code: string; message: string } };
      if (!data.ok) {
        toast({ tone: "error", title: "Không tạo được mục con", description: data.error.message });
        return;
      }
      toast({
        tone: "success",
        title: `Đã tạo "${data.data.name}"`,
        description: "Mục kỹ năng con bắt đầu ở level 0.",
      });
      setChildName("");
      setShowForm(false);
      onNodeCreated(data.data.id);
    } catch {
      toast({ tone: "error", title: "Không tạo được mục con", description: "Thử lại sau." });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card tone="base" data-testid="skill-detail-panel">
      <CardHeader
        title={node.name}
        subtitle={`${DOMAIN_LABELS[node.domain]} · mục cha: ${node.parentId ? "có" : "gốc domain"}`}
        icon="account_tree"
        action={
          isFocus ? <Badge tone="primary">Trọng tâm hôm nay</Badge> : null
        }
      />

      <div className="grid grid-cols-2 gap-gutter">
        <Stat
          label="Cấp độ"
          value={
            <span className="font-code-md">
              {node.level}/{node.targetLevel}
            </span>
          }
          hint={`Mục tiêu cấp ${node.targetLevel}`}
        />
        <Stat
          label="Bằng chứng"
          value={node.evidenceCount}
          hint={`${node.qualifyingCount} bằng chứng ≥ 3★`}
        />
        <Stat
          label="Thời gian tích lũy"
          value={`${(node.minutes / 60).toFixed(1)}h`}
          hint={`${node.minutes} phút`}
        />
        <Stat
          label="Điểm trung bình"
          value={node.averageRating > 0 ? node.averageRating : "—"}
          hint="Thang 1–4"
        />
      </div>

      <div className="mt-gutter">
        <Label>Tiến trình lên mục tiêu</Label>
        <ProgressSegments
          current={node.level}
          total={Math.max(node.targetLevel, node.level, 1)}
          className="mt-space-xs"
        />
      </div>

      <div className="mt-gutter flex flex-col gap-space-sm">
        <Button
          variant="primary"
          icon="play_circle"
          onClick={handlePractice}
          loading={practicing}
          disabled={focusing || creating}
          data-testid="practice-now"
        >
          Luyện tập đo lường ngay
        </Button>

        <Button
          variant={isFocus ? "secondary" : "ghost"}
          icon="adjust"
          onClick={handleFocus}
          loading={focusing}
          disabled={practicing || creating}
          data-testid="set-focus"
        >
          {isFocus ? "Bỏ trọng tâm hôm nay" : "Đặt làm trọng tâm hôm nay"}
        </Button>

        <Button
          variant="ghost"
          icon="add_box"
          onClick={() => setShowForm((v) => !v)}
          disabled={practicing || focusing}
          aria-expanded={showForm}
          data-testid="toggle-child-form"
        >
          + Thêm mục con
        </Button>
      </div>

      {showForm ? (
        <div className="mt-gutter space-y-space-md rounded-lg border border-outline-variant/30 bg-surface-container-low p-gutter">
          <Label>Tạo mục kỹ năng con (FR-SK-04)</Label>

          <Input
            label="Tên mục kỹ năng"
            value={childName}
            maxLength={120}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="Ví dụ: Phân tích yêu cầu"
            data-testid="child-name"
          />

          <Select
            label="Domain"
            value={childDomain}
            onChange={(e) => setChildDomain(e.target.value as Domain)}
          >
            {DOMAINS.map((d) => (
              <option key={d} value={d}>
                {DOMAIN_LABELS[d]}
              </option>
            ))}
          </Select>

          <Select
            label="Mức mục tiêu"
            value={String(childTarget)}
            onChange={(e) => setChildTarget(Number(e.target.value))}
          >
            {[0, 1, 2, 3, 4, 5].map((lv) => (
              <option key={lv} value={lv}>
                Cấp {lv}
              </option>
            ))}
          </Select>

          <div className="flex flex-col gap-space-sm">
            <Button
              variant="primary"
              onClick={handleCreateChild}
              loading={creating}
              disabled={practicing || focusing}
              data-testid="create-child"
            >
              Lưu mục kỹ năng con
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)} disabled={creating}>
              Huỷ
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
