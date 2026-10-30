"use client";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { useState, FormEvent, ChangeEvent } from "react";
import type { Domain } from "@/lib/types";

export interface InterviewProfile {
  id: string;
  label: string;
  jobTitle: string;
  seniority: string;
  language: string;
  questionKinds: string[];
  focusSkills: string[];
}

/** Seed profiles — tasks.md 13.1 */
export const SEED_PROFILES: InterviewProfile[] = [
  {
    id: "backend-sr",
    label: "Backend Senior",
    jobTitle: "Backend Engineer",
    seniority: "Senior",
    language: "vi",
    questionKinds: ["concept", "design", "debug", "tradeoff"],
    focusSkills: [],
  },
  {
    id: "architect-lead",
    label: "Tech Lead / Architect",
    jobTitle: "Tech Lead",
    seniority: "Staff+",
    language: "vi",
    questionKinds: ["design", "tradeoff", "behavioral", "concept"],
    focusSkills: [],
  },
  {
    id: "eng-manager",
    label: "Engineering Manager",
    jobTitle: "Engineering Manager",
    seniority: "Manager",
    language: "vi",
    questionKinds: ["behavioral", "tradeoff", "design", "concept"],
    focusSkills: [],
  },
];

const QUESTION_KINDS = [
  { value: "concept", label: "Khái niệm" },
  { value: "design", label: "Thiết kế hệ thống" },
  { value: "debug", label: "Debug / Troubleshoot" },
  { value: "tradeoff", label: "Đánh đổi (Trade-off)" },
  { value: "behavioral", label: "Hành vi (STAR)" },
] as const;

const LANGUAGES = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "Tiếng Anh" },
] as const;

const SENIORITIES = [
  "Junior",
  "Mid",
  "Senior",
  "Staff",
  "Principal",
  "Manager",
  "Director",
] as const;

const QUESTION_COUNTS = [5, 8, 12] as const;

export function ProfileCard({
  profiles,
  selectedId,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
}: {
  profiles: InterviewProfile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onUpdate: (profile: InterviewProfile) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<InterviewProfile>>({});

  const handleEdit = (profile: InterviewProfile) => {
    setEditingId(profile.id);
    setFormData(profile);
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({});
  };

  const handleSubmit = (e: FormEvent, profile: InterviewProfile) => {
    e.preventDefault();
    onUpdate({ ...profile, ...formData } as InterviewProfile);
    setEditingId(null);
    setFormData({});
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === "questionKinds" || name === "focusSkills") {
      const arr = value.split(",").map((v) => v.trim()).filter(Boolean);
      setFormData((prev) => ({ ...prev, [name]: arr }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleCheckboxChange = (kind: string, checked: boolean) => {
    const current = (formData.questionKinds as string[]) || [];
    if (checked) {
      setFormData((prev) => ({ ...prev, questionKinds: [...current, kind] }));
    } else {
      setFormData((prev) => ({ ...prev, questionKinds: current.filter((k) => k !== kind) }));
    }
  };

  return (
    <Card className="space-y-gutter">
      <div className="flex items-center justify-between">
        <h3 className="font-headline-sm text-on-surface">Hồ sơ phỏng vấn</h3>
        <Button variant="secondary" size="sm" onClick={onCreate}>
          Tạo mới
        </Button>
      </div>

      <div className="space-y-space-sm" role="listbox" aria-label="Chọn hồ sơ">
        {profiles.map((profile) => {
          const isSelected = selectedId === profile.id;
          const isEditing = editingId === profile.id;

          return (
            <div
              key={profile.id}
              className={cn(
                "relative p-gutter rounded-xl border transition-colors",
                isSelected
                  ? "border-primary bg-primary-container/10"
                  : "border-outline-variant hover:border-outline",
              )}
              role="option"
              aria-selected={isSelected}
            >
              {isEditing ? (
                <form onSubmit={(e) => handleSubmit(e, profile)} className="space-y-gutter">
                  <div className="grid gap-gutter sm:grid-cols-2">
                    <Input
                      name="label"
                      label="Nhãn hiển thị"
                      value={formData.label || profile.label}
                      onChange={handleChange}
                      required
                    />
                    <Input
                      name="jobTitle"
                      label="Vị trí (Job Title)"
                      value={formData.jobTitle || profile.jobTitle}
                      onChange={handleChange}
                      required
                    />
                    <Select
                      name="seniority"
                      label="Cấp bậc"
                      value={formData.seniority || profile.seniority}
                      onChange={handleChange}
                      required
                    >
                      {SENIORITIES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </Select>
                    <Select
                      name="language"
                      label="Ngôn ngữ phỏng vấn"
                      value={formData.language || profile.language}
                      onChange={handleChange}
                      required
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </Select>
                  </div>

                  <fieldset className="space-y-space-sm">
                    <legend className="font-label-md text-on-surface-variant">Dạng câu hỏi</legend>
                    <div className="flex flex-wrap gap-space-sm">
                      {QUESTION_KINDS.map(({ value, label }) => (
                        <label
                          key={value}
                          className="inline-flex items-center gap-space-xs cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            value={value}
                            checked={(formData.questionKinds as string[])?.includes(value) ??
                              profile.questionKinds.includes(value)}
                            onChange={(e) => handleCheckboxChange(value, e.target.checked)}
                            className="sr-only peer"
                          />
                          <span
                            className={cn(
                              "px-space-md py-space-xs rounded-full text-label-md font-medium transition-colors",
                              (formData.questionKinds as string[])?.includes(value) ??
                                profile.questionKinds.includes(value)
                                ? "bg-primary text-on-primary"
                                : "bg-surface-container-highest text-on-surface",
                            )}
                          >
                            {label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <Textarea
                    name="focusSkills"
                    label="Skill ID focus (cách nhau bằng dấu phẩy, để trống = tự động)"
                    value={(formData.focusSkills as string[])?.join(", ") ??
                      profile.focusSkills.join(", ")}
                    onChange={handleChange}
                    rows={2}
                  />

                  <div className="flex justify-end gap-space-sm">
                    <Button type="button" variant="ghost" onClick={handleCancel}>
                      Huỷ
                    </Button>
                    <Button type="submit" size="sm">
                      Lưu
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-gutter">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-space-sm">
                        <span className="font-headline-sm text-on-surface">{profile.label}</span>
                        {isSelected && (
                          <Chip tone="primary">
                            Đang chọn
                          </Chip>
                        )}
                      </div>
                      <p className="mt-space-xs text-body-sm text-on-surface-variant">
                        {profile.jobTitle} · {profile.seniority} · {profile.language.toUpperCase()}
                      </p>
                      <div className="mt-space-sm flex flex-wrap gap-space-xs">
                        {profile.questionKinds.map((kind) => {
                          const qk = QUESTION_KINDS.find((k) => k.value === kind);
                          return (
                            <Chip key={kind} tone="outline">
                              {qk?.label || kind}
                            </Chip>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-space-xs">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(profile)}
                        aria-label={`Sửa hồ sơ ${profile.label}`}
                      >
                        Sửa
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => onDelete(profile.id)}
                        aria-label={`Xoá hồ sơ ${profile.label}`}
                      >
                        Xoá
                      </Button>
                    </div>
                  </div>

                  <Button
                    variant={isSelected ? "primary" : "secondary"}
                    className="w-full"
                    onClick={() => onSelect(profile.id)}
                    disabled={isSelected}
                  >
                    {isSelected ? "Đã chọn" : "Chọn hồ sơ này"}
                  </Button>
                </>
              )}
            </div>
          );
        })}

        {profiles.length === 0 && (
          <div className="text-center py-gutter-lg text-on-surface-variant">
            Chưa có hồ sơ nào. Bấm "Tạo mới" để bắt đầu.
          </div>
        )}
      </div>
    </Card>
  );
}