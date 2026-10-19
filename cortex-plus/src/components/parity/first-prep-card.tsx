import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Icon3D } from "@/components/ui/icon-3d";
import "@/styles/first-prep-card.css";

/**
 * Ana sayfada, henüz sınav hazırlığı olmayan öğrenciye ilk adım (19 Ekim 2026).
 *
 * Kayıttan sonra öğrenci sohbet ekranına düşüyor; "Başla" sohbeti açıyor ve ücretsiz günlük hakkın
 * yarısını tek mesajda harcıyordu. Ürünün asıl değeri — notundan konu yolu ve ilk ders — yalnız
 * Sınavlar → Yeni hazırlık'taydı. Kart yalnız hiç hazırlığı yokken görünür; ilk hazırlık kurulunca
 * kendiliğinden kaybolur.
 */
export function FirstPrepCard() {
  return (
    <Link href="/deneme-sinavlari/olustur" className="cp-first-prep">
      <Icon3D name="bos-hazirlik" size={48} />
      <span className="cp-first-prep-copy">
        <strong>Sınavın mı var? İlk hazırlığını kur</strong>
        <span>Notunu yükle ya da sınavını yaz; konular sıraya dizilir, ilk dersin hazırlanır.</span>
      </span>
      <ArrowRight className="cp-first-prep-arrow" aria-hidden />
    </Link>
  );
}
