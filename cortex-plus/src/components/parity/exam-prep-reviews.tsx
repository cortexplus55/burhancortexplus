"use client";

import Link from "next/link";

const WRONG_TYPE_LABEL: Record<string, string> = {
  misconception: "Yanılgı",
  calculation: "Hesap",
  definition: "Tanım",
  procedure: "İşlem",
  lesson_check_miss: "Kısa tekrar",
  unknown: "Diğer",
};

export type ReviewItem = {
  id: string;
  claim: string;
  corrected: string | null;
  wrongType: string;
  topicLabel: string | null;
  questionPreview: string | null;
  createdAt: string;
  reviewNodeHref: string | null;
};

/** Çözülen yanılgı satırı (20 Ekim 2026): kural yanılgı çözümüyle aynı (misconception-resolution.ts). */
export function resolvedLine(count: number): string | null {
  if (count <= 0) return null;
  return `${count} yanılgı çözüldü: aynı konuyu iki ayrı günde yardımsız doğru cevapladın.`;
}

export function ExamPrepReviews({
  prepId,
  items,
  resolvedCount = 0,
}: {
  prepId: string;
  items: ReviewItem[];
  resolvedCount?: number;
}) {
  const resolved = resolvedLine(resolvedCount);
  return (
    <div className="cp-exam-page">
      <Link href={`/deneme-sinavlari/${prepId}`} className="cp-back-pill">
        ← Yola dön
      </Link>
      <header className="cp-exam-trail-head" style={{ marginTop: "1rem" }}>
        <h1>Yanlışlar ve tekrarlar</h1>
        <p className="text-sm text-[var(--cp-muted)]">
          Bu liste oturumlarda yakalanan ve henüz çözülmemiş yanılgılardır. Renk tek başına durum
          değildir — her satırda tür etiketi vardır.
        </p>
        {resolved ? (
          <p className="text-sm text-[var(--cp-muted)]" role="status">
            {resolved}
          </p>
        ) : null}
      </header>

      {!items.length ? (
        <div className="cp-exam-empty" role="status">
          <p>
            <strong>{resolved ? "Açık yanılgın yok" : "Henüz kayıtlı yanılgı yok"}</strong>
          </p>
          <p className="text-sm text-[var(--cp-muted)]">
            Quiz veya doğru/yanlış oturumlarını bitirdikçe buraya düşer.
            Sıradaki derse devam edebilirsin.
          </p>
          <Link
            href={`/deneme-sinavlari/${prepId}`}
            className="cp-exam-continue cp-exam-continue--primary"
          >
            Çalışma yoluna dön
          </Link>
        </div>
      ) : (
        <ul className="cp-exam-review-list">
          {items.map((item) => (
            <li key={item.id} className="cp-exam-review-card">
              <div className="cp-exam-review-meta">
                <span className="cp-exam-review-tag">
                  {WRONG_TYPE_LABEL[item.wrongType] ?? item.wrongType}
                </span>
                {item.topicLabel ? <span>{item.topicLabel}</span> : null}
              </div>
              <p className="cp-exam-review-claim">{item.claim}</p>
              {item.corrected ? (
                <p className="text-sm text-[var(--cp-muted)]">
                  Doğrusu: {item.corrected}
                </p>
              ) : null}
              {item.questionPreview ? (
                <p className="text-xs text-[var(--cp-muted)]">
                  Soru: {item.questionPreview}
                </p>
              ) : null}
              {item.reviewNodeHref ? (
                <Link
                  href={item.reviewNodeHref}
                  className="cp-exam-continue"
                  style={{ marginTop: "0.5rem" }}
                >
                  Tekrar düğümüne git
                </Link>
              ) : (
                <Link
                  href={`/deneme-sinavlari/${prepId}`}
                  className="cp-exam-continue"
                  style={{ marginTop: "0.5rem" }}
                >
                  Yoldan devam et
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
