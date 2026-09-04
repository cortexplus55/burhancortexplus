/**
 * Cortex Plus marka işareti — tek kaynak.
 *
 * Biçim: markanın harfini taşıyan bir yay ve ağzında beş uçlu bir yıldız.
 * Yıldızın sağ ucu yayın ağzından bir parça taşıyor; tam içine oturtulduğunda
 * kompozisyon kapalı ve durgun duruyordu.
 *
 * Yıldızın iç yarıçapı klasik oranın (0,382) üzerinde, 0,47'de tutuluyor.
 * Sebebi ölçüm: 20 pikselde — uygulama üst çubuğundaki gerçek boyut — daha
 * ince uçlar birbirine yapışıp yuvarlak bir lekeye dönüşüyor.
 *
 * Gradyan kimliği sabit. Sayaç ya da `useId` denenmedi çünkü ikisi de yanlış
 * olurdu: sayaç sunucuyla tarayıcıda farklı değer üretip hidrasyonu bozar,
 * `useId` ise bileşeni istemciye taşır. Sayfa başına tek işaret olduğu için
 * (üst çubuk ya da başlık) kimlik çakışması pratikte oluşmuyor; oluşsa bile
 * tanımlar birebir aynı olduğundan görüntü değişmez.
 */
export function CortexMark({
  size = 20,
  className,
}: {
  /** Piksel. Uygulama çubuğu 20, pazarlama kilidi 24, favicon içi 20. */
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="cortex-mark-arc" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#c9851f" />
          <stop offset="1" stopColor="#f4ae0b" />
        </linearGradient>
      </defs>
      <path
        d="M18.4 5.4A8.9 8.9 0 1 0 18.4 18.6"
        stroke="url(#cortex-mark-arc)"
        strokeWidth="3.1"
        strokeLinecap="round"
      />
      <path
        d="M15.7 7.5 16.93 10.3 19.98 10.61 17.7 12.65 18.35 15.64 15.7 14.1 13.06 15.64 13.7 12.65 11.42 10.61 14.47 10.3Z"
        fill="#f4ae0b"
      />
    </svg>
  );
}
