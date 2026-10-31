import { Icon } from "@/components/ui/icon";

/**
 * Placeholder "sắp có" cho các màn hình thuộc feature chưa implement.
 *
 * ⚠️ Base shell (app-foundation) có bottom nav 4 mục + overflow menu 5 mục trỏ
 * tới các route của feature nghiệp vụ. Nếu route chưa tồn tại, Next.js prefetch
 * sẽ trả 404 ⇒ console error ⇒ test "không lỗi console" fail (AC-AF-6).
 *
 * Vì vậy mỗi route được dựng sẵn một trang placeholder. Nội dung nghiệp vụ thật
 * sẽ thay thế trang này khi feature tương ứng được implement — **không** viết
 * logic nghiệp vụ vào đây.
 */
export interface ComingSoonProps {
  /** Tên màn hình hiển thị. */
  title: string;
  /** Mô tả ngắn về tính năng sắp tới. */
  description: string;
  /** Feature sẽ implement màn hình này (để tra cứu). */
  feature: string;
}

export function ComingSoon({ title, description, feature }: ComingSoonProps) {
  return (
    <div className="space-y-gutter-lg">
      <div className="rounded-xl bg-surface-container p-space-lg shadow-md">
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
          Sắp có
        </span>

        <h1 className="mt-space-sm font-headline-lg text-headline-lg text-on-surface">
          {title}
        </h1>

        <p className="mt-space-sm text-body-md text-body-md text-on-surface-variant">
          {description}
        </p>

        <div className="mt-space-lg flex items-center gap-2 rounded-lg bg-surface-container-low p-space-md">
          <Icon name="construction" size={18} className="text-tertiary" />
          <span className="font-label-sm text-label-sm text-outline">
            Thuộc feature{" "}
            <code className="font-code-md text-code-md text-primary">{feature}</code> — đang
            xây dựng.
          </span>
        </div>
      </div>
    </div>
  );
}
