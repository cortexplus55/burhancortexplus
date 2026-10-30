"use client";

/** Kartlar ve kartlarla tekrar: kart destesi, tekrar turu teklifi. */
import { CardGradeButtons } from "@/components/parity/review-grade-buttons";
import { RichBody } from "@/components/parity/lesson-rich-text";
import { cn } from "@/lib/utils";
import { NodeSources } from "@/components/parity/node-sources";
import type { NodeLifecycle } from "./use-node-lifecycle";

export function CardsPlay({ life }: { life: NodeLifecycle }) {
  const { sources, stage, loading, payload, index, flipped, setFlipped, revealedCard, setRevealedCard, cardOffer, setCardOffer, cardRepeat, setCardRepeat, answersRef, finishCards, rateCard, cards, cardIndex, cardsPlaying } = life;
  return (
    <>
      {stage === "play" && payload.type === "cards" && cardOffer ? (
        <section className="cp-exam-card-offer" aria-labelledby="card-offer-title">
          <p className="cp-exam-card-offer-emoji" aria-hidden>
            🔁
          </p>
          <h2 id="card-offer-title">Bilmediğin kartlara bir kez daha bakalım</h2>
          <p>
            Tekrarlanacak kartlar: <strong>{cardOffer.length}</strong>
          </p>
          <div className="cp-exam-card-rate">
            <button
              type="button"
              className="cp-exam-continue"
              disabled={loading}
              onClick={() => finishCards(answersRef.current)}
            >
              Atla
            </button>
            <button
              type="button"
              className="cp-exam-continue cp-exam-continue--primary"
              disabled={loading}
              onClick={() => {
                setCardRepeat({ list: cardOffer, pos: 0, known: [] });
                setCardOffer(null);
                setFlipped(false);
                setRevealedCard(-1);
              }}
            >
              Devam et
            </button>
          </div>
        </section>
      ) : null}

      {cardsPlaying && cards[cardIndex] ? (
        /*
          Değerlendirme cevap görüldükten sonra açılıyor. Önceden "Evet"
          kart hiç çevrilmeden basılabiliyordu: öğrenci cevabı görmeden
          "biliyorum" diyebiliyor, o öz-değerlendirme de kayda geçiyordu.
          Aralıklı tekrarın kuralı önce hatırla, sonra cevabı gör, sonra
          dürüstçe değerlendir.
        */
        <section className="cp-exam-card-stage">
          <CardProgress
            label={cardRepeat ? "Tekrar" : null}
            position={cardRepeat ? cardRepeat.pos + 1 : index + 1}
            total={cardRepeat ? cardRepeat.list.length : cards.length}
          />
          <NodeSources sources={sources} />
          <button
            type="button"
            className={cn("cp-exam-flash", flipped && "cp-exam-flash--back")}
            aria-label={flipped ? "Kartı soru yüzüne çevir" : "Kartı çevir, cevabı göster"}
            onClick={() => {
              setFlipped((value) => !value);
              setRevealedCard(cardIndex);
            }}
          >
            <span className="cp-exam-flash-side">{flipped ? "Cevap" : "Soru"}</span>
            <span aria-live="polite">
              <RichBody text={flipped ? cards[cardIndex].back : cards[cardIndex].front} />
            </span>
          </button>
          {revealedCard !== cardIndex ? (
            <p className="cp-exam-card-hint">
              Önce kendin hatırlamaya çalış, sonra karta dokun ya da boşluk tuşuna bas.
            </p>
          ) : null}
          {revealedCard === cardIndex ? (
          <>
          <p>Ne kadar hatırladın?</p>
          <CardGradeButtons
            className="cp-exam-card-rate"
            disabled={loading}
            onGrade={(quality) => rateCard(quality)}
          />
          </>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

/** Kart destesinin üstündeki ilerleme çubuğu (Astra: çubuk + "1 / 10"). */
export function CardProgress({ label, position, total }: { label: string | null; position: number; total: number }) {
  const pct = Math.round((Math.min(position, total) / Math.max(1, total)) * 100);
  return (
    <div className="cp-exam-card-progress">
      <span
        role="progressbar"
        aria-valuenow={position}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={label ? `${label} ilerlemesi` : "Kart ilerlemesi"}
      >
        <i style={{ width: `${pct}%` }} />
      </span>
      <em>
        {label ? `${label} · ` : ""}
        {position} / {total}
      </em>
    </div>
  );
}
