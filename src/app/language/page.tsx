"use client";

import { useState, useEffect, useCallback } from "react";
import { VocabProgress } from "@/components/language/VocabProgress";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toaster";
import { Chip } from "@/components/ui/Chip";

/**
 * S09 — Hub ôn tập ngoại ngữ (SRS).
 *
 * Hiển thị:
 *   - KPI: số thẻ đang học / đã thuộc / đến hạn + chuỗi ngày ôn
 *   - VocabProgress: thanh tiến độ theo ngôn ngữ
 *   - Nút "Ôn ngay (N thẻ)" → điều hướng /language/session
 *   - Nút "Xuất Deck JSON" + "Thêm thẻ thủ công"
 *
 * Xem tasks.md 10.4-10.6 · design.md §4.9.
 */

interface SrsStats {
  studying: number;
  known: number;
  due: number;
  streak: number;
}

export default function LanguagePage() {
  const { toast } = useToast();
  const [stats, setStats] = useState<SrsStats>({ studying: 0, known: 0, due: 0, streak: 0 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [newCard, setNewCard] = useState({
    lang: "zh" as "zh" | "en",
    front: "",
    frontAlt: "",
    back: "",
    note: "",
    example: "",
    examplePinyin: "",
    hint: "",
    group: "",
    mode: "vocab",
  });

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/srs/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: "zh" }),
      });
      const data = await res.json();
      if (data.ok) setStats(data.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleReviewNow = () => {
    if (stats.due === 0) {
      toast({ tone: "info", title: "Không có thẻ đến hạn", description: "Tất cả thẻ đều chưa đến hạn ôn." });
      return;
    }
    window.location.href = "/language/session";
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/srs/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: "zh" }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message || "Export failed");
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deck-zh-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ tone: "success", title: "Đã xuất Deck", description: `${data.data.length} thẻ đã tải về.` });
    } catch (err) {
      toast({ tone: "error", title: "Xuất thất bại", description: String(err) });
    } finally {
      setExporting(false);
    }
  };

  const handleAddCard = async () => {
    try {
      const res = await fetch("/api/srs/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCard),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message || "Create failed");
      toast({ tone: "success", title: "Đã thêm thẻ", description: "Thẻ mới sẽ xuất hiện trong phiên ôn." });
      setShowAddCard(false);
      setNewCard({ lang: "zh", front: "", frontAlt: "", back: "", note: "", example: "", examplePinyin: "", hint: "", group: "", mode: "vocab" });
      fetchStats();
    } catch (err) {
      toast({ tone: "error", title: "Thêm thất bại", description: String(err) });
    }
  };

  return (
    <div className="space-y-gutter-lg">
      <PageHeader
        eyebrow="Ngoại ngữ · FSRS"
        title="Ôn tập ngoại ngữ (SRS hub)"
        description="Hub ôn tập: các thẻ đến hạn, số thẻ mới, và điểm tiến bộ theo ngôn ngữ."
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
        <Card tone="base">
          <div className="p-gutter">
            <p className="font-label-md text-on-surface-variant">Đang học</p>
            <p className="font-body-xl text-on-surface">{stats.studying}</p>
          </div>
        </Card>
        <Card tone="base">
          <div className="p-gutter">
            <p className="font-label-md text-on-surface-variant">Đã thuộc</p>
            <p className="font-body-xl text-on-surface">{stats.known}</p>
          </div>
        </Card>
        <Card tone="base">
          <div className="p-gutter">
            <p className="font-label-md text-on-surface-variant">Đến hạn</p>
            <p className="font-body-xl text-primary">{stats.due}</p>
          </div>
        </Card>
        <Card tone="base">
          <div className="p-gutter">
            <p className="font-label-md text-on-surface-variant">Chuỗi ngày</p>
            <p className="font-body-xl text-on-surface">{stats.streak} ngày</p>
          </div>
        </Card>
      </div>

      {/* VocabProgress */}
      <Card tone="base">
        <CardHeader title="Tiến độ từ vựng" subtitle="Theo dõi tiến trình ghi nhớ" icon="insights" />
        <div className="p-gutter">
          <VocabProgress lang="zh" />
        </div>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-gutter">
        <Button
          variant="primary"
          size="lg"
          icon="play_arrow"
          onClick={handleReviewNow}
          disabled={stats.due === 0}
          className="flex-1 min-w-[200px]"
        >
          Ôn ngay ({stats.due} thẻ)
        </Button>
        <Button variant="secondary" onClick={handleExport} loading={exporting} icon="download">
          Xuất Deck JSON
        </Button>
        <Button variant="secondary" onClick={() => setShowAddCard(true)} icon="add">
          Thêm thẻ
        </Button>
      </div>

      {/* Add Card Modal */}
      {showAddCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-gutter"
          onClick={() => setShowAddCard(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-card-title"
        >
          <Card id="add-card-title" tone="base" className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader
              title="Thêm thẻ mới"
              subtitle="Nhập thông tin thẻ ôn tập"
              icon="add"
            />
            <div className="p-gutter space-y-gutter">
              <div className="flex flex-wrap gap-gutter">
                <Button
                  variant={newCard.lang === "zh" ? "primary" : "secondary"}
                  onClick={() => setNewCard((p) => ({ ...p, lang: "zh" }))}
                  className="flex-1"
                >
                  Trung (zh)
                </Button>
                <Button
                  variant={newCard.lang === "en" ? "primary" : "secondary"}
                  onClick={() => setNewCard((p) => ({ ...p, lang: "en" }))}
                  className="flex-1"
                >
                  Anh (en)
                </Button>
              </div>

              <div className="space-y-space-md">
                <div>
                  <label className="font-label-sm text-on-surface-variant block mb-space-xs">
                    Mặt trước (Pinyin / Từ)
                  </label>
                  <input
                    type="text"
                    value={newCard.front}
                    onChange={(e) => setNewCard((p) => ({ ...p, front: e.target.value }))}
                    className="w-full rounded-lg bg-surface-container-lowest p-3 text-body-md text-on-surface border border-outline-variant/40 focus:border-primary focus:outline-none"
                    placeholder="nihao / hello"
                    required
                  />
                </div>

                <div>
                  <label className="font-label-sm text-on-surface-variant block mb-space-xs">
                    Hanzi / Phiên âm (tuỳ chọn)
                  </label>
                  <input
                    type="text"
                    value={newCard.frontAlt}
                    onChange={(e) => setNewCard((p) => ({ ...p, frontAlt: e.target.value }))}
                    className="w-full rounded-lg bg-surface-container-lowest p-3 text-body-md text-on-surface border border-outline-variant/40 focus:border-primary focus:outline-none"
                    placeholder="你好"
                  />
                </div>

                <div>
                  <label className="font-label-sm text-on-surface-variant block mb-space-xs">
                    Nghĩa / Định nghĩa *
                  </label>
                  <textarea
                    value={newCard.back}
                    onChange={(e) => setNewCard((p) => ({ ...p, back: e.target.value }))}
                    rows={3}
                    className="w-full rounded-lg bg-surface-container-lowest p-3 text-body-md text-on-surface border border-outline-variant/40 focus:border-primary focus:outline-none resize-y"
                    placeholder="Xin chào / greeting"
                    required
                  />
                </div>

                <div>
                  <label className="font-label-sm text-on-surface-variant block mb-space-xs">
                    Ví dụ (tuỳ chọn)
                  </label>
                  <textarea
                    value={newCard.example}
                    onChange={(e) => setNewCard((p) => ({ ...p, example: e.target.value }))}
                    rows={2}
                    className="w-full rounded-lg bg-surface-container-lowest p-3 text-body-md text-on-surface border border-outline-variant/40 focus:border-primary focus:outline-none resize-y"
                    placeholder="Nǐ hǎo ma? / How are you?"
                  />
                </div>

                <div>
                  <label className="font-label-sm text-on-surface-variant block mb-space-xs">
                    Pinyin ví dụ (tuỳ chọn)
                  </label>
                  <input
                    type="text"
                    value={newCard.examplePinyin}
                    onChange={(e) => setNewCard((p) => ({ ...p, examplePinyin: e.target.value }))}
                    className="w-full rounded-lg bg-surface-container-lowest p-3 text-body-md text-on-surface border border-outline-variant/40 focus:border-primary focus:outline-none"
                    placeholder="Ni3 hao3 ma?"
                  />
                </div>

                <div>
                  <label className="font-label-sm text-on-surface-variant block mb-space-xs">
                    Ghi chú / Gợi ý (tuỳ chọn)
                  </label>
                  <input
                    type="text"
                    value={newCard.hint}
                    onChange={(e) => setNewCard((p) => ({ ...p, hint: e.target.value }))}
                    className="w-full rounded-lg bg-surface-container-lowest p-3 text-body-md text-on-surface border border-outline-variant/40 focus:border-primary focus:outline-none"
                    placeholder="Tone 3 + tone 3 → tone 2"
                  />
                </div>

                <div>
                  <label className="font-label-sm text-on-surface-variant block mb-space-xs">
                    Nhóm / Chủ đề (tuỳ chọn)
                  </label>
                  <input
                    type="text"
                    value={newCard.group}
                    onChange={(e) => setNewCard((p) => ({ ...p, group: e.target.value }))}
                    className="w-full rounded-lg bg-surface-container-lowest p-3 text-body-md text-on-surface border border-outline-variant/40 focus:border-primary focus:outline-none"
                    placeholder="Chào hỏi cơ bản"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-gutter justify-end">
                <Button variant="ghost" onClick={() => setShowAddCard(false)}>
                  Huỷ
                </Button>
                <Button variant="primary" onClick={handleAddCard}>
                  Thêm thẻ
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}