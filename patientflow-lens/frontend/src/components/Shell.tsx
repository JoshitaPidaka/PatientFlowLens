import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, AlarmClock, BarChart3, Bell, BookOpenCheck, Brain, CalendarClock, CalendarDays, CalendarPlus, ClipboardList,
  Compass, FlaskConical, Gauge, HeartPulse, History, Home, LineChart, ListChecks, Monitor, Moon, MoveRight, Radar,
  RotateCcw, Search, ShieldCheck, Sparkles, Stethoscope, Sun, Timer, UserRound, Users, Wand2,
} from "lucide-react";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { post, useAction, useApi } from "@/lib/api";
import { dayTime, time } from "@/lib/format";
import { Role, useApp } from "@/lib/state";
import { Button, cx, Drawer } from "./ui";

type Item = { to: string; label: string; icon: ReactNode; end?: boolean };

export const NAV: Record<Role, { title: string; color: string; icon: ReactNode; items: Item[] }> = {
  command: {
    title: "Operations", color: "from-brand to-accent", icon: <Gauge className="h-4 w-4" />,
    items: [
      { to: "/command", label: "Overview", icon: <Home className="h-4 w-4" />, end: true },
      { to: "/command/investigate", label: "Investigate first", icon: <Radar className="h-4 w-4" /> },
      { to: "/command/alerts", label: "Alerts & actions", icon: <Bell className="h-4 w-4" /> },
      { to: "/command/roster", label: "Roster & appointments", icon: <CalendarClock className="h-4 w-4" /> },
      { to: "/command/forecasts", label: "Forecasts", icon: <LineChart className="h-4 w-4" /> },
      { to: "/command/whatif", label: "What-if simulator", icon: <Wand2 className="h-4 w-4" /> },
      { to: "/command/insights", label: "Insights & reports", icon: <BarChart3 className="h-4 w-4" /> },
    ],
  },
  department: {
    title: "Department", color: "from-accent to-brand", icon: <Compass className="h-4 w-4" />,
    items: [
      { to: "/department", label: "Sessions board", icon: <ClipboardList className="h-4 w-4" />, end: true },
      { to: "/department/live", label: "Live board", icon: <Activity className="h-4 w-4" /> },
      { to: "/department/overview", label: "My department", icon: <Gauge className="h-4 w-4" /> },
      { to: "/department/journeys", label: "Patient journeys", icon: <MoveRight className="h-4 w-4" /> },
      { to: "/department/estimator", label: "Wait estimator", icon: <Timer className="h-4 w-4" /> },
    ],
  },
  diagnostics: {
    title: "Diagnostics", color: "from-warn to-bad", icon: <FlaskConical className="h-4 w-4" />,
    items: [{ to: "/diagnostics", label: "Turnaround monitor", icon: <FlaskConical className="h-4 w-4" />, end: true }],
  },
  doctor: {
    title: "Doctor", color: "from-good to-brand", icon: <Stethoscope className="h-4 w-4" />,
    items: [
      { to: "/doctor", label: "Today", icon: <ListChecks className="h-4 w-4" />, end: true },
      { to: "/doctor/timetable", label: "My timetable", icon: <CalendarDays className="h-4 w-4" /> },
      { to: "/doctor/patients", label: "Patient history", icon: <History className="h-4 w-4" /> },
      { to: "/doctor/leave", label: "Leave & availability", icon: <AlarmClock className="h-4 w-4" /> },
      { to: "/doctor/stats", label: "My stats", icon: <BarChart3 className="h-4 w-4" /> },
    ],
  },
  patient: {
    title: "Patient", color: "from-brand to-good", icon: <HeartPulse className="h-4 w-4" />,
    items: [
      { to: "/patient", label: "Home", icon: <Home className="h-4 w-4" />, end: true },
      { to: "/patient/doctors", label: "Find a doctor", icon: <Search className="h-4 w-4" /> },
      { to: "/patient/book", label: "Book", icon: <CalendarPlus className="h-4 w-4" /> },
      { to: "/patient/appointments", label: "My appointments", icon: <CalendarDays className="h-4 w-4" /> },
      { to: "/patient/visits", label: "Visits & feedback", icon: <BookOpenCheck className="h-4 w-4" /> },
    ],
  },
};

const SHARED: Item[] = [
  { to: "/trust", label: "Data trust centre", icon: <ShieldCheck className="h-4 w-4" /> },
  { to: "/model", label: "Model card", icon: <Brain className="h-4 w-4" /> },
  { to: "/waitboard", label: "Waiting-room TV", icon: <Monitor className="h-4 w-4" /> },
];

const ROLES: { r: Role; label: string; icon: ReactNode }[] = [
  { r: "command", label: "Operations", icon: <Gauge className="h-4 w-4" /> },
  { r: "department", label: "Department", icon: <Compass className="h-4 w-4" /> },
  { r: "diagnostics", label: "Diagnostics", icon: <FlaskConical className="h-4 w-4" /> },
  { r: "doctor", label: "Doctor", icon: <Stethoscope className="h-4 w-4" /> },
  { r: "patient", label: "Patient", icon: <UserRound className="h-4 w-4" /> },
];

export function userKey(role: Role, a: ReturnType<typeof useApp>) {
  return role === "patient" ? `patient:${a.patientId}` : role === "doctor" ? `doctor:${a.doctorId}` : role === "department" ? `dept:${a.departmentId}` : "role:ops";
}

export default function Shell({ children }: { children: ReactNode }) {
  const app = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const { data: meta } = useApi<any>("/meta");
  const [notifOpen, setNotifOpen] = useState(false);
  const key = userKey(app.role, app);
  const { data: notes } = useApi<any[]>(`/notifications?user_key=${encodeURIComponent(key)}`, { refetchInterval: 8000 });
  const unread = (notes || []).filter((n) => !n.read).length;
  const clock = useAction((m: number | null) => post("/clock", m === null ? { reset: true } : { minutes: m }));

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        app.setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  const switchRole = (r: Role) => {
    app.setRole(r);
    nav(NAV[r].items[0].to);
  };
  const section = NAV[app.role];

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="hidden w-[248px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-accent text-white shadow-sm">
            <HeartPulse className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[15px] font-extrabold tracking-tight">PatientFlow Lens</div>
            <div className="text-[11px] text-muted">The Forgotten Patient · Track 1</div>
          </div>
        </div>
        <div className="mx-3 mb-3 rounded-xl border border-line bg-surface2 p-1">
          <div className="grid grid-cols-5 gap-1">
            {ROLES.map((x) => (
              <button key={x.r} title={x.label} onClick={() => switchRole(x.r)} aria-label={x.label}
                className={cx("focus-ring grid h-9 place-items-center rounded-lg transition", app.role === x.r ? "bg-surface text-brand shadow-sm" : "text-muted hover:text-ink")}>
                {x.icon}
              </button>
            ))}
          </div>
          <div className="px-1 pb-0.5 pt-1.5 text-center text-[11px] font-semibold text-muted">{section.title} workspace</div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {section.items.map((i) => <SideLink key={i.to} {...i} />)}
          <div className="px-3 pb-1 pt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted/80">Shared</div>
          {SHARED.map((i) => <SideLink key={i.to} {...i} />)}
        </nav>
        <div className="m-3 rounded-xl border border-dashed border-line p-3 text-[11px] leading-relaxed text-muted">
          <b className="text-ink">Synthetic DATATHON data.</b> Not for clinical decisions. Doctors, rosters & slots are simulated from the provided data.
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-2 border-b border-line bg-surface/85 px-3 py-2 backdrop-blur sm:gap-3 lg:px-6">
          <div className="flex gap-1 lg:hidden">
            {ROLES.map((x) => (
              <button key={x.r} onClick={() => switchRole(x.r)} className={cx("grid h-9 w-9 place-items-center rounded-lg", app.role === x.r ? "bg-brand/10 text-brand" : "text-muted")}>{x.icon}</button>
            ))}
          </div>
          <IdentityPicker meta={meta} />
          <button onClick={() => app.setPaletteOpen(true)}
            className="focus-ring hidden h-9 min-w-[220px] items-center gap-2 rounded-[10px] border border-line bg-surface2 px-3 text-sm text-muted hover:text-ink md:flex">
            <Search className="h-4 w-4" /> Search patients, pages… <kbd className="ml-auto rounded border border-line bg-surface px-1.5 text-[10px]">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-1 rounded-[10px] border border-line bg-surface px-1 py-1 sm:flex" title="Demo clock: the scheduling layer runs on Mon 5 Jan 2026">
              <span className="flex items-center gap-1.5 px-2 text-xs font-semibold"><CalendarClock className="h-3.5 w-3.5 text-brand" />{meta ? dayTime(meta.now) : "…"}</span>
              <Button size="sm" variant="soft" onClick={() => clock.mutate(15)} title="Advance the demo clock by 15 minutes">+15 min</Button>
              <button className="focus-ring rounded-md p-1.5 text-muted hover:bg-surface2" title="Reset clock to 10:30" onClick={() => clock.mutate(null)}><RotateCcw className="h-3.5 w-3.5" /></button>
            </div>
            <button aria-label="Notifications" onClick={() => setNotifOpen(true)} className="focus-ring relative grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-surface text-muted hover:text-ink">
              <Bell className="h-4 w-4" />
              {unread > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-bold text-white">{unread}</span>}
            </button>
            <button aria-label="Toggle theme" onClick={() => app.setDark(!app.dark)} className="focus-ring grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-surface text-muted hover:text-ink">
              {app.dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="wait">
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
              className="mx-auto max-w-[1440px] px-4 py-6 lg:px-8">
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <Notifications open={notifOpen} onClose={() => setNotifOpen(false)} notes={notes || []} />
      <Palette meta={meta} />
    </div>
  );
}

function SideLink({ to, label, icon, end }: Item) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => cx("focus-ring group flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium transition",
        isActive ? "bg-brand/10 text-brand" : "text-muted hover:bg-surface2 hover:text-ink")}>
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

function IdentityPicker({ meta }: { meta: any }) {
  const a = useApp();
  if (!meta) return null;
  const sel = "focus-ring h-9 rounded-[10px] border border-line bg-surface px-2.5 text-sm font-medium";
  if (a.role === "department")
    return (
      <select aria-label="Department" className={sel} value={a.departmentId} onChange={(e) => a.setDepartmentId(e.target.value)}>
        {meta.departments.map((d: any) => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
      </select>
    );
  if (a.role === "doctor")
    return (
      <select aria-label="Doctor" className={sel} value={a.doctorId} onChange={(e) => a.setDoctorId(e.target.value)}>
        {meta.doctors.filter((d: any) => d.kind === "doctor").map((d: any) => <option key={d.doctor_id} value={d.doctor_id}>{d.name} · {d.department_name}</option>)}
      </select>
    );
  if (a.role === "patient")
    return (
      <div className="flex gap-2">
        <select aria-label="Patient" className={sel} value={a.patientId} onChange={(e) => {
          a.setPatientId(e.target.value);
          const f = meta.featured_patients.find((p: any) => p.patient_id === e.target.value);
          if (f) a.setLang(f.language);
        }}>
          {meta.featured_patients.map((p: any) => <option key={p.patient_id} value={p.patient_id}>{p.patient_id} · {p.age}y · {p.language}</option>)}
          {!meta.featured_patients.some((p: any) => p.patient_id === a.patientId) && <option value={a.patientId}>{a.patientId}</option>}
        </select>
        <select aria-label="Language" className={sel} value={a.lang} onChange={(e) => a.setLang(e.target.value)}>
          <option>English</option><option value="Hindi">हिन्दी</option><option value="Telugu">తెలుగు</option>
        </select>
      </div>
    );
  return <div className="hidden items-center gap-2 text-sm font-semibold text-muted md:flex"><Users className="h-4 w-4" />{NAV[a.role].title}</div>;
}

function Notifications({ open, onClose, notes }: { open: boolean; onClose: () => void; notes: any[] }) {
  const read = useAction((id: number) => post(`/notifications/${id}/read`));
  return (
    <Drawer open={open} onClose={onClose} title="Notifications" subtitle="In-app only. No SMS or WhatsApp is sent." width={420}>
      {!notes.length && <div className="py-10 text-center text-sm text-muted">You're all caught up.</div>}
      <div className="space-y-2">
        {notes.map((n) => (
          <button key={n.id} onClick={() => !n.read && read.mutate(n.id)}
            className={cx("w-full rounded-xl border p-3 text-left transition", n.read ? "border-line bg-surface" : "border-brand/30 bg-brand/5")}>
            <div className="flex items-center gap-2">
              {!n.read && <span className="h-2 w-2 rounded-full bg-brand" />}
              <span className="text-sm font-semibold">{n.title}</span>
              <span className="ml-auto text-[11px] text-muted">{time(n.created_at)}</span>
            </div>
            <div className="mt-1 text-xs text-muted">{n.body}</div>
          </button>
        ))}
      </div>
    </Drawer>
  );
}

function Palette({ meta }: { meta: any }) {
  const a = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const { data: pts } = useApi<any[]>(q.length >= 2 ? `/patients?q=${encodeURIComponent(q)}&limit=8` : null);
  const pages = useMemo(() => (Object.keys(NAV) as Role[]).flatMap((r) => NAV[r].items.map((i) => ({ ...i, role: r, group: NAV[r].title }))).concat(
    SHARED.map((i) => ({ ...i, role: a.role, group: "Shared" }))), [a.role]);
  if (!a.paletteOpen) return null;
  const go = (to: string, role?: Role) => {
    if (role) a.setRole(role);
    nav(to);
    a.setPaletteOpen(false);
    setQ("");
  };
  const item = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-brand/10 aria-selected:text-brand";
  return (
    <div className="fixed inset-0 z-[70] bg-[#0B1220]/45 p-4 pt-[12vh] backdrop-blur-[2px]" onClick={() => a.setPaletteOpen(false)}>
      <Command label="Command palette" className="mx-auto max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && a.setPaletteOpen(false)}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="h-4 w-4 text-muted" />
          <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="Jump to a page, patient (P01936), department or doctor…" className="h-12 flex-1 bg-transparent text-sm outline-none" />
        </div>
        <Command.List className="max-h-[52vh] overflow-y-auto p-2">
          <Command.Empty className="p-4 text-sm text-muted">No results.</Command.Empty>
          {pts && pts.length > 0 && (
            <Command.Group heading="Patients" className="text-[11px] font-semibold text-muted">
              {pts.map((p) => (
                <Command.Item key={p.patient_id} value={`patient ${p.patient_id}`} onSelect={() => go(`/department/journeys?patient=${p.patient_id}`, "department")} className={item}>
                  <UserRound className="h-4 w-4" /> {p.patient_id} <span className="text-muted">· {p.age}y {p.sex} · {p.visits} visits</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          <Command.Group heading="Pages" className="text-[11px] font-semibold text-muted">
            {pages.map((p) => (
              <Command.Item key={p.group + p.to} value={`${p.group} ${p.label}`} onSelect={() => go(p.to, p.role)} className={item}>
                {p.icon} {p.label} <span className="ml-auto text-xs text-muted">{p.group}</span>
              </Command.Item>
            ))}
          </Command.Group>
          {meta && (
            <Command.Group heading="Doctors" className="text-[11px] font-semibold text-muted">
              {meta.doctors.filter((d: any) => d.kind === "doctor").map((d: any) => (
                <Command.Item key={d.doctor_id} value={`doctor ${d.name} ${d.department_name}`} onSelect={() => { a.setDoctorId(d.doctor_id); go("/doctor/timetable", "doctor"); }} className={item}>
                  <Stethoscope className="h-4 w-4" /> {d.name} <span className="text-muted">· {d.department_name}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          <Command.Group heading="Actions" className="text-[11px] font-semibold text-muted">
            <Command.Item value="toggle dark mode theme" onSelect={() => { a.setDark(!a.dark); a.setPaletteOpen(false); }} className={item}><Sparkles className="h-4 w-4" /> Toggle dark mode</Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
