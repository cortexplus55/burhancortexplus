import { describe, expect, it } from "vitest";
import { classifyAcademicDomain, DOMAIN_ARCHETYPE, DOMAIN_LABEL, type AcademicDomain } from "@/lib/learning/visual-scenes/archetype";

/*
  20 Kasım 2026 denetimi: sınıflandırıcı kökleri sözcük sınırı olmadan alt dize olarak arıyordu. Kök artık sözcük başında
  olmalı (Türkçe ek serbest); ekle başka sözcüğe dönen kök ileri bakışla, aynı yazılan iki anlam ayırt edici bileşikle
  sayılır. Örnekler jenerik konu adlarıdır; hazırlık adı nötr.
*/
const domainOf = (topicLabel: string) => classifyAcademicDomain({ prepTitle: "Hazırlık", topicLabel, mode: "topic" }).academicDomain;

describe("sözcük sınırı: yanlış eşleşmeler", () => {
  const cases: [string, AcademicDomain[]][] = [
    ["Tanımlar ve kavramlar", ["medicine"]],
    ["Temel kavramlar", ["civil_engineering"]],
    ["Sonuç kendiliğinden gelir", ["economics"]],
    ["Sınav tarihi yaklaşıyor", ["history"]],
    ["Dokuz madde", ["biology"]],
    ["Organizasyon şeması", ["biology"]],
    ["Anlatım tarzı", ["economics"]],
    ["Çalışma planı hazırla", ["architecture"]],
    ["Hizmet sektörü", ["physics"]],
    ["Versiyon karşılaştırması", ["chemistry"]],
    ["Genetik şifre", ["philosophy"]],
    ["Kolonizasyon süreci", ["architecture"]],
    ["Edebi akımlar", ["physics"]],
    ["Divan-ı Hümayun", ["literature"]],
  ];
  for (const [topic, wrong] of cases) {
    it(`"${topic}" → ${wrong.join(", ")} değil`, () => {
      const domain = domainOf(topic);
      for (const item of wrong) expect(domain, `${topic} → ${domain}`).not.toBe(item);
    });
  }

  it("aynı sözcüklerin bütün eşleşmeleri düşünce konu genel kalır", () => {
    expect(domainOf("Sınav tarihi ve çalışma planı")).toBe("general");
    expect(domainOf("Dokuz organizasyon tarzı")).toBe("general");
    expect(domainOf("Tanımlar ve temel kavramlar")).toBe("general");
  });
});

describe("sözcük sınırı: doğru eşleşmeler ve Türkçe ekler", () => {
  const cases: [string, AcademicDomain][] = [
    ["Hücre dokuları", "biology"],
    ["Hızın zamanla değişimi", "physics"],
    ["Arz ve talep dengesi", "economics"],
    ["Milli gelir hesapları", "economics"],
    ["Osmanlı tarihi", "history"],
    ["Radye temel tasarımı", "civil_engineering"],
    ["Tanı ve tedavi", "medicine"],
    ["Kat planı ve kesit", "architecture"],
    ["Öğrenme psikolojisi", "psychology"],
    ["İklim ve nüfus", "geography"],
    ["İngilizce zamanlar", "language"],
    ["Edebi akımlar ve şiir", "literature"],
    ["Felsefede etik", "philosophy"],
  ];
  for (const [topic, domain] of cases) {
    it(`"${topic}" → ${domain}`, () => expect(domainOf(topic)).toBe(domain));
  }
});

describe("disiplin → arketip eşlemesi (kavram yapısı)", () => {
  it("iktisat, tarih, psikoloji, coğrafya, edebiyat, felsefe, dil ve genel kavram yapısına gider; hukuk ağaçta kalır", () => {
    for (const domain of ["economics", "history", "psychology", "geography", "literature", "philosophy", "language", "general"] as AcademicDomain[]) {
      expect(DOMAIN_ARCHETYPE[domain], domain).toBe("CONCEPT_STRUCTURE_VISUALIZER");
      expect(DOMAIN_LABEL[domain].length).toBeGreaterThan(2);
    }
    for (const domain of ["law", "kpss", "constitution"] as AcademicDomain[]) expect(DOMAIN_ARCHETYPE[domain]).toBe("LAW_SOCIAL_FLOWCHART");
    expect(classifyAcademicDomain({ prepTitle: "Hazırlık", topicLabel: "Jenerik konu", mode: "topic" }).visualArchetype).toBe("CONCEPT_STRUCTURE_VISUALIZER");
    expect(classifyAcademicDomain({ prepTitle: "YDS", topicLabel: "Okuma parçaları" }).visualArchetype).toBe("CONCEPT_STRUCTURE_VISUALIZER");
  });
});
