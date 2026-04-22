"""PDF generation for analysis reports using reportlab."""
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, PageBreak,
)

BRAND_GOLD = colors.HexColor("#b48a58")
BRAND_INK = colors.HexColor("#101318")
BRAND_MUTED = colors.HexColor("#6b7280")
BUY_GREEN = colors.HexColor("#16a34a")
SELL_RED = colors.HexColor("#dc2626")
HOLD_AMBER = colors.HexColor("#d97706")
RULE_GREY = colors.HexColor("#d1d5db")


def _rec_color(rec: str):
    return {"BUY": BUY_GREEN, "SELL": SELL_RED, "HOLD": HOLD_AMBER}.get(rec, BRAND_INK)


def _styles():
    base = getSampleStyleSheet()
    return {
        "h1": ParagraphStyle(
            "H1", parent=base["Heading1"], fontName="Times-Bold", fontSize=28,
            leading=32, textColor=BRAND_INK, spaceAfter=6,
        ),
        "h2": ParagraphStyle(
            "H2", parent=base["Heading2"], fontName="Times-Bold", fontSize=16,
            leading=20, textColor=BRAND_INK, spaceBefore=12, spaceAfter=6,
        ),
        "overline": ParagraphStyle(
            "OL", parent=base["Normal"], fontName="Courier", fontSize=8,
            leading=10, textColor=BRAND_GOLD, spaceAfter=2,
        ),
        "body": ParagraphStyle(
            "Body", parent=base["Normal"], fontName="Helvetica", fontSize=10,
            leading=14, textColor=BRAND_INK, alignment=TA_LEFT, spaceAfter=6,
        ),
        "mono": ParagraphStyle(
            "Mono", parent=base["Normal"], fontName="Courier", fontSize=9,
            leading=12, textColor=BRAND_INK,
        ),
        "muted": ParagraphStyle(
            "Muted", parent=base["Normal"], fontName="Helvetica", fontSize=8,
            leading=11, textColor=BRAND_MUTED,
        ),
        "verdict": ParagraphStyle(
            "Verdict", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=36,
            leading=40, alignment=TA_LEFT,
        ),
    }


def _kv_row(label: str, value: str, style):
    return [Paragraph(label, style["muted"]), Paragraph(value, style["mono"])]


def _fmt_price(v, currency="USD"):
    if v is None:
        return "—"
    sym = {"USD": "$", "SGD": "S$", "HKD": "HK$", "GBP": "£", "EUR": "€", "JPY": "¥"}.get(currency, "")
    return f"{sym}{v:,.2f}" if isinstance(v, (int, float)) else str(v)


def _risk_para(risks: list, style):
    if not risks:
        return Paragraph("No material risks surfaced.", style["body"])
    items = ["<b>•</b> " + r for r in risks if isinstance(r, str)]
    return Paragraph("<br/>".join(items), style["body"])


def generate_analysis_pdf(analysis: dict) -> bytes:
    """Render an analysis document to a PDF byte string."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=LETTER,
        leftMargin=0.9 * inch, rightMargin=0.9 * inch,
        topMargin=0.7 * inch, bottomMargin=0.7 * inch,
        title=f"Neural Stock Intelligence · {analysis.get('ticker', '')}",
        author="Neulab",
    )
    s = _styles()
    story = []

    # Header
    story.append(Paragraph("NEULAB · NEURAL STOCK INTELLIGENCE™", s["overline"]))
    story.append(Paragraph(
        f"{analysis.get('ticker', '—')} &nbsp;&nbsp;<font color='#6b7280' size='14'>{analysis.get('fundamentals', {}).get('longName') or analysis.get('fundamentals', {}).get('shortName') or ''}</font>",
        s["h1"],
    ))
    currency = analysis.get("quote_snapshot", {}).get("currency") or "USD"
    price = analysis.get("price_at_analysis")
    created = analysis.get("created_at", "")
    try:
        created_fmt = datetime.fromisoformat(created.replace("Z", "+00:00")).strftime("%d %b %Y · %H:%M UTC")
    except Exception:
        created_fmt = created
    mode = (analysis.get("mode") or "standard").capitalize()
    story.append(Paragraph(
        f"Price at analysis: <b>{_fmt_price(price, currency)}</b> · Analyzed {created_fmt} · Mode: <b>{mode}</b>",
        s["muted"],
    ))
    story.append(Spacer(1, 18))

    # Verdict block
    rec = analysis.get("recommendation", "—")
    conf = analysis.get("confidence_score") or 0
    rec_style = ParagraphStyle("V", parent=s["verdict"], textColor=_rec_color(rec))
    story.append(Paragraph(f"{rec}&nbsp;&nbsp;<font size='18' color='#6b7280'>{conf}% confidence</font>", rec_style))
    story.append(Spacer(1, 4))
    horizon = analysis.get("time_horizon_weeks") or "—"
    story.append(Paragraph(
        f"Target {_fmt_price(analysis.get('price_target'), currency)} &nbsp; · &nbsp; "
        f"Stop {_fmt_price(analysis.get('stop_loss'), currency)} &nbsp; · &nbsp; Horizon {horizon} weeks",
        s["mono"],
    ))
    story.append(Spacer(1, 16))

    # Executive summary
    if analysis.get("executive_summary"):
        story.append(Paragraph("EXECUTIVE SUMMARY", s["overline"]))
        story.append(Paragraph(analysis["executive_summary"], s["body"]))
        story.append(Spacer(1, 6))

    # Reasoning
    if analysis.get("reasoning"):
        story.append(Paragraph("Reasoning", s["h2"]))
        story.append(Paragraph(analysis["reasoning"].replace("\n", "<br/>"), s["body"]))

    # Technical
    if analysis.get("technical_analysis"):
        story.append(Paragraph("Technical analysis", s["h2"]))
        story.append(Paragraph(analysis["technical_analysis"].replace("\n", "<br/>"), s["body"]))

    # Fundamentals
    if analysis.get("fundamental_analysis"):
        story.append(Paragraph("Fundamentals", s["h2"]))
        story.append(Paragraph(analysis["fundamental_analysis"].replace("\n", "<br/>"), s["body"]))

    # Candlestick findings (if present)
    findings = analysis.get("candlestick_findings")
    summary = analysis.get("candlestick_summary")
    if findings:
        story.append(PageBreak())
        story.append(Paragraph("CANDLESTICK FINDINGS", s["overline"]))
        story.append(Paragraph("Pattern evidence.", s["h2"]))
        bias = (findings.get("combined_bias") or "neutral").upper()
        story.append(Paragraph(f"Combined bias: <b>{bias}</b> &nbsp;&nbsp;Score: {findings.get('combined_score', 0)}", s["mono"]))
        story.append(Spacer(1, 8))
        for tf_label, tf_data in (("Daily", findings.get("daily")), ("Weekly", findings.get("weekly"))):
            if not tf_data:
                continue
            pats = tf_data.get("patterns") or []
            story.append(Paragraph(f"{tf_label} · {tf_data.get('scanned_candles', 0)} candles · net bias {tf_data.get('net_bias', 'neutral')}", s["overline"]))
            if not pats:
                story.append(Paragraph("No patterns detected on this timeframe.", s["muted"]))
            else:
                rows = [["Pattern", "Bias", "Date", "Strength"]]
                for p in pats:
                    rows.append([
                        p.get("pattern", "—"),
                        (p.get("bias") or "").upper(),
                        (p.get("candle_date") or "")[:10],
                        str(p.get("strength", "—")),
                    ])
                tbl = Table(rows, colWidths=[2.4 * inch, 0.9 * inch, 1.0 * inch, 0.9 * inch])
                tbl.setStyle(TableStyle([
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), BRAND_INK),
                    ("LINEBELOW", (0, 0), (-1, 0), 0.5, RULE_GREY),
                    ("LINEBELOW", (0, 1), (-1, -1), 0.25, RULE_GREY),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]))
                story.append(tbl)
            story.append(Spacer(1, 10))

        if summary and isinstance(summary, dict):
            story.append(Paragraph("HOW THE AI USED THESE PATTERNS", s["overline"]))
            for key, label in (
                ("primary_patterns", "Primary signal"),
                ("confirmation_patterns", "Confirmation"),
                ("rejected_patterns", "Rejected / overridden"),
            ):
                items = summary.get(key) or []
                if items:
                    lines = "<br/>".join(f"• {x}" if isinstance(x, str) else f"• {x}" for x in items)
                    story.append(Paragraph(f"<b>{label}:</b><br/>{lines}", s["body"]))
            if summary.get("bias_alignment"):
                story.append(Paragraph(f"<i>{summary['bias_alignment']}</i>", s["body"]))

    # Risks
    risks = analysis.get("risk_factors")
    if risks:
        story.append(Paragraph("Risks", s["h2"]))
        story.append(_risk_para(risks, s))

    # Footer — data sources + disclaimer
    story.append(Spacer(1, 20))
    story.append(Paragraph(
        "<b>DATA SOURCES</b> · Market quotes, OHLC history &amp; fundamentals: Yahoo Finance (via yfinance). "
        "Candlestick pattern detection: Neulab in-house deterministic engine (15 patterns, daily + weekly). "
        "AI reasoning: Anthropic Claude Sonnet 4.5. News / press / sentiment feeds: not currently integrated.",
        s["muted"],
    ))
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "This report is generated by Neural Stock Intelligence™ (Neulab) using AI models and publicly available market data. "
        "It is informational and educational only — not financial advice, a recommendation to buy or sell, or an offer of securities. "
        "Markets involve risk of loss. Always do your own research and consult a licensed financial professional.",
        s["muted"],
    ))

    doc.build(story)
    pdf_bytes = buf.getvalue()
    buf.close()
    return pdf_bytes
