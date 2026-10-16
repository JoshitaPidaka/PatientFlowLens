import { Clock3, DoorOpen } from "lucide-react";
import { useState } from "react";
import { Avatar, Button, Card, Chip, cx, DataNote, Drawer, EmptyState, Kpi, Loading, PageHeader, SimulatedChip, StatusChip, TriageChip, useToast } from "@/components/ui";
import { post, useAction, useApi } from "@/lib/api";
import { time } from "@/lib/format";
import { useApp } from "@/lib/state";

const dot: Record<string, string> = {
  completed: "bg-good", in_consultation: "bg-warn animate-pulse", checked_in: "bg-accent", confirmed: "bg-brand/60", booked: "bg-neutral/60",
  no_show: "bg-bad", cancelled: "bg-line",
};

export default function Sessions() {
  const { departmentId } = useApp();
  const { data: meta } = useApi<any>("/meta");
  const { data } = useApi<any>(`/departments/${departmentId}/sessions`, { refetchInterval: 10000 });
  const [sel, setSel] = useState<any>(null);
  const name = meta?.departments.find((d: any) => d.department_id === departmentId)?.department_name;
  const all = (data?.sessions || []).flatMap((s: any) => s.appointments);
  const late = (data?.sessions || []).filter((s: any) => s.running_late >= 15);
  return (
    <div>
      <PageHeader eyebrow={`${name || ""} · coordinator`} title={<span className="flex items-center gap-3">Today's sessions <SimulatedChip what="simulated roster" /></span>}
        subtitle="Every doctor on duty today, their queue and whether they are running late. Click a patient to move or update them." />
      {!data ? <Loading rows={3} /> : !data.sessions.length ? <EmptyState title="No sessions today" body="Pick another department in the top bar." /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Doctors on duty" value={data.sessions.length} />
            <Kpi label="Patients today" value={all.length} sub={`${all.filter((a: any) => a.status === "completed").length} completed`} />
            <Kpi label="Waiting now (checked in)" value={all.filter((a: any) => a.status === "checked_in").length} tone="brand" />
            <Kpi label="Doctors running late" value={late.length} tone={late.length ? "warn" : "good"} sub={late.map((s: any) => s.doctor.name).join(", ") || "all on time"} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {data.sessions.map((s: any) => (
              <Card key={s.doctor.doctor_id}>
                <div className="mb-3 flex items-center gap-3">
                  <Avatar name={s.doctor.name} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{s.doctor.name}</div>
                    <div className="text-xs text-muted">Room {s.doctor.consult_room} · {s.shifts.filter((x: any) => x.status === "scheduled").map((x: any) => x.shift).join(", ") || "off"} · {s.doctor.languages.join(", ")}</div>
                  </div>
                  {s.running_late >= 15 ? <Chip tone="warn"><Clock3 className="h-3 w-3" /> {s.running_late.toFixed(0)} min late</Chip> : <Chip tone="good">On time</Chip>}
                </div>
                <div className="space-y-1.5">
                  {s.appointments.map((a: any) => (
                    <button key={a.id} onClick={() => setSel(a)} className="focus-ring grid w-full grid-cols-[52px_10px_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface2">
                      <span className="text-xs font-semibold text-muted tnum">{time(a.slot_start)}</span>
                      <span className={cx("h-2.5 w-2.5 rounded-full", dot[a.status])} />
                      <span className="truncate"><b>{a.patient_id}</b> <span className="text-muted">· {a.patient.age}y · {a.reason}</span></span>
                      <StatusChip status={a.status} />
                    </button>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
      <PatientActions a={sel} onClose={() => setSel(null)} departmentId={departmentId} />
    </div>
  );
}

function PatientActions({ a, onClose, departmentId }: { a: any; onClose: () => void; departmentId: string }) {
  const toast = useToast();
  const today = a?.slot_start?.slice(0, 10);
  const { data: alt } = useApi<any>(a && ["booked", "confirmed"].includes(a.status) ? `/booking/slots?department_id=${departmentId}&day=${today}&patient_id=${a.patient_id}` : null);
  const st = useAction((action: string) => post(`/appointments/${a.id}/status`, { action }), (r: any) => {
    toast({ title: "Updated", body: r.patients_notified ? `${r.patients_notified} patients notified of the delay` : undefined, tone: "good" }); onClose();
  });
  const move = useAction((slot_id: number) => post(`/appointments/${a.id}/reschedule`, { slot_id }), () => { toast({ title: "Patient moved", body: "Patient and both doctors notified.", tone: "good" }); onClose(); });
  return (
    <Drawer open={!!a} onClose={onClose} width={460} title={a ? `${a.patient_id} · ${time(a.slot_start)}` : ""} subtitle={a && `${a.doctor_name} · ${a.reason}`}>
      {a && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2"><StatusChip status={a.status} /><Chip>{a.visit_type}</Chip><Chip>{a.patient.age}y {a.patient.sex}</Chip><Chip>{a.patient.chronic_condition}</Chip></div>
          {a.eta && <div className="rounded-xl bg-surface2 p-3 text-sm">Projected start <b>{time(a.eta)}</b> (booked {time(a.slot_start)})</div>}
          <div className="flex flex-wrap gap-2">
            {["checked_in", "booked", "confirmed"].includes(a.status) && <Button onClick={() => st.mutate("call_in")}>Call in</Button>}
            {a.status === "in_consultation" && <Button onClick={() => st.mutate("complete")}>Complete</Button>}
            {["booked", "confirmed"].includes(a.status) && <Button variant="secondary" onClick={() => st.mutate("check_in")}>Check in at desk</Button>}
            {["booked", "confirmed", "checked_in"].includes(a.status) && <Button variant="secondary" onClick={() => st.mutate("no_show")}><DoorOpen className="h-4 w-4" /> No-show</Button>}
          </div>
          {alt && (
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Move to a colleague today</div>
              <div className="space-y-1.5">
                {alt.slots.filter((s: any) => s.doctor_id !== a.doctor_id).slice(0, 6).map((s: any) => (
                  <button key={s.slot_id} onClick={() => move.mutate(s.slot_id)} className="focus-ring flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface2">
                    <span>{time(s.start)} · {s.doctor_name}</span><span className="text-xs text-muted">{s.reasons.join(" · ")}</span>
                  </button>
                ))}
                {!alt.slots.filter((s: any) => s.doctor_id !== a.doctor_id).length && <div className="text-sm text-muted">No free colleague slots later today.</div>}
              </div>
            </div>
          )}
          <DataNote>Doctor assignment and today's queue are simulated; actions update the patient's ticket and notifications live.</DataNote>
        </div>
      )}
    </Drawer>
  );
}
