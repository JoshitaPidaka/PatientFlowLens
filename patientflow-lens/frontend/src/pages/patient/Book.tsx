import { motion } from "framer-motion";
import { Baby, Bone, Brain, CheckCircle2, FlaskConical, HeartPulse, Scan, Scissors, Siren, Stethoscope, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Avatar, Button, Card, Chip, cx, DataNote, Input, Loading, PageHeader, SimulatedChip, useToast } from "@/components/ui";
import { post, useAction, useApi } from "@/lib/api";
import { addDays, dayTime } from "@/lib/format";
import { langClass, useT } from "@/lib/i18n";
import { useApp } from "@/lib/state";
import SlotPicker from "./SlotPicker";

const ICON: Record<string, any> = { D01: Siren, D02: Stethoscope, D03: Baby, D04: HeartPulse, D05: Bone, D06: Scan, D07: FlaskConical, D09: Scissors, D10: Brain, D11: Users };
const HELP = [
  ["Child is unwell or needs a check-up", "D03"], ["Heart, chest or blood-pressure check", "D04"], ["Joint, bone or back pain", "D05"],
  ["Headache, dizziness or nerve problems", "D10"], ["General illness or check-up", "D02"], ["X-ray or scan appointment", "D06"], ["Blood or lab test", "D07"],
];

function ics(a: any) {
  const f = (s: string) => s.replace(/[-:]/g, "").slice(0, 15);
  const body = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${f(a.slot_start)}\nDTEND:${f(a.slot_end)}\nSUMMARY:${a.department_name} with ${a.doctor_name}\nDESCRIPTION:PatientFlow Lens demo booking\nEND:VEVENT\nEND:VCALENDAR`;
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(body);
}

export default function Book() {
  const app = useApp();
  const t = useT();
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const { data: meta } = useApi<any>("/meta");
  const [step, setStep] = useState(params.get("dept") ? 2 : 1);
  const [dept, setDept] = useState(params.get("dept") || "");
  const [doctor, setDoctor] = useState(params.get("doctor") || "");
  const [visit] = useState(params.get("visit") || "Scheduled");
  const [slot, setSlot] = useState<any>(null);
  const [done, setDone] = useState<any>(null);
  const [wlDate, setWlDate] = useState<string | null>(null);
  const { data: docs } = useApi<any[]>(dept ? `/doctors?department_id=${dept}` : null);
  const book = useAction(() => post("/appointments", { patient_id: app.patientId, slot_id: slot.slot_id, visit_type: visit, reason: params.get("reason") || undefined }),
    (r: any) => { setDone(r); setStep(4); });
  const waitlist = useAction((d: string) => post("/waitlist", { patient_id: app.patientId, department_id: dept, earliest: d, latest: addDays(d, 4), doctor_id: doctor || undefined }),
    (r: any) => { toast({ title: "You're on the waitlist", body: `Position ${r.position}. We'll offer you the first matching slot.`, tone: "good" }); setWlDate(null); });
  const deptName = meta?.departments.find((d: any) => d.department_id === dept)?.department_name;
  if (book.error) toast({ title: "Booking failed", body: book.error.message, tone: "bad" });
  return (
    <div className={`mx-auto max-w-4xl ${langClass(app.lang)}`}>
      <PageHeader eyebrow={t("book")} title={t("book")} actions={<SimulatedChip what="simulated slots" />} />
      <div className="mb-6 flex items-center gap-2">
        {[t("department"), t("choose_slot"), t("confirm")].map((l, i) => (
          <div key={i} className="flex flex-1 items-center gap-2">
            <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold", step > i + 1 ? "bg-good text-white" : step === i + 1 ? "bg-brand text-white" : "bg-surface2 text-muted")}>{step > i + 1 ? "✓" : i + 1}</span>
            <span className={cx("text-sm font-semibold", step === i + 1 ? "text-ink" : "text-muted")}>{l}</span>
            {i < 2 && <div className="h-px flex-1 bg-line" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-5">
          {!meta ? <Loading /> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {meta.departments.filter((d: any) => ICON[d.department_id]).map((d: any) => {
                const I = ICON[d.department_id];
                return (
                  <button key={d.department_id} onClick={() => { setDept(d.department_id); setDoctor(""); setStep(2); }}
                    className="focus-ring flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-4 text-sm font-semibold shadow-card transition hover:-translate-y-0.5 hover:border-brand/50">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><I className="h-6 w-6" /></span>{d.department_name}
                  </button>
                );
              })}
            </div>
          )}
          <Card title="Not sure? Help me choose" subtitle="This only points you to a department; it is not medical advice.">
            <div className="flex flex-wrap gap-2">{HELP.map(([l, d]) => (
              <button key={l} onClick={() => { setDept(d); setStep(2); }} className="focus-ring rounded-full border border-line px-3 py-1.5 text-sm hover:border-brand hover:text-brand">{l}</button>
            ))}</div>
          </Card>
        </div>
      )}

      {step === 2 && dept && (
        <div className="space-y-5">
          <Card title={`${deptName || ""} · ${t("doctor")}`} action={<Button size="sm" variant="ghost" onClick={() => setStep(1)}>Change department</Button>}>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button onClick={() => setDoctor("")} className={cx("focus-ring flex min-w-[130px] items-center gap-2 rounded-xl border p-2.5 text-sm font-semibold", !doctor ? "border-brand bg-brand/10 text-brand" : "border-line")}>
                <Users className="h-5 w-5" /> {t("any_doctor")}</button>
              {(docs || []).map((d) => (
                <button key={d.doctor_id} onClick={() => setDoctor(d.doctor_id)} className={cx("focus-ring flex min-w-[190px] items-center gap-2 rounded-xl border p-2.5 text-left text-sm", doctor === d.doctor_id ? "border-brand bg-brand/10" : "border-line")}>
                  <Avatar name={d.name} size={32} /><span><b className="block leading-tight">{d.name}</b><span className="text-[11px] text-muted">{d.languages.join(", ")}</span></span>
                </button>
              ))}
            </div>
          </Card>
          <Card title={t("choose_slot")}>
            <SlotPicker departmentId={dept} patientId={app.patientId} doctorId={doctor || undefined} visitType={visit} value={slot} onChange={setSlot}
              startDate={params.get("date") || "2026-01-05"} onEmpty={(d) => setWlDate(d)} />
            {wlDate && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-surface2 p-3 text-sm">Waitlist for {deptName} between {wlDate} and {addDays(wlDate, 4)}
                <Button size="sm" loading={waitlist.isPending} onClick={() => waitlist.mutate(wlDate)}>{t("join_waitlist")}</Button></div>
            )}
          </Card>
          <div className="flex justify-end"><Button size="lg" disabled={!slot} onClick={() => setStep(3)}>Continue</Button></div>
        </div>
      )}

      {step === 3 && slot && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-3"><Avatar name={slot.doctor_name} size={48} /><div><div className="text-lg font-bold">{slot.doctor_name}</div><div className="text-sm text-muted">{deptName} · Room {slot.room}</div></div></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-surface2 p-3"><div className="text-xs text-muted">When</div><div className="font-bold">{dayTime(slot.start)}</div></div>
              <div className="rounded-xl bg-surface2 p-3"><div className="text-xs text-muted">{t("expected_wait")}</div><div className="font-bold">{slot.wait_range[0]}–{slot.wait_range[1]} {t("minutes")}</div></div>
              <div className="rounded-xl bg-surface2 p-3"><div className="text-xs text-muted">Visit</div><div className="font-bold">{visit}</div></div>
            </div>
            {slot.reasons.length > 0 && <div className="flex flex-wrap gap-1.5">{slot.reasons.map((r: string) => <Chip key={r} tone="brand">{r}</Chip>)}</div>}
            <DataNote>The expected wait comes from our wait-time model. Your triage level is unknown until you arrive, so it is a range over this department's real mix of patients.</DataNote>
            <div className="flex justify-between"><Button variant="secondary" onClick={() => setStep(2)}>Back</Button><Button size="lg" loading={book.isPending} onClick={() => book.mutate(undefined)}>{t("confirm")}</Button></div>
          </div>
        </Card>
      )}

      {step === 4 && done && (
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Card tone="brand">
            <div className="flex flex-col items-center py-6 text-center">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.1 }}><CheckCircle2 className="h-16 w-16 text-good" /></motion.div>
              <div className="mt-3 text-2xl font-extrabold">Booked!</div>
              <div className="mt-1 text-muted">{done.doctor_name} · {done.department_name}</div>
              <div className="mt-1 text-xl font-bold">{dayTime(done.slot_start)}</div>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <a href={ics(done)} download="appointment.ics"><Button variant="secondary">Add to calendar</Button></a>
                <Button onClick={() => nav("/patient/appointments")}>{t("my_appts")}</Button>
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
