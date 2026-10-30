"use client";

import { cn } from "@/components/ui/Button";
import type { InputHTMLAttributes } from "react";

export type SliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
  valueText?: string;
  /** Hiển thị giá trị hiện tại bên cạnh label. */
  showValue?: boolean;
  tone?: "primary" | "secondary" | "tertiary";
};

const TONES = {
  primary: "accent-primary",
  secondary: "accent-secondary",
  tertiary: "accent-tertiary",
} as const;

export function Slider({
  label,
  valueText,
  showValue = true,
  tone = "primary",
  className,
  id,
  ...rest
}: SliderProps) {
  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <div className="flex items-baseline justify-between">
          <label htmlFor={id} className="font-label-md text-on-surface-variant">
            {label}
          </label>
          {showValue && valueText ? (
            <span className="font-code-md text-primary">{valueText}</span>
          ) : null}
        </div>
      ) : null}
      <input
        id={id}
        type="range"
        className={cn(
          "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-container-highest",
          "accent-primary",
          TONES[tone],
          className,
        )}
        {...rest}
      />
    </div>
  );
}

/** Nhóm slider 1–5 dùng ở S12 (mood/energy/focus). */
export function RatingScale({
  label,
  value,
  onChange,
  lowLabel,
  highLabel,
  id,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  lowLabel?: string;
  highLabel?: string;
  id?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="font-label-md text-on-surface-variant">
          {label}
        </label>
        <span className="font-code-md text-primary">{value}/5</span>
      </div>
      <input
        id={id}
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-container-highest accent-primary"
        aria-label={label}
      />
      {lowLabel || highLabel ? (
        <div className="flex justify-between text-body-sm text-outline">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
