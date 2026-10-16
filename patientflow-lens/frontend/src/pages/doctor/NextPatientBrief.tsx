import { Chip, Loading, StatusChip, TriageChip } from "@/components/ui";
import { useApi } from "@/lib/api";
import { day, fmtMin } from "@/lib/format";

/** Template-generated, non-clinical summary of a patient's history for the doctor. */
export default function NextPatientBrief({ patientId, appt }: { patientId: string; appt?: any }) {
  const { data: p } = useApi<any>(`/patients/${patientId}`);
  if (!p) return <Loading rows={1} />;
  const last = p.visits[p.visits.length - 1];
  const depts = Object.entries(p.departments).map(([k, v]) => `${k} (${v})`).join(", ");
  const summary = `${p.age}-year-old ${p.sex === "F" ? "female" : p.sex === "M" ? "male" : "patient"}, ${p.chronic_condition === "None" ? "no recorded chronic condition" : `chronic: ${p.chronic_condition}`}. ` +
    `${p.n_visits} previous visit${p.n_visits === 1 ? "" : "s"}${depts ? ` across ${depts}` : ""}. ` +
    (last ? `Last seen ${day(last.arrival_time, { day: "numeric", month: "short", year: "numeric" })} in ${last.department_name} (${last.outcome.toLowerCase()}). ` : "") +
    `Usually waits ${fmtMin(p.usual_wait)}.`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Chip tone="brand">{p.age_band}</Chip><Chip>{p.sex}</Chip><Chip tone="accent">{p.chronic_condition}</Chip>
        {p.cluster && <Chip tone="neutral">{p.cluster}</Chip>}<Chip>{p.preferred_language}</Chip>
      </div>
      <p className="text-sm leading-relaxed">{summary}</p>
      {appt && <div className="text-xs text-muted">Today: <b className="text-ink">{appt.visit_type}</b> · {appt.reason}{appt.parent_appointment_id ? " · follow-up of a previous visit" : ""}</div>}
      <div className="space-y-1">
        {p.visits.slice(-5).reverse().map((v: any) => (
          <div key={v.encounter_id} className="flex items-center gap-2 rounded-lg bg-surface2 px-2.5 py-1.5 text-xs">
            <span className="w-24 font-semibold">{day(v.arrival_time, { day: "numeric", month: "short", year: "2-digit" })}</span>
            <span className="flex-1 truncate">{v.department_name}{v.doctor_name ? ` · ${v.doctor_name}` : ""}</span>
            <TriageChip level={v.triage_level} /><span className="w-24 text-right text-muted">{v.outcome}</span>
          </div>
        ))}
      </div>
      {p.tests.length > 0 && <div className="text-xs text-muted">{p.tests.length} diagnostic test record(s): {p.tests.map((t: any) => t.test_type).join(", ")} (timing unlinked)</div>}
      <div className="text-[11px] text-muted">Operational summary only. No clinical advice. Synthetic data.</div>
    </div>
  );
}
