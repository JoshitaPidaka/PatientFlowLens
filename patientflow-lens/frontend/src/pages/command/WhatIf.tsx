import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, C, ChartTooltip, grid } from "@/components/charts";
import { Card, DataNote, PageHeader, Segmented, Select } from "@/components/ui";
import { post, useApi } from "@/lib/api";

export default function WhatIf() {
  const [params] = useSearchParams();
  const { data: q } = useApi<any>("/investigate/queue");
  const [dept, setDept] = useState(params.get("dept") || "D03");
  const [target, setTarget] = useState<"hospital" | "best">("hospital");
  const [pct, setPct] = useState(100);
  const [shift, setShift] = useState(0);
  const [res, setRes] = useState<any>(null);
  useEffect(() => {
    const t = setTimeout(() => post("/whatif", { department_id: dept, target, improvement_pct: pct, triage_shift: shift }).then(setRes), 150);
    return () => clearTimeout(t);
  }, [dept, target, pct, shift]);
  const pot = (q?.departments || []).filter((d: any) => d.excess_wait > 0).map((d: any) => ({ name: d.department_name, hours: d.impact_hours, id: d.department_id }));
  return (
    <div>
      <PageHeader eyebrow="What-if simulator" title="What would fixing a bottleneck be worth?"
        subtitle="Patient-hours of waiting saved per year if a department closed part of its triage-adjusted gap. Uncertainty carries through from the 95% CI." />
      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Card title="Scenario">
          <div className="space-y-5">
            {q && <Select label="Department" value={dept} onChange={setDept} className="w-full" options={q.departments.map((d: any) => ({ value: d.department_id, label: `${d.department_name} (${d.excess_wait > 0 ? "+" : ""}${d.excess_wait.toFixed(1)} min)` }))} />}
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Benchmark</div>
              <Segmented value={target} onChange={setTarget} options={[{ value: "hospital", label: "Hospital average" }, { value: "best", label: "Best department" }]} />
            </div>
            <Slider label="Share of the gap closed" value={pct} onChange={setPct} min={0} max={100} unit="%" />
            <Slider label="Low-triage patients re-triaged to Medium (operational fast-track)" value={shift} onChange={setShift} min={0} max={30} unit="%" />
          </div>
        </Card>
        <Card tone="brand">
          {res && (
            <div className="flex h-full flex-col justify-center">
              <div className="text-sm font-semibold text-brand">Patient-hours of waiting saved per year</div>
              <motion.div key={res.patient_hours_saved} initial={{ scale: 0.92, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} className="my-2 text-7xl font-extrabold tracking-tight tnum">
                {res.patient_hours_saved.toFixed(0)}
              </motion.div>
              <div className="text-sm text-muted">range {res.range[0].toFixed(0)}–{res.range[1].toFixed(0)} h (from the 95% CI) · {res.minutes_saved_per_visit.toFixed(1)} min less per visit · {res.visits_per_year} visits/yr</div>
              <p className="mt-4 max-w-xl text-[15px]">{res.explanation}</p>
            </div>
          )}
        </Card>
      </div>
      <Card className="mt-5" title="Where the hours are" subtitle="Full-gap potential by department (triage-adjusted)">
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={pot} margin={{ left: -10 }}>
              <CartesianGrid {...grid} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} unit="h" />
              <Tooltip content={<ChartTooltip unit=" h" />} cursor={{ fill: "rgb(var(--surface2))" }} />
              <Bar dataKey="hours" name="Patient-hours" radius={[6, 6, 0, 0]}>
                {pot.map((p: any) => <Cell key={p.id} fill={p.id === dept ? C.brand : C.neutral} cursor="pointer" onClick={() => setDept(p.id)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="mt-4"><DataNote>Assumes the excess is operational (not case mix, which is already adjusted for). Synthetic data: shows the method, not a real-world guarantee.</DataNote></div>
    </div>
  );
}

function Slider({ label, value, onChange, min, max, unit }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; unit: string }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex justify-between text-[11px] font-semibold uppercase tracking-wide text-muted"><span>{label}</span><span className="text-ink tnum">{value}{unit}</span></div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[rgb(var(--brand))]" />
    </label>
  );
}
