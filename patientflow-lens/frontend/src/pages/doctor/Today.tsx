import { CheckCircle2, Clock3, PhoneCall, UserX } from "lucide-react";
import { useMemo } from "react";
import { Avatar, Button, Card, Chip, cx, DataNote, EmptyState, Kpi, Loading, PageHeader, SimulatedChip, StatusChip, TriageChip, useToast } from "@/components/ui";
import { post, useAction, useApi } from "@/lib/api";
import { time } from "@/lib/format";
import { useApp } from "@/lib/state";
import NextPatientBrief from "./NextPatientBrief";

export default function Today() {
  const { doctorId } = useApp();
  const { data } = useApi<any>(`/doctors/${doctorId}/day`, { refetchInterval: 8000 });
  const toast = useToast();
  const act = useAction(({ id, action }: { id: number; action: string }) => post(`/appointments/${id}/status`, { action }), (r: any) =>
    toast({ title: r.appointment.status === "in_consultation" ? "Patient called in" : r.appointment.status === "completed" ? "Visit completed" : "Updated",
      body: r.patients_notified ? `Running ${r.running_late.toFixed(0)} min late: ${r.patients_notified} waiting patients notified automatically` : undefined, tone: "good" }));
  const appts = data?.appointments || [];
  const current = appts.find((a: any) => a.status === "in_consultation");
  const queue = appts.filter((a: any) => ["checked_in", "confirmed", "booked"].includes(a.status));
  const next = useMemo(() => queue.find((a: any) => a.status === "checked_in") || queue[0], [queue]);
  if (!data) return <Loading rows={4} />;
  const late = data.running_late >= data.late_threshold;
  return (
    <div>
      <PageHeader eyebrow="Doctor · today" title={<span className="flex items-center gap-3"><Avatar name={data.doctor.name} size={44} />{data.doctor.name}</span>}
        subtitle={`${data.doctor.department_name} · Room ${data.doctor.consult_room} · ${data.shifts.filter((s: any) => s.status === "scheduled").map((s: any) => s.shift).join(" & ") || "off duty today"} · ${data.doctor.languages.join(", ")}`}
        actions={<SimulatedChip what="simulated roster" />} />
      {late && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-5 py-3.5">
          <Clock3 className="h-5 w-5 text-warn" />
          <div className="text-sm"><b>You are running about {data.running_late.toFixed(0)} min behind.</b> Waiting patients see updated times automatically; projected starts below use the department's real median consult time.</div>
        </div>
      )}
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Patients today" value={appts.length} />
        <Kpi label="Completed" value={data.counts.completed || 0} tone="good" />
        <Kpi label="Waiting (checked in)" value={data.counts.checked_in || 0} tone="brand" />
        <Kpi label="Still to come" value={(data.counts.booked || 0) + (data.counts.confirmed || 0)} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <div className="space-y-5">
          <Card title="Now in consultation">
            {!current ? <div className="text-sm text-muted">No one is with you. Call in the next patient.</div> : (
              <div className="flex flex-wrap items-center gap-4">
                <Avatar name={current.patient_id.replace("P", "P ")} tone="warn" size={48} />
                <div className="flex-1">
                  <div className="text-lg font-bold">{current.patient_id} <span className="text-sm font-normal text-muted">· {current.patient.age}y {current.patient.sex}</span></div>
                  <div className="text-sm text-muted">{current.reason} · booked {time(current.slot_start)} · started {time(current.started_at)}</div>
                </div>
                <Button size="lg" loading={act.isPending} onClick={() => act.mutate({ id: current.id, action: "complete" })}><CheckCircle2 className="h-5 w-5" /> Complete visit</Button>
              </div>
            )}
          </Card>
          <Card title="Queue" subtitle="Ordered by booking; projected start accounts for the current delay">
            {!appts.length ? <EmptyState title="No appointments today" /> : (
              <div className="divide-y divide-line">
                {appts.map((a: any) => (
                  <div key={a.id} className={cx("grid grid-cols-[56px_1fr_auto] items-center gap-3 py-2.5", a.status === "completed" && "opacity-55")}>
                    <div className="text-sm font-bold tnum">{time(a.slot_start)}{a.eta && a.eta.slice(11, 16) !== a.slot_start.slice(11, 16) && <div className="text-[11px] font-semibold text-warn">→ {time(a.eta)}</div>}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm"><b>{a.patient_id}</b><span className="text-muted">{a.patient.age}y · {a.reason}</span>{a.visit_type === "Follow-up" && <Chip tone="accent">Follow-up</Chip>}</div>
                      <div className="mt-0.5"><StatusChip status={a.status} /></div>
                    </div>
                    <div className="flex gap-1.5">
                      {["checked_in", "confirmed", "booked"].includes(a.status) && <Button size="sm" variant={a.id === next?.id ? "primary" : "secondary"} onClick={() => act.mutate({ id: a.id, action: "call_in" })}><PhoneCall className="h-3.5 w-3.5" /> Call in</Button>}
                      {["checked_in", "confirmed", "booked"].includes(a.status) && <Button size="sm" variant="ghost" title="Mark no-show" onClick={() => act.mutate({ id: a.id, action: "no_show" })}><UserX className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <Card title="Next-patient brief" subtitle={next ? `${next.patient_id} · ${time(next.slot_start)}` : undefined} className="h-fit">
          {next ? <NextPatientBrief patientId={next.patient_id} appt={next} /> : <div className="text-sm text-muted">No one waiting.</div>}
        </Card>
      </div>
      <div className="mt-4"><DataNote>Demo clock: Mon 5 Jan 2026. Use "+15 min" in the top bar to move time forward. Patient histories are real dataset visits; the roster is simulated.</DataNote></div>
    </div>
  );
}
