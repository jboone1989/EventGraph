// The site's modules on the web (site/modules/web.ts). Shared engine files read them where they draw them,
// not when they are imported, so a module's code may import any engine file.
import { WEB_MODULES } from "@aihot/site/modules/web";
import { moduleShowsEntries, type Part, type WebModule } from "./modules";

export function webModules(): readonly WebModule[] {
  return WEB_MODULES;
}

/** The parts a page draws, in the site's order: awaited at the top of the page's module, so they load with it. */
export async function loadParts<T>(pick: (m: WebModule) => Part<T> | undefined): Promise<Array<{ name: string; part: T }>> {
  return Promise.all(WEB_MODULES.flatMap((m) => {
    const load = pick(m);
    return load ? [load().then((loaded) => ({ name: m.name, part: loaded.default }))] : [];
  }));
}

/**
 * Every module's state for the document about to render (its `root.state`), read beside `/api/site/meta`:
 * null where the module has none or its read failed, so the shell treats an unread state as "show nothing".
 * The api client is handed in by the root loader: this shared file cannot name a server-only module.
 */
export async function moduleStates(api: <T>(path: string) => Promise<T>): Promise<Record<string, unknown>> {
  const read = WEB_MODULES.map(async (m) => {
    if (!m.root?.state) return [m.name, null] as const;
    try {
      return [m.name, await m.root.state(api)] as const;
    } catch {
      return [m.name, null] as const;
    }
  });
  return Object.fromEntries(await Promise.all(read));
}

/**
 * Whether one of the modules' shown navigation entries leads to `to`: what a page linking into a section
 * (the about page's research button) asks, so it never advertises an entry the navigation itself hides.
 */
export function moduleEntryShows(to: string, states: Record<string, unknown> | undefined): boolean {
  return WEB_MODULES.some((m) => moduleShowsEntries(m, states) && [...(m.sidebar?.items ?? []), ...(m.tools ?? [])].some((i) => i.to === to));
}
