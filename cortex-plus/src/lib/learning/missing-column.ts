/** Göç henüz çalışmadıysa PostgREST kolonu tanımaz. Sayfa bu yüzden düşmemeli. */
export function missingColumn(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`;
  return /42703|PGRST204|schema cache|does not exist|Could not find the/i.test(text);
}

/** Göç henüz çalışmadıysa tablo yok. Okuma boş, yazma sessiz, silme o tabloyu atlar. */
export function missingRelation(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`;
  return /42P01|PGRST205/i.test(text) || (/relation|table/i.test(text) && /does not exist|schema cache/i.test(text));
}

export function missingSchema(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  return missingColumn(error) || missingRelation(error);
}
