import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Shell from "./components/Shell";
import { Loading } from "./components/ui";
import { useApp } from "./lib/state";
import { NAV } from "./components/Shell";

const P = {
  Overview: lazy(() => import("./pages/command/Overview")),
  Investigate: lazy(() => import("./pages/command/Investigate")),
  Alerts: lazy(() => import("./pages/command/Alerts")),
  Roster: lazy(() => import("./pages/command/Roster")),
  Forecasts: lazy(() => import("./pages/command/Forecasts")),
  WhatIf: lazy(() => import("./pages/command/WhatIf")),
  Insights: lazy(() => import("./pages/command/Insights")),
  Sessions: lazy(() => import("./pages/department/Sessions")),
  LiveBoard: lazy(() => import("./pages/department/LiveBoard")),
  MyDepartment: lazy(() => import("./pages/department/MyDepartment")),
  Journeys: lazy(() => import("./pages/department/Journeys")),
  Estimator: lazy(() => import("./pages/department/Estimator")),
  Diagnostics: lazy(() => import("./pages/diagnostics/Diagnostics")),
  DoctorToday: lazy(() => import("./pages/doctor/Today")),
  Timetable: lazy(() => import("./pages/doctor/Timetable")),
  DoctorPatients: lazy(() => import("./pages/doctor/Patients")),
  Leave: lazy(() => import("./pages/doctor/Leave")),
  DoctorStats: lazy(() => import("./pages/doctor/Stats")),
  PatientHome: lazy(() => import("./pages/patient/Home")),
  FindDoctor: lazy(() => import("./pages/patient/FindDoctor")),
  Book: lazy(() => import("./pages/patient/Book")),
  Appointments: lazy(() => import("./pages/patient/Appointments")),
  Ticket: lazy(() => import("./pages/patient/Ticket")),
  Visits: lazy(() => import("./pages/patient/Visits")),
  WaitBoard: lazy(() => import("./pages/shared/WaitBoard")),
  DataTrust: lazy(() => import("./pages/shared/DataTrust")),
  ModelCard: lazy(() => import("./pages/shared/ModelCard")),
};

export default function App() {
  const { role } = useApp();
  return (
    <Suspense fallback={<div className="p-8"><Loading /></div>}>
      <Routes>
        <Route path="/waitboard" element={<P.WaitBoard />} />
        <Route path="*" element={
          <Shell>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Navigate to={NAV[role].items[0].to} replace />} />
                <Route path="/command" element={<P.Overview />} />
                <Route path="/command/investigate" element={<P.Investigate />} />
                <Route path="/command/alerts" element={<P.Alerts />} />
                <Route path="/command/roster" element={<P.Roster />} />
                <Route path="/command/forecasts" element={<P.Forecasts />} />
                <Route path="/command/whatif" element={<P.WhatIf />} />
                <Route path="/command/insights" element={<P.Insights />} />
                <Route path="/department" element={<P.Sessions />} />
                <Route path="/department/live" element={<P.LiveBoard />} />
                <Route path="/department/overview" element={<P.MyDepartment />} />
                <Route path="/department/journeys" element={<P.Journeys />} />
                <Route path="/department/estimator" element={<P.Estimator />} />
                <Route path="/diagnostics" element={<P.Diagnostics />} />
                <Route path="/doctor" element={<P.DoctorToday />} />
                <Route path="/doctor/timetable" element={<P.Timetable />} />
                <Route path="/doctor/patients" element={<P.DoctorPatients />} />
                <Route path="/doctor/leave" element={<P.Leave />} />
                <Route path="/doctor/stats" element={<P.DoctorStats />} />
                <Route path="/patient" element={<P.PatientHome />} />
                <Route path="/patient/doctors" element={<P.FindDoctor />} />
                <Route path="/patient/book" element={<P.Book />} />
                <Route path="/patient/appointments" element={<P.Appointments />} />
                <Route path="/patient/ticket/:id" element={<P.Ticket />} />
                <Route path="/patient/visits" element={<P.Visits />} />
                <Route path="/trust" element={<P.DataTrust />} />
                <Route path="/model" element={<P.ModelCard />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </Shell>
        } />
      </Routes>
    </Suspense>
  );
}
