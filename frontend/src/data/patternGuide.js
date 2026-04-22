// Canonical reference for the 15 candlestick patterns Neulab detects.
// Kept separate from the live detector (services/candlestick.py) so we can
// enrich UI without affecting signal logic. Order groups by candle count
// (single → two → three) and alternates bullish/bearish for readability.

export const PATTERN_GUIDE = [
    // ─────── Single-candle ───────
    {
        name: "Doji",
        count: "single",
        bias: "neutral",
        glyph: "✛",
        tagline: "Indecision between buyers and sellers.",
        shape: "Open and close are nearly equal. Small or no body, with wicks on either or both sides.",
        meaning:
            "Neither side could win the session. Often marks inflection points — especially after a strong move, where it hints a reversal may be forming.",
        how_to_read:
            "A Doji alone is a warning, not a signal. Wait for the NEXT candle to confirm direction (a strong green confirms a potential bullish turn; a strong red confirms continuation lower).",
        best_when: "Appears after an extended trend. In sideways chop, Dojis are noise.",
    },
    {
        name: "Hammer",
        count: "single",
        bias: "bullish",
        glyph: "▆╷",
        tagline: "Buyers rejected the lows after a downtrend.",
        shape: "Small body at the top of the range with a long lower wick (≥ 2× body) and little-to-no upper wick.",
        meaning:
            "Sellers pushed price down hard intraday, but buyers stepped in and drove it back up, closing near the open. A classic bullish reversal signal.",
        how_to_read:
            "The longer the lower wick relative to the body, the stronger the signal. Confirmation comes from a green follow-up candle closing above the hammer's high.",
        best_when: "After a clear downtrend, ideally at a support level.",
    },
    {
        name: "Inverted Hammer",
        count: "single",
        bias: "bullish",
        glyph: "╷▆",
        tagline: "Buyers attempted a rally from the lows.",
        shape: "Small body at the bottom of the range with a long upper wick and little-to-no lower wick.",
        meaning:
            "Buyers pushed price up significantly before sellers pulled it back. Appearing after a downtrend, it hints that bullish momentum is building.",
        how_to_read:
            "Weaker than a Hammer. Needs strong confirmation from the next candle (preferably a green one that closes above the inverted hammer's high).",
        best_when: "After a downtrend where price has reached a support zone.",
    },
    {
        name: "Shooting Star",
        count: "single",
        bias: "bearish",
        glyph: "╷▆",
        tagline: "Sellers rejected the highs after an uptrend.",
        shape: "Small body at the bottom with a long upper wick (≥ 2× body) and tiny lower wick.",
        meaning:
            "Buyers pushed price up but sellers slammed it back down, closing near the open. A classic bearish reversal signal at a top.",
        how_to_read:
            "Strongest when the upper wick is long AND the candle appears at a resistance level. Confirm with a red follow-up candle closing below the shooting star's low.",
        best_when: "After an uptrend, ideally at a technical resistance.",
    },
    {
        name: "Hanging Man",
        count: "single",
        bias: "bearish",
        glyph: "▆╷",
        tagline: "Hammer shape after an uptrend — a warning.",
        shape: "Hammer-shaped (small body at top, long lower wick) but appearing after a sustained rally.",
        meaning:
            "Same shape as a Hammer, opposite context. The long lower wick shows sellers tested lower prices — suggesting buyers are running out of conviction.",
        how_to_read:
            "Weaker than Shooting Star. Always needs confirmation from a red follow-up candle before acting.",
        best_when: "After an uptrend, especially at resistance. Weaker in choppy markets.",
    },

    // ─────── Two-candle ───────
    {
        name: "Bullish Engulfing",
        count: "two",
        bias: "bullish",
        glyph: "▁▆",
        tagline: "A large green candle swallows the prior red.",
        shape: "Previous candle is red. The next candle is a large green whose body fully engulfs the previous candle's body.",
        meaning:
            "Buyers took complete control, overpowering the prior session's sellers. Among the most reliable short-term bullish reversal patterns.",
        how_to_read:
            "Size matters: the bigger the engulfing candle relative to the prior, the stronger the signal. Ideal entry is on the close; stop below the engulfed candle's low.",
        best_when: "After a downtrend or at support. Weak in sideways drifts.",
    },
    {
        name: "Bearish Engulfing",
        count: "two",
        bias: "bearish",
        glyph: "▆▁",
        tagline: "A large red candle swallows the prior green.",
        shape: "Previous candle is green. The next candle is a large red whose body fully engulfs the previous candle's body.",
        meaning:
            "Sellers overpowered buyers after an uptrend. One of the most reliable short-term bearish reversal signals.",
        how_to_read:
            "Best when it appears at resistance with above-average volume. Enter short on the close with a stop above the engulfing candle's high.",
        best_when: "After an uptrend or at resistance. Stronger with volume confirmation.",
    },
    {
        name: "Bullish Harami",
        count: "two",
        bias: "bullish",
        glyph: "▆ ▁",
        tagline: "A small green candle nested inside a big red.",
        shape: "A large red candle, followed by a small green candle whose body is fully contained inside the prior candle's body.",
        meaning:
            "Selling momentum is pausing. Buyers are tentative but present. Indicates the downtrend is weakening, not fully reversing yet.",
        how_to_read:
            "Weaker than Engulfing. Wait for a confirming green candle that closes above the harami candle's high before acting.",
        best_when: "After a clear downtrend. Gives earlier warning than Engulfing.",
    },
    {
        name: "Bearish Harami",
        count: "two",
        bias: "bearish",
        glyph: "▆ ▁",
        tagline: "A small red candle nested inside a big green.",
        shape: "A large green candle, followed by a small red candle whose body is fully contained inside the prior candle's body.",
        meaning:
            "Buying momentum is pausing. Sellers are tentative but present. Warns that the uptrend is losing steam.",
        how_to_read:
            "Confirm with a red follow-up that closes below the harami candle's low. Alone, it's a pause signal, not a reversal.",
        best_when: "After an uptrend. Early warning, not a full reversal.",
    },
    {
        name: "Piercing Line",
        count: "two",
        bias: "bullish",
        glyph: "▼▲",
        tagline: "Bulls reverse a gap-down aggressively.",
        shape: "Red candle followed by a green candle that opens BELOW the prior low but closes ABOVE the midpoint of the prior red body (and below its open).",
        meaning:
            "A powerful intraday reversal. Overnight sellers drove price down, but daytime buyers overwhelmed them — closing high enough to erase most of yesterday's losses.",
        how_to_read:
            "Stronger when the close pierces more than 50% of the prior red body. Confirm with a green follow-up closing above the piercing candle's high.",
        best_when: "After a downtrend with a notable gap-down open.",
    },
    {
        name: "Dark Cloud Cover",
        count: "two",
        bias: "bearish",
        glyph: "▲▼",
        tagline: "Bears reverse a gap-up aggressively.",
        shape: "Green candle followed by a red candle that opens ABOVE the prior high but closes BELOW the midpoint of the prior green body (and above its open).",
        meaning:
            "Sellers aggressively rejected a gap-up. Buyers tried to extend the rally but got overwhelmed. A significant top-reversal signal.",
        how_to_read:
            "Stronger when the close penetrates deeper into the prior body. Confirm with a red follow-up candle closing below the dark cloud candle's low.",
        best_when: "After an uptrend with a gap-up open (common at euphoric tops).",
    },
    {
        name: "Tweezer Top",
        count: "two",
        bias: "bearish",
        glyph: "▌▐",
        tagline: "Two failed attempts at the same high.",
        shape: "Two consecutive candles with nearly equal highs (within ~0.3%) at the top of an uptrend — typically green then red.",
        meaning:
            "Buyers tested the same resistance twice and failed both times. Signals exhaustion at the top.",
        how_to_read:
            "Subtler than Engulfing. Combine with overbought RSI or resistance levels for higher-confidence short setups.",
        best_when: "At the top of an uptrend, especially at a known resistance line.",
    },
    {
        name: "Tweezer Bottom",
        count: "two",
        bias: "bullish",
        glyph: "▌▐",
        tagline: "Two failed attempts at the same low.",
        shape: "Two consecutive candles with nearly equal lows (within ~0.3%) at the bottom of a downtrend — typically red then green.",
        meaning:
            "Sellers hit the same support twice and failed. Buyers are defending a floor, hinting at a reversal.",
        how_to_read:
            "Combine with oversold RSI or support levels. Entry on the close of the green candle; stop below the tweezer lows.",
        best_when: "At the bottom of a downtrend, especially at a known support line.",
    },

    // ─────── Three-candle ───────
    {
        name: "Morning Star",
        count: "three",
        bias: "bullish",
        glyph: "▼ · ▲",
        tagline: "A three-candle bullish reversal from the depths.",
        shape: "Long red candle → small indecisive body (often gapping down) → strong green candle closing well into the first candle's body.",
        meaning:
            "A classic bottoming pattern. The middle candle represents capitulation; the third candle confirms buyers have seized control. Among the most reliable bullish reversals.",
        how_to_read:
            "The stronger the third candle (ideally closing above the midpoint of the first), the higher the confidence. Watch for volume on the green candle.",
        best_when: "After a sustained downtrend at a support zone. Works across timeframes.",
    },
    {
        name: "Evening Star",
        count: "three",
        bias: "bearish",
        glyph: "▲ · ▼",
        tagline: "A three-candle bearish reversal from the peak.",
        shape: "Long green candle → small indecisive body (often gapping up) → strong red candle closing well into the first candle's body.",
        meaning:
            "Classic topping pattern. The middle candle shows euphoric exhaustion; the third confirms sellers have taken over. Among the most reliable bearish reversals.",
        how_to_read:
            "Strongest when the third candle closes below the midpoint of the first. Higher volume on the red candle adds conviction.",
        best_when: "After a sustained uptrend at a resistance zone.",
    },
    {
        name: "Three White Soldiers",
        count: "three",
        bias: "bullish",
        glyph: "▆▆▆",
        tagline: "Three consecutive strong green candles.",
        shape: "Three large-bodied green candles, each closing near its high, with each candle opening within the prior body and closing higher.",
        meaning:
            "Persistent, orderly buying pressure. Often marks the start of a sustained bullish trend (or a powerful reversal from a downtrend).",
        how_to_read:
            "Be cautious if the third candle is significantly smaller — momentum may be fading. Avoid chasing after the third candle; wait for a small pullback.",
        best_when: "After consolidation or a downtrend. Strongest with expanding volume.",
    },
    {
        name: "Three Black Crows",
        count: "three",
        bias: "bearish",
        glyph: "▆▆▆",
        tagline: "Three consecutive strong red candles.",
        shape: "Three large-bodied red candles, each closing near its low, with each candle opening within the prior body and closing lower.",
        meaning:
            "Persistent, orderly selling pressure. Often marks the start of a sustained bearish trend (or a powerful reversal from an uptrend).",
        how_to_read:
            "Best traded on a retracement entry rather than chasing the third candle. A diminishing third body may hint at near-term exhaustion.",
        best_when: "After an uptrend or near resistance. Strongest with rising volume.",
    },
];

// Quick lookups used by components that want to enrich a detected-pattern
// dict (from the backend) with the guide's educational fields.
export const PATTERN_BY_NAME = Object.fromEntries(
    PATTERN_GUIDE.map((p) => [p.name.toLowerCase(), p])
);

export function describePattern(name) {
    if (!name) return null;
    return PATTERN_BY_NAME[name.toLowerCase()] || null;
}
