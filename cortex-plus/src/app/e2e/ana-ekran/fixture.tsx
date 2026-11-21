"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { TutorHistoryPanel } from "@/components/parity/tutor-history-panel";
import { actionMarker } from "@/lib/ai/chat-material-link";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { FirstStepLauncher } from "@/components/parity/first-step-launcher";
import { HomeCockpit, HomeSelectionProvider, HomeToolsTray } from "@/components/parity/home-cockpit";
import { InviteStrip } from "@/components/growth/invite-strip";
import type { CockpitPrep, CockpitStep, CockpitTopic } from "@/lib/learning/home-cockpit-model";
import type { StudentAccountContext } from "@/lib/student/account-context";
import type { FixturePlan } from "./plan";

/**
 * Hak durumu (Faz 3B, `?hak=taze|kullanildi|bitti`, `?kota=90|100`): verilmezse hesap bugünkü fikstürle aynı (sayaçsız),
 * görünüm değişmez. Sayılar test hesaplarının tohumuyla aynı (05-test-hesaplari.md).
 */
export type FixtureRights = "taze" | "kullanildi" | "bitti";
const MIDNIGHT_ISO = () => {
  const day = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return new Date(Date.parse(`${day}T00:00:00Z`) + 21 * 60 * 60 * 1000).toISOString();
};

/** Yalnız test fikstürü (E2E_FIXTURE=1): ana ekranın yerleşimini veritabanısız çizer. */
function account(input: boolean | FixturePlan, rights?: FixtureRights, quota?: number): StudentAccountContext {
  const kind: FixturePlan = typeof input === "boolean" ? (input ? "plus" : "free") : input;
  const plus = kind !== "free";
  const paid = kind === "plus" || kind === "week" || kind === "sigma";
  return {
    audience: kind === "sigma" ? "sigma" : paid ? "plus" : "free",
    balance: plus ? 7200 : 0,
    freeAllowanceRemaining: 0,
    isPremium: plus,
    showsUpgradeChrome: kind === "free",
    subscriptionBadge: kind === "sigma" ? "Sigma" : paid ? "Plus" : null,
    subscriptionAllowance: plus ? 7200 : null,
    // Sınav Haftası: dönem sonu 5 gün sonra (etiket "Plus · 5 gün"); öbür planlarda sabit bir tarih.
    subscriptionPeriodEnd:
      kind === "week"
        ? new Date(Date.now() + 4.5 * 24 * 60 * 60 * 1000).toISOString()
        : paid
          ? "2026-12-13T21:00:00.000Z"
          : null,
    planSlug: kind === "week" ? "plus-haftalik" : kind === "sigma" ? "sigma-aylik" : paid ? "plus-aylik" : null,
    canSpend: true,
    isAdmin: kind === "founder",
    resetsAtLabel: "10 Kasım 2026 00:00",
    periodKind: plus ? "monthly" : "weekly",
    usedPercent: 10,
    extraPercent: null,
    ...(rights && kind === "free"
      ? {
          freeMeters: [
            { meter: "chat", used: rights === "taze" ? 0 : rights === "kullanildi" ? 1 : 3, limit: 3, resetsAtIso: MIDNIGHT_ISO() },
            { meter: "photo", used: rights === "bitti" ? 1 : 0, limit: 1, resetsAtIso: MIDNIGHT_ISO() },
          ],
        }
      : {}),
    ...(typeof quota === "number" && paid
      ? {
          usedPercent: quota,
          balance: 0,
          quotaAllowance: 7200,
          quotaRemaining: Math.round(7200 * (1 - quota / 100)),
          resetsAtIso: "2026-12-12T00:00:00.000Z",
        }
      : {}),
  } as StudentAccountContext;
}

/** Öğretim dili örneği (8 Kasım 2026, canlı ölçümden iki gerçek cevap; gpt-6-luna). */
export const TEACHING_MESSAGES = [
  {
    "role": "user" as const,
    "content": "Mitoz ile mayoz bölünme arasındaki fark nedir?"
  },
  {
    "role": "assistant" as const,
    "content": "1. **Mitoz**, büyüme ve doku onarımı için vücut hücrelerinde gerçekleşir. Bir bölünme sonunda ana hücreyle ==genetik olarak aynı hücreler== oluşur.\n\n2. **Mayoz**, üreme hücreleri oluşurken gerçekleşir. İki bölünme sonunda kromozom sayısı yarıya iner ve genetik çeşitlilik oluşur.\n\n3. Mitozda kromozom sayısı korunur; mayozda yarıya düşer. Mitozda bir, mayozda iki kez bölünme gerçekleşir.\n\n> 📌 Sınav ipucu: Mitoz ve mayozu karşılaştırırken bölünme sayısına, oluşan hücre sayısına ve kromozom sayısına birlikte bak.\n\n> ✅ Akılda kalsın:\n> - Mayoz sonucunda ==dört haploit hücre== oluşur."
  },
  {
    "role": "user" as const,
    "content": "Kalp döngüsünde sistol ve diyastol nedir?"
  },
  {
    "role": "assistant" as const,
    "content": "- **Sistol**, kalp kasının kasılıp kanı ileri pompaladığı evredir.\n- **Diyastol**, kalp kasının gevşeyip kalp boşluklarının kanla dolduğu evredir.\n- Kulakçıklar ve karıncıklar bu evreleri sırayla geçirir; bir bölüm kasılırken diğeri gevşeyebilir.\n\n> ⚠️ Sık hata: Sistol ve diyastolü kalbin aynı anda bütünüyle kasılıp gevşemesi gibi düşünme; kulakçıklarla karıncıkların evreleri farklı zamanlarda gerçekleşir.\n\n> ✅ Akılda kalsın:\n> - **Sistol** kalbin ==kasılıp kanı pompaladığı== evredir.\n> - **Diyastol** kalbin ==gevşeyip kanla dolduğu== evredir."
  }
];

/**
 * Özet + stüdyo düğmeleri (15 Kasım 2026, `?durum=ozet`): sunucunun bastığı işaretlerle (biçim `actionMarker`).
 * Hazırlık kimliği örnek; düğmeler fikstürde bir yere gitmez.
 */
const FIXTURE_PREP = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
export const SUMMARY_MESSAGES = [
  { role: "user" as const, content: "Yüklediğim hücre bölünmesi notundan bana sınav öncesi net bir özet çıkart." },
  {
    role: "assistant" as const,
    content: [
      "- **Mitoz**: vücut hücrelerinde, ==bir bölünme== sonunda iki özdeş hücre.",
      "- **Mayoz**: üreme hücrelerinde, iki bölünme sonunda ==dört haploit hücre==.",
      "",
      "$$\\text{mayoz sonu kromozom} = \\frac{2n}{2} = n$$",
      "",
      "> 📌 Sınav ipucu: Karşılaştırma sorularında bölünme sayısı, hücre sayısı ve kromozom sayısını birlikte iste.",
      "",
      "> ⚠️ Sık hata: Krossing over mitozda da olur sanma; yalnız mayoz I sırasında görülür.",
      "",
      "> ✅ Akılda kalsın:",
      "> - Mayozda kromozom sayısı ==yarıya iner==.",
      "",
      actionMarker({ kind: "cram", label: "⚡ Sınav Sabahı Kağıdı'nı Aç", context: "Hücre Bölünmeleri ve Kalıtım", href: `/deneme-sinavlari/${FIXTURE_PREP}/sinav-sabahi` }),
      actionMarker({ kind: "lesson", label: "📖 Konu Dersine Git", context: "Hücre Bölünmeleri ve Kalıtım · Mayoz", href: `/deneme-sinavlari/${FIXTURE_PREP}/dugum/n1` }),
      actionMarker({ kind: "quiz", label: "🎯 Konu Testini Başlat", context: "Hücre Bölünmeleri ve Kalıtım · Mayoz", href: `/deneme-sinavlari/${FIXTURE_PREP}/dugum/n2` }),
    ].join("\n"),
  },
];

const MESSAGES = [
  { role: "user" as const, content: "Türevin tanımını kısaca anlatır mısın?" },
  {
    role: "assistant" as const,
    content:
      "Türev, bir fonksiyonun bir noktadaki **anlık değişim hızıdır**.\n\n- Grafikte o noktadaki teğetin eğimidir.\n- Limitle tanımlanır: (f(x+h) − f(x)) / h, h sıfıra giderken.\n\nKısa bir örnek: f(x) = x² ise f'(x) = 2x olur. x = 3'te eğim 6'dır.",
  },
  { role: "user" as const, content: "Peki ikinci türev neyi gösterir?" },
  {
    role: "assistant" as const,
    content:
      "İkinci türev, eğimin **nasıl değiştiğini** gösterir.\n\n1. Pozitifse grafik yukarı bükülür (çukur).\n2. Negatifse aşağı bükülür (tümsek).\n3. İşaret değiştirdiği yer büküm noktasıdır.\n\nKontrol sorusu: f(x) = x³ için büküm noktası nerede?",
  },
];

export function fixtureAccount(plus: boolean | FixturePlan, rights?: FixtureRights, quota?: number): StudentAccountContext {
  return account(plus, rights, quota);
}

/** Ana ekran göstergesi örneği (13 Kasım 2026): geçmiş, yakın, uzak, tarihsiz; biri geride. Sıra yükleyicinin sırası. */
function step(heading: string, kindLabel = "Konu testi"): CockpitStep {
  return { heading, kindLabel, href: "/e2e/ana-ekran?hazirlik=1&tiklandi=1" };
}

function topics(labels: string[], done: number): CockpitTopic[] {
  return labels.map((label, index) => ({
    id: `t${index}`,
    label,
    done: index < done,
    next: index >= done ? step(`${label}: konu anlatımı`, "Konu anlatımı") : null,
  }));
}

export function fixtureCockpit({
  fresh = false,
  manyTopics = false,
  lockAfterFirst = false,
}: { fresh?: boolean; manyTopics?: boolean; lockAfterFirst?: boolean } = {}): CockpitPrep[] {
  const biology = topics(
    ["Hücre zarı ve madde geçişi", "Mitoz bölünme", "Mayoz bölünme", "Mendel genetiği", "Eşeysiz üreme", "Kalıtım ve çevre"],
    fresh ? 0 : 2,
  );
  const many = topics(Array.from({ length: 18 }, (_, index) => `Ünite ${index + 1} konusu`), 5);
  const preps: CockpitPrep[] = [
    {
      id: "gecmis",
      title: "Kimya Ara Sınavı",
      subject: "Kimya",
      examDate: "2026-11-03",
      daysLeft: -10,
      behind: false,
      progress: { done: 30, total: 30, pct: 100 },
      next: null,
      topics: topics(["Mol kavramı", "Kimyasal tepkimeler"], 2),
      currentTopic: 0,
      href: "/e2e/ana-ekran?hazirlik=1&tiklandi=1",
      createdAt: "2026-10-01T00:00:00Z",
    },
    {
      id: "biyoloji",
      title: "Hücre Bölünmeleri ve Kalıtım",
      subject: "Biyoloji",
      examDate: "2026-12-18",
      daysLeft: 35,
      behind: true,
      progress: fresh ? { done: 0, total: 48, pct: 0 } : { done: 13, total: 48, pct: 27 },
      next: step("Mitoz ve mayoz arasındaki farklar"),
      topics: manyTopics ? many : biology,
      currentTopic: manyTopics ? 5 : fresh ? 0 : 2,
      href: "/e2e/ana-ekran?hazirlik=1&tiklandi=1",
      createdAt: "2026-11-01T00:00:00Z",
    },
    {
      id: "fizik",
      title: "TYT Fizik",
      subject: "Fizik",
      examDate: "2027-03-20",
      daysLeft: 127,
      behind: false,
      progress: { done: 4, total: 60, pct: 7 },
      next: step("Kuvvet ve hareket", "Konu anlatımı"),
      topics: topics(["Fizik bilimine giriş", "Madde ve özellikleri", "Kuvvet ve hareket", "Enerji"], 1),
      currentTopic: 1,
      href: "/e2e/ana-ekran?hazirlik=1&tiklandi=1",
      createdAt: "2026-11-05T00:00:00Z",
    },
    {
      id: "tarihsiz",
      title: "İngilizce Okuma",
      subject: "İngilizce",
      examDate: null,
      daysLeft: null,
      behind: false,
      progress: { done: 2, total: 20, pct: 10 },
      next: step("Ana fikir bulma", "Konu anlatımı"),
      topics: topics(["Ana fikir bulma", "Çıkarım soruları", "Kelime bilgisi"], 0),
      currentTopic: 0,
      href: "/e2e/ana-ekran?hazirlik=1&tiklandi=1",
      createdAt: "2026-11-10T00:00:00Z",
    },
  ];
  // Ücretsiz hesap ilk dersi bitirdi (`?hak=kullanildi`): 1. konunun dışındaki adımlar kilitli (sunucunun freeTopicLocks kararı).
  if (lockAfterFirst) {
    for (const prep of preps) {
      prep.topics = prep.topics.map((topic, index) => (index > 0 && topic.next ? { ...topic, next: { ...topic.next, locked: true } } : topic));
    }
  }
  return preps;
}

/**
 * teacher.v2 (`?ogretmen=v2`): son yanıt bir soruyla biter; soru "Sıra sende" kartında, altında Faz 11 tepki çipleri.
 * Kimlikler kayıtlı sohbet gibi (UUID): "Yanlışlar Defterime ekle" yalnız kayıtlı mesajda çizilir.
 */
export const V2_CONVERSATION_ID = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const V2_MESSAGES = [
  { role: "user" as const, id: "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c01", content: "Üslü sayılarda negatif üssü karıştırıyorum. 2^-3 neden 1/8 oluyor?" },
  {
    role: "assistant" as const,
    id: "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c02",
    content: "2'nin kuvvetlerine sırayla bak: 2² = 4, 2¹ = 2, 2⁰ = 1. Üs bir azaldıkça sayı ne oluyor?",
  },
];

/**
 * Faz 11 (`?ogretmen=v2&durum=yoklama`): öğretmen yanıtı formül kartı, geniş tablo, kod bloğu ve "Sık hata" kutusuyla
 * biter, en sonda mini yoklama (canlı kara tahta). Dar ekranda her biri kendi kutusunda kaymalı.
 */
const V2_CHECK_MESSAGES = [
  { role: "user" as const, id: "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c03", content: "Dik üçgende hipotenüsü nasıl bulurum?" },
  {
    role: "assistant" as const,
    id: "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c04",
    content: [
      "Dik üçgende en uzun kenar hipotenüstür; iki dik kenarla bağı **Pisagor bağıntısıdır**.",
      "",
      "$$c^2 = a^2 + b^2 \\quad\\Rightarrow\\quad c = \\sqrt{a^2 + b^2} = \\sqrt{3^2 + 4^2} = \\sqrt{9 + 16} = \\sqrt{25} = 5 \\quad\\text{ve}\\quad \\sqrt{5^2 + 12^2} = \\sqrt{169} = 13$$",
      "",
      "| Dik kenar a | Dik kenar b | Hipotenüs c | a kare | b kare | c kare | Sağlama |",
      "|---|---|---|---|---|---|---|",
      "| 3 | 4 | 5 | 9 | 16 | 25 | 9 + 16 = 25 |",
      "| 5 | 12 | 13 | 25 | 144 | 169 | 25 + 144 = 169 |",
      "",
      "```",
      "hipotenus = karekok(dik_kenar_a * dik_kenar_a + dik_kenar_b * dik_kenar_b)  # uzun bir satır; dar ekranda kutusunda kayar",
      "```",
      "",
      "> ⚠️ Sık hata: Hipotenüsü dik kenarlardan biri sanmak; hipotenüs her zaman dik açının karşısındadır.",
      "",
      "> ❓ Yoklama: Dik kenarları 6 ve 8 olan üçgenin hipotenüsü kaçtır?",
      "> A) 10",
      "> B) 12",
      "> C) 14",
    ].join("\n"),
  },
];

/**
 * Öğretmen v3 (`?ogretmen=v2&durum=takip`): sunucunun bugünkü damgalarıyla bir yanıt ("Belgeden", `[1]` atfı, kaynak
 * işareti, "Kaynaklar:" bloğu, "Genel bilgiden" bölümü, takip soruları). Ekranda yalnız metin, soluk "Notunda geçmiyor"
 * satırı ve sağa yaslı üç soru görünmeli.
 */
export const V3_FOLLOW_MESSAGES = [
  { role: "user" as const, id: "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c11", content: "Fotosentezde ışığın görevi nedir?" },
  {
    role: "assistant" as const,
    id: "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c12",
    content: [
      "#### Belgeden",
      "",
      "Fotosentezde ışık enerjisi **klorofil** tarafından soğurulur ve ==kimyasal enerjiye dönüştürülür== [1]. Bu iş yaprağın tilakoit zarlarında olur.",
      "",
      "> 📌 Sınav ipucu: Işığa bağlı evre tilakoitte, ışıktan bağımsız evre stromada gerçekleşir.",
      "",
      "#### Genel bilgiden — kaynak gösterilmez",
      "",
      "Bitkiler bu enerjiyi glikoz üretmek için kullanır; glikoz da hücrenin yakıtıdır.",
      "",
      "[[kaynak:Biyoloji notu|3|sayfa|/dokumanlar/ornek?sayfa=3]]",
      "",
      "Kaynaklar:",
      "- [1] [Biyoloji notu · s.3](/dokumanlar/ornek)",
      "[[sorular:Işığa bağlı evrede hangi ürünler oluşur?|Klorofil neden yeşil görünür?|Stroma ile tilakoit arasındaki fark nedir?]]",
    ].join("\n"),
  },
];

/** Öğretmen v3 karşılaması (`?ogretmen=v2&durum=karsilama`): "Başla"dan sonraki boş sohbet. */
const V3_WELCOME = [
  {
    role: "assistant" as const,
    content: "Merhaba Öğrenci! Bugün ne çalışmak istersin?",
    local: true,
  },
];

/** Fikstürün sesli mod yeri (`?konus=1`): "Konuş" düğmesi bunu açar; asıl sesli mod ayrı parçada. */
function FixtureLiveTalk({ onClose }: { onClose: () => void }) {
  return (
    <div className="cx-v3-capsule" role="status" data-testid="fixture-live-talk">
      <div className="cx-v3-row" style={{ minHeight: 56 }}>
        <span style={{ paddingInline: 12 }}>Sesli ders açık (örnek)</span>
        <button type="button" className="cx-v3-chip" onClick={onClose}>
          Sesli dersi kapat
        </button>
      </div>
    </div>
  );
}

export function AnaEkranFixture({
  conversation,
  teacherV2 = false,
  welcome = false,
  followUps = false,
  liveTalk = false,
  plus,
  hasPrep,
  unanswered = false,
  teaching = false,
  summary = false,
  freshPrep = false,
  manyTopics = false,
  planKind,
  rights,
  quota,
  growth = false,
  quickCheck = false,
}: {
  /** `?ogretmen=v2`: öğretmen hissi bayrağı açık (öğretmen v3 ekranı). */
  teacherV2?: boolean;
  /** Öğretmen v3 karşılaması açık başlar (`&durum=karsilama`). */
  welcome?: boolean;
  /** Öğretmen v3: damgalı yanıt ve takip soruları (`&durum=takip`). */
  followUps?: boolean;
  /** Öğretmen v3: "Konuş" düğmesi ve sesli mod yeri (`&konus=1`). */
  liveTalk?: boolean;
  /** Faz 11 (`?ogretmen=v2&durum=yoklama`): son yanıtta mini yoklama, formül, tablo, kod ve Sık hata kutusu. */
  quickCheck?: boolean;
  /** Faz 11C (`?buyume=1`): davet şeridi (bağlantı örnek). */
  growth?: boolean;
  /** Hak durumu (Faz 3B); verilmezse sayaçsız (bugünkü görünüm). */
  rights?: FixtureRights;
  /** Plus kotasının kullanılan yüzdesi (Faz 3B). */
  quota?: number;
  /** Profil kimliği (`?plan=hafta|sigma|kurucu`); verilmezse `plus` bayrağı. */
  planKind?: FixturePlan;
  /** 12'den fazla konu (`?konu=cok`): halka kesintisiz, seçim yalnız kaydırıcıyla. */
  manyTopics?: boolean;
  conversation: boolean;
  plus: boolean;
  hasPrep: boolean;
  /** Hiç adımı bitmemiş hazırlık (`?hazirlik=yeni`): kart "İlk adım seni bekliyor" ve "Başla" der. */
  freshPrep?: boolean;
  unanswered?: boolean;
  teaching?: boolean;
  /** Özet cevabı ve altındaki stüdyo düğmeleri (`?durum=ozet`). */
  summary?: boolean;
}) {
  // 13 Kasım 2026: hazırlığı olanda boş ana ekran beş parça (canlıdaki `/ogretmen` gibi).
  const cockpit = hasPrep ? fixtureCockpit({ fresh: freshPrep, manyTopics, lockAfterFirst: rights === "kullanildi" || rights === "bitti" }) : [];
  const heroFooter = conversation || hasPrep ? undefined : (
    <FirstStepLauncher firstName="Öğrenci" gradeLevel="12. sınıf" goalText="YKS hazırlık" />
  );
  const [talking, setTalking] = useState(false);
  const v3Messages = welcome ? V3_WELCOME : followUps ? V3_FOLLOW_MESSAGES : null;
  const panel = (
      <ChatPanel
        homeCockpit={cockpit.length ? <HomeCockpit aside={growth ? <InviteStrip url="https://cortexplus.app/kayit?ref=ORNEK" plan="free" /> : undefined} /> : undefined}
        homeTools={cockpit.length ? <HomeToolsTray freeAccount={!plus} /> : undefined}
        variant="parity"
        composerMode="parity"
        greetingLine="Öğrenci, iyi akşamlar! 🌙"
        startGreeting="Merhaba Öğrenci! Bugün ne çalışmak istersin? Aklındaki dersi ya da konuyu yaz; takıldığın bir soru varsa fotoğrafını da gönderebilirsin."
        showEmptyStarter
        startLabel="Başla"
        heroFooter={heroFooter}
        showSubjectPicker
        placeholder="Sor, konuş veya dosya gönder"
        initialConversationId={conversation ? (teacherV2 ? V2_CONVERSATION_ID : "fixture") : undefined}
        initialMessages={
          teacherV2 && v3Messages
            ? v3Messages
            : conversation
            ? teacherV2
              ? quickCheck
                ? V2_CHECK_MESSAGES
                : V2_MESSAGES
              : unanswered
              ? [...MESSAGES, { role: "user" as const, content: "Aynı mantıkla benzer bir örnek soru üret ve çöz." }]
              : teaching
                ? TEACHING_MESSAGES
                : summary
                  ? SUMMARY_MESSAGES
                  : MESSAGES
            : []
        }
        hasDocuments={teaching}
        isPremium={plus}
        tutorStyleLabel="Adım adım"
        initialTutorStyle="step_by_step"
        teacherV2={teacherV2}
        studentFirstName={teacherV2 ? "Öğrenci" : undefined}
        feedbackEnabled={teacherV2}
        onLiveTalk={teacherV2 && liveTalk ? () => setTalking(true) : undefined}
        liveTalkSlot={teacherV2 && talking ? <FixtureLiveTalk onClose={() => setTalking(false)} /> : undefined}
      />
  );
  return (
    <ParitySorShell
      home
      userInitial="Ö"
      userName="Öğrenci"
      streak={2}
      account={account(planKind ?? plus, rights, quota)}
      entitlements={rights ? { firstLesson: rights === "taze" ? "open" : "done", examDaysLeft: 5 } : undefined}
    >
      {/* Öğretmen v3: sayfadaki gibi geçmiş paneli (veriyi kendisi ister; e2e isteği karşılar). */}
      {teacherV2 ? <TutorHistoryPanel activeConversationId={conversation ? V2_CONVERSATION_ID : null} /> : null}
      {cockpit.length ? <HomeSelectionProvider preps={cockpit}>{panel}</HomeSelectionProvider> : panel}
    </ParitySorShell>
  );
}
