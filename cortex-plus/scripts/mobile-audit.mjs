/*
  Mobil düzen denetimi — gözle bakmanın yerine ÖLÇÜM.

  Neden betik: 95 ekranı üç genişlikte gözle taramak hem uzun hem de
  güvenilmez. Aranan şeyler sayıyla ifade edilebiliyor:

    - yatay taşma            -> scrollWidth > innerWidth
    - kenardan taşan öğe     -> rect.right > innerWidth
    - kenara sıfırlanan yazı -> rect.left < ESIK
    - küçük dokunma hedefi   -> 44px altı buton/bağlantı
    - üst üste binme         -> iki yaprak metnin kutuları kesişiyor

  Yanlış alarm en büyük tehlike: 200 uydurma bulgu, 5 gerçek bulgudan
  daha kötü. O yüzden her kontrol elemeli — gizli öğeler, yatay kaydırma
  kapsayıcıları ve paragraf içi bağlantılar ayıklanıyor.
*/
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const BASE = process.env.AUDIT_BASE ?? "http://127.0.0.1:3005";
const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
// Sol kenar boşluğu eşiği: 12px altı "kenara yapışmış" sayılıyor.
const EDGE = 12;
const TAP = 44;

const WIDTHS = [
  { w: 360, h: 780, label: "360 (dar Android)" },
  { w: 390, h: 844, label: "390 (iPhone)" },
  { w: 430, h: 932, label: "430 (iPhone Pro Max)" },
];

/*
  Bu fonksiyon TARAYICIDA çalışıyor: Node tarafındaki sabitleri göremez,
  o yüzden eşikler argüman olarak geçiliyor. (İlk yazımda kapanış
  değişkeni sanıp EDGE'i dışarıdan okumaya çalıştım; her sayfa
  ReferenceError verdi.)
*/
const probe = ({ EDGE, TAP }) => {
  const out = {
    docOverflow: 0,
    overflowing: [],
    offLeft: [],
    flushLeft: [],
    clippedText: [],
    smallTaps: [],
    overlaps: [],
    fixed: [],
  };
  /*
    GENİŞLİK — `window.innerWidth` DEĞİL.

    Playwright'ın `isMobile: true` ayarıyla Chromium `window.innerWidth`i
    360 yerine 459 bildiriyor; gerçek düzen genişliği
    `documentElement.clientWidth` (360) ve `visualViewport.width` (360).
    Ölçüm innerWidth'e bakarken 99px fazla toleranslıydı: ekranın gerçek
    kenarından 99px'e kadar taşan her öğe "sorun yok" diye geçiyordu.
    Üstelik tam sayfa ekran görüntüsü de 459px'lik tuvale çiziliyor ve
    zemin 360'ta bittiği için sağda olmayan bir "dikiş" görünüyor —
    ürün hatası sanılan şey ölçüm hatasıydı.
  */
  const vw = document.documentElement.clientWidth || window.innerWidth;
  /*
    Taşma hem <html> hem <body> üzerinden gelebiliyor ve ikisi ayrı
    ölçülüyor. İlk yazımda yalnızca documentElement'e bakıyordum: ana
    önizleme 360px'lik ekranda 459px'e taşıyordu, ölçüm "0 taşma" dedi,
    hatayı ancak tam sayfa ekran görüntüsünün 360'tan geniş çıkması
    gösterdi. Sayı yanlışsa, sayıya güvenen her şey yanlış.
  */
  out.docOverflow = Math.max(
    0,
    Math.round(document.documentElement.scrollWidth - vw),
    Math.round((document.body?.scrollWidth ?? 0) - vw),
  );

  const label = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = (el.getAttribute("class") || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4)
      .join(".");
    const txt = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${cls ? "." + cls : ""}${txt ? ` «${txt}»` : ""}`;
  };

  /*
    GÖRÜNÜRLÜK — en kritik eleme.

    İlk yazımda yalnızca kutu boyutuna ve opacity'ye bakıyordum ve ana
    sayfada 15 "üst üste binme" buldum; hepsi uydurmaydı. Sebep: SSS
    bölümü kapalı `<details>` cevaplarını `overflow:hidden` ile kırpıyor.
    Paragrafın kendi kutusu doğal yüksekliğini koruyor, ekranda ise
    görünmüyor. Kırpmayı hesaba katmayan bir ölçüm, kapalı bir cevabı
    başka bir sorunun üstüne binmiş sanıyor.

    Bu yüzden öğenin ATALARININ kırpma kutularıyla kesişimi alınıyor:
    ekranda gerçekten kalan alan buysa, ölçüm onu kullanıyor.
  */
  const clippedRect = (el) => {
    let box = el.getBoundingClientRect();
    let left = box.left, top = box.top, right = box.right, bottom = box.bottom;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ps = getComputedStyle(p);
      const clips =
        ps.overflow !== "visible" ||
        ps.overflowX !== "visible" ||
        ps.overflowY !== "visible";
      if (!clips) continue;
      const pr = p.getBoundingClientRect();
      left = Math.max(left, pr.left);
      top = Math.max(top, pr.top);
      right = Math.min(right, pr.right);
      bottom = Math.min(bottom, pr.bottom);
      if (right <= left || bottom <= top) break;
    }
    return {
      left, top,
      right: Math.max(right, left),
      bottom: Math.max(bottom, top),
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
  };

  /*
    GÖRÜNÜRLÜK — tarayıcının kendi cevabı kullanılıyor.

    Elle yazdığım kontrol öğenin KENDİ opacity'sine bakıyordu ve ana
    sayfada 15 uydurma "üst üste binme" üretti. Sebep: bu site kaydırınca
    görünen animasyon kullanıyor, ekran dışındaki bölüm bir ATANIN
    opacity: 0 değeriyle duruyor. Alt öğenin opacity'si 1, kutusu da
    yerinde — ama ekranda hiçbir şey yok.

    `checkVisibility` ata zincirindeki opacity ve visibility'yi de,
    kapalı `<details>` içeriğini de (Chromium bunu `::details-content`
    sözde öğesinde `content-visibility: hidden` ile saklıyor, ata
    zincirinde görünmez) doğru cevaplıyor.
  */
  const visible = (el, r) =>
    r.width > 2 &&
    r.height > 2 &&
    el.checkVisibility({ opacityProperty: true, visibilityProperty: true });

  /*
    Yatay kaydırma kapsayıcısı: içindeki taşma KASITLI, kullanıcı
    kaydırıp görebiliyor.

    Ama `overflow-x: auto` tek başına yetmiyor. CSS'te `overflow-y: auto`
    verildiğinde diğer eksen de `auto`ya dönüyor — yani dikey kaydırılan
    her liste "yatay kaydırıcı" gibi görünüyor. Sor ekranındaki mesaj
    listesi tam bu durumda: ölçüm balonlardaki kesilmeyi hiç görmedi,
    çünkü hepsini "kasıtlı taşma" sayıp atladı. Ekran görüntüsünde ise
    uzun kelime ekranın kenarında ortadan kopuyordu.

    Doğru ölçüt GERÇEKTEN yatay kaydırıyor olması: içerik kapsayıcıdan
    geniş değilse orada kaydırma yok, kesilme var.
  */
  const inScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (
        (ox === "auto" || ox === "scroll") &&
        p.scrollWidth > p.clientWidth + 1
      ) {
        return true;
      }
    }
    return false;
  };

  // Ekran dışına alınmış paneller (kapalı çekmece, menü) taşma sayılmaz.
  const translatedOut = (el) => {
    for (let p = el; p; p = p.parentElement) {
      const t = getComputedStyle(p).transform;
      if (t && t !== "none" && /matrix/.test(t)) {
        const m = t.match(/matrix.*\(([^)]+)\)/);
        if (m) {
          const parts = m[1].split(",").map(Number);
          const tx = parts.length === 6 ? parts[4] : parts[12];
          if (Math.abs(tx) > 40) return true;
        }
      }
      if (getComputedStyle(p).position === "fixed" && p.getBoundingClientRect().right < 1) return true;
    }
    return false;
  };

  /*
    Geliştirme aracı katmanları ölçüme girmiyor.

    `nextjs-portal`, Next.js'in dev modundaki göstergesi: sol alt köşede
    yarısı ekran dışında duran bir yuvarlak. Ekran görüntüsünde kart
    yazısının üstüne binmiş görünüyor ve ürün hatası sanılıyor — oysa
    üretim derlemesinde hiç yok. Ölçtüğü şey ürün olmayan bir aletin
    kendisi olan bir denetim, yanlış iş üretir.
  */
  const isDevOverlay = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const t = n.tagName.toLowerCase();
      if (t === "nextjs-portal" || n.id === "__next-build-watcher") return true;
      if (n.hasAttribute?.("data-nextjs-dev-tools-button")) return true;
    }
    return false;
  };

  const leaves = [];
  for (const el of document.querySelectorAll("body *")) {
    if (isDevOverlay(el)) continue;
    const st = getComputedStyle(el);
    const raw = el.getBoundingClientRect();
    // Ekranda gerçekten kalan alan; kırpılmışsa küçülmüş hâli.
    const r = clippedRect(el);
    if (!visible(el, raw) || r.width <= 2 || r.height <= 2) continue;

    if (st.position === "fixed" || st.position === "sticky") {
      out.fixed.push({ el: label(el), pos: st.position, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) });
    }

    if (r.right > vw + 1 && !inScroller(el) && !translatedOut(el)) {
      out.overflowing.push({ el: label(el), right: Math.round(r.right), over: Math.round(r.right - vw) });
    }

    /*
      SOL kenardan kesilenler. Bunu ilk sürümde hiç kontrol etmiyordum ve
      önizlemede sol kenardan kesilmiş, kart yazısının üstüne binmiş bir
      yuvarlak ancak ekran görüntüsünde göründü. Kullanıcının "sol tarafa
      sıfır olmuş" dediği sınıf tam olarak bu.
    */
    if (r.left < -1 && !inScroller(el) && !translatedOut(el)) {
      out.offLeft.push({ el: label(el), left: Math.round(r.left) });
    }

    // Kendi metni olan öğe (çocuklardan değil) = yaprak metin.
    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();

    if (ownText.length > 1) {
      leaves.push({ el, r, text: ownText });
      /*
        Yazının başladığı yer ölçülüyor, kutunun değil.

        `px-5` eklenen ortalı bir paragraf hâlâ `left: 0` bildiriyordu:
        kutu sıfırdan başlıyor, dolgu içeride kalıyor ve yazı aslında
        20px içeriden başlıyor. Kutuya bakan ölçüm düzeltilmiş bir
        sayfayı "hâlâ bozuk" diye raporluyor — yani doğru düzeltmeyi
        geri almaya ikna eder.
      */
      const st2 = getComputedStyle(el);

      /*
        YAZI KIRPILIYOR MU.

        Kırpma farkındalığı `<details>` yanlış alarmını susturmak için
        eklendi, ama sonra GERÇEK kırpmayı da susturmaya başladı: Sor
        ekranındaki mesaj balonlarında uzun kelime ekranın kenarında
        ortadan kopuyordu ve ölçüm "0 taşma" diyordu. Ekran görüntüsünde
        açıkça görünen şeyi sayı görmüyordu.

        Bu yüzden öğenin DOĞAL kutusu ile ekranda KALAN kutusu
        karşılaştırılıyor. Doğal genişlik belirgin biçimde büyükse yazının
        bir kısmı görünmüyor demektir — kullanıcının "eksik parçalar"
        dediği şey.

        Kasıtlı kısaltma hariç: `text-overflow: ellipsis` ve
        `-webkit-line-clamp` zaten "buraya sığmıyorsa kes" demek, ve
        yatay kaydırılabilen kapsayıcıda kullanıcı içeriği görebiliyor.
      */
      const intentional =
        st2.textOverflow === "ellipsis" ||
        (st2.webkitLineClamp && st2.webkitLineClamp !== "none");
      if (!intentional && !inScroller(el) && raw.width - r.width > 6) {
        out.clippedText.push({
          el: label(el),
          kayip: Math.round(raw.width - r.width),
        });
      }

      const textLeft = r.left + (parseFloat(st2.paddingLeft) || 0);
      if (textLeft < EDGE && r.width > 24) {
        out.flushLeft.push({ el: label(el), left: Math.round(textLeft) });
      }
    }

    if (/^(button|a|input|select|textarea)$/i.test(el.tagName) || el.getAttribute("role") === "button") {
      // Paragraf içi bağlantı kucuk olabilir; yalnizca blok gibi duranlar.
      /*
        Dokunma hedefi KENDİ kutusuyla ölçülüyor (`raw`), kırpılmış hâliyle
        değil.

        Demo sayfasındaki yatay şeritte bir öğe 16x44 diye raporlanıyordu:
        öğe normal boyutta ama şeridin görünür alanından kısmen dışarıda
        kalmış ve kırpılmış kutusu 16px çıkıyor. Bir düğmenin
        basılabilirliği o an ne kadarının göründüğüne bağlı değil —
        kullanıcı kaydırıp tamamını görüyor.
      */
      const inline = getComputedStyle(el).display === "inline";
      if (!inline && (raw.height < TAP || raw.width < TAP)) {
        out.smallTaps.push({ el: label(el), w: Math.round(raw.width), h: Math.round(raw.height) });
      }
    }
  }

  // Ust uste binme: yaprak metinler arasi, biri digerinin atasi degilse.
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i], b = leaves[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ox > 4 && oy > 4) {
        const area = ox * oy;
        const smaller = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
        if (smaller > 0 && area / smaller > 0.3) {
          out.overlaps.push({ a: label(a.el), b: label(b.el), area: Math.round(area) });
        }
      }
    }
  }
  return out;
};

const routes = process.argv.slice(2);
if (!routes.length) {
  console.error("kullanim: node mobile-audit.mjs /rota1 /rota2 ...");
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
const results = [];

for (const route of routes) {
  for (const size of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width: size.w, height: size.h },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
    let status = 0;
    try {
      const res = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 60000 });
      status = res?.status() ?? 0;
      await page.waitForTimeout(600);
      /*
        Kaydırınca görünen bölümleri gerçek kullanıcı gibi tetikle.

        Bu olmadan ölçüm sayfanın yalnızca ilk ekranını görüyor; geri
        kalan her şey opacity: 0 olduğu için "görünmez" sayılıyor ve
        sayfanın altındaki gerçek sorunlar hiç ölçülmüyor.
      */
      await page.evaluate(async () => {
        const step = Math.round(window.innerHeight * 0.8);
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
        }
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => setTimeout(r, 400));
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 400));
      });
      await page.waitForTimeout(400);
      const data = await page.evaluate(probe, { EDGE, TAP });
      results.push({ route, width: size.w, status, url: page.url().replace(BASE, ""), errors, ...data });
    } catch (err) {
      results.push({ route, width: size.w, status, error: String(err).slice(0, 160), errors });
    }
    await ctx.close();
  }
}
await browser.close();

writeFileSync(
  process.env.AUDIT_OUT ?? "/tmp/audit.json",
  JSON.stringify(results, null, 1),
);

// Ozet
const score = (r) =>
  (r.docOverflow ?? 0) * 3 +
  (r.overflowing?.length ?? 0) * 3 +
  (r.offLeft?.length ?? 0) * 3 +
  (r.flushLeft?.length ?? 0) * 2 +
  (r.clippedText?.length ?? 0) * 4 +
  (r.overlaps?.length ?? 0) * 4 +
  (r.smallTaps?.length ?? 0);

const byRoute = new Map();
for (const r of results) {
  const cur = byRoute.get(r.route) ?? { route: r.route, s: 0, rows: [] };
  cur.s += score(r);
  cur.rows.push(r);
  byRoute.set(r.route, cur);
}

console.log("rota".padEnd(42), "gen", "taşma", "sağ", "sol", "kesik", "yapışık", "binme", "küçük", "durum");
for (const { route, rows } of [...byRoute.values()].sort((a, b) => b.s - a.s)) {
  for (const r of rows) {
    console.log(
      route.padEnd(42),
      String(r.width).padStart(3),
      String(r.docOverflow ?? "-").padStart(5),
      String(r.overflowing?.length ?? "-").padStart(3),
      String(r.offLeft?.length ?? "-").padStart(3),
      String(r.clippedText?.length ?? "-").padStart(5),
      String(r.flushLeft?.length ?? "-").padStart(7),
      String(r.overlaps?.length ?? "-").padStart(5),
      String(r.smallTaps?.length ?? "-").padStart(5),
      r.error ? "HATA " + r.error.slice(0, 40) : (r.url !== route ? "->" + r.url : r.status),
    );
  }
}
