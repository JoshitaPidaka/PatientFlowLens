import { ChevronLeft, ChevronRight, Moon } from "lucide-react";
import { useState } from "react";
import { Avatar, Button, Card, Chip, cx, DataNote, Drawer, Loading, Meter, PageHeader, Segmented, SimulatedChip, StatusChip } from "@/components/ui";
import { useApi } from "@/lib/api";
import { addDays, day, time } from "@/lib/format";
import { useApp } from "@/lib/state";
import NextPatientBrief from "./NextPatientBrief";

const START = 8, END = 20, PX = 52; // hours shown in the grid, px per hour
const block: Record<string, string> = {
  completed: "bg-good/15 border-good/50 text-ink", in_consultation: "bg-warn/20 border-warn text-ink", checked_in: "bg-accent/15 border-accent/60",
  confirmed: "bg-brand/15 border-brand/60", booked: "bg-brand/8 border-brand/40", no_show: "bg-bad/10 border-bad/50 line-through",
};

export default function Timetable() {
  const { doctorId } = useApp();
  const [week, setWeek] = useState("2026-01-05");
  const [view, setView] = useState<"week" | "list">("week");
  const { data } = useApi<any>(`/doctors/${doctorId}/timetable?week=${week}`);
  const [sel, setSel] = useState<any>(null);
  const nowLine = (() => { const n = new Date("2026-01-05T10:30:00"); return (n.getHours() + n.getMinutes() / 60 - START) * PX; })();
  return (
    <div>
      <PageHeader eyebrow="My timetable" title={<span className="flex items-center gap-3">Built from patients' appointments <SimulatedChip what="simulated roster" /></span>}
        subtitle={data && `${data.doctor.name} · ${data.doctor.department_name} · ${data.doctor.avg_consult_min}-min slots (department's real median consult time) · ~${data.walkins_per_day_dept} walk-ins/emergencies per day in this department`}
        actions={<>
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
            <Button size="sm" variant="ghost" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="px-2 text-sm font-semibold">Week of {day(week)}</span>
            <Button size="sm" variant="ghost" onClick={() => setWeek(addDays(week, 7))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <Segmented value={view} onChange={setView} options={[{ value: "week", label: "Week" }, { value: "list", label: "Agenda" }]} />
        </>} />
      <div className="mb-4 flex flex-wrap gap-3 text-xs">
        {[["Booked", "bg-brand/15 border-brand/60"], ["Checked in", "bg-accent/15 border-accent/60"], ["In consultation", "bg-warn/20 border-warn"], ["Completed", "bg-good/15 border-good/50"],
          ["Walk-in reserve", "border-dashed border-neutral/60 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgb(var(--neutral)/0.15)_4px,rgb(var(--neutral)/0.15)_8px)]"], ["Leave", "bg-neutral/25 border-neutral"]].map(([l, c]) => (
          <span key={l} className="flex items-center gap-1.5"><span className={cx("h-3.5 w-5 rounded border", c)} />{l}</span>
        ))}
      </div>
      {!data ? <Loading rows={4} /> : view === "week" ? (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <div className="grid min-w-[980px]" style={{ gridTemplateColumns: `56px repeat(7, 1fr)` }}>
              <div className="border-b border-line" />
              {data.days.map((d: any) => {
                const sess = d.sessions.filter((s: any) => s.shift !== "Night");
                const load = sess.reduce((a: number, s: any) => a + s.booked, 0) / Math.max(1, sess.reduce((a: number, s: any) => a + s.bookable, 0));
                return (
                  <div key={d.date} className={cx("border-b border-l border-line px-2 py-2.5", d.date === "2026-01-05" && "bg-brand/5")}>
                    <div className={cx("text-sm font-bold", d.date === "2026-01-05" && "text-brand")}>{d.weekday} {d.date.slice(8)}</div>
                    {sess.length ? <><div className="mb-1 text-[11px] text-muted">{sess.map((s: any) => s.shift).join(" · ")} · {Math.round(load * 100)}% booked</div><Meter value={load} /></> : <div className="text-[11px] text-muted">{d.sessions.some((s: any) => s.shift === "Night") ? "Night only" : "Off"}</div>}
                  </div>
                );
              })}
              <div className="relative" style={{ height: (END - START) * PX }}>
                {Array.from({ length: END - START }, (_, i) => <div key={i} className="absolute right-2 text-[10px] text-muted" style={{ top: i * PX - 6 }}>{String(START + i).padStart(2, "0")}:00</div>)}
              </div>
              {data.days.map((d: any) => (
                <div key={d.date} className="relative border-l border-line" style={{ height: (END - START) * PX }}>
                  {Array.from({ length: END - START }, (_, i) => <div key={i} className="absolute inset-x-0 border-t border-line/60" style={{ top: i * PX }} />)}
                  {d.sessions.filter((s: any) => s.shift !== "Night").map((s: any) => {
                    const top = (new Date(s.start).getHours() - START) * PX;
                    const h = 6 * PX;
                    if (s.status === "leave") return <div key={s.shift} className="absolute inset-x-1 grid place-items-center rounded-lg border border-neutral bg-neutral/25 text-xs font-semibold text-muted" style={{ top, height: h }}>On leave</div>;
                    return (
                      <div key={s.shift} className="absolute inset-x-1 rounded-lg bg-brand/[0.03]" style={{ top, height: h }}>
                        {s.slots.map((sl: any) => {
                          const st = new Date(sl.start), en = new Date(sl.end);
                          const y = (st.getHours() + st.getMinutes() / 60 - START) * PX - top;
                          const hh = ((en.getTime() - st.getTime()) / 3600000) * PX - 2;
                          const a = sl.appointment;
                          if (!a) return sl.kind === "walkin_reserve" ? (
                            <div key={sl.slot_id} className="absolute inset-x-0 rounded-md border border-dashed border-neutral/50 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgb(var(--neutral)/0.12)_4px,rgb(var(--neutral)/0.12)_8px)] px-1.5 text-[10px] text-muted" style={{ top: y, height: hh }}>walk-in</div>
                          ) : <div key={sl.slot_id} className="absolute inset-x-0 rounded-md border border-dashed border-line px-1.5 text-[10px] text-muted/70" style={{ top: y, height: hh }}>{time(sl.start)} free</div>;
                          return (
                            <button key={sl.slot_id} onClick={() => setSel(a)} className={cx("focus-ring absolute inset-x-0 overflow-hidden rounded-md border-l-[3px] border px-1.5 py-0.5 text-left text-[10.5px] leading-tight transition hover:z-10 hover:shadow-pop", block[a.status] || block.booked)} style={{ top: y, height: hh }}>
                              <div className="font-bold">{time(a.slot_start)} {a.patient_id}</div>
                              {hh > 26 && <div className="truncate text-muted">{a.reason}</div>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                  {d.date === "2026-01-05" && <div className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-bad" style={{ top: nowLine }}><span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-bad" /></div>}
                  {d.sessions.some((s: any) => s.shift === "Night") && <div className="absolute inset-x-1 bottom-1 flex items-center gap-1 rounded-md bg-accent/12 px-1.5 py-1 text-[10px] font-semibold text-accent"><Moon className="h-3 w-3" /> Night on-call 20–08</div>}
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.days.filter((d: any) => d.sessions.length).map((d: any) => (
            <Card key={d.date} title={day(d.date, { weekday: "long", day: "numeric", month: "long" })}>
              {d.sessions.map((s: any) => (
                <div key={s.shift} className="mb-3">
                  <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">{s.shift} <Chip>{s.booked}/{s.bookable} booked</Chip>{s.status === "leave" && <Chip tone="neutral">leave</Chip>}</div>
                  <div className="flex flex-wrap gap-2">{s.slots.filter((x: any) => x.appointment).map((x: any) => (
                    <button key={x.slot_id} onClick={() => setSel(x.appointment)} className="focus-ring rounded-lg border border-line px-2.5 py-1.5 text-xs hover:bg-surface2"><b>{time(x.start)}</b> {x.appointment.patient_id} <StatusChip status={x.appointment.status} /></button>
                  ))}</div>
                </div>
              ))}
            </Card>
          ))}
        </div>
      )}
      <div className="mt-4"><DataNote>Sessions come from the 24/7 rota (Morning 08–14, Evening 14–20, Night on-call). Every third slot is kept free for walk-ins because about half of real visits are unscheduled.</DataNote></div>
      <Drawer open={!!sel} onClose={() => setSel(null)} width={480} title={sel ? `${sel.patient_id} · ${time(sel.slot_start)}` : ""} subtitle={sel && `${day(sel.slot_start)} · ${sel.visit_type} · ${sel.reason}`}>
        {sel && <div className="space-y-4"><StatusChip status={sel.status} /><NextPatientBrief patientId={sel.patient_id} appt={sel} /></div>}
      </Drawer>
    </div>
  );
}
