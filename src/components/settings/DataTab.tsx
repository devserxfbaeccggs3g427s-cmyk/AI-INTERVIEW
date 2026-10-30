"use client";

/**
 * S15 — Tab 4 "Quản trị dữ liệu (Backup / Export JSON)" (tasks.md 17.7, 17.8).
 *
 * - Nút "Xuất toàn bộ cơ sở dữ liệu (JSON)" → gọi /api/export → tải file.
 * - Nút "Nhập từ JSON" → mở modal chọn file, validate + 2-step wipe.
 * - VÙNG NGUY HIỂM: nút "Xóa trắng dữ liệu" (2-step confirm).
 * - Thống kê số bản ghi mỗi bảng (17.8).
 *
 * Xem tasks.md 17.7, 17.8 · design.md §4.15.
 */

import { use, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Label } from "@/components/ui/Card";
import { Badge, Chip, Stat, StatusDot } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toaster";

export function DataTab({
  tableCountsPromise,
}: {
  tableCountsPromise: Promise<Record<string, number>>;
}) {
  const { toast } = useToast();
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importValid, setImportValid] = useState(false);
  const [importError, setImportError] = useState("");
  const [wipeStep, setWipeStep] = useState<0 | 1 | 2>(0);

  use(tableCountsPromise.then((counts) => setTableCounts(counts)).catch(() => {}));

  const exportJson = async () => {
    try {
      const res = await fetch("/api/export", { method: "POST" });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `daily-loop-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ tone: "success", title: "Đã xuất JSON", description: "Toàn bộ cơ sở dữ liệu đã tải xuống." });
    } catch {
      toast({ tone: "error", title: "Lỗi", description: "Không xuất được file." });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportError("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        JSON.parse(reader.result as string);
        setImportValid(true);
      } catch {
        setImportValid(false);
        setImportError("File JSON không hợp lệ.");
      }
    };
    reader.readAsText(file);
  };

  const importJson = async () => {
    if (!importFile || !importValid) return;
    const formData = new FormData();
    formData.append("file", importFile);
    try {
      const res = await fetch("/api/import", { method: "POST", body: formData });
      const json = await res.json();
      if (json.ok) {
        toast({ tone: "success", title: "Đã nhập JSON", description: json.data?.message ?? "Thành công." });
        setImportOpen(false);
        setImportFile(null);
        setImportValid(false);
      } else {
        toast({ tone: "error", title: "Lỗi nhập", description: json.error?.message ?? "Không nhập được." });
      }
    } catch {
      toast({ tone: "error", title: "Lỗi", description: "Không kết nối được server." });
    }
  };

  const wipeData = async (step: 1 | 2) => {
    if (step === 1) {
      setWipeStep(1);
    } else if (step === 2) {
      try {
        const res = await fetch("/api/wipe", { method: "POST" });
        const json = await res.json();
        if (json.ok) {
          toast({ tone: "success", title: "Đã xóa trắng", description: "Tất cả dữ liệu đã được xoá." });
          setWipeStep(0);
          tableCountsPromise.then((c) => setTableCounts({})).catch(() => {});
        } else {
          toast({ tone: "error", title: "Lỗi", description: json.error?.message ?? "Không xoá được." });
        }
      } catch {
        toast({ tone: "error", title: "Lỗi", description: "Không kết nối được server." });
      }
    }
  };

  return (
    <div className="space-y-gutter">
      {/* ── Backup / Restore ── */}
      <Card padded>
        <CardHeader
          title="Backup & Sao Lưu Hệ Thống"
          subtitle="Toàn bộ dữ liệu của bạn nằm trọn vẹn trong máy khách. Dễ dàng chuyển dịch hoặc dọn sạch."
          icon="database"
        />
        <div className="space-y-gutter">
          <Button variant="primary" icon="download" onClick={exportJson}>
            Xuất toàn bộ cơ sở dữ liệu (JSON)
          </Button>
          <div className="border-t border-outline-variant/30 pt-gutter">
            <Button variant="secondary" icon="upload" onClick={() => setImportOpen(true)}>
              Nhập từ JSON
            </Button>
            <p className="text-body-sm text-on-surface-variant mt-2">
              File JSON phải đúng cấu trúc schema Prisma (xuất từ bản cài này).
            </p>
          </div>
        </div>
      </Card>

      {/* ── Import Modal ── */}
      <Modal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          setImportFile(null);
          setImportValid(false);
          setImportError("");
        }}
        title="Nhập từ JSON"
        subtitle="Chọn file .json đã xuất trước đó"
        icon="upload"
        width="max-w-md"
      >
        <div className="space-y-gutter">
          <Input
            type="file"
            accept=".json"
            onChange={handleFileChange}
            label="File JSON"
            hint="Kéo thả hoặc click để chọn file"
          />
          {importError && <p className="text-body-sm text-error">{importError}</p>}
          <div className="flex justify-end gap-gutter">
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              Huỷ
            </Button>
            <Button variant="primary" icon="save" disabled={!importValid} onClick={importJson}>
              Nhập
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Danger Zone ── */}
      <Card tone="high" padded>
        <CardHeader
          title="VÙNG NGUY HIỂM (DANGER ZONE)"
          subtitle="Thao tác này sẽ dọn sạch toàn bộ flashcards, lịch sử phiên phỏng vấn và AiCall logs. Không thể đảo ngược."
          icon="warning"
        />
        {wipeStep === 0 ? (
          <Button variant="danger" icon="delete_forever" onClick={() => wipeData(1)}>
            Xóa trắng dữ liệu (2-Step Confirm)
          </Button>
        ) : wipeStep === 1 ? (
          <div className="flex gap-gutter">
            <Button variant="danger" icon="delete_forever" onClick={() => wipeData(2)}>
              XÁC NHẬN XÓA TRẮNG (BƯỚC 2/2)
            </Button>
            <Button variant="ghost" onClick={() => setWipeStep(0)}>
              Huỷ
            </Button>
          </div>
        ) : null}
      </Card>

      {/* ── Thống kê bảng (17.8) ── */}
      <Card padded>
        <CardHeader title="Thống Kê Số Bản Ghi" subtitle="Số liệu đếm trực tiếp từ SQLite" icon="table_rows" />
        {Object.entries(tableCounts).length === 0 ? (
          <Label>Đang tải...</Label>
        ) : (
          <div className="grid gap-gutter sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(tableCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([table, count]) => (
                <Stat
                  key={table}
                  label={table}
                  value={count.toLocaleString("vi-VN")}
                  hint="bản ghi"
                  icon="storage"
                />
              ))}
          </div>
        )}
      </Card>
    </div>
  );
}
