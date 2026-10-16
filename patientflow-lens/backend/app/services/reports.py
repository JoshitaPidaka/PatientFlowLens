"""One-click weekly operations report (PDF, reportlab)."""
import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.services import analytics

TEAL, NAVY = colors.HexColor("#0E9AA7"), colors.HexColor("#0F1B2D")


def weekly_pdf(alerts):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
                            title="PatientFlow Lens weekly operations report")
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], textColor=NAVY, alignment=0, fontSize=20)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], textColor=TEAL)
    body = ParagraphStyle("b", parent=ss["BodyText"], fontSize=9.5, leading=13)
    k = analytics.kpis()
    br = analytics.briefing()
    q = analytics.investigate_queue()["departments"]

    def table(rows, widths):
        t = Table(rows, colWidths=widths, repeatRows=1)
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                               ("FONTSIZE", (0, 0), (-1, -1), 8.5), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F6F8")]),
                               ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D6DEE4")), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
        return t

    story = [Paragraph("PatientFlow Lens · Weekly operations report", h1),
             Paragraph("Synthetic DATATHON data · not for clinical decisions", body), Spacer(1, 6),
             Paragraph("Briefing", h2), *[Paragraph("• " + line, body) for line in br["lines"]],
             Paragraph("Key numbers", h2),
             table([["Visits", "Median wait", "90th pct wait", "Left before care", "Admitted"],
                    [f"{k['visits']:,}", f"{k['median_wait']} min", f"{k['p90_wait']} min", f"{k['lbc_rate']}%", f"{k['admit_rate']}%"]],
                   [34 * mm] * 5),
             Paragraph("Investigate first (triage-adjusted)", h2),
             table([["Department", "Excess wait", "95% CI", "Confidence", "Extra patient-hours/yr"]] +
                   [[d["department_name"], f"{d['excess_wait']:+.1f} min", f"±{d['ci95']:.1f}", d["confidence"], f"{d['impact_hours']:.0f}"]
                    for d in q[:8]], [50 * mm, 28 * mm, 24 * mm, 28 * mm, 40 * mm]),
             Paragraph("Open alerts", h2),
             table([["Severity", "Alert", "Status", "Owner"]] +
                   [[a["severity"], Paragraph(a["title"], body), a["status"], a["owner"] or "—"] for a in alerts[:12]],
                   [20 * mm, 110 * mm, 22 * mm, 26 * mm])]
    doc.build(story)
    return buf.getvalue()
