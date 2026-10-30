"use client";

import { cn } from "@/components/ui/Button";
import { useId, type ReactNode } from "react";

export type TabItem = {
  id: string;
  label: string;
  icon?: string;
  badge?: ReactNode;
};

export function Tabs({
  items,
  active,
  onChange,
  className,
  label,
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
  label: string;
}) {
  const id = useId();

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "flex gap-1 overflow-x-auto border-b border-outline-variant/30",
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            role="tab"
            id={`${id}-${item.id}`}
            aria-selected={isActive}
            aria-controls={`${id}-${item.id}-panel`}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-gutter py-space-md transition-colors",
              "font-label-md",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface",
            )}
          >
            {item.icon ? (
              <span className="material-symbols-outlined" style={{ fontSize: "1rem" }} aria-hidden>
                {item.icon}
              </span>
            ) : null}
            {item.label}
            {item.badge != null ? item.badge : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  active,
  children,
}: {
  id: string;
  active: string;
  children: ReactNode;
}) {
  if (id !== active) return null;
  return (
    <div role="tabpanel" className="pt-gutter">
      {children}
    </div>
  );
}
