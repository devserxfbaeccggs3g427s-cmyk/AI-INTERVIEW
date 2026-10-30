"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Chip";
import { Fragment, useState } from "react";
import type { EvidenceRowDTO } from "@/lib/skills-data";

/**
 * Bảng "Nhật ký bằng chứng" (task 7.10).
 *
 * Cột: Ngày · Loại hoạt động · Nội dung chứng minh · Rating · Hash SQLite ·
 * nút mở.
 *
 * Hash là **hash ổn định** của `evidence.id` (sha256 cắt 8 ký tự, xem
 * `evidenceHash` trong `src/lib/skills-data.ts`) → hiển thị mono (`font-code-md`).
 * Dữ liệu thật từ DB, không hardcode.
 *
 * Xem tasks.md 7.10 · design.md §4.4.
 */

/** Badge rating 1–4 — màu theo design.md §4.3 (4=primary, 3=tertiary, 2=secondary, 1=outline). */
function RatingCell({ rating }: { rating: number }) {
  const tone =
    rating >= 4 ? "primary" : rating === 3 ? "tertiary" : rating === 2 ? "secondary" : "outline";
  return (
    <Badge tone={tone} className="font-code-md">
      ★ {rating}/4
    </Badge>
  );
}

export function EvidenceTable({
  rows,
  className,
}: {
  rows: EvidenceRowDTO[];
  className?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Card tone="base" className={className} data-testid="evidence-table">
      <CardHeader
        title="Nhật ký bằng chứng"
        subtitle="Minh chứng năng lực lưu trữ cục bộ SQLite — mỗi dòng gắn hash ổn định."
        icon="fact_check"
        action={
          <Badge tone="neutral" className="font-code-md">
            {rows.length} bản ghi
          </Badge>
        }
      />

      {rows.length === 0 ? (
        <p className="text-body-sm text-outline">
          Chưa có bằng chứng nào cho kỹ năng này.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-body-sm">
            <caption className="sr-only">Nhật ký bằng chứng</caption>
            <thead>
              <tr className="border-b border-outline-variant/30 text-left">
                <th scope="col" className="py-space-sm pr-space-md font-label-md text-on-surface-variant">
                  Ngày
                </th>
                <th scope="col" className="py-space-sm pr-space-md font-label-md text-on-surface-variant">
                  Loại hoạt động
                </th>
                <th
                  scope="col"
                  className="py-space-sm pr-space-md font-label-md text-on-surface-variant"
                >
                  Nội dung chứng minh
                </th>
                <th scope="col" className="py-space-sm pr-space-md font-label-md text-on-surface-variant">
                  Đánh giá
                </th>
                <th scope="col" className="py-space-sm pr-space-md font-label-md text-on-surface-variant">
                  Hash SQLite
                </th>
                <th scope="col" className="py-space-sm font-label-md text-on-surface-variant">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOpen = openId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr className="border-b border-outline-variant/20 align-top">
                      <td className="py-space-sm pr-space-md font-code-md text-on-surface-variant whitespace-nowrap">
                        {row.date}
                      </td>
                      <td className="py-space-sm pr-space-md text-on-surface whitespace-nowrap">
                        {row.activityLabel}
                      </td>
                      <td className="py-space-sm pr-space-md text-on-surface">
                        <div className="font-medium">{row.title}</div>
                        {isOpen && row.content ? (
                          <p className="mt-0.5 text-body-sm text-on-surface-variant">
                            {row.content}
                          </p>
                        ) : null}
                        {isOpen ? (
                          <p className="mt-0.5 font-code-md text-label-sm text-outline">
                            {row.minutes} phút · {row.dateISO.slice(0, 16).replace("T", " ")}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-space-sm pr-space-md">
                        <RatingCell rating={row.rating} />
                      </td>
                      {/* Hash hiển thị mono. */}
                      <td className="py-space-sm pr-space-md font-code-md text-label-sm text-outline whitespace-nowrap">
                        {row.hash}
                      </td>
                      <td className="py-space-sm">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="open_in_new"
                          onClick={() => setOpenId(isOpen ? null : row.id)}
                          aria-expanded={isOpen}
                          aria-label={`Mở bằng chứng ${row.title}`}
                        >
                          {isOpen ? "Đóng" : "Mở"}
                        </Button>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="border-b border-outline-variant/20">
                        <td colSpan={6} className="py-space-sm">
                          <pre className="overflow-x-auto rounded-lg bg-surface-container-lowest p-space-md font-code-md text-label-sm text-on-surface-variant">
                            {`evidence.id : ${row.id}\nactivity     : ${row.activityLabel} · ${row.minutes} phút\nrating      : ${row.rating}/4\nhash        : ${row.hash}\ncreated_at  : ${row.dateISO}`}
                          </pre>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
