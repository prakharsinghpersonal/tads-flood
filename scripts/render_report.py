"""Render the editable measured report source; install optional reportlab."""
from html import escape
import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

ROOT = Path(__file__).resolve().parents[1]


def main():
    out = ROOT / "output/pdf"
    out.mkdir(parents=True, exist_ok=True)
    sections = json.loads((ROOT / "docs/submission/report-sections.json").read_text())
    body = ParagraphStyle("body", fontName="Helvetica", fontSize=10.2, leading=14, spaceAfter=10,
                          textColor=colors.HexColor("#253a46"))
    title = ParagraphStyle("title", parent=body, fontName="Helvetica-Bold", fontSize=18, leading=23, spaceAfter=18)
    small = ParagraphStyle("small", parent=body, fontSize=8.6, leading=11.8, spaceAfter=7)
    cell = ParagraphStyle("cell", parent=body, fontSize=9.2, leading=12.5, spaceAfter=0)
    story = []
    for index, section in enumerate(sections):
        if index:
            story.append(PageBreak())
        story.append(Paragraph(escape(section["title"]), title))
        for text in section["paragraphs"]:
            story.append(Paragraph(escape(text), body))
        if "table" in section:
            rows = [[Paragraph(escape(value), cell) for value in row] for row in section["table"]]
            table = Table(rows, colWidths=[163, 342], hAlign="LEFT")
            table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dbece9")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("LINEBELOW", (0, 0), (-1, -1), .4, colors.HexColor("#cfdbdf"))]))
            story.extend([Spacer(1, 5), table])
        for credit in section.get("credits", []):
            story.append(Paragraph(escape(credit), small))
    def page(canvas, document):
        width, height = A4
        canvas.setTitle("TADS Flood - measured technical report review draft")
        canvas.setAuthor("TADS Flood")
        canvas.setStrokeColor(colors.HexColor("#2b7164"))
        canvas.setLineWidth(2)
        canvas.line(45, height - 45, width - 45, height - 45)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(colors.HexColor("#2b7164"))
        canvas.drawString(45, height - 35, "TADS FLOOD / TRACK B")
        canvas.setFillColor(colors.HexColor("#5a6972"))
        canvas.setFont("Helvetica", 8)
        canvas.drawString(45, 30, "Review draft - measured prototype; language/UI/human checks remain open")
        canvas.drawRightString(width - 45, 30, str(document.page) + " / 6")
    pdf = out / "TADS_Flood_Technical_Report_Draft.pdf"
    SimpleDocTemplate(str(pdf), pagesize=A4, leftMargin=45, rightMargin=45, topMargin=65,
                      bottomMargin=52).build(story, onFirstPage=page, onLaterPages=page)
    print(pdf)


if __name__ == "__main__":
    main()
