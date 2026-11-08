"use client";

import { ChatPanel } from "@/components/chat/chat-panel";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { HomeStudios } from "@/components/parity/home-studios";
import { FirstStepLauncher } from "@/components/parity/first-step-launcher";
import { PlusMonth } from "@/components/marketing/plus-month";
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

export function AnaEkranFixture({
  conversation,
  plus,
  hasPrep,
}: {
  conversation: boolean;
  plus: boolean;
  hasPrep: boolean;
}) {
  const heroFooter = conversation ? undefined : (
    <>
      <HomeStudios freeAccount={!plus} />
      {hasPrep ? null : (
        <FirstStepLauncher
          firstName="Öğrenci"
          gradeLevel="12. sınıf"
          goalText="YKS hazırlık"
        />
      )}
      {plus ? null : (
        <PlusMonth
          variant="compact"
          monthlyKurus={29900}
          primary={{ label: "Plus'a geç", href: "/pay" }}
          secondary={{ label: "Bir ayda neler var?", href: "/pay#plus-ay" }}
        />
      )}
    </>
  );
  return (
    <ParitySorShell userInitial="Ö" streak={2} account={account(plus)}>
      <ChatPanel
        variant="parity"
        composerMode="parity"
        greetingLine="Öğrenci, iyi akşamlar! 🌙"
        startPrompt="Merhaba"
        showEmptyStarter
        startLabel="Başla"
        heroFooter={heroFooter}
        showSubjectPicker
        placeholder="Sor, konuş veya dosya gönder"
        initialConversationId={conversation ? "fixture" : undefined}
        initialMessages={conversation ? MESSAGES : []}
        hasDocuments={false}
        isPremium={plus}
        tutorStyleLabel="Adım adım"
        initialTutorStyle="step_by_step"
      />
    </ParitySorShell>
  );
}
