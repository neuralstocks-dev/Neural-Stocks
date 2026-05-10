/**
 * StockDNA — quiz data, types, and i18n strings.
 *
 * Pure data module shared by the adult and kid wrappers. All copy is
 * bilingual (en/id). Investor-type definitions, market-specific
 * questions, and academic references are sourced verbatim from the
 * curated psychometric framework provided by the founder.
 */

/* eslint-disable max-len */

export const QBASE = [
    {
        e: "A stock you own just dropped 30% overnight. What's your gut reaction?",
        i: "Saham yang Anda miliki turun 30% semalam. Apa reaksi spontan Anda?",
        src: "Prospect Theory — Kahneman & Tversky (1979)",
        opts: [
            { e: "Buy more — this is the dip I was waiting for.", i: "Beli lebih — ini koreksi yang saya tunggu.", t: { bold: 3, patient: 2 } },
            { e: "Stay calm and research more before deciding.", i: "Tetap tenang dan teliti lebih dahulu.", t: { analyst: 3, patient: 2 } },
            { e: "Feel uneasy but hold — I trust my thesis.", i: "Merasa tidak nyaman tapi tetap pegang.", t: { patient: 3, steady: 2 } },
            { e: "Sell half to reduce losses and anxiety.", i: "Jual setengah untuk batasi kerugian.", t: { conservative: 3, balanced: 1 } },
        ],
    },
    {
        e: "Which weekend activity sounds most like you?",
        i: "Aktivitas akhir pekan mana yang paling menggambarkan Anda?",
        src: "Big Five Personality — Mayfield et al. (2008)",
        opts: [
            { e: "Reading annual reports and financial news.", i: "Membaca laporan tahunan dan berita keuangan.", t: { analyst: 3, patient: 1 } },
            { e: "Building a side project or new business.", i: "Membangun proyek sampingan atau bisnis baru.", t: { visionary: 3, bold: 1 } },
            { e: "Relaxing with family — low-key and peaceful.", i: "Bersantai bersama keluarga — tenang dan santai.", t: { steady: 3, conservative: 2 } },
            { e: "Exploring new places, events, or networks.", i: "Menjelajahi tempat baru, acara, atau jaringan baru.", t: { explorer: 3, bold: 1 } },
        ],
    },
    { e: "MARKET", i: "MARKET", src: "Home Bias & Overconfidence — Odean (1999)", isMkt: true },
    {
        e: "Which statement best reflects your view of money?",
        i: "Pernyataan mana yang paling mencerminkan pandangan Anda tentang uang?",
        src: "Money Script Inventory — Klontz et al. (2011)",
        opts: [
            { e: "Money is freedom — I want it working passively for me.", i: "Uang adalah kebebasan — saya ingin uang bekerja pasif.", t: { steady: 3, patient: 2 } },
            { e: "Money is a scoreboard — I want to beat the market.", i: "Uang adalah papan skor — saya ingin mengalahkan pasar.", t: { bold: 3, analyst: 1 } },
            { e: "Money is security — I want to protect what I've earned.", i: "Uang adalah keamanan — saya ingin melindungi yang saya hasilkan.", t: { conservative: 3, steady: 1 } },
            { e: "Money is fuel — I invest in what will change the world.", i: "Uang adalah bahan bakar — saya berinvestasi dalam pengubah dunia.", t: { visionary: 3, explorer: 2 } },
        ],
    },
    {
        e: "A friend tripled their money on a hot tip. You feel:",
        i: "Seorang teman melipattigakan uang dari rekomendasi saham. Anda merasa:",
        src: "Social Herding — Shiller (2000), Nofsinger (2005)",
        opts: [
            { e: "Curious — tell me the ticker immediately!", i: "Penasaran — beri tahu tikernya segera!", t: { bold: 2, explorer: 2 } },
            { e: "Sceptical — hot tips are how people lose money.", i: "Skeptis — tips panas cara orang kehilangan uang.", t: { analyst: 3, conservative: 2 } },
            { e: "Happy for them, but I stick to my own system.", i: "Senang untuk mereka, tapi saya tetap pada sistem saya.", t: { steady: 3, patient: 2 } },
            { e: "Inspired to research that sector independently.", i: "Terinspirasi meneliti sektor itu sendiri.", t: { analyst: 2, visionary: 2 } },
        ],
    },
    {
        e: "How do you feel about holding a stock for 10+ years?",
        i: "Bagaimana perasaan Anda menyimpan saham selama 10+ tahun?",
        src: "Trading Frequency vs Returns — Barber & Odean (2001)",
        opts: [
            { e: "That's the only way — compounding is everything.", i: "Itu satu-satunya cara — compounding adalah segalanya.", t: { patient: 3, steady: 2 } },
            { e: "Yes, but I review the thesis annually.", i: "Ya, tapi saya tinjau tesisnya setiap tahun.", t: { analyst: 3, balanced: 1 } },
            { e: "Unlikely — markets change too fast.", i: "Tidak mungkin — pasar berubah terlalu cepat.", t: { explorer: 3, bold: 1 } },
            { e: "Only for index funds; individual stocks I trade more.", i: "Hanya untuk reksa dana indeks; saham individual lebih sering diperdagangkan.", t: { balanced: 3, conservative: 1 } },
        ],
    },
    { e: "COMPANY", i: "COMPANY", src: "Value vs Growth Premium — Fama & French (1992)", isCo: true },
    {
        e: "What is your biggest investing fear?",
        i: "Apa ketakutan terbesar Anda dalam berinvestasi?",
        src: "Loss Aversion — Kahneman & Tversky (1979)",
        opts: [
            { e: "Losing a large amount and starting over.", i: "Kehilangan jumlah besar dan harus mulai dari awal.", t: { conservative: 3, steady: 1 } },
            { e: "Missing the next big winner due to caution.", i: "Melewatkan pemenang besar berikutnya karena terlalu hati-hati.", t: { visionary: 3, bold: 2 } },
            { e: "Being too emotional and selling at the wrong time.", i: "Terlalu emosional dan menjual di waktu yang salah.", t: { analyst: 3, patient: 2 } },
            { e: "A boring portfolio that just matches the market.", i: "Portofolio membosankan yang hanya mengikuti pasar.", t: { bold: 2, explorer: 2 } },
        ],
    },
    {
        e: "How much time can you dedicate to investments weekly?",
        i: "Berapa waktu yang bisa Anda dedikasikan untuk investasi setiap minggu?",
        src: "Active vs Passive Management — Malkiel (1973)",
        opts: [
            { e: "Under 30 min — I need a simple approach.", i: "Di bawah 30 menit — saya butuh pendekatan sederhana.", t: { conservative: 2, steady: 2 } },
            { e: "1–2 hours — I can read earnings and check charts.", i: "1–2 jam — saya bisa membaca laporan dan memeriksa grafik.", t: { balanced: 2, analyst: 1 } },
            { e: "3–5 hours — I enjoy deep research.", i: "3–5 jam — saya suka riset mendalam.", t: { analyst: 3, patient: 1 } },
            { e: "Daily — markets are my passion.", i: "Setiap hari — pasar adalah passion saya.", t: { bold: 2, explorer: 2 } },
        ],
    },
    {
        e: "How do you think about portfolio diversification?",
        i: "Bagaimana Anda memikirkan diversifikasi portofolio?",
        src: "Modern Portfolio Theory — Markowitz (1952)",
        opts: [
            { e: "Concentrate in my best 3–5 ideas — diversification dilutes returns.", i: "Konsentrasi pada 3–5 ide terbaik — diversifikasi mengencerkan imbal hasil.", t: { bold: 3, visionary: 1 } },
            { e: "10–20 stocks across sectors — manageable and diversified.", i: "10–20 saham lintas sektor — dapat dikelola dan terdiversifikasi.", t: { analyst: 2, balanced: 2 } },
            { e: "Index funds for the core, individual stocks as extras.", i: "Reksa dana indeks untuk inti, saham individual sebagai tambahan.", t: { balanced: 3, steady: 1 } },
            { e: "Maximum diversification — 30+ stocks, ETFs, bonds, gold.", i: "Diversifikasi maksimum — 30+ saham, ETF, obligasi, emas.", t: { conservative: 3, steady: 2 } },
        ],
    },
];

export const MKT_Q = {
    IDX: {
        e: "You have Rp 10,000,000 to invest on the IDX today. Which feels right?",
        i: "Anda memiliki Rp 10.000.000 untuk diinvestasikan di IDX hari ini. Mana yang terasa tepat?",
        opts: [
            { e: "Split across BBCA, BMRI, TLKM — blue chips only.", i: "Bagi ke BBCA, BMRI, TLKM — hanya blue chip.", t: { steady: 3, conservative: 2 } },
            { e: "All-in on one high-conviction mid-cap I've researched.", i: "Semuanya ke satu saham mid-cap yang saya teliti mendalam.", t: { bold: 3, analyst: 2 } },
            { e: "IDX IHSG ETF — I trust the market over stock-picking.", i: "ETF IHSG IDX — saya percaya pasar dibanding stock-picking.", t: { conservative: 3, balanced: 2 } },
            { e: "Mix EV, digital banking, and nickel — Indonesia's future.", i: "Campurkan EV, bank digital, dan nikel — masa depan Indonesia.", t: { visionary: 3, explorer: 2 } },
        ],
    },
    INTL: {
        e: "You have $1,000 to invest on global markets today. Which feels right?",
        i: "Anda memiliki $1.000 untuk diinvestasikan di pasar global hari ini. Mana yang terasa tepat?",
        opts: [
            { e: "Split across 5 solid dividend-paying US companies.", i: "Bagi ke 5 perusahaan AS yang membayar dividen solid.", t: { steady: 3, conservative: 2 } },
            { e: "All-in on one high-conviction idea I've deeply researched.", i: "Semuanya ke satu ide high-conviction yang saya teliti mendalam.", t: { bold: 3, analyst: 2 } },
            { e: "VOO or VTI — passive index is king.", i: "VOO atau VTI — indeks pasif adalah raja.", t: { conservative: 3, balanced: 2 } },
            { e: "Spread across AI, emerging markets, and a biotech play.", i: "Sebar ke AI, pasar berkembang, dan saham biotek.", t: { visionary: 3, explorer: 2 } },
        ],
    },
    BOTH: {
        e: "You have Rp 10,000,000 split between IDX and global. How do you allocate?",
        i: "Anda memiliki Rp 10.000.000 untuk dibagi antara IDX dan global. Bagaimana alokasinya?",
        opts: [
            { e: "70% IDX blue chips, 30% S&P 500 ETF — diversified and safe.", i: "70% blue chip IDX, 30% ETF S&P 500 — terdiversifikasi dan aman.", t: { steady: 3, conservative: 2 } },
            { e: "50/50: IDX growth stocks and US tech giants.", i: "50/50: saham pertumbuhan IDX dan raksasa teknologi AS.", t: { bold: 2, balanced: 2 } },
            { e: "80% IDX home advantage, 20% global ETF exposure.", i: "80% IDX keunggulan lokal, 20% eksposur ETF global.", t: { conservative: 2, steady: 2 } },
            { e: "Follow the momentum — wherever opportunity is strongest.", i: "Ikuti momentum — mana pun peluang paling kuat.", t: { explorer: 3, bold: 1 } },
        ],
    },
};

export const CO_Q = {
    IDX: {
        e: "Which type of IDX company excites you most as an investment?",
        i: "Jenis perusahaan IDX mana yang paling menarik bagi Anda sebagai investasi?",
        opts: [
            { e: "Big bank (BBCA, BMRI) — proven moat, reliable dividend.", i: "Bank besar (BBCA, BMRI) — keunggulan terbukti, dividen andal.", t: { steady: 3, conservative: 2 } },
            { e: "A pre-profit EV/battery startup just IPO'd on IDX.", i: "Startup EV/baterai pra-laba yang baru saja IPO di IDX.", t: { visionary: 3, bold: 2 } },
            { e: "A dominant leader like UNVR or ASII with decades of history.", i: "Pemimpin dominan seperti UNVR atau ASII dengan sejarah puluhan tahun.", t: { analyst: 3, patient: 2 } },
            { e: "A fintech disruptor like GOTO or ARTO reshaping Indonesia.", i: "Disruptor fintech seperti GOTO atau ARTO yang merombak Indonesia.", t: { explorer: 3, visionary: 1 } },
        ],
    },
    INTL: {
        e: "Which global company type excites you most as an investment?",
        i: "Jenis perusahaan global mana yang paling menarik sebagai investasi?",
        opts: [
            { e: "A utility or consumer staple with 40 years of dividend growth.", i: "Utilitas atau kebutuhan pokok dengan 40 tahun pertumbuhan dividen.", t: { steady: 3, conservative: 2 } },
            { e: "A pre-revenue deep tech or biotech that could 10x.", i: "Teknologi dalam atau biotek pra-pendapatan yang bisa 10x.", t: { visionary: 3, bold: 2 } },
            { e: "A global market leader with a proven moat (MSFT, Visa).", i: "Pemimpin pasar global dengan keunggulan terbukti (MSFT, Visa).", t: { analyst: 3, patient: 2 } },
            { e: "A disruptive marketplace reshaping an entire industry.", i: "Marketplace disruptif yang merombak seluruh industri.", t: { explorer: 3, visionary: 1 } },
        ],
    },
    BOTH: {
        e: "Which company mix excites you most as investments?",
        i: "Campuran perusahaan mana yang paling menarik bagi Anda sebagai investasi?",
        opts: [
            { e: "IDX blue chips + global dividend aristocrats — income focus.", i: "Blue chip IDX + aristokrat dividen global — fokus pendapatan.", t: { steady: 3, conservative: 2 } },
            { e: "IDX growth stories + US tech — best of both worlds.", i: "Pertumbuhan IDX + teknologi AS — yang terbaik dari keduanya.", t: { bold: 2, visionary: 2 } },
            { e: "IDX fundamentals + global ETFs — disciplined and diversified.", i: "Fundamental IDX + ETF global — disiplin dan terdiversifikasi.", t: { analyst: 2, balanced: 2 } },
            { e: "IDX disruptors + global moonshots — I believe in big bets.", i: "Disruptor IDX + moonshot global — saya percaya pada taruhan besar.", t: { visionary: 3, explorer: 2 } },
        ],
    },
};

export const REFERENCES = [
    { e: "<em>Prospect Theory</em> — Kahneman & Tversky (1979). Econometrica 47(2). Foundation of behavioral finance: loss aversion and asymmetric evaluation of gains vs. losses. Basis: Q1, Q8.", i: "<em>Teori Prospek</em> — Kahneman & Tversky (1979). Fondasi keuangan perilaku: aversi kerugian. Dasar: P1, P8.", u: "https://www.jstor.org/stable/1914185" },
    { e: "<em>Boys Will Be Boys</em> — Barber & Odean (2001). QJE 116(1). Frequent traders underperform by 6.5%/year vs patient investors. Basis: Q6.", i: "<em>Boys Will Be Boys</em> — Barber & Odean (2001). QJE. Trader yang sering berdagang berkinerja lebih buruk 6,5%/tahun. Dasar: P6.", u: "https://doi.org/10.1162/003355301556400" },
    { e: "<em>Big Five Personality & Investment Behaviour</em> — Mayfield, Perdue & Wooten (2008). JFCP 19(2). Links personality traits to portfolio choices. Basis: Q2.", i: "<em>Kepribadian Big Five & Perilaku Investasi</em> — Mayfield et al. (2008). JFCP. Mengkorelasikan sifat kepribadian dengan pilihan portofolio. Dasar: P2.", u: "https://doi.org/10.1080/10920277.2008.10476032" },
    { e: "<em>Portfolio Selection</em> — Markowitz (1952). JF 7(1). Modern Portfolio Theory: diversification reduces risk without sacrificing return. Basis: Q10.", i: "<em>Seleksi Portofolio</em> — Markowitz (1952). JF. Teori Portofolio Modern: diversifikasi mengurangi risiko. Dasar: P10.", u: "https://doi.org/10.2307/2975974" },
    { e: "<em>Common Factors in Returns</em> — Fama & French (1992). JF 47(2). Value vs. Growth premium; underpins stock categorisation. Basis: Q7.", i: "<em>Faktor Umum dalam Imbal Hasil</em> — Fama & French (1992). JF. Premium Nilai vs. Pertumbuhan. Dasar: P7.", u: "https://doi.org/10.1111/j.1540-6261.1992.tb04398.x" },
    { e: "<em>Money Scripts</em> — Klontz et al. (2011). JFT 2(1). Money belief patterns predict financial behaviour. Basis: Q4.", i: "<em>Naskah Uang</em> — Klontz et al. (2011). JFT. Pola keyakinan uang memprediksi perilaku keuangan. Dasar: P4.", u: "https://doi.org/10.4148/jft.v2i1.1485" },
];
