"use client";

import { useState } from "react";
import Link from "next/link";
import { Lightbulb, Sparkles } from "lucide-react";
import {
  ComparisonCarousel,
  ExamTrapCard,
  FormulaCard,
  MemoryHookCard,
} from "@/components/parity/lesson-visual-cards";
import { TOOLS } from "@/lib/parity/tools";
import "@/styles/exam-lesson-steps.css";

/**
 * /ornek görsel şöleni (Görev 6). Model çağrısı yok: Görev 1–5 kartları
 * fotosentez notundan sabit içerikle gösterilir; Sokratik kalkan ve
 * simülasyon da önceden yazılmış.
 */

const TOPIC = "fotosentez";

const FORMULA = {
  title: "Fotosentez denklemi",
  expression: "6CO₂ + 6H₂O + ışık → C₆H₁₂O₆ + 6O₂",
  symbols: [
    { symbol: "CO₂", meaning: "karbondioksit" },
    { symbol: "H₂O", meaning: "su" },
    { symbol: "C₆H₁₂O₆", meaning: "glikoz" },
    { symbol: "O₂", meaning: "oksijen" },
  ],
};

const TRAP = {
  title: "Yeşil görünmenin sebebi",
  wrong: "Klorofil yeşil ışığı soğurduğu için yaprak yeşil görünür.",
  right: "Klorofil mavi ve kırmızıyı soğurur, yeşili yansıtır; yaprak bu yüzden yeşil görünür.",
  tell: "Soru 'soğurduğu için' diyorsa dur — notun cümlesi yansımadır.",
};

const HOOK = {
  kind: "analogy" as const,
  title: "Sünger ve boya",
  body: "Klorofil mavi-kırmızı boyayı çeken bir sünger gibi: yeşil boyayı almıyor, o da yapraktan geri sektiği için gözüne yeşil geliyor.",
};

const CAROUSEL = {
  title: "Işık ve tepkime",
  mode: "compare" as const,
  slides: [
    {
      title: "Işığa bağlı",
      body: "Tilakoitte olur. Işık enerjisi suyu parçalar, oksijen çıkar.",
      points: ["Yer: tilakoit zarı", "Çıktı: O₂, ATP, NADPH"],
    },
    {
      title: "Işıktan bağımsız",
      body: "Stromada olur. CO₂ glikoza bağlanır; ışık doğrudan gerekmez ama ATP ister.",
      points: ["Yer: stroma", "Çıktı: glikoz"],
    },
  ],
};

const SIM_TOOL = TOOLS.find((tool) => tool.id === "birim-cember") ?? TOOLS[0]!;

export function DemoVisualFeast() {
  return (
    <section className="dm-feast" aria-labelledby="dm-feast-title">
      <p className="dm-feast-kicker">Kayıtsız ön izleme</p>
      <h2 id="dm-feast-title" className="dm-feast-title">
        Derste göreceğin görsel şölen
      </h2>
      <p className="dm-feast-lead">
        Aşağıdakiler gerçek ders kartları — kredi yok, model çağrısı yok. Kayıt
        olunca kendi notunla aynı dilde açılır.
      </p>

      <div className="dm-feast-grid">
        <article className="dm-feast-card">
          <h3>🧮 Formül Kartı</h3>
          <FormulaCard formula={FORMULA} />
        </article>

        <article className="dm-feast-card">
          <h3>🔥 Sınav Tuzağı (ÖSYM Nereden Vurur?)</h3>
          <ExamTrapCard trap={TRAP} topicHint={TOPIC} />
        </article>

        <article className="dm-feast-card">
          <h3>🧠 Hafıza Çivisi</h3>
          <MemoryHookCard hook={HOOK} topicHint={TOPIC} />
        </article>

        <article className="dm-feast-card">
          <h3>⚖️ Kaydırılabilir Karşılaştırma</h3>
          <ComparisonCarousel carousel={CAROUSEL} topicHint={TOPIC} />
        </article>

        <article className="dm-feast-card">
          <h3>💡 Sokratik İpucu Kalkanı</h3>
          <SocraticHintShield />
        </article>

        <article className="dm-feast-card">
          <h3>📐 İnteraktif Simülasyon</h3>
          <p className="dm-feast-sim-lead">{SIM_TOOL.blurb}</p>
          <div className="dm-feast-sim" aria-hidden>
            <span className="dm-feast-sim-circle" />
            <span className="dm-feast-sim-arm" />
            <span className="dm-feast-sim-dot" />
          </div>
          <Link href="/araclar/birim-cember" className="dm-btn dm-btn--sm dm-feast-sim-link">
            {SIM_TOOL.title} →
          </Link>
          <p className="dm-feast-sim-note">
            Araçlar kayıtlı hesapta açılır; burası ön izleme.
          </p>
        </article>
      </div>
    </section>
  );
}

function SocraticHintShield() {
  const [shown, setShown] = useState(0);
  return (
    <div className="dm-socratic" aria-label="Sokratik ipucu kalkanı">
      <p className="dm-socratic-q">
        Klorofil yeşil ışığı soğurduğu için yapraklar yeşil, değil mi?
      </p>
      <aside className="dm-socratic-box">
        <Lightbulb className="h-4 w-4" aria-hidden />
        <div>
          <p className="dm-socratic-label">1. İpucu</p>
          <p>
            {shown >= 1
              ? "Sorunun kilidi 'soğurduğu için' cümlesi. Notun ne diyor: soğurma mı, yansıma mı?"
              : "Cevap kalkanın arkasında. Önce ipucunu aç."}
          </p>
        </div>
      </aside>
      {shown >= 2 ? (
        <aside className="dm-socratic-box dm-socratic-box--concept">
          <Sparkles className="h-4 w-4" aria-hidden />
          <div>
            <p className="dm-socratic-label">Kavram</p>
            <p>Klorofil mavi ve kırmızıyı soğurur, yeşili yansıtır.</p>
          </div>
        </aside>
      ) : null}
      {shown >= 3 ? (
        <p className="dm-socratic-answer">
          Hayır — yaprak yeşil görünür çünkü yeşil ışık yansır. Soğurulan renk
          görünmez.
        </p>
      ) : (
        <button
          type="button"
          className="dm-btn dm-btn--sm"
          onClick={() => setShown((value) => value + 1)}
        >
          {shown === 0 ? "İpucunu aç" : shown === 1 ? "Kavramı göster" : "Cevabı aç"}
        </button>
      )}
    </div>
  );
}
