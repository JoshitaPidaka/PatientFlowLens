import { motion } from "framer-motion";
import { Clock, MapPin } from "lucide-react";
import { useParams } from "react-router-dom";
import { Chip, Loading, RangeBar } from "@/components/ui";
import { useApi } from "@/lib/api";
import { time } from "@/lib/format";
import { langClass, useT } from "@/lib/i18n";
import { useApp } from "@/lib/state";

export default function Ticket() {
  const { id } = useParams();
  const app = useApp();
  const t = useT();
  const { data } = useApi<any>(`/appointments/${id}/ticket`, { refetchInterval: 4000 });
  if (!data) return <Loading rows={3} />;
  const a = data.appointment;
  const inside = a.status === "in_consultation";
  const done = a.status === "completed";
  const late = data.running_late >= 10;
  const mins = Math.max(0, data.minutes_to_eta ?? 0);
  const R = 70, circ = 2 * Math.PI * R, frac = Math.min(1, mins / 90);
  return (
    <div className={`mx-auto max-w-md ${langClass(app.lang)}`}>
      <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="overflow-hidden rounded-[28px] border border-line bg-surface shadow-pop">
        <div className="bg-gradient-to-br from-brand to-accent p-6 text-white">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.14em] opacity-90"><span>PatientFlow Lens</span><span>#{a.id}</span></div>
          <div className="mt-4 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-white/20 text-sm font-bold ring-1 ring-white/40">{data.doctor.name.replace("Dr. ", "").split(" ").map((x: string) => x[0]).join("")}</span>
            <div><div className="text-lg font-bold">{data.doctor.name}</div><div className="text-sm opacity-85">{data.doctor.department_name} · Room {data.doctor.consult_room}</div></div></div>
        </div>
        <div className="relative px-6 py-6">
          <div className="absolute -top-3 left-0 right-0 flex justify-between px-[-12px]"><span className="-ml-3 h-6 w-6 rounded-full bg-bg" /><span className="-mr-3 h-6 w-6 rounded-full bg-bg" /></div>
          {inside ? (
            <div className="py-6 text-center"><div className="text-3xl font-extrabold text-brand">{t("your_turn")}</div><div className="mt-2 text-muted">Room {data.doctor.consult_room}</div></div>
          ) : done ? (
            <div className="py-6 text-center"><div className="text-2xl font-extrabold text-good">Visit complete ✓</div><div className="mt-2 text-sm text-muted">{t("rate_visit")} in My visits.</div></div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="relative h-44 w-44">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r={R} stroke="rgb(var(--surface2))" strokeWidth="12" fill="none" />
                  <motion.circle cx="80" cy="80" r={R} stroke={late ? "rgb(var(--warn))" : "rgb(var(--brand))"} strokeWidth="12" fill="none" strokeLinecap="round"
                    strokeDasharray={circ} animate={{ strokeDashoffset: circ * (1 - frac) }} transition={{ duration: 0.8 }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-5xl font-extrabold tnum">{data.minutes_to_eta === null ? "—" : mins}</div>
                  <div className="text-xs font-semibold text-muted">{t("minutes")} · ETA {time(data.eta)}</div>
                </div>
              </div>
              <div className="mt-4 grid w-full grid-cols-2 gap-3">
                <div className="rounded-2xl bg-surface2 p-3 text-center"><div className="text-xs text-muted">{t("position")}</div><div className="text-3xl font-extrabold">{data.position}</div></div>
                <div className="rounded-2xl bg-surface2 p-3 text-center"><div className="text-xs text-muted">{data.people_ahead} {t("people_ahead")}</div><div className="text-sm font-bold">booked {time(a.slot_start)}</div></div>
              </div>
              <div className={`mt-3 flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold ${late ? "bg-warn/15 text-warn" : "bg-good/12 text-good"}`}>
                <Clock className="h-4 w-4" /> {late ? `${t("running_late")} · ~${data.running_late.toFixed(0)} ${t("minutes")}` : t("on_time")}
              </div>
            </div>
          )}
          <div className="mt-5 space-y-2 text-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">{t("expected_wait")}</div>
            <RangeBar lo={data.expected_wait[0]} hi={data.expected_wait[1]} expected={(data.expected_wait[0] + data.expected_wait[1]) / 2} max={120} />
            <div className="text-xs text-muted">{data.expected_wait[0]}–{data.expected_wait[1]} {t("minutes")} (model estimate after check-in)</div>
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-2xl border border-line p-3 text-sm"><MapPin className="h-4 w-4 text-brand" />{t("best_arrival")}: <b>{time(data.best_arrival)}</b></div>
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">{t("bring")}</div>
            <div className="flex flex-wrap gap-1.5">{data.bring.map((b: string) => <Chip key={b}>{b}</Chip>)}</div>
          </div>
        </div>
      </motion.div>
      <div className="mt-3 text-center text-[11px] text-muted">Updates every few seconds. Demo clock {time(data.now)} · simulated schedule.</div>
    </div>
  );
}
