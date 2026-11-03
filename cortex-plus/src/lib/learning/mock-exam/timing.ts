/**
 * Kaldırılması kolay zamanlama (3 Kasım 2026): her adımın ms'si `Server-Timing` başlığında ve tek JSON log satırında
 * (`mock_exam_timing`). Tarayıcı DevTools → Network → Timing'de görünür; kaldırmak için bu yardımcı ve çağrıları silinir.
 */
export function createTimer(now: () => number = Date.now) {
  const t0 = now();
  let last = t0;
  const marks: Array<[string, number]> = [];
  return {
    mark(name: string) {
      const t = now();
      marks.push([name, t - last]);
      last = t;
    },
    totalMs() {
      return now() - t0;
    },
    header() {
      return [...marks, ["total", now() - t0] as [string, number]].map(([n, ms]) => `${n};dur=${ms}`).join(", ");
    },
    log(path: string) {
      console.info(JSON.stringify({ event: "mock_exam_timing", path, total: now() - t0, ...Object.fromEntries(marks) }));
    },
  };
}
