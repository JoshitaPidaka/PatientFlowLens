"""Writable state (SQLite by default). Analytics on the original CSVs run on pandas frames in app.store."""
from datetime import date as Date

from pydantic import NaiveDatetime
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, Session, SQLModel, create_engine

from app.config import DB_PATH

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


def get_session():
    with Session(engine) as s:
        yield s


class Doctor(SQLModel, table=True):
    doctor_id: str = Field(primary_key=True)
    name: str
    department_id: str = Field(index=True)
    department_name: str
    languages: list = Field(sa_column=Column(JSON))
    years_experience: int
    consult_room: str
    avg_consult_min: int
    gender: str
    kind: str = "doctor"  # doctor | desk (Pharmacy / Admissions service desks)
    simulated: bool = True


class RosterEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    doctor_id: str = Field(index=True)
    department_id: str = Field(index=True)
    date: Date = Field(index=True)
    shift: str
    status: str = "scheduled"  # scheduled | leave
    simulated: bool = True


class SessionSlot(SQLModel, table=True):
    """One bookable slot inside a doctor's session (only generated for the demo window)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    doctor_id: str = Field(index=True)
    department_id: str = Field(index=True)
    date: Date = Field(index=True)
    shift: str
    start: NaiveDatetime = Field(index=True)
    end: NaiveDatetime
    kind: str = "bookable"     # bookable | walkin_reserve
    status: str = "free"       # free | held | booked | blocked
    held_until: Optional[NaiveDatetime] = None


class Appointment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    patient_id: str = Field(index=True)
    doctor_id: str = Field(index=True)
    department_id: str = Field(index=True)
    slot_id: Optional[int] = Field(default=None, index=True)
    slot_start: NaiveDatetime = Field(index=True)
    slot_end: NaiveDatetime
    visit_type: str
    reason: Optional[str] = None
    status: str = Field(index=True)
    booked_at: NaiveDatetime
    lead_days: int = 0
    encounter_id: Optional[str] = Field(default=None, index=True)
    parent_appointment_id: Optional[int] = None
    predicted_wait: Optional[float] = None
    predicted_p10: Optional[float] = None
    predicted_p90: Optional[float] = None
    checked_in_at: Optional[NaiveDatetime] = None
    started_at: Optional[NaiveDatetime] = None
    completed_at: Optional[NaiveDatetime] = None
    source: str = "historical"  # historical | simulated | seeded | app
    simulated: bool = True


class AppointmentEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    appointment_id: int = Field(index=True)
    from_status: Optional[str] = None
    to_status: str
    actor: str
    at: NaiveDatetime
    note: Optional[str] = None


class EncounterDoctor(SQLModel, table=True):
    encounter_id: str = Field(primary_key=True)
    doctor_id: str = Field(index=True)
    simulated: bool = True


class WaitlistEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    patient_id: str = Field(index=True)
    department_id: str
    doctor_id: Optional[str] = None
    earliest: Date
    latest: Date
    status: str = "waiting"  # waiting | offered | accepted | expired
    offered_slot_id: Optional[int] = None
    offered_until: Optional[NaiveDatetime] = None
    created_at: NaiveDatetime


class LeaveRequest(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    doctor_id: str = Field(index=True)
    from_date: Date
    to_date: Date
    reason: str
    status: str = "pending"  # pending | approved | rejected
    created_at: NaiveDatetime
    decided_at: Optional[NaiveDatetime] = None


class Notification(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_key: str = Field(index=True)  # e.g. patient:P00001, doctor:D03-01, role:ops
    kind: str
    title: str
    body: str
    payload: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: NaiveDatetime
    read: bool = False


class Feedback(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    appointment_id: int = Field(index=True)
    stars: int
    tags: list = Field(default_factory=list, sa_column=Column(JSON))
    comment: Optional[str] = None
    created_at: NaiveDatetime


class Alert(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    kind: str  # unusual_wait | priority_breach | lbc_spike | overbooked | coverage_gap | rule
    department_id: Optional[str] = None
    test_type: Optional[str] = None
    severity: str  # high | medium | low
    confidence: str  # High | Medium | Low
    title: str
    summary: str
    signals: dict = Field(default_factory=dict, sa_column=Column(JSON))
    evidence: dict = Field(default_factory=dict, sa_column=Column(JSON))
    suggested_action: Optional[str] = None
    status: str = "open"  # open | investigating | resolved
    owner: Optional[str] = None
    due_at: Optional[NaiveDatetime] = None
    detected_at: NaiveDatetime
    resolved_at: Optional[NaiveDatetime] = None


class AlertAction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    alert_id: int = Field(index=True)
    actor: str
    verb: str  # assign | comment | escalate | status | resolve
    note: Optional[str] = None
    at: NaiveDatetime


class AlertRule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    metric: str  # excess_wait | p90_wait | lbc_rate
    threshold: float
    window_weeks: int = 2
    enabled: bool = True


class TurnaroundTarget(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    test_type: str
    priority: str
    target_minutes: int


class Setting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: dict = Field(sa_column=Column(JSON))


def init_db(drop=False):
    if drop:
        SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
