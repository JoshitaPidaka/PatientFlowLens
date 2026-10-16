import { Download } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExcessBar, Sparkline, C } from "@/components/charts";
import WhyDrawer from "@/components/WhyDrawer";
import { Button, Card, ConfidenceBadge, DataNote, Loading, PageHeader, Segmented, TriageChip } from "@/components/ui";
import { useApi } from "@/lib/api";
import { signed } from "@/lib/format";

export default function Investigate() {
  const { data } = useApi<any>("/investigate/queue");
  const [why, setWhy] = useState<string | null>(null);
  const [view, setView] = useState<"dept" | "cell">("dept");
  const nav = useNavigate();
  return (
    <div>
      <PageHeader eyebrow="Investigate first" title="What should the operations team examine first?"
        subtitle="Departments ranked by extra patient-hours of waiting (triage-adjusted excess × volume), with a 95% confidence band. Grey = not distinguishable from noise."
        actions={<>
          <Segmented value={view} onChange={setView} options={[{ value: "dept", label: "Departments" }, { value: "cell", label: "Department × triage" }]} />
          <a href="/api/v1/export/bottlenecks.csv"><Button variant="secondary"><Download className="h-4 w-4" /> CSV</Button></a>
        </>} />
      {!data ? <Loading rows={4} /> : view === "dept" ? (
        <Card pad={false}>
          <div className="grid grid-cols-[40px_1.3fr_2fr_110px_120px_110px_130px] items-center gap-4 border-b border-line px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <span>#</span><span>Department</span><span>Excess wait vs triage mix (±95% CI)</span><span className="text-right">Impact</span>
            <span>Confidence</span><span className="text-right">p90 wait</span><span>13-week trend</span>
          </div>
          {data.departments.map((d: any, i: number) => (
            <button key={d.department_id} onClick={() => setWhy(d.department_id)}
              className="focus-ring grid w-full grid-cols-[40px_1.3fr_2fr_110px_120px_110px_130px] items-center gap-4 border-b border-line px-5 py-3 text-left transition last:border-0 hover:bg-surface2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-surface2 text-xs font-bold">{i + 1}</span>
              <div>
                <div className="font-semibold">{d.department_name}</div>
                <div className="text-xs text-muted">{d.encounters} visits · slower at {d.slower_levels}/4 levels</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1"><ExcessBar value={d.excess_wait} ci={d.ci95} confidence={d.confidence} /></div>
                <span className={`w-16 text-right text-sm font-bold tnum ${d.confidence === "Low" ? "text-muted" : d.excess_wait > 0 ? "text-bad" : "text-good"}`}>{signed(d.excess_wait)}m</span>
              </div>
              <div className="text-right"><div className="font-bold tnum">{d.impact_hours.toFixed(0)}</div><div className="text-[11px] text-muted">patient-h/yr</div></div>
              <ConfidenceBadge level={d.confidence} />
              <div className="text-right text-sm tnum">{d.p90_wait.toFixed(0)} min</div>
              <div className="h-8"><Sparkline data={d.trend} k="resid" color={d.excess_wait > 0 ? C.bad : C.good} /></div>
            </button>
          ))}
        </Card>
      ) : (
        <Card title="Where exactly? The 10 department × triage cells with the most extra waiting" subtitle="Excess = cell mean wait − hospital mean at the same triage level">
          <div className="divide-y divide-line">
            {data.cells.map((c: any) => (
              <button key={c.department_id + c.triage_level} onClick={() => setWhy(c.department_id)} className="focus-ring grid w-full grid-cols-[1.4fr_100px_2fr_100px_120px] items-center gap-4 py-3 text-left hover:bg-surface2">
                <span className="font-semibold">{c.department_name}</span>
                <TriageChip level={c.triage_level} />
                <ExcessBar value={c.excess_wait} ci={c.ci95} confidence={c.confidence} max={16} />
                <span className="text-right text-sm font-bold text-bad tnum">{signed(c.excess_wait)}m</span>
                <span className="text-right text-sm text-muted">{c.impact_hours.toFixed(0)} pt-h · {c.n} visits</span>
              </button>
            ))}
          </div>
        </Card>
      )}
      <div className="mt-4"><DataNote>
        Method: expected wait = hospital mean wait for each patient's triage level, averaged over the department's patients. Excess = actual − expected.
        Impact = max(excess, 0) × visits ÷ 60. Confidence: High if |excess| &gt; 2× the 95% CI half-width, Medium if &gt; 1×, else Low. Real 2025 encounters.
      </DataNote></div>
      <WhyDrawer departmentId={why} onClose={() => setWhy(null)} onAction={() => nav("/command/alerts")} />
    </div>
  );
}
