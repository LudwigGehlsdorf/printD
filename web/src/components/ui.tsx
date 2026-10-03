import type { ButtonHTMLAttributes, ReactNode } from "react";

// Styled after the shadcn components on dsek.se.

const VARIANTS = {
  rosa: "bg-rosa-background text-rosa-foreground shadow-xs hover:bg-rosa-hover",
  outline: "border bg-background shadow-xs hover:bg-secondary-hover",
  ghost: "text-muted-foreground hover:bg-secondary-hover hover:text-foreground",
};

const SIZES = {
  default: "h-9 px-4",
  sm: "h-8 px-3",
  lg: "h-10 px-6",
  icon: "size-8",
};

type ButtonStyle = { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES };

export function buttonClass({ variant = "rosa", size = "default" }: ButtonStyle = {}, className = "") {
  return `inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-rosa-400/50 disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}

export function Button({ variant, size, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyle) {
  return <button type="button" className={buttonClass({ variant, size }, className)} {...props} />;
}

export function ChoiceGroup<T extends string>({
  label,
  name,
  value,
  onChange,
  options,
  segmented = false,
}: {
  label: string;
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; description?: string }[];
  /** Three compact buttons without radio circles. */
  segmented?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className={`grid gap-2 ${segmented ? "grid-cols-3" : "grid-cols-2"}`}>
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex min-w-0 cursor-pointer items-start gap-2 rounded-md border py-3 transition-colors hover:bg-secondary-hover has-checked:border-rosa-background has-checked:bg-rosa-selected has-focus-visible:ring-[3px] has-focus-visible:ring-rosa-400/50 ${
              segmented ? "justify-center px-1" : "px-2.5"
            }`}
          >
            <input
              type="radio"
              name={name}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className={segmented ? "sr-only" : "mt-0.5 accent-rosa-background outline-none"}
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm leading-none">{option.label}</span>
              {option.description && <span className="text-xs text-muted-foreground">{option.description}</span>}
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
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const set = (n: number) => onChange(Math.min(max, Math.max(1, n)));
  const step = "h-full w-9 text-lg text-muted-foreground hover:text-foreground disabled:opacity-40";
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium">{label}</span>
      <span className="flex h-9 w-36 items-center rounded-md border bg-background shadow-xs">
        <button type="button" aria-label="Färre" disabled={value <= 1} onClick={() => set(value - 1)} className={step}>
          −
        </button>
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")))}
          className="h-full min-w-0 flex-1 bg-transparent text-center font-mono text-sm outline-none"
        />
        <button type="button" aria-label="Fler" disabled={value >= max} onClick={() => set(value + 1)} className={step}>
          +
        </button>
      </span>
    </label>
  );
}

const DOT_COLORS = {
  success: "bg-success",
  warning: "bg-amber-500",
  error: "bg-red-500",
  muted: "bg-border",
};

export type Tone = keyof typeof DOT_COLORS;

export function StatusDot({ tone }: { tone: Tone }) {
  return <span className={`inline-block size-2 shrink-0 rounded-full ${DOT_COLORS[tone]}`} />;
}

export function Notice({ error = false, children, onClose }: { error?: boolean; children: ReactNode; onClose: () => void }) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${
        error ? "border-red-500/40 text-red-700 dark:text-red-300" : "bg-muted-background"
      }`}
    >
      <p className="flex-1">{children}</p>
      <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Stäng">
        ✕
      </button>
    </div>
  );
}
