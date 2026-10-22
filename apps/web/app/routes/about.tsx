import { Fragment, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { IntentLink } from "../components/ui/IntentLink";
import { Link, useLoaderData } from "react-router";
import type { SiteContact, SiteStats } from "@aihot/contracts/site";
import { ABOUT, ABOUT_EN, POLICY, REPORTS, REPORTS_EN, SITE, subjectAfter } from "@aihot/site";
import { apiGet, cachedPage } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { organizationLd, pageMeta } from "../lib/seo";
import { Kicker } from "../components/ui/Kicker";
import { buttonClass } from "../components/ui/Controls";
import { IconArrowRight } from "../components/icons";
import { SignalRiver, type RiverSource } from "../features/about/SignalRiver";
import { PhoneBar } from "../components/shell/PhoneBar";
import { useText, useUiLanguage } from "../components/LanguageSwitch";
import { englishOnly, englishText } from "../lib/english";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "me", name: "关于" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  const [contact, stats] = await Promise.all([
    apiGet<SiteContact>("/api/site/contact", { signal: request.signal }).catch(() => null),
    apiGet<SiteStats>("/api/site/stats", { signal: request.signal }).catch(() => null),
  ]);
  return cachedPage(300, { contact, stats });
}

export function meta() {
  return pageMeta({ title: "关于", description: ABOUT.description, path: "/about", image: "/og/pages/about.png", jsonLd: organizationLd() });
}

const NO_SOURCES: RiverSource[] = [];

/** 3.6 万 from ten thousand up, digits with separators below; English keeps digits throughout. */
function figure(n: number, en: boolean): { value: string; unit: string } {
  if (en) return { value: n.toLocaleString("en-US"), unit: "" };
  return n >= 10_000 ? { value: (n / 10_000).toFixed(1).replace(/\.0$/, ""), unit: "万" } : { value: n.toLocaleString("en-US"), unit: "" };
}

function Figure({ n, unit, en }: { n: number; unit: string; en: boolean }) {
  const f = figure(n, en);
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="num text-[30px] font-black leading-none tracking-[-0.03em] text-ink xl:text-[36px]">{f.value}</span>
      <span className="text-[13px] text-ink-3">
        {f.unit}
        {unit}
      </span>
    </div>
  );
}

const KIND_ORDER: Array<[string, string, string]> = [
  ["x_search", "X", "X"],
  ["rss", "RSS", "RSS"],
  ["web_list", "网页", "Web pages"],
  ["mp_account", "公众号", "WeChat"],
  ["json_list", "接口", "APIs"],
];

/**
 * The stage columns' rules: one column on phones, two by two from sm, and from lg four in a row whose
 * edges fall on the river's stage boundaries.
 */
const STAGE_CELL = [
  "sm:pr-6 lg:pr-6",
  "border-t sm:border-l sm:border-t-0 sm:pl-6 lg:px-6",
  "border-t sm:pr-6 lg:border-l lg:border-t-0 lg:px-6",
  "border-t sm:border-l sm:pl-6 lg:border-t-0 lg:px-6",
];

interface Stage {
  no: string;
  title: string;
  figure: ReactNode;
  text: string;
  note: ReactNode;
}

function stagesOf(stats: SiteStats | null, en: boolean, t: (zh: string, en: string) => string): Stage[] {
  const kinds = stats
    ? KIND_ORDER.filter(([k]) => stats.sourceKinds[k]).map(([k, zh, e]) => `${en ? e : zh} ${stats.sourceKinds[k]}`).join(" · ")
    : null;
  const collected = stats?.day.collected.toLocaleString("en-US") ?? "";
  return [
    {
      no: "01",
      title: t("采集", "Collect"),
      figure: stats && <Figure n={stats.sources} unit={t("个信源", "sources")} en={en} />,
      text: en ? ABOUT_EN.steps.collect : ABOUT.steps.collect,
      note: kinds,
    },
    {
      no: "02",
      title: t("收录", "Organize"),
      figure: stats && <Figure n={stats.items} unit={t("条动态", "reports")} en={en} />,
      text: en ? ABOUT_EN.steps.store : ABOUT.steps.store,
      note: stats && t(`过去 24 小时收进 ${collected} 条`, `${collected} arrived in the last 24 hours`),
    },
    {
      no: "03",
      title: t("精选", "Select"),
      figure: stats && <Figure n={stats.selected} unit={t(REPORTS.metricUnits.selectedCount, REPORTS_EN.metricUnits.selectedCount)} en={en} />,
      text: en ? ABOUT_EN.steps.select : ABOUT.steps.select,
      note: stats && t(`过去 24 小时 ${stats.day.selected} 条进了精选`, `${stats.day.selected} entered the picks in the last 24 hours`),
    },
    {
      no: "04",
      title: t("成刊", "Publish"),
      figure: stats && <Figure n={stats.dailies} unit={t(REPORTS.metricUnits.reportsCovered, REPORTS_EN.metricUnits.reportsCovered)} en={en} />,
      text: en ? ABOUT_EN.steps.publish : ABOUT.steps.publish,
      note: t("也可以用 RSS、API、MCP 订阅", "Also available by RSS, API and MCP"),
    },
  ];
}

/** The maker's round avatar before the greeting; it steps aside if the image fails. */
function MakerFace({ src, name, en }: { src: string; name: string; en: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img src={src} alt={en ? `${name}'s photo` : `${name}的头像`} width={48} height={48} onError={() => setFailed(true)} className="size-11 shrink-0 rounded-full bg-bg-sunk object-cover ring-1 ring-line xl:size-12" />;
}

function QrCard({ src, kind, title, note, en }: { src: string; kind: string; title: string; note: string; en: boolean }) {
  return (
    <figure className="card flex items-center gap-5 p-5">
      <img src={src} alt={en ? `${kind} QR code` : `${kind}二维码`} width={112} height={112} loading="lazy" className="size-[104px] shrink-0 rounded-tile border border-line bg-white object-contain p-1.5 sm:size-[112px]" />
      <figcaption className="min-w-0">
        <div className="text-[12px] text-ink-4">{kind}</div>
        <div className="mt-1 text-[16px] font-semibold leading-snug text-ink">{title}</div>
        {note && <p className="mt-2 text-[13px] leading-[1.7] text-ink-3">{note}</p>}
      </figcaption>
    </figure>
  );
}

/** One contact code in the reader's language; English drops the card when its title has no English. */
function contactCard(key: string, card: { kind: string; title: string; note: string }, src: string, en: boolean) {
  const kind = en ? englishOnly(card.kind) : card.kind;
  const title = en ? englishOnly(card.title) : card.title;
  const note = en ? englishOnly(card.note) ?? "" : card.note;
  if (!kind || !title) return null;
  return <QrCard key={key} src={src} kind={kind} title={title} note={note} en={en} />;
}

/**
 * The optional maker block (ABOUT.maker): a greeting on the left, the contact codes that are set on the
 * right. Without the contact settings (the api did not answer) the codes stay out, as the figures do.
 */
function Maker({ maker, contact, en }: { maker: NonNullable<typeof ABOUT.maker>; contact: SiteContact | null; en: boolean }) {
  const t = useText();
  const greeting = en ? maker.greeting.map(englishText).filter((l): l is string => !!l) : maker.greeting;
  const codes = [
    contact?.wechatQr && maker.wechat ? contactCard("wechat", maker.wechat, contact.wechatQr, en) : null,
    contact?.feishuQr && maker.feishu ? contactCard("feishu", maker.feishu, contact.feishuQr, en) : null,
  ].filter(Boolean);
  return (
    <section aria-labelledby="maker" className="mt-20 grid gap-10 xl:mt-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
      <div>
        <Kicker>{t("做这个站的人", "Who runs this")}</Kicker>
        <h2 id="maker" className="mt-4 flex items-center gap-3.5 text-[26px] font-black leading-[1.3] tracking-[-0.02em] text-ink xl:gap-4 xl:text-[34px]">
          {contact?.makerAvatar && <MakerFace src={contact.makerAvatar} name={maker.name} en={en} />}
          <span>{t("嗨，我是", "Hi, I'm")} <span className="whitespace-nowrap text-accent">{maker.name}</span></span>
        </h2>
        <div className="mt-5 space-y-4 text-[15.5px] leading-[1.9] text-ink-2 xl:text-[16.5px]">
          {greeting.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p className="text-ink-3">
            {t("它一直在改，改了什么都写在", "It keeps changing — what changed is in the")}
            <Link viewTransition to="/changelog" className="text-accent hover:underline">
              {t("更新日志", "changelog")}
            </Link>
            {t("里；有想法、遇到问题，去", "; ideas and problems go to the")}
            <Link viewTransition to="/feedback" className="text-accent hover:underline">
              {t("反馈页", "feedback page")}
            </Link>
            {t("告诉我。", ".")}
          </p>
        </div>
      </div>
      {codes.length > 0 && (
        <div className="grid content-start gap-3">
          <h3 className="text-[15px] font-semibold text-ink">{t("如果觉得有点用，欢迎加入", "If you find it useful, come join")}</h3>
          {codes}
        </div>
      )}
    </section>
  );
}

/** The latest 精选 under the river's paper; it moves on each time an item reaches the paper. English drops it when the headline has no English. */
function Latest({ item, className = "", en }: { item: SiteStats["latest"][number] | undefined; className?: string; en: boolean }) {
  const t = useText();
  if (!item) return null;
  const title = en ? englishText(item.title) : item.title;
  if (!title) return null;
  return (
    <IntentLink viewTransition to={`/items/${item.id}`} className={`group block ${className}`}>
      <span className="text-[11px] font-semibold tracking-[0.2em] text-accent">{t("最近精选", "Latest pick")}</span>
      <span key={item.id} className="animate-fade-up mt-1.5 block">
        <span className="line-clamp-2 text-[13.5px] font-semibold leading-[1.55] text-ink transition-colors group-hover:text-accent">{title}</span>
        <span className="mt-1 block truncate text-[12px] text-ink-4">{item.source}</span>
      </span>
    </IntentLink>
  );
}

export default function AboutPage() {
  const language = useUiLanguage();
  const en = language === "en";
  const t = useText();
  const { contact, stats } = useLoaderData<typeof loader>();
  const [focus, setFocus] = useState<number | null>(null);
  const [at, setAt] = useState(0);
  const shown = useRef(0);
  const sources = useMemo(() => stats?.sampleSources ?? NO_SOURCES, [stats]);
  const stages = useMemo(() => stagesOf(stats, en, t), [stats, en, t]);
  const latest = stats?.latest ?? [];
  // A pulse reaches the paper every second or so; the headline under it changes at most every 2.8s.
  const onArrive = useCallback(() => {
    const now = Date.now();
    if (now - shown.current < 2800 || latest.length < 2) return;
    shown.current = now;
    setAt((i) => (i + 1) % latest.length);
  }, [latest.length]);

  const about = en ? ABOUT_EN : ABOUT;
  const copyright = en ? ABOUT_EN.copyright : ABOUT.copyright;
  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-14 lg:pt-3">
      <PhoneBar back={{ to: "/more", label: t("我的", "More") }} title={t(`关于 ${SITE.name}`, `About ${SITE.name}`)} />
      <header className="grid items-end gap-8 pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:pt-0">
        <div>
          <Kicker>{about.kicker}</Kicker>
          <h1 data-page-title="" className="mt-5 text-[34px] font-black leading-[1.18] tracking-[-0.03em] text-ink [text-wrap:balance] sm:text-[46px] xl:text-[56px] 2xl:text-[64px]">
            {about.headline[0]}
            <br />
            <span className="text-accent">{about.headline[1]}</span>
          </h1>
          <p className="mt-5 max-w-[36em] text-[15.5px] leading-[1.85] text-ink-3 xl:text-[17px]">
            {about.lead.split("{sources}").map((part, i) => (
              <Fragment key={i}>
                {i > 0 && (stats ? <>{" "}<span className="num font-semibold text-ink">{stats.sources}</span>{" "}</> : about.sourcesFallback)}
                {part}
              </Fragment>
            ))}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 lg:pb-2">
          <IntentLink to="/" className={buttonClass("primary", "lg")}>
            {t("看今天的精选", "See today's picks")} <IconArrowRight size={15} />
          </IntentLink>
          <IntentLink to="/daily" className={buttonClass("secondary", "lg")}>
            {t("读最新日报", "Read the latest daily")}
          </IntentLink>
        </div>
      </header>

      <section aria-labelledby="how" className="mt-10 xl:mt-14">
        <h2 id="how" className="sr-only">
          {t(`${SITE.name} 怎么工作`, `How ${SITE.name} works`)}
        </h2>
        <SignalRiver sources={sources} focus={focus} onArrive={onArrive} className="h-[230px] sm:h-[300px] lg:h-[360px] 2xl:h-[420px]">
          <Latest item={latest[at]} className="absolute left-[75%] top-[calc(42%+42px)] hidden w-[25%] px-6 lg:block" en={en} />
        </SignalRiver>
        <p className="sr-only">{t(
          `示意图：每条线是一个信源；线汇成一束束，代表同一件事的多篇报道；经过精选的闸门，只有少数几束通过，${subjectAfter("汇入每天的", "日报")}。`,
          "A diagram: each line is one source; lines bundle where several reports cover the same event; only a few bundles pass the selection gate and flow into each day's daily brief.",
        )}</p>
        <Latest item={latest[at]} className="mt-2 border-t border-line pt-4 lg:hidden" en={en} />
        <ol className="mt-4 grid grid-cols-1 border-t border-line-strong sm:grid-cols-2 lg:mt-0 lg:grid-cols-4">
          {stages.map((s, i) => (
            <li
              key={s.no}
              tabIndex={0}
              onPointerEnter={() => setFocus(i)}
              onPointerLeave={() => setFocus(null)}
              onFocus={() => setFocus(i)}
              onBlur={() => setFocus(null)}
              className={`border-line py-6 outline-none transition-colors ${STAGE_CELL[i]} ${focus === i ? "bg-accent-softer" : ""}`}
            >
              <div className="flex items-baseline gap-2.5">
                <span className="num text-[12px] font-bold tracking-[0.12em] text-accent">{s.no}</span>
                <h3 className="text-[17px] font-bold text-ink">{s.title}</h3>
              </div>
              {s.figure && <div className="mt-4">{s.figure}</div>}
              <p className="mt-3 text-[14px] leading-[1.8] text-ink-3">{s.text}</p>
              {s.note && <p className="mt-3 text-[12px] text-ink-4">{s.note}</p>}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14 rounded-card border border-line bg-surface px-5 py-6 lg:mt-20 lg:px-7" aria-labelledby="contributors">
        <Kicker>{t("原创研究", "Original research")}</Kicker>
        <h2 id="contributors" className="mt-3 text-[23px] font-bold leading-snug text-ink">{t("研究看证据，不看作者是不是 AI", "Research is judged by its evidence, not by who — or what — wrote it")}</h2>
        <p className="mt-3 max-w-[52em] text-[14px] leading-[1.85] text-ink-3">
          {t(
            "本站独立运行，不依赖任何外部作者持续供稿。未来可以刊登 AI Agent 与独立研究者的原创分析、实测和工具研究。每篇作品应标明作者、使用的数据和原始来源；AI 参与写作不代表结论经过独立核验。本站不会让外部投稿自动发布。",
            "This site runs on its own and does not rely on outside authors for a steady supply. Original analysis, hands-on tests and tool research by AI agents and independent researchers may be published here. Each piece should state its author, the data it used and its original sources; AI help with the writing does not mean the conclusions were independently verified. Outside submissions never publish automatically.",
          )}
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-4">
          {t("公开投稿系统尚未开放，当前可通过", "The public submission system is not open yet; propose a research collaboration on the")}
          <Link viewTransition to="/feedback" className="mx-1 text-accent hover:underline">{t("反馈页", "feedback page")}</Link>
          {t("提出研究合作意向。", ".")}
        </p>
      </section>

      {ABOUT.maker && <Maker maker={ABOUT.maker} contact={contact} en={en} />}

      <p className="mt-16 well rounded-card px-5 py-4 text-[13px] leading-[1.85] text-ink-3">
        {copyright[0]}
        <Link viewTransition to="/feedback" className="text-accent hover:underline">
          {t("反馈页", "feedback page")}
        </Link>
        {copyright[1]}
      </p>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[12.5px] text-ink-4">
        <span>{t(SITE.footerNote, "AI · Crypto · Finance | Original research and public sources")}</span>
        <nav className="flex gap-5" aria-label={t("规则与隐私", "Terms and privacy")}>
          <Link
            viewTransition
            id={ABOUT.termsAnchor ?? undefined}
            to="/terms"
            className="transition-colors hover:text-accent"
          >
            {t(POLICY.terms.name, "Terms")}
          </Link>
          <Link viewTransition to="/privacy" className="transition-colors hover:text-accent">
            {t("隐私说明", "Privacy")}
          </Link>
        </nav>
      </footer>
    </div>
  );
}
