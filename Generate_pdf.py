import sys
import json
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

def get_weakest_subject(tests):
    if not tests:
        return "General Review"
    subject_map = {}
    for t in tests:
        sub = t.get("subject", "General Domain").strip()
        if not sub: continue
        score = float(t.get("score", 0))
        total = float(t.get("total", 1))
        if total <= 0: continue
        
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
        rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36
    )
    story = []
    styles = getSampleStyleSheet()

    # Premium Analytical Typography Styles
    title_style = ParagraphStyle(
        'DocTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=24,
        textColor=colors.HexColor('#1e3a8a'), alignment=1, spaceAfter=2
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle', parent=styles['Normal'], fontName='Helvetica-BoldOblique', fontSize=11,
        textColor=colors.HexColor('#b45309'), alignment=1, spaceAfter=15
    )
    th_style = ParagraphStyle('TH', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=11, textColor=colors.white, alignment=1)
    td_day_style = ParagraphStyle('TDDay', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10, textColor=colors.HexColor('#1e293b'), alignment=1)
    td_task_style = ParagraphStyle('TDTask', parent=styles['Normal'], fontName='Helvetica', fontSize=10, textColor=colors.HexColor('#334155'), alignment=0)

    # Document Header Generation
    story.append(Paragraph("LEARNOVA DYNAMIC STUDY PLAN", title_style))
    story.append(Paragraph("Customized Diagnostic Schedule Matrix Framework", subtitle_style))

    # Run analytical check to isolate weakness trends
    weak_zone = get_weakest_subject(tests)

    # Construct the Calendar Day-by-Day Data Rows
    table_data = [
        [Paragraph("Target Day", th_style), Paragraph("Prescribed Academic Focus Tasks & Allocation", th_style)]
    ]

    routine_map = [
        ("Monday", f"<b>Core subject retention review:</b> Focus on foundational terms of <b>{weak_zone}</b> (1.5 Hours) + Complete class homework."),
        ("Tuesday", f"<b>Targeted Weakness Attack:</b> Solve medium-difficulty practice questions in <b>{weak_zone}</b> (2 Hours). Track time-per-question metrics."),
        ("Wednesday", "<b>General Cross-Review:</b> Study alternative subject tracks (1 Hour) + General revisions."),
        ("Thursday", f"<b>Concept Deep Dive:</b> Review tricky topics in <b>{weak_zone}</b> using visual summaries (1.5 Hours) + Core homework."),
        ("Friday", "<b>Performance Maintenance Loop:</b> General subject review and notes aggregation (1 Hour) before the weekend self-tests."),
        ("Saturday", f"<b>Intensive Target Recovery:</b> Focus 100% on <b>{weak_zone}</b> error logs (2 Hours). Redo previously failed questions."),
        ("Sunday", f"<b>Diagnostic Baseline Test:</b> Conduct a full length evaluation tracking performance anomalies + Rest and recharge.")
    ]

    for day, task in routine_map:
        table_data.append([
            Paragraph(day, td_day_style),
            Paragraph(task, td_task_style)
        ])

    # Dynamic width grid allocation matrix (~770 total points for landscape A4 margin safety)
    col_widths = [120, 650]
    plan_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    
    # Establish structural grid lines
    grid_sheet = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a8a')), # Premium Deep Blue Header
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
    ])
    
    # Inject alternating rows layout background fill
    for row in range(1, len(table_data)):
        fill = colors.HexColor('#f8fafc') if row % 2 == 1 else colors.white
        grid_sheet.add('BACKGROUND', (0, row), (-1, row), fill)
        grid_sheet.add('TOPPADDING', (0, row), (-1, row), 12)
        grid_sheet.add('BOTTOMPADDING', (0, row), (-1, row), 12)

    plan_table.setStyle(grid_sheet)
    story.append(plan_table)
    
    # Append the mandatory safety disclaimer at the base of clinical/medical/educational documents
    story.append(Spacer(1, 25))
    disclaimer_style = ParagraphStyle('Disclaimer', parent=styles['Normal'], fontName='Helvetica', fontSize=8, textColor=colors.HexColor('#94a3b8'), alignment=1)
    story.append(Paragraph("This is for informational purposes only. For medical advice or diagnosis, consult a professional. AI responses may include mistakes.", disclaimer_style))
    
    doc.build(story)
    
    # Send success response token back cleanly to server stdout
    print(json.dumps({"success": True, "filename": target_pdf}))

if __name__ == "__main__":
    if len(sys.argv) > 2:
        build_study_plan_pdf(sys.argv[1], sys.argv[2])
