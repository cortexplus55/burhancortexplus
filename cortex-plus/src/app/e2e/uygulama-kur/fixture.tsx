"use client";

import { ParitySorShell } from "@/components/parity/sor-shell";
import { ExamPrepHome, type HomeNode } from "@/components/parity/exam-prep-home";
import { InstallAppCard } from "@/components/pwa/install-app-card";
import { fixtureAccount } from "../ana-ekran/fixture";

const KINDS: [HomeNode["kind"], string][] = [
  ["lesson", "Konu anlatımı"],
  ["quiz", "Konu testi"],
  ["flashcards", "Kartlarla tekrar"],
  ["true_false", "Doğru / Yanlış"],
  ["lesson", "İkinci ders"],
  ["quiz", "İkinci test"],
];
const PATH_NODES: HomeNode[] = KINDS.map(([kind, title], index) => ({
  id: `n${index}`,
  kind,
  title,
  dayIndex: 1 + Math.floor(index / 3),
  sortOrder: index,
  status: index < 1 ? "done" : index === 1 ? "ready" : "locked",
}));

/**
 * Yalnız test fikstürü (E2E_FIXTURE=1, 20 Kasım 2026, Faz 8): "Telefonuna Uygulama Gibi Ekle" kartı gerçek kabukta.
 * `hazirlik`: hazırlık sayfası (alt çubuk + sabit "Devam et" kartı, kart onların üstünde sabit); `sonuc`: oturum
 * görünümünde ders sonucu (alt çubuk yok, kart akışta).
 */
export function UygulamaKurFixture({ place }: { place: "hazirlik" | "sonuc" }) {
  if (place === "sonuc") {
    return (
      <ParitySorShell userInitial="Ö" streak={2} account={fixtureAccount(false)} chrome="session">
        <section className="cp-exam-node-result">
          <h1>Ders tamamlandı</h1>
          <p>Sıradaki adım, hazırlığın bir sonraki çalışmasıdır.</p>
          <InstallAppCard milestone="lesson_completed" placement="inline" />
          <a href="/e2e/uygulama-kur" className="cp-exam-continue cp-exam-continue--primary">
            Sıradaki adıma geç
          </a>
        </section>
      </ParitySorShell>
    );
  }
  return (
    <ParitySorShell userInitial="Ö" streak={2} account={fixtureAccount(false)} chrome="focus" minimalTop>
      <ExamPrepHome
        prepId="fixture-prep"
        title="Fikstür hazırlığı"
        examType="Okul"
        examDate={null}
        daysLabel=""
        progressPct={20}
        nodes={PATH_NODES}
        hasTopic
        needsIntro={false}
        startHref="/deneme-sinavlari"
        topicCount={2}
        topicsDone={0}
        topicLabels={["Birinci konu", "İkinci konu"]}
        materials={[]}
      />
      <InstallAppCard milestone="prep_created" placement="dock" />
    </ParitySorShell>
  );
}
