import { motion } from "framer-motion";
import { ArrowLeft, HeartPulse } from "lucide-react";
import { Link } from "react-router-dom";
import { useApi } from "@/lib/api";
import { day, time } from "@/lib/format";

export default function WaitBoard() {
  const { data } = useApi<any>("/public/wait-board", { refetchInterval: 15000 });
  return (
    <div className="min-h-full bg-[#0B1220] p-8 text-white">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#2CC5D2] to-[#818CF8]"><HeartPulse className="h-8 w-8" /></div>
          <div><div className="text-3xl font-extrabold tracking-tight">Live wait times</div><div className="text-lg text-white/60" style={{ fontFamily: "'Noto Sans Telugu', 'Noto Sans Devanagari', Inter, sans-serif" }}>ప్రత్యక్ష నిరీక్షణ సమయాలు · लाइव प्रतीक्षा समय</div></div>
        </div>
        <div className="text-right"><div className="text-5xl font-extrabold tnum">{data ? time(data.now) : "--:--"}</div><div className="text-white/60">{data && day(data.now, { weekday: "long", day: "numeric", month: "long" })} · {data?.shift} shift</div></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data?.departments || []).map((d: any, i: number) => (
          <motion.div key={d.department_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
            className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <div className="text-2xl font-bold">{d.department_name}</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#FF6369]/15 p-3"><div className="text-sm text-white/70">Urgent</div><div className="text-4xl font-extrabold tnum">{d.Urgent}<span className="text-lg font-semibold text-white/60"> min</span></div></div>
              <div className="rounded-2xl bg-[#2CC5D2]/15 p-3"><div className="text-sm text-white/70">Standard</div><div className="text-4xl font-extrabold tnum">{d.Standard}<span className="text-lg font-semibold text-white/60"> min</span></div></div>
            </div>
            <div className="mt-3 truncate text-sm text-white/60">{d.on_duty.length ? `On duty: ${d.on_duty.join(", ")}` : "Service desk open"}</div>
          </motion.div>
        ))}
      </div>
      <div className="mt-8 flex items-center justify-between text-sm text-white/50">
        <span>Estimates from our wait-time model. Urgent patients are always seen first. No personal data is shown. Synthetic demo data.</span>
        <Link to="/" className="flex items-center gap-1 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to app</Link>
      </div>
    </div>
  );
}
