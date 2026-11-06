import { Fragment } from "react";

/**
 * Teknik denetim metinlerinde (şema kontrolü) geçen veritabanı fonksiyon ve tablo adlarını kod olarak işaretler.
 * Bu adlar çevrilemez (koddaki gerçek ad); düz cümlenin parçası gibi görünmesinler diye `<code>` içinde,
 * ikincil renkte yazılır (6 Kasım 2026, panel Türkçe kuralı).
 */
const IDENTIFIER = /([a-z][a-z0-9]*(?:_[a-z0-9]+)+(?:\(\))?)/g;

export function CodeAware({ text }: { text: string }) {
  const parts = text.split(IDENTIFIER);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className="adm-code">
            {part}
          </code>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
