/**
 * "Başka birini seç" / "+" (18 Ekim 2026, Astra'daki gibi): yol sırayla açılır, öğrencinin
 * kendi seçtiği etkinlik ise sırası gelmeden açılır. Seçim kilidi sunucuda kaldırır; düğüm
 * sayfası kilitli adımı açmaz, bu yüzden gitmeden önce çağrılır.
 */
export async function chooseStudyNode(prepId: string, nodeId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/learning/exam-prep/node", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prepId, nodeId, action: "choose" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
