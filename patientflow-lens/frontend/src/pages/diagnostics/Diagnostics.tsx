import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, C, ChartTooltip, ExcessBar, grid } from "@/components/charts";
import { Button, Card, Chip, ConfidenceBadge, DataNote, Input, Kpi, Loading, Meter, PageHeader, Select, Takeaway, useToast } from "@/components/ui";
import { api, post, useAction, useApi } from "@/lib/api";
import { signed } from "@/lib/format";

const TYPES = ["Blood test", "CT scan", "ECG", "MRI", "Urine test", "X-ray"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function Diagnostics() {
  const { data } = useApi<any>("/diagnostics");
  const toast = useToast();
  const [tt, setTt] = useState("Blood test");
  const [pr, setPr] = useState("Urgent");
  const [mins, setMins] = useState("30");
  const add = useAction((b: any) => post("/targets", b), (r: any) => toast({ title: "Target set", body: `${r.breaches} historical breaches → sent to Alerts`, tone: "good" }));
  const del = useAction((id: number) => api(`/targets/${id}`, { method: "DELETE" }));
  if (!data) return <Loading rows={4} />;
  const o = data.overall;
  const maxDemand = Math.max(...data.demand.map((d: any) => d.n));
  return (
    <div>
      <PageHeader eyebrow="Service administration · diagnostics" title="Diagnostic-test turnaround monitor"
        subtitle="Request → completion time for 5,000 real test records, by type and priority, with targets that feed the alert engine." />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Tests analysed" value={(o.Urgent.n + o.Routine.n).toLocaleString()} />
        <Kpi label="Median turnaround: Urgent" value={o.Urgent.median} unit="min" tone="bad" sub={`p90 ${o.Urgent.p90} min`} />
        <Kpi label="Median turnaround: Routine" value={o.Routine.median} unit="min" sub={`p90 ${o.Routine.p90} min`} />
        <Kpi label="Urgent advantage" value={signed(o.Routine.median - o.Urgent.median, 0)} unit="min" tone="bad" sub="should be strongly positive" />
      </div>
      <Card className="mb-5 border-bad/30 bg-bad/5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-bad text-white"><AlertTriangle className="h-5 w-5" /></div>
          <div className="flex-1">
            <div className="text-lg font-bold">Urgent tests are not faster than routine ones</div>
            <div className="text-sm text-muted">Priority flags appear not to change processing order. Check how labs and imaging queue urgent requests.</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {data.priority_compliance.map((p: any) => (
                <div key={p.test_type} className="rounded-xl border border-line bg-surface p-2.5 text-xs">
                  <div className="font-semibold">{p.test_type}</div>
                  <div className="tnum">U {p.urgent_median} · R {p.routine_median}</div>
                  <Chip tone={p.breach ? "bad" : "good"} className="mt-1">{p.breach ? "no priority" : "prioritised"}</Chip>
                </div>
              ))}
            </div>
          </div>
          <ConfidenceBadge level="High" />
        </div>
      </Card>
      <div className="mb-5 grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3" title={<Takeaway>Turnaround distribution by test type: urgent (red) overlaps routine (grey)</Takeaway>} subtitle="Box = middle 50%, whiskers = 10th–90th percentile, line = median">
          <BoxPlot box={data.box} />
        </Card>
        <Card className="xl:col-span-2" title="Weekly median turnaround" subtitle="Last 26 weeks">
          <div className="h-72"><ResponsiveContainer>
            <LineChart data={data.trend} margin={{ left: -16 }}><CartesianGrid {...grid} /><XAxis dataKey="week" {...axis} tickFormatter={(w) => w.slice(5)} interval={4} /><YAxis {...axis} unit="m" />
              <Tooltip content={<ChartTooltip unit=" min" />} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="Urgent" stroke={C.bad} strokeWidth={2} dot={false} /><Line dataKey="Routine" stroke={C.neutral} strokeWidth={2} dot={false} /></LineChart>
          </ResponsiveContainer></div>
        </Card>
      </div>
      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card title="Turnaround targets" subtitle="Breaches become alerts in the Operations workspace">
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <Select label="Test" value={tt} onChange={setTt} options={TYPES.map((t) => ({ value: t, label: t }))} />
            <Select label="Priority" value={pr} onChange={setPr} options={["Urgent", "Routine"].map((t) => ({ value: t, label: t }))} />
            <Input label="Target (min)" type="number" value={mins} onChange={(e) => setMins(e.target.value)} className="w-28" />
            <Button loading={add.isPending} onClick={() => add.mutate({ test_type: tt, priority: pr, target_minutes: Number(mins) })}><Plus className="h-4 w-4" /> Add</Button>
          </div>
          {!data.targets.length ? <div className="py-4 text-center text-sm text-muted">No targets yet. Try urgent blood tests in 30 minutes.</div> : (
            <div className="space-y-3">{data.targets.map((t: any) => (
              <div key={t.id} className="rounded-xl border border-line p-3">
                <div className="mb-2 flex items-center justify-between text-sm"><b>{t.priority} {t.test_type} ≤ {t.target_minutes} min</b>
                  <button aria-label="Delete target" onClick={() => del.mutate(t.id)} className="text-muted hover:text-bad"><Trash2 className="h-4 w-4" /></button></div>
                <Meter value={t.meeting / 100} tone={t.meeting > 80 ? "good" : t.meeting > 50 ? "warn" : "bad"} />
                <div className="mt-1.5 text-xs text-muted">{t.meeting}% meet the target · {t.breaches} breaches of {t.n}</div>
              </div>
            ))}</div>
          )}
        </Card>
        <Card title="Test demand by weekday and hour" subtitle="Request volume (real); supports staffing and equipment planning">
          <div className="overflow-x-auto">
            <div className="grid min-w-[560px] gap-[3px]" style={{ gridTemplateColumns: "44px repeat(24, 1fr)" }}>
              <div />{Array.from({ length: 24 }, (_, h) => <div key={h} className="text-center text-[9px] text-muted">{h % 3 === 0 ? h : ""}</div>)}
              {DAYS.map((d) => (
                <div key={d} className="contents">
                  <div className="text-[11px] text-muted">{d.slice(0, 3)}</div>
                  {Array.from({ length: 24 }, (_, h) => {
                    const n = data.demand.find((x: any) => x.weekday === d && x.hour === h)?.n || 0;
                    return <div key={h} title={`${d} ${h}:00 · ${n} requests`} className="h-5 rounded-[3px]" style={{ background: `rgb(var(--accent) / ${0.08 + (n / maxDemand) * 0.8})` }} />;
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 text-xs text-muted">Fairly even across the week: no strong peak to staff for.</div>
        </Card>
      </div>
      <Card title="Support-service scorecard" subtitle="Triage-adjusted patient waits in diagnostics and support departments">
        <div className="divide-y divide-line">{data.support.map((d: any) => (
          <div key={d.department_id} className="grid grid-cols-[160px_1fr_90px_120px] items-center gap-4 py-2.5 text-sm">
            <b>{d.department_name}</b><ExcessBar value={d.excess_wait} ci={d.ci95} confidence={d.confidence} />
            <span className={`text-right font-bold tnum ${d.excess_wait > 0 ? "text-bad" : "text-good"}`}>{signed(d.excess_wait)}m</span><ConfidenceBadge level={d.confidence} />
          </div>
        ))}</div>
      </Card>
      <div className="mt-4"><DataNote>{data.note}</DataNote></div>
    </div>
  );
}

function BoxPlot({ box }: { box: any[] }) {
  const max = 200;
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="space-y-3">
      <div className="ml-[92px] flex justify-between text-[10px] text-muted">{[0, 50, 100, 150, 200].map((v) => <span key={v}>{v}m</span>)}</div>
      {TYPES.map((t) => (
        <div key={t} className="grid grid-cols-[84px_1fr] items-center gap-2">
          <span className="text-xs font-semibold">{t}</span>
          <div className="space-y-1">
            {["Urgent", "Routine"].map((p) => {
              const b = box.find((x) => x.test_type === t && x.priority === p);
              const col = p === "Urgent" ? "bg-bad" : "bg-neutral";
              return (
                <div key={p} className="relative h-3.5" title={`${p}: median ${b.median} min (IQR ${b.q1}–${b.q3}, n=${b.n})`}>
                  <div className={`absolute top-1/2 h-px ${col}`} style={{ left: pct(b.p10), width: `calc(${pct(b.p90)} - ${pct(b.p10)})` }} />
                  <div className={`absolute top-0 h-full rounded ${col} opacity-40`} style={{ left: pct(b.q1), width: `calc(${pct(b.q3)} - ${pct(b.q1)})` }} />
                  <div className={`absolute top-0 h-full w-0.5 ${col}`} style={{ left: pct(b.median) }} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
