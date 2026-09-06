const OUTCOMES = [
  {
    title: "Yanlışlarını kaybetme",
    description:
      "Deneme sınavında kaçırdığın konular yanlış defterine düşer ve sonraki tekrarını yönlendirir.",
  },
  {
    title: "Kaynağınla çalış",
    description:
      "Ders notunu yükle; AI öğretmen yanıtlarında yalnızca senin hesabına bağlı kaynağı kullanabilsin.",
  },
  {
    title: "Planını somutlaştır",
    description:
      "Hedefini günlük görevlere böl, tamamladıklarını işaretle ve sıradaki çalışmanı tek ekranda gör.",
  },
  {
    title: "İlerlemeni izle",
    description:
      "Sohbet, quiz, kart seti ve deneme sonuçlarını birlikte gör; eksik konuya doğrudan geri dön.",
  },
];

export function CinematicSocialProof() {
  return (
    <section className="border-t border-[var(--mk-border)] bg-[#080808] py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">
          Çalışma döngün
        </p>
        <h2 className="mk-display mt-3 text-center text-2xl md:text-4xl">
          Her çalışma bir sonrakini daha net yapar
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-[var(--mk-muted)] md:text-base">
          Cortex Plus soruyu yanıtlamakla kalmaz; nerede zorlandığını saklar ve
          sonraki adımına taşır.
        </p>

        <div className="mt-14 grid gap-5 md:grid-cols-2 md:gap-6">
          {OUTCOMES.map((outcome, index) => (
            <article
              key={outcome.title}
              className="mk-card mk-card-cinematic min-h-44 p-6 md:p-8"
            >
              <p className="text-xs font-semibold text-amber-300" aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-4 text-lg font-semibold">{outcome.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--mk-muted)]">
                {outcome.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
