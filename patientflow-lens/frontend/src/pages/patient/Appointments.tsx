import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Chip, EmptyState, Input, Loading, Modal, PageHeader, StatusChip, useToast } from "@/components/ui";
import { post, useAction, useApi } from "@/lib/api";
import { day, dayTime } from "@/lib/format";
import { langClass, useT } from "@/lib/i18n";
import { useApp } from "@/lib/state";
import SlotPicker from "./SlotPicker";

const STEPS = ["booked", "confirmed", "checked_in", "in_consultation", "completed"];

export default function Appointments() {
  const app = useApp();
  const t = useT();
  const nav = useNavigate();
  const toast = useToast();
  const { data } = useApi<any>(`/patients/${app.patientId}/appointments`);
  const { data: wl } = useApi<any[]>(`/waitlist?patient_id=${app.patientId}`);
  const [res, setRes] = useState<any>(null);
  const [cancelA, setCancelA] = useState<any>(null);
  const [slot, setSlot] = useState<any>(null);
  const [reason, setReason] = useState("Can't make it");
  const resched = useAction(() => post(`/appointments/${res.id}/reschedule`, { slot_id: slot.slot_id }), () => { toast({ title: "Rescheduled", tone: "good" }); setRes(null); setSlot(null); });
  const cancel = useAction(() => post(`/appointments/${cancelA.id}/cancel`, { reason }), (r: any) => {
    toast({ title: "Cancelled", body: r.waitlist_offer ? "Your slot was offered to a patient on the waitlist." : undefined, tone: "info" }); setCancelA(null);
  });
  return (
    <div className={`mx-auto max-w-4xl ${langClass(app.lang)}`}>
      <PageHeader eyebrow={t("my_appts")} title={t("my_appts")} actions={<Button onClick={() => nav("/patient/book")}>{t("book")}</Button>} />
      {!data ? <Loading rows={3} /> : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("upcoming")}</h2>
            {!data.upcoming.length ? <EmptyState title="Nothing booked" action={<Button onClick={() => nav("/patient/book")}>{t("book")}</Button>} /> : (
              <div className="space-y-3">{data.upcoming.map((a: any) => (
                <Card key={a.id}>
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand/10 text-center text-brand">
                      <div><div className="text-[11px] font-bold uppercase">{day(a.slot_start, { month: "short" })}</div><div className="text-2xl font-extrabold leading-none">{a.slot_start.slice(8, 10)}</div></div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-bold">{dayTime(a.slot_start)}</div>
                      <div className="text-sm text-muted">{a.doctor_name} · {a.department_name} · {a.reason}</div>
                      <div className="mt-2 flex items-center gap-1">
                        {STEPS.map((s, i) => <div key={s} title={s} className={`h-1.5 flex-1 rounded-full ${STEPS.indexOf(a.status) >= i ? "bg-brand" : "bg-surface2"}`} />)}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2"><StatusChip status={a.status} /><span className="text-xs text-muted">{t("expected_wait")} {a.predicted_p10}–{a.predicted_p90} {t("minutes")}</span></div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {["checked_in", "in_consultation"].includes(a.status) && <Button onClick={() => nav(`/patient/ticket/${a.id}`)}>Live ticket</Button>}
                      {["booked", "confirmed"].includes(a.status) && <><Button variant="secondary" onClick={() => setRes(a)}>{t("reschedule")}</Button><Button variant="ghost" onClick={() => setCancelA(a)}>{t("cancel")}</Button></>}
                    </div>
                  </div>
                </Card>
              ))}</div>
            )}
          </section>
          {wl && wl.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Waitlist</h2>
              <div className="space-y-2">{wl.map((w) => (
                <div key={w.id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-3 text-sm">
                  <span>{w.department_id} · {w.earliest} → {w.latest}</span><Chip tone={w.status === "offered" ? "warn" : w.status === "accepted" ? "good" : "neutral"}>{w.status}</Chip>
                </div>
              ))}</div>
            </section>
          )}
          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("past")}</h2>
            <Card pad={false}>{data.past.slice(0, 15).map((a: any) => (
              <div key={a.id} className="grid grid-cols-[150px_1fr_auto] items-center gap-3 border-b border-line px-5 py-2.5 text-sm last:border-0">
                <span className="font-semibold">{dayTime(a.slot_start)}</span><span className="truncate text-muted">{a.department_name} · {a.doctor_name}</span><StatusChip status={a.status} />
              </div>
            ))}</Card>
          </section>
        </div>
      )}
      <Modal open={!!res} onClose={() => { setRes(null); setSlot(null); }} title={`${t("reschedule")} · ${res?.doctor_name || ""}`} width={760}>
        {res && <>
          <SlotPicker departmentId={res.department_id} patientId={app.patientId} doctorId={res.doctor_id} value={slot} onChange={setSlot} />
          <div className="mt-4 flex justify-end"><Button disabled={!slot} loading={resched.isPending} onClick={() => resched.mutate(undefined)}>Move to {slot ? dayTime(slot.start) : "…"}</Button></div>
        </>}
      </Modal>
      <Modal open={!!cancelA} onClose={() => setCancelA(null)} title={t("cancel")}>
        <p className="mb-3 text-sm text-muted">Your slot will be offered to the next patient on the waitlist.</p>
        <Input className="w-full" label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setCancelA(null)}>Keep</Button><Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate(undefined)}>{t("cancel")}</Button></div>
      </Modal>
    </div>
  );
}
