import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, C, ChartTooltip, grid } from "@/components/charts";
import { Card, DataNote, Kpi, Loading, PageHeader, SimulatedChip } from "@/components/ui";
import { useApi } from "@/lib/api";
import { signed } from "@/lib/format";
import { useApp } from "@/lib/state";

export default function Stats() {
  const { doctorId } = useApp();
  const { data } = useApi<any>(`/doctors/${doctorId}/stats`);
  if (!data) return <Loading rows={3} />;
  const mix = Object.entries(data.by_visit_type).map(([k, v]) => ({ k, v }));
  return (
    <div>
      <PageHeader eyebrow="My stats · 2025" title={data.doctor.name} subtitle={data.doctor.department_name} actions={<SimulatedChip what="simulated assignment" />} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Patients seen (2025)" value={data.patients_seen} />
        <Kpi label="Median consult" value={data.median_consult.toFixed(0)} unit="min" sub={`department ${data.dept_median_consult.toFixed(0)} min`} />
        <Kpi label="My patients' mean wait" value={data.my_patients_wait.toFixed(1)} unit="min" sub={`department ${data.dept_wait.toFixed(1)} min`} />
        <Kpi label="Triage-adjusted vs department" value={signed(data.triage_adjusted_vs_dept)} unit="min" tone={data.triage_adjusted_vs_dept > 0 ? "warn" : "good"} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Patients per month"><div className="h-60"><ResponsiveContainer>
          <BarChart data={data.per_month} margin={{ left: -20 }}><CartesianGrid {...grid} /><XAxis dataKey="month" {...axis} tickFormatter={(m) => m.slice(5)} /><YAxis {...axis} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} /><Bar dataKey="n" name="Patients" fill={C.brand} radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
        <Card title="Scheduled vs unscheduled"><div className="h-60"><ResponsiveContainer>
          <BarChart data={mix} margin={{ left: -20 }}><CartesianGrid {...grid} /><XAxis dataKey="k" {...axis} /><YAxis {...axis} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} /><Bar dataKey="v" name="Visits" fill={C.accent} radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
      </div>
      <div className="mt-4"><DataNote>{data.note}</DataNote></div>
    </div>
  );
}
