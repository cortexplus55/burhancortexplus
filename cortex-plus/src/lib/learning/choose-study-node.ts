/**
 * Öğrencinin seçtiği etkinlik sırası gelmeden açılır. Seçim kilidi sunucuda kaldırır
 * (`locked` → `ready`). Sayfa da aynı geçişi yapar; gitmeden önce çağırmak yarışı kapatır.
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
