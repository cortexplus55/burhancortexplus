/**
 * Boş sohbet ekranındaki başlangıç önerileri.
 * Kayıt sırasındaki sınıf / ders / hedef ile kişiselleşir.
 * AI'ya ürettirilmez: her açılışta kredi yakmamak için sabit şablon.
 */
export type FirstPrompt = {
  label: string;
  prompt: string;
  group?: "anlat" | "test" | "plan";
};

const GENERIC: FirstPrompt[] = [
  {
    group: "anlat",
    label: "Konu anlat",
    prompt:
      "Anlamadığım bir konuyu sıfırdan, adım adım anlat. Önce seviyemi bir soruyla yokla.",
  },
  {
    group: "test",
    label: "Beni test et",
    prompt:
      "Bana 3 kısa soru sor. Her yanıttan sonra doğru/yanlış söyle ve gerekirse tek cümleyle açıkla.",
  },
  {
    group: "plan",
    label: "Bugün ne çalışayım?",
    prompt:
      "Bugün için 25–40 dakikalık gerçekçi bir çalışma planı öner. Tek hedef seç, dağıtma.",
  },
];

function goalPrompt(goal: string | null, subject: string): FirstPrompt {
  const ders = subject || "derslerim";
  if (goal?.startsWith("YKS")) {
    return {
      group: "plan",
      label: "Net nasıl artar?",
      prompt: `YKS'ye hazırlanıyorum. ${ders} netimi artırmak için bu hafta nereden başlamalıyım? Kısa ve uygulanabilir söyle.`,
    };
  }
  if (goal?.startsWith("LGS")) {
    return {
      group: "plan",
      label: "LGS planı çıkar",
      prompt: `LGS'ye hazırlanıyorum. ${ders} için bu haftaya sığacak net bir çalışma planı çıkar.`,
    };
  }
  if (goal?.startsWith("Okul")) {
    return {
      group: "plan",
      label: "Yazılıya hazırlan",
      prompt: `Yaklaşan ${ders} yazılısına nasıl çalışmalıyım? Öncelik sırası ver.`,
    };
  }
  return {
    group: "test",
    label: "Eksiğimi bul",
    prompt: `${ders} konusunda eksiğimi bulmak için bana 3 soru sor; yanlışlarımı açıkla.`,
  };
}

/** Birincil Başla düğmesinin göndereceği örnek ilk mesaj. */
export function defaultStartPrompt({
  grade,
  subject,
  goal,
}: {
  grade?: string | null;
  subject?: string | null;
  goal?: string | null;
}): string {
  const ders = (subject ?? "").trim();
  const sinif = (grade ?? "").trim();
  const hedef = (goal ?? "").trim();
  const seviye = sinif ? `${sinif} ` : "";
  const konu = ders || "bugün çalışacağım konu";
  if (hedef.startsWith("YKS") || hedef.startsWith("LGS")) {
    const shortGoal = hedef.split(/[—\-|]/)[0].trim();
    return `${shortGoal} için ${seviye}${konu} çalışmak istiyorum. Kısa bir tanışma sorusu sor, sonra birlikte bir başlangıç noktası seçelim.`;
  }
  if (ders) {
    return `${seviye}${ders} çalışmak istiyorum. Önce bir soruyla seviyemi yokla, sonra bugün için tek bir net hedef öner.`;
  }
  return "Bugün verimli bir çalışma başlatmak istiyorum. Bana tek bir soru sorup neye odaklanacağımı birlikte seçelim.";
}

/** Karşılama alt satırı. */
export function greetingSubline({
  subject,
  goal,
  grade,
}: {
  subject?: string | null;
  goal?: string | null;
  grade?: string | null;
}): string {
  const ders = (subject ?? "").trim();
  const hedef = (goal ?? "").trim();
  const sinif = (grade ?? "").trim();
  if (hedef && ders) return `${hedef} · ${ders}`;
  if (hedef) return hedef;
  if (ders && sinif) return `${sinif} · ${ders}`;
  if (ders) return `${ders} ile devam edelim`;
  if (sinif) return `${sinif} için buradayım`;
  return "Bugün neyi çözelim?";
}

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
      group: "anlat",
      label: ders ? `${ders} anlat` : "Konu anlat",
      prompt: `${seviye}${konu} konularından birini sıfırdan anlat. Önce bir soruyla seviyemi yokla, sonra adım adım ilerle.`,
    },
    {
      group: "test",
      label: "Beni test et",
      prompt: `${seviye}${konu} dersinden 3 kısa soru sor. Her yanıttan sonra doğru/yanlış de ve gerekirse tek cümleyle açıkla.`,
    },
    goalPrompt(goal ?? null, ders),
  ];
}