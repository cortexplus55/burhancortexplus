"use client";

import { ChatPanel } from "@/components/chat/chat-panel";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { FirstStepLauncher } from "@/components/parity/first-step-launcher";
import { ContinueLine } from "@/components/parity/continue-line";
import type { StudentAccountContext } from "@/lib/student/account-context";

/** Yalnız test fikstürü (E2E_FIXTURE=1): ana ekranın yerleşimini veritabanısız çizer. */
function account(plus: boolean): StudentAccountContext {
  return {
    audience: plus ? "plus" : "free",
    balance: plus ? 7200 : 0,
    freeAllowanceRemaining: 0,
    isPremium: plus,
    showsUpgradeChrome: !plus,
    subscriptionBadge: plus ? "Plus" : null,
    subscriptionAllowance: plus ? 7200 : null,
    subscriptionPeriodEnd: null,
    canSpend: true,
    isAdmin: false,
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

export function fixtureAccount(plus: boolean): StudentAccountContext {
  return account(plus);
}

export function AnaEkranFixture({
  conversation,
  plus,
  hasPrep,
  unanswered = false,
  teaching = false,
}: {
  conversation: boolean;
  plus: boolean;
  hasPrep: boolean;
  unanswered?: boolean;
  teaching?: boolean;
}) {
  const heroFooter = conversation ? undefined : hasPrep ? (
    <ContinueLine
      step={{
        prepId: "fixture",
        prepTitle: "Hücre Bölünmeleri ve Kalıtım",
        next: {
          kind: "quiz",
          kindLabel: "Konu testi",
          heading: "Mitoz ve mayoz arasındaki farklar",
          minutes: 8,
          href: "/e2e/ana-ekran?hazirlik=1&tiklandi=1",
        },
      }}
    />
  ) : (
    <FirstStepLauncher firstName="Öğrenci" gradeLevel="12. sınıf" goalText="YKS hazırlık" />
  );
  return (
    <ParitySorShell userInitial="Ö" streak={2} account={account(plus)}>
      <ChatPanel
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
    </ParitySorShell>
  );
}
