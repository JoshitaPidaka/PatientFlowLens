import { Languages, Star } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Button, Card, Chip, cx, Drawer, Loading, PageHeader, Select, SimulatedChip } from "@/components/ui";
import { useApi } from "@/lib/api";
import { day, dayTime, time } from "@/lib/format";
import { langClass, useT } from "@/lib/i18n";
import { useApp } from "@/lib/state";

export default function FindDoctor() {
  const app = useApp();
  const t = useT();
  const nav = useNavigate();
  const { data: meta } = useApi<any>("/meta");
  const [dept, setDept] = useState("D03");
  const [lang, setLang] = useState(app.lang === "English" ? "" : app.lang);
  const { data } = useApi<any[]>(`/doctors?department_id=${dept}${lang ? `&language=${lang}` : ""}`);
  const [sel, setSel] = useState<any>(null);
  return (
    <div className={langClass(app.lang)}>
      <PageHeader eyebrow={t("find_doctor")} title={<span className="flex items-center gap-3">{t("find_doctor")} <SimulatedChip what="simulated roster" /></span>}
        subtitle="See each doctor's weekly timetable and next free slot, then book in two taps."
        actions={<>
          {meta && <Select value={dept} onChange={setDept} options={meta.departments.filter((d: any) => !["D08", "D12"].includes(d.department_id)).map((d: any) => ({ value: d.department_id, label: d.department_name }))} />}
          <Select value={lang} onChange={setLang} options={[{ value: "", label: "Any language" }, { value: "Telugu", label: "తెలుగు Telugu" }, { value: "Hindi", label: "हिन्दी Hindi" }, { value: "English", label: "English" }]} />
        </>} />
      {!data ? <Loading rows={3} /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((d) => (
            <Card key={d.doctor_id} className="transition hover:-translate-y-0.5 hover:shadow-pop">
              <div className="flex items-start gap-3">
                <Avatar name={d.name} size={52} tone={d.gender === "F" ? "accent" : "brand"} />
                <div className="min-w-0 flex-1">
                  <div className="text-base font-bold">{d.name}</div>
                  <div className="text-sm text-muted">{d.department_name} · {d.years_experience} yrs</div>
                  <div className="mt-1.5 flex flex-wrap gap-1"><Languages className="h-3.5 w-3.5 text-muted" />{d.languages.map((l: string) => <Chip key={l} tone={l === app.lang ? "good" : "neutral"}>{l}</Chip>)}</div>
                </div>
                {d.on_duty_today && <Chip tone="good" dot>on duty</Chip>}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-surface2 p-2.5"><div className="text-muted">{t("next_free")}</div><div className="font-bold">{d.next_free ? dayTime(d.next_free) : "—"}</div></div>
                <div className="rounded-xl bg-surface2 p-2.5"><div className="text-muted">{t("expected_wait")}</div><div className="font-bold">{d.typical_wait[0]}–{d.typical_wait[1]} {t("minutes")}</div></div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted">{d.free_slots_7d} free slots this week · Room {d.consult_room}{d.rating && <> · <Star className="inline h-3 w-3 fill-warn text-warn" /> {d.rating}</>}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <Button className="flex-1" onClick={() => nav(`/patient/book?dept=${d.department_id}&doctor=${d.doctor_id}`)}>{t("book")}</Button>
                <Button variant="secondary" onClick={() => setSel(d)}>Timetable</Button>
              </div>
            </Card>
          ))}
          {!data.length && <div className="text-sm text-muted">No doctors match. Try another language.</div>}
        </div>
      )}
      <DoctorProfile d={sel} onClose={() => setSel(null)} />
    </div>
  );
}

function DoctorProfile({ d, onClose }: { d: any; onClose: () => void }) {
  const nav = useNavigate();
  const { data } = useApi<any>(d ? `/doctors/${d.doctor_id}/timetable?week=2026-01-05` : null);
  const { data: next } = useApi<any>(d ? `/doctors/${d.doctor_id}/timetable?week=2026-01-12` : null);
  const days = [...(data?.days || []), ...(next?.days || [])];
  return (
    <Drawer open={!!d} onClose={onClose} width={560} title={d?.name} subtitle={d && `${d.department_name} · ${d.languages.join(", ")} · Room ${d.consult_room}`}>
      {!data ? <Loading /> : (
        <div>
          <div className="mb-3 text-sm font-semibold">Availability (next two weeks)</div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((x: any) => {
              const sess = x.sessions.filter((s: any) => s.shift !== "Night");
              const free = sess.reduce((a: number, s: any) => a + s.slots.filter((y: any) => y.kind === "bookable" && y.status === "free").length, 0);
              const leave = sess.some((s: any) => s.status === "leave");
              const past = x.date < "2026-01-05";
              const cls = leave ? "bg-neutral/25 text-muted" : !sess.length || past ? "bg-surface2 text-muted/60" : free === 0 ? "bg-bad/15 text-bad" : free <= 3 ? "bg-warn/15 text-warn" : "bg-good/15 text-good";
              return (
                <button key={x.date} disabled={!free || past || leave} onClick={() => nav(`/patient/book?dept=${d.department_id}&doctor=${d.doctor_id}&date=${x.date}`)}
                  className={cx("focus-ring rounded-xl p-2 text-center text-xs font-semibold disabled:cursor-default", cls)}>
                  <div>{x.weekday}</div><div className="text-base">{x.date.slice(8)}</div>
                  <div className="text-[10px] font-medium">{leave ? "leave" : !sess.length ? "off" : past ? "—" : free === 0 ? "full" : `${free} free`}</div>
                  {sess.length > 0 && !past && <div className="text-[9px] font-normal opacity-80">{sess.map((s: any) => s.shift[0]).join("+")}</div>}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted"><span>🟩 available</span><span>🟧 few left</span><span>🟥 full</span><span>⬜ off / leave</span><span>M = morning 08–14, E = evening 14–20</span></div>
          <Button className="mt-5 w-full" size="lg" onClick={() => nav(`/patient/book?dept=${d.department_id}&doctor=${d.doctor_id}`)}>Book with {d.name}</Button>
        </div>
      )}
    </Drawer>
  );
}
