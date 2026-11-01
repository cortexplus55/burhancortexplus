/**
 * Aynı anda en fazla bir tanıtım penceresi (2 Kasım 2026): seri karşılaması ve rozet duyurusu ders
 * öncesinde üst üste açılıyordu. Önce gelen yeri alır; diğeri sessizce bir sonraki sayfaya kalır.
 */
let holder: string | null = null;

export function claimModalSlot(id: string): boolean {
  if (holder && holder !== id) return false;
  holder = id;
  return true;
}

export function releaseModalSlot(id: string): void {
  if (holder === id) holder = null;
}

/** Yalnız testler için. */
export function resetModalSlot(): void {
  holder = null;
}
