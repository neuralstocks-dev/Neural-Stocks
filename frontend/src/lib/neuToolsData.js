/**
 * NeuTools data — 6 tools metadata + bilingual marketing copy.
 * StockSlang is ENGLISH-ONLY by design (user request).
 * All other tools support EN + ID.
 */

export const NEUTOOLS = [
    {
        tid: "horo",
        ic: "✦",
        n: "01",
        bilingual: true,
        en: {
            nm: "StockHoroscope",
            tg: "Daily Market Reading",
            ds: "Daily market reading powered by real macro data — personalised to your investor personality type. New reading every visit.",
            ct: "DAILY",
        },
        id: {
            nm: "StockHoroscope",
            tg: "Bacaan Pasar Harian",
            ds: "Bacaan pasar harian bertenaga data makro nyata — dipersonalisasi untuk tipe investor Anda.",
            ct: "HARIAN",
        },
    },
    {
        tid: "calc",
        ic: "≣",
        n: "02",
        bilingual: true,
        en: {
            nm: "StockCalc",
            tg: "Compound Calculator",
            ds: "Calculate what your monthly investments become — shown as real life goals: house, car, retirement. Not just numbers.",
            ct: "CALCULATE",
        },
        id: {
            nm: "StockCalc",
            tg: "Kalkulator Majemuk",
            ds: "Hitung apa yang menjadi investasi bulanan Anda — ditampilkan sebagai tujuan hidup nyata.",
            ct: "HITUNG",
        },
    },
    {
        tid: "bear",
        ic: "▼",
        n: "03",
        bilingual: true,
        en: {
            nm: "Bear Survival Quiz",
            tg: "Crash Scenario Tester",
            ds: "Could you survive 2008? March 2020? Test your decisions against 5 real historical market crashes.",
            ct: "TEST",
        },
        id: {
            nm: "Bear Survival Quiz",
            tg: "Penguji Skenario Crash",
            ds: "Bisakah Anda bertahan di 2008? Maret 2020? Uji keputusan terhadap 5 crash historis nyata.",
            ct: "UJI",
        },
    },
    {
        tid: "latte",
        ic: "◐",
        n: "04",
        bilingual: true,
        en: {
            nm: "Latte Factor",
            tg: "Habit Cost Calculator",
            ds: "Your daily kopi susu costs you Rp 2.3 Billion over 30 years if invested instead. See the real cost of any habit.",
            ct: "CALCULATE",
        },
        id: {
            nm: "Latte Factor",
            tg: "Kalkulator Biaya Kebiasaan",
            ds: "Kopi susu harian Anda menelan biaya Rp 2.3 Miliar selama 30 tahun jika diinvestasikan.",
            ct: "HITUNG",
        },
    },
    {
        tid: "slang",
        ic: "§",
        n: "05",
        bilingual: false, // English-only per user request
        en: {
            nm: "StockSlang",
            tg: "Financial Jargon Translator",
            ds: "P/E, VIX, moat, EBITDA, compounding — all explained in plain human language with a street translation. (English-only)",
            ct: "LEARN",
        },
    },
    {
        tid: "tm",
        ic: "⌛",
        n: "06",
        bilingual: true,
        en: {
            nm: "StockTimeMachine",
            tg: "Financial Regret Calculator",
            ds: "What if you had invested instead of spent? Enter any past date and amount. Feel the regret — then start recovering.",
            ct: "SIMULATE",
        },
        id: {
            nm: "StockTimeMachine",
            tg: "Kalkulator Penyesalan Finansial",
            ds: "Bagaimana jika Anda berinvestasi daripada menghabiskan? Masukkan tanggal masa lalu dan jumlah.",
            ct: "SIMULASI",
        },
    },
];

// Long-form WHAT / WHY / HOW / REFERENCES content per tool, per language.
// StockSlang has only `en` (English-only).
export const TOOL_INFO = {
    horo: {
        en: {
            wh: "<strong>StockHoroscope™</strong> delivers a daily personalised market reading in horoscope language — powered by randomised real-world macro signals (VIX, sector momentum, S&P and IHSG 5-day performance). Each of the 8 investor personality types gets a unique reading covering a Celestial Signal, Guidance, Power Move, Avoid Today, Lucky/Unlucky Sector, and a Fortune closing line.",
            wy: "Horoscopes are read by 70M+ people daily globally — not because of astrology, but because they provide a <strong>daily ritual with personalised framing</strong>. Research by <strong>Thaler & Sunstein (Nudge, 2008)</strong> shows that identical information delivered in personalised emotionally resonant language dramatically increases both engagement and behaviour change. StockHoroscope uses this pattern for genuine financial education.",
            hw: [
                "<strong>Select your investor type</strong> from the 8 options — or take the StockDNA quiz to discover yours",
                "<strong>Check the Market Weather bar</strong> — driven by simulated VIX data showing overall market conditions",
                "<strong>Read your Celestial Signal</strong> — a market condition metaphor that frames the day",
                "<strong>Review your Guidance</strong> — 2-3 sentences of personality-matched market direction",
                "<strong>Note your Power Move</strong> — one specific watchlist-level action for today",
                "<strong>Check Lucky/Unlucky Sectors</strong> and the live data pills below",
                "<strong>Share your Fortune</strong> to social media to build your daily streak",
            ],
            rf: [
                "<em>Nudge</em> — Thaler & Sunstein (2008). Personalised framing as a behaviour change tool.",
                "<em>Thinking, Fast and Slow</em> — Kahneman (2011). System 1 vs System 2 thinking.",
                "VIX Methodology — CBOE Volatility Index White Paper (2009).",
                "<em>The Intelligent Investor</em> — Graham (2003). The original Mr. Market personalisation metaphor.",
            ],
        },
        id: {
            wh: "<strong>StockHoroscope™</strong> menyampaikan bacaan pasar harian yang dipersonalisasi dalam bahasa horoskop — didukung oleh sinyal makro nyata yang disimulasikan (VIX, momentum sektor, kinerja S&P dan IHSG 5 hari).",
            wy: "Horoskop dibaca oleh 70 juta+ orang setiap hari — bukan karena astrologi, tetapi karena memberikan <strong>ritual harian dengan bingkai yang dipersonalisasi</strong>. Penelitian <strong>Thaler & Sunstein (Nudge, 2008)</strong> menunjukkan informasi identik yang disampaikan secara personal meningkatkan keterlibatan dan perubahan perilaku secara dramatis.",
            hw: [
                "<strong>Pilih tipe investor Anda</strong> dari 8 pilihan — atau ikuti kuis StockDNA",
                "<strong>Periksa bilah Cuaca Pasar</strong> — didorong oleh data VIX yang disimulasikan",
                "<strong>Baca Sinyal Celestial Anda</strong> — metafora kondisi pasar",
                "<strong>Tinjau Panduan Anda</strong> — arah pasar yang cocok dengan kepribadian",
                "<strong>Catat Power Move Anda</strong> — satu tindakan spesifik untuk hari ini",
                "<strong>Periksa Sektor Beruntung/Tidak Beruntung</strong> dan data langsung",
                "<strong>Bagikan Fortune Anda</strong> ke media sosial",
            ],
            rf: [
                "<em>Nudge</em> — Thaler & Sunstein (2008).",
                "<em>Thinking, Fast and Slow</em> — Kahneman (2011).",
                "Metodologi VIX — CBOE White Paper (2009).",
                "<em>The Intelligent Investor</em> — Graham (2003).",
            ],
        },
    },
    calc: {
        en: {
            wh: "<strong>StockCalc™</strong> is a compound investment calculator that translates your monthly investment into <strong>real life goals</strong> — a house, a car, school fees, or retirement. It supports IDX (~12% historical) and global (~10%) return assumptions and shows results as life milestones, not abstract numbers.",
            wy: "Research by <strong>Benartzi and Thaler (Save More Tomorrow, 2004)</strong> showed that making investment outcomes concrete and emotionally meaningful dramatically increases savings behaviour. Abstract numbers fail to motivate; life milestones succeed.",
            hw: [
                "<strong>Enter your monthly investment</strong> in Rupiah",
                "<strong>Set expected annual return</strong> using the slider — IDX historical ~12%, S&P 500 ~10%",
                "<strong>Choose your time horizon</strong> in years",
                "<strong>Select your life goal</strong> from the dropdown",
                "<strong>Tap Calculate</strong> to see your final value as a milestone",
            ],
            rf: [
                "<em>Save More Tomorrow</em> — Benartzi & Thaler (2004). AER.",
                "<em>The Millionaire Next Door</em> — Stanley & Danko (1996).",
                "IDX historical returns — BEI annual reports 2000–2024.",
                "<em>A Random Walk Down Wall Street</em> — Malkiel (2023).",
            ],
        },
        id: {
            wh: "<strong>StockCalc™</strong> adalah kalkulator investasi majemuk yang menerjemahkan investasi bulanan Anda menjadi <strong>tujuan hidup nyata</strong> — rumah, mobil, biaya sekolah, atau pensiun.",
            wy: "Penelitian <strong>Benartzi dan Thaler (Save More Tomorrow, 2004)</strong> menunjukkan membuat hasil investasi konkret dan bermakna secara emosional secara dramatis meningkatkan perilaku menabung.",
            hw: [
                "<strong>Masukkan investasi bulanan</strong> Anda dalam Rupiah",
                "<strong>Atur imbal hasil tahunan</strong> menggunakan slider — IDX historis ~12%",
                "<strong>Pilih horizon waktu</strong> dalam tahun",
                "<strong>Pilih tujuan hidup</strong> dari dropdown",
                "<strong>Ketuk Hitung</strong> untuk melihat nilai akhir sebagai tonggak",
            ],
            rf: [
                "<em>Save More Tomorrow</em> — Benartzi & Thaler (2004).",
                "<em>The Millionaire Next Door</em> — Stanley & Danko (1996).",
                "Data historis IDX — BEI 2000–2024.",
                "<em>A Random Walk Down Wall Street</em> — Malkiel (2023).",
            ],
        },
    },
    bear: {
        en: {
            wh: "<strong>Bear Survival Quiz™</strong> presents 5 real historical market crashes — 2008 Financial Crisis, Dot-com Bust 2000, COVID March 2020, 1997 Asian Financial Crisis, and the 2022 Rate Shock — and tests what you would have done at the worst moment of each.",
            wy: "The biggest destroyer of long-term wealth is not bad stock picks — it is panic selling at market bottoms. <strong>JP Morgan Guide to the Markets (2023)</strong> shows that missing just the 10 best trading days over 20 years reduces annual returns from 9.8% to 5.6%. Most of those best days occur within 2 weeks of the worst days.",
            hw: [
                "<strong>Read each crash scenario</strong> — the date, context, and how bad it felt at the time",
                "<strong>Choose your action</strong> from 4 options at the worst moment of each crash",
                "<strong>See the reveal</strong> — what actually happened after your decision point",
                "<strong>Receive your Survival Score</strong> at the end — A through F",
                "<strong>Review your behavioural profile</strong>",
            ],
            rf: [
                "<em>JP Morgan Guide to the Markets 2023</em> — Missing 10 best days analysis.",
                "<em>Irrational Exuberance</em> — Shiller (2015).",
                "<em>The Little Book of Common Sense Investing</em> — Bogle (2007).",
                "IDX crash data — BEI & Bloomberg 1997, 2008, 2020.",
            ],
        },
        id: {
            wh: "<strong>Bear Survival Quiz™</strong> menyajikan 5 crash pasar historis nyata — Krisis Keuangan 2008, Dot-com Bust 2000, COVID Maret 2020, Krisis Keuangan Asia 1997, dan Guncangan Suku Bunga 2022.",
            wy: "Penghancur terbesar kekayaan jangka panjang bukan pilihan saham yang buruk — melainkan penjualan panik di dasar pasar. <strong>JP Morgan Guide to the Markets (2023)</strong> menunjukkan melewatkan 10 hari perdagangan terbaik dalam 20 tahun mengurangi imbal hasil dari 9.8% menjadi 5.6% per tahun.",
            hw: [
                "<strong>Baca setiap skenario crash</strong> — tanggal, konteks, dan seberapa buruk rasanya",
                "<strong>Pilih tindakan Anda</strong> dari 4 opsi pada momen terburuk",
                "<strong>Lihat pengungkapan</strong> — apa yang sebenarnya terjadi",
                "<strong>Terima Skor Ketahanan</strong> di akhir — A hingga F",
                "<strong>Tinjau profil perilaku Anda</strong>",
            ],
            rf: [
                "<em>JP Morgan Guide to the Markets 2023</em>.",
                "<em>Irrational Exuberance</em> — Shiller (2015).",
                "<em>The Little Book of Common Sense Investing</em> — Bogle (2007).",
                "Data crash historis IDX — BEI & Bloomberg 1997, 2008, 2020.",
            ],
        },
    },
    latte: {
        en: {
            wh: "<strong>Latte Factor™ IDX Edition</strong> calculates the true investment opportunity cost of daily spending habits. Enter a daily habit, its cost, and a reference stock to see what that habit costs you over 10, 20, and 30 years if invested instead of spent.",
            wy: "The latte factor concept was coined by <strong>David Bach (The Automatic Millionaire, 2004)</strong>. Small daily expenditures compounded over decades represent enormous opportunity costs — often larger than people's mortgage balances.",
            hw: [
                "<strong>Enter your daily habit name</strong> (e.g. Kopi Susu, GoFood, cigarettes)",
                "<strong>Enter the daily cost</strong> in Rupiah",
                "<strong>Set the expected return</strong> if that money were invested instead",
                "<strong>Choose a reference stock</strong> for context",
                "<strong>Tap Calculate True Cost</strong> to see 10, 20, and 30 year projections",
            ],
            rf: [
                "<em>The Automatic Millionaire</em> — Bach (2004).",
                "<em>Your Money or Your Life</em> — Robin & Dominguez (1992).",
                "<em>Nudge</em> — Thaler & Sunstein (2008).",
                "BPS Household Expenditure Survey 2023.",
            ],
        },
        id: {
            wh: "<strong>Latte Factor™ Edisi IDX</strong> menghitung biaya peluang investasi nyata dari kebiasaan pengeluaran harian. Masukkan kebiasaan harian, biayanya, dan saham referensi untuk melihat biayanya selama 10, 20, dan 30 tahun jika diinvestasikan.",
            wy: "Konsep latte factor diciptakan oleh <strong>David Bach (The Automatic Millionaire, 2004)</strong>. Pengeluaran kecil sehari-hari yang dikompound selama beberapa dekade mewakili biaya peluang yang sangat besar.",
            hw: [
                "<strong>Masukkan nama kebiasaan harian</strong> (mis. Kopi Susu, GoFood, rokok)",
                "<strong>Masukkan biaya harian</strong> dalam Rupiah",
                "<strong>Atur imbal hasil</strong> jika uang itu diinvestasikan",
                "<strong>Pilih saham referensi</strong>",
                "<strong>Ketuk Hitung Biaya Nyata</strong> untuk melihat proyeksi 10, 20, dan 30 tahun",
            ],
            rf: [
                "<em>The Automatic Millionaire</em> — Bach (2004).",
                "<em>Your Money or Your Life</em> — Robin & Dominguez (1992).",
                "<em>Nudge</em> — Thaler & Sunstein (2008).",
                "BPS Survei Pengeluaran Rumah Tangga 2023.",
            ],
        },
    },
    slang: {
        en: {
            wh: "<strong>StockSlang™</strong> translates Wall Street and IDX jargon into plain, honest, human language — with personality. Every term includes what it literally means, why it matters to your portfolio, an Indonesian market example where relevant, and a punchy one-line street translation that makes it stick.",
            wy: "<strong>OJK Financial Literacy Survey 2022</strong> found only 49.68% of Indonesians have basic financial literacy, and jargon is cited as the primary barrier. When complex terms are explained in plain language with local examples, comprehension and retention increase dramatically.",
            hw: [
                "<strong>Browse the full glossary</strong> — 12 essential terms covered",
                "<strong>Use the search bar</strong> to find any specific term instantly",
                "<strong>Filter by category</strong> using the buttons: Valuation, Risk, IDX, Strategy",
                "<strong>Read the street translation</strong> for each term — the memorable one-liner",
            ],
            rf: [
                "<em>OJK Financial Literacy Survey 2022</em>.",
                "<em>The Intelligent Investor</em> — Graham (1949, rev. 2003).",
                "CFA Institute Glossary 2023.",
                "IDX Glossary — Bursa Efek Indonesia.",
            ],
        },
    },
    tm: {
        en: {
            wh: "<strong>StockTimeMachine™</strong> calculates what would have happened if you had invested a specific amount on a specific past date in a chosen stock or index — instead of whatever you actually did with that money. It shows the missed gain, generates a Regret Score out of 100, and then shows a Recovery Plan.",
            wy: "<strong>Kahneman & Tversky (1982)</strong> documented \"counterfactual thinking\" — imagining what could have been — as a key driver of future decision improvement. Regret, properly channelled, converts to action rather than paralysis.",
            hw: [
                "<strong>Enter a past date</strong> — when did you have this money available?",
                "<strong>Enter the amount</strong> you spent or left in savings instead of investing",
                "<strong>Select what you actually did</strong> with the money",
                "<strong>Choose the stock or index</strong> you wish you had bought",
                "<strong>See your Regret Score</strong> and the missed gain in Rupiah",
            ],
            rf: [
                "<em>Kahneman & Tversky (1982)</em> — The Psychology of Preferences.",
                "Historical stock simulation — approximate compounded returns.",
                "<em>The Psychology of Money</em> — Housel (2020).",
                "IDX historical returns — IHSG BEI 1990–2024.",
            ],
        },
        id: {
            wh: "<strong>StockTimeMachine™</strong> menghitung apa yang akan terjadi jika Anda menginvestasikan jumlah tertentu pada tanggal masa lalu tertentu di saham atau indeks tertentu — daripada apa yang sebenarnya Anda lakukan dengan uang itu.",
            wy: "<strong>Kahneman & Tversky (1982)</strong> mendokumentasikan \"pemikiran kontrafaktual\" — membayangkan apa yang mungkin terjadi — sebagai pendorong utama peningkatan keputusan masa depan.",
            hw: [
                "<strong>Masukkan tanggal masa lalu</strong> — kapan Anda memiliki uang ini?",
                "<strong>Masukkan jumlah</strong> yang Anda belanjakan atau tabungkan",
                "<strong>Pilih apa yang Anda lakukan</strong> dengan uang itu",
                "<strong>Pilih saham atau indeks</strong> yang Anda inginkan",
                "<strong>Lihat Skor Penyesalan</strong> dan keuntungan yang terlewat",
            ],
            rf: [
                "<em>Kahneman & Tversky (1982)</em>.",
                "Simulasi historis — imbal hasil majemuk perkiraan.",
                "<em>The Psychology of Money</em> — Housel (2020).",
                "Imbal hasil historis IDX — IHSG BEI 1990–2024.",
            ],
        },
    },
};

// Crash scenarios for Bear Survival Quiz
export const BEAR_SCENARIOS = [
    {
        y: "2008",
        ctx_en: "Global Financial Crisis", ctx_id: "Krisis Keuangan Global",
        det_en: "Lehman Brothers just collapsed. S&P 500 is down 40% in 6 months. IHSG has fallen 50%. Every outlet says it will get worse.",
        det_id: "Lehman Brothers baru saja kolaps. S&P 500 turun 40% dalam 6 bulan. IHSG turun 50%. Semua media bilang akan lebih buruk.",
        q_en: "Your Rp 100M portfolio is halved. What do you do RIGHT NOW?",
        q_id: "Portofolio Rp 100 juta Anda tinggal setengah. Apa yang Anda lakukan SEKARANG?",
        o_en: ["Sell everything — preserve the remaining 50%", "Sell half and hold half", "Hold everything — trust the thesis", "Buy more — maximum dip opportunity"],
        o_id: ["Jual semua — lindungi 50% yang tersisa", "Jual setengah, tahan setengah", "Tahan semua — percaya tesisnya", "Beli lebih — peluang koreksi maksimum"],
        best: 2,
        rev_en: "Holding: Rp 100M recovered to Rp 220M by 2013 (+120%). The S&P returned 400% over the next decade from the March 2009 bottom.",
        rev_id: "Menahan: Rp 100 juta pulih menjadi Rp 220 juta pada 2013 (+120%). S&P kembali 400% selama dekade berikutnya.",
    },
    {
        y: "2020",
        ctx_en: "COVID-19 Market Crash", ctx_id: "Crash Pasar COVID-19",
        det_en: "March 16, 2020. Global lockdowns announced. S&P drops 30% in 3 weeks — fastest crash in history. IHSG falls 37%. No vaccine exists.",
        det_id: "16 Maret 2020. Lockdown global diumumkan. S&P turun 30% dalam 3 minggu. IHSG turun 37%. Tidak ada vaksin.",
        q_en: "Portfolio down 35%. A colleague says the market will fall another 50%. Do you:",
        q_id: "Portofolio turun 35%. Rekan berkata pasar akan turun 50% lagi. Anda:",
        o_en: ["Sell immediately — lock in the loss", "Wait a week before deciding", "Hold — stick to the plan", "Ignore completely — check again in 12 months"],
        o_id: ["Jual segera — kunci kerugian", "Tunggu seminggu sebelum memutuskan", "Tahan — tetap pada rencana", "Abaikan sepenuhnya — cek dalam 12 bulan"],
        best: 3,
        rev_en: "S&P recovered all losses by August 2020 — just 5 months later — and hit new all-time highs by November. Investors who held and added made 50–80% by year end.",
        rev_id: "S&P memulihkan semua kerugian pada Agustus 2020. Mencapai tertinggi sepanjang masa pada November. Investor yang bertahan meraih 50–80% pada akhir tahun.",
    },
    {
        y: "1997",
        ctx_en: "Asian Financial Crisis", ctx_id: "Krisis Keuangan Asia",
        det_en: "The Rupiah collapses from Rp 2,500 to Rp 16,000 per USD. IHSG falls 65%. Banks are collapsing. The IMF arrives in Jakarta.",
        det_id: "Rupiah runtuh dari Rp 2.500 ke Rp 16.000 per USD. IHSG turun 65%. Bank-bank kolaps. IMF tiba di Jakarta.",
        q_en: "IHSG holdings down 60%. Rupiah keeps weakening. You:",
        q_id: "Holdings IHSG turun 60%. Rupiah terus melemah. Anda:",
        o_en: ["Convert everything to USD and exit Indonesia", "Sell weak stocks, keep only the strongest blue chips", "Hold your blue chip positions — BBCA, Telkom, Astra", "Buy dollar-earning exporters as a hedge"],
        o_id: ["Konversi semua ke USD dan keluar dari Indonesia", "Jual saham lemah, simpan blue chip terkuat", "Tahan blue chip — BBCA, Telkom, Astra", "Beli eksportir penghasil dolar sebagai lindung nilai"],
        best: 2,
        rev_en: "BBCA, Telkom, and Astra all recovered fully by 2003–2004 and went on to 10x+ by 2010. The crisis destroyed weak companies; the strongest blue chips survived and compounded dramatically.",
        rev_id: "BBCA, Telkom, dan Astra pulih sepenuhnya pada 2003–2004 dan berlanjut 10x+ pada 2010.",
    },
    {
        y: "2000",
        ctx_en: "Dot-com Bubble Burst", ctx_id: "Pecahnya Gelembung Dot-com",
        det_en: "NASDAQ has fallen 40% from its peak. Amazon is down 90% from its high. Everyone says 'the internet was a fraud.'",
        det_id: "NASDAQ turun 40% dari puncak. Amazon turun 90% dari tertingginya. Semua orang bilang \"internet adalah penipuan.\"",
        q_en: "Your tech portfolio is down 50%. Amazon specifically is down 90%. You:",
        q_id: "Portofolio teknologi Anda turun 50%. Amazon khususnya turun 90%. Anda:",
        o_en: ["Sell Amazon — it might go to zero", "Hold quality names only — sell pure speculation", "Hold everything — the internet will win long-term", "Buy more Amazon at 90% discount — generational opportunity"],
        o_id: ["Jual Amazon — mungkin ke nol", "Tahan nama berkualitas — jual spekulasi murni", "Tahan semua — internet akan menang jangka panjang", "Beli lebih banyak Amazon diskon 90% — peluang generasional"],
        best: 3,
        rev_en: "Amazon went on to become a $1.5 trillion company. $10,000 invested at the 2001 low = $15M+ today. Quality and conviction beat panic.",
        rev_id: "Amazon menjadi perusahaan senilai $1,5 T. $10.000 yang diinvestasikan di 2001 = $15 juta+ hari ini.",
    },
    {
        y: "2022",
        ctx_en: "Rate Shock & Tech Collapse", ctx_id: "Guncangan Suku Bunga & Runtuhnya Teknologi",
        det_en: "The Fed raises rates 7 times. NASDAQ falls 33%. Growth stocks collapse 60–80%. Your growth portfolio is down 45%.",
        det_id: "The Fed menaikkan suku bunga 7 kali. NASDAQ turun 33%. Saham pertumbuhan runtuh 60–80%. Portofolio pertumbuhan Anda turun 45%.",
        q_en: "Growth tech portfolio down 45%. Rising rates feel permanent. Do you:",
        q_id: "Portofolio teknologi pertumbuhan turun 45%. Kenaikan suku bunga terasa permanen. Anda:",
        o_en: ["Rotate everything to bonds and value stocks", "Sell 30%, rotate to profitable tech only", "Hold growth — rates will not stay high forever", "Add to your best growth names at 50% discount"],
        o_id: ["Rotasi semua ke obligasi dan saham nilai", "Jual 30%, rotasi ke teknologi yang menguntungkan", "Tahan pertumbuhan — suku bunga tidak akan tetap tinggi", "Tambah ke nama pertumbuhan terbaik diskon 50%"],
        best: 2,
        rev_en: "By end of 2023, quality tech (NVDA, MSFT, META) recovered 100–300% from 2022 lows. Profitable tech with real revenue bounced first and hardest.",
        rev_id: "Pada akhir 2023, teknologi berkualitas (NVDA, MSFT, META) pulih 100–300% dari level rendah 2022.",
    },
];

// 8 investor personality types for StockHoroscope
export const HORO_TYPES = {
    visionary: { en: "THE VISIONARY", id: "SI VISIONER" },
    analyst:   { en: "THE ANALYST", id: "SI ANALIS" },
    maverick:  { en: "THE MAVERICK", id: "SI MAVERICK" },
    steady:    { en: "THE STEADY HAND", id: "SI TANGAN KOKOH" },
    explorer:  { en: "THE EXPLORER", id: "SI PENJELAJAH" },
    guardian:  { en: "THE GUARDIAN", id: "SI PENJAGA" },
    strategist:{ en: "THE STRATEGIST", id: "SI AHLI STRATEGI" },
    timelord:  { en: "THE TIME LORD", id: "SI TUAN WAKTU" },
};

export const HORO_READINGS = {
    visionary: {
        en: { sig: "Saturn stations retrograde — and so does the NASDAQ. Disruption is not the enemy; it is the invitation.", guid: "Visionaries who held through every correction captured the decade that followed. Your signal remains unchanged. <strong>NVDA</strong> approaches a pivotal level worth watching.", pwr: "Add NVDA and GOTO to your watchlist. Elevated VIX means elevated opportunity for 3-year conviction holders.", avoid: "Checking your portfolio more than once today. Volatility is noise, not signal.", lucky: "Semiconductors", unlucky: "Consumer Staples", fort: "The horizon is stormy. Great voyagers sail anyway." },
        id: { sig: "Saturnus mundur — begitu juga NASDAQ. Disrupsi bukan musuh; itu adalah undangan.", guid: "Visioner yang bertahan melalui setiap koreksi menangkap dekade berikutnya. Sinyal Anda tetap tidak berubah. <strong>NVDA</strong> mendekati level kritis yang patut dipantau.", pwr: "Tambahkan NVDA dan GOTO ke watchlist Anda. VIX tinggi = peluang bagi pemegang keyakinan 3 tahun.", avoid: "Memeriksa portofolio lebih dari sekali hari ini. Volatilitas adalah kebisingan.", lucky: "Semikonduktor", unlucky: "Kebutuhan Pokok", fort: "Horizon sedang badai. Pelayar hebat tetap berlayar." },
    },
    analyst: {
        en: { sig: "Mercury aligns with Saturn — precision and patience share the same orbit today.", guid: "Three data points confirm a wait. Quality entry matters more than speed. <strong>MSFT and BBCA</strong> remain the gold standard.", pwr: "Review BRK.B and ASII — quality at current levels worth noting for disciplined entry.", avoid: "Spreadsheet paralysis. Your best analysis was done before today. Trust it.", lucky: "Financials", unlucky: "Speculative Biotech", fort: "Patience without data is hope. Data without patience is noise. You have both." },
        id: { sig: "Merkurius bersatu dengan Saturnus — presisi dan kesabaran berbagi orbit yang sama hari ini.", guid: "Tiga titik data mengkonfirmasi penantian. Kualitas entry lebih penting dari kecepatan. <strong>MSFT dan BBCA</strong> tetap standar emas.", pwr: "Tinjau BRK.B dan ASII — kualitas di level saat ini patut dicatat.", avoid: "Kelumpuhan spreadsheet. Analisis terbaik Anda dilakukan sebelum hari ini.", lucky: "Keuangan", unlucky: "Biotek Spekulatif", fort: "Kesabaran tanpa data adalah harapan. Data tanpa kesabaran adalah kebisingan." },
    },
    maverick: {
        en: { sig: "Mars ignites — the contrarian window opens while the crowd retreats.", guid: "Everyone is scared. Historically your most precise entry indicator. <strong>COIN</strong> moves 48 hours after peak fear registers.", pwr: "Monitor COIN and BUMI — high-beta names with real revenue snap back first after VIX spikes.", avoid: "Overleveraging. Cap high-risk names at 8% each. Your edge is courage — protect it with discipline.", lucky: "Crypto Infrastructure", unlucky: "Utilities", fort: "Everyone's scared. That's your signal." },
        id: { sig: "Mars menyala — jendela kontarian terbuka sementara kerumunan mundur.", guid: "Semua orang ketakutan. Itu indikator entry paling tepat Anda secara historis. <strong>COIN</strong> bergerak 48 jam setelah ketakutan puncak.", pwr: "Pantau COIN dan BUMI — nama beta tinggi dengan pendapatan nyata memantul pertama.", avoid: "Overleveraging. Batasi nama berisiko tinggi masing-masing 8%. Keunggulan Anda adalah keberanian.", lucky: "Infrastruktur Kripto", unlucky: "Utilitas", fort: "Semua orang ketakutan. Itu sinyal Anda." },
    },
    steady: {
        en: { sig: "Venus holds steady in Taurus — dividends flow regardless of Mercury's chaos.", guid: "Your oak does not bend in this wind. <strong>JNJ and BBCA</strong> have survived every market crisis in modern history.", pwr: "Reinvest dividends received this month. Compounding is most powerful when the market doubts itself.", avoid: "Checking peers' portfolios. Their volatility is not your story.", lucky: "Consumer Staples", unlucky: "Speculative Growth", fort: "The tortoise does not check if the hare is watching." },
        id: { sig: "Venus tetap stabil di Taurus — dividen mengalir terlepas dari kekacauan Merkurius.", guid: "Pohon ek Anda tidak membungkuk di angin ini. <strong>JNJ dan BBCA</strong> telah bertahan dari setiap krisis.", pwr: "Investasikan kembali dividen bulan ini. Compounding paling kuat saat pasar meragukan dirinya.", avoid: "Memeriksa portofolio rekan. Volatilitas mereka bukan cerita Anda.", lucky: "Kebutuhan Pokok", unlucky: "Pertumbuhan Spekulatif", fort: "Kura-kura tidak memeriksa apakah kelinci sedang menonton." },
    },
    explorer: {
        en: { sig: "Jupiter expands beyond the known charts — emerging market momentum stirs.", guid: "The beaten path is crowded. <strong>NU Holdings and ARTO</strong> show resilience when developed markets wobble.", pwr: "Monitor GRAB and ARTO — emerging fintech decouples from US VIX after 72 hours of pressure.", avoid: "Home bias today. Your opportunity is where the crowd isn't looking.", lucky: "Emerging Markets", unlucky: "Developed Market Tech", fort: "The best investments are found where tourists haven't arrived yet." },
        id: { sig: "Jupiter meluas melampaui grafik yang diketahui — momentum pasar berkembang bergerak.", guid: "Jalur yang sudah dilalui penuh sesak. <strong>NU Holdings dan ARTO</strong> menunjukkan ketahanan saat pasar maju goyah.", pwr: "Pantau GRAB dan ARTO — fintech berkembang memisahkan diri dari VIX AS setelah 72 jam.", avoid: "Bias lokal hari ini. Peluang Anda di mana kerumunan tidak melihat.", lucky: "Pasar Berkembang", unlucky: "Teknologi Pasar Maju", fort: "Investasi terbaik ditemukan di mana para wisatawan belum tiba." },
    },
    guardian: {
        en: { sig: "The Moon anchors in Cancer — the fortress walls hold against the outer storm.", guid: "Your preservation strategy is validated. <strong>Capital protected is capital ready to deploy</strong> at better prices tomorrow.", pwr: "Review GLD allocation — gold outperforms in the 30 days following VIX spikes above 25.", avoid: "FOMO on high-beta names your peers mention. Their risk is not your opportunity today.", lucky: "Gold & Bonds", unlucky: "High Beta Growth", fort: "The fortress that never falls never opened its gates carelessly." },
        id: { sig: "Bulan berlabuh di Cancer — dinding benteng bertahan dari badai luar.", guid: "Strategi preservasi Anda divalidasi. <strong>Modal yang dilindungi siap di-deploy</strong> pada harga lebih baik.", pwr: "Tinjau alokasi GLD — emas mengungguli 30 hari setelah VIX melonjak di atas 25.", avoid: "FOMO pada nama beta tinggi yang disebutkan rekan. Risiko mereka bukan peluang Anda.", lucky: "Emas & Obligasi", unlucky: "Pertumbuhan Beta Tinggi", fort: "Benteng yang tidak pernah jatuh tidak pernah membuka gerbangnya sembarangan." },
    },
    strategist: {
        en: { sig: "Libra balances the scales — the market seeks equilibrium between fear and greed.", guid: "Rebalance, don't react. <strong>Check your VTI and BBCA allocations</strong> — rebalancing on red days is the disciplined move.", pwr: "Mechanical rebalancing beats emotional decisions by 1.5–2% annually. Run your allocation check now.", avoid: "Emotional sector bets. Your architecture is the strategy. Trust it.", lucky: "Diversified ETFs", unlucky: "Concentrated Bets", fort: "The architect does not rebuild the house every time the wind blows." },
        id: { sig: "Libra menyeimbangkan timbangan — pasar mencari keseimbangan antara ketakutan dan keserakahan.", guid: "Seimbangkan kembali, jangan bereaksi. <strong>Periksa alokasi VTI dan BBCA Anda</strong> — penyeimbangan di hari merah adalah langkah disiplin.", pwr: "Penyeimbangan mekanis mengalahkan keputusan emosional 1.5–2% per tahun.", avoid: "Taruhan sektor emosional. Arsitektur Anda adalah strateginya.", lucky: "ETF Terdiversifikasi", unlucky: "Taruhan Terkonsentrasi", fort: "Arsitek tidak membangun kembali rumah setiap kali angin berhembus." },
    },
    timelord: {
        en: { sig: "Pluto moves slowly — and so do you. Today's chaos is 2045's footnote.", guid: "VIX means nothing to a 20-year thesis. <strong>AMZN, TSM, and BBCA</strong> don't know what day it is. Neither should you.", pwr: "Read one annual report today instead of the news. Signal over noise, every time.", avoid: "Reacting to anything you read today. Your edge is specifically not reacting.", lucky: "Quality Compounders", unlucky: "Intraday Momentum", fort: "Today's noise is 2045's footnote. You already know the ending." },
        id: { sig: "Pluto bergerak perlahan — begitu juga Anda. Kekacauan hari ini adalah catatan kaki tahun 2045.", guid: "VIX tidak berarti apa-apa untuk tesis 20 tahun. <strong>AMZN, TSM, dan BBCA</strong> tidak tahu hari apa ini. Anda juga tidak perlu.", pwr: "Baca satu laporan tahunan hari ini alih-alih berita. Sinyal di atas kebisingan.", avoid: "Bereaksi terhadap apapun yang Anda baca hari ini.", lucky: "Compounder Kualitas", unlucky: "Momentum Intraday", fort: "Kebisingan hari ini adalah catatan kaki tahun 2045. Anda sudah tahu akhirnya." },
    },
};

// StockSlang glossary — English-only as per user spec
export const SLANG_TERMS = [
    { t: "P/E Ratio", c: "Valuation", en: "Price-to-Earnings. How many years of current profit you are paying upfront. A P/E of 20 means you are paying 20 years of today's earnings to own the stock.", se: "You're paying 20 years of profit today. Is the company worth that wait?" },
    { t: "VIX", c: "Risk", en: "CBOE Volatility Index. The market's fear gauge. Above 25 = elevated fear zone. Below 15 = complacency. It measures how much the market expects prices to swing over the next 30 days.", se: "When VIX is high, everyone is scared. That's usually when the brave get paid." },
    { t: "Moat", c: "Fundamental", en: "A durable competitive advantage that protects a company's profits from competitors. Like a castle moat — the harder it is to cross, the stronger the business. BBCA's brand trust and distribution network is a classic IDX moat.", se: "Why can't a competitor just copy this tomorrow? If they can't — that's the moat." },
    { t: "Compounding", c: "Strategy", en: "Earning returns on your previous returns. Your money makes money, which makes more money. Rp 1M at 15% per year for 30 years becomes Rp 66M without adding another rupiah.", se: "Your money makes money which makes more money. The longer you wait to start, the more you permanently lose." },
    { t: "EBITDA", c: "Valuation", en: "Earnings Before Interest, Taxes, Depreciation, and Amortisation. A rough measure of operating cash flow — what the business earns before accountants and tax authorities take their cut.", se: "How much cash the business makes before the lawyers, accountants, and tax office get involved." },
    { t: "Dividend Yield", c: "Income", en: "Annual dividends paid per share divided by the share price. A 5% yield means the company pays you 5% of the current stock price per year just for owning it — like rental income from shares.", se: "Your stock pays you rent. Yield tells you how much rent per year relative to what you paid for it." },
    { t: "Bear Market", c: "Market", en: "A market that has fallen 20% or more from its recent highs. Sustained pessimism. Falling prices. Everyone feels like an idiot for having invested.", se: "Prices going down is literally how sales work. The best stocks go on discount. Most people panic sell. Winners buy." },
    { t: "Free Cash Flow", c: "Fundamental", en: "The actual cash a company generates after all operating expenses and capital expenditures. The purest measure of business health — harder to fake than earnings.", se: "After paying all the bills and investing back into the business, how much actual cash is left? That's what you can trust." },
    { t: "LQ45", c: "IDX", en: "Indonesia's most liquid 45 stocks on the IDX — the benchmark index for institutional investors. Similar function to the Dow Jones but for Indonesian blue chips. Updated every 6 months.", se: "Indonesia Inc.'s dream team of 45. If you can't beat them, just own them all." },
    { t: "DCA", c: "Strategy", en: "Dollar Cost Averaging. Investing a fixed amount at regular intervals regardless of price. Buys more shares when prices are low, fewer when high. Removes the dangerous need to time the market.", se: "Stop trying to guess the bottom. Just keep buying on schedule. Time beats timing, every single decade." },
    { t: "IHSG", c: "IDX", en: "Indeks Harga Saham Gabungan — Indonesia's main stock market index. Tracks the performance of all stocks listed on the IDX. The heartbeat of the Indonesian capital market.", se: "If Indonesia Inc. had a report card, IHSG is the overall GPA. Watch it like a macro health check." },
    { t: "Rights Issue", c: "IDX", en: "When a company offers existing shareholders the right to buy newly issued shares, usually at a discount. Dilutes existing shareholders if they do not participate. Common in Indonesia for capital raising.", se: "The company needs money and is asking you first. Take it or get diluted — there is no third option." },
];

// Tiny i18n dictionary for the toolkit's chrome / landing copy
export const NEUTOOLS_I18N = {
    en: {
        eyebrow: "6 FREE INVESTOR TOOLS · ZERO API CALLS · WORKS OFFLINE",
        title_lead: "NEU",
        title_accent: "TOOLS",
        title_sub: "THE INVESTOR TOOLKIT",
        intro: "Six tools to <em>calculate, test, learn, and grow</em> your wealth. Free forever. No sign-up. Built by NeuLab Inc.",
        stat_tools: "Tools",
        stat_cost: "Cost",
        stat_private: "Private",
        stat_cov: "Coverage",
        grid_title: "ALL TOOLS",
        grid_count: "TOOLS AVAILABLE",
        search_ph: "Search tools…",
        back_all: "All Tools",
        sec_what: "WHAT IS THIS",
        sec_why: "WHY IT'S USEFUL",
        sec_how: "HOW TO USE",
        sec_refs: "REFERENCES",
        cta_h: "Ready to go deeper?",
        cta_p: "Professional analysis awaits.",
        slang_engonly: "StockSlang is English-only.",
    },
    id: {
        eyebrow: "6 ALAT INVESTOR GRATIS · TANPA API · BEKERJA OFFLINE",
        title_lead: "NEU",
        title_accent: "TOOLS",
        title_sub: "TOOLKIT INVESTOR",
        intro: "Enam alat untuk <em>menghitung, menguji, belajar, dan menumbuhkan</em> kekayaan Anda. Gratis selamanya.",
        stat_tools: "Alat",
        stat_cost: "Biaya",
        stat_private: "Privat",
        stat_cov: "Cakupan",
        grid_title: "SEMUA ALAT",
        grid_count: "ALAT TERSEDIA",
        search_ph: "Cari alat…",
        back_all: "Semua Alat",
        sec_what: "APA INI",
        sec_why: "MENGAPA BERGUNA",
        sec_how: "CARA PENGGUNAAN",
        sec_refs: "REFERENSI",
        cta_h: "Siap mendalami lebih lanjut?",
        cta_p: "Analisis profesional menunggu.",
        slang_engonly: "StockSlang hanya tersedia dalam Bahasa Inggris.",
    },
};
