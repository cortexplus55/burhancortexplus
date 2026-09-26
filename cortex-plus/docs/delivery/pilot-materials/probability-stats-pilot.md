# Pilot exam pack — Olasılık ve İstatistik (üniversite giriş)

**Amaç:** Phase 3 ürün akışı için gerçekçi çok-konulu kaynak (PDF yerine markdown kaynak metni; üretime PDF olarak yüklenebilir).

**Konular ve önkoşullar**

1. Temel olasılık aksiyomları → 2. Koşullu olasılık → 3. Bayes teoremi → 4. Bağımsızlık → 5. Merkezi limit teoremi (orta zorluk)

---

## Bölüm 1 — Temel olasılık

Örnek uzay $\Omega$, olay $A\subseteq\Omega$. $P(\Omega)=1$, $P(\emptyset)=0$, ayrık olaylar için sayılabilir toplanabilirlik.

**Örnek.** Zar: $P(\{1,2,3\})=1/2$.

**Soru.** İki hilesiz zar toplamı 7 gelme olasılığı nedir?

---

## Bölüm 2 — Koşullu olasılık

$$P(A\mid B)=\frac{P(A\cap B)}{P(B)}\quad(P(B)>0)$$

**Yaygın yanılgı:** $P(A\mid B)=P(A)\,P(B)$ (bağımsızmış gibi çarpma).

**Örnek.** Desteden bir kart: $P(\text{as}\mid\text{kupa})=\frac{1}{13}$.

**Soru.** $P(A)=0.4$, $P(B)=0.5$, $P(A\cap B)=0.2$. $P(A\mid B)$?

---

## Bölüm 3 — Bayes teoremi

$$P(H\mid E)=\frac{P(E\mid H)\,P(H)}{P(E)}$$

**Örnek (tıbbi test).** Hastalık prevalansı %1, duyarlılık %99, özgüllük %95. Pozitif test sonrası hastalık olasılığı?

**Soru.** Aynı parametrelerle negatif test sonrası hastalık olasılığını yaklaşık hesaplayın.

---

## Bölüm 4 — Bağımsızlık

$A$ ve $B$ bağımsız $\iff$ $P(A\cap B)=P(A)P(B)$.

Bağımsızlık $\neq$ ayrıklık.

---

## Bölüm 5 — Merkezi limit teoremi (orta zorluk)

$X_1,\ldots,X_n$ i.i.d., $E[X_i]=\mu$, $\mathrm{Var}(X_i)=\sigma^2<\infty$. O zaman

$$\frac{\sqrt{n}(\bar X_n-\mu)}{\sigma}\xrightarrow{d} N(0,1).$$

**Örnek.** $\mu=50$, $\sigma=10$, $n=100$. $P(\bar X>52)$ yaklaşık değeri?

**Soru.** $n$ kaç olmalı ki standart hata $\sigma/\sqrt{n}\le 1$ olsun ($\sigma=10$)?

---

## Kaynak ilişkileri (Exam Graph beklentisi)

| Konu | Önkoşul | Önem |
|---|---|---|
| conditional_probability | temel olasılık | yüksek |
| bayes | conditional_probability | yüksek |
| independence | conditional_probability | orta |
| central_limit | independence (zayıf), temel | orta-yüksek |

Footer/header gürültüsü yok; konu başlıkları net.
