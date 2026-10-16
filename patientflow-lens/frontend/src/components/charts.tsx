import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { cx } from "./ui";

export const C = {
  brand: "rgb(var(--brand))", bad: "rgb(var(--bad))", good: "rgb(var(--good))", neutral: "rgb(var(--neutral))",
  warn: "rgb(var(--warn))", accent: "rgb(var(--accent))", muted: "rgb(var(--muted))", line: "rgb(var(--line))", ink: "rgb(var(--ink))",
};

export function ChartTooltip({ active, payload, label, unit = "", fmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      {label !== undefined && <div className="mb-1 font-semibold">{label}</div>}
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-muted">{p.name}</span>
          <span className="ml-auto font-semibold tnum">{fmt ? fmt(p.value) : typeof p.value === "number" ? p.value.toFixed(1) : p.value}{unit}</span>
        </div>
      ))}
    </div>
  );
}

export const axis = { tickLine: false, axisLine: false, tick: { fill: C.muted, fontSize: 11 } } as const;
export const grid = { stroke: C.line, strokeDasharray: "3 3", vertical: false } as const;

export function Sparkline({ data, k, color = C.brand }: { data: any[]; k: string; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
        <defs>
          <linearGradient id={`sg-${k}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey={k} stroke={color} strokeWidth={2} fill={`url(#sg-${k})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal waterfall of per-feature minutes (exact model explanation). */
export function Waterfall({ baseline, contributions, expected, max = 6 }: {
  baseline: number; contributions: { label: string; value: any; minutes: number }[]; expected: number; max?: number;
}) {
  const shown = contributions.filter((c) => Math.abs(c.minutes) >= 0.3).slice(0, max);
  const rest = contributions.reduce((a, c) => a + c.minutes, 0) - shown.reduce((a, c) => a + c.minutes, 0);
  const rows = [...shown, ...(Math.abs(rest) >= 0.3 ? [{ label: "Other factors", value: "", minutes: rest }] : [])];
  let run = baseline;
  const steps = rows.map((r) => {
    const s = { ...r, from: run, to: run + r.minutes };
    run += r.minutes;
    return s;
  });
  const lo = Math.min(0, ...steps.map((s) => Math.min(s.from, s.to)));
  const hi = Math.max(expected, baseline, ...steps.map((s) => Math.max(s.from, s.to))) * 1.08;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const Row = ({ label, sub, from, to, tone, bold }: { label: string; sub?: string; from: number; to: number; tone: string; bold?: boolean }) => (
    <div className="grid grid-cols-[150px_1fr_64px] items-center gap-3 py-1.5">
      <div className="min-w-0 truncate text-xs"><span className={bold ? "font-bold" : "font-medium"}>{label}</span>{sub && <span className="text-muted"> · {sub}</span>}</div>
      <div className="relative h-6 rounded-md bg-surface2/60">
        <motion.div className={cx("absolute top-1 h-4 rounded", tone)} initial={{ width: 0, left: `${pct(Math.min(from, to))}%` }}
          animate={{ left: `${pct(Math.min(from, to))}%`, width: `${Math.max(0.6, Math.abs(pct(to) - pct(from)))}%` }} transition={{ duration: 0.5 }} />
      </div>
      <div className={cx("text-right text-xs tnum", bold ? "font-bold" : "font-semibold")}>{bold ? `${to.toFixed(0)} min` : `${to - from > 0 ? "+" : ""}${(to - from).toFixed(1)}`}</div>
    </div>
  );
  return (
    <div>
      <Row label="Typical patient" from={0} to={baseline} tone="bg-neutral/60" bold />
      {steps.map((s) => (
        <Row key={s.label} label={s.label} sub={String(s.value ?? "")} from={s.from} to={s.to} tone={s.minutes > 0 ? "bg-bad/80" : "bg-good/80"} />
      ))}
      <div className="mt-1 border-t border-line pt-1"><Row label="Expected wait" from={0} to={expected} tone="bg-brand" bold /></div>
    </div>
  );
}

/** Diverging bar with 95% CI whisker. */
export function ExcessBar({ value, ci, max = 12, confidence }: { value: number; ci: number; max?: number; confidence?: string }) {
  const pct = (v: number) => 50 + (Math.max(-max, Math.min(max, v)) / max) * 50;
  const tone = confidence === "Low" ? "bg-neutral" : value > 0 ? "bg-bad" : "bg-good";
  return (
    <div className="relative h-5 w-full">
      <div className="absolute left-1/2 top-0 h-full w-px bg-line" />
      <motion.div className={cx("absolute top-1 h-3 rounded", tone, confidence === "Low" && "opacity-50")}
        initial={{ width: 0, left: "50%" }} animate={{ left: `${Math.min(pct(0), pct(value))}%`, width: `${Math.abs(pct(value) - 50)}%` }} transition={{ duration: 0.6 }} />
      <div className="absolute top-[9px] h-px bg-ink/60" style={{ left: `${pct(value - ci)}%`, width: `${pct(value + ci) - pct(value - ci)}%` }} />
      <div className="absolute top-[5px] h-[9px] w-px bg-ink/60" style={{ left: `${pct(value - ci)}%` }} />
      <div className="absolute top-[5px] h-[9px] w-px bg-ink/60" style={{ left: `${pct(value + ci)}%` }} />
    </div>
  );
}

export function HeatCell({ v, delta, onClick }: { v: number | null; delta: number | null; onClick?: () => void }) {
  if (v === null) return <div className="h-11 rounded-lg bg-surface2" />;
  const d = delta ?? 0;
  const a = Math.min(1, Math.abs(d) / 14);
  const bg = d > 1.5 ? `rgb(var(--bad) / ${0.12 + a * 0.6})` : d < -1.5 ? `rgb(var(--good) / ${0.12 + a * 0.55})` : "rgb(var(--neutral) / 0.12)";
  return (
    <button onClick={onClick} className="focus-ring flex h-11 flex-col items-center justify-center rounded-lg text-xs transition hover:scale-[1.03]" style={{ background: bg }}
      title={`${v.toFixed(0)} min (${d > 0 ? "+" : ""}${d.toFixed(1)} vs hospital)`}>
      <span className="font-bold tnum">{v.toFixed(0)}</span>
      <span className="text-[10px] opacity-75 tnum">{d > 0 ? "+" : ""}{d.toFixed(0)}</span>
    </button>
  );
}
