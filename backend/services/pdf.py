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
    sym = {"USD": "$", "SGD": "S$", "HKD": "HK$", "GBP": "£", "EUR": "€", "JPY": "¥", "IDR": "Rp "}.get(currency, "")
    if not isinstance(v, (int, float)):
        return str(v)
    # IDR has no fractional cents; use thousand-separator with 0 decimals
    if currency in ("IDR", "JPY", "KRW", "VND"):
        return f"{sym}{v:,.0f}"
    return f"{sym}{v:,.2f}"


def _risk_para(risks: list, style):
    if not risks:
        return Paragraph("No material risks surfaced.", style["body"])
    items = ["<b>•</b> " + r for r in risks if isinstance(r, str)]
    return Paragraph("<br/>".join(items), style["body"])


def _append_calibration_block(story, analysis: dict, s, currency: str):
    """Render the Verdict Accuracy v2 calibration audit trail.

    Always renders when called — caller decides via calibration_version.
    Two visual states mirror the web UI:
      - Adjustments fired:  amber-bordered box, "LLM raw 78 → −12 → 66 final",
                            bullet list of each adjustment string, academic
                            source for the rule that triggered.
      - No calibration:     muted box stating both gates ran clean — explicit
                            transparency rather than silence (we say what we
                            checked, not just what we found).
    """
    adjustments = analysis.get("confidence_adjustments") or []
    pre = analysis.get("confidence_score_pre_calibration")
    final = analysis.get("confidence_score")
    fired = isinstance(adjustments, list) and len(adjustments) > 0

    accent_hex = "#d97706" if fired else "#16a34a"
    accent = colors.HexColor(accent_hex)
    accent_bg = colors.HexColor("#fff7ed" if fired else "#f0fdf4")

    label = "POST-LLM CALIBRATION · CONFIDENCE ADJUSTED" if fired else "POST-LLM CALIBRATION · NO ADJUSTMENT NEEDED"
    title = "Verdict Accuracy v2"

    inner = []
    inner.append(Paragraph(label, ParagraphStyle(
        "CalLabel", parent=s["overline"], textColor=accent, fontSize=8,
    )))
    inner.append(Paragraph(title, ParagraphStyle(
        "CalTitle", parent=s["body"], fontName="Times-Bold", fontSize=13,
        leading=16, spaceAfter=4, textColor=BRAND_INK,
    )))

    # Score-breakdown line — only render when we actually have a delta.
    if fired and isinstance(pre, (int, float)) and isinstance(final, (int, float)) and pre != final:
        delta = pre - final
        sign = "−" if delta >= 0 else "+"
        inner.append(Paragraph(
            f"<font color='#6b7280'>LLM raw</font> "
            f"<b>{int(pre)}</b> "
            f"<font color='#6b7280'>→</font> "
            f"<font color='#dc2626'><b>{sign}{abs(delta)}</b></font> "
            f"<font color='#6b7280'>→</font> "
            f"<font color='#16a34a'><b>{int(final)} final</b></font>",
            ParagraphStyle("CalScore", parent=s["mono"], fontSize=11, leading=14, spaceAfter=8),
        ))

    if fired:
        for msg in adjustments:
            if not isinstance(msg, str):
                continue
            inner.append(Paragraph(f"• {msg}", ParagraphStyle(
                "CalAdj", parent=s["body"], fontSize=9.5, leading=13, leftIndent=4,
                spaceAfter=3,
            )))
        # Academic source — pick the rule that fired.
        rf_pen = analysis.get("rf_disagreement_penalty")
        eg = analysis.get("earnings_gate_applied")
        sources = []
        if rf_pen:
            rf_op = analysis.get("rf_opinion") or {}
            up = rf_op.get("prob_up")
            down = rf_op.get("prob_down")
            horizon_d = rf_op.get("horizon_days") or 20
            if isinstance(up, (int, float)) and isinstance(down, (int, float)):
                sources.append(
                    f"RF probabilities: P(up) <b>{round(up*100)}%</b> · "
                    f"P(down) <b>{round(down*100)}%</b> over {horizon_d}-day forward window. "
                    f"Penalty rule: Krauss, Do &amp; Huck (2017) — tree-ensemble "
                    f"disagreement with discretionary direction calls predicts ~9pp "
                    f"lower hit-rate on equity-direction tasks."
                )
        if eg:
            d = analysis.get("days_until_earnings")
            if isinstance(d, (int, float)):
                sources.append(
                    f"Earnings call <b>{int(d)} day{'s' if int(d) != 1 else ''} away</b>. "
                    f"Pre-earnings windows are event-driven — the LLM cannot price the "
                    f"surprise — so confidence is capped at 65 to reflect that uncertainty."
                )
        if sources:
            inner.append(Spacer(1, 4))
            for src in sources:
                inner.append(Paragraph(src, ParagraphStyle(
                    "CalSrc", parent=s["muted"], fontSize=8, leading=11, spaceAfter=2,
                )))
    else:
        inner.append(Paragraph(
            "Earnings-proximity gate and RF-disagreement penalty both ran clean. "
            "Confidence shown is Claude's raw output — no adjustment applied.",
            ParagraphStyle("CalEmpty", parent=s["body"], fontSize=9.5, leading=13),
        ))

    # Footer pointer to the deep-dive on the web — keeps PDF clean while
    # preserving conversion path back to the live drawer.
    ticker = analysis.get("ticker", "")
    inner.append(Spacer(1, 4))
    inner.append(Paragraph(
        f"<font color='#6b7280'>Full breakdown — RF top features, probability bar, methodology — "
        f"at <i>neulab.xyz/analysis/{ticker}</i></font>",
        ParagraphStyle("CalFoot", parent=s["muted"], fontSize=7.5, leading=10),
    ))

    # Single-cell table acts as the bordered container around `inner`.
    container = Table([[inner]], colWidths=[6.5 * inch])
    container.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), accent_bg),
        ("LINEBEFORE", (0, 0), (0, 0), 2, accent),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE_GREY),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(container)


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
    story.append(Spacer(1, 14))

    # Educational research banner — sits prominently above the verdict so
    # it's the first thing the reader registers when forwarded the PDF.
    # Quoted-style left rule + serif body matches the calm tone of the
    # web report.
    banner_para = (
        Paragraph("EDUCATIONAL RESEARCH REPORT", ParagraphStyle(
            "BannerOL", parent=s["overline"], textColor=BRAND_GOLD)),
        Paragraph(
            "This is a model-generated summary intended to help users review market "
            "data, technical signals, and scenario analysis for a user-selected stock. "
            "It is <b>not</b> personalized financial advice and <b>not</b> a "
            "recommendation to buy, sell, or hold any security.",
            ParagraphStyle("BannerBody", parent=s["body"], fontSize=10.5, leading=15)),
        Paragraph(
            "<b>Confidence</b> refers to the model's internal classification strength "
            "based on the inputs used — <b>not</b> the probability of price movement "
            "or investment success.",
            ParagraphStyle("BannerSub", parent=s["body"], fontSize=9, leading=13,
                           textColor=BRAND_MUTED)),
    )
    banner_tbl = Table([[c] for c in banner_para], colWidths=[doc.width - 12])
    banner_tbl.setStyle(TableStyle([
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, BRAND_GOLD),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 1), (-1, 1), 4),
        ("TOPPADDING", (0, 2), (-1, 2), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(banner_tbl)
    story.append(Spacer(1, 14))

    # Verdict block
    rec = analysis.get("recommendation", "—")
    conf = analysis.get("confidence_score") or 0
    rec_style = ParagraphStyle("V", parent=s["verdict"], textColor=_rec_color(rec))
    story.append(Paragraph(f"{rec}&nbsp;&nbsp;<font size='18' color='#6b7280'>{conf}% confidence</font>", rec_style))
    story.append(Paragraph(
        "<font color='#6b7280' size='8'>Analytical bias · classification, not a trade instruction</font>",
        ParagraphStyle("VSub", parent=s["mono"], fontSize=8, leading=10)))
    story.append(Spacer(1, 4))
    horizon = analysis.get("time_horizon_weeks") or "—"
    story.append(Paragraph(
        f"Scenario level {_fmt_price(analysis.get('price_target'), currency)} &nbsp; · &nbsp; "
        f"Invalidation {_fmt_price(analysis.get('stop_loss'), currency)} &nbsp; · &nbsp; "
        f"Horizon {horizon} weeks",
        s["mono"],
    ))
    story.append(Spacer(1, 16))

    # Verdict Accuracy v2 calibration block — mirrors the web report rule:
    # always show when calibration_version === "v2", even if no rule fired.
    # Builds the audit trail users want when the PDF outlives the web view
    # (forwarded to brokers, pasted into trade journals).
    if analysis.get("calibration_version") == "v2" or isinstance(analysis.get("confidence_adjustments"), list):
        _append_calibration_block(story, analysis, s, currency)
        story.append(Spacer(1, 14))

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
        # Clarify that the dates shown below are when each pattern formed,
        # not when the analysis was generated — a common source of user
        # confusion (patterns can be several days old within the scan window).
        created_at = analysis.get("created_at") or ""
        created_display = created_at[:10] if isinstance(created_at, str) else ""
        note = (
            "Dates below indicate when each candlestick pattern formed on "
            "the chart. Analysis generated"
            f"{' ' + created_display if created_display else ''} from live market data."
        )
        story.append(Paragraph(f"<i>{note}</i>", s["muted"]))
        story.append(Spacer(1, 8))
        for tf_label, tf_data in (("Daily", findings.get("daily")), ("Weekly", findings.get("weekly"))):
            if not tf_data:
                continue
            pats = tf_data.get("patterns") or []
            rng = tf_data.get("candles_examined_range") or {}
            rng_txt = ""
            if rng.get("from") and rng.get("to"):
                rng_txt = f" · window {str(rng['from'])[:10]} → {str(rng['to'])[:10]}"
            story.append(Paragraph(
                f"{tf_label} · {tf_data.get('scanned_candles', 0)} candles · "
                f"net bias {tf_data.get('net_bias', 'neutral')}{rng_txt}",
                s["overline"],
            ))
            if not pats:
                story.append(Paragraph("No patterns detected on this timeframe.", s["muted"]))
            else:
                rows = [["Pattern", "Bias", "Formed on", "Strength"]]
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

    # Risks to the current model interpretation
    risks = analysis.get("risk_factors")
    if risks:
        story.append(Paragraph("Risks to the current interpretation", s["h2"]))
        story.append(Paragraph(
            "<i>Conditions under which the current model classification would weaken — "
            "not exhaustive risks of holding the security.</i>",
            ParagraphStyle("RisksLead", parent=s["body"], fontSize=9, leading=12,
                           textColor=BRAND_MUTED)))
        story.append(Spacer(1, 4))
        story.append(_risk_para(risks, s))

    # Alternative scenarios — bullish / bearish / neutral framings of the
    # same data. Renders only when the LLM produced the new field.
    alt = analysis.get("alternative_scenarios") or {}
    if isinstance(alt, dict) and (alt.get("bullish") or alt.get("bearish") or alt.get("neutral")):
        story.append(Spacer(1, 10))
        story.append(Paragraph("Alternative scenarios", s["h2"]))
        story.append(Paragraph(
            "<i>The same data can support multiple interpretations — below are the "
            "conditions under which each direction would gain weight.</i>",
            ParagraphStyle("AltLead", parent=s["body"], fontSize=9, leading=12,
                           textColor=BRAND_MUTED)))
        story.append(Spacer(1, 6))
        for label, color_hex, key in (
            ("Bullish scenario", colors.HexColor("#16a34a"), "bullish"),
            ("Neutral scenario", colors.HexColor("#d97706"), "neutral"),
            ("Bearish scenario", colors.HexColor("#dc2626"), "bearish"),
        ):
            text = alt.get(key)
            if not text:
                continue
            cell = [
                Paragraph(label.upper(), ParagraphStyle(
                    "AltOL", parent=s["overline"], fontSize=8, textColor=color_hex)),
                Paragraph(text, s["body"]),
            ]
            tbl = Table([[c] for c in cell], colWidths=[doc.width - 8])
            tbl.setStyle(TableStyle([
                ("LINEBEFORE", (0, 0), (0, -1), 2.5, color_hex),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, 0), 5),
                ("TOPPADDING", (0, 1), (-1, 1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f9fafb")),
            ]))
            story.append(tbl)
            story.append(Spacer(1, 6))

    # What could change the view
    wccv = analysis.get("what_could_change_view") or []
    if isinstance(wccv, list) and wccv:
        story.append(Spacer(1, 8))
        story.append(Paragraph("What could change the view", s["h2"]))
        for m in wccv:
            if isinstance(m, str) and m.strip():
                story.append(Paragraph(f"·&nbsp;&nbsp;{m}", s["body"]))

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

    # How to read this report — canned legend so any reader (forwarded the
    # PDF, broker, journal) understands the educational framing.
    story.append(Spacer(1, 14))
    story.append(Paragraph("How to read this report", s["h2"]))
    legend_rows = [
        ("Analytical bias",
         "The direction the model currently finds more evidence for. The BUY / SELL / HOLD label is an "
         "internal classification code — read it as bullish, bearish, or neutral research framing, not a "
         "trade instruction."),
        ("Confidence",
         "The strength of the model's classification based on the inputs available — <b>not</b> a forecast "
         "probability of price movement or trade success."),
        ("Scenario level",
         "An illustrative price reference matching the current model direction — for monitoring price "
         "behavior, not a buy/sell trigger."),
        ("Invalidation level",
         "The level at which the current interpretation would weaken or no longer hold — useful for "
         "knowing when the read has structurally changed."),
        ("Horizon",
         "The window over which the current model reading is being framed — not a holding-period "
         "recommendation."),
    ]
    for term, desc in legend_rows:
        legend_tbl = Table(
            [[Paragraph(term.upper(), ParagraphStyle(
                "LegendTerm", parent=s["overline"], fontSize=8, textColor=BRAND_GOLD)),
              Paragraph(desc, ParagraphStyle(
                "LegendDesc", parent=s["body"], fontSize=9.5, leading=13))]],
            colWidths=[1.5 * inch, doc.width - 1.5 * inch - 4],
        )
        legend_tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(legend_tbl)

    # Footer — data sources + disclaimer
    story.append(Spacer(1, 20))
    ticker = (analysis.get("ticker") or "").upper()
    is_idx_report = ticker.endswith(".JK")
    finnhub_on = bool(mc.get("configured"))
    if is_idx_report:
        idx_source = analysis.get("idx_data_source") or "rapidapi"
        primary = "RapidAPI · Indonesia Stock Exchange" if idx_source == "rapidapi" else "Yahoo Finance (yfinance)"
        bandar_line = " Insider / director filings &amp; Bandarmology smart-money signals: RapidAPI IDX (computed in-house from raw filings)." if analysis.get("bandarmology") else ""
        data_sources_line = (
            f"<b>DATA SOURCES</b> · Live quotes &amp; key stats: {primary} (primary) + Yahoo Finance (fallback &amp; OHLC history)."
            f"{bandar_line} "
            "Company news: CNBC Indonesia &amp; Detik Finance RSS (ticker &amp; Bahasa alias matched). "
            "News sentiment: Neulab keyword heuristic (English + Bahasa Indonesia). "
            "Candlestick pattern detection: Neulab in-house deterministic engine (15 patterns, daily + weekly). "
            "AI reasoning: Anthropic Claude Sonnet 4.5."
        )
    elif finnhub_on:
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



# ---------------------------------------------------------------------------
# Trade Slip — single-page shareable card optimized for screenshotting into
# Discord/Telegram trading channels. Strips the full report down to: verdict,
# calibration breadcrumb, entry/stop/target/horizon, one-liner thesis, and a
# Neulab footer pointing back to the public share URL.
# ---------------------------------------------------------------------------

def _slip_styles():
    base = getSampleStyleSheet()
    return {
        "overline": ParagraphStyle(
            "SlipOL", parent=base["Normal"], fontName="Courier", fontSize=8,
            leading=10, textColor=BRAND_GOLD, spaceAfter=2,
        ),
        "ticker": ParagraphStyle(
            "SlipTicker", parent=base["Heading1"], fontName="Times-Bold", fontSize=42,
            leading=46, textColor=BRAND_INK, spaceAfter=0,
        ),
        "company": ParagraphStyle(
            "SlipCompany", parent=base["Normal"], fontName="Helvetica", fontSize=10,
            leading=13, textColor=BRAND_MUTED, spaceAfter=2,
        ),
        "verdict": ParagraphStyle(
            "SlipVerdict", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=44,
            leading=46, alignment=TA_LEFT,
        ),
        "muted": ParagraphStyle(
            "SlipMuted", parent=base["Normal"], fontName="Helvetica", fontSize=8,
            leading=11, textColor=BRAND_MUTED,
        ),
        "thesis": ParagraphStyle(
            "SlipThesis", parent=base["Normal"], fontName="Times-Italic", fontSize=11,
            leading=15, textColor=BRAND_INK, spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "SlipBody", parent=base["Normal"], fontName="Helvetica", fontSize=9.5,
            leading=13, textColor=BRAND_INK, alignment=TA_LEFT, spaceAfter=4,
        ),
        "mono": ParagraphStyle(
            "SlipMono", parent=base["Normal"], fontName="Courier", fontSize=9,
            leading=12, textColor=BRAND_INK,
        ),
        "levelLabel": ParagraphStyle(
            "SlipLvlLabel", parent=base["Normal"], fontName="Courier", fontSize=7,
            leading=9, textColor=BRAND_GOLD, alignment=TA_LEFT,
        ),
        "levelValue": ParagraphStyle(
            "SlipLvlValue", parent=base["Normal"], fontName="Times-Bold", fontSize=14,
            leading=16, textColor=BRAND_INK, alignment=TA_LEFT,
        ),
    }


def _slip_thesis(analysis: dict) -> str:
    """Pick the cleanest one-liner thesis available."""
    summary = analysis.get("executive_summary") or ""
    if summary:
        # First sentence — prefer the punchy lead, cap at ~220 chars to keep
        # the slip from overflowing if the LLM produced an essay-length lead.
        first = summary.split(". ")[0].strip().rstrip(".")
        if len(first) > 220:
            first = first[:217].rsplit(" ", 1)[0] + "…"
        return first + "."
    # Fall back to reasoning's first line if executive_summary is missing.
    reasoning = analysis.get("reasoning") or ""
    if reasoning:
        first = reasoning.split("\n")[0].strip()
        if len(first) > 220:
            first = first[:217].rsplit(" ", 1)[0] + "…"
        return first
    return "AI verdict generated from technicals, fundamentals, and pattern analysis."


def _slip_drivers(analysis: dict, max_items: int = 3) -> list:
    """Up to N short bullet drivers — prefers calibration adjustments (which
    are already tightly written), then risks, then technical highlights.
    """
    out = []
    adj = analysis.get("confidence_adjustments") or []
    for a in adj:
        if isinstance(a, str):
            out.append(a)
    if len(out) < max_items:
        risks = analysis.get("risk_factors") or []
        for r in risks:
            if isinstance(r, str):
                out.append(r)
            if len(out) >= max_items:
                break
    return out[:max_items]


def generate_trade_slip_pdf(analysis: dict, share_url: str = "") -> bytes:
    """Render a one-page screenshotable trade slip.

    Layout (5.5 × 7.5 in portrait, ~1:1.36 — fits Discord/Telegram preview):
      1. NEULAB overline + analysis date
      2. TICKER huge serif + company name
      3. Big verdict (BUY/SELL/HOLD) + confidence %
      4. Calibration breadcrumb (only if v2 data present)
      5. 4-cell levels strip: Entry / Target / Stop / Horizon
      6. Italic thesis one-liner
      7. Up to 3 driver bullets
      8. Footer: Neulab branding + share URL + micro-disclaimer
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=(5.5 * inch, 7.5 * inch),
        leftMargin=0.42 * inch, rightMargin=0.42 * inch,
        topMargin=0.4 * inch, bottomMargin=0.4 * inch,
        title=f"Neulab Trade Slip · {analysis.get('ticker', '')}",
        author="Neulab",
    )
    s = _slip_styles()
    story = []

    ticker = analysis.get("ticker", "—")
    fundamentals = analysis.get("fundamentals") or {}
    company = fundamentals.get("longName") or fundamentals.get("shortName") or ""
    currency = (analysis.get("quote_snapshot") or {}).get("currency") or "USD"
    rec = analysis.get("recommendation", "—")
    conf = analysis.get("confidence_score") or 0

    created = analysis.get("created_at", "") or ""
    try:
        created_fmt = datetime.fromisoformat(created.replace("Z", "+00:00")).strftime("%d %b %Y · %H:%M UTC")
    except Exception:
        created_fmt = created[:16]

    # 1. Overline
    story.append(Paragraph("NEULAB · TRADE SLIP", s["overline"]))
    story.append(Paragraph(
        f"<font color='#6b7280'>{created_fmt} · Mode {(analysis.get('mode') or 'standard').capitalize()}</font>",
        s["muted"],
    ))
    story.append(Spacer(1, 10))

    # 2. Ticker + company — keep company on one line, truncate if huge.
    story.append(Paragraph(ticker, s["ticker"]))
    if company:
        if len(company) > 56:
            company = company[:53] + "…"
        story.append(Paragraph(company, s["company"]))
    story.append(Spacer(1, 12))

    # 3. Verdict + confidence
    rec_style = ParagraphStyle("SV", parent=s["verdict"], textColor=_rec_color(rec))
    story.append(Paragraph(
        f"{rec}&nbsp;&nbsp;<font size='18' color='#6b7280'>{conf}% confidence</font>",
        rec_style,
    ))
    story.append(Spacer(1, 4))

    # 4. Calibration breadcrumb — single inline line, no academic prose.
    pre = analysis.get("confidence_score_pre_calibration")
    final = analysis.get("confidence_score")
    adj = analysis.get("confidence_adjustments") or []
    fired = isinstance(adj, list) and len(adj) > 0
    if analysis.get("calibration_version") == "v2":
        if fired and isinstance(pre, (int, float)) and isinstance(final, (int, float)) and pre != final:
            delta = pre - final
            sign = "−" if delta >= 0 else "+"
            story.append(Paragraph(
                f"<font color='#6b7280' size='8'>VERDICT ACCURACY V2 · </font>"
                f"<font color='#6b7280'>LLM raw </font><b>{int(pre)}</b>"
                f"<font color='#6b7280'> → </font>"
                f"<font color='#dc2626'><b>{sign}{abs(delta)}</b></font>"
                f"<font color='#6b7280'> → </font>"
                f"<font color='#16a34a'><b>{int(final)} final</b></font>",
                ParagraphStyle("SlipCal", parent=s["mono"], fontSize=10, leading=13),
            ))
        else:
            story.append(Paragraph(
                "<font color='#6b7280' size='8'>VERDICT ACCURACY V2 · </font>"
                "<font color='#16a34a'>raw Claude output — no calibration adjustment fired</font>",
                ParagraphStyle("SlipCalEmpty", parent=s["mono"], fontSize=9.5, leading=13),
            ))
        story.append(Spacer(1, 10))
    else:
        story.append(Spacer(1, 4))

    # 5. Levels strip — 4 columns, narrow gold rule above each label.
    horizon_w = analysis.get("time_horizon_weeks")
    horizon_txt = f"{horizon_w} wks" if horizon_w else "—"
    levels = [
        ("ENTRY", _fmt_price(analysis.get("price_at_analysis"), currency)),
        ("TARGET", _fmt_price(analysis.get("price_target"), currency)),
        ("STOP", _fmt_price(analysis.get("stop_loss"), currency)),
        ("HORIZON", horizon_txt),
    ]
    label_row = [Paragraph(lbl, s["levelLabel"]) for lbl, _ in levels]
    value_row = [Paragraph(val or "—", s["levelValue"]) for _, val in levels]
    levels_tbl = Table(
        [label_row, value_row],
        colWidths=[1.165 * inch] * 4,
    )
    levels_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEABOVE", (0, 0), (-1, 0), 1.5, BRAND_GOLD),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (0, -1), 6),
        ("TOPPADDING", (1, 0), (1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 6),
    ]))
    story.append(levels_tbl)
    story.append(Spacer(1, 14))

    # 6. Thesis one-liner
    story.append(Paragraph("THESIS", s["overline"]))
    story.append(Paragraph(_slip_thesis(analysis), s["thesis"]))
    story.append(Spacer(1, 8))

    # 7. Up to 3 drivers — only render section if we have any.
    drivers = _slip_drivers(analysis, max_items=3)
    if drivers:
        story.append(Paragraph("KEY DRIVERS", s["overline"]))
        for d in drivers:
            story.append(Paragraph(f"• {d}", s["body"]))
        story.append(Spacer(1, 8))

    # 8. Footer — branded line + disclaimer micro-print.
    footer_url = share_url or f"neulab.xyz/analysis/{ticker}"
    # Strip protocol for cleaner display
    display_url = footer_url.replace("https://", "").replace("http://", "")
    story.append(Spacer(1, 4))
    footer = Table(
        [[
            Paragraph(
                f"<font color='{BRAND_GOLD.hexval()}' face='Times-Bold' size='10'>NEULAB</font> "
                f"<font color='#101318' size='9'>· Neural Stock Intelligence™</font>",
                ParagraphStyle("SlipBrand", parent=s["body"], fontSize=10, leading=13),
            ),
            Paragraph(
                f"<font color='#6b7280' size='8'>full report →</font><br/>"
                f"<font face='Courier' color='#101318' size='9'>{display_url}</font>",
                ParagraphStyle("SlipUrl", parent=s["mono"], fontSize=9, leading=12, alignment=2),
            ),
        ]],
        colWidths=[2.6 * inch, 2.06 * inch],
    )
    footer.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, RULE_GREY),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(footer)
    story.append(Paragraph(
        "Educational only — not financial advice. Markets involve risk of loss.",
        ParagraphStyle("SlipDisc", parent=s["muted"], fontSize=7, leading=9, textColor=BRAND_MUTED),
    ))

    doc.build(story)
    pdf_bytes = buf.getvalue()
    buf.close()
    return pdf_bytes
