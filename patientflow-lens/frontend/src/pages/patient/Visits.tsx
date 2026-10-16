import { Star } from "lucide-react";
import { useState } from "react";
import { Button, Card, Chip, cx, Loading, PageHeader, StatusChip, TriageChip, useToast } from "@/components/ui";
import { post, useAction, useApi } from "@/lib/api";
import { dayTime, fmtMin } from "@/lib/format";
import { langClass, useT } from "@/lib/i18n";
import { useApp } from "@/lib/state";

export default function Visits() {
  const app = useApp();
  const t = useT();
  const { data: p } = useApi<any>(`/patients/${app.patientId}`);
  const { data: ap } = useApi<any>(`/patients/${app.patientId}/appointments`);
  const rateable = (ap?.past || []).filter((a: any) => a.status === "completed" && a.source === "app" && !a.rating);
  return (
    <div className={`mx-auto max-w-4xl ${langClass(app.lang)}`}>
      <PageHeader eyebrow={t("my_visits")} title={t("my_visits")} subtitle="Your past visits, how long you waited compared with what we expected, and a place to tell us how it went." />
      {rateable.map((a: any) => <RateCard key={a.id} a={a} />)}
      {!p ? <Loading rows={3} /> : (
        <div className="space-y-3">
          {p.visits.slice().reverse().map((v: any) => (
            <Card key={v.encounter_id}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{dayTime(v.arrival_time)} · {v.department_name}</div>
                  <div className="text-sm text-muted">{v.doctor_name ? `${v.doctor_name} · ` : ""}{v.visit_type} · {v.outcome}</div>
                </div>
                <TriageChip level={v.triage_level} />
                <div className="text-right"><div className="text-xs text-muted">waited</div><div className="font-bold tnum">{fmtMin(v.wait)}</div></div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RateCard({ a }: { a: any }) {
  const t = useT();
  const toast = useToast();
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const send = useAction(() => post(`/appointments/${a.id}/feedback`, { stars, tags }), () => toast({ title: "Thank you!", tone: "good" }));
  const all = ["Short wait", "Clear instructions", "Kind staff", "Long wait", "Hard to find room"];
  return (
    <Card className="mb-4 border-brand/40" title={t("rate_visit")} subtitle={`${a.doctor_name} · ${dayTime(a.slot_start)}`}>
      <div className="flex gap-1">{[1, 2, 3, 4, 5].map((s) => (
        <button key={s} onClick={() => setStars(s)} aria-label={`${s} stars`}><Star className={cx("h-8 w-8", s <= stars ? "fill-warn text-warn" : "text-line")} /></button>
      ))}</div>
      <div className="mt-3 flex flex-wrap gap-2">{all.map((x) => (
        <button key={x} onClick={() => setTags(tags.includes(x) ? tags.filter((y) => y !== x) : [...tags, x])}
          className={cx("rounded-full border px-3 py-1 text-xs font-semibold", tags.includes(x) ? "border-brand bg-brand/10 text-brand" : "border-line")}>{x}</button>
      ))}</div>
      <Button className="mt-3" disabled={!stars} loading={send.isPending} onClick={() => send.mutate(undefined)}>Send</Button>
    </Card>
  );
}
