import { useEffect, useState } from "react";
import { Waterfall } from "@/components/charts";
import { Card, DataNote, Input, Loading, PageHeader, RangeBar, Select } from "@/components/ui";
import { post, useApi } from "@/lib/api";
import { useApp } from "@/lib/state";

export default function Estimator() {
  const { data: meta } = useApi<any>("/meta");
  const { data: card } = useApi<any>("/meta/model-card");
  const app = useApp();
  const [f, setF] = useState({ department_name: "Pediatrics", triage_level: "Low", visit_type: "Walk-in", age: 8, arrival_hour: 10, dept_arrivals_prev_24h: 2 });
  const [r, setR] = useState<any>(null);
  useEffect(() => { if (meta) { const d = meta.departments.find((x: any) => x.department_id === app.departmentId); if (d) setF((x) => ({ ...x, department_name: d.department_name })); } }, [meta]);
  useEffect(() => { const t = setTimeout(() => post("/predict/wait", f).then(setR), 120); return () => clearTimeout(t); }, [f]);
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const m = card?.wait;
  return (
    <div>
      <PageHeader eyebrow="Wait estimator · ML trained from scratch" title="How long will this patient wait, and why?"
        subtitle={m && `Ridge regression · time-aware test (Oct–Dec 2025): MAE ${m.comparison["Ridge regression (production)"].MAE} min, R² ${m.comparison["Ridge regression (production)"].R2}, 80% interval coverage ${(m.interval.coverage_test * 100).toFixed(0)}%`} />
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <Card title="New arrival">
          {!meta ? <Loading /> : (
            <div className="grid gap-3">
              <Select label="Department" value={f.department_name} onChange={(v) => set("department_name", v)} options={meta.departments.map((d: any) => ({ value: d.department_name, label: d.department_name }))} />
              <Select label="Triage level" value={f.triage_level} onChange={(v) => set("triage_level", v)} options={meta.triage_levels.map((t: string) => ({ value: t, label: t }))} />
              <Select label="Visit type" value={f.visit_type} onChange={(v) => set("visit_type", v)} options={meta.visit_types.map((t: string) => ({ value: t, label: t }))} />
              <div className="grid grid-cols-3 gap-3">
                <Input label="Age" type="number" value={f.age} onChange={(e) => set("age", Number(e.target.value))} />
                <Input label="Hour" type="number" min={0} max={23} value={f.arrival_hour} onChange={(e) => set("arrival_hour", Number(e.target.value))} />
                <Input label="Load 24h" type="number" min={0} value={f.dept_arrivals_prev_24h} onChange={(e) => set("dept_arrivals_prev_24h", Number(e.target.value))} />
              </div>
            </div>
          )}
        </Card>
        <div className="space-y-5">
          <Card tone="brand">
            {!r ? <Loading rows={1} /> : (
              <div>
                <div className="flex flex-wrap items-end gap-6">
                  <div><div className="text-sm font-semibold text-brand">Expected wait</div><div className="text-6xl font-extrabold tracking-tight tnum">{r.expected.toFixed(0)}<span className="text-xl text-muted"> min</span></div></div>
                  <div className="pb-2 text-sm text-muted">80% range <b className="text-ink">{r.p10.toFixed(0)}–{r.p90.toFixed(0)} min</b><br />typical patient {r.baseline.toFixed(0)} min</div>
                </div>
                <div className="mt-4"><RangeBar lo={r.p10} hi={r.p90} expected={r.expected} /></div>
              </div>
            )}
          </Card>
          <Card title="Why this estimate" subtitle="Exact contributions: each bar is the minutes this factor adds or removes vs a typical patient">
            {r && <Waterfall baseline={r.baseline} contributions={r.contributions} expected={r.expected} />}
          </Card>
          <DataNote>Linear model, so the breakdown is exact, not an approximation. Hour of day, weekday, age and recent load have almost no effect in this data, which matches the exploratory analysis.</DataNote>
        </div>
      </div>
    </div>
  );
}
