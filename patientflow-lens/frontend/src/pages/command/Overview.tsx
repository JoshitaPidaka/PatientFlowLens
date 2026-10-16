import { ArrowRight, Clock, DoorOpen, Gauge, Siren, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, Layer, Line, LineChart, Rectangle, ResponsiveContainer, Sankey, Tooltip, XAxis, YAxis } from "recharts";
import { axis, C, ChartTooltip, ExcessBar, grid, HeatCell, Sparkline } from "@/components/charts";
import FilterBar, { useFilterQs } from "@/components/FilterBar";
import WhyDrawer from "@/components/WhyDrawer";
import { Button, Card, ConfidenceBadge, Kpi, Loading, PageHeader, SeverityDot, Takeaway } from "@/components/ui";
import { useApi } from "@/lib/api";
import { fmtNum, signed } from "@/lib/format";

export default function Overview() {
  const f = useFilterQs();
  const nav = useNavigate();
  const { data: k } = useApi<any>(`/overview/kpis${f}`);
  const { data: brief } = useApi<any>("/overview/briefing");
  const { data: heat } = useApi<any>(`/overview/heatmap${f}`);
  const { data: q } = useApi<any>("/investigate/queue");
  const { data: flow } = useApi<any>(`/overview/flow${f}`);
  const { data: alerts } = useApi<any[]>("/alerts?status=open");
  const { data: pulse } = useApi<any[]>("/live/pulse?date=2025-12-15");
  const { data: hourly } = useApi<any[]>("/overview/hourly");
  const [why, setWhy] = useState<string | null>(null);
  const sev = { high: 0, medium: 1, low: 2 } as any;
  const top = (alerts || []).slice().sort((a, b) => sev[a.severity] - sev[b.severity]).slice(0, 6);

  return (
    <div>
      <PageHeader eyebrow="Operations · real 2025 data" title="Where are patients waiting, and what should we examine first?"
        subtitle="Department-level queues and waits, adjusted for how sick patients are, with every alert explained." />
      <FilterBar />

      {/* Briefing */}
      <Card tone="brand" className="mb-5">
        {!brief ? <Loading rows={1} /> : (
          <div className="flex flex-wrap items-start gap-6">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand text-white shadow"><Siren className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-brand">Today's briefing</div>
              <div className="mt-1 text-xl font-bold">{brief.headline}</div>
              <ul className="mt-2 space-y-1 text-sm text-ink/85">{brief.lines.map((l: string) => <li key={l} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{l}</li>)}</ul>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => setWhy(brief.top_department_id)}>Why? View evidence</Button>
              <Button variant="secondary" onClick={() => nav("/command/investigate")}>Investigate-first queue <ArrowRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </Card>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Visits" value={fmtNum(k?.visits)} sub={`${k?.visits_per_day ?? "—"} per day · ${fmtNum(k?.patients)} patients`} icon={<Users className="h-4 w-4" />} />
        <Kpi label="Median wait" value={k?.median_wait ?? "—"} unit="min" sub="arrival → service start" icon={<Clock className="h-4 w-4" />}
          spark={k && <Sparkline data={k.wait_trend} k="median" />} />
        <Kpi label="90th-percentile wait" value={k?.p90_wait ?? "—"} unit="min" tone="warn" sub="1 in 10 patients wait longer" icon={<Gauge className="h-4 w-4" />} />
        <Kpi label="Left before care" value={k?.lbc_rate ?? "—"} unit="%" sub="no link to wait length found" icon={<DoorOpen className="h-4 w-4" />} />
        <Kpi label="Open alerts" value={alerts?.length ?? "—"} tone="bad" sub="explained & assignable" icon={<Siren className="h-4 w-4" />} />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3" title={<Takeaway>Triage drives waiting: Low-acuity patients wait ~4× longer than Critical</Takeaway>}
          subtitle="Mean wait (min) by department × triage. Colour = difference from the hospital at the same triage level. Click a row.">
          {!heat ? <Loading rows={2} /> : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[520px] grid-cols-[150px_repeat(4,1fr)] gap-1.5">
                <div />
                {heat.triage.map((t: string) => <div key={t} className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">{t}</div>)}
                {heat.rows.map((r: any) => (
                  <Row key={r.department} r={r} onClick={() => setWhy(q?.departments.find((d: any) => d.department_name === r.department)?.department_id)} />
                ))}
              </div>
            </div>
          )}
        </Card>
        <Card className="xl:col-span-2" title="Investigate first" subtitle="Ranked by extra patient-hours × confidence"
          action={<Button size="sm" variant="ghost" onClick={() => nav("/command/investigate")}>All <ArrowRight className="h-3.5 w-3.5" /></Button>}>
          {!q ? <Loading /> : (
            <div className="space-y-2">
              {q.departments.slice(0, 5).map((d: any, i: number) => (
                <button key={d.department_id} onClick={() => setWhy(d.department_id)}
                  className="focus-ring grid w-full grid-cols-[28px_1fr_auto] items-center gap-3 rounded-xl border border-line p-3 text-left transition hover:border-brand/40 hover:bg-surface2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-surface2 text-xs font-bold">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">{d.department_name} <ConfidenceBadge level={d.confidence} /></div>
                    <div className="mt-1.5"><ExcessBar value={d.excess_wait} ci={d.ci95} /></div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-bad tnum">{signed(d.excess_wait)}m</div>
                    <div className="text-[11px] text-muted">{d.impact_hours.toFixed(0)} pt-h/yr</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3" title={<Takeaway>Patient-flow river: how visits move from arrival type to triage to outcome</Takeaway>}
          subtitle="Width = number of visits (real encounters)">
          {!flow ? <Loading rows={2} /> : (
            <div className="h-[320px]">
              <ResponsiveContainer>
                <Sankey data={flow.sankey} nodePadding={18} nodeWidth={12} margin={{ left: 8, right: 120, top: 8, bottom: 8 }}
                  link={{ stroke: C.brand, strokeOpacity: 0.18 }} node={<SankeyNode />}>
                  <Tooltip content={<ChartTooltip />} />
                </Sankey>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card className="xl:col-span-2" title="Needs attention" subtitle="Highest-severity open alerts"
          action={<Button size="sm" variant="ghost" onClick={() => nav("/command/alerts")}>All <ArrowRight className="h-3.5 w-3.5" /></Button>}>
          <div className="divide-y divide-line">
            {top.map((a) => (
              <button key={a.id} onClick={() => nav(`/command/alerts?id=${a.id}`)} className="focus-ring flex w-full items-start gap-3 py-2.5 text-left hover:opacity-80">
                <SeverityDot s={a.severity} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-snug">{a.title}</div>
                  <div className="mt-0.5 text-xs text-muted">{a.suggested_action}</div>
                </div>
                <ConfidenceBadge level={a.confidence} />
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title={<Takeaway>Hospital pulse: patients waiting vs in service through the busiest day (15 Dec 2025)</Takeaway>} subtitle="Rebuilt minute-by-minute from encounter timestamps">
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={pulse || []} margin={{ left: -24, right: 8 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="t" {...axis} interval={11} />
                <YAxis {...axis} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="stepAfter" dataKey="in_service" name="In service" stroke={C.brand} fill={C.brand} fillOpacity={0.15} strokeWidth={2} />
                <Area type="stepAfter" dataKey="waiting" name="Waiting" stroke={C.warn} fill={C.warn} fillOpacity={0.2} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title={<Takeaway>No time-of-day effect: mean wait is flat across the 24 hours</Takeaway>} subtitle="Shown so we don't over-claim. Hour-of-day forecasts would be invented.">
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={hourly || []} margin={{ left: -24, right: 8 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="hour" {...axis} />
                <YAxis {...axis} domain={[0, 80]} unit="m" />
                <Tooltip content={<ChartTooltip />} />
                <Line dataKey="mean_wait" name="Mean wait" stroke={C.neutral} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <WhyDrawer departmentId={why} onClose={() => setWhy(null)} onAction={() => nav("/command/alerts")} />
    </div>
  );
}

function Row({ r, onClick }: { r: any; onClick: () => void }) {
  return (
    <>
      <button onClick={onClick} className="focus-ring truncate rounded-lg px-2 text-left text-sm font-medium hover:text-brand">{r.department}</button>
      {r.cells.map((c: any) => <HeatCell key={c.triage} v={c.wait} delta={c.delta} onClick={onClick} />)}
    </>
  );
}

function SankeyNode({ x, y, width, height, index, payload, containerWidth }: any) {
  const colors: Record<string, string> = { visit: C.accent, triage: C.brand, outcome: C.good };
  const out = x + width + 6 > containerWidth - 120;
  return (
    <Layer key={`n${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill={colors[payload.group] || C.brand} fillOpacity={0.9} radius={3} />
      <text x={out ? x + width + 6 : x + width + 6} y={y + height / 2} dy={4} fontSize={11} fill="rgb(var(--ink))">
        {payload.name} <tspan fill="rgb(var(--muted))">{payload.value}</tspan>
      </text>
    </Layer>
  );
}
