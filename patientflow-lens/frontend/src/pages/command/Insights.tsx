import { Download, FileText } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ErrorBar, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, C, ChartTooltip, grid } from "@/components/charts";
import FilterBar, { useFilterQs } from "@/components/FilterBar";
import { Button, Card, Chip, DataNote, Loading, PageHeader, Segmented, Takeaway } from "@/components/ui";
import { useApi } from "@/lib/api";

export default function Insights() {
  const [tab, setTab] = useState<"trends" | "equity" | "lbc" | "clusters" | "reports">("trends");
  return (
    <div>
      <PageHeader eyebrow="Insights & reports" title="Deeper patterns, fairness checks and exports"
        actions={<Segmented value={tab} onChange={setTab} options={[
          { value: "trends", label: "Trends" }, { value: "equity", label: "Fair-wait audit" }, { value: "lbc", label: "Left before care" },
          { value: "clusters", label: "Visit patterns" }, { value: "reports", label: "Reports" }]} />} />
      {tab === "trends" && <Trends />}
      {tab === "equity" && <Equity />}
      {tab === "lbc" && <Lbc />}
      {tab === "clusters" && <Clusters />}
      {tab === "reports" && <Reports />}
    </div>
  );
}

function Trends() {
  const f = useFilterQs();
  const { data } = useApi<any>(`/overview/kpis${f}`);
  const { data: flow } = useApi<any>(`/overview/flow${f}`);
  return (
    <>
      <FilterBar />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title={<Takeaway>Weekly median wait is stable through 2025</Takeaway>} subtitle="Filtered real encounters">
          {!data ? <Loading /> : <div className="h-64"><ResponsiveContainer>
            <BarChart data={data.wait_trend} margin={{ left: -20 }}><CartesianGrid {...grid} /><XAxis dataKey="week" {...axis} tickFormatter={(w) => w.slice(5)} interval={5} /><YAxis {...axis} unit="m" />
              <Tooltip content={<ChartTooltip unit=" min" />} /><Bar dataKey="median" name="Median wait" fill={C.brand} radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer></div>}
        </Card>
        <Card title={<Takeaway>Where the time goes: waiting vs service vs discharge</Takeaway>} subtitle="Mean minutes per stage by department">
          {!flow ? <Loading /> : <div className="h-64"><ResponsiveContainer>
            <BarChart data={flow.funnel.by_department} layout="vertical" margin={{ left: 40 }}><CartesianGrid {...grid} horizontal={false} vertical />
              <XAxis type="number" {...axis} unit="m" /><YAxis type="category" dataKey="department" {...axis} width={110} />
              <Tooltip content={<ChartTooltip unit=" min" />} />
              <Bar dataKey="wait" stackId="a" name="Waiting" fill={C.warn} /><Bar dataKey="service" stackId="a" name="In service" fill={C.brand} />
              <Bar dataKey="post" stackId="a" name="Awaiting discharge" fill={C.neutral} radius={[0, 4, 4, 0]} /></BarChart>
          </ResponsiveContainer></div>}
        </Card>
      </div>
    </>
  );
}

function Equity() {
  const { data } = useApi<any>("/insights/equity");
  if (!data) return <Loading />;
  const label: Record<string, string> = { age_band: "Age band", sex: "Sex", insurance_type: "Insurance" };
  return (
    <>
      <Card tone="brand" className="mb-5"><div className="flex items-center gap-3"><Chip tone="good">No unequal treatment found</Chip><span className="text-sm">{data.verdict}</span></div></Card>
      <div className="grid gap-5 lg:grid-cols-3">
        {Object.entries(data.groups).map(([dim, rows]: any) => (
          <Card key={dim} title={label[dim]} subtitle="Wait gap after adjusting for triage & department (±95% CI)">
            <div className="h-56"><ResponsiveContainer>
              <BarChart data={rows} margin={{ left: -20 }}><CartesianGrid {...grid} /><XAxis dataKey="group" {...axis} /><YAxis {...axis} domain={[-6, 6]} unit="m" />
                <ReferenceLine y={0} stroke={C.neutral} /><Tooltip content={<ChartTooltip unit=" min" />} />
                <Bar dataKey="adjusted_gap" name="Gap" fill={C.accent} radius={[4, 4, 4, 4]}><ErrorBar dataKey="ci95" width={6} stroke={C.ink} /></Bar>
              </BarChart>
            </ResponsiveContainer></div>
          </Card>
        ))}
      </div>
    </>
  );
}

function Lbc() {
  const { data } = useApi<any>("/insights/lbc");
  if (!data) return <Loading />;
  const bands = Object.entries(data.by_wait_band).map(([k, v]) => ({ band: k.replace("(", "").replace("]", "").replace(", ", "–"), rate: v }));
  const depts = Object.entries(data.by_department).map(([k, v]) => ({ dept: k, rate: v }));
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title={<Takeaway>Longer waits do not raise the left-before-care rate</Takeaway>} subtitle="Rate by wait band (minutes)">
        <div className="h-64"><ResponsiveContainer><BarChart data={bands} margin={{ left: -20 }}><CartesianGrid {...grid} /><XAxis dataKey="band" {...axis} /><YAxis {...axis} unit="%" />
          <Tooltip content={<ChartTooltip unit="%" />} /><Bar dataKey="rate" name="Left before care" fill={C.neutral} radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>
        <DataNote>{data.note}</DataNote>
      </Card>
      <Card title="Left-before-care rate by department" subtitle="Monitored for spikes (alerts) rather than predicted">
        <div className="h-72"><ResponsiveContainer><BarChart data={depts} layout="vertical" margin={{ left: 40 }}><CartesianGrid {...grid} horizontal={false} vertical />
          <XAxis type="number" {...axis} unit="%" /><YAxis type="category" dataKey="dept" {...axis} width={110} /><Tooltip content={<ChartTooltip unit="%" />} />
          <Bar dataKey="rate" name="Rate" fill={C.bad} fillOpacity={0.75} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>
      </Card>
    </div>
  );
}

function Clusters() {
  const { data } = useApi<any>("/insights/clusters");
  if (!data) return <Loading />;
  return (
    <>
      <div className="mb-4 text-sm text-muted">K-means on per-patient visit features, k = {data.card.chosen_k} chosen by silhouette ({Object.entries(data.card.silhouette_by_k).map(([k, v]: any) => `k${k}: ${v}`).join(" · ")}).</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.clusters.map((c: any) => (
          <Card key={c.cluster} title={c.name} subtitle={`${c.patients} patients`}>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[["Visits / patient", c.visits.toFixed(1)], ["Mean age", c.age.toFixed(0)], ["Follow-up share", `${(100 * c.share_followup).toFixed(0)}%`],
                ["Emergency share", `${(100 * c.share_emergency).toFixed(0)}%`], ["Departments", c.distinct_depts.toFixed(1)], ["Mean wait", `${c.mean_wait.toFixed(1)} min`]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-surface2 px-2.5 py-1.5"><div className="text-[11px] text-muted">{k}</div><div className="font-semibold tnum">{v}</div></div>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-4"><DataNote>Silhouette scores are modest (~0.18): visit patterns are only loosely grouped. Waits are similar across clusters, which is consistent with triage, not patient type, driving waits.</DataNote></div>
    </>
  );
}

function Reports() {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card title="Weekly operations report" subtitle="Briefing, key numbers, investigate-first ranking and open alerts">
        <a href="/api/v1/reports/weekly.pdf"><Button><FileText className="h-4 w-4" /> Download PDF</Button></a>
      </Card>
      <Card title="Data exports" subtitle="CSV, with current filters for encounters">
        <div className="flex flex-wrap gap-2">
          {["encounters", "bottlenecks", "tests"].map((t) => <a key={t} href={`/api/v1/export/${t}.csv`}><Button variant="secondary"><Download className="h-4 w-4" /> {t}.csv</Button></a>)}
        </div>
      </Card>
    </div>
  );
}
