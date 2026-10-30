/**
 * Yol etkinliği ucunun yönlendiricisi: ortak kabuk (`loadNodeContext`) bir kez, sonra eyleme göre tek modül.
 * Bir etkinliğe dokunan kişi yalnız o eylemin ya da türün modülünü değiştirir.
 */
import "server-only";
import { NextResponse } from "next/server";
import { loadNodeContext, type NodeCaller, type NodeRequestOptions } from "./context";
import { warmAction } from "./actions/warm";
import { reviewAction } from "./actions/review";
import { gradeCheckAction } from "./actions/grade-check";
import { progressAction } from "./actions/progress";
import { resumeAction } from "./actions/resume";
import { saveAction } from "./actions/save";
import { completeAction } from "./complete";
import { startAction } from "./start";

export async function handleNodeRequest(
  ctx: NodeCaller,
  rawBody: unknown,
  options: NodeRequestOptions,
): Promise<NextResponse> {
  const loaded = await loadNodeContext(ctx, rawBody, options);
  if (loaded instanceof Response) return loaded;
  switch (loaded.action) {
    case "warm":
      return warmAction(loaded);
    case "review":
      return reviewAction(loaded);
    case "grade-check":
      return gradeCheckAction(loaded);
    case "progress":
      return progressAction(loaded);
    case "resume":
      return resumeAction(loaded);
    case "save":
      return saveAction(loaded);
    case "complete":
      return completeAction(loaded);
    default:
      return startAction(loaded);
  }
}
