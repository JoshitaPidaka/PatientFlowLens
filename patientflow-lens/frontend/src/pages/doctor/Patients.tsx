import { Search } from "lucide-react";
import { useState } from "react";
import { Card, cx, EmptyState, Loading, PageHeader, StatusChip, TriageChip } from "@/components/ui";
import { useApi } from "@/lib/api";
import { day, dayTime } from "@/lib/format";
import { useApp } from "@/lib/state";
import NextPatientBrief from "./NextPatientBrief";

export default function Patients() {
  const { doctorId } = useApp();
  const [q, setQ] = useState("");
  const { data } = useApi<any[]>(`/doctors/${doctorId}/patients?q=${encodeURIComponent(q)}`);
  const [pid, setPid] = useState<string | null>(null);
  const { data: p } = useApi<any>(pid ? `/patients/${pid}` : null);
  return (
    <div>
      <PageHeader eyebrow="Patient history" title="Patients I have seen or will see" subtitle="Visit and appointment history (dataset visits plus app bookings). Operational view only." />
      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <Card>
          <div className="relative mb-3"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patient ID" className="focus-ring h-9 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-sm" /></div>
          {!data ? <Loading /> : (
            <div className="max-h-[70vh] space-y-1 overflow-y-auto">{data.map((x) => (
              <button key={x.patient_id} onClick={() => setPid(x.patient_id)} className={cx("focus-ring flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm", pid === x.patient_id ? "bg-brand/10 text-brand" : "hover:bg-surface2")}>
                <span><b>{x.patient_id}</b> <span className="text-xs text-muted">{x.age}y {x.sex}</span></span>
                <span className="text-[11px] text-muted">{x.last_visit ? day(x.last_visit, { day: "numeric", month: "short" }) : "upcoming"}</span>
              </button>
            ))}</div>
          )}
        </Card>
        {!pid ? <EmptyState title="Select a patient" body="See their brief, full visit history and appointments." /> : (
          <div className="space-y-5">
            <Card title={`${pid} · brief`}><NextPatientBrief patientId={pid} /></Card>
            {p && (
              <div className="grid gap-5 lg:grid-cols-2">
                <Card title="All visits (dataset)">
                  <div className="max-h-96 space-y-1 overflow-y-auto">{p.visits.slice().reverse().map((v: any) => (
                    <div key={v.encounter_id} className="grid grid-cols-[110px_1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-surface2">
                      <span className="font-semibold">{dayTime(v.arrival_time)}</span><span className="truncate">{v.department_name} · waited {v.wait?.toFixed(0)}m</span><TriageChip level={v.triage_level} />
                    </div>
                  ))}</div>
                </Card>
                <Card title="Appointments">
                  <div className="max-h-96 space-y-1 overflow-y-auto">{p.appointments.map((a: any) => (
                    <div key={a.id} className="grid grid-cols-[110px_1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-surface2">
                      <span className="font-semibold">{dayTime(a.slot_start)}</span><span className="truncate">{a.department_name} · {a.doctor_name}</span><StatusChip status={a.status} />
                    </div>
                  ))}</div>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
