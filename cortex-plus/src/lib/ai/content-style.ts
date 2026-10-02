/**
 * Üretilen içeriğin yazım kuralı.
 *
 * Quiz stüdyosunda soru "2^3 işleminin sonucu nedir?" diye çıkıyordu. Ekranda
 * görünen de tam olarak buydu: şapkalı gösterim, çarpı yerine yıldız. Bir
 * öğrenciye matematik böyle yazılmaz — kitapta 2³ yazar.
 *
 * Formül dizgisi (KaTeX gibi) eklemek yerine yapay zekâdan doğrudan Unicode
 * istiyoruz: her yerde çalışıyor, ek paket gerekmiyor, kopyalayınca bozulmuyor.
 */
export const CONTENT_STYLE =
  "Matematiksel ifadeleri Unicode ile yaz: üsler ² ³ ⁴ ⁿ, çarpı ×, bölü ÷, kök √, " +
  "kesirler ½ ¾ ya da a/b biçiminde, ≤ ≥ ≠ ≈ π ∞ °. Şapka (^), yıldız (*) ve LaTeX kullanma. " +
  // Üste taşınan ifadenin tamamı üst simge olmalı. "2³+⁴" yazıldığında ekranda
  // "2 üssü 3, artı 4" okunuyor; kastedilen 2⁽³⁺⁴⁾ ise anlam tersine dönüyor.
  "Bir üs birden çok terimden oluşuyorsa ya tamamını üst simgeyle yaz (2³⁺⁴, aⁿ⁻¹) " +
  "ya da sonucu hesaplayıp tek üsle ver (2⁷). Üst simge ile normal satırı aynı üste karıştırma. " +
  // Zemin podcast'i kaynaktaki "No.200'den geçen %50'yi aşıyorsa ince daneli"
  // kuralını "%8 geçiyorsa ince daneli" diye aktardı: sayı kaynaktan, sonuç
  // ters. Sayıyı doğru kopyalamak yetmiyor, eşiğin yönü de kaynağın.
  "Eşik, oran ve sınıflandırma kuralını kaynaktan aynen aktar: hangi değer, hangi " +
  "yön (üstü/altı) ve hangi sonuç birlikte gelir. Kaynağın örneğini kullanıyorsan " +
  "vardığı sonucu da aynen kullan; sayıyı alıp sonucu değiştirme. " +
  "Metni sade tut: gereksiz giriş cümlesi, özür ya da 'işte cevabınız' gibi kalıplar yok.";
