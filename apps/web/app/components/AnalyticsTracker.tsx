import { useEffect, useRef } from "react";
import { useLocation, useNavigation } from "react-router";
import { useUiLanguage } from "./LanguageSwitch";
import { setAnalyticsConfig, trackAnalytics, type AnalyticsConfig } from "../lib/analytics.client";

// Browser-side only; SSR renders no tracking markup. No events from admin routes or bots.
export function AnalyticsTracker({ config }: { config: AnalyticsConfig }) {
  const { pathname } = useLocation();
  const navigation = useNavigation();
  const language = useUiLanguage();
  const started = useRef<number | null>(null);
  const last = useRef<string | null>(null);

  useEffect(() => { setAnalyticsConfig(config); }, [config]);
  useEffect(() => {
    if (navigation.state === "loading" && started.current === null)
      started.current = performance.now();
  }, [navigation.state]);
  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    if (last.current === pathname) return;
    last.current = pathname;
    trackAnalytics("page_view", { language });
    const id = pathname.match(/^\/(?:en\/)?(story|items)\/([a-zA-Z0-9_-]{1,80})/);
    if (id) trackAnalytics(id[1] === "story" ? "story_open" : "item_open", { language, contentId: id[2] });
    if (pathname === "/agent") trackAnalytics("agent_access_open", { language });
    if (pathname === "/feedback") trackAnalytics("feedback_open", { language });
    if (started.current !== null) {
      trackAnalytics("navigation_complete", { language, durationMs: performance.now() - started.current });
      started.current = null;
    }
  }, [pathname, language]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>('a[data-analytics-event="source_open"]');
      if (link) trackAnalytics("source_open", { language });
    }
    function onSubmit(event: SubmitEvent) {
      const form = event.target;
      if (form instanceof HTMLFormElement && form.matches('[role="search"]'))
        trackAnalytics("search_submit", { language });
    }
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("submit", onSubmit); };
  }, [language]);
  return null;
}
