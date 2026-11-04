import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouteLoaderData } from "react-router";
import { POLICY, SITE } from "@aihot/site";
import type { loader as rootLoader } from "../root";
import { useChangelogDot } from "../components/shell/Sidebar";
import { PhoneBar } from "../components/shell/PhoneBar";
import { inNav } from "../components/shell/nav";
import type { Screen } from "../components/shell/screens";
import { edgeTtl } from "../lib/api.server";
import { webModules } from "../site-modules";
import { pageMeta } from "../lib/seo";
import { setFontPreference, useFontPreference, useStarred } from "../lib/local-state";
import { trackAnalytics } from "../lib/analytics.client";
import { Select } from "../components/ui/Controls";
import { ThemeSwitch } from "../components/shell/ThemeSwitch";
import { LanguageSwitch, useUiLanguage } from "../components/LanguageSwitch";
import { IconNetwork, IconBookmark, IconChevronRight, IconClock, IconGrid, IconHeart, IconHistory, IconMessage, IconMoon, IconPlug, IconSparkles } from "../components/icons";

export const handle: Screen = { tab: "me", name: "我的" };

export function headers() {
  return edgeTtl(300);
}

export function meta() {
  return pageMeta({ title: "我的", path: "/more", noindex: true });
}

/**
 * "我的", the phone's last tab (the address stays /more): this browser's bookmarks and appearance first,
 * then the tools, then the site's own pages.
 */
type Row = { to: string; label: string; icon: ReactNode; detail?: ReactNode };

/** The ways in that the agent page offers, the modules' first; its row names the first three. */
const agentWays = () => [...webModules().flatMap((m) => m.agentWays ?? []), "MCP", "RSS", "API"];

/** The modules' tools first, then the engine's. */
const tools = (): Row[] => [
  ...webModules().flatMap((m) => m.tools ?? []),
  { to: "/knowledge", label: "知识网络", icon: <IconNetwork size={20} />, detail: "实体 · 关系 · 来源" },
  { to: "/calendar", label: "政策与数据日历", icon: <IconClock size={20} />, detail: "发布日程 · 可订阅" },
  ...(inNav("/explore") ? [{ to: "/explore", label: "探索工作台", icon: <IconHistory size={20} />, detail: "时点回放 · 关系证据" }] : []),
  { to: "/daily", label: "日报与回顾", icon: <IconGrid size={20} /> },
  ...(inNav("/topics") ? [{ to: "/topics", label: "主题", icon: <IconGrid size={20} /> }] : []),
  { to: "/agent", label: "Agent 接入", icon: <IconPlug size={20} />, detail: agentWays().slice(0, 3).join(" · ") },
];

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section>
      {title && <h2 className="px-4 pb-2 pt-6 text-[13px] font-semibold text-ink-3">{title}</h2>}
      <ul className="card divide-y divide-line-soft overflow-hidden">{children}</ul>
    </section>
  );
}

function RowLink({ row, dot = false }: { row: Row; dot?: boolean }) {
  const lang=useUiLanguage();
  return (
    <li>
      <Link viewTransition to={row.to} className="flex min-h-[52px] items-center gap-3 px-4 text-[16px] font-medium text-ink transition-colors active:bg-bg-sunk lg:hover:bg-bg-sunk">
        <span className="text-ink-3">{row.icon}</span>
        <span className="flex flex-1 items-center gap-2">
          {row.label}
          {dot && <span className="size-[7px] rounded-full bg-hot" aria-label={lang==="en"?"New updates":"有新的更新"} />}
        </span>
        {row.detail && <span className="text-[14px] font-normal text-ink-4">{row.detail}</span>}
        <IconChevronRight size={16} className="text-ink-4" />
      </Link>
    </li>
  );
}

export default function MorePage() {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const changelogDot = useChangelogDot(root?.changelogVersion ?? null);
  const starred = useStarred();
  const font = useFontPreference();
  const language = useUiLanguage();
  // The count is this browser's: shown once the page runs here, never in the shared server copy.
  const [here, setHere] = useState(false);
  useEffect(() => setHere(true), []);
  if (language === "en") return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-8">
      <PhoneBar title="More" large />
      <h1 className="hidden pb-4 pt-1 text-[22px] font-bold text-ink lg:block">Settings & tools</h1>
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-4 2xl:grid-cols-3">
        <Group title="PREFERENCES">
          <li className="flex min-h-[56px] items-center justify-between gap-3 px-4 text-[15px] text-ink">
            <span>Language</span><LanguageSwitch />
          </li>
          <li className="flex min-h-[56px] items-center justify-between gap-3 px-4 text-[15px] text-ink"><span>Appearance</span><ThemeSwitch className="w-[126px]" /></li>
          <li className="flex min-h-[56px] items-center justify-between gap-3 px-4 text-[15px] text-ink">
            <span>Font</span><Select aria-label="Font" value={font ?? "system"} onChange={e=>setFontPreference(e.target.value==="browser"?"browser":null)}>
              <option value="system">Default</option><option value="browser">Browser font</option>
            </Select>
          </li>
        </Group>
        <Group title="RESEARCH">
          <RowLink row={{to:"/knowledge",label:"Knowledge Graph",icon:<IconNetwork size={20}/>,detail:"Entities · Facts"}} />
          {inNav("/explore") && <RowLink row={{to:"/explore",label:"Event explorer",icon:<IconHistory size={20}/>,detail:"Replay · Evidence"}} />}
          <RowLink row={{to:"/hot",label:"Event Timeline",icon:<IconGrid size={20}/>}} />
          <RowLink row={{to:"/starred",label:"Saved reports",icon:<IconBookmark size={20}/>,detail:here&&starred.length?String(starred.length):undefined}} />
          <RowLink row={{to:"/daily",label:"Daily report (Chinese edition)",icon:<IconGrid size={20}/>}} />
        </Group>
        <Group title={SITE.name.toUpperCase()}>
          <RowLink row={{to:"/about",label:"About",icon:<IconHeart size={20}/>}} />
          <RowLink row={{to:"/feedback",label:"Feedback",icon:<IconMessage size={20}/>}} />
          <RowLink row={{to:"/changelog",label:"Updates",icon:<IconSparkles size={20}/>}} dot={changelogDot}/>
        </Group>
      </div>
      <div className="mt-6 flex justify-center gap-5 text-[12px] text-ink-4">
        <Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><a href="/feed.xml" onClick={() => trackAnalytics("rss_open")}>RSS</a>
      </div>
    </div>
  );
  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-8">
      <PhoneBar title={"我的"} large />
      <h1 className="hidden pb-4 pt-1 text-[22px] font-bold text-ink lg:block">{"我的"}</h1>
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-4 2xl:grid-cols-3">
        <Group>
          <li className="flex min-h-[56px] items-center justify-between gap-3 px-4 text-[16px] text-ink"><span>{"语言"}</span><LanguageSwitch /></li>
          <RowLink row={{ to: "/starred", label: "收藏", icon: <IconBookmark size={20} />, detail: here && starred.length > 0 ? <span className="num">{starred.length}</span> : undefined }} />
          <li className="flex min-h-[56px] items-center gap-3 px-4 text-[16px] font-medium text-ink">
            <span className="text-ink-3">
              <IconMoon size={20} />
            </span>
            <span className="flex-1">{"外观"}</span>
            <ThemeSwitch className="w-[126px]" />
          </li>
          <li className="flex min-h-[56px] items-center gap-3 px-4 text-[16px] font-medium text-ink">
            <span className="w-5 text-center text-ink-3" aria-hidden="true">Aa</span>
            <span className="flex-1">字体</span>
            <Select aria-label="字体" value={font ?? "system"} onChange={(e) => setFontPreference(e.target.value === "browser" ? "browser" : null)}>
              <option value="system">默认字体</option>
              <option value="browser">浏览器默认字体</option>
            </Select>
          </li>
        </Group>
        <Group title={"工具与入口"}>
          {tools().map((r) => (
            <RowLink key={r.to} row={r} />
          ))}
        </Group>
        <Group title={"关于"}>
          <RowLink row={{ to: "/about", label: `关于 ${SITE.name}`, icon: <IconHeart size={20} /> }} />
          <RowLink row={{ to: "/changelog", label: "更新日志", icon: <IconSparkles size={20} /> }} dot={changelogDot} />
          <RowLink row={{ to: "/feedback", label: "意见反馈", icon: <IconMessage size={20} /> }} />
        </Group>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] leading-[2] text-ink-4">
        <Link viewTransition to="/terms" className="hover:text-ink-2">{POLICY.terms.name}</Link>
        <Link viewTransition to="/privacy" className="hover:text-ink-2">隐私说明</Link>
        <a href="/feed.xml" className="hover:text-ink-2" onClick={() => trackAnalytics("rss_open")}>RSS</a>
        {SITE.icp && <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="hover:text-ink-2">{SITE.icp}</a>}
      </div>
    </div>
  );
}
