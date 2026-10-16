import { useState } from "react";
import { Button, Card, DataNote, Input, Loading, PageHeader, StatusChip, useToast } from "@/components/ui";
import { post, useAction, useApi } from "@/lib/api";
import { day } from "@/lib/format";
import { useApp } from "@/lib/state";

export default function Leave() {
  const { doctorId } = useApp();
  const { data } = useApi<any[]>(`/leave-requests?doctor_id=${doctorId}`);
  const { data: tt } = useApi<any>(`/doctors/${doctorId}/timetable?week=2026-01-05`);
  const [from, setFrom] = useState("2026-01-08");
  const [to, setTo] = useState("2026-01-09");
  const [reason, setReason] = useState("Conference");
  const toast = useToast();
  const req = useAction(() => post("/leave-requests", { doctor_id: doctorId, from_date: from, to_date: to, reason }),
    (r: any) => toast({ title: "Leave requested", body: `${r.affected_appointments} appointments will need moving; operations will review.`, tone: "good" }));
  const affected = (tt?.days || []).filter((d: any) => d.date >= from && d.date <= to).flatMap((d: any) => d.sessions.flatMap((s: any) => s.slots.filter((x: any) => x.appointment && ["booked", "confirmed"].includes(x.appointment.status))));
  return (
    <div>
      <PageHeader eyebrow="Leave & availability" title="Request leave and see the impact first" subtitle="Approval moves your patients to colleagues automatically (language match first) and notifies them." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="New request">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="mt-4 rounded-xl bg-surface2 p-3 text-sm">{tt ? <><b>{affected.length} booked appointments</b> fall in this period{affected.length ? ` (${affected.slice(0, 4).map((x: any) => x.appointment.patient_id).join(", ")}${affected.length > 4 ? "…" : ""})` : ""}.</> : "…"}</div>
          <Button className="mt-4" loading={req.isPending} onClick={() => req.mutate(undefined)}>Submit request</Button>
        </Card>
        <Card title="My requests">
          {!data ? <Loading /> : !data.length ? <div className="text-sm text-muted">No requests yet.</div> : (
            <div className="space-y-2">{data.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-xl border border-line p-3 text-sm">
                <div><b>{day(l.from_date)} → {day(l.to_date)}</b><div className="text-xs text-muted">{l.reason}{l.affected_appointments !== null ? ` · ${l.affected_appointments} affected` : ""}</div></div>
                <StatusChip status={l.status} />
              </div>
            ))}</div>
          )}
        </Card>
      </div>
      <div className="mt-4"><DataNote>Simulated roster. Approvals happen in Operations → Roster & appointments → Leave approvals.</DataNote></div>
    </div>
  );
}
