"use client";

import { cn } from "@/components/ui/Button";
import { useId, useState, type ReactNode } from "react";

/** Tooltip tối giản — hiện khi hover/focus. */
export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  const positions = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1",
    left: "right-full top-1/2 -translate-y-1/2 mr-1",
    right: "left-full top-1/2 -translate-y-1/2 ml-1",
  } as const;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-[110] whitespace-nowrap rounded bg-surface-container-highest",
            "px-2 py-1 font-label-md text-on-surface shadow-lg",
            positions[side],
            className,
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
