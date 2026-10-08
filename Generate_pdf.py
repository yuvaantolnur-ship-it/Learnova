import json
import math
import re
import sys
from datetime import datetime
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    Flowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


PAGE_SIZE = landscape(A4)
NAVY = colors.HexColor("#14213d")
NAVY_LIGHT = colors.HexColor("#20365f")
TEAL = colors.HexColor("#0f8b8d")
TEAL_DARK = colors.HexColor("#0b686a")
ORANGE = colors.HexColor("#f28c28")
INK = colors.HexColor("#1e293b")
MUTED = colors.HexColor("#64748b")
LIGHT = colors.HexColor("#f3f6fa")
WHITE = colors.white
LINE = colors.HexColor("#e2e8f0")
PALE_TEAL = colors.HexColor("#e9f7f5")
PALE_ORANGE = colors.HexColor("#fff4e8")
PALE_BLUE = colors.HexColor("#edf3fb")


def normalize_subject(subject):
    """Return a display-safe label and expand numeric legacy subject IDs."""
    label = str(subject or "").strip()
    if not label:
        return "General Track"
    if label.isdigit():
        return f"Subject {label}"
    return label


def _valid_assessments(tests):
    if not isinstance(tests, list):
        return []

    valid = []
    for test in tests:
        if not isinstance(test, dict):
            continue
        try:
            score = float(test.get("score", 0))
            total = float(test.get("total", 0))
        except (TypeError, ValueError):
            continue
        if (
            not math.isfinite(score)
            or not math.isfinite(total)
            or total <= 0
            or score < 0
            or score > total
        ):
            continue
        valid.append({
            "subject": normalize_subject(test.get("subject")),
            "score": score,
            "total": total,
            "date": str(test.get("date") or "").strip(),
        })
    return valid


def _subject_statistics(tests):
    subjects = {}
    for test in _valid_assessments(tests):
        entry = subjects.setdefault(
            test["subject"],
            {"earned": 0.0, "possible": 0.0, "assessments": 0},
        )
        entry["earned"] += test["score"]
        entry["possible"] += test["total"]
        entry["assessments"] += 1

    for entry in subjects.values():
        entry["percentage"] = entry["earned"] / entry["possible"] * 100
    return subjects


def get_performance_summary(tests):
    """Return weighted average, subject count, strongest subject, and focus subject."""
    valid = _valid_assessments(tests)
    subjects = _subject_statistics(valid)
    earned = sum(test["score"] for test in valid)
    possible = sum(test["total"] for test in valid)
    average = earned / possible * 100 if possible else 0.0

    if not subjects:
        return average, 0, "No data yet", "No data yet"
    strongest = max(subjects, key=lambda subject: subjects[subject]["percentage"])
    weakest = min(subjects, key=lambda subject: subjects[subject]["percentage"])
    return average, len(subjects), strongest, weakest


def get_weakest_subject(tests):
    subjects = _subject_statistics(tests)
    if not subjects:
        return "General Review"
    return min(subjects, key=lambda subject: subjects[subject]["percentage"])


def _performance_band(score):
    if score >= 90:
        return "SCHOLAR"
    if score >= 80:
        return "ADVANCED"
    if score >= 70:
        return "PROFICIENT"
    if score >= 60:
        return "DEVELOPING"
    return "RECOVERY FOCUS"


def _paragraph(text, style):
    return Paragraph(escape(str(text)), style)


def _make_styles():
    base = getSampleStyleSheet()
    return {
        "brand": ParagraphStyle(
            "Brand", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=10, leading=12, textColor=TEAL, spaceAfter=5,
        ),
        "hero": ParagraphStyle(
            "Hero", parent=base["Heading1"], fontName="Helvetica-Bold",
            fontSize=25, leading=29, textColor=NAVY, spaceAfter=4,
        ),
        "hero_meta": ParagraphStyle(
            "HeroMeta", parent=base["Normal"], fontName="Helvetica",
            fontSize=9, leading=13, textColor=MUTED,
        ),
        "section": ParagraphStyle(
            "Section", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=14, leading=17, textColor=NAVY, spaceBefore=5,
            spaceAfter=8, keepWithNext=True,
        ),
        "kpi_label": ParagraphStyle(
            "KpiLabel", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=7, leading=9, textColor=MUTED,
        ),
        "kpi_value": ParagraphStyle(
            "KpiValue", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=14, leading=17, textColor=NAVY, wordWrap="CJK",
        ),
        "kpi_accent": ParagraphStyle(
            "KpiAccent", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=10, leading=13, textColor=TEAL_DARK, wordWrap="CJK",
        ),
        "table_header": ParagraphStyle(
            "TableHeader", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=8, leading=10, textColor=WHITE,
        ),
        "table_cell": ParagraphStyle(
            "TableCell", parent=base["Normal"], fontName="Helvetica",
            fontSize=9, leading=12, textColor=INK, wordWrap="CJK",
        ),
        "table_bold": ParagraphStyle(
            "TableBold", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=9, leading=12, textColor=NAVY, wordWrap="CJK",
        ),
        "card_title": ParagraphStyle(
            "CardTitle", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=9, leading=12, textColor=TEAL_DARK, spaceAfter=4,
        ),
        "card_body": ParagraphStyle(
            "CardBody", parent=base["Normal"], fontName="Helvetica",
            fontSize=8.5, leading=12, textColor=INK, wordWrap="CJK",
        ),
        "study_day": ParagraphStyle(
            "StudyDay", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=8, leading=10, textColor=TEAL_DARK,
        ),
        "study_body": ParagraphStyle(
            "StudyBody", parent=base["Normal"], fontName="Helvetica",
            fontSize=8, leading=11, textColor=INK, wordWrap="CJK",
        ),
        "small_muted": ParagraphStyle(
            "SmallMuted", parent=base["Normal"], fontName="Helvetica",
            fontSize=7.5, leading=10, textColor=MUTED,
        ),
    }


class ProgressBar(Flowable):
    def __init__(self, percentage, width=150, height=10):
        super().__init__()
        self.percentage = min(100.0, max(0.0, float(percentage)))
        self.width = width
        self.height = height

    def draw(self):
        self.canv.setFillColor(LIGHT)
        self.canv.roundRect(0, 1, self.width, self.height - 2, 4, fill=1, stroke=0)
        fill_width = self.width * self.percentage / 100
        if fill_width > 0:
            self.canv.setFillColor(TEAL if self.percentage >= 70 else ORANGE)
            self.canv.roundRect(0, 1, fill_width, self.height - 2, 4, fill=1, stroke=0)


def _draw_footer(canvas, doc):
    canvas.saveState()
    page_width, _ = PAGE_SIZE
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.6)
    canvas.line(doc.leftMargin, 27, page_width - doc.rightMargin, 27)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, 15, "Generated by Learnova Analytics Engine")
    canvas.drawRightString(page_width - doc.rightMargin, 15, f"{doc.page}")
    canvas.restoreState()


def _kpi_card(label, value, styles, accent=False, background=WHITE):
    value_style = styles["kpi_accent"] if accent else styles["kpi_value"]
    content = [
        _paragraph(label.upper(), styles["kpi_label"]),
        Spacer(1, 7),
        _paragraph(value, value_style),
    ]
    return Table(
        [[content]],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), background),
            ("BOX", (0, 0), (-1, -1), 0.6, LINE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ]),
    )


def _insight_card(title, body, styles, accent_color, background):
    return Table(
        [[[
            _paragraph(title.upper(), styles["card_title"]),
            _paragraph(body, styles["card_body"]),
        ]]],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), background),
            ("BOX", (0, 0), (-1, -1), 0.7, accent_color),
            ("LINEBEFORE", (0, 0), (0, -1), 3, accent_color),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 11),
            ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ]),
    )


def _weekly_card(day, focus, duration, body, styles):
    return Table(
        [[
            _paragraph(day.upper(), styles["study_day"]),
            _paragraph(focus, styles["small_muted"]),
            _paragraph(duration, styles["small_muted"]),
        ], [
            _paragraph(body, styles["study_body"]),
            "",
            "",
        ]],
        colWidths=[None, None, None],
        style=TableStyle([
            ("SPAN", (0, 1), (-1, 1)),
            ("BACKGROUND", (0, 0), (-1, -1), WHITE),
            ("BOX", (0, 0), (-1, -1), 0.6, LINE),
            ("LINEBEFORE", (0, 0), (0, -1), 3, TEAL),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (2, 0), (2, 0), "RIGHT"),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, 0), 8),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 3),
            ("TOPPADDING", (0, 1), (-1, 1), 2),
            ("BOTTOMPADDING", (0, 1), (-1, 1), 9),
        ]),
    )


def _safe_filename_part(value):
    part = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", str(value or "student")).strip()
    return part or "student"


def build_study_plan_pdf(username, data_matrix_string):
    try:
        payload = json.loads(data_matrix_string)
    except (json.JSONDecodeError, TypeError):
        payload = []
    tests = _valid_assessments(payload)
    subjects = _subject_statistics(tests)

    average, subject_count, strongest, weakest = get_performance_summary(tests)
    focus_subject = weakest if subject_count else "Add assessment scores"
    strongest_subject = strongest if subject_count else "No data yet"
    performance_band = _performance_band(average)
    assessment_count = len(tests)
    student_name = str(username or "Student").strip() or "Student"
    generated_date = datetime.now().strftime("%B %d, %Y")
    target_pdf = f"Learnova_Study_Plan_{_safe_filename_part(username)}.pdf"

    doc = SimpleDocTemplate(
        target_pdf,
        pagesize=PAGE_SIZE,
        rightMargin=34,
        leftMargin=34,
        topMargin=30,
        bottomMargin=40,
        title="Learnova Academic Performance Dashboard",
        author="Learnova Analytics Engine",
        subject=f"Academic performance dashboard for {student_name}",
    )
    styles = _make_styles()
    story = []

    hero = Table(
        [[
            [
                _paragraph("LEARNOVA", styles["brand"]),
                _paragraph("Academic Performance Dashboard", styles["hero"]),
                Paragraph(
                    f"Student: <b>{escape(student_name)}</b>"
                    f"&nbsp;&nbsp;&nbsp; | &nbsp;&nbsp;&nbsp; Generated: {escape(generated_date)}",
                    styles["hero_meta"],
                ),
            ],
            Paragraph(
                "LEARNING<br/>ANALYTICS",
                ParagraphStyle(
                    "HeroMark", parent=styles["brand"], fontSize=9,
                    leading=13, alignment=TA_RIGHT, textColor=WHITE,
                ),
            ),
        ]],
        colWidths=[650, 123],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), WHITE),
            ("BACKGROUND", (1, 0), (1, 0), NAVY),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (0, 0), 0),
            ("RIGHTPADDING", (0, 0), (0, 0), 12),
            ("LEFTPADDING", (1, 0), (1, 0), 10),
            ("RIGHTPADDING", (1, 0), (1, 0), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 12),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ("LINEBELOW", (0, 0), (-1, -1), 3, TEAL),
        ]),
    )
    story.extend([hero, Spacer(1, 15)])

    kpi_values = [
        _kpi_card("Overall Score", f"{average:.1f}%", styles, background=PALE_BLUE),
        _kpi_card("Assessments", str(assessment_count), styles, background=LIGHT),
        _kpi_card("Strongest Subject", strongest_subject, styles, accent=True, background=PALE_TEAL),
        _kpi_card("Focus Subject", focus_subject, styles, accent=True, background=PALE_ORANGE),
        _kpi_card("Performance Band", performance_band, styles, accent=True, background=WHITE),
    ]
    content_width = PAGE_SIZE[0] - doc.leftMargin - doc.rightMargin
    kpi_width = content_width / len(kpi_values)
    story.extend([
        Table(
            [kpi_values],
            colWidths=[kpi_width] * len(kpi_values),
            style=TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]),
        ),
        Spacer(1, 16),
        _paragraph("Subject Performance Analysis", styles["section"]),
    ])

    subject_rows = [[
        _paragraph("SUBJECT", styles["table_header"]),
        _paragraph("ASSESSMENTS", styles["table_header"]),
        _paragraph("SCORE", styles["table_header"]),
        _paragraph("PROGRESS", styles["table_header"]),
    ]]
    for subject, stats in sorted(
        subjects.items(),
        key=lambda item: (-item[1]["percentage"], item[0].casefold()),
    ):
        subject_rows.append([
            _paragraph(subject, styles["table_bold"]),
            _paragraph(str(stats["assessments"]), styles["table_cell"]),
            _paragraph(f'{stats["percentage"]:.1f}%', styles["table_bold"]),
            ProgressBar(stats["percentage"], width=330),
        ])
    if len(subject_rows) == 1:
        subject_rows.append([
            _paragraph("No assessment data yet", styles["table_cell"]), "", "", "",
        ])

    subject_table = Table(
        subject_rows,
        colWidths=[190, 90, 80, content_width - 360],
        repeatRows=1,
        hAlign="LEFT",
    )
    subject_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("BACKGROUND", (0, 1), (-1, -1), WHITE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 1), (2, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 9),
        ("TOPPADDING", (0, 1), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 7),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, LINE),
    ]))
    story.extend([subject_table, Spacer(1, 15)])

    story.append(_paragraph("Personalized Insights", styles["section"]))
    if subject_count:
        strength_copy = (
            f'{strongest_subject} is your leading subject at '
            f'{subjects[strongest_subject]["percentage"]:.1f}%. Keep using the '
            "study habits that are working well."
        )
        focus_copy = (
            f'{weakest} is the best area to focus on next at '
            f'{subjects[weakest]["percentage"]:.1f}%.'
        )
        recommendation = (
            f"Plan three short practice sessions for {weakest} this week. "
            "Review missed questions after each session and track the next score."
            if average < 85
            else "Maintain your steady routine and use one weekly mixed review to keep every subject fresh."
        )
    else:
        strength_copy = "Your strengths will appear here after you record an assessment."
        focus_copy = "Record scores by subject to identify where practice will help most."
        recommendation = "Add your first assessment, then use this dashboard to plan focused study sessions."

    card_width = content_width / 3
    insight_cards = [
        _insight_card("Strength", strength_copy, styles, TEAL, PALE_TEAL),
        _insight_card("Focus Area", focus_copy, styles, ORANGE, PALE_ORANGE),
        _insight_card("Recommendation", recommendation, styles, NAVY_LIGHT, PALE_BLUE),
    ]
    story.extend([
        Table(
            [insight_cards],
            colWidths=[card_width] * 3,
            style=TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]),
        ),
        Spacer(1, 15),
        _paragraph("Achievements", styles["section"]),
    ])

    achievement_cards = [
        _kpi_card("Assessments Completed", str(assessment_count), styles, background=PALE_BLUE),
        _kpi_card("Top Subject", strongest_subject, styles, accent=True, background=PALE_TEAL),
        _kpi_card("Average Score", f"{average:.1f}%", styles, background=PALE_ORANGE),
    ]
    story.append(Table(
        [achievement_cards],
        colWidths=[card_width] * 3,
        style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 2),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]),
    ))

    story.append(PageBreak())
    story.append(_paragraph("Weekly Study Plan", styles["section"]))
    story.append(_paragraph(
        f"A practical weekly rhythm with extra attention for {focus_subject}.",
        styles["small_muted"],
    ))
    story.append(Spacer(1, 9))

    focus_name = weakest if subject_count else "your selected subject"
    weekly_plan = [
        ("Monday", "Review & recall", "45 min",
         f"Review class notes for {focus_name}. Write down five key ideas from memory."),
        ("Tuesday", "Focused practice", "50 min",
         f"Complete practice questions in {focus_name}. Check each answer carefully."),
        ("Wednesday", "Keep it balanced", "40 min",
         "Review a second subject and revisit any classwork that needs finishing."),
        ("Thursday", "Build understanding", "45 min",
         f"Choose one tricky topic in {focus_name}. Explain it in your own words or draw a quick concept map."),
        ("Friday", "Weekly recap", "30 min",
         "Organize notes, review useful corrections, and list questions to ask in class."),
        ("Saturday", "Learn from mistakes", "60 min",
         f"Redo missed questions in {focus_name} without looking at the solutions first."),
        ("Sunday", "Check progress", "30 min",
         "Try a short mixed quiz, note one win and one next step, then take time to recharge."),
    ]
    weekly_cards = [
        _weekly_card(day, focus, duration, body, styles)
        for day, focus, duration, body in weekly_plan
    ]
    weekly_rows = [
        [weekly_cards[index], weekly_cards[index + 1]]
        for index in range(0, 6, 2)
    ]
    weekly_rows.append([weekly_cards[6], ""])
    plan_width = content_width
    plan_table = Table(
        weekly_rows,
        colWidths=[plan_width / 2 - 4, plan_width / 2 - 4],
        hAlign="LEFT",
        style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ]),
    )
    story.append(KeepTogether(plan_table))

    doc.build(story, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
    print(json.dumps({"success": True, "filename": target_pdf}))


if __name__ == "__main__" and len(sys.argv) > 2:
    build_study_plan_pdf(sys.argv[1], sys.argv[2])
