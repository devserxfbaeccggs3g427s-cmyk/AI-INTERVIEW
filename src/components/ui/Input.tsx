"use client";

import { cn } from "@/components/ui/Button";
import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const inputId = id ?? (label ? `input-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={inputId} className="font-label-md text-on-surface-variant">
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          "h-10 w-full rounded-lg bg-surface-container-lowest px-3 text-body-md text-on-surface",
          "border border-outline-variant/40 placeholder:text-outline/70",
          "transition-colors focus:border-primary focus:outline-none",
          error && "border-error",
          className,
        )}
        {...rest}
      />
      {error ? (
        <p className="text-body-sm text-error">{error}</p>
      ) : hint ? (
        <p className="text-body-sm text-on-surface-variant">{hint}</p>
      ) : null}
    </div>
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const inputId = id ?? (label ? `textarea-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={inputId} className="font-label-md text-on-surface-variant">
          {label}
        </label>
      ) : null}
      <textarea
        ref={ref}
        id={inputId}
        className={cn(
          "w-full rounded-lg bg-surface-container-lowest p-3 text-body-md text-on-surface",
          "border border-outline-variant/40 placeholder:text-outline/70",
          "transition-colors focus:border-primary focus:outline-none resize-y",
          error && "border-error",
          className,
        )}
        {...rest}
      />
      {error ? (
        <p className="text-body-sm text-error">{error}</p>
      ) : hint ? (
        <p className="text-body-sm text-on-surface-variant">{hint}</p>
      ) : null}
    </div>
  );
});

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, className, id, children, ...rest },
  ref,
) {
  const inputId = id ?? (label ? `select-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={inputId} className="font-label-md text-on-surface-variant">
          {label}
        </label>
      ) : null}
      <select
        ref={ref}
        id={inputId}
        className={cn(
          "h-10 w-full rounded-lg bg-surface-container-lowest px-3 text-body-md text-on-surface",
          "border border-outline-variant/40 transition-colors focus:border-primary focus:outline-none",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      {hint ? <p className="text-body-sm text-on-surface-variant">{hint}</p> : null}
    </div>
  );
});
