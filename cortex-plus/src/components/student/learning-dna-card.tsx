import { SectionCard } from "@/components/ui-kit/empty-state";
import { formatNumber } from "@/lib/format";
import { errorKindLabel, isEmptyMemory, MEMORY_WINDOW_DAYS, type StudentMemory } from "@/lib/learning/student-memory";

/** Kartta gösterilen en sık hata türü sayısı. */
const TOP_KINDS = 3;
/** Hakimiyeti bunun altında ölçülen kazanım "zorlandığın" sayılır. */
const DNA_WEAK_BELOW = 0.75;

/**
 * "🧬 Öğrenme DNA'n" (5 Kasım 2026): öğrencinin kendi kayıtlarından çıkan örüntü. Sunucu bileşeni; veri
 * sayfadan gelir, istek atmaz. Yeterli veri yoksa bunu söyler, uydurma örüntü çizmez.
 */
export function LearningDnaCard({ memory }: { memory: StudentMemory | null }) {
  const kinds = (memory?.errorKinds ?? []).filter((row) => row.kind !== "other" && row.count > 0).slice(0, TOP_KINDS);
  // Özet en düşük hakimiyetli 8 kazanımı taşır; kart yalnız gerçekten düşük olanları (%75 altı) "zorlandığın" sayar.
  const weak = (memory?.weakOutcomes ?? []).filter((row) => row.mastery < DNA_WEAK_BELOW);
  const weakCount = weak.length;
  const weakest = weak.reduce<(typeof weak)[number] | null>((low, row) => (!low || row.mastery < low.mastery ? row : low), null);
  const empty = isEmptyMemory(memory) || (!kinds.length && !weakCount);

  return (
    <SectionCard
      title="🧬 Öğrenme DNA'n"
      description="Yanlışlarından çıkan örüntüler. Öğretmen sohbeti ve dersler bunu okuyup anlatımı sana göre ayarlar."
    >
      {empty ? (
        <p className="text-sm text-[var(--cs-muted)]">
          Henüz yeterli veri yok. Birkaç test ya da doğru/yanlış çözdüğünde burada görünür.
        </p>
      ) : (
        <div className="space-y-3">
          {kinds.length ? (
            <ul className="flex flex-wrap gap-2" aria-label="En sık yaptığın hata türleri">
              {kinds.map((row) => (
                <li
                  key={row.kind}
                  className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-[var(--cs-text)]"
                >
                  {errorKindLabel(row.kind)} · {formatNumber(row.count)} kez
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-sm text-[var(--cs-muted)]">
            {weakest
              ? `Hakimiyeti %75'in altında ölçülen kazanım: ${formatNumber(weakCount)} (en düşüğü hakimiyet %${Math.round(weakest.mastery * 100)}, ${formatNumber(weakest.n)} cevaptan)`
              : memory?.weakOutcomes.length
                ? "Hakimiyeti %75'in altında ölçülen bir kazanımın yok."
                : "Zorlandığın bir kazanım henüz ölçülmedi."}
          </p>
          {memory?.sampleSize ? (
            <p className="text-xs text-[var(--cs-muted)]">
              Son {MEMORY_WINDOW_DAYS} gündeki {formatNumber(memory.sampleSize)} cevaptan hesaplandı.
            </p>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
