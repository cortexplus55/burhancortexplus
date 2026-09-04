/**
 * Boş sohbet ekranındaki başlangıç önerileri.
 *
 * Yeni kaydolan öğrencinin gördüğü ilk ekran selamlama, bir düğme ve boş bir
 * yazı kutusuydu. "Ne sorabilirim?" sorusunun cevabı hiçbir yerde yazmıyordu;
 * uygulamanın ne yaptığını bilmeyen biri o ekranda takılıp kalıyor.
 *
 * Öneriler kayıt sırasında verilen cevaplardan üretiliyor — sınıf, ders ve
 * hedef zaten soruluyor, ama şimdiye kadar hiçbir yerde kullanılmıyordu.
 * Yapay zekâya ürettirmiyoruz: her açılışta bir çağrı, yani her açılışta
 * kredi demek olurdu.
 */
export type FirstPrompt = { label: string; prompt: string };

const GENERIC: FirstPrompt[] = [
  {
    label: "Bir konuyu baştan anlat",
    prompt: "Anlamadığım bir konuyu sıfırdan anlatmanı istiyorum. Nereden başlayalım?",
  },
  {
    label: "Soru fotoğrafı çözdür",
    prompt:
      "Elimde çözemediğim bir soru var. Fotoğrafını göndereceğim, adım adım çözer misin?",
  },
  {
    label: "Bugün ne çalışayım?",
    prompt: "Bugün için bana kısa ve gerçekçi bir çalışma önerisi ver.",
  },
];

/** Hedefe göre değişen üçüncü öneri. */
function goalPrompt(goal: string | null, subject: string): FirstPrompt {
  const ders = subject || "derslerim";

  if (goal?.startsWith("YKS")) {
    return {
      label: "Netimi nasıl artırırım?",
      prompt: `YKS'ye hazırlanıyorum. ${ders} netimi artırmak için nereden başlamalıyım?`,
    };
  }
  if (goal?.startsWith("LGS")) {
    return {
      label: "LGS planı çıkar",
      prompt: `LGS'ye hazırlanıyorum. ${ders} için haftalık bir çalışma planı çıkarır mısın?`,
    };
  }
  if (goal?.startsWith("Okul")) {
    return {
      label: "Yazılıya hazırlan",
      prompt: `Yaklaşan ${ders} yazılısına nasıl çalışmalıyım? Bana bir yol göster.`,
    };
  }
  return {
    label: "Eksiğimi bul",
    prompt: `${ders} konusunda nerede eksiğim var, birkaç soruyla anlayabilir misin?`,
  };
}

/**
 * Üç öneri döndürür. Sınıf ve ders biliniyorsa öneriler onlara göre yazılıyor;
 * bilinmiyorsa herkese uyan genel hâline düşüyor.
 */
export function firstPrompts({
  grade,
  subject,
  goal,
}: {
  grade?: string | null;
  subject?: string | null;
  goal?: string | null;
}): FirstPrompt[] {
  const ders = (subject ?? "").trim();
  const sinif = (grade ?? "").trim();

  if (!ders && !sinif) return GENERIC;

  const seviye = sinif ? `${sinif} seviyesinde ` : "";
  const konu = ders || "bir ders";

  return [
    {
      label: ders ? `${ders} konusu anlat` : "Bir konuyu baştan anlat",
      prompt: `${seviye}${konu} konularından birini sıfırdan anlatmanı istiyorum. Nereden başlayalım?`,
    },
    {
      label: "Beni test et",
      prompt: `${seviye}${konu} dersinden bana 3 soru sor ve yanıtlarımı kontrol et.`,
    },
    goalPrompt(goal ?? null, ders),
  ];
}
