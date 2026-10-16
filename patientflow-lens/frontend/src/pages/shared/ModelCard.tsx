import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, C, ChartTooltip, grid } from "@/components/charts";
import { Card, Chip, DataNote, Kpi, Loading, PageHeader, Takeaway } from "@/components/ui";
import { useApi } from "@/lib/api";

export default function ModelCard() {
  const { data } = useApi<any>("/meta/model-card");
  if (!data) return <Loading rows={4} />;
  const w = data.wait;
  const comp = Object.entries(w.comparison).map(([k, v]: any) => ({ name: k.replace(" (production)", "").replace(" (challenger)", ""), ...v, prod: k.includes("production") }));
  return (
    <div>
      <PageHeader eyebrow="Model card" title="Six models, trained from scratch, evaluated honestly"
        subtitle="Time-aware split (train Jan–Sep 2025, test Oct–Dec 2025), baselines for every model, no API keys and no pretrained models." />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Wait model MAE (test)" value={w.comparison["Ridge regression (production)"].MAE} unit="min" tone="brand" sub={`naive ${w.comparison["Overall mean (naive)"].MAE} min`} />
        <Kpi label="R² (test)" value={w.comparison["Ridge regression (production)"].R2} sub="≈ half the variance explained" />
        <Kpi label="80% interval coverage" value={`${(w.interval.coverage_test * 100).toFixed(0)}%`} tone="good" sub="split-conformal, target 80%" />
        <Kpi label="Train / test visits" value={`${w.n_train} / ${w.n_test}`} sub="no shuffling, no leakage" />
      </div>
      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card title={<Takeaway>Ridge beats every baseline; gradient boosting adds nothing</Takeaway>} subtitle="Wait-time MAE on the Oct–Dec test set (lower is better)">
          <div className="h-64"><ResponsiveContainer>
            <BarChart data={comp} layout="vertical" margin={{ left: 70 }}><CartesianGrid {...grid} horizontal={false} vertical />
              <XAxis type="number" {...axis} domain={[0, 22]} unit="m" /><YAxis type="category" dataKey="name" {...axis} width={160} />
              <Tooltip content={<ChartTooltip unit=" min" />} cursor={{ fill: "rgb(var(--surface2))" }} />
              <Bar dataKey="MAE" radius={[0, 6, 6, 0]}>{comp.map((c) => <Cell key={c.name} fill={c.prod ? C.brand : C.neutral} />)}</Bar></BarChart>
          </ResponsiveContainer></div>
          <div className="text-sm">{w.decision}</div>
        </Card>
        <Card title="What drives the prediction" subtitle="Permutation importance on the test set (MAE increase in minutes when a feature is shuffled)">
          <div className="space-y-1.5">{w.importance.map((f: any) => (
            <div key={f.feature} className="grid grid-cols-[170px_1fr_50px] items-center gap-3 text-sm">
              <span className="font-mono text-xs">{f.feature}</span>
              <div className="h-2.5 rounded-full bg-surface2"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, f.mae_increase) / w.importance[0].mae_increase * 100}%` }} /></div>
              <span className="text-right text-xs tnum">{f.mae_increase.toFixed(2)}</span>
            </div>
          ))}</div>
        </Card>
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Mini title="Consultation duration" body={data.duration.decision} rows={data.duration.comparison} chosen={data.duration.chosen} />
        <Mini title="Demand forecast" body={`${data.forecast.method}. Backtest: ${data.forecast.backtest}. Skill vs naive ${(data.forecast.skill_vs_naive * 100).toFixed(0)}%.`} rows={data.forecast.comparison} chosen="Poisson regression" />
        <Card title="Unusual-wait detection" subtitle={data.anomaly.method}>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[["Department-weeks", data.anomaly.department_weeks], ["EWMA flags", data.anomaly.ewma_flags], ["IsolationForest flags", data.anomaly.iso_flags], ["Flagged by both", data.anomaly.both]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-surface2 px-3 py-2"><div className="text-[11px] text-muted">{k}</div><div className="font-bold">{v}</div></div>
            ))}
          </div>
          <div className="mt-2 text-xs text-muted">Confidence = High when both detectors agree, Medium for EWMA only, Low for IsolationForest only.</div>
        </Card>
        <Card title="Visit-pattern clustering" subtitle={data.clusters.method}>
          <div className="text-sm">k = {data.clusters.chosen_k} chosen by silhouette:</div>
          <div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(data.clusters.silhouette_by_k).map(([k, v]: any) => <Chip key={k} tone={Number(k) === data.clusters.chosen_k ? "brand" : "neutral"}>k={k}: {v}</Chip>)}</div>
        </Card>
        <Card title="Impact × confidence ranking" subtitle={data.ranking.method}><div className="text-sm text-muted">Statistical ranking with 95% confidence intervals, not a black-box score.</div></Card>
        <Card title="Deliberately not built"><div className="text-sm">{data.not_built}</div></Card>
      </div>
      <div className="mt-5"><DataNote><b>Limitations.</b> {w.limitations.join(" ")} Features: {w.features.join(", ")}.</DataNote></div>
    </div>
  );
}

function Mini({ title, body, rows, chosen }: { title: string; body: string; rows: any; chosen: string }) {
  return (
    <Card title={title}>
      <div className="mb-2 space-y-1.5">{Object.entries(rows).map(([k, v]: any) => (
        <div key={k} className="flex items-center justify-between rounded-lg bg-surface2 px-3 py-1.5 text-sm"><span>{k} {k === chosen && <Chip tone="brand">chosen</Chip>}</span><b className="tnum">MAE {v.MAE}</b></div>
      ))}</div>
      <div className="text-xs text-muted">{body}</div>
    </Card>
  );
}
