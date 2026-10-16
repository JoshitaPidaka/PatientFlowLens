import { Star } from "lucide-react";
import { useState } from "react";
import { Chip, cx, EmptyState, Loading, Segmented } from "@/components/ui";
import { useApi } from "@/lib/api";
import { addDays, day, time } from "@/lib/format";
import { useT } from "@/lib/i18n";

export type Mode = "earliest" | "least_crowded" | "my_language" | "same_doctor";

/** Date strip + ranked slot grid. Recommended slots carry a star and their reasons. */
export default function SlotPicker({ departmentId, patientId, doctorId, visitType = "Scheduled", value, onChange, onEmpty, startDate = "2026-01-05" }: {
  departmentId: string; patientId: string; doctorId?: string; visitType?: string; value: any; onChange: (s: any) => void; onEmpty?: (date: string) => void; startDate?: string;
}) {
  const t = useT();
  const [date, setDate] = useState<string>(startDate);
  const [mode, setMode] = useState<Mode>("my_language");
  const { data } = useApi<any>(`/booking/slots?department_id=${departmentId}&patient_id=${patientId}&mode=${mode}&visit_type=${visitType}&day=${date}${doctorId ? `&doctor_id=${doctorId}` : ""}`);
  const dates = Array.from({ length: 12 }, (_, i) => addDays(startDate, i));
  const byShift = (data?.slots || []).reduce((a: any, s: any) => ({ ...a, [s.shift]: [...(a[s.shift] || []), s] }), {});
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {dates.map((d) => (
          <button key={d} onClick={() => setDate(d)} className={cx("focus-ring flex min-w-[64px] flex-col items-center rounded-2xl border px-3 py-2 transition",
            d === date ? "border-brand bg-brand text-white shadow" : "border-line bg-surface hover:border-brand/40")}>
            <span className="text-[11px] font-semibold uppercase opacity-80">{day(d, { weekday: "short" })}</span>
            <span className="text-lg font-bold leading-tight">{d.slice(8)}</span>
            <span className="text-[10px] opacity-70">{day(d, { month: "short" })}</span>
          </button>
        ))}
      </div>
      <Segmented size="sm" value={mode} onChange={setMode} options={[
        { value: "my_language", label: "My language" }, { value: "earliest", label: "Earliest" }, { value: "least_crowded", label: "Least crowded" }, { value: "same_doctor", label: "Same doctor" }]} />
      {!data ? <Loading rows={2} /> : !data.slots.length ? (
        <EmptyState title="No free slots on this day" body="Try another day, or join the waitlist and we'll offer you the first slot that opens."
          action={onEmpty && <button onClick={() => onEmpty(date)} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white">{t("join_waitlist")}</button>} />
      ) : (
        <>
          {data.recommended.length > 0 && (
            <div className="grid gap-2 md:grid-cols-3">
              {data.recommended.map((s: any) => (
                <button key={s.slot_id} onClick={() => onChange(s)} className={cx("focus-ring rounded-2xl border p-3 text-left transition",
                  value?.slot_id === s.slot_id ? "border-brand bg-brand/10 ring-2 ring-brand/30" : "border-warn/40 bg-warn/5 hover:border-warn")}>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-warn"><Star className="h-3.5 w-3.5 fill-current" /> {t("recommended")}</div>
                  <div className="mt-1 text-lg font-bold">{time(s.start)} <span className="text-sm font-medium text-muted">· {s.doctor_name}</span></div>
                  <div className="mt-1 text-xs text-muted">{s.reasons.join(" · ") || "good balance"}</div>
                  <div className="mt-1.5 text-xs">{t("expected_wait")}: <b>{s.wait_range[0]}–{s.wait_range[1]} {t("minutes")}</b></div>
                </button>
              ))}
            </div>
          )}
          {["Morning", "Evening"].filter((sh) => byShift[sh]).map((sh) => (
            <div key={sh}>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{sh}</div>
              <div className="flex flex-wrap gap-2">
                {byShift[sh].map((s: any) => (
                  <button key={s.slot_id} onClick={() => onChange(s)} title={`${s.doctor_name} · ${s.reasons.join(", ")}`}
                    className={cx("focus-ring relative rounded-xl border px-3 py-2 text-left text-sm transition",
                      value?.slot_id === s.slot_id ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-brand/50")}>
                    {s.recommended && <Star className="absolute -right-1.5 -top-1.5 h-4 w-4 fill-warn text-warn" />}
                    <div className="font-bold">{time(s.start)}</div>
                    <div className={cx("text-[11px]", value?.slot_id === s.slot_id ? "text-white/80" : "text-muted")}>{s.doctor_name.replace("Dr. ", "Dr ")}</div>
                    {s.language_match && <Chip tone={value?.slot_id === s.slot_id ? "neutral" : "good"} className="mt-1">{data.patient_language}</Chip>}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="text-[11px] text-muted">{data.note}</div>
        </>
      )}
    </div>
  );
}
