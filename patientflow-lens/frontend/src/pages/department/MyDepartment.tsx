import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNavigate } from "react-router-dom";
import { axis, C, ChartTooltip, grid } from "@/components/charts";
import { Button, Card, ConfidenceBadge, Kpi, Loading, PageHeader, SeverityDot, Takeaway } from "@/components/ui";
import { useApi } from "@/lib/api";
import { signed } from "@/lib/format";
import { useApp } from "@/lib/state";

export default function MyDepartment() {
  const { departmentId } = useApp();
  const nav = useNavigate();
  const { data } = useApi<any>(`/departments/${departmentId}`);
  const { data: q } = useApi<any>("/investigate/queue");
  const { data: alerts } = useApi<any[]>(`/alerts?department_id=${departmentId}&status=open`);
  if (!data) return <Loading rows={4} />;
  const rank = q?.departments.findIndex((d: any) => d.department_id === departmentId);
  const me = q?.departments[rank];
  return (
    <div>
      <PageHeader eyebrow="My department" title={data.department_name} subtitle={`${data.service_type} · ${data.visits} visits in 2025 · real data`}
        actions={me && <ConfidenceBadge level={me.confidence} />} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Median wait" value={data.median_wait} unit="min" />
        <Kpi label="90th-percentile wait" value={data.p90_wait} unit="min" tone="warn" />
        <Kpi label="Excess vs triage mix" value={me ? signed(me.excess_wait) : "—"} unit="min" tone={me?.excess_wait > 0 ? "bad" : "good"} sub={me && `±${me.ci95.toFixed(1)} (95% CI)`} />
        <Kpi label="Investigate-first rank" value={rank >= 0 ? `#${rank + 1}` : "—"} sub="of 12 departments" />
        <Kpi label="Left before care" value={data.lbc_rate} unit="%" />
      </div>
      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3" title={<Takeaway>Peer benchmark: my waits vs the hospital and the best department, per triage level</Takeaway>}>
          <div className="h-72"><ResponsiveContainer>
            <BarChart data={data.by_triage} margin={{ left: -16 }}><CartesianGrid {...grid} /><XAxis dataKey="triage" {...axis} /><YAxis {...axis} unit="m" />
              <Tooltip content={<ChartTooltip unit=" min" />} cursor={{ fill: "rgb(var(--surface2))" }} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="mine" name={data.department_name} fill={me?.excess_wait > 0 ? C.bad : C.good} radius={[6, 6, 0, 0]} />
              <Bar dataKey="hospital" name="Hospital" fill={C.neutral} radius={[6, 6, 0, 0]} />
              <Bar dataKey="best" name="Best department" fill={C.good} fillOpacity={0.55} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer></div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">{data.by_triage.map((r: any) => <span key={r.triage}>{r.triage}: best is <b className="text-ink">{r.best_department}</b> ({r.best} min)</span>)}</div>
        </Card>
        <Card className="xl:col-span-2" title="Open alerts for this department" action={<Button size="sm" variant="ghost" onClick={() => nav("/command/alerts")}>All</Button>}>
          {!alerts?.length ? <div className="py-6 text-center text-sm text-muted">No open alerts</div> : (
            <div className="divide-y divide-line">{alerts.map((a) => (
              <div key={a.id} className="flex items-start gap-3 py-2.5"><SeverityDot s={a.severity} /><div className="text-sm">{a.title}<div className="text-xs text-muted">{a.suggested_action}</div></div></div>
            ))}</div>
          )}
        </Card>
      </div>
      <Card className="mt-5" title="Weekly mean wait" subtitle="2025, real encounters">
        <div className="h-56"><ResponsiveContainer>
          <LineChart data={data.trend} margin={{ left: -16 }}><CartesianGrid {...grid} /><XAxis dataKey="week" {...axis} tickFormatter={(w) => w.slice(5)} interval={5} /><YAxis {...axis} unit="m" />
            <Tooltip content={<ChartTooltip unit=" min" />} /><Line dataKey="mean" name="Mean wait" stroke={C.brand} strokeWidth={2} dot={false} /></LineChart>
        </ResponsiveContainer></div>
      </Card>
    </div>
  );
}
