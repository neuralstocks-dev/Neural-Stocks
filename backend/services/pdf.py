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

    # Market context (Finnhub) — headlines + analyst consensus + earnings
    mc = analysis.get("market_context") or {}
    if mc.get("configured"):
        news = mc.get("news") or {}
        consensus = mc.get("analyst_consensus") or {}
        earnings = mc.get("earnings") or {}
        # Only break to a new page if there's something to show
        if news.get("articles") or consensus or earnings:
            story.append(Spacer(1, 12))
            story.append(Paragraph("MARKET CONTEXT", s["overline"]))
            story.append(Paragraph("Live feed snapshot.", s["h2"]))

            # Headlines
            articles = news.get("articles") or []
            if articles:
                overall = (news.get("summary_sentiment") or "neutral").upper()
                score = news.get("score")
                score_str = f" (score {score:+.2f})" if isinstance(score, (int, float)) else ""
                story.append(Paragraph(
                    f"RECENT HEADLINES · overall {overall}{score_str}",
                    s["overline"],
                ))
                rows = [["", "Headline", "Source", "Bias"]]
                for idx, a in enumerate(articles[:5], 1):
                    senti = (a.get("sentiment") or "neutral").upper()
                    headline = (a.get("headline") or "").strip()
                    # Truncate defensively so Table wraps cleanly
                    if len(headline) > 140:
                        headline = headline[:137] + "…"
                    rows.append([
                        str(idx),
                        Paragraph(headline, s["body"]),
                        Paragraph((a.get("source") or "—"), s["muted"]),
                        senti,
                    ])
                tbl = Table(rows, colWidths=[0.3 * inch, 4.2 * inch, 1.1 * inch, 0.6 * inch])
                tbl.setStyle(TableStyle([
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), BRAND_INK),
                    ("LINEBELOW", (0, 0), (-1, 0), 0.5, RULE_GREY),
                    ("LINEBELOW", (0, 1), (-1, -1), 0.25, RULE_GREY),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]))
                story.append(tbl)
                story.append(Spacer(1, 10))

            # Analyst consensus
            if consensus and consensus.get("total"):
                label = consensus.get("recommendation_label") or "—"
                total = consensus.get("total", 0)
                c_score = consensus.get("score")
                c_score_str = f"{c_score:+.2f}" if isinstance(c_score, (int, float)) else "—"
                story.append(Paragraph("WALL STREET CONSENSUS", s["overline"]))
                story.append(Paragraph(
                    f"<b>{label}</b> · {total} analysts · score {c_score_str}"
                    + (f" · period {consensus.get('period')}" if consensus.get("period") else ""),
                    s["body"],
                ))
                rows = [[
                    "Strong Buy", "Buy", "Hold", "Sell", "Strong Sell",
                ], [
                    str(consensus.get("strong_buy", 0)),
                    str(consensus.get("buy", 0)),
                    str(consensus.get("hold", 0)),
                    str(consensus.get("sell", 0)),
                    str(consensus.get("strong_sell", 0)),
                ]]
                tbl = Table(rows, colWidths=[1.2 * inch] * 5)
                tbl.setStyle(TableStyle([
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
                    ("LINEBELOW", (0, 0), (-1, 0), 0.5, RULE_GREY),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]))
                story.append(tbl)
                story.append(Spacer(1, 10))

            # Next earnings
            if earnings and earnings.get("date"):
                hour_map = {"bmo": "Before market open", "amc": "After market close", "dmh": "During market hours"}
                hour_lbl = hour_map.get((earnings.get("hour") or "").lower(), "")
                days_until = earnings.get("days_until")
                when = ""
                if isinstance(days_until, int):
                    when = (
                        f" (in {days_until} days)" if days_until > 0
                        else " (today)" if days_until == 0
                        else f" ({abs(days_until)}d ago)"
                    )
                qy = ""
                if earnings.get("quarter") and earnings.get("year"):
                    qy = f" · Q{earnings['quarter']} {earnings['year']}"
                eps = earnings.get("eps_estimate")
                eps_str = f"${eps:.2f}" if isinstance(eps, (int, float)) else "—"
                rev = earnings.get("revenue_estimate")
                if isinstance(rev, (int, float)):
                    abs_rev = abs(rev)
                    if abs_rev >= 1e9:
                        rev_str = f"${rev / 1e9:.2f}B"
                    elif abs_rev >= 1e6:
                        rev_str = f"${rev / 1e6:.1f}M"
                    else:
                        rev_str = f"${rev:,.0f}"
                else:
                    rev_str = "—"
                story.append(Paragraph("NEXT EARNINGS", s["overline"]))
                story.append(Paragraph(
                    f"<b>{earnings.get('date')}</b>{when}{qy}"
                    + (f" · {hour_lbl}" if hour_lbl else "")
                    + f" · EPS est. {eps_str} · Revenue est. {rev_str}",
                    s["body"],
                ))

    # Footer — data sources + disclaimer
    story.append(Spacer(1, 20))
    finnhub_on = bool(mc.get("configured"))
    if finnhub_on:
        data_sources_line = (
            "<b>DATA SOURCES</b> · Live quotes &amp; market context: Finnhub.io. "
            "OHLC history &amp; fundamentals: Yahoo Finance (via yfinance). "
            "Candlestick pattern detection: Neulab in-house deterministic engine (15 patterns, daily + weekly). "
            "News sentiment: Neulab keyword heuristic. AI reasoning: Anthropic Claude Sonnet 4.5."
        )
    else:
        data_sources_line = (
            "<b>DATA SOURCES</b> · Market quotes, OHLC history &amp; fundamentals: Yahoo Finance (via yfinance). "
            "Candlestick pattern detection: Neulab in-house deterministic engine (15 patterns, daily + weekly). "
            "AI reasoning: Anthropic Claude Sonnet 4.5."
        )
    story.append(Paragraph(data_sources_line, s["muted"]))
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
