import { motion } from "framer-motion";
import { Bell, CalendarPlus, ClipboardList, MapPin, Search, Ticket } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { userKey } from "@/components/Shell";
import { Button, Card, Chip, Loading, useToast } from "@/components/ui";
import { post, useAction, useApi } from "@/lib/api";
import { day, dayTime, time } from "@/lib/format";
import { langClass, useT } from "@/lib/i18n";
import { useApp } from "@/lib/state";

export default function PatientHome() {
  const app = useApp();
  const t = useT();
  const nav = useNavigate();
  const toast = useToast();
  const { data } = useApi<any>(`/patients/${app.patientId}/appointments`, { refetchInterval: 8000 });
  const { data: notes } = useApi<any[]>(`/notifications?user_key=${encodeURIComponent(userKey("patient", app))}`, { refetchInterval: 8000 });
  const { data: wl } = useApi<any[]>(`/waitlist?patient_id=${app.patientId}`);
  const { data: prof } = useApi<any>(`/patients/${app.patientId}`);
  const pref = prof?.preferred_language;
  const accept = useAction((id: number) => post(`/waitlist/${id}/accept`), () => toast({ title: "Slot accepted", body: "It's in My appointments.", tone: "good" }));
  const checkIn = useAction((id: number) => post(`/appointments/${id}/check-in`), () => nav(`/patient/ticket/${next.id}`));
  const next = data?.upcoming?.[0];
  const offer = (wl || []).find((w) => w.status === "offered");
  const isToday = next && next.slot_start.slice(0, 10) === data?.now.slice(0, 10);
  return (
    <div className={`mx-auto max-w-3xl ${langClass(app.lang)}`}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="text-sm font-semibold text-brand">{t("hello")} 👋</div>
        <h1 className="text-3xl font-extrabold tracking-tight">{app.patientId}</h1>
      </motion.div>
      {pref && pref !== app.lang && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
          <span>This patient prefers <b>{pref === "Telugu" ? "తెలుగు (Telugu)" : pref === "Hindi" ? "हिन्दी (Hindi)" : "English"}</b>.</span>
          <Button size="sm" variant="soft" onClick={() => app.setLang(pref)}>Switch language</Button>
        </div>
      )}
      {offer && (
        <Card className="mb-4 border-warn/50 bg-warn/10">
          <div className="flex flex-wrap items-center gap-3">
            <Bell className="h-5 w-5 text-warn" />
            <div className="flex-1 text-sm"><b>A slot opened up for you!</b> Accept before {time(offer.offered_until)}.</div>
            <Button onClick={() => accept.mutate(offer.id)} loading={accept.isPending}>Accept slot</Button>
          </div>
        </Card>
      )}
      {!data ? <Loading rows={2} /> : next ? (
        <Card tone="dark" className="mb-5 overflow-hidden">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#2CC5D2]">{t("next_appt")}</div>
          <div className="mt-2 text-2xl font-bold">{dayTime(next.slot_start)}</div>
          <div className="mt-1 text-white/75">{next.doctor_name} · {next.department_name}</div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/10 px-2.5 py-1">{t("expected_wait")}: {next.predicted_p10}–{next.predicted_p90} {t("minutes")}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1">{next.reason}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1">{next.status.replace("_", " ")}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {isToday && ["booked", "confirmed"].includes(next.status) && <Button size="lg" onClick={() => checkIn.mutate(next.id)} loading={checkIn.isPending}><MapPin className="h-4 w-4" /> {t("check_in")}</Button>}
            {isToday && ["checked_in", "in_consultation"].includes(next.status) && <Button size="lg" onClick={() => nav(`/patient/ticket/${next.id}`)}><Ticket className="h-4 w-4" /> Live ticket</Button>}
            <Button variant="secondary" className="!bg-white/10 !text-white !border-white/20" onClick={() => nav("/patient/appointments")}>{t("my_appts")}</Button>
          </div>
        </Card>
      ) : (
        <Card className="mb-5"><div className="text-sm text-muted">No upcoming appointments.</div></Card>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[[t("book"), <CalendarPlus />, "/patient/book"], [t("find_doctor"), <Search />, "/patient/doctors"], [t("my_appts"), <ClipboardList />, "/patient/appointments"], [t("my_visits"), <Ticket />, "/patient/visits"]].map(([l, i, to]: any) => (
          <button key={to} onClick={() => nav(to)} className="focus-ring flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-4 text-center text-sm font-semibold shadow-card transition hover:-translate-y-0.5 hover:border-brand/40">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand/10 text-brand [&>svg]:h-5 [&>svg]:w-5">{i}</span>{l}
          </button>
        ))}
      </div>
      {data?.follow_up && (
        <Card className="mb-5 border-accent/40 bg-accent/5" title={t("follow_up")} subtitle={data.follow_up.basis}>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>{data.follow_up.doctor_name} · {data.follow_up.department_name} · {day(data.follow_up.window[0])} – {day(data.follow_up.window[1])}</span>
            <Button size="sm" onClick={() => nav(`/patient/book?dept=${data.follow_up.department_id}&doctor=${data.follow_up.doctor_id}&visit=Follow-up`)}>{t("book")}</Button>
          </div>
        </Card>
      )}
      <Card title="Updates" subtitle="In-app notifications">
        {!notes?.length ? <div className="text-sm text-muted">No updates yet.</div> : (
          <div className="space-y-2">{notes.slice(0, 5).map((n) => (
            <div key={n.id} className="rounded-xl bg-surface2 p-3 text-sm"><div className="flex justify-between"><b>{n.title}</b><span className="text-xs text-muted">{time(n.created_at)}</span></div><div className="text-xs text-muted">{n.body}</div></div>
          ))}</div>
        )}
      </Card>
    </div>
  );
}
