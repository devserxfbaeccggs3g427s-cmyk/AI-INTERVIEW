import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { EvidenceEntryDTO } from "@/lib/skills";

/**
 * Nhật ký bằng chứng (FR-SK-05, FR-SK-12).
 *
 * ⚠️ NFR-SK-05 — bảng là `<table>` semantic (không dùng `div` giả bảng).
 * ⚠️ FR-SK-12 — mỗi dòng hiện mã định danh ngắn 6 ký tự + trạng thái
 * `DB Local: Active` để đối chiếu cục bộ.
 */
export interface EvidenceLogProps {
  evidence: EvidenceEntryDTO[];
  /** Tổng số bằng chứng (để hiện "xem toàn bộ"). */
  total: number;
  /** Đã hiện tối đa bao nhiêu. */
  shown?: number;
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  study: "Học",
  speak_write: "Luyện giao tiếp",
  srs: "Ôn SRS",
  language: "Luyện ngoại ngữ",
  journal: "Nhật ký",
  health: "Thể chất",
  deep_work: "Deep work",
};

function formatDateVi(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

  if (sameDay) return `Hôm nay, ${time}`;

  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}, ${time}`;
}

export function EvidenceLog({ evidence, total, shown }: EvidenceLogProps) {
  const rows = shown ? evidence.slice(0, shown) : evidence;

  if (evidence.length === 0) {
    return (
      <div className="rounded-xl bg-surface-container-low p-space-lg">
        <h2 className="font-headline-md text-headline-md text-on-surface">
          Nhật ký bằng chứng
        </h2>
        <p className="mt-space-sm text-body-md text-body-md text-on-surface-variant">
          Chưa có bằng chứng nào cho kỹ năng này. Hoàn thành một hành động ở{" "}
          <Link href="/" className="text-primary underline">
            Hôm nay
          </Link>{" "}
          để ghi nhật.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface-container-low p-space-lg">
      <div className="flex items-center justify-between gap-space-sm">
        <h2 className="font-headline-md text-headline-md text-on-surface">
          Nhật ký bằng chứng
        </h2>
        <span className="rounded-full bg-surface-container-high px-3 py-1 font-code-md text-code-md text-on-surface-variant tabular">
          {evidence.length} / {total}
        </span>
      </div>

      {/* NFR-SK-02 — bảng cuộn ngang trên mobile */}
      <div className="mt-space-md overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-outline-variant/40">
              <th scope="col" className="pb-space-sm pr-space-md font-label-sm text-label-sm uppercase tracking-wider text-outline">
                Ngày
              </th>
              <th scope="col" className="pb-space-sm pr-space-md font-label-sm text-label-sm uppercase tracking-wider text-outline">
                Loại hoạt động
              </th>
              <th scope="col" className="pb-space-sm pr-space-md font-label-sm text-label-sm uppercase tracking-wider text-outline">
                Tiêu đề hoạt động & nội dung chứng minh
              </th>
              <th scope="col" className="pb-space-sm pr-space-md font-label-sm text-label-sm uppercase tracking-wider text-outline">
                Đánh giá
              </th>
              <th scope="col" className="pb-space-sm font-label-sm text-label-sm uppercase tracking-wider text-outline">
                SQLite State
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((entry) => (
              <tr key={entry.id} className="border-b border-outline-variant/20">
                <td className="py-space-sm pr-space-md align-top font-code-md text-code-md text-on-surface-variant tabular">
                  {formatDateVi(entry.createdAt)}
                </td>

                <td className="py-space-sm pr-space-md align-top font-label-sm text-label-sm text-on-surface-variant">
                  {entry.activityType
                    ? (ACTIVITY_TYPE_LABELS[entry.activityType] ?? entry.activityType)
                    : "—"}
                </td>

                <td className="py-space-sm pr-space-md align-top">
                  <span className="block text-body-sm text-body-sm text-on-surface">
                    {entry.activityTitle ?? "—"}
                  </span>
                  {entry.content && (
                    <span className="mt-space-xs block text-body-sm text-body-sm text-on-surface-variant">
                      {entry.content}
                    </span>
                  )}
                  {entry.minutes !== null && (
                    <span className="mt-space-xs block font-label-sm text-label-sm text-outline">
                      {entry.minutes} phút
                    </span>
                  )}
                </td>

                <td className="py-space-sm pr-space-md align-top">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-code-md text-code-md",
                      entry.rating >= 3
                        ? "bg-primary/15 text-primary"
                        : "bg-surface-container-highest text-on-surface-variant",
                    )}
                  >
                    <Icon name="star" size={12} />
                    {entry.rating}/4
                  </span>
                </td>

                <td className="py-space-sm align-top">
                  {/* FR-SK-12 — mã định danh ngắn để đối chiếu cục bộ */}
                  <span className="block font-code-md text-code-md text-on-surface-variant">
                    {entry.shortId}
                  </span>
                  <span className="mt-space-xs inline-flex items-center gap-1 font-label-sm text-label-sm text-primary">
                    <Icon name="lock" size={12} />
                    DB Local: Active
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
