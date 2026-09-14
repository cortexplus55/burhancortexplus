import type { Metadata } from "next";
import Link from "next/link";
import { DemoWalkthrough } from "@/components/demo/demo-walkthrough";
import { loadDemoLesson } from "@/lib/demo/lesson";
import "@/styles/demo.css";

export const metadata: Metadata = {
  title: "Nasıl çalışır — örnek çalışma",
  description:
    "Hazır bir ders notuyla Cortex Plus akışını baştan sona gezin: konu çıkarımı, podcast, quiz ve sözlü.",
};

/**
 * Örnek akış sayfası.
 *
 * Giriş gerektirmiyor ve hiçbir AI çağrısı yapmıyor: gösterilen içerik bir kez
 * üretilip depoya konuldu. Tek dinamik iş, ses dosyaları için kısa ömürlü
 * imzalı URL üretmek — onun da maliyeti yok.
 *
 * İlk adımdaki yükleme gerçek bir harekettir ama sunucuya dosya taşımaz:
 * ziyaretçi örnek notu indirip geri bırakır, tarayıcı özetini hesaplayıp
 * bizim notumuzla karşılaştırır. Gerekçesi `lib/demo/source-check.ts` içinde.
 */
/*
  Sayfa her istekte üretiliyor.

  Podcast sesleri depoda duruyor ve `loadDemoLesson` onlara bir saatlik imzalı
  URL çıkarıyor. Sayfa statik üretildiğinde o URL'ler derleme anında
  damgalanıyordu: dağıtımdan bir saat sonra 3. adımın oynatıcısı sessiz
  kalıyor, sonraki dağıtıma kadar da öyle kalıyordu. Derleme ve testler bunu
  yakalamıyor — bir saat beklemek gerekiyor.

  `force-dynamic` sayfayı isteğe bağlı üretime alıyor, imza her ziyaretçi için
  tazeleniyor. Sayfa hâlâ hiç AI çağrısı yapmıyor; tek iş imzalamak.
*/
export const dynamic = "force-dynamic";

export default async function OrnekPage() {
  const lesson = await loadDemoLesson();

  return (
    <main className="dm-shell">
      <nav className="dm-topbar">
        <Link href="/" className="dm-brand">
          Cortex Plus
        </Link>
        <Link href="/kayit" className="dm-btn dm-btn--primary dm-btn--sm">
          Ücretsiz dene
        </Link>
      </nav>

      <DemoWalkthrough
        subject={{ label: "Biyoloji", icon: "🧬", colorVar: "var(--pm-subj-biyoloji)" }}
        sourceName={lesson.sourceName}
        sourceHref={lesson.sourceHref}
        sourceText={lesson.sourceText}
        pipeline={lesson.pipeline}
        topics={lesson.topics}
        podcastTitle={lesson.podcastTitle}
        chapters={lesson.chapters}
        audio={lesson.audio}
        quiz={lesson.quiz}
        oral={lesson.oral}
      />
    </main>
  );
}
