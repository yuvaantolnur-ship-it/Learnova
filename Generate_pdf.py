import sys
import json
from xml.sax.saxutils import escape
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

NAVY = colors.HexColor('#172554')
INK = colors.HexColor('#1e293b')
MUTED = colors.HexColor('#64748b')
PALE_BLUE = colors.HexColor('#eff6ff')
PALE_TEAL = colors.HexColor('#f0fdfa')


def get_performance_summary(tests):
    subject_map = {}
    earned = 0
    possible = 0
    for test in tests:
        try:
            score = float(test.get("score", 0))
            total = float(test.get("total", 0))
        except (TypeError, ValueError):
            continue
        if total <= 0 or score < 0 or score > total:
            continue

        earned += score
        possible += total
        subject = str(test.get("subject") or "General Track").strip() or "General Track"
        subject_map.setdefault(subject, {"earned": 0, "possible": 0})
        subject_map[subject]["earned"] += score
        subject_map[subject]["possible"] += total

    averages = {
        subject: data["earned"] / data["possible"] * 100
        for subject, data in subject_map.items()
        if data["possible"] > 0
    }
    strongest = max(averages, key=averages.get) if averages else "Not enough data"
    weakest = min(averages, key=averages.get) if averages else "Not enough data"
    average = earned / possible * 100 if possible else 0
    return average, len(averages), strongest, weakest


def draw_page_footer(canvas, doc):
    canvas.saveState()
    page_width, _ = landscape(A4)
    canvas.setStrokeColor(colors.HexColor('#e2e8f0'))
    canvas.line(doc.leftMargin, 27, page_width - doc.rightMargin, 27)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, 15, "LEARNOVA  |  PERSONALIZED LEARNING")
    canvas.drawRightString(page_width - doc.rightMargin, 15, f"Page {doc.page}")
    canvas.restoreState()


def get_weakest_subject(tests):
    if not tests:
        return "General Review"
    subject_map = {}
    for t in tests:
        sub = str(t.get("subject") or "General Domain").strip()
        if not sub: continue
        try:
            score = float(t.get("score", 0))
            total = float(t.get("total", 0))
        except (TypeError, ValueError):
            continue
        if total <= 0 or score < 0 or score > total: continue
        
        if sub not in subject_map:
            subject_map[sub] = {"earned": 0, "possible": 0}
        subject_map[sub]["earned"] += score
        subject_map[sub]["possible"] += total

    averages = {s: (data["earned"] / data["possible"]) for s, data in subject_map.items()}
    if not averages:
        return "General Review"
    return min(averages, key=averages.get)

def build_study_plan_pdf(username, data_matrix_string):
    try:
        tests = json.loads(data_matrix_string)
    except Exception:
        tests = []

    target_pdf = f"Learnova_Study_Plan_{username}.pdf"
    
    # Establish structural layout canvas dimensions (A4 Landscape)
    doc = SimpleDocTemplate(
        target_pdf,
        pagesize=landscape(A4),
        rightMargin=36, leftMargin=36, topMargin=32, bottomMargin=42
    )
    story = []
    styles = getSampleStyleSheet()

    # Premium Analytical Typography Styles
    title_style = ParagraphStyle(
        'DocTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=23,
        textColor=NAVY, alignment=1, spaceAfter=4
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle', parent=styles['Normal'], fontName='Helvetica', fontSize=10,
        textColor=MUTED, alignment=1, spaceAfter=16
    )
    section_style = ParagraphStyle(
        'SectionHeading', parent=styles['Heading2'], fontName='Helvetica-Bold',
        fontSize=13, textColor=NAVY, spaceBefore=10, spaceAfter=8
    )
    metric_label_style = ParagraphStyle(
        'MetricLabel', parent=styles['Normal'], fontName='Helvetica-Bold',
        fontSize=8, textColor=MUTED, alignment=1
    )
    metric_value_style = ParagraphStyle(
        'MetricValue', parent=styles['Normal'], fontName='Helvetica-Bold',
        fontSize=16, textColor=NAVY, alignment=1
    )
    th_style = ParagraphStyle('TH', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, textColor=colors.white, alignment=0)
    td_day_style = ParagraphStyle('TDDay', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, textColor=INK, alignment=0)
    td_task_style = ParagraphStyle('TDTask', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=13, textColor=INK, alignment=0)

    # Document Header Generation
    story.append(Paragraph("LEARNOVA DYNAMIC STUDY PLAN", title_style))
    story.append(Paragraph("A personalized plan built around your learning progress", subtitle_style))

    # Run analytical check to isolate weakness trends
    weak_zone = get_weakest_subject(tests)
    average, subject_count, strong_zone, _ = get_performance_summary(tests)

    summary_table = Table([
        [
            [Paragraph("OVERALL SCORE", metric_label_style), Spacer(1, 4), Paragraph(f"{average:.1f}%", metric_value_style)],
            [Paragraph("ASSESSMENTS", metric_label_style), Spacer(1, 4), Paragraph(str(len(tests)), metric_value_style)],
            [Paragraph("STRONGEST SUBJECT", metric_label_style), Spacer(1, 4), Paragraph(escape(strong_zone), metric_value_style)],
            [Paragraph("FOCUS SUBJECT", metric_label_style), Spacer(1, 4), Paragraph(escape(weak_zone), metric_value_style)]
        ]
    ], colWidths=[192.5] * 4, rowHeights=[67])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), PALE_BLUE),
        ('BACKGROUND', (1, 0), (1, 0), colors.HexColor('#f8fafc')),
        ('BACKGROUND', (2, 0), (2, 0), PALE_TEAL),
        ('BACKGROUND', (3, 0), (3, 0), colors.HexColor('#fff7ed')),
        ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#e2e8f0')),
        ('INNERGRID', (0, 0), (-1, -1), 4, colors.white),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 9))
    if subject_count:
        story.append(Paragraph(
            f"Your plan gives extra practice to <b>{escape(weak_zone)}</b>, while maintaining your progress in "
            f"<b>{escape(strong_zone)}</b>.",
            ParagraphStyle('SummaryNote', parent=styles['Normal'], fontSize=9, textColor=INK, spaceAfter=7)
        ))
    else:
        story.append(Paragraph(
            "Add valid assessment scores to personalize this plan with subject-level performance insights.",
            ParagraphStyle('SummaryNote', parent=styles['Normal'], fontSize=9, textColor=MUTED, spaceAfter=7)
        ))
    story.append(Paragraph("Your weekly study plan", section_style))

    # Construct the Calendar Day-by-Day Data Rows
    table_data = [
        [Paragraph("Target Day", th_style), Paragraph("Prescribed Academic Focus Tasks & Allocation", th_style)]
    ]

    routine_map = [
        ("Monday", f"<b>Review and recall:</b> Revisit foundational ideas in <b>{escape(weak_zone)}</b> (1.5 hours), then complete class homework."),
        ("Tuesday", f"<b>Focused practice:</b> Solve medium-difficulty questions in <b>{escape(weak_zone)}</b> (2 hours) and note any tricky steps."),
        ("Wednesday", "<b>General Cross-Review:</b> Study alternative subject tracks (1 Hour) + General revisions."),
        ("Thursday", f"<b>Build understanding:</b> Review a challenging topic in <b>{escape(weak_zone)}</b> with visual notes (1.5 hours), then finish core homework."),
        ("Friday", "<b>Weekly review:</b> Organize notes and revisit key ideas (1 hour) before the weekend practice session."),
        ("Saturday", f"<b>Learn from mistakes:</b> Redo missed questions from <b>{escape(weak_zone)}</b> and explain each solution (2 hours)."),
        ("Sunday", "<b>Check progress:</b> Take a practice assessment, review the results, and leave time to rest.")
    ]

    for day, task in routine_map:
        table_data.append([
            Paragraph(escape(day), td_day_style),
            Paragraph(task, td_task_style)
        ])

    # Dynamic width grid allocation matrix (~770 total points for landscape A4 margin safety)
    col_widths = [120, 650]
    plan_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    
    # Establish structural grid lines
    grid_sheet = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 11),
        ('TOPPADDING', (0, 0), (-1, 0), 11),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
    ])
    
    # Inject alternating rows layout background fill
    for row in range(1, len(table_data)):
        fill = colors.HexColor('#f8fafc') if row % 2 == 1 else colors.white
        grid_sheet.add('BACKGROUND', (0, row), (-1, row), fill)
        grid_sheet.add('TOPPADDING', (0, row), (-1, row), 9)
        grid_sheet.add('BOTTOMPADDING', (0, row), (-1, row), 9)

    plan_table.setStyle(grid_sheet)
    story.append(plan_table)
    
    story.append(Spacer(1, 12))
    disclaimer_style = ParagraphStyle('Disclaimer', parent=styles['Normal'], fontName='Helvetica', fontSize=8, textColor=MUTED, alignment=1)
    story.append(Paragraph("Use this plan as a flexible guide. Adjust study sessions to fit your classwork, energy, and schedule.", disclaimer_style))
    
    doc.build(story, onFirstPage=draw_page_footer, onLaterPages=draw_page_footer)
    
    # Send success response token back cleanly to server stdout
    print(json.dumps({"success": True, "filename": target_pdf}))

if __name__ == "__main__":
    if len(sys.argv) > 2:
        build_study_plan_pdf(sys.argv[1], sys.argv[2])
