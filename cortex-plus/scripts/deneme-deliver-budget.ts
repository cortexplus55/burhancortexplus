/**
 * Söz verilen soru sayısı, bütçe içinde teslim edildi mi?
 * Çıkış 0 yalnız delivered === promised ve elapsedMs <= budgetMs iken.
 */
import { replayPublishCap } from "../src/lib/learning/deneme-budget-proof";

replayPublishCap()
  .then((result) => {
    const passed = result.ok && result.delivered === result.promised && result.elapsedMs <= result.budgetMs;
    console.log(
      JSON.stringify({
        delivered: result.delivered,
        promised: result.promised,
        elapsedMs: result.elapsedMs,
        budgetMs: result.budgetMs,
        ok: passed,
      }),
    );
    if (!passed) process.exit(1);
  })
  .catch(() => {
    process.exit(1);
  });
