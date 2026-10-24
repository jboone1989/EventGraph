import {
  isRouteErrorResponse, Link, Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useLocation, useNavigation, useRouteError, useRouteLoaderData,
  type ShouldRevalidateFunction,
} from "react-router";
import type { SiteMeta } from "@aihot/contracts/site";
import { adsenseVerificationId } from "@aihot/contracts/adsense";
import { POLICY, SITE } from "@aihot/site";
import { RingMark } from "@aihot/site/brand/Logo.tsx";
import { useEffect, useState, type ReactNode } from "react";
import type { Route } from "./+types/root";
import "./app.css";
import { Sidebar } from "./components/shell/Sidebar";
import { LanguageSwitch, setUiLanguage, useText, useUiLanguage } from "./components/LanguageSwitch";
import { ClientLanguageMeta } from "./components/ClientLanguageMeta";
import { isEnglishPath } from "./lib/edition";
import { AnalyticsTracker } from "./components/AnalyticsTracker";
import { TabBar } from "./components/shell/TabBar";
import { PullToRefresh } from "./components/shell/PullToRefresh";
import { usePageTransition } from "./components/shell/transitions";
import { SearchOverlay } from "./features/search/SearchOverlay";
import { BackToTop, NavigationProgress } from "./components/shell/Chrome";
import { buttonClass } from "./components/ui/Controls";
import { rememberPage, APPEARANCE_BOOT_SCRIPT, useAppearanceSync } from "./lib/local-state";
import { apiGet } from "./lib/api.server";
import { useHydratedFlag } from "./lib/hydration";
import { titled } from "./lib/seo";
import { webModules } from "./site-modules";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico?v=lr-night-1", sizes: "any" },
  { rel: "icon", type: "image/png", href: "/icon.png?v=lr-night-1" },
  { rel: "apple-touch-icon", href: "/apple-icon.png?v=lr-night-1" },
  { rel: "manifest", href: "/manifest.webmanifest?v=lr-night-1" },
  { rel: "alternate", type: "application/rss+xml", title: `${SITE.name} — 精选`, href: "/feed.xml" },
];

/** The release rendering this document: once a newer one is deployed, a render error reloads the page (entry.client). */
export async function loader({ request }: Route.LoaderArgs) {
  // Only public project/verification tokens reach HTML. Never expose private API keys.
  const cloudflare = process.env.CLOUDFLARE_WEB_ANALYTICS_TOKEN ?? "";
  const posthog = process.env.POSTHOG_PROJECT_TOKEN ?? "";
  const searchConsole = process.env.GOOGLE_SITE_VERIFICATION ?? "";
  const analytics = {
    cloudflareToken: /^[a-zA-Z0-9_-]{16,100}$/.test(cloudflare) ? cloudflare : null,
    posthogToken: /^phc_[a-zA-Z0-9]{16,100}$/.test(posthog) ? posthog : null,
    posthogRegion: process.env.POSTHOG_REGION === "eu" ? "eu" as const : "us" as const,
    searchConsoleVerification: /^[a-zA-Z0-9_-]{8,160}$/.test(searchConsole) ? searchConsole : null,
  };
  const release = process.env.AIHOT_RELEASE ?? null;
  const adsenseAccount = adsenseVerificationId(process.env);
  try {
    const meta = await apiGet<SiteMeta>("/api/site/meta", {
      headers: Object.assign({}, ...webModules().map((m) => m.root?.documentHeaders?.(request) ?? {})),
      signal: request.signal,
    });
    return { ...meta, release, adsenseAccount, analytics };
  } catch {
    return { changelogVersion: null, release, adsenseAccount, analytics };
  }
}

export const shouldRevalidate: ShouldRevalidateFunction = () => false;

export function Layout({ children }: { children: React.ReactNode }) {
  const site = useRouteLoaderData<typeof loader>("root");
  const [documentRelease] = useState(site?.release ?? null);
  const english = isEnglishPath(useLocation().pathname);
  return (
    <html lang={english ? "en" : SITE.locale} data-language={english ? "en" : undefined} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        {site?.adsenseAccount && <meta name="google-adsense-account" content={site.adsenseAccount} />}
        {site?.analytics.searchConsoleVerification && <meta name="google-site-verification" content={site.analytics.searchConsoleVerification} />}
        {documentRelease && <meta name="livingruntime-release" content={documentRelease} />}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f4f5f8" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0d16" />
        <meta name="apple-mobile-web-app-title" content={SITE.name} />
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT_SCRIPT }} />
        {webModules().map((m) => m.root?.bootScript && <script key={m.name} dangerouslySetInnerHTML={{ __html: m.root.bootScript }} />)}
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration getKey={(location) => location.key} />
        <Scripts />
        {site?.analytics.cloudflareToken && <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon={JSON.stringify({ token: site.analytics.cloudflareToken, spa: true })} />}
      </body>
    </html>
  );
}

/** Only a page nobody matched falls back to this; every page names itself. */
export function meta({ error }: Route.MetaArgs) {
  if (!error) return [];
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return [{ title: titled(notFound ? "页面不存在" : "暂时无法加载") }, { name: "robots", content: "noindex" }];
}

/** The legal footer every public page carries (AdSense reviewers must reach the policies in one click).
 *  English serves both the /en edition's server render and a reader's language preference. */
function SiteFooter({ english }: { english: boolean }) {
  const en = english || useUiLanguage() === "en";
  const email = SITE.contactEmail;
  return (
    <footer className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-line py-5 text-[12px] text-ink-4">
      <Link to={en ? "/en/privacy" : "/privacy"} className="transition-colors hover:text-accent">
        {en ? "Privacy" : "隐私说明"}
      </Link>
      <Link to={en ? "/en/terms" : "/terms"} className="transition-colors hover:text-accent">
        {en ? "Terms" : POLICY.terms.name}
      </Link>
      {email && (
        <a href={`mailto:${email}`} className="transition-colors hover:text-accent">
          {en ? `Contact ${email}` : `联系 ${email}`}
        </a>
      )}
    </footer>
  );
}

/** Sidebar, main column and phone tab bar around a page (or an error). */
function SiteShell({ changelogVersion, children }: { changelogVersion: string | null; children: ReactNode }) {
  const navigation = useNavigation();
  // The phone search and pull-to-refresh are client-side, mounted once the page is interactive.
  const t=useText();
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  // A reader who arrives on the English edition keeps reading in English on pages without one.
  const english = isEnglishPath(useLocation().pathname);
  useEffect(() => { if (english) setUiLanguage("en"); }, [english]);
  return (
    <div className="flex min-h-dvh">
      <ClientLanguageMeta />
      <NavigationProgress active={navigation.state === "loading"} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2">
        {t("跳到正文","Skip to content")}
      </a>
      <Sidebar changelogVersion={changelogVersion} />
      {/* Phone shell (≤ 960px): each page's top bar (PhoneBar), one centred column, the tab bar below.
          Desktop: the page fills the main area up to the list width (--page-max-wide), centred beyond it. */}
      <main id="main" className="min-w-0 flex-1 pb-[calc(72px+env(safe-area-inset-bottom))] lg:px-7 lg:pb-[72px] lg:pt-6">
        <div className="mx-auto w-full max-w-[640px] pl-[var(--gutter-l)] pr-[var(--gutter-r)] lg:max-w-[var(--page-max-wide)] lg:px-0">
          {webModules().map((m) => m.root?.Top && <m.root.Top key={m.name} />)}
          {children}
          <SiteFooter english={english} />
        </div>
      </main>
      <div className="fixed bottom-[calc(66px+env(safe-area-inset-bottom))] right-3 z-[55] lg:hidden"><LanguageSwitch /></div>
      <TabBar changelogVersion={changelogVersion} />
      {interactive && <SearchOverlay />}
      {interactive && <PullToRefresh />}
      <BackToTop />
    </div>
  );
}

export default function App() {
  const meta = useLoaderData<typeof loader>();
  useHydratedFlag();
  useAppearanceSync();
  const { pathname, search } = useLocation();
  useEffect(() => rememberPage(pathname + search), [pathname, search]);
  usePageTransition();
  // iOS Safari only shows :active (pressed) styles once the document listens for touches.
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);
  // The admin has its own chrome.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return <Outlet />;
  return (
    <>
      <AnalyticsTracker config={meta.analytics} />
      <SiteShell changelogVersion={meta.changelogVersion}>
        <Outlet />
      </SiteShell>
      {webModules().map((m) => m.root?.Bottom && <m.root.Bottom key={m.name} />)}
    </>
  );
}

export function ErrorBoundary() {
  useAppearanceSync();
  const t=useText();
  const error = useRouteError();
  const site = useRouteLoaderData<typeof loader>("root");
  const { pathname, search, hash } = useLocation();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const notFound = status === 404;
  const body = (
    <div className="flex min-h-[70vh] items-center justify-center px-2 py-16">
      <div className="max-w-sm text-center">
        <RingMark className="mx-auto mb-5 size-10 text-accent" />
        <div className="mono text-[12px] text-ink-4">{status}</div>
        <h1 className="mt-1.5 text-[20px] font-bold text-ink">{notFound ? t("这里没有内容","Page not found") : t("暂时无法加载","Unable to load")}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
          {notFound ? t("你访问的页面不存在，或内容已不再公开。","This page does not exist or is no longer public.") : t("页面暂时无法显示，请重新加载后再试。","The page is temporarily unavailable. Please try again.")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          {!notFound && <Link reloadDocument to={pathname + search + hash} className={buttonClass("primary")}>
            {t("重新加载","Reload")}
          </Link>}
          <Link reloadDocument to="/" className={buttonClass(notFound ? "primary" : "secondary")}>
            {t("回到精选","News")}
          </Link>
          <Link reloadDocument to="/all" className={buttonClass("secondary")}>
            {t("浏览全部动态","All news")}
          </Link>
        </div>
      </div>
    </div>
  );
  // Admin errors stay inside the admin's own chrome.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return body;
  return <SiteShell changelogVersion={site?.changelogVersion ?? null}>{body}</SiteShell>;
}
