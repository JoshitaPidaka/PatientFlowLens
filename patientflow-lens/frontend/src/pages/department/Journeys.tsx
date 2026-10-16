import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, Chip, cx, DataNote, EmptyState, Input, Loading, PageHeader, RangeBar, StatusChip, TriageChip } from "@/components/ui";
import { useApi } from "@/lib/api";
import { dayTime, fmtMin, signed, time } from "@/lib/format";

export default function Journeys() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("patient") || "P01936");
  const pid = params.get("patient") || "P01936";
  const { data: list } = useApi<any[]>(q.length >= 2 ? `/patients?q=${encodeURIComponent(q)}&limit=8` : null);
  const { data: p } = useApi<any>(`/patients/${pid}`);
  const [enc, setEnc] = useState<string | null>(null);
  useEffect(() => { if (p?.visits?.length) setEnc(p.visits[p.visits.length - 1].encounter_id); }, [p?.patient_id]);
  return (
    <div>
      <PageHeader eyebrow="Patient journeys" title="Follow one patient through the hospital"
        subtitle="Arrival → wait → service → discharge for every visit, each stage compared with the norm for the same department and triage level." />
      <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <Card>
            <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Patient ID…" className="focus-ring h-9 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-sm" /></div>
            <div className="mt-2 space-y-1">{(list || []).map((x) => (
              <button key={x.patient_id} onClick={() => setParams({ patient: x.patient_id })} className={cx("focus-ring flex w-full justify-between rounded-lg px-2.5 py-1.5 text-sm", x.patient_id === pid ? "bg-brand/10 text-brand" : "hover:bg-surface2")}>
                <b>{x.patient_id}</b><span className="text-xs text-muted">{x.age}y · {x.visits} visits</span></button>
            ))}</div>
          </Card>
          {p && (
            <Card title={p.patient_id} subtitle={`${p.age}y · ${p.sex} · ${p.insurance_type}`}>
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-1.5"><Chip tone="accent">{p.chronic_condition}</Chip>{p.cluster && <Chip tone="brand">{p.cluster}</Chip>}</div>
                <div className="text-muted">Usual wait <b className="text-ink">{fmtMin(p.usual_wait)}</b> · {p.n_visits} visits</div>
                <div className="text-xs text-muted">{Object.entries(p.departments).map(([k, v]) => `${k} ×${v}`).join(" · ")}</div>
              </div>
            </Card>
          )}
        </div>
        <div className="min-w-0 space-y-5">
          {!p ? <Loading rows={3} /> : (
            <Card title="Visits" subtitle="Click a visit to see its journey">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {p.visits.map((v: any) => (
                  <button key={v.encounter_id} onClick={() => setEnc(v.encounter_id)}
                    className={cx("focus-ring min-w-[150px] rounded-xl border p-2.5 text-left text-xs transition", enc === v.encounter_id ? "border-brand bg-brand/5" : "border-line hover:bg-surface2")}>
                    <div className="font-semibold">{dayTime(v.arrival_time)}</div>
                    <div className="mt-0.5 text-muted">{v.department_name}</div>
                    <div className="mt-1.5 flex items-center gap-1.5"><TriageChip level={v.triage_level} /><span className="font-semibold tnum">{v.wait?.toFixed(0)}m</span></div>
                  </button>
                ))}
              </div>
            </Card>
          )}
          {enc && <Timeline eid={enc} />}
          {p && p.tests.length > 0 && (
            <Card title="Diagnostic test records" subtitle="Timing not linked to visits (data-quality check), so shown separately">
              <div className="grid gap-2 md:grid-cols-2">{p.tests.map((t: any) => (
                <div key={t.test_id} className="flex items-center justify-between rounded-lg bg-surface2 px-3 py-2 text-sm"><span><b>{t.test_type}</b> · {t.priority}</span><span className="text-xs text-muted">{t.turnaround?.toFixed(0)} min · <Chip>timing unlinked</Chip></span></div>
              ))}</div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Timeline({ eid }: { eid: string }) {
  const { data: t } = useApi<any>(`/encounters/${eid}/timeline`);
  if (!t) return <Loading rows={1} />;
  const total = t.segments.reduce((a: number, s: any) => a + s.minutes, 0);
  const color: Record<string, string> = { Waiting: "bg-warn", "In service": "bg-brand", "Awaiting discharge": "bg-neutral" };
  return (
    <Card title={<span className="flex flex-wrap items-center gap-2">Journey {t.encounter_id} <TriageChip level={t.triage_level} /> <Chip>{t.visit_type}</Chip> <Chip tone={t.outcome === "Left before care" ? "bad" : "good"}>{t.outcome}</Chip></span>}
      subtitle={`${t.department_name} · slowest stage vs norm: ${t.slowest_stage}`}>
      <div className="flex h-12 overflow-hidden rounded-xl">
        {t.segments.map((s: any) => (
          <div key={s.stage} className={cx("flex flex-col justify-center px-3 text-xs text-white", color[s.stage], s.stage === t.slowest_stage && "ring-4 ring-inset ring-bad/70")} style={{ width: `${(s.minutes / total) * 100}%`, minWidth: 70 }}>
            <b>{s.stage}</b><span className="opacity-90 tnum">{s.minutes.toFixed(0)} min</span>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {t.segments.map((s: any) => (
          <div key={s.stage} className="rounded-xl border border-line p-3 text-sm">
            <div className="text-xs text-muted">{s.stage} · {time(s.start)} → {time(s.end)}</div>
            <div className="mt-1 font-bold tnum">{s.minutes.toFixed(0)} min <span className={cx("text-xs", s.vs_norm > 0 ? "text-bad" : "text-good")}>{signed(s.vs_norm, 0)} vs norm</span></div>
            <div className="text-xs text-muted">norm (median) {s.norm.toFixed(0)} min</div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl bg-surface2 p-4">
        <div className="mb-2 flex items-center justify-between text-sm"><b>Model's expected wait vs actual</b><span className="tnum">expected {t.model.expected.toFixed(0)} min (80%: {t.model.p10.toFixed(0)}–{t.model.p90.toFixed(0)}) · actual <b>{t.model.actual.toFixed(0)}</b></span></div>
        <RangeBar lo={t.model.p10} hi={t.model.p90} expected={t.model.expected} actual={t.model.actual} max={Math.max(140, t.model.actual + 10)} />
      </div>
      {Object.keys(t.dq).length > 0 && <div className="mt-3"><DataNote>Data-quality flags on this visit: {Object.keys(t.dq).join(", ")}</DataNote></div>}
    </Card>
  );
}
