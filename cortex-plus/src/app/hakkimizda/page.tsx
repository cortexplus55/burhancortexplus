import { MarketingPage } from "@/components/layout/marketing-page";

export const metadata = {
  title: "Hakkımızda",
  description: "Cortex Plus'ın amacı ve çalışma ilkeleri.",
};

export default function HakkimizdaPage() {
  return (
    <MarketingPage
      title="Hakkımızda"
      description="Cortex Plus, öğrencinin kendi hızında ilerlemesini kolaylaştırmak için kuruldu."
    >
      <div className="max-w-2xl space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          Amacımız, yapay zekâyı öğrencinin yerine düşünen değil, düşünmeyi
          öğreten bir araç haline getirmek. Bu yüzden yanıtlarımız hazır sonuç
          yerine adım adım anlatım sunar; ipucu, basitleştirme ve benzer örnek
          seçenekleriyle öğrenmeyi destekler.
        </p>
        <p>
          Şeffaflığı temel alıyoruz: her işlemin kredi bedeli önceden gösterilir,
          başarısız işlemlerin kredisi iade edilir ve kullanıcı verisi yalnızca
          hizmetin çalışması için işlenir.
        </p>
        <p>
          Öğretmenler için ayrı bir alan sunuyoruz. Öğretmen paneli yalnızca belge
          doğrulaması sonrası açılır ve öğrencilerin kişisel yapay zekâ sohbetleri
          öğretmenlerle paylaşılmaz.
        </p>
      </div>
    </MarketingPage>
  );
}
