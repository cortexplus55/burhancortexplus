import type { ReactNode } from "react";

/** Sayfa istemci bileşeni olduğu için başlık burada (6 Kasım 2026: sekmede genel başlık görünüyordu). */
export const metadata = { title: "Şifremi unuttum" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
