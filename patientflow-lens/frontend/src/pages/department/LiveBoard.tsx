import { AnimatePresence, motion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card, Chip, cx, DataNote, Loading, PageHeader, Segmented, Select, TriageChip } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useApp } from "@/lib/state";

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;

export default function LiveBoard() {
  const { departmentId } = useApp();
  const { data: busiest } = useApi<any[]>("/live/busiest");
  const [date, setDate] = useState("2025-09-22");
  useEffect(() => { if (busiest?.length && !busiest.some((b) => b.date === date)) setDate(busiest[0].date); }, [busiest]);
  const [scope, setScope] = useState<"all" | "dept">("all");
  const { data } = useApi<any>(`/live/day?date=${date}${scope === "dept" ? `&department_id=${departmentId}` : ""}`);
  const [t, setT] = useState(10 * 60 + 30);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<"1" | "5" | "15">("5");
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setT((x) => (x >= 1439 ? 0 : x + Number(speed))), 250);
    return () => clearInterval(id);
  }, [playing, speed]);

  const base = new Date(date + "T00:00:00").getTime();
  const mins = (iso: string) => (new Date(iso).getTime() - base) / 60000;
  const encs = data?.encounters || [];
  const cards = useMemo(() => encs.map((e: any) => {
    const a = mins(e.arrival), s = mins(e.service_start), en = mins(e.service_end), d = mins(e.discharge);
    if (t < a || t >= d) return null;
    const state = t < s ? "waiting" : t < en ? "in_service" : "awaiting";
    const elapsed = state === "waiting" ? t - a : state === "in_service" ? t - s : t - en;
    const status = state !== "waiting" ? state : elapsed > e.p90 ? "overdue" : elapsed > e.expected_wait ? "at_risk" : "on_track";
    return { ...e, state, elapsed, status };
  }).filter(Boolean), [encs, t]);
  const cols = [["waiting", "Waiting"], ["in_service", "In service"], ["awaiting", "Awaiting discharge"]] as const;
  const watch = cards.filter((c: any) => c.status === "at_risk" || c.status === "overdue");

  return (
    <div>
      <PageHeader eyebrow="Live board · time machine" title="Replay a real day, minute by minute"
        subtitle="Patients move between columns as the clock runs. Waiting cards are compared with the model's expected wait: amber = past expected, red = past the 90th percentile."
        actions={<>
          {busiest && <Select value={date} onChange={(v) => { setDate(v); setT(8 * 60); }} options={busiest.map((b) => ({ value: b.date, label: `${b.date} · ${b.visits} visits` }))} />}
          <Segmented value={scope} onChange={setScope} options={[{ value: "all", label: "Whole hospital" }, { value: "dept", label: "My department" }]} />
        </>} />
      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={() => setPlaying(!playing)} className="focus-ring grid h-12 w-12 place-items-center rounded-full bg-brand text-white shadow hover:bg-brand2" aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </button>
          <div className="text-4xl font-extrabold tracking-tight tnum">{fmt(t)}</div>
          <input aria-label="Time of day" type="range" min={0} max={1439} value={t} onChange={(e) => setT(Number(e.target.value))} className="min-w-[200px] flex-1 accent-[rgb(var(--brand))]" />
          <Segmented size="sm" value={speed} onChange={setSpeed} options={[{ value: "1", label: "1×" }, { value: "5", label: "5×" }, { value: "15", label: "15×" }]} />
        </div>
      </Card>
      {!data ? <Loading rows={3} /> : (
        <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
          <div className="grid gap-4 md:grid-cols-3">
            {cols.map(([k, label]) => {
              const items = cards.filter((c: any) => c.state === k);
              return (
                <div key={k} className="min-h-[260px] rounded-2xl border border-line bg-surface2/60 p-3">
                  <div className="mb-3 flex items-center justify-between px-1 text-sm font-bold">{label}<span className="grid h-6 min-w-6 place-items-center rounded-full bg-surface px-2 text-xs">{items.length}</span></div>
                  <div className="space-y-2">
                    <AnimatePresence>
                      {items.map((c: any) => <PatientCard key={c.encounter_id} c={c} />)}
                    </AnimatePresence>
                    {!items.length && <div className="py-8 text-center text-xs text-muted">Nobody</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <Card title="Long-wait watchlist" subtitle="Past the model's expected wait">
            {!watch.length ? <div className="py-6 text-center text-sm text-muted">Everyone is on track</div> : (
              <div className="space-y-2">{watch.map((c: any) => (
                <div key={c.encounter_id} className={cx("rounded-xl border p-2.5 text-sm", c.status === "overdue" ? "border-bad/40 bg-bad/5" : "border-warn/40 bg-warn/5")}>
                  <div className="flex items-center justify-between"><b>{c.encounter_id}</b><TriageChip level={c.triage_level} /></div>
                  <div className="text-xs text-muted">{c.department_name} · waiting {c.elapsed.toFixed(0)} min (expected {c.expected_wait.toFixed(0)})</div>
                </div>
              ))}</div>
            )}
          </Card>
        </div>
      )}
      {data && <Gantt encs={encs} t={t} mins={mins} onSeek={setT} />}
      <div className="mt-4"><DataNote>Real 2025 encounters replayed from their timestamps. The hospital sees about 22 visits a day, so only a few patients are present at any moment. The day timeline below shows the whole day.</DataNote></div>
    </div>
  );
}

function PatientCard({ c }: { c: any }) {
  const ring = c.status === "overdue" ? "ring-2 ring-bad" : c.status === "at_risk" ? "ring-2 ring-warn animate-pulsering" : "ring-1 ring-line";
  const pct = c.state === "waiting" ? Math.min(100, (c.elapsed / Math.max(1, c.p90)) * 100) : 100;
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.9, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
      className={cx("rounded-xl bg-surface p-3 shadow-sm", ring)}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold">{c.encounter_id}</span><TriageChip level={c.triage_level} />
      </div>
      <div className="mt-1 text-xs text-muted">{c.department_name} · {c.visit_type}</div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-bold tnum">{c.elapsed.toFixed(0)} min</span>
        {c.state === "waiting" && <span className="text-muted">expected {c.p10.toFixed(0)}–{c.p90.toFixed(0)}</span>}
      </div>
      {c.state === "waiting" && <div className="mt-1.5 h-1.5 rounded-full bg-surface2"><div className={cx("h-full rounded-full", c.status === "overdue" ? "bg-bad" : c.status === "at_risk" ? "bg-warn" : "bg-good")} style={{ width: `${pct}%` }} /></div>}
    </motion.div>
  );
}

function Gantt({ encs, t, mins, onSeek }: { encs: any[]; t: number; mins: (s: string) => number; onSeek: (m: number) => void }) {
  const W = (m: number) => `${Math.max(0, Math.min(100, (m / 1440) * 100))}%`;
  return (
    <Card className="mt-5" title="Day timeline" subtitle="Each row is one visit: amber = waiting, teal = in service, grey = awaiting discharge. Click to jump.">
      <div className="relative" onClick={(e) => { const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect(); onSeek(Math.round(((e.clientX - r.left - 150) / (r.width - 150)) * 1440)); }}>
        <div className="mb-1 ml-[150px] flex justify-between text-[10px] text-muted">{[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => <span key={h}>{String(h).padStart(2, "0")}</span>)}</div>
        <div className="space-y-1">
          {encs.map((e) => {
            const a = mins(e.arrival), s = mins(e.service_start), en = mins(e.service_end), d = mins(e.discharge);
            return (
              <div key={e.encounter_id} className="grid grid-cols-[150px_1fr] items-center gap-0 text-[11px]">
                <span className="truncate pr-2 text-muted">{e.department_name}</span>
                <div className="relative h-4 rounded bg-surface2/60">
                  <div className="absolute h-full rounded-l bg-warn/80" style={{ left: W(a), width: `calc(${W(s)} - ${W(a)})` }} />
                  <div className="absolute h-full bg-brand" style={{ left: W(s), width: `calc(${W(en)} - ${W(s)})` }} />
                  <div className="absolute h-full rounded-r bg-neutral/50" style={{ left: W(en), width: `calc(${W(d)} - ${W(en)})` }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="pointer-events-none absolute bottom-0 top-4 w-0.5 bg-bad" style={{ left: `calc(150px + (100% - 150px) * ${t / 1440})` }} />
      </div>
    </Card>
  );
}
