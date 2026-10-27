import { motion } from "motion/react";
import { Suspense } from "react";
import { SITE } from "@aihot/site";
import { Await, NavLink, Outlet, useLocation, useNavigation, type ShouldRevalidateFunction } from "react-router";
import type { Route } from "./+types/layout";
import { RingMark } from "@aihot/site/brand/Logo.tsx";
import { NavigationProgress } from "../../components/shell/Chrome";
import type { AdminMe, AdminNavCounts } from "@aihot/contracts/admin";
import { Toaster } from "../../features/admin/toast";
import { adminGet } from "../../lib/admin.server";
import type { AdminNavEntry } from "../../modules";
import { webModules } from "../../site-modules";

export async function loader({ request }: Route.LoaderArgs) {
  const counts = adminGet<AdminNavCounts>(request, "/api/admin/nav-counts").catch((): AdminNavCounts => ({}));
  const me = await adminGet<AdminMe>(request, "/api/admin/me");
  // Reset the badge boundaries so a navigation transition never keeps the old page waiting on them.
  return { me, counts, countsKey: crypto.randomUUID() };
}

// Verify identity and update badges on every navigation/command; badges do not hold up the page.
export const shouldRevalidate: ShouldRevalidateFunction = () => true;

export const meta: Route.MetaFunction = () => [{ title: `${SITE.name} 后台` }, { name: "robots", content: "noindex, nofollow" }];

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Accel-Buffering": "no" });

/** The operational overview is the starting point; all existing module routes remain. */
const nav = (): Array<{ group: string; items: AdminNavEntry[] }> => [
  { group: "运行", items: [
      { to: "/admin", label: "运营总览" },
      { to: "/admin/runs", label: "运行与积压", count: "runs", tone: "bad" },
    ] },
  ...webModules().flatMap((m) => m.admin?.groups ?? []),
  { group: "采集与内容", items: [
      { to: "/admin/sources", label: "新闻信源", count: "sources", tone: "bad" },
      { to: "/admin/candidates", label: "信源候选" },
      { to: "/admin/content", label: "内容诊断" },
      ...webModules().flatMap((m) => m.admin?.content ?? []),
    ] },
  { group: "模型服务", items: [
      { to: "/admin/models", label: "Provider 与模型" },
    ] },
  { group: "效果", items: [
      { to: "/admin/analytics", label: "流量与效果" },
    ] },
  { group: "系统设置", items: [
      { to: "/admin/feedback", label: "反馈", count: "feedback", tone: "accent" },
      { to: "/admin/settings", label: "设置" },
      { to: "/admin/audit", label: "审计记录" },
    ] },
];

type Counts = Pick<Route.ComponentProps["loaderData"], "counts" | "countsKey">;

function NavCount({ counts, countsKey, name, className }: Counts & { name: string | undefined; className: string }) {
  if (!name) return null;
  return (
    <Suspense key={countsKey} fallback={null}>
      <Await resolve={counts} errorElement={null}>
        {(resolved: AdminNavCounts) => resolved[name] ? <span className={className}>{resolved[name]}</span> : null}
      </Await>
    </Suspense>
  );
}

function NavItem({ to, label, count, counts, countsKey, tone }: AdminNavEntry & Counts) {
  return (
    <NavLink to={to} end={to === "/admin"} className="group relative block">
      {({ isActive }) => (
        <span className={`relative flex items-center justify-between rounded-control px-3 py-[7px] text-[13.5px] transition-colors ${isActive ? "font-medium text-ink" : "text-ink-3 hover:text-ink"}`}>
          {isActive && <motion.span layoutId="admin-nav" className="absolute inset-0 rounded-control bg-surface shadow-sm ring-1 ring-line" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
          <span className="relative">{label}</span>
          <NavCount counts={counts} countsKey={countsKey} name={count} className={`num relative min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 ${tone === "bad" ? "bg-hot text-white" : "bg-accent-soft text-accent"}`} />
        </span>
      )}
    </NavLink>
  );
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { me, counts, countsKey } = loaderData;
  const navigation = useNavigation();
  const location = useLocation();
  const groups = nav();
  const flat = groups.flatMap((g) => g.items);
  const primary = new Set(["/admin", "/admin/runs", "/admin/sources"]);
  const mobileMain = flat.filter(i => primary.has(i.to));
  const mobileMore = flat.filter(i => !primary.has(i.to));
  return (
    <div className="flex min-h-dvh bg-bg">
      <NavigationProgress active={navigation.state === "loading"} />
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line bg-bg-sunk/60 px-3 py-4 lg:flex">
        <a href="/" className="mb-5 flex items-center gap-2 px-2">
          <RingMark className="size-6 text-accent" />
          <span className="min-w-0"><span className="block text-[15px] font-semibold tracking-tight text-ink">{`${SITE.name} 后台`}</span><span className="block text-[11px] text-ink-4">无人值守 · 自动运行</span></span>
        </a>
        <nav className="scrollbar-thin flex-1 space-y-4 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.group}>
              <div className="mb-1 px-3 text-[11.5px] font-medium tracking-wide text-ink-4">{g.group}</div>
              <div className="space-y-0.5">
                {g.items.map((i) => (
                  <NavItem key={i.to} {...i} counts={counts} countsKey={countsKey} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-3 border-t border-line px-2 pt-3 text-[12.5px] text-ink-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{me.name}</span>
            {me.dev && <span className="rounded bg-amber/15 px-1.5 text-[11px] font-medium text-amber">开发</span>}
          </div>
          <form method="post" action="/api/auth/logout" className="mt-1.5">
            <button type="submit" className="text-ink-4 hover:text-ink-2">退出登录</button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2 px-4 pt-3">
            <RingMark className="size-5 text-accent" />
            <span className="text-[14px] font-semibold text-ink">{`${SITE.name} 后台`}</span>
            {me.dev && <span className="rounded bg-amber/15 px-1.5 text-[11px] font-medium text-amber">开发</span>}
          </div>
          <div className="flex items-start gap-1 px-3 py-2">
            <nav aria-label="后台主要操作" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {mobileMain.map((i) => {
                const active = i.to === "/admin" ? location.pathname === "/admin" : location.pathname === i.to || location.pathname.startsWith(`${i.to}/`);
                return (
                  <NavLink key={i.to} to={i.to} end={i.to === "/admin"} className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] transition-colors ${active ? "bg-ink text-bg" : "bg-surface text-ink-3 ring-1 ring-line"}`}>
                    {i.label}
                    <NavCount counts={counts} countsKey={countsKey} name={i.count} className="num ml-1 text-[11px] opacity-70" />
                  </NavLink>
                );
              })}
            </nav>
            <details className="group relative z-50 shrink-0">
              <summary className="cursor-pointer list-none whitespace-nowrap rounded-full bg-surface px-3 py-2 text-[12.5px] text-ink-2 ring-1 ring-line focus-visible:outline-2 focus-visible:outline-accent">更多 <span aria-hidden="true">▾</span></summary>
              <div className="absolute right-0 top-full z-50 mt-2 max-h-[65vh] w-52 overflow-y-auto rounded-panel border border-line bg-surface p-2 shadow-lg">
                {mobileMore.map(i => <NavLink key={i.to} to={i.to} className="block rounded-control px-3 py-2.5 text-[13px] text-ink hover:bg-bg-sunk">{i.label}</NavLink>)}
              </div>
            </details>
          </div>
        </div>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
