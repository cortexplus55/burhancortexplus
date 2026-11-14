import type { ReactNode } from "react";

/**
 * Yeni görünüm sarmalayıcısı (Faz 4B'den beri sayfalarda elle yazılan desenin ortak hâli). Anahtar boşsa çocukları
 * olduğu gibi döndürür: bayrak KAPALIYKEN DOM eskisiyle aynı. Açıkken `display: contents` (yerleşim değişmez).
 */
export function UiScope({
  keys,
  children,
}: {
  keys: readonly string[];
  children: ReactNode;
}) {
  if (!keys.length) return <>{children}</>;
  return (
    <div
      className="cx-ui-scope"
      data-ui={keys.join(" ")}
      style={{ display: "contents" }}
    >
      {children}
    </div>
  );
}
