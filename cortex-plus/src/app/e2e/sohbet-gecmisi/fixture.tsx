"use client";

import { ChatPanel } from "@/components/chat/chat-panel";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { HomeCockpit, HomeSelectionProvider, HomeToolsTray } from "@/components/parity/home-cockpit";
import { SohbetlerList } from "@/components/parity/sohbetler-list";
import { TutorHistoryPanel } from "@/components/parity/tutor-history-panel";
import { groupConversations } from "@/lib/tutor/conversation-groups";
import { fixtureAccount, fixtureCockpit } from "../ana-ekran/fixture";

/** Fikstürde açık sohbetin kimliği: panelde bu satır seçili görünür. */
export const FIXTURE_ACTIVE_CONVERSATION = "c-mayoz";

const MESSAGES = [
  { role: "user" as const, content: "Mayoz bölünmede krossing over hangi evrede olur?" },
  {
    role: "assistant" as const,
    content: "Krossing over **profaz I**'de, homolog kromozomlar eşleşince olur. Sence bu neden genetik çeşitliliği artırır?",
  },
];

/** Geçmiş konuşmalar sayfasının gruplu hâli için örnek: iki hazırlık + Genel (sunucunun gruplama işleviyle). */
const LIST_ROWS = [
  { id: "c-mayoz", title: "Mayoz ve krossing over", updatedAt: "2026-11-21T10:00:00.000Z" },
  { id: "c-mitoz", title: "Mitoz evreleri", updatedAt: "2026-11-20T10:00:00.000Z" },
  { id: "c-hiz", title: "Ortalama hız ile anlık hız farkı nedir ve neden önemlidir", updatedAt: "2026-11-19T10:00:00.000Z" },
  { id: "c-g1", title: "Çalışma planı önerisi", updatedAt: "2026-11-18T10:00:00.000Z" },
  { id: "c-g2", title: null, updatedAt: "2026-11-01T10:00:00.000Z" },
];
const LIST_GROUPS = groupConversations({
  conversations: LIST_ROWS,
  links: [
    { conversationId: "c-mayoz", prepId: "p-hucre" },
    { conversationId: "c-mitoz", prepId: "p-hucre" },
    { conversationId: "c-hiz", prepId: "p-fizik" },
  ],
  preps: [
    { id: "p-hucre", title: "Hücre Bölünmeleri ve Kalıtım", examDate: "2026-12-26" },
    { id: "p-fizik", title: "TYT Fizik: Hareket ve Kuvvet", examDate: "2027-03-28" },
  ],
});

/**
 * Yalnız test fikstürü (E2E_FIXTURE=1): öğretmen ana ekranı + geçmiş paneli, veritabanısız. Panelin verisi
 * `/api/teacher/conversations`'tan gelir; uçtan uca test o isteği kendi cevabıyla karşılar.
 */
export function SohbetGecmisiFixture({ state }: { state: "sohbet" | "hazirlik" | "bos" | "liste" }) {
  if (state === "liste") {
    return (
      <ParitySorShell userInitial="Ö" userName="Öğrenci" streak={2} account={fixtureAccount(false)}>
        <SohbetlerList items={LIST_ROWS} groups={LIST_GROUPS} now="2026-11-21T12:00:00.000Z" />
      </ParitySorShell>
    );
  }
  const conversation = state === "sohbet";
  const cockpit = state === "hazirlik" ? fixtureCockpit() : [];
  const panel = (
    <ChatPanel
      homeCockpit={cockpit.length ? <HomeCockpit /> : undefined}
      homeTools={cockpit.length ? <HomeToolsTray freeAccount={false} /> : undefined}
      variant="parity"
      composerMode="parity"
      greetingLine="Öğrenci, iyi akşamlar! 🌙"
      startGreeting="Merhaba Öğrenci! Bugün ne çalışmak istersin?"
      showEmptyStarter
      startLabel="Başla"
      showSubjectPicker
      placeholder="Sor, konuş veya dosya gönder"
      initialConversationId={conversation ? FIXTURE_ACTIVE_CONVERSATION : undefined}
      initialMessages={conversation ? MESSAGES : []}
      hasDocuments={false}
      isPremium={false}
      tutorStyleLabel="Adım adım"
      initialTutorStyle="step_by_step"
      teacherV2
    />
  );
  return (
    <ParitySorShell home userInitial="Ö" userName="Öğrenci" streak={2} account={fixtureAccount(false)}>
      <TutorHistoryPanel activeConversationId={conversation ? FIXTURE_ACTIVE_CONVERSATION : null} />
      {cockpit.length ? <HomeSelectionProvider preps={cockpit}>{panel}</HomeSelectionProvider> : panel}
    </ParitySorShell>
  );
}
