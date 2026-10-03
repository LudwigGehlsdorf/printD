"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/* Small versions of the shadcn components used on dsek.se (src/lib/components/ui). */

const BUTTON_VARIANTS = {
  rosa: "bg-rosa-background text-rosa-foreground shadow-xs hover:bg-rosa-hover",
  outline: "border bg-background shadow-xs hover:bg-secondary-hover",
  ghost: "text-muted-foreground hover:bg-secondary-hover hover:text-foreground",
};

const BUTTON_SIZES = {
  default: "h-9 px-4 py-2 has-[>svg]:px-3",
  sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
  lg: "h-10 px-6 has-[>svg]:px-4",
  icon: "size-9",
};

export function buttonClass(
  variant: keyof typeof BUTTON_VARIANTS = "rosa",
  size: keyof typeof BUTTON_SIZES = "default",
  className = "",
) {
  return `inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-rosa-400/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`;
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
}) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

/** A labelled group of choice boxes, like RadioChoiceBoxGroup on dsek.se. */
export function ChoiceGroup<T extends string>({
  label,
  name,
  value,
  onChange,
  options,
  columns = 2,
}: {
  label: string;
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; description?: string }[];
  columns?: 2 | 3;
}) {
  const segmented = columns === 3;
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className={`grid gap-2 ${columns === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex min-w-0 cursor-pointer items-start gap-2 rounded-md border px-2.5 py-3 transition-colors hover:bg-secondary-hover has-checked:border-rosa-background has-checked:bg-rosa-selected has-focus-visible:ring-[3px] has-focus-visible:ring-rosa-400/50 ${
              segmented ? "justify-center px-1 text-center" : ""
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              // Narrow groups look like segmented buttons; the radio is still there for keyboards.
              className={segmented ? "sr-only" : "mt-0.5 accent-rosa-background outline-none"}
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm leading-none">{option.label}</span>
              {option.description && (
                <span className="text-xs text-muted-foreground">{option.description}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div>
      <label htmlFor="stepper" className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <div className="flex h-9 w-36 items-center rounded-md border bg-background shadow-xs">
        <button
          type="button"
          aria-label="Färre"
          disabled={value <= min}
          onClick={() => onChange(clamp(value - 1))}
          className="h-full w-9 text-lg text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          −
        </button>
        <input
          id="stepper"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value.replace(/\D/g, "")) || min))}
          className="h-full min-w-0 flex-1 bg-transparent text-center font-mono text-sm outline-none"
        />
        <button
          type="button"
          aria-label="Fler"
          disabled={value >= max}
          onClick={() => onChange(clamp(value + 1))}
          className="h-full w-9 text-lg text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function StatusDot({ tone }: { tone: "rosa" | "success" | "muted" | "warning" | "error" }) {
  const colors = {
    rosa: "bg-rosa-background",
    success: "bg-success",
    muted: "bg-border",
    warning: "bg-amber-500",
    error: "bg-red-500",
  };
  return <span className={`inline-block size-2 shrink-0 rounded-full ${colors[tone]}`} />;
}

export function Notice({ tone, children, onClose }: { tone: "error" | "info"; children: ReactNode; onClose?: () => void }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${
        tone === "error" ? "border-red-500/40 text-red-700 dark:text-red-300" : "bg-muted-background"
      }`}
    >
      <p className="flex-1">{children}</p>
      {onClose && (
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Stäng">
          ✕
        </button>
      )}
    </div>
  );
}
