/**
 * Barrel export của toàn bộ UI primitives (tasks.md 3.6).
 *
 * 13 primitive bắt buộc: Button, Card, Chip, Badge, Input, Select, Modal,
 * Sheet, Toast, Tabs, Tooltip, Slider — cộng thêm EmptyState và Skeleton.
 *
 * ⚠️ Về `Sheet`: `Modal.tsx` (file của agent khác) vẫn còn export một `Sheet`
 * cũ. Barrel này export `Sheet` **chỉ** từ `./Sheet` — bản đầy đủ có quản lý
 * tiêu điểm. Import `Sheet` qua barrel sẽ luôn trỏ đúng bản canonical.
 *
 * ⚠️ Về `cn`: export từ `@/lib/cn` (module KHÔNG có `"use client"`) để dùng
 * được ở cả Server lẫn Client Component. `Button.tsx` vẫn re-export `cn` để
 * các import site cũ không phải sửa, nhưng **Server Component phải import từ
 * đây hoặc từ `@/lib/cn`** — gọi hàm export từ module client sẽ ném lỗi
 * "Attempted to call cn() from the server".
 */

// `cn` — nguồn thật nằm ở module server-safe.
export { cn } from "@/lib/cn";

// Nút bấm.
export { Button } from "./Button";
export type { ButtonProps, ButtonSize, ButtonVariant } from "./Button";

// Card + nhãn micro.
export { Card, CardHeader, Label } from "./Card";
export type { CardProps } from "./Card";

// Chip, badge, dot trạng thái, thanh tiến trình, KPI.
export {
  Badge,
  Chip,
  ProgressBar,
  ProgressSegments,
  Stat,
  StatusDot,
} from "./Chip";
export type { BadgeProps, ChipProps, ChipTone } from "./Chip";

// Ô nhập.
export { Input, Select, Textarea } from "./Input";
export type { InputProps, SelectProps, TextareaProps } from "./Input";

// Modal + Sheet.
export { Modal } from "./Modal";
export type { ModalProps } from "./Modal";
export { Sheet } from "./Sheet";
export type { SheetProps } from "./Sheet";

// Toast.
export { ToastProvider, useToast } from "./Toaster";
export type { Toast, ToastTone } from "./Toaster";

// Tabs.
export { TabPanel, Tabs } from "./Tabs";
export type { TabItem } from "./Tabs";

// Tooltip.
export { Tooltip } from "./Tooltip";

// Slider + thang đánh giá.
export { RatingScale, Slider } from "./Slider";
export type { SliderProps } from "./Slider";

// Trạng thái rỗng + skeleton.
export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";
export { Skeleton, SkeletonText } from "./Skeleton";
export type { SkeletonProps } from "./Skeleton";
