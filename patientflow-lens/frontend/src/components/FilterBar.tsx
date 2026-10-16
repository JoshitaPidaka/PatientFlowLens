import { X } from "lucide-react";
import { useApi } from "@/lib/api";
import { qs } from "@/lib/api";
import { Filters, useApp } from "@/lib/state";
import { Button, Select } from "./ui";

export function useFilterQs(extra: Record<string, string | undefined> = {}) {
  const { filters } = useApp();
  return qs({ ...filters, ...extra });
}

export default function FilterBar() {
  const { filters, setFilters } = useApp();
  const { data: meta } = useApi<any>("/meta");
  const set = (k: keyof Filters, v: string) => setFilters({ ...filters, [k]: v || undefined });
  const active = Object.values(filters).some(Boolean);
  if (!meta) return null;
  return (
    <div className="mb-5 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-surface p-3 shadow-card">
      <label className="inline-flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">From</span>
        <input type="date" min="2025-01-01" max="2025-12-31" value={filters.date_from || ""} onChange={(e) => set("date_from", e.target.value)}
          className="focus-ring h-9 rounded-[10px] border border-line bg-surface px-2 text-sm" />
      </label>
      <label className="inline-flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">To</span>
        <input type="date" min="2025-01-01" max="2025-12-31" value={filters.date_to || ""} onChange={(e) => set("date_to", e.target.value)}
          className="focus-ring h-9 rounded-[10px] border border-line bg-surface px-2 text-sm" />
      </label>
      <Select label="Department" value={filters.department_id || ""} onChange={(v) => set("department_id", v)}
        options={[{ value: "", label: "All departments" }, ...meta.departments.map((d: any) => ({ value: d.department_id, label: d.department_name }))]} />
      <Select label="Triage" value={filters.triage_level || ""} onChange={(v) => set("triage_level", v)}
        options={[{ value: "", label: "All levels" }, ...meta.triage_levels.map((t: string) => ({ value: t, label: t }))]} />
      <Select label="Visit type" value={filters.visit_type || ""} onChange={(v) => set("visit_type", v)}
        options={[{ value: "", label: "All types" }, ...meta.visit_types.map((t: string) => ({ value: t, label: t }))]} />
      {active && <Button variant="ghost" size="sm" onClick={() => setFilters({})} className="mb-0.5"><X className="h-3.5 w-3.5" /> Clear</Button>}
      <span className="ml-auto self-center text-xs text-muted">Real 2025 encounters · filters apply to this page</span>
    </div>
  );
}
