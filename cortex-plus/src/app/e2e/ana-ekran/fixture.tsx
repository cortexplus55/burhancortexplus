"use client";

import { ChatPanel } from "@/components/chat/chat-panel";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { FirstStepLauncher } from "@/components/parity/first-step-launcher";
import { HomeCockpit, HomeSelectionProvider, HomeToolsTray } from "@/components/parity/home-cockpit";
import type { CockpitPrep, CockpitStep, CockpitTopic } from "@/lib/learning/home-cockpit-model";
import type { StudentAccountContext } from "@/lib/student/account-context";
import type { FixturePlan } from "./plan";

/** Yalnız test fikstürü (E2E_FIXTURE=1): ana ekranın yerleşimini veritabanısız çizer. */
function account(input: boolean | FixturePlan): StudentAccountContext {
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

export function fixtureAccount(plus: boolean | FixturePlan): StudentAccountContext {
  return account(plus);
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

export function fixtureCockpit({ fresh = false, manyTopics = false }: { fresh?: boolean; manyTopics?: boolean } = {}): CockpitPrep[] {
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
  return preps;
}

export function AnaEkranFixture({
  conversation,
  plus,
  hasPrep,
  unanswered = false,
  teaching = false,
  freshPrep = false,
  manyTopics = false,
  planKind,
}: {
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
}) {
  // 13 Kasım 2026: hazırlığı olanda boş ana ekran beş parça (canlıdaki `/ogretmen` gibi).
  const cockpit = hasPrep ? fixtureCockpit({ fresh: freshPrep, manyTopics }) : [];
  const heroFooter = conversation || hasPrep ? undefined : (
    <FirstStepLauncher firstName="Öğrenci" gradeLevel="12. sınıf" goalText="YKS hazırlık" />
  );
  const panel = (
      <ChatPanel
        homeCockpit={cockpit.length ? <HomeCockpit /> : undefined}
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
        initialConversationId={conversation ? "fixture" : undefined}
        initialMessages={
          conversation
            ? unanswered
              ? [...MESSAGES, { role: "user" as const, content: "Aynı mantıkla benzer bir örnek soru üret ve çöz." }]
              : teaching
                ? TEACHING_MESSAGES
                : MESSAGES
            : []
        }
        hasDocuments={teaching}
        isPremium={plus}
        tutorStyleLabel="Adım adım"
        initialTutorStyle="step_by_step"
      />
  );
  return (
    <ParitySorShell home userInitial="Ö" userName="Öğrenci" streak={2} account={account(planKind ?? plus)}>
      {cockpit.length ? <HomeSelectionProvider preps={cockpit}>{panel}</HomeSelectionProvider> : panel}
    </ParitySorShell>
  );
}
