import Image from "next/image";

/**
 * Ürünün kendisini gösteren bölüm.
 *
 * Ana sayfada bugüne kadar ürünün TEK BİR görüntüsü yoktu. Ölçüldü: bizim
 * sayfada 0 görsel, referans üründe 30 görsel + 4 büyük SVG. Yapı benzerdi
 * (dokuz bölüm, otuz dört başlık) ama biz anlatıyor, onlar gösteriyordu.
 * Tek medyamız hero'daki stok video — yani ürünle ilgisi olmayan bir
 * görüntüydü.
 *
 * Buradaki dört kare gerçek: canlı /ornek akışından, ürünün kendi
 * arayüzünden alındı. Çizim ya da temsilî görsel değil; öğrencinin kayıt
 * olduktan sonra göreceği ekranın aynısı. Vaat ile ekran arasında fark
 * olmaması, tanınmayan bir markada tek başına bir güven argümanı.
 *
 * Kareler koyu zeminde koyu duruyor: çerçeve olmadan sayfaya karışıp
 * kayboluyorlardı — sayfanın "boş" hissettirmesinin bir sebebi de buydu.
 * Bu yüzden her karenin kendi kenarlığı ve hafif yükseltisi var.
 */

const SHOTS = [
  {
    src: "/urun/konular",
    w: 1904,
    h: 616,
    eyebrow: "Konu haritası",
    title: "Notun konulara ayrılır",
    body: "Yüklediğin ders notu okunur ve çalışılacak başlıklar çıkarılır. Sıra rastgele değil: önce temeli olan konu gelir.",
  },
  {
    src: "/urun/podcast",
    w: 1904,
    h: 732,
    eyebrow: "Podcast",
    title: "Konu iki sunucuyla anlatılır",
    body: "Notundan üretilen diyalog. Okunan cümle vurgulanır, tıklayınca oraya atlarsın — yolda dinlemek için.",
  },
  {
    src: "/urun/quiz",
    w: 1904,
    h: 642,
    eyebrow: "Test",
    title: "Sorular aynı nottan gelir",
    body: "Çeldiriciler gerçek kavram yanılgısı; elemesi bedava olan şık yok. Yanlışta açıklama, doğruda pekiştirme.",
  },
  {
    src: "/urun/sozlu",
    w: 1904,
    h: 770,
    eyebrow: "Sözlü",
    title: "Sesli anlatarak çalışırsın",
    body: "Eğitmen sorar, sen konuşursun. Ezberlediğin yerle anladığın yeri ayıran adım bu.",
  },
] as const;

export function ProductShowcase() {
  return (
    <section
      className="mx-auto max-w-6xl px-4 py-16"
      data-cinematic-reveal
      aria-labelledby="shot-heading"
    >
      <p className="mk-eyebrow">Ürünün içi</p>
      <h2 id="shot-heading" className="mk-section-title">
        Kayıt olmadan önce ne alacağını gör
      </h2>
      <p className="mk-muted mt-3 max-w-2xl">
        Aşağıdakiler temsilî görsel değil — ürünün canlı ekranları.
      </p>

      <div className="mk-shots">
        {SHOTS.map((shot) => (
          <article key={shot.src} className="mk-shot">
            <div className="mk-shot-text">
              <p className="mk-eyebrow">{shot.eyebrow}</p>
              <h3 className="mk-shot-title">{shot.title}</h3>
              <p className="mk-muted">{shot.body}</p>
            </div>

            {/*
              Genişlik ve yükseklik yazılı: görsel yüklenirken sayfa
              zıplamasın. Ekranın dışındakiler tembel yükleniyor.
            */}
            <div className="mk-shot-frame">
              <Image
                src={`${shot.src}.webp`}
                alt={shot.title}
                width={shot.w}
                height={shot.h}
                sizes="(max-width: 900px) 100vw, 640px"
                className="mk-shot-img"
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
