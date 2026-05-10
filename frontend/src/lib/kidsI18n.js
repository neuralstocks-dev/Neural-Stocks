/**
 * KidStocks i18n — light-weight bilingual dictionary (English + Bahasa Indonesia).
 *
 * Why a hand-rolled dict instead of i18next: the kid surface is small,
 * we don't need pluralization/gender rules, and shipping a heavyweight
 * i18n library would add ~30KB to the bundle for one extra language.
 *
 * Usage:
 *   import { useKidsLang, t } from "@/lib/kidsI18n";
 *   const { lang } = useKidsLang();
 *   <h1>{t(lang, "landing.hero_title")}</h1>
 *
 * Adding new keys: add to BOTH `en` and `id` blocks below. If you forget,
 * fallback returns the key string itself so missing translations surface
 * loudly at QA time rather than silently rendering English.
 */
import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "kids_lang";
export const SUPPORTED_LANGS = ["en", "id"];
export const LANG_NAMES = { en: "English", id: "Bahasa Indonesia" };
export const LANG_FLAGS = { en: "🇬🇧", id: "🇮🇩" };

const DICT = {
    en: {
        // Brand / shared
        "brand.tagline": "Learn investing with AI · by NeuLab",
        "brand.powered_by": "Powered by NeuLab Inc.",
        "brand.educational_only": "Educational only · Not financial advice · Real investing involves the risk of losing money.",

        // Footer attribution — links the kid product to the adult NSI
        "attr.eyebrow": "Powered by NeuLab Inc.",
        "attr.body": "KidStocks is the kid-safe layer over Neural Stock Intelligence™ — the AI investing platform we built for adult traders. Same AI engine, age-adapted explanations.",
        "attr.cta_adult": "Visit Neural Stock Intelligence (for adults) →",
        "attr.copyright": "© 2026 NeuLab Inc. · KidStocks is educational and uses no real money.",

        // Language switcher
        "lang.switcher_label": "Language",

        // Landing page (/kids/about)
        "landing.eyebrow": "AI-powered learning · ages 8-18",
        "landing.hero_title": "Show your kid how the AI thinks.",
        "landing.hero_sub": "KidStocks translates institutional-grade stock analysis into language a 9-year-old can understand — so kids learn to invest by reasoning, not by gambling.",
        "landing.cta_primary": "Try a kid-friendly analysis →",
        "landing.cta_secondary": "Why parents pick us",

        // Why-Early section
        "why.eyebrow": "Why start early",
        "why.title": "The research is clear: financial habits take shape young.",
        "why.intro": "Money habits crystallize earlier than most parents realize. Here's what the research actually says — and why we built KidStocks now, not when your kid hits 18.",
        "why.r1_title": "Money habits set by age 7",
        "why.r1_body": "A landmark Cambridge University study tracking 8,000 children found that core financial behaviours — patience with rewards, planning ahead, attitudes toward saving — are largely formed by the age of 7. Waiting until high school is waiting until the cement has set.",
        "why.r1_source": "Whitebread & Bingham, University of Cambridge (2013)",
        "why.r1_url": "https://www.mas.gov.uk/media/1846/r66-money-attitudes-and-behaviour.pdf",
        "why.r2_title": "Financial literacy → measurable adult outcomes",
        "why.r2_body": "Adults who received financial education as children have higher savings rates, lower debt, and significantly better credit scores in their 20s and 30s. Earlier exposure correlates with stronger lifetime outcomes — not just higher knowledge scores.",
        "why.r2_source": "Bruhn et al., \"The Impact of High School Financial Education\" (American Economic Journal, 2016)",
        "why.r2_url": "https://www.aeaweb.org/articles?id=10.1257/app.20150149",
        "why.r3_title": "Compound interest favours the young",
        "why.r3_body": "A child who understands compounding at 10 and starts investing at 18 will out-earn a peer who starts at 28 by ~70%, even with the same monthly contribution. The math doesn't care about effort — it cares about time. Every year of conceptual head start is millions of compound-interest decisions banked.",
        "why.r3_source": "Standard compound-interest math — Vanguard, Fidelity time-value calculators",
        "why.r3_url": "https://investor.vanguard.com/investor-resources-education/calculators-tools/compound-interest-calculator",
        "why.r4_title": "Reasoning > rote memorisation",
        "why.r4_body": "Children who learn investing through real-world reasoning (\"Why might Apple's price go up?\") retain concepts 4× better than those who only memorise vocabulary. KidStocks is built on this principle — every signal explained, every trade journaled.",
        "why.r4_source": "OECD PISA Financial Literacy Framework (2022)",
        "why.r4_url": "https://www.oecd.org/pisa/sitedocument/PISA-2022-Financial-Literacy-Framework.pdf",
        "why.r5_title": "Indonesia's financial-literacy gap",
        "why.r5_body": "OJK's 2022 national survey found Indonesian financial literacy at just 49.7% — but among 18-25-year-olds it drops to 44.8%. The earlier kids start, the smaller this gap becomes by adulthood. Indonesia is exactly where early education delivers outsized impact.",
        "why.r5_source": "OJK Indonesia · National Financial Literacy Survey (2022)",
        "why.r5_url": "https://www.ojk.go.id/id/berita-dan-kegiatan/siaran-pers/Pages/Survei-Nasional-Literasi-dan-Inklusi-Keuangan-Tahun-2022.aspx",
        "why.disclaimer": "All sources publicly available · KidStocks is educational and uses no real money.",

        "landing.how_eyebrow": "How it works",
        "landing.how_title": "Three steps. Zero real money.",
        "landing.step1_title": "1 · Pick a stock",
        "landing.step1_body": "Apple, Microsoft, Tesla, BBCA — names your kid already recognises.",
        "landing.step2_title": "2 · Read the AI's thinking",
        "landing.step2_body": "Same engine our adult investors use, rewritten by our Grade Adaptation Layer for ages 8-10, 11-13, or 14-18.",
        "landing.step3_title": "3 · Reflect & earn StockCoins",
        "landing.step3_body": "Kids journal why they'd buy or sell — and earn virtual rewards for thinking it through.",
        "landing.feature1_title": "Built on real AI",
        "landing.feature1_body": "Same Claude + Gemini fallback chain we run for adults. Not a stripped-down kids app.",
        "landing.feature2_title": "100% virtual money",
        "landing.feature2_body": "Every kid starts with 10,000 StockCoins. No real-money risk. Ever.",
        "landing.feature3_title": "Parent-controlled (8-12)",
        "landing.feature3_body": "COPPA-compliant consent flow for under-13s. We never collect data without you.",
        "landing.cta_signup": "Sign your kid up — free →",
        "landing.cta_preview": "Or try the live AI demo first →",

        // For-Parents / Why-Us page (/kids/for-parents)
        "parents.eyebrow": "For parents",
        "parents.hero_title": "The investing app that teaches kids to think.",
        "parents.hero_sub": "Most kids' investing apps focus on chores, banking, or fractional shares. KidStocks focuses on reasoning. Here's how we compare.",
        "parents.compare_eyebrow": "Side-by-side",
        "parents.compare_title": "How we compare",
        "parents.col_us": "KidStocks",
        "parents.col_greenlight": "Greenlight",
        "parents.col_fidelity": "Fidelity Youth",
        "parents.col_stockpile": "Stockpile",
        "parents.col_bibit": "BUSY / Bibit Junior (ID)",
        "parents.col_pluang": "Investree / Pluang (ID)",
        "parents.col_robo": "Robo-advisors",
        "parents.row_focus": "Primary focus",
        "parents.row_focus_us": "AI-explained reasoning",
        "parents.row_focus_greenlight": "Banking + chores",
        "parents.row_focus_fidelity": "Real brokerage",
        "parents.row_focus_stockpile": "Fractional shares",
        "parents.row_focus_bibit": "Mutual fund education",
        "parents.row_focus_pluang": "Adult crypto/gold",
        "parents.row_focus_robo": "Set-and-forget portfolio",
        "parents.row_money": "Real money risk?",
        "parents.row_money_us": "Never — virtual SC only",
        "parents.row_money_greenlight": "Yes (real banking)",
        "parents.row_money_fidelity": "Yes (real brokerage)",
        "parents.row_money_stockpile": "Yes (real shares)",
        "parents.row_money_bibit": "Yes (real funds)",
        "parents.row_money_pluang": "Yes (real assets)",
        "parents.row_money_robo": "Yes (real portfolio)",
        "parents.row_age": "Age range",
        "parents.row_age_us": "8-18",
        "parents.row_age_greenlight": "5-22",
        "parents.row_age_fidelity": "13-17",
        "parents.row_age_stockpile": "Any (parent-controlled)",
        "parents.row_age_bibit": "17+ (Indonesia)",
        "parents.row_age_pluang": "17+ (Indonesia)",
        "parents.row_age_robo": "Adults",
        "parents.row_explain": "Explains *why*?",
        "parents.row_explain_us": "Yes — every signal explained for the age",
        "parents.row_explain_greenlight": "Light — basic concepts",
        "parents.row_explain_fidelity": "No — just trades",
        "parents.row_explain_stockpile": "No — just buying",
        "parents.row_explain_bibit": "Light — generic content",
        "parents.row_explain_pluang": "No — adult interface",
        "parents.row_explain_robo": "No — black-box",
        "parents.row_journal": "Reflection journal?",
        "parents.row_journal_us": "Yes — earns SC bonus",
        "parents.row_journal_other": "No",
        "parents.row_lang": "Bahasa Indonesia?",
        "parents.row_lang_us": "Yes — full UI + AI",
        "parents.row_lang_no": "No",
        "parents.row_lang_yes": "Yes",
        "parents.row_fee": "Monthly fee",
        "parents.row_fee_us": "Free pilot",
        "parents.row_fee_greenlight": "$5-15/mo",
        "parents.row_fee_fidelity": "Free",
        "parents.row_fee_stockpile": "$5/mo",
        "parents.row_fee_bibit": "Free",
        "parents.row_fee_pluang": "Free",
        "parents.row_fee_robo": "0.25-1% AUM",
        "parents.why_eyebrow": "Why us",
        "parents.why_title": "Three things no other kids' platform does",
        "parents.why1_title": "We translate, we don't dumb down.",
        "parents.why1_body": "Our Grade Adaptation Layer takes the SAME AI verdict our adult investors read — full reasoning, technical signals, fundamental analysis — and rewrites it for ages 8-10, 11-13, or 14-18. The 14-18 band sees institutional vocabulary. The 8-10 band gets analogies to pocket money and toys. Same truth, different shelf height.",
        "parents.why2_title": "We reward thinking, not trading.",
        "parents.why2_body": "Every virtual buy or sell triggers a 3-question reflection journal (Why? Which signal? When would you sell?). Submitting earns +50 StockCoins, capped at 5/day. The cap is intentional: we don't want to game churn — we want kids to slow down and reason.",
        "parents.why3_title": "We default to no real money.",
        "parents.why3_body": "Every kid starts with 10,000 virtual StockCoins. There is no path to real-money trading inside KidStocks. When they're 18, they graduate to NeuLab — our adult platform — with the reasoning habits already in place.",
        "parents.cta_title": "Ready to give your kid an unfair head-start?",
        "parents.cta_body": "Sign-up takes 30 seconds. Under-13s need a quick parental consent (COPPA-compliant — you control the data).",
        "parents.cta_button": "Sign your kid up — free →",
        "parents.cta_preview": "Or try the live demo first →",

        // StockDNA section (parent-facing)
        "parents.dna_eyebrow": "🧬 5-MINUTE QUIZ — FREE",
        "parents.dna_title": "Discover your kid's investor personality",
        "parents.dna_body1": "Before you teach a kid to invest, find out *how they already think* about money. Our StockDNA™ quiz — built on Nobel Prize-winning behavioural finance research — maps any 14-year-old (or yourself) to one of 8 investor archetypes in 5 minutes.",
        "parents.dna_body2": "Want a real conversation starter at the dinner table? Take the quiz with them. The reveal of their archetype, matched stocks, and academic basis is one of the easiest, most fun ways to open up a money conversation that doesn't feel like a lecture.",
        "parents.dna_bullet1": "Bilingual EN / Bahasa Indonesia",
        "parents.dna_bullet2": "Ages 14+ (younger kids can take it with a parent)",
        "parents.dna_bullet3": "Export your result as a PDF · No login needed",
        "parents.dna_bullet4": "Built on Kahneman, Markowitz, Klontz, Mayfield et al.",
        "parents.dna_cta": "Take the StockDNA quiz",
        "parents.dna_disclaimer": "Free · 5 min · Educational only · Not financial advice.",

        // Auth pages (kid-facing)
        "auth.welcome_back": "Welcome back!",
        "auth.email_label": "Email",
        "auth.password_label": "Password",
        "auth.login_submit": "Log in",
        "auth.signup_title": "Start investing with AI",
        "auth.signup_name_label": "Your name",
        "auth.signup_password_label": "Password (8+ characters)",
        "auth.signup_birthday_label": "Birthday",
        "auth.signup_birthday_hint": "ages 8+ (under 13 needs a parent's OK)",
        "auth.signup_parent_label": "Parent's email",
        "auth.signup_parent_hint": "required if you're under 13",
        "auth.signup_submit": "Sign up · Get 10,000 SC →",
        "auth.signup_disclaimer": "Educational use only. Not investment advice. We never use real money — you trade with virtual StockCoins.",
        "auth.signup_have_account": "Already have an account?",
        "auth.signup_login_link": "Log in",
        "auth.login_no_account": "New to KidStocks?",
        "auth.login_signup_link": "Create an account",
        "auth.error_login": "Couldn't log you in. Check your email & password.",
        "auth.error_signup": "Couldn't create your account.",

        // Awaiting consent
        "consent.awaiting_title": "Almost there!",
        "consent.awaiting_body": "Because you're under 13, we need your parent or guardian to give us permission first. We just sent a quick email to {parent} with a link they can click.",
        "consent.awaiting_step1": "Your parent reads what data we collect (it's short!)",
        "consent.awaiting_step2": "They click \"I give consent\" and type their name",
        "consent.awaiting_step3": "You get 10,000 StockCoins to start learning 🎉",
        "consent.awaiting_what_next": "What happens next?",
        "consent.awaiting_resend_label": "Didn't get the email?",
        "consent.awaiting_resend_btn": "Resend the email",
        "consent.awaiting_resend_sending": "Sending…",
        "consent.awaiting_resend_ok": "Email resent!",
        "consent.awaiting_already": "Already approved?",
        "consent.awaiting_login_link": "Try logging in →",

        // Parent consent page
        "consent.parent_title": "Parental Consent · COPPA",
        "consent.parent_intro": "Your child wants to sign up for KidStocks, an AI-powered educational stock-investing app. Because they're under 13, US law (the Children's Online Privacy Protection Act) requires us to get your permission first.",
        "consent.parent_kid_label": "Account awaiting your approval",
        "consent.parent_collect_label": "What we collect",
        "consent.parent_collect_1": "Email + hashed password (we never store passwords as text)",
        "consent.parent_collect_2": "First name + birth year (to choose age-appropriate vocabulary)",
        "consent.parent_collect_3": "Virtual trades and reflection journals (educational data only)",
        "consent.parent_never_label": "What we never do",
        "consent.parent_never_1": "Sell or share their data with third parties for marketing",
        "consent.parent_never_2": "Show ads, in-app purchases, or real-money trading",
        "consent.parent_never_3": "Use real money — every \"trade\" is virtual StockCoins",
        "consent.parent_never_4": "Contact them outside the app without your permission",
        "consent.parent_name_label": "Your full name",
        "consent.parent_name_hint": "(parent or legal guardian)",
        "consent.parent_agree_text": "I am the parent or legal guardian of {kid}, and I give my consent for KidStocks to collect and process their information as described above. I understand I can withdraw consent at any time by emailing the support address in our footer.",
        "consent.parent_submit": "Give consent & activate account",
        "consent.parent_done_title": "All set — thank you!",
        "consent.parent_done_body": "{kid}'s KidStocks account is now active. They can log in any time at",
        "consent.parent_done_withdraw": "You can withdraw consent or request data deletion any time by replying to the consent email.",
        "consent.parent_invalid_title": "This link can't be used",
        "consent.parent_invalid_body": "Ask your child to request a new link from the KidStocks signup page.",

        // Trade journal modal
        "journal.eyebrow": "Trade Journal",
        "journal.title_buy": "Nice buy! Tell future-you why.",
        "journal.title_sell": "Nice sell! Tell future-you why.",
        "journal.bonus_pitch": "Answer all 3 to earn +50 StockCoins and a stronger investing brain.",
        "journal.buy_q1": "Why do you think this stock will do well?",
        "journal.buy_q2": "Which signal from the analysis convinced you most?",
        "journal.buy_q3": "When would you sell? (e.g. price drops 15%, news changes…)",
        "journal.sell_q1": "Why are you selling now?",
        "journal.sell_q2": "What changed your mind since you bought it?",
        "journal.sell_q3": "Would you buy this stock again later? Why?",
        "journal.skip": "Skip for now",
        "journal.submit": "Save reflection",
        "journal.bonus_title": "+{n} StockCoins!",
        "journal.bonus_body": "Your {side} of {qty} {ticker} is locked in your journal. New balance:",
        "journal.cap_title": "Reflection saved",
        "journal.cap_body": "You've already earned today's max bonus — but every reflection still makes you a sharper investor. Come back tomorrow for more!",
        "journal.got_it": "Got it",
    },
    id: {
        // Brand / shared
        "brand.tagline": "Belajar investasi dengan AI · oleh NeuLab",
        "brand.powered_by": "Didukung oleh NeuLab Inc.",
        "brand.educational_only": "Hanya untuk edukasi · Bukan saran keuangan · Investasi sungguhan punya risiko kerugian.",

        // Footer attribution — kaitkan produk anak ke NSI dewasa
        "attr.eyebrow": "Didukung oleh NeuLab Inc.",
        "attr.body": "KidStocks adalah lapisan ramah-anak di atas Neural Stock Intelligence™ — platform investasi AI yang kami bangun untuk trader dewasa. Mesin AI yang sama, penjelasan yang disesuaikan usia.",
        "attr.cta_adult": "Kunjungi Neural Stock Intelligence (untuk dewasa) →",
        "attr.copyright": "© 2026 NeuLab Inc. · KidStocks bersifat edukasi dan tidak pakai uang sungguhan.",

        // Language switcher
        "lang.switcher_label": "Bahasa",

        // Landing page
        "landing.eyebrow": "Belajar dengan AI · usia 8-18",
        "landing.hero_title": "Tunjukkan ke anakmu cara AI berpikir.",
        "landing.hero_sub": "KidStocks menerjemahkan analisis saham kelas institusi menjadi bahasa yang bisa dimengerti anak 9 tahun — supaya anak belajar investasi dengan menalar, bukan menebak.",
        "landing.cta_primary": "Coba analisis ramah-anak →",
        "landing.cta_secondary": "Kenapa orang tua memilih kami",

        // Why-Early section
        "why.eyebrow": "Kenapa harus mulai dini",
        "why.title": "Penelitian sudah jelas: kebiasaan finansial terbentuk sejak dini.",
        "why.intro": "Kebiasaan tentang uang terbentuk lebih awal dari yang dikira kebanyakan orang tua. Ini yang dikatakan penelitian — dan kenapa kami membangun KidStocks sekarang, bukan saat anak Anda 18 tahun.",
        "why.r1_title": "Kebiasaan uang terbentuk usia 7",
        "why.r1_body": "Studi penting University of Cambridge yang melacak 8.000 anak menemukan bahwa perilaku finansial inti — kesabaran terhadap hadiah, kemampuan merencanakan, sikap terhadap menabung — sebagian besar terbentuk sebelum usia 7 tahun. Menunggu sampai SMA = menunggu sampai semennya sudah keras.",
        "why.r1_source": "Whitebread & Bingham, University of Cambridge (2013)",
        "why.r1_url": "https://www.mas.gov.uk/media/1846/r66-money-attitudes-and-behaviour.pdf",
        "why.r2_title": "Literasi finansial → hasil dewasa terukur",
        "why.r2_body": "Orang dewasa yang mendapat edukasi finansial saat kecil punya tingkat tabungan lebih tinggi, hutang lebih rendah, dan skor kredit jauh lebih baik di usia 20-30-an. Eksposur lebih awal berkorelasi dengan hasil hidup yang lebih kuat — bukan hanya nilai pengetahuan lebih tinggi.",
        "why.r2_source": "Bruhn dkk., \"The Impact of High School Financial Education\" (American Economic Journal, 2016)",
        "why.r2_url": "https://www.aeaweb.org/articles?id=10.1257/app.20150149",
        "why.r3_title": "Bunga majemuk berpihak pada yang muda",
        "why.r3_body": "Anak yang paham bunga majemuk di usia 10 dan mulai investasi di usia 18 akan menghasilkan ~70% lebih banyak daripada teman yang baru mulai di usia 28, dengan kontribusi bulanan yang sama. Matematika tidak peduli dengan usaha — hanya peduli waktu. Setiap tahun kepala start konseptual = jutaan keputusan bunga-majemuk yang sudah masuk bank.",
        "why.r3_source": "Matematika bunga majemuk standar — kalkulator Vanguard, Fidelity",
        "why.r3_url": "https://investor.vanguard.com/investor-resources-education/calculators-tools/compound-interest-calculator",
        "why.r4_title": "Penalaran > hafalan",
        "why.r4_body": "Anak yang belajar investasi lewat penalaran dunia nyata (\"Kenapa harga Apple bisa naik?\") mengingat konsep 4× lebih baik daripada yang hanya menghafal istilah. KidStocks dibangun di atas prinsip ini — setiap sinyal dijelaskan, setiap transaksi diberi jurnal.",
        "why.r4_source": "Kerangka Literasi Keuangan OECD PISA (2022)",
        "why.r4_url": "https://www.oecd.org/pisa/sitedocument/PISA-2022-Financial-Literacy-Framework.pdf",
        "why.r5_title": "Kesenjangan literasi finansial Indonesia",
        "why.r5_body": "Survei nasional OJK 2022 menemukan literasi keuangan Indonesia hanya 49,7% — tapi pada usia 18-25 turun ke 44,8%. Semakin dini anak mulai, semakin kecil kesenjangan ini saat dewasa. Indonesia adalah tempat di mana edukasi dini memberikan dampak terbesar.",
        "why.r5_source": "OJK Indonesia · Survei Nasional Literasi dan Inklusi Keuangan (2022)",
        "why.r5_url": "https://www.ojk.go.id/id/berita-dan-kegiatan/siaran-pers/Pages/Survei-Nasional-Literasi-dan-Inklusi-Keuangan-Tahun-2022.aspx",
        "why.disclaimer": "Semua sumber tersedia publik · KidStocks bersifat edukasi dan tidak pakai uang sungguhan.",

        "landing.how_eyebrow": "Cara kerjanya",
        "landing.how_title": "Tiga langkah. Tanpa uang sungguhan.",
        "landing.step1_title": "1 · Pilih saham",
        "landing.step1_body": "Apple, Microsoft, Tesla, BBCA — nama-nama yang sudah dikenal anakmu.",
        "landing.step2_title": "2 · Baca cara AI berpikir",
        "landing.step2_body": "Mesin yang sama dipakai investor dewasa kami, ditulis ulang oleh Grade Adaptation Layer untuk usia 8-10, 11-13, atau 14-18.",
        "landing.step3_title": "3 · Refleksi & dapat StockCoins",
        "landing.step3_body": "Anak menulis kenapa mereka mau beli atau jual — dan dapat hadiah virtual karena memikirkannya baik-baik.",
        "landing.feature1_title": "Dibangun di atas AI sungguhan",
        "landing.feature1_body": "Rangkaian Claude + Gemini yang sama dengan platform dewasa kami. Bukan aplikasi anak versi murahan.",
        "landing.feature2_title": "100% uang virtual",
        "landing.feature2_body": "Setiap anak mulai dengan 10.000 StockCoins. Tidak ada risiko uang sungguhan. Tidak akan pernah.",
        "landing.feature3_title": "Dikontrol orang tua (8-12)",
        "landing.feature3_body": "Alur persetujuan COPPA-compliant untuk usia di bawah 13. Kami tidak pernah ambil data tanpa izinmu.",
        "landing.cta_signup": "Daftarkan anakmu — gratis →",
        "landing.cta_preview": "Atau coba demo AI dulu →",

        // For-Parents page
        "parents.eyebrow": "Untuk orang tua",
        "parents.hero_title": "Aplikasi investasi yang mengajarkan anak berpikir.",
        "parents.hero_sub": "Kebanyakan aplikasi investasi anak fokus pada uang jajan, perbankan, atau saham fraksi. KidStocks fokus pada cara berpikir. Berikut perbandingannya.",
        "parents.compare_eyebrow": "Perbandingan",
        "parents.compare_title": "Bagaimana kami berbeda",
        "parents.col_us": "KidStocks",
        "parents.col_greenlight": "Greenlight",
        "parents.col_fidelity": "Fidelity Youth",
        "parents.col_stockpile": "Stockpile",
        "parents.col_bibit": "BUSY / Bibit Junior",
        "parents.col_pluang": "Investree / Pluang",
        "parents.col_robo": "Robo-advisor",
        "parents.row_focus": "Fokus utama",
        "parents.row_focus_us": "Penalaran AI yang dijelaskan",
        "parents.row_focus_greenlight": "Perbankan + tugas",
        "parents.row_focus_fidelity": "Broker sungguhan",
        "parents.row_focus_stockpile": "Saham fraksi",
        "parents.row_focus_bibit": "Edukasi reksa dana",
        "parents.row_focus_pluang": "Crypto/emas dewasa",
        "parents.row_focus_robo": "Portfolio otomatis",
        "parents.row_money": "Risiko uang sungguhan?",
        "parents.row_money_us": "Tidak — hanya SC virtual",
        "parents.row_money_greenlight": "Ya (perbankan asli)",
        "parents.row_money_fidelity": "Ya (broker asli)",
        "parents.row_money_stockpile": "Ya (saham asli)",
        "parents.row_money_bibit": "Ya (reksa dana asli)",
        "parents.row_money_pluang": "Ya (aset asli)",
        "parents.row_money_robo": "Ya (portfolio asli)",
        "parents.row_age": "Rentang usia",
        "parents.row_age_us": "8-18",
        "parents.row_age_greenlight": "5-22",
        "parents.row_age_fidelity": "13-17",
        "parents.row_age_stockpile": "Semua (kontrol orang tua)",
        "parents.row_age_bibit": "17+ (Indonesia)",
        "parents.row_age_pluang": "17+ (Indonesia)",
        "parents.row_age_robo": "Dewasa",
        "parents.row_explain": "Menjelaskan *kenapa*?",
        "parents.row_explain_us": "Ya — setiap sinyal dijelaskan sesuai usia",
        "parents.row_explain_greenlight": "Ringan — konsep dasar",
        "parents.row_explain_fidelity": "Tidak — hanya transaksi",
        "parents.row_explain_stockpile": "Tidak — hanya pembelian",
        "parents.row_explain_bibit": "Ringan — konten umum",
        "parents.row_explain_pluang": "Tidak — antarmuka dewasa",
        "parents.row_explain_robo": "Tidak — kotak hitam",
        "parents.row_journal": "Jurnal refleksi?",
        "parents.row_journal_us": "Ya — dapat bonus SC",
        "parents.row_journal_other": "Tidak",
        "parents.row_lang": "Bahasa Indonesia?",
        "parents.row_lang_us": "Ya — UI + AI lengkap",
        "parents.row_lang_no": "Tidak",
        "parents.row_lang_yes": "Ya",
        "parents.row_fee": "Biaya bulanan",
        "parents.row_fee_us": "Pilot gratis",
        "parents.row_fee_greenlight": "Rp 75-225 ribu/bln",
        "parents.row_fee_fidelity": "Gratis",
        "parents.row_fee_stockpile": "Rp 75 ribu/bln",
        "parents.row_fee_bibit": "Gratis",
        "parents.row_fee_pluang": "Gratis",
        "parents.row_fee_robo": "0,25-1% AUM",
        "parents.why_eyebrow": "Kenapa kami",
        "parents.why_title": "Tiga hal yang tidak dilakukan platform anak lain",
        "parents.why1_title": "Kami menerjemahkan, bukan menyederhanakan asal-asalan.",
        "parents.why1_body": "Grade Adaptation Layer kami mengambil verdikt AI yang SAMA dengan yang dibaca investor dewasa kami — penalaran lengkap, sinyal teknikal, analisis fundamental — lalu menulis ulang untuk usia 8-10, 11-13, atau 14-18. Kelompok 14-18 melihat istilah institusional. Kelompok 8-10 dapat analogi uang jajan dan mainan. Kebenaran yang sama, tinggi rak yang berbeda.",
        "parents.why2_title": "Kami menghadiahi pemikiran, bukan transaksi.",
        "parents.why2_body": "Setiap pembelian atau penjualan virtual memicu jurnal refleksi 3 pertanyaan (Kenapa? Sinyal mana? Kapan jual?). Mengisi mendapat +50 StockCoins, dibatasi 5/hari. Pembatasan disengaja: kami tidak ingin menggairahkan churn — kami ingin anak melambat dan menalar.",
        "parents.why3_title": "Kami default tanpa uang sungguhan.",
        "parents.why3_body": "Setiap anak mulai dengan 10.000 StockCoins virtual. Tidak ada jalur ke trading uang sungguhan di dalam KidStocks. Saat 18 tahun, mereka lulus ke NeuLab — platform dewasa kami — dengan kebiasaan menalar yang sudah terbentuk.",
        "parents.cta_title": "Siap memberi anakmu modal awal yang tak adil?",
        "parents.cta_body": "Daftar hanya 30 detik. Usia di bawah 13 butuh persetujuan orang tua singkat (COPPA-compliant — kamu kontrol datanya).",
        "parents.cta_button": "Daftarkan anakmu — gratis →",
        "parents.cta_preview": "Atau coba demo dulu →",

        // StockDNA section (parent-facing)
        "parents.dna_eyebrow": "🧬 KUIS 5 MENIT — GRATIS",
        "parents.dna_title": "Temukan kepribadian investor anak Anda",
        "parents.dna_body1": "Sebelum Anda mengajari anak berinvestasi, cari tahu dulu *bagaimana mereka sudah berpikir* tentang uang. Kuis StockDNA™ kami — berdasarkan penelitian keuangan perilaku pemenang Nobel — memetakan anak usia 14+ (atau Anda sendiri) ke salah satu dari 8 arketipe investor dalam 5 menit.",
        "parents.dna_body2": "Mau pembuka obrolan yang seru di meja makan? Ikuti kuis bersama anak Anda. Mengungkap arketipe mereka, saham yang cocok, dan dasar penelitiannya adalah salah satu cara termudah dan paling menyenangkan untuk membuka pembicaraan soal uang yang tidak terasa seperti ceramah.",
        "parents.dna_bullet1": "Dwibahasa EN / Bahasa Indonesia",
        "parents.dna_bullet2": "Usia 14+ (anak yang lebih kecil bisa kerjakan bersama orang tua)",
        "parents.dna_bullet3": "Ekspor hasil sebagai PDF · Tanpa login",
        "parents.dna_bullet4": "Dibangun di atas Kahneman, Markowitz, Klontz, Mayfield dkk.",
        "parents.dna_cta": "Ambil kuis StockDNA",
        "parents.dna_disclaimer": "Gratis · 5 menit · Hanya edukasi · Bukan saran keuangan.",

        // Auth
        "auth.welcome_back": "Selamat datang kembali!",
        "auth.email_label": "Email",
        "auth.password_label": "Kata sandi",
        "auth.login_submit": "Masuk",
        "auth.signup_title": "Mulai investasi dengan AI",
        "auth.signup_name_label": "Nama kamu",
        "auth.signup_password_label": "Kata sandi (8+ karakter)",
        "auth.signup_birthday_label": "Tanggal lahir",
        "auth.signup_birthday_hint": "usia 8+ (di bawah 13 perlu izin orang tua)",
        "auth.signup_parent_label": "Email orang tua",
        "auth.signup_parent_hint": "wajib jika kamu di bawah 13 tahun",
        "auth.signup_submit": "Daftar · Dapat 10.000 SC →",
        "auth.signup_disclaimer": "Hanya untuk edukasi. Bukan saran investasi. Kami tidak pernah pakai uang sungguhan — kamu bertransaksi dengan StockCoins virtual.",
        "auth.signup_have_account": "Sudah punya akun?",
        "auth.signup_login_link": "Masuk",
        "auth.login_no_account": "Baru di KidStocks?",
        "auth.login_signup_link": "Buat akun",
        "auth.error_login": "Tidak bisa masuk. Cek email & kata sandimu.",
        "auth.error_signup": "Tidak bisa membuat akunmu.",

        // Awaiting consent
        "consent.awaiting_title": "Hampir selesai!",
        "consent.awaiting_body": "Karena kamu di bawah 13 tahun, kami butuh izin orang tua atau wali dulu. Kami baru saja mengirim email ke {parent} berisi link yang bisa mereka klik.",
        "consent.awaiting_step1": "Orang tuamu membaca data apa yang kami kumpulkan (singkat saja!)",
        "consent.awaiting_step2": "Mereka klik \"Saya beri izin\" dan tulis nama mereka",
        "consent.awaiting_step3": "Kamu dapat 10.000 StockCoins untuk mulai belajar 🎉",
        "consent.awaiting_what_next": "Apa selanjutnya?",
        "consent.awaiting_resend_label": "Tidak dapat email?",
        "consent.awaiting_resend_btn": "Kirim ulang email",
        "consent.awaiting_resend_sending": "Mengirim…",
        "consent.awaiting_resend_ok": "Email terkirim ulang!",
        "consent.awaiting_already": "Sudah disetujui?",
        "consent.awaiting_login_link": "Coba masuk →",

        // Parent consent
        "consent.parent_title": "Persetujuan Orang Tua · COPPA",
        "consent.parent_intro": "Anak Anda ingin mendaftar KidStocks, aplikasi edukasi investasi saham bertenaga AI. Karena mereka di bawah 13 tahun, hukum AS (Children's Online Privacy Protection Act) mengharuskan kami mendapat izin Anda terlebih dahulu.",
        "consent.parent_kid_label": "Akun menunggu persetujuan Anda",
        "consent.parent_collect_label": "Apa yang kami kumpulkan",
        "consent.parent_collect_1": "Email + kata sandi yang di-hash (kami tidak pernah menyimpan kata sandi sebagai teks biasa)",
        "consent.parent_collect_2": "Nama depan + tahun lahir (untuk memilih kosakata sesuai usia)",
        "consent.parent_collect_3": "Transaksi virtual dan jurnal refleksi (data edukasi saja)",
        "consent.parent_never_label": "Apa yang tidak kami lakukan",
        "consent.parent_never_1": "Menjual atau membagi data anak ke pihak ketiga untuk pemasaran",
        "consent.parent_never_2": "Menampilkan iklan, pembelian dalam aplikasi, atau perdagangan uang sungguhan",
        "consent.parent_never_3": "Menggunakan uang sungguhan — setiap \"transaksi\" adalah StockCoins virtual",
        "consent.parent_never_4": "Menghubungi anak di luar aplikasi tanpa izin Anda",
        "consent.parent_name_label": "Nama lengkap Anda",
        "consent.parent_name_hint": "(orang tua atau wali sah)",
        "consent.parent_agree_text": "Saya orang tua atau wali sah dari {kid}, dan saya memberi izin KidStocks untuk mengumpulkan dan memproses informasi mereka seperti dijelaskan di atas. Saya paham saya bisa mencabut izin kapan saja dengan email ke alamat dukungan di footer kami.",
        "consent.parent_submit": "Beri izin & aktifkan akun",
        "consent.parent_done_title": "Selesai — terima kasih!",
        "consent.parent_done_body": "Akun KidStocks {kid} sekarang aktif. Mereka bisa masuk kapan saja di",
        "consent.parent_done_withdraw": "Anda bisa mencabut izin atau meminta penghapusan data kapan saja dengan membalas email persetujuan.",
        "consent.parent_invalid_title": "Link ini tidak bisa digunakan",
        "consent.parent_invalid_body": "Minta anakmu untuk meminta link baru dari halaman pendaftaran KidStocks.",

        // Trade journal modal
        "journal.eyebrow": "Jurnal Transaksi",
        "journal.title_buy": "Pembelian bagus! Beri tahu dirimu nanti kenapa.",
        "journal.title_sell": "Penjualan bagus! Beri tahu dirimu nanti kenapa.",
        "journal.bonus_pitch": "Jawab ketiganya untuk dapat +50 StockCoins dan otak investor yang lebih tajam.",
        "journal.buy_q1": "Kenapa kamu pikir saham ini akan naik?",
        "journal.buy_q2": "Sinyal mana dari analisis yang paling meyakinkanmu?",
        "journal.buy_q3": "Kapan kamu akan jual? (mis. harga turun 15%, berita berubah…)",
        "journal.sell_q1": "Kenapa kamu jual sekarang?",
        "journal.sell_q2": "Apa yang berubah sejak kamu beli?",
        "journal.sell_q3": "Apakah kamu akan beli saham ini lagi nanti? Kenapa?",
        "journal.skip": "Lewati dulu",
        "journal.submit": "Simpan refleksi",
        "journal.bonus_title": "+{n} StockCoins!",
        "journal.bonus_body": "{side} {qty} {ticker}-mu tersimpan di jurnal. Saldo baru:",
        "journal.cap_title": "Refleksi tersimpan",
        "journal.cap_body": "Kamu sudah dapat bonus maksimum hari ini — tapi setiap refleksi tetap bikin kamu jadi investor yang lebih tajam. Datang lagi besok!",
        "journal.got_it": "Mengerti",
    },
};

export function t(lang, key, vars = {}) {
    const dict = DICT[lang] || DICT.en;
    let s = dict[key] !== undefined ? dict[key] : (DICT.en[key] !== undefined ? DICT.en[key] : key);
    Object.keys(vars).forEach((k) => {
        s = s.replaceAll(`{${k}}`, String(vars[k]));
    });
    return s;
}

export function getInitialLang() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
        const browser = (navigator.language || "en").toLowerCase();
        if (browser.startsWith("id")) return "id";
    } catch (_) { /* ignore */ }
    return "en";
}

export function useKidsLang() {
    const [lang, setLangState] = useState(getInitialLang);

    useEffect(() => {
        // Cross-tab sync via the storage event…
        const onStorage = (e) => {
            if (e.key === STORAGE_KEY && SUPPORTED_LANGS.includes(e.newValue)) {
                setLangState(e.newValue);
            }
        };
        // …and same-tab sync via a custom event we dispatch ourselves
        // (the storage event does NOT fire in the same tab that wrote it).
        const onSameTab = (e) => {
            const v = e?.detail;
            if (SUPPORTED_LANGS.includes(v)) setLangState(v);
        };
        window.addEventListener("storage", onStorage);
        window.addEventListener("kids-lang-change", onSameTab);
        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener("kids-lang-change", onSameTab);
        };
    }, []);

    const setLang = useCallback((l) => {
        if (!SUPPORTED_LANGS.includes(l)) return;
        try { localStorage.setItem(STORAGE_KEY, l); } catch (_) { /* ignore */ }
        setLangState(l);
        // Notify every other useKidsLang() instance in this tab.
        window.dispatchEvent(new CustomEvent("kids-lang-change", { detail: l }));
    }, []);

    return { lang, setLang };
}
