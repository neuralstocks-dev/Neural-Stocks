/**
 * KidStocks Parent Portal — magic-link request + read-only dashboard.
 *
 * Two pages:
 *   • KidsParentLoginPage at /kids/parent/login
 *       Parent types their email. We always show the same success
 *       state ("check your inbox") whether or not the email is
 *       registered, to avoid leaking account existence.
 *
 *   • KidsParentDashboardPage at /kids/parent/dashboard?token=...
 *       Token-authenticated, read-only summary of all kids whose
 *       `parent_email` matches the token's parent. Shows weekly
 *       activity + recent reflection journals + a Telegram link
 *       opt-in flow.
 *
 * Bilingual via useKidsLang. Unauthenticated — token IS the credential.
 */
import React, { useEffect, useState } from "react";
import axios from "axios";
import { Link, useSearchParams } from "react-router-dom";
import { Sparkles, Mail, CheckCircle2, AlertCircle, Loader2, Send, Users, TrendingUp, MessageCircle, ExternalLink } from "lucide-react";
import KidStocksLogo from "@/components/KidStocksLogo";
import { API_BASE } from "@/lib/api";
import { useKidsLang, t } from "@/lib/kidsI18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const ACCENT = "#ff7676";
const NAVY = "#1a1a2e";
const SAND = "#fff8f0";
const SAND_BORDER = "#e5d5b8";
const GREEN = "#76b876";
const GOLD = "#ffb570";

const shellStyle = {
    minHeight: "100vh",
    background: SAND,
    fontFamily: '"Outfit", "Quicksand", system-ui, -apple-system, sans-serif',
    color: NAVY,
    padding: "24px 20px",
};

function PageHeader() {
    const { lang } = useKidsLang();
    return (
        <div style={{ textAlign: "center", marginBottom: 24 }}>
            <Link to="/kids/about" style={{ textDecoration: "none", color: "inherit", display: "inline-flex", alignItems: "center", gap: 10 }}>
                <KidStocksLogo size={32} />
                <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>KidStocks</span>
            </Link>
            <p style={{ fontSize: 13, opacity: 0.6, marginTop: 6 }}>{t(lang, "brand.tagline")}</p>
            <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
                <LanguageSwitcher />
            </div>
        </div>
    );
}

// ===========================================================================
// /kids/parent/login — request a magic link
// ===========================================================================

export function KidsParentLoginPage() {
    const { lang } = useKidsLang();
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);
    const [err, setErr] = useState("");

    const onSubmit = async (e) => {
        e.preventDefault();
        setBusy(true); setErr("");
        try {
            await axios.post(`${API_BASE}/kids/parent/request-link`, { email: email.trim(), lang });
            setSent(true);
        } catch (e2) {
            setErr(e2?.response?.data?.detail || (lang === "id" ? "Tidak bisa mengirim link. Coba lagi." : "Couldn't send the link. Try again."));
        } finally {
            setBusy(false);
        }
    };

    const card = {
        maxWidth: 480, margin: "0 auto", background: "#fff", padding: 28,
        borderRadius: 24, boxShadow: "0 8px 24px rgba(26,26,46,0.08)",
    };

    if (sent) {
        return (
            <div style={shellStyle} data-testid="kids-parent-login-page">
                <PageHeader />
                <div style={card}>
                    <div style={{ textAlign: "center" }}>
                        <CheckCircle2 size={48} color={GREEN} />
                        <h2 style={{ fontSize: 22, fontWeight: 700, marginTop: 12 }}>
                            {lang === "id" ? "Cek email Anda!" : "Check your inbox!"}
                        </h2>
                        <p style={{ fontSize: 14, opacity: 0.85, marginTop: 12, lineHeight: 1.6 }}>
                            {lang === "id"
                                ? `Jika ${email} terdaftar sebagai email orang tua di akun anak, kami sudah mengirim link masuk yang berlaku 24 jam.`
                                : `If ${email} is registered as a parent email on a kid account, we've sent a sign-in link valid for 24 hours.`}
                        </p>
                        <p style={{ fontSize: 12, marginTop: 16, opacity: 0.6, lineHeight: 1.55 }}>
                            {lang === "id"
                                ? "Tidak dapat email? Cek folder spam, atau request lagi dalam 5 menit."
                                : "Didn't get the email? Check spam, or request again in 5 minutes."}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={shellStyle} data-testid="kids-parent-login-page">
            <PageHeader />
            <form style={card} onSubmit={onSubmit}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <Users size={22} color={ACCENT} />
                    <h2 style={{ fontSize: 21, fontWeight: 700, margin: 0 }}>
                        {lang === "id" ? "Portal Orang Tua" : "Parent Portal"}
                    </h2>
                </div>
                <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 18, lineHeight: 1.55 }}>
                    {lang === "id"
                        ? "Masukkan email orang tua yang Anda pakai saat anak mendaftar. Kami akan kirim link masuk berlaku 24 jam."
                        : "Enter the parent email you used when your child signed up. We'll email you a 24-hour sign-in link."}
                </p>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                    {t(lang, "auth.email_label")}
                </label>
                <input
                    type="email"
                    required
                    data-testid="parent-login-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                        width: "100%", padding: "12px 14px",
                        border: `1.5px solid ${SAND_BORDER}`, borderRadius: 12,
                        fontSize: 15, fontFamily: "inherit", background: SAND,
                        boxSizing: "border-box", color: NAVY, marginBottom: 16,
                    }}
                />
                {err && <p style={{ color: ACCENT, fontSize: 12, marginBottom: 10 }}>{err}</p>}
                <button
                    type="submit" disabled={busy}
                    data-testid="parent-login-submit"
                    style={{
                        width: "100%", padding: 14, background: ACCENT, color: "#fff",
                        border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700,
                        cursor: busy ? "wait" : "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    }}
                >
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <><Mail size={16} /> {lang === "id" ? "Kirim link masuk" : "Email me a sign-in link"}</>}
                </button>
            </form>
        </div>
    );
}

// ===========================================================================
// /kids/parent/dashboard?token=... — read-only summary
// ===========================================================================

export function KidsParentDashboardPage() {
    const [params] = useSearchParams();
    const token = params.get("token") || "";
    const { lang } = useKidsLang();
    const [data, setData] = useState(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const r = await axios.get(`${API_BASE}/kids/parent/dashboard`, { params: { token } });
                if (!cancelled) { setData(r.data); setLoading(false); }
            } catch (e) {
                if (!cancelled) {
                    setErr(e?.response?.data?.detail || (lang === "id" ? "Tidak bisa memuat dashboard." : "Couldn't load dashboard."));
                    setLoading(false);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [token, lang]);

    if (loading) {
        return (
            <div style={shellStyle}><PageHeader />
                <div style={{ textAlign: "center", marginTop: 40 }}><Loader2 className="animate-spin" /></div>
            </div>
        );
    }

    if (err) {
        return (
            <div style={shellStyle} data-testid="kids-parent-dashboard-page"><PageHeader />
                <div style={{ maxWidth: 480, margin: "0 auto", background: "#fff", padding: 28, borderRadius: 24 }}>
                    <div style={{ textAlign: "center" }}>
                        <AlertCircle size={36} color={ACCENT} />
                        <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 12 }}>
                            {lang === "id" ? "Link tidak berlaku" : "Link not valid"}
                        </h2>
                        <p style={{ fontSize: 14, opacity: 0.8, marginTop: 8, lineHeight: 1.55 }}>{err}</p>
                        <p style={{ marginTop: 18 }}>
                            <Link to="/kids/parent/login" style={{ color: ACCENT, fontWeight: 700, textDecoration: "none" }}>
                                {lang === "id" ? "Minta link baru →" : "Request a new link →"}
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={shellStyle} data-testid="kids-parent-dashboard-page">
            <PageHeader />
            <div style={{ maxWidth: 880, margin: "0 auto" }}>
                <h1 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, letterSpacing: -0.5 }}>
                    {lang === "id" ? "Selamat datang, orang tua" : "Welcome, parent"}
                </h1>
                <p style={{ fontSize: 14, opacity: 0.75, marginTop: 6 }}>
                    {lang === "id" ? "Aktivitas KidStocks minggu ini untuk" : "This week's KidStocks activity for"}{" "}
                    <strong>{data.parent_email}</strong>
                </p>

                <TelegramCard token={token} telegram={data.telegram} lang={lang} />

                {data.kids.length === 0 && (
                    <p style={{ marginTop: 20, fontSize: 14, opacity: 0.75 }}>
                        {lang === "id" ? "Belum ada anak aktif yang terhubung ke email Anda." : "No active kids linked to your email yet."}
                    </p>
                )}

                <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
                    {data.kids.map((kid) => <KidCard key={kid.id} kid={kid} lang={lang} />)}
                </div>

                <p style={{ marginTop: 32, fontSize: 11, opacity: 0.5, textAlign: "center", lineHeight: 1.6 }}>
                    {t(lang, "brand.educational_only")}
                </p>
            </div>
        </div>
    );
}

function KidCard({ kid, lang }) {
    // Cash deployed in positions (avg-cost basis — we don't have live
    // quotes in this read-only payload; showing "P&L" would be misleading
    // since it would only reflect cash drawdown, not market gains).
    const cashInPositions = (kid.positions || []).reduce(
        (s, p) => s + ((p.qty || 0) * (p.avg_cost || 0)), 0,
    );
    const totalBonusesSc = (kid.recent_journals || []).reduce(
        (s, j) => s + (j.bonus_awarded_sc || 0), 0,
    );
    return (
        <section data-testid={`parent-kid-card-${kid.id}`} style={{
            background: "#fff", border: `1px solid ${SAND_BORDER}`, borderRadius: 16, padding: 22,
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{kid.full_name}</h3>
                    <p style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>{lang === "id" ? "Usia" : "Age band"} {kid.age_band}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "#7a5a00", fontWeight: 700, margin: 0 }}>
                        {lang === "id" ? "Saldo tunai" : "Cash balance"}
                    </p>
                    <p style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>
                        {kid.stock_coins_balance.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span style={{ fontSize: 12, opacity: 0.6 }}>SC</span>
                    </p>
                    {cashInPositions > 0 && (
                        <p style={{ fontSize: 12, marginTop: 2, opacity: 0.7 }}>
                            {lang === "id" ? "Di posisi:" : "In positions:"} ~{cashInPositions.toLocaleString(undefined, { maximumFractionDigits: 0 })} SC
                        </p>
                    )}
                    {totalBonusesSc > 0 && (
                        <p style={{ fontSize: 12, marginTop: 2, color: GREEN, fontWeight: 600 }}>
                            {lang === "id" ? "Bonus jurnal:" : "Journal bonuses:"} +{totalBonusesSc} SC
                        </p>
                    )}
                </div>
            </div>

            <Stat
                icon={<TrendingUp size={14} color={GOLD} />}
                label={lang === "id" ? `${kid.trades_this_week.length} transaksi minggu ini` : `${kid.trades_this_week.length} trades this week`}
                items={kid.trades_this_week.slice(0, 5).map((t2) => `${t2.side} ${t2.qty} ${t2.ticker} @ $${t2.price?.toFixed?.(2) ?? t2.price}`)}
            />
            {kid.recent_journals.length > 0 && (
                <Stat
                    icon={<MessageCircle size={14} color={ACCENT} />}
                    label={lang === "id" ? `${kid.recent_journals.length} refleksi terbaru` : `${kid.recent_journals.length} recent reflections`}
                    items={kid.recent_journals.map((j) => `"${(j.prompts?.why || "").slice(0, 100)}${j.prompts?.why?.length > 100 ? "…" : ""}"`)}
                />
            )}
        </section>
    );
}

function Stat({ icon, label, items }) {
    if (!items || items.length === 0) return null;
    return (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${SAND_BORDER}` }}>
            <p style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                {icon} {label}
            </p>
            <ul style={{ margin: 0, paddingLeft: 22, fontSize: 13, lineHeight: 1.65, opacity: 0.85 }}>
                {items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
        </div>
    );
}

function TelegramCard({ token, telegram, lang }) {
    const [linkInfo, setLinkInfo] = useState(null);
    const [busy, setBusy] = useState(false);
    const [linked, setLinked] = useState(telegram?.linked || false);

    const start = async () => {
        setBusy(true);
        try {
            const r = await axios.post(`${API_BASE}/kids/parent/telegram/start`, { token });
            setLinkInfo(r.data);
        } catch (_) { /* swallow */ }
        finally { setBusy(false); }
    };

    const disconnect = async () => {
        setBusy(true);
        try {
            await axios.post(`${API_BASE}/kids/parent/telegram/disconnect`, { token });
            setLinked(false); setLinkInfo(null);
        } catch (_) { /* swallow */ }
        finally { setBusy(false); }
    };

    return (
        <section data-testid="parent-telegram-card" style={{
            marginTop: 18, background: "linear-gradient(135deg, rgba(118,184,118,0.10) 0%, rgba(255,118,118,0.04) 100%)",
            border: `1px solid ${SAND_BORDER}`, borderRadius: 16, padding: 18,
        }}>
            <p style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#7a5a00", fontWeight: 700, margin: 0 }}>
                {lang === "id" ? "Notifikasi Telegram nightly" : "Nightly Telegram digest"}
            </p>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginTop: 6, marginBottom: 8 }}>
                {linked
                    ? (lang === "id" ? "Telegram terhubung ✓" : "Telegram is linked ✓")
                    : (lang === "id" ? "Dapatkan ringkasan harian di Telegram" : "Get a nightly recap on Telegram")}
            </h3>
            {!linked && !linkInfo && (
                <>
                    <p style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.55, marginTop: 4 }}>
                        {lang === "id"
                            ? "Setiap malam (21:00 UTC) kami kirim ringkasan singkat: berapa transaksi anak Anda, apakah mereka mengisi jurnal refleksi, dan saldo terbaru."
                            : "Each night (21:00 UTC) we'll send a short recap: how many trades your child placed, whether they wrote reflection journals, and the latest balance."}
                    </p>
                    <button
                        onClick={start} disabled={busy}
                        data-testid="parent-telegram-start"
                        style={{
                            marginTop: 12, padding: "10px 18px", background: ACCENT, color: "#fff",
                            border: "none", borderRadius: 12, fontSize: 13, fontWeight: 700,
                            cursor: busy ? "wait" : "pointer",
                            display: "inline-flex", alignItems: "center", gap: 8,
                        }}
                    >
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <><Send size={14} /> {lang === "id" ? "Hubungkan Telegram" : "Link Telegram"}</>}
                    </button>
                </>
            )}
            {linkInfo && !linked && (
                <div style={{ background: "#fff", border: `1px solid ${SAND_BORDER}`, borderRadius: 12, padding: 14, marginTop: 12, fontSize: 13 }}>
                    <p style={{ marginBottom: 6, fontWeight: 600 }}>
                        {lang === "id" ? "Cara menghubungkan:" : "How to link:"}
                    </p>
                    <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                        <li>
                            {lang === "id" ? "Buka chat dengan bot kami:" : "Open a chat with our bot:"}{" "}
                            {linkInfo.deep_link
                                ? <a href={linkInfo.deep_link} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, fontWeight: 700 }} data-testid="parent-telegram-deeplink">@{linkInfo.bot_username} <ExternalLink size={11} style={{ display: "inline" }} /></a>
                                : (lang === "id" ? "(bot belum dikonfigurasi)" : "(bot not configured)")
                            }
                        </li>
                        <li>
                            {lang === "id" ? "Kirim pesan ini ke bot:" : "Send this message to the bot:"}{" "}
                            <code data-testid="parent-telegram-code" style={{ background: SAND, padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>
                                /start parent{linkInfo.link_code}
                            </code>
                        </li>
                        <li>
                            {lang === "id" ? "Refresh halaman ini setelah selesai." : "Refresh this page after — done!"}
                        </li>
                    </ol>
                    <p style={{ marginTop: 10, fontSize: 11, opacity: 0.6 }}>
                        {lang === "id" ? "Kode berlaku 15 menit." : "Code expires in 15 minutes."}
                    </p>
                </div>
            )}
            {linked && (
                <>
                    <p style={{ fontSize: 13, opacity: 0.8, marginTop: 6 }}>
                        {lang === "id"
                            ? "Anda akan menerima ringkasan harian setiap pukul 21:00 UTC."
                            : "You'll get a recap every night at 21:00 UTC."}
                        {telegram?.username && <> · @{telegram.username}</>}
                    </p>
                    <button
                        onClick={disconnect} disabled={busy}
                        data-testid="parent-telegram-disconnect"
                        style={{
                            marginTop: 12, padding: "8px 14px", background: "transparent", color: NAVY,
                            border: `1.5px solid ${SAND_BORDER}`, borderRadius: 10, fontSize: 12, fontWeight: 600,
                            cursor: "pointer",
                        }}
                    >
                        {lang === "id" ? "Putus" : "Disconnect"}
                    </button>
                </>
            )}
        </section>
    );
}
