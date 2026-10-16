import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Info, Loader2, X } from "lucide-react";
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { triageColor, statusLabel } from "@/lib/format";

export const cx = clsx;

// ------------------------------------------------------------------ layout
export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand">{eyebrow}</div>}
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, subtitle, action, children, className, pad = true, tone }: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; pad?: boolean;
  tone?: "brand" | "dark";
}) {
  return (
    <section className={cx("rounded-2xl border shadow-card",
      tone === "brand" ? "border-brand/30 bg-gradient-to-br from-brand/10 via-surface to-surface"
        : tone === "dark" ? "border-transparent bg-[#0F1B2D] text-white dark:bg-surface2" : "border-line bg-surface", className)}>
      {(title || action) && (
        <header className={cx("flex items-start justify-between gap-3", pad ? "px-5 pt-4" : "px-5 pt-4 pb-2")}>
          <div className="min-w-0">
            {title && <h3 className="text-[15px] font-semibold leading-snug">{title}</h3>}
            {subtitle && <p className={cx("mt-0.5 text-xs", tone === "dark" ? "text-white/60" : "text-muted")}>{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cx(pad && "p-5", pad && (title || action) && "pt-3")}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, unit, sub, tone = "default", icon, spark }: {
  label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: "default" | "bad" | "good" | "warn" | "brand"; icon?: ReactNode; spark?: ReactNode;
}) {
  const ring = { default: "", bad: "ring-1 ring-bad/25", good: "ring-1 ring-good/25", warn: "ring-1 ring-warn/30", brand: "ring-1 ring-brand/25" }[tone];
  const vc = { default: "text-ink", bad: "text-bad", good: "text-good", warn: "text-warn", brand: "text-brand" }[tone];
  return (
    <div className={cx("relative overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card", ring)}>
      <div className="flex items-center justify-between text-xs font-medium text-muted">
        <span>{label}</span>
        {icon && <span className="text-muted/70">{icon}</span>}
      </div>
      <div className={cx("mt-2 flex items-baseline gap-1 text-[28px] font-bold leading-none tracking-tight tnum", vc)}>
        {value}
        {unit && <span className="text-sm font-medium text-muted">{unit}</span>}
      </div>
      {sub && <div className="mt-1.5 text-xs text-muted">{sub}</div>}
      {spark && <div className="mt-2 h-9">{spark}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ chips
type Tone = "brand" | "good" | "bad" | "warn" | "neutral" | "accent";
const toneCls: Record<Tone, string> = {
  brand: "bg-brand/12 text-brand ring-brand/25", good: "bg-good/12 text-good ring-good/25", bad: "bg-bad/12 text-bad ring-bad/25",
  warn: "bg-warn/15 text-warn ring-warn/30", neutral: "bg-neutral/15 text-muted ring-neutral/25", accent: "bg-accent/12 text-accent ring-accent/25",
};
export function Chip({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx("inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", toneCls[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function ConfidenceBadge({ level }: { level: string }) {
  const tone: Tone = level === "High" ? "accent" : level === "Medium" ? "brand" : "neutral";
  const bars = level === "High" ? 3 : level === "Medium" ? 2 : 1;
  return (
    <span title={`${level} confidence`} className={cx("inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", toneCls[tone])}>
      <span className="flex items-end gap-[2px]">
        {[1, 2, 3].map((b) => <span key={b} className={cx("w-[3px] rounded-sm bg-current", b <= bars ? "opacity-100" : "opacity-25")} style={{ height: 3 + b * 2 }} />)}
      </span>
      {level}
    </span>
  );
}

export function TriageChip({ level }: { level: string }) {
  return <span className={cx("inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", triageColor[level])}>{level}</span>;
}

const statusTone: Record<string, Tone> = {
  booked: "neutral", confirmed: "brand", checked_in: "accent", in_consultation: "warn", completed: "good",
  cancelled: "neutral", no_show: "bad", left_before_care: "bad", rescheduled: "neutral",
  open: "bad", investigating: "warn", resolved: "good", pending: "warn", approved: "good", rejected: "neutral",
};
export function StatusChip({ status }: { status: string }) {
  return <Chip tone={statusTone[status] || "neutral"} dot>{statusLabel[status] || status.replace(/_/g, " ")}</Chip>;
}

export function SimulatedChip({ what = "Simulated" }: { what?: string }) {
  return (
    <span title="Generated from the DATATHON data under the rules in the Data Trust Centre; not part of the original dataset."
      className="inline-flex items-center gap-1 rounded-full border border-dashed border-neutral/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-neutral" /> {what}
    </span>
  );
}

export function SeverityDot({ s }: { s: string }) {
  return <span className={cx("inline-block h-2.5 w-2.5 shrink-0 rounded-full", s === "high" ? "bg-bad" : s === "medium" ? "bg-warn" : "bg-neutral")} />;
}

// ------------------------------------------------------------------ controls
export function Button({ variant = "primary", size = "md", className, loading, children, ...p }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "soft"; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  const v = {
    primary: "bg-brand text-white hover:bg-brand2 shadow-sm",
    secondary: "border border-line bg-surface text-ink hover:bg-surface2",
    ghost: "text-muted hover:bg-surface2 hover:text-ink",
    danger: "bg-bad text-white hover:opacity-90",
    soft: "bg-brand/10 text-brand hover:bg-brand/15",
  }[variant];
  const s = { sm: "h-8 px-3 text-xs", md: "h-9 px-3.5 text-sm", lg: "h-11 px-5 text-[15px]" }[size];
  return (
    <button {...p} disabled={p.disabled || loading}
      className={cx("focus-ring inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50", v, s, className)}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Select({ value, onChange, options, className, label }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string; label?: string;
}) {
  return (
    <label className={cx("inline-flex flex-col gap-1", className)}>
      {label && <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="focus-ring h-9 rounded-[10px] border border-line bg-surface px-3 pr-8 text-sm text-ink">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Input({ label, className, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className={cx("inline-flex flex-col gap-1", className)}>
      {label && <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>}
      <input {...p} className="focus-ring h-9 rounded-[10px] border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70" />
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "md" }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-surface2 p-1">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cx("focus-ring relative rounded-lg font-semibold transition", size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            value === o.value ? "text-ink" : "text-muted hover:text-ink")}>
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join("")}`} className="absolute inset-0 rounded-lg bg-surface shadow-sm" transition={{ type: "spring", bounce: 0.2, duration: 0.4 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ overlays
export function Drawer({ open, onClose, title, subtitle, children, width = 560 }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; width?: number;
}) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-[#0B1220]/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside role="dialog" aria-modal className="fixed right-0 top-0 z-50 flex h-full max-w-[100vw] flex-col border-l border-line bg-surface shadow-pop"
            style={{ width }} initial={{ x: width }} animate={{ x: 0 }} exit={{ x: width }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>
            <header className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
              <div className="min-w-0">
                <div className="text-lg font-bold leading-snug">{title}</div>
                {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
              </div>
              <button aria-label="Close" onClick={onClose} className="focus-ring rounded-lg p-1.5 text-muted hover:bg-surface2"><X className="h-5 w-5" /></button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function Modal({ open, onClose, title, children, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-[#0B1220]/45 p-4 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div role="dialog" aria-modal className="w-full rounded-2xl border border-line bg-surface p-6 shadow-pop" style={{ maxWidth: width }}
            initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 8 }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div className="text-lg font-bold">{title}</div>
              <button aria-label="Close" onClick={onClose} className="focus-ring rounded-lg p-1.5 text-muted hover:bg-surface2"><X className="h-5 w-5" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------ toasts
interface Toast { id: number; title: string; body?: string; tone: "good" | "bad" | "info" }
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const id = useRef(0);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const n = ++id.current;
    setToasts((x) => [...x, { ...t, id: n }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== n)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }}
              className="pointer-events-auto flex gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-pop">
              <span className={cx("mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full", t.tone === "good" ? "bg-good" : t.tone === "bad" ? "bg-bad" : "bg-brand")} />
              <div className="min-w-0">
                <div className="text-sm font-semibold">{t.title}</div>
                {t.body && <div className="mt-0.5 text-xs text-muted">{t.body}</div>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ------------------------------------------------------------------ states
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("relative overflow-hidden rounded-xl bg-surface2", className)}><div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/5" /></div>;
}
export function Loading({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
}
export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand">{icon || <Info className="h-6 w-6" />}</div>
      <div className="font-semibold">{title}</div>
      {body && <div className="mt-1 max-w-sm text-sm text-muted">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function ErrorState({ error, retry }: { error: any; retry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-bad/30 bg-bad/5 p-4 text-sm">
      <AlertTriangle className="h-5 w-5 text-bad" />
      <div className="flex-1"><b>Couldn't load this.</b> <span className="text-muted">{String(error?.message || error)}</span></div>
      {retry && <Button size="sm" variant="secondary" onClick={retry}>Retry</Button>}
    </div>
  );
}

// ------------------------------------------------------------------ small visuals
export function Avatar({ name, tone = "brand", size = 36 }: { name: string; tone?: Tone; size?: number }) {
  const i = name.replace("Dr. ", "").split(" ").map((p) => p[0]).slice(0, 2).join("");
  return <span className={cx("grid shrink-0 place-items-center rounded-full font-bold ring-1 ring-inset", toneCls[tone])} style={{ width: size, height: size, fontSize: size * 0.36 }}>{i}</span>;
}

export function RangeBar({ lo, hi, expected, max = 140, actual, compact }: { lo: number; hi: number; expected: number; max?: number; actual?: number; compact?: boolean }) {
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  return (
    <div className={cx("relative w-full", compact ? "h-2.5" : "h-3.5")}>
      <div className="absolute inset-0 rounded-full bg-surface2" />
      <motion.div className="absolute top-0 h-full rounded-full bg-gradient-to-r from-brand/30 to-brand/60" initial={{ width: 0 }}
        animate={{ left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})` }} transition={{ duration: 0.6 }} />
      <motion.div className="absolute top-1/2 h-[160%] w-1 -translate-y-1/2 rounded-full bg-brand shadow" animate={{ left: pct(expected) }} transition={{ duration: 0.6 }} />
      {actual !== undefined && <div title="actual" className="absolute top-1/2 h-[160%] w-1 -translate-y-1/2 rounded-full bg-ink" style={{ left: pct(actual) }} />}
    </div>
  );
}

export function Meter({ value, tone = "brand" }: { value: number; tone?: Tone }) {
  const bg = { brand: "bg-brand", good: "bg-good", bad: "bg-bad", warn: "bg-warn", neutral: "bg-neutral", accent: "bg-accent" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface2">
      <motion.div className={cx("h-full rounded-full", bg)} initial={{ width: 0 }} animate={{ width: `${Math.min(100, value * 100)}%` }} transition={{ duration: 0.6 }} />
    </div>
  );
}

export function Takeaway({ children }: { children: ReactNode }) {
  return <p className="text-[15px] font-semibold leading-snug">{children}</p>;
}

export function DataNote({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 rounded-xl bg-surface2 px-3 py-2 text-xs text-muted"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><div>{children}</div></div>;
}
