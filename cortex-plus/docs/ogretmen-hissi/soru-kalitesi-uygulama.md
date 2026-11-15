# H2 · Şık ayrılabilirliği: uygulama (öneri `soru-kalitesi.md`, #669)

## Uygulanan (15 Kasım 2026, Burhan D2 onayı, sınırlarıyla)

Sınırlar: yalnız doğrulama katmanı; hatalı soru sessizce değiştirilmez, elenir ve sayaçlanır; kullanıcı yolunda ek bekleme
yok; salt kod; `SOURCE_NUMBER_PRIORITY` ve mevcut denetimler değişmez; bayrak arkasında.

**Önerinin 1. maddesi değişti:** kök Jaccard ≥ 0,8 ölçüsü G8'in kendisiyle sınandı ve **yanlış** çıktı. "edilebilir /
edilemez" gibi yalnız olumsuzlukla ayrılan doğru çeldiriciler aynı kökleri paylaşır; ölçü sağlam soruyu tümden elerdi. Aynı
nedenle "aynı sözcükler, başka sıra" kuralı cümle şıklarında da yanlıştır ("A edilemez, ancak B edilebilir" / "A
edilebilir, ancak B edilemez"). Uygulanan iki kesin kural (`src/lib/learning/option-separability.ts`):

| Kural | Ne yakalar | G8 |
|---|---|---|
| "ne … ne de" + olumsuz fiil | Dil bilgisi bozuk şık ("ne gelmez ne de gider") | C şıkkı ✓; A, B, D, E dokunulmaz |
| Liste şıkkında yalnız sıra farkı | "Osmanlı ve Safevi" / "Safevi ile Osmanlı" (öğe en çok iki sözcük) | — |

Önerinin 2. maddesi (yazar istemine satır, hafif doğrulayıcının şıkkı değiştirmesi) **uygulanmadı**: D2 sınırı "yalnız
doğrulama, sessiz değişiklik yok". Bayrak `quiz.option_check` (Özellik Anahtarları, varsayılan kapalı). Sayaç:
`teacher_quiz` günlüğünde `optionCheck.flagged`. İlk 100 sorudaki elenme oranı ancak bayrak açılınca ölçülür.

**Ayrı durak (D2b):** anlamca eşdeğer iki şıkkı (sözcükleri farklı, anlamı aynı) yakalamak model ister. Soru seti başına tek
çağrı, öğrenci beklerken değil önceden yazımda; önce ölçüm, sonra karar.
