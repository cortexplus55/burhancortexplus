# 00 · Taban noktaları

Faz 12'de "yeni tasarım eskisinden kötü değil" iddiasının karşılaştırma noktaları (görsel, denetim, performans).
Ürün sahibinin kararı (14 Kasım 2026): iki taban, güncel main üçüncü nokta.

| Ad | Commit | Tarih (main'e girdiği an) | Ne |
|---|---|---|---|
| **BASE_SHA_ESKI** (asıl "eski") | `1288c2544571dfe31121b081509f497997df24dd` | 12 Kasım 2026 12:12 (+03) | #643'ten önceki main (#642 birleşmesi). Tasarım geçişinin hiçbir parçası yok. |
| **BASE_SHA** | `b25a92291025bef58e074f87eb98bea85faa5d89` | 13 Kasım 2026 22:30 (+03) | #644'ten önceki main (#643, tasarım sistemi v1 + ana ekran birleşmesi). |
| Güncel main (Faz 0 başlangıcı) | `492e206e8d3a60c2c9e27c8e4ed67a040cc6fbeb` | 14 Kasım 2026 03:40 (+03) | #644 (Faz 1), #645 (Faz 2), #646 (Prompt 1 kararları ve canlı düzeltmeler) birleşmiş. |

Not: Prompt 1'in istediği gibi `BASE_SHA` birleştirmeden önce okunamadı; #644 ve #645 prompt gelmeden (13 Kasım 22:50)
birleşmişti. `b25a9229` = #644 birleşme commit'inin (`f7e01605`) ilk ebeveyni, yani birleştirmeden hemen önceki main.
