import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, C, ChartTooltip, grid } from "@/components/charts";
import {
  Button, Card, Chip, cx, DataNote, Drawer, EmptyState, Kpi, Loading, PageHeader, Segmented, Select, SimulatedChip, StatusChip, useToast,
} from "@/components/ui";
import { post, useAction, useApi } from "@/lib/api";
import { addDays, day, dayTime } from "@/lib/format";

const SHIFTS = ["Morning", "Evening", "Night"];
const tone: Record<string, string> = {
  gap: "bg-bad text-white", tight: "bg-warn/80 text-white", ok: "bg-brand/25 text-ink", over: "bg-neutral/20 text-muted",
};

export default function Roster() {
  const [tab, setTab] = useState<"coverage" | "leave" | "appts">("coverage");
  return (
    <div>
      <PageHeader eyebrow="Roster & appointments" title={<span className="flex items-center gap-3">Doctors where the demand is <SimulatedChip /></span>}
        subtitle="Rostered doctor-minutes vs expected demand (bookings + real walk-in rates × real consult durations). Leave triggers automatic reschedule proposals."
        actions={<Segmented value={tab} onChange={setTab} options={[{ value: "coverage", label: "Coverage" }, { value: "leave", label: "Leave approvals" }, { value: "appts", label: "Appointment analytics" }]} />} />
      {tab === "coverage" && <Coverage />}
      {tab === "leave" && <LeaveApprovals />}
      {tab === "appts" && <ApptAnalytics />}
    </div>
  );
}

function Coverage() {
  const [week, setWeek] = useState("2026-01-05");
  const [dept, setDept] = useState("");
  const { data: meta } = useApi<any>("/meta");
  const { data } = useApi<any>(`/roster/coverage?week=${week}${dept ? `&department_id=${dept}` : ""}`);
  const { data: opt } = useApi<any>(`/roster/optimize?week=${week}${dept ? `&department_id=${dept}` : ""}`);
  const [cell, setCell] = useState<any>(null);
  const toast = useToast();
  const apply = useAction((s: any) => post("/roster", { doctor_id: s.doctor_id, day: s.date, shift: s.shift }),
    () => toast({ title: "Roster updated", body: "Slots created and the doctor notified.", tone: "good" }));
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const depts = data ? Array.from(new Set(data.cells.map((c: any) => c.department_name))) as string[] : [];
  const counts = data ? data.cells.reduce((a: any, c: any) => ({ ...a, [c.status]: (a[c.status] || 0) + 1 }), {}) : {};
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
          <Button size="sm" variant="ghost" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="px-2 text-sm font-semibold">Week of {day(week)}</span>
          <Button size="sm" variant="ghost" onClick={() => setWeek(addDays(week, 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        {meta && <Select value={dept} onChange={setDept} options={[{ value: "", label: "All departments" }, ...meta.departments.filter((d: any) => !["D08", "D12"].includes(d.department_id)).map((d: any) => ({ value: d.department_id, label: d.department_name }))]} />}
        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          {[["gap", "No doctor"], ["tight", "> 90% load"], ["ok", "OK"], ["over", "< 25% (over-covered)"]].map(([k, l]) => (
            <span key={k} className="flex items-center gap-1.5"><span className={cx("h-3 w-5 rounded", tone[k])} />{l} <b>{counts[k] || 0}</b></span>
          ))}
        </div>
      </div>
      <div className="grid gap-5 2xl:grid-cols-[1fr_340px]">
        <Card pad={false} className="min-w-0">
          {!data ? <div className="p-5"><Loading /></div> : (
            <div className="overflow-x-auto p-4">
              <div className="grid min-w-[860px] gap-1" style={{ gridTemplateColumns: `140px repeat(7, 1fr)` }}>
                <div />
                {days.map((d) => <div key={d} className="pb-1 text-center text-xs font-semibold">{day(d, { weekday: "short", day: "numeric" })}</div>)}
                {depts.map((dn) => (
                  <div key={dn} className="contents">
                    <div className="flex items-center pr-2 text-sm font-medium">{dn}</div>
                    {days.map((d) => (
                      <div key={d} className="grid grid-cols-3 gap-0.5">
                        {SHIFTS.map((sh) => {
                          const c = data.cells.find((x: any) => x.department_name === dn && x.date === d && x.shift === sh);
                          return (
                            <button key={sh} onClick={() => setCell(c)} title={`${sh}: ${c?.doctors.length} doctor(s), ${c?.utilization === null ? "no capacity" : Math.round(c.utilization * 100) + "% load"}`}
                              className={cx("focus-ring h-9 rounded-md text-[10px] font-bold transition hover:scale-105", tone[c?.status || "ok"])}>
                              {sh[0]}{c?.doctors.length}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[11px] text-muted">Each day shows Morning · Evening · Night; the number is doctors on shift. {data.method}.</div>
            </div>
          )}
        </Card>
        <Card title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /> Roster optimizer</span>} subtitle={opt?.note}>
          {!opt ? <Loading rows={2} /> : !opt.suggestions.length ? <EmptyState title="No gaps this week" body="Every shift has a doctor and load is under 90%." /> : (
            <div className="space-y-2.5">
              {opt.suggestions.map((s: any, i: number) => (
                <div key={i} className="rounded-xl border border-line p-3">
                  <div className="text-sm font-semibold">{s.action}</div>
                  <div className="text-xs text-muted">{s.department_name} · {s.weekday} {day(s.date, { day: "numeric", month: "short" })} · {s.shift}</div>
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <Chip tone={s.before === null ? "bad" : "warn"}>{s.before === null ? "gap" : `${Math.round(s.before * 100)}%`}</Chip>→<Chip tone="good">{Math.round(s.after * 100)}% load</Chip>
                  </div>
                  <div className="mt-1.5 text-xs text-muted">{s.why}</div>
                  <Button size="sm" className="mt-2" loading={apply.isPending} onClick={() => apply.mutate(s)}>Apply</Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <Drawer open={!!cell} onClose={() => setCell(null)} width={440} title={cell ? `${cell.department_name} · ${cell.shift}` : ""} subtitle={cell && day(cell.date)}>
        {cell && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Kpi label="Doctors on shift" value={cell.doctors.length} tone={cell.doctors.length ? "default" : "bad"} />
              <Kpi label="Expected load" value={cell.utilization === null ? "—" : Math.round(cell.utilization * 100)} unit="%" tone={cell.status === "tight" ? "warn" : "default"} />
            </div>
            <div><b>On shift:</b> {cell.doctors.join(", ") || "nobody"}</div>
            {cell.on_leave.length > 0 && <div><b>On leave:</b> {cell.on_leave.join(", ")}</div>}
            <div><b>Booked appointments:</b> {cell.booked}</div>
            <div className="text-xs text-muted">Demand {cell.demand_min} min vs capacity {cell.capacity_min} min.</div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function LeaveApprovals() {
  const { data } = useApi<any[]>("/leave-requests");
  const [sel, setSel] = useState<number | null>(null);
  const { data: prev } = useApi<any>(sel ? `/leave-requests/${sel}/preview` : null);
  const toast = useToast();
  const apply = useAction((accept: any) => post(`/leave-requests/${sel}/apply`, { accept }), (r: any) => {
    toast({ title: "Leave approved", body: `${r.moved} patients moved and notified.`, tone: "good" });
    setSel(null);
  });
  const reject = useAction(() => post(`/leave-requests/${sel}/decision`, { decision: "reject" }), () => { toast({ title: "Leave rejected", tone: "info" }); setSel(null); });
  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <Card title="Requests" subtitle="Doctors request leave from their workspace">
        {!data ? <Loading /> : (
          <div className="space-y-2">
            {data.map((l) => (
              <button key={l.id} onClick={() => l.status === "pending" && setSel(l.id)}
                className={cx("focus-ring w-full rounded-xl border p-3 text-left", sel === l.id ? "border-brand bg-brand/5" : "border-line hover:bg-surface2")}>
                <div className="flex items-center justify-between"><span className="font-semibold">{l.doctor_name}</span><StatusChip status={l.status} /></div>
                <div className="text-xs text-muted">{l.department_name} · {day(l.from_date)} → {day(l.to_date)} · {l.reason}</div>
                {l.status === "pending" && <div className="mt-1 text-xs font-semibold text-warn">{l.affected_appointments} appointments affected</div>}
              </button>
            ))}
          </div>
        )}
      </Card>
      <Card title="Reschedule proposals" subtitle="Best alternative per patient: colleague on the same day (language match first), else same doctor after leave">
        {!sel ? <EmptyState title="Select a pending request" body="You'll see every affected patient and a proposed new slot before approving." /> : !prev ? <Loading /> : (
          <div>
            <div className="mb-3 overflow-hidden rounded-xl border border-line">
              {prev.proposals.map((p: any) => (
                <div key={p.appointment.id} className="grid grid-cols-[1fr_24px_1.3fr] items-center gap-3 border-b border-line px-4 py-3 text-sm last:border-0">
                  <div><div className="font-semibold">{p.appointment.patient_id}</div><div className="text-xs text-muted">{dayTime(p.appointment.slot_start)} · {p.appointment.visit_type}</div></div>
                  <span className="text-muted">→</span>
                  {p.proposal ? (
                    <div><div className="font-semibold">{p.proposal.doctor_name}</div><div className="text-xs text-muted">{dayTime(p.proposal.start)} · {p.proposal.reason}</div></div>
                  ) : <Chip tone="bad">No slot: patient asked to rebook</Chip>}
                </div>
              ))}
              {!prev.proposals.length && <div className="p-4 text-sm text-muted">No booked appointments are affected.</div>}
            </div>
            <div className="flex gap-2">
              <Button loading={apply.isPending} onClick={() => apply.mutate(Object.fromEntries(prev.proposals.filter((p: any) => p.proposal).map((p: any) => [p.appointment.id, p.proposal.slot_id])))}>
                Approve & move {prev.proposals.filter((p: any) => p.proposal).length} patients
              </Button>
              <Button variant="secondary" onClick={() => reject.mutate(undefined)}>Reject</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function ApptAnalytics() {
  const { data } = useApi<any>("/appointments-analytics");
  if (!data) return <Loading rows={3} />;
  const mix = Object.entries(data.visit_mix_real).map(([k, v]) => ({ k, v }));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="App bookings (this session)" value={data.app_bookings} tone="brand" />
        <Kpi label="Booking lead time (median)" value={data.lead_days.median} unit="days" sub="simulated" />
        <Kpi label="Cancellation rate" value={data.simulated_rates.cancel_rate} unit="%" sub="simulated assumption" />
        <Kpi label="No-show rate" value={data.simulated_rates.no_show_rate} unit="%" sub="simulated assumption" />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Slot fill rate by day" subtitle={<span className="flex items-center gap-2">Demo window (seeded) <SimulatedChip what="seeded" /></span>}>
          <div className="h-60"><ResponsiveContainer>
            <BarChart data={data.fill_rate} margin={{ left: -20 }}>
              <CartesianGrid {...grid} /><XAxis dataKey="date" {...axis} tickFormatter={(d) => d.slice(5)} /><YAxis {...axis} unit="%" />
              <Tooltip content={<ChartTooltip unit="%" />} /><Bar dataKey="fill" name="Fill" fill={C.brand} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer></div>
        </Card>
        <Card title="Visit-type mix" subtitle="Real 2025 encounters: half of all visits are unscheduled, so 30% of slots are kept for walk-ins">
          <div className="space-y-3 pt-2">
            {mix.map(({ k, v }: any) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-sm"><span>{k}</span><b className="tnum">{v} · {(100 * v / 8000).toFixed(0)}%</b></div>
                <div className="h-2.5 rounded-full bg-surface2"><div className="h-full rounded-full bg-accent" style={{ width: `${(100 * v) / 8000 * 2.2}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <DataNote>Lead times, cancellation and no-show rates are simulated assumptions (no such fields in the dataset); no model is trained on them. Visit mix and wait times are real.</DataNote>
    </div>
  );
}
