export const fmtMin = (m?: number | null, d = 0) => (m === null || m === undefined ? "—" : `${m.toFixed(d)} min`);
export const fmtNum = (n?: number | null, d = 0) =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d });
export const signed = (n?: number | null, d = 1) => (n === null || n === undefined ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(d)}`);
export const time = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—");
export const day = (iso?: string | null, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", opts) : "—";
export const dayTime = (iso?: string | null) => (iso ? `${day(iso)}, ${time(iso)}` : "—");
export const initials = (name: string) =>
  name.replace("Dr. ", "").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
export const minutesBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const triageColor: Record<string, string> = {
  Critical: "bg-bad/15 text-bad ring-bad/30",
  High: "bg-warn/15 text-warn ring-warn/30",
  Medium: "bg-accent/12 text-accent ring-accent/30",
  Low: "bg-neutral/15 text-muted ring-neutral/30",
};
export const statusLabel: Record<string, string> = {
  booked: "Booked", confirmed: "Confirmed", checked_in: "Checked in", in_consultation: "In consultation",
  completed: "Completed", cancelled: "Cancelled", no_show: "No-show", left_before_care: "Left before care", rescheduled: "Rescheduled",
};
