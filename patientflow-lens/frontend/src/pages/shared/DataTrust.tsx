import { CheckCircle2, Database, FlaskConical, ShieldAlert, Sparkles } from "lucide-react";
import { Card, Chip, cx, Kpi, Loading, PageHeader } from "@/components/ui";
import { useApi } from "@/lib/api";

export default function DataTrust() {
  const { data } = useApi<any>("/meta/data-quality");
  if (!data) return <Loading rows={4} />;
  const flagged = data.checks.filter((c: any) => c.status === "flagged").length;
  return (
    <div>
      <PageHeader eyebrow="Data trust centre" title="What the data can and cannot support"
        subtitle="Every quality check, how many rows it affects and how the product handles it. No rows were dropped. Everything simulated is listed with its rule." />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Object.entries(data.rows).map(([k, v]: any) => <Kpi key={k} label={k} value={v.toLocaleString()} sub="rows (provided CSV)" icon={<Database className="h-4 w-4" />} />)}
      </div>
      <Card className="mb-5" title="Data lineage">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {[["4 provided CSVs", "real", "brand"], ["clean.py · 10 dq flags", "real", "brand"], ["6 models trained from scratch", "real", "accent"], ["analytics + alerts", "real", "accent"],
            ["simulate.py · roster, slots, appointments", "simulated", "neutral"], ["app (5 workspaces)", "", "good"]].map(([l, k, tone], i, arr) => (
            <div key={l} className="flex items-center gap-2">
              <span className={cx("rounded-xl border px-3 py-2 font-semibold", tone === "neutral" ? "border-dashed border-neutral/60 text-muted" : "border-line bg-surface2")}>{l}{k && <span className="ml-1.5 text-[10px] font-bold uppercase text-muted">{k}</span>}</span>
              {i < arr.length - 1 && <span className="text-muted">→</span>}
            </div>
          ))}
        </div>
      </Card>
      <Card className="mb-5" title={`Quality checks · ${flagged} flagged, ${data.checks.length - flagged} passed`} pad={false}>
        <div className="divide-y divide-line">
          {data.checks.map((c: any) => (
            <div key={c.check} className="grid grid-cols-[28px_1.6fr_110px_90px_2fr] items-center gap-4 px-5 py-3 text-sm">
              {c.status === "pass" ? <CheckCircle2 className="h-5 w-5 text-good" /> : <ShieldAlert className="h-5 w-5 text-warn" />}
              <div><div className="font-semibold">{c.label}</div><div className="font-mono text-[11px] text-muted">{c.table}.{c.check}</div></div>
              <div className="text-right font-bold tnum">{c.rows.toLocaleString()}</div>
              <div className="text-right"><Chip tone={c.status === "pass" ? "good" : c.share > 50 ? "bad" : "warn"}>{c.share}%</Chip></div>
              <div className="text-muted">{c.handling}</div>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-brand" /> Other findings</span>}>
          <ul className="space-y-2 text-sm">{data.notes.map((n: string) => <li key={n} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{n}</li>)}</ul>
        </Card>
        <Card title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /> Simulated data (gap-filling rules)</span>}
          subtitle="The dataset has no doctors, rosters or appointment slots. These are generated deterministically (seed 2026) and labelled 'Simulated' everywhere.">
          <div className="space-y-2">{data.simulated.map((s: any) => (
            <div key={s.item} className="rounded-xl border border-dashed border-line p-3 text-sm">
              <div className="flex items-center justify-between"><b>{s.item}</b><span className="font-mono text-[11px] text-muted">anchor: {s.anchor}</span></div>
              <div className="mt-0.5 text-muted">{s.rule}</div>
            </div>
          ))}</div>
        </Card>
      </div>
    </div>
  );
}
