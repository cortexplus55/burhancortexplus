/** Göç henüz çalışmadıysa PostgREST kolonu tanımaz. Sayfa bu yüzden düşmemeli. */
export function missingColumn(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`;
  return /42703|PGRST204|schema cache|does not exist|Could not find the/i.test(text);
}
