// Share the exact same discussion across /story, /en/story and every grouped news item.
export function discussionTermFor(storyPublicId: string | null | undefined): string | null {
  if (!storyPublicId || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(storyPublicId)) return null;
  return `eventgraph:story:${storyPublicId.toLowerCase()}`;
}
