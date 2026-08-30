export function examPrepHomeHref(prepId: string) {
  return `/deneme-sinavlari/${prepId}`;
}

export function examPrepTopicHref(prepId: string) {
  return `/deneme-sinavlari/${prepId}/konu`;
}

export function examPrepIntroHref(prepId: string) {
  return `/deneme-sinavlari/${prepId}/tanisma`;
}

export function examPrepNodeHref(prepId: string, nodeId: string) {
  return `/deneme-sinavlari/${prepId}/dugum/${nodeId}`;
}

export function needsExamIntro(
  introCompletedAt: string | null | undefined,
  nodes: { status: string }[],
) {
  if (introCompletedAt) return false;
  return !nodes.some((node) => node.status === "done");
}
