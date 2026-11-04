// The event detail and its language editions share one event-level discussion.
export function discussionTermFor(storyPublicId: string | null | undefined): string | null {
  if (!storyPublicId || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(storyPublicId)) return null;
  return `eventgraph:story:${storyPublicId.toLowerCase()}`;
}

// Every public article has its own discussion, regardless of Story membership.
// Language and original-body variants keep the same stable article ID.
export function itemDiscussionTermFor(itemId: string | null | undefined): string | null {
  if (!itemId || !/^[a-z0-9_-]{1,128}$/i.test(itemId)) return null;
  return `eventgraph:item:${itemId.toLowerCase()}`;
}
