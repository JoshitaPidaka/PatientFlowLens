import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type Role = "command" | "department" | "diagnostics" | "doctor" | "patient";

export interface Filters {
  date_from?: string;
  date_to?: string;
  department_id?: string;
  triage_level?: string;
  visit_type?: string;
}

interface AppState {
  role: Role;
  setRole: (r: Role) => void;
  departmentId: string;
  setDepartmentId: (d: string) => void;
  doctorId: string;
  setDoctorId: (d: string) => void;
  patientId: string;
  setPatientId: (p: string) => void;
  lang: string;
  setLang: (l: string) => void;
  dark: boolean;
  setDark: (b: boolean) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  paletteOpen: boolean;
  setPaletteOpen: (b: boolean) => void;
}

const Ctx = createContext<AppState>(null as any);

function persisted<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem("pfl:" + key);
      return raw ? (JSON.parse(raw) as T) : init;
    } catch {
      return init;
    }
  });
  const set = (x: T) => {
    setV(x);
    try {
      localStorage.setItem("pfl:" + key, JSON.stringify(x));
    } catch {}
  };
  return [v, set];
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = persisted<Role>("role", "command");
  const [departmentId, setDepartmentId] = persisted("dept", "D03");
  const [doctorId, setDoctorId] = persisted("doctor", "D03-01");
  const [patientId, setPatientId] = persisted("patient", "P01936");
  const [lang, setLang] = persisted("lang", "English");
  const [dark, setDark] = persisted("dark", false);
  const [filters, setFilters] = useState<Filters>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  const value = useMemo(
    () => ({ role, setRole, departmentId, setDepartmentId, doctorId, setDoctorId, patientId, setPatientId, lang, setLang,
      dark, setDark, filters, setFilters, paletteOpen, setPaletteOpen }),
    [role, departmentId, doctorId, patientId, lang, dark, filters, paletteOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
