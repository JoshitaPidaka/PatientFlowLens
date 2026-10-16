import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, C, ChartTooltip, grid } from "@/components/charts";
import { Card, Chip, DataNote, Kpi, Loading, PageHeader, Select, Takeaway } from "@/components/ui";
import { useApi } from "@/lib/api";

export default function Forecasts() {
  const { data } = useApi<any>("/forecast");
  const [dept, setDept] = useState("D03");
  if (!data) return <Loading rows={4} />;
  const d = data.departments.find((x: any) => x.department_id === dept);
  const series = [
    ...d.history.map((h: any) => ({ week: h.week, actual: h.arrivals })),
    ...d.forecast.map((f: any) => ({ week: f.week, forecast: f.forecast, band: [f.lo, f.hi] })),
  ];
  const card = data.card;
  return (
    <div>
      <PageHeader eyebrow="Forecasts" title="Demand and likely delay by department and week"
        subtitle="Poisson regression (department + seasonal terms), trained from scratch and backtested against a naive baseline."
        actions={<Select value={dept} onChange={setDept} options={data.departments.map((x: any) => ({ value: x.department_id, label: x.department_name }))} />} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Next-week arrivals" value={d.forecast[0].forecast.toFixed(1)} sub={`80% range ${d.forecast[0].lo}–${d.forecast[0].hi}`} tone="brand" />
        <Kpi label="Expected mean wait" value={d.expected_wait} unit="min" sub={`typical range ${d.wait_range[0]}–${d.wait_range[1]} min`} />
        <Kpi label="Backtest MAE (model)" value={card.comparison["Poisson regression"].MAE} sub="visits / dept / week" />
        <Kpi label="Skill vs naive" value={`${(card.skill_vs_naive * 100).toFixed(0)}%`} sub={`naive MAE ${card.comparison["Last-4-weeks mean (naive)"].MAE}`} tone={card.skill_vs_naive > 0 ? "good" : "warn"} />
      </div>
      <Card title={<Takeaway>{d.department_name}: about {d.forecast[0].forecast.toFixed(0)} visits a week expected, with wide uncertainty</Takeaway>}
        subtitle="Last 16 weeks (real) and 8-week forecast with 80% Poisson interval">
        <div className="h-80">
          <ResponsiveContainer>
            <ComposedChart data={series} margin={{ left: -16, right: 12 }}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="week" {...axis} tickFormatter={(w) => w.slice(5)} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip content={<ChartTooltip fmt={(v: any) => (Array.isArray(v) ? `${v[0]}–${v[1]}` : Number(v).toFixed(1))} />} />
              <Area dataKey="band" name="80% interval" stroke="none" fill={C.brand} fillOpacity={0.15} />
              <Line dataKey="actual" name="Actual" stroke={C.ink} strokeWidth={2} dot={{ r: 2.5 }} />
              <Line dataKey="forecast" name="Forecast" stroke={C.brand} strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        {data.departments.map((x: any) => (
          <button key={x.department_id} onClick={() => setDept(x.department_id)}
            className={`focus-ring rounded-2xl border bg-surface p-4 text-left shadow-card transition ${x.department_id === dept ? "border-brand" : "border-line hover:border-brand/40"}`}>
            <div className="flex items-center justify-between text-sm font-semibold">{x.department_name}<Chip tone="brand">{x.forecast[0].forecast.toFixed(1)}/wk</Chip></div>
            <div className="mt-1 text-xs text-muted">Expected wait {x.expected_wait} min · range {x.wait_range[0]}–{x.wait_range[1]}</div>
          </button>
        ))}
      </div>
      <div className="mt-5"><DataNote><b>Honesty note.</b> {card.honesty} Delay forecast = the wait model's expectation for each department's real triage mix.</DataNote></div>
    </div>
  );
}
