export function threadComments<
  T extends { id: string; parent_id: string | null },
>(comments: T[]): { comment: T; depth: number }[] {
  const ids = new Set(comments.map((c) => c.id)),
    children = new Map<string | null, T[]>();
  for (const comment of comments) {
    const parent =
      comment.parent_id && ids.has(comment.parent_id)
        ? comment.parent_id
        : null;
    const group = children.get(parent) || [];
    group.push(comment);
    children.set(parent, group);
  }
  const result: { comment: T; depth: number }[] = [],
    visited = new Set<string>();
  function walk(items: T[], depth: number) {
    for (const comment of items) {
      if (visited.has(comment.id)) continue;
      visited.add(comment.id);
      result.push({ comment, depth });
      walk(children.get(comment.id) || [], depth + 1);
    }
  }
  walk(children.get(null) || [], 0);
  for (const comment of comments)
    if (!visited.has(comment.id)) walk([comment], 0);
  return result;
}
