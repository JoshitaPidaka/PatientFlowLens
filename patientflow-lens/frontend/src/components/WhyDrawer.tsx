import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNavigate } from "react-router-dom";
import { useApi } from "@/lib/api";
import { fmtMin, signed } from "@/lib/format";
import { useApp } from "@/lib/state";
import { axis, C, ChartTooltip, grid } from "./charts";
import { Button, Chip, ConfidenceBadge, DataNote, Drawer, Loading } from "./ui";

/** Explanation panel for a department: which data signals put it in the investigate-first queue. */
export default function WhyDrawer({ departmentId, onClose, onAction }: { departmentId: string | null; onClose: () => void; onAction?: () => void }) {
  const { data } = useApi<any>("/investigate/queue");
  const app = useApp();
  const nav = useNavigate();
  const d = data?.departments.find((x: any) => x.department_id === departmentId);
  return (
    <Drawer open={!!departmentId} onClose={onClose} width={620}
      title={d ? <span className="flex items-center gap-2">Why {d.department_name}? <ConfidenceBadge level={d.confidence} /></span> : "Loading"}
      subtitle="Signals behind this ranking. Triage-adjusted, real 2025 data.">
      {!d ? <Loading rows={2} /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Sig label="Excess wait" v={`${signed(d.excess_wait)} min`} sub={`95% CI ±${d.ci95.toFixed(1)}`} bad={d.excess_wait > 0} />
            <Sig label="Extra patient-hours / yr" v={d.impact_hours.toFixed(0)} sub={`${d.encounters} visits`} bad={d.impact_hours > 0} />
            <Sig label="Slower at" v={`${d.slower_levels} / 4`} sub="triage levels" bad={d.slower_levels >= 3} />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold">
              {d.slower_levels >= 3 ? "Slower than the hospital at almost every triage level, so case mix does not explain it." : "Mixed picture across triage levels."}
            </div>
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={d.per_triage} margin={{ left: -18, right: 8, top: 8 }}>
                  <CartesianGrid {...grid} />
                  <XAxis dataKey="triage" {...axis} />
                  <YAxis {...axis} unit="m" />
                  <Tooltip content={<ChartTooltip unit=" min" />} cursor={{ fill: "rgb(var(--surface2))" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="wait" name={d.department_name} fill={d.excess_wait > 0 ? C.bad : C.good} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="hospital" name="Hospital" fill={C.neutral} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-line">
            <div className="grid grid-cols-4 border-b border-line bg-surface2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <span>Triage</span><span className="text-right">This dept</span><span className="text-right">Hospital</span><span className="text-right">Gap</span>
            </div>
            {d.per_triage.map((t: any) => (
              <div key={t.triage} className="grid grid-cols-4 px-3 py-2 text-sm tnum">
                <span>{t.triage}</span><span className="text-right">{fmtMin(t.wait)}</span><span className="text-right text-muted">{fmtMin(t.hospital)}</span>
                <span className={`text-right font-semibold ${t.excess > 0 ? "text-bad" : "text-good"}`}>{signed(t.excess)}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-surface2 p-3"><div className="text-xs text-muted">90th-percentile wait</div><div className="font-bold">{fmtMin(d.p90_wait)}</div></div>
            <div className="rounded-xl bg-surface2 p-3"><div className="text-xs text-muted">Left before care</div><div className="font-bold">{d.lbc_rate.toFixed(1)}%</div></div>
          </div>
          <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-brand">Suggested check</div>
            <div className="text-sm">{d.suggested_check}</div>
          </div>
          <DataNote>
            <b>What we don't know:</b> the data has no staffing-by-hour, so we can't say <i>which</i> handoff is slow. Adults in Pediatrics (544 visits)
            are flagged in the Data Trust Centre. Confidence comes from the 95% interval of the excess wait.
          </DataNote>
          <div className="flex flex-wrap gap-2">
            {onAction && <Button onClick={onAction}>Create action</Button>}
            <Button variant="secondary" onClick={() => { app.setDepartmentId(d.department_id); app.setRole("department"); nav("/department/overview"); }}>Open department</Button>
            <Button variant="secondary" onClick={() => { app.setRole("command"); nav(`/command/whatif?dept=${d.department_id}`); }}>Run what-if</Button>
            <Chip tone="neutral">{d.encounters} real visits</Chip>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Sig({ label, v, sub, bad }: { label: string; v: string; sub: string; bad?: boolean }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className={`mt-1 text-xl font-bold tnum ${bad ? "text-bad" : "text-good"}`}>{v}</div>
      <div className="text-[11px] text-muted">{sub}</div>
    </div>
  );
}
