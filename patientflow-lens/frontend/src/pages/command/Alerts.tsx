import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, C, ChartTooltip, grid } from "@/components/charts";
import { Button, Card, Chip, ConfidenceBadge, DataNote, Drawer, Input, Loading, Modal, PageHeader, Select, SeverityDot, StatusChip, useToast } from "@/components/ui";
import { post, useAction, useApi } from "@/lib/api";
import { day, dayTime, time } from "@/lib/format";

const LABELS: Record<string, string> = {
  excess_wait: "Excess wait (min)", ci95: "95% CI ± (min)", slower_levels: "Slower at triage levels", impact_hours: "Extra patient-hours / yr",
  p90_wait: "90th-pct wait (min)", lbc_rate: "Left before care (%)", resid: "Above model (min)", ewma: "EWMA statistic", ucl: "Control limit",
  p90: "90th-pct wait (min)", lbc_pct: "Left before care (%)", n: "Visits that week", ewma_flag: "EWMA flagged", iso_flag: "IsolationForest flagged",
  delay_min: "Delay (min)", remaining: "Patients still to see", urgent_median: "Urgent median (min)", routine_median: "Routine median (min)",
};
const KINDS: Record<string, string> = {
  bottleneck: "Bottleneck", unusual_wait: "Unusual week", priority_breach: "Priority breach", lbc_spike: "Left-before-care",
  rule: "Rule", running_late: "Running late", coverage_gap: "Coverage gap", overbooked: "Overbooked", target_breach: "Target breach",
};

export default function Alerts() {
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState("");
  const { data } = useApi<any[]>(`/alerts${kind ? `?kind=${kind}` : ""}`);
  const [openId, setOpenId] = useState<number | null>(params.get("id") ? Number(params.get("id")) : null);
  const [ruleOpen, setRuleOpen] = useState(false);
  useEffect(() => { if (params.get("id")) setOpenId(Number(params.get("id"))); }, [params]);
  const cols = [["open", "Open"], ["investigating", "Investigating"], ["resolved", "Resolved"]] as const;
  return (
    <div>
      <PageHeader eyebrow="Alerts & actions" title="Every alert explained, owned and tracked to resolution"
        subtitle="Unusual waits (EWMA control chart + IsolationForest on model residuals), persistent bottlenecks, priority breaches, scheduling issues and your own rules."
        actions={<>
          <Select value={kind} onChange={setKind} options={[{ value: "", label: "All alert types" }, ...Object.entries(KINDS).map(([v, l]) => ({ value: v, label: l }))]} />
          <Button onClick={() => setRuleOpen(true)}><Plus className="h-4 w-4" /> New rule</Button>
        </>} />
      {!data ? <Loading rows={3} /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          {cols.map(([st, label]) => {
            const rank: any = { high: 0, medium: 1, low: 2 }, conf: any = { High: 0, Medium: 1, Low: 2 };
            const items = data.filter((a) => a.status === st).sort((a, b) => rank[a.severity] - rank[b.severity] || conf[a.confidence] - conf[b.confidence]);
            return (
              <div key={st} className="rounded-2xl border border-line bg-surface2/60 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 text-sm font-bold"><StatusChip status={st} /> {label}</div>
                  <span className="text-xs font-semibold text-muted">{items.length}</span>
                </div>
                <div className="max-h-[calc(100vh-260px)] space-y-2.5 overflow-y-auto pr-1">
                  {items.map((a) => (
                    <button key={a.id} onClick={() => { setOpenId(a.id); setParams({ id: String(a.id) }); }}
                      className="focus-ring w-full rounded-xl border border-line bg-surface p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-card">
                      <div className="mb-1.5 flex items-center gap-2">
                        <SeverityDot s={a.severity} />
                        <Chip tone="neutral">{KINDS[a.kind] || a.kind}</Chip>
                        <span className="ml-auto"><ConfidenceBadge level={a.confidence} /></span>
                      </div>
                      <div className="text-sm font-semibold leading-snug">{a.title}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-muted">{a.summary}</div>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                        <span>{day(a.detected_at)}</span>{a.owner && <span>· {a.owner}</span>}
                      </div>
                    </button>
                  ))}
                  {!items.length && <div className="py-6 text-center text-xs text-muted">Nothing here</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <AlertDrawer id={openId} onClose={() => { setOpenId(null); setParams({}); }} />
      <RuleModal open={ruleOpen} onClose={() => setRuleOpen(false)} />
    </div>
  );
}

function AlertDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data: a } = useApi<any>(id ? `/alerts/${id}` : null);
  const { data: q } = useApi<any>("/investigate/queue");
  const toast = useToast();
  const [owner, setOwner] = useState("Department coordinator");
  const [due, setDue] = useState("2026-01-07");
  const [note, setNote] = useState("");
  const act = useAction((b: any) => post(`/alerts/${id}/actions`, b), () => toast({ title: "Alert updated", tone: "good" }));
  const dq = a?.department_id ? q?.departments.find((d: any) => d.department_id === a.department_id) : null;
  const trend = a && ["unusual_wait", "rule", "lbc_spike"].includes(a.kind) ? dq?.trend : null;
  const perTriage = a?.kind === "bottleneck" ? dq?.per_triage : null;
  return (
    <Drawer open={!!id} onClose={onClose} width={640} title={a?.title || "Loading…"}
      subtitle={a && <span className="flex items-center gap-2">{KINDS[a.kind]} · detected {dayTime(a.detected_at)} <StatusChip status={a.status} /></span>}>
      {!a ? <Loading rows={3} /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2"><SeverityDot s={a.severity} /><span className="text-sm font-semibold capitalize">{a.severity} severity</span><ConfidenceBadge level={a.confidence} /></div>
          <p className="text-sm">{a.summary}</p>
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Signals that fired</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries(a.signals).filter(([, v]) => typeof v !== "object").map(([k, v]) => (
                <div key={k} className="rounded-xl bg-surface2 px-3 py-2">
                  <div className="text-[11px] text-muted">{LABELS[k] || k.replace(/_/g, " ")}</div>
                  <div className="text-sm font-bold tnum">{typeof v === "boolean" ? (v ? "yes" : "no") : String(v)}</div>
                </div>
              ))}
            </div>
            {a.signals.by_type && (
              <div className="mt-3 overflow-hidden rounded-xl border border-line text-sm">
                {Object.entries(a.signals.by_type).map(([t, v]: any) => (
                  <div key={t} className="grid grid-cols-3 border-b border-line px-3 py-1.5 last:border-0 tnum">
                    <span>{t}</span><span className="text-right">Urgent {v.urgent} min</span><span className="text-right text-muted">Routine {v.routine} min</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {trend && (
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Weekly residual vs model (last 13 weeks)</div>
              <div className="h-40">
                <ResponsiveContainer>
                  <LineChart data={trend} margin={{ left: -20, right: 8, top: 8 }}>
                    <CartesianGrid {...grid} />
                    <XAxis dataKey="week" {...axis} tickFormatter={(w) => w.slice(5)} />
                    <YAxis {...axis} unit="m" />
                    <Tooltip content={<ChartTooltip unit=" min" />} />
                    <ReferenceLine y={0} stroke={C.neutral} />
                    {a.signals.ucl && <ReferenceLine y={a.signals.ucl} stroke={C.bad} strokeDasharray="4 4" label={{ value: "EWMA limit", fill: C.bad, fontSize: 10, position: "insideTopRight" }} />}
                    <Line dataKey="resid" name="Mean residual" stroke={C.brand} strokeWidth={2} dot={{ r: 2.5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {perTriage && (
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Wait by triage level: this department vs hospital</div>
              <div className="grid grid-cols-4 gap-2">{perTriage.map((t: any) => (
                <div key={t.triage} className="rounded-xl border border-line p-2.5 text-center">
                  <div className="text-[11px] text-muted">{t.triage}</div>
                  <div className="text-lg font-bold tnum">{t.wait?.toFixed(0)}<span className="text-xs text-muted"> vs {t.hospital?.toFixed(0)}</span></div>
                  <div className={`text-xs font-semibold ${t.excess > 0 ? "text-bad" : "text-good"}`}>{t.excess > 0 ? "+" : ""}{t.excess?.toFixed(1)} min</div>
                </div>
              ))}</div>
            </div>
          )}
          {a.suggested_action && <div className="rounded-xl border border-brand/30 bg-brand/5 p-3.5 text-sm"><b className="text-brand">Suggested action. </b>{a.suggested_action}</div>}
          {a.evidence_rows?.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Evidence: the rows behind this alert</div>
              <div className="max-h-56 overflow-auto rounded-xl border border-line text-xs">
                <table className="w-full">
                  <thead className="sticky top-0 bg-surface2 text-left text-muted"><tr>{Object.keys(a.evidence_rows[0]).map((k) => <th key={k} className="px-2.5 py-1.5 font-semibold">{k}</th>)}</tr></thead>
                  <tbody>{a.evidence_rows.map((r: any, i: number) => <tr key={i} className="border-t border-line">{Object.entries(r).map(([k, v]: any) => <td key={k} className="px-2.5 py-1.5 tnum">{String(k).includes("arrival") || k === "requested" ? dayTime(v) : String(v)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
          {a.status !== "resolved" && (
            <div className="rounded-2xl border border-line p-4">
              <div className="mb-3 text-sm font-bold">Take action</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Owner" value={owner} onChange={setOwner} options={["Department coordinator", "Ops manager", "Lab supervisor", "Nursing lead", "Pediatrics coordinator"].map((o) => ({ value: o, label: o }))} />
                <Input label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </div>
              <Input className="mt-3 w-full" label="Note" placeholder="What will be checked?" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button loading={act.isPending} onClick={() => act.mutate({ verb: "assign", owner, due_at: due + "T17:00:00", note: note || undefined })}>Assign</Button>
                <Button variant="secondary" onClick={() => act.mutate({ verb: "escalate", note: note || "Escalated" })}>Escalate</Button>
                <Button variant="secondary" onClick={() => act.mutate({ verb: "comment", note: note || "Reviewed" })}>Comment</Button>
                <Button variant="soft" onClick={() => act.mutate({ verb: "resolve", note: note || "Resolved" })}>Resolve</Button>
              </div>
            </div>
          )}
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Audit trail</div>
            <ol className="relative space-y-3 border-l border-line pl-4">
              <li className="text-xs"><span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full bg-neutral" /><b>Detected</b> · {dayTime(a.detected_at)}</li>
              {a.actions.map((x: any, i: number) => (
                <li key={i} className="text-xs"><span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full bg-brand" />
                  <b className="capitalize">{x.verb}</b> by {x.actor} · {day(x.at)} {time(x.at)}{x.note && <div className="text-muted">{x.note}</div>}</li>
              ))}
            </ol>
          </div>
          <DataNote>Alerts are generated from real 2025 encounters except running-late, coverage and overbooking alerts, which come from the simulated scheduling layer.</DataNote>
        </div>
      )}
    </Drawer>
  );
}

function RuleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [threshold, setThreshold] = useState("8");
  const [weeks, setWeeks] = useState("2");
  const add = useAction((b: any) => post("/alert-rules", b), (r: any) => { toast({ title: "Rule created", body: `${r.alerts_created} departments match in Oct–Dec`, tone: "good" }); onClose(); });
  return (
    <Modal open={open} onClose={onClose} title="New alert rule">
      <p className="mb-4 text-sm text-muted">Create an alert when a department's triage-adjusted excess wait stays above a threshold for consecutive weeks.</p>
      <div className="rounded-xl bg-surface2 p-4 text-sm">
        If <b>excess wait</b> &gt; <input className="mx-1 w-14 rounded-md border border-line bg-surface px-2 py-1 text-center" value={threshold} onChange={(e) => setThreshold(e.target.value)} /> min
        for <input className="mx-1 w-12 rounded-md border border-line bg-surface px-2 py-1 text-center" value={weeks} onChange={(e) => setWeeks(e.target.value)} /> consecutive weeks → create alert
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={add.isPending} onClick={() => add.mutate({ name: `Excess wait above ${threshold} min for ${weeks} weeks`, threshold: Number(threshold), window_weeks: Number(weeks) })}>Create rule</Button>
      </div>
    </Modal>
  );
}
