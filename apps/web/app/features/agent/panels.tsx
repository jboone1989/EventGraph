// The engine's ways in, one panel each: what it is for, the steps to connect, then the details folded away.
// Addresses are the site's configured public address (`base`); what visitors copy carries the site's tag
// (CopyTag) when it has one.
import { Fragment, useState } from "react";
import { Link } from "react-router";
import { PUBLIC_INTERFACE_VERSION } from "@aihot/contracts/http-policy";
import { MCP_TOOL_NAMES as T, MCP_TOOLS } from "@aihot/contracts/mcp";
import { feedCategoryLabel, PUBLIC_API_CATEGORY_KEYS } from "@aihot/contracts/taxonomy";
import { ACCESS, AGENT, AGENT_EN, EDITION_TIMES, POLICY, SITE, subjectAfter, withSubject } from "@aihot/site";
import { CodeBlock, CopyButton } from "./CodeBlock";
import { PillTabs } from "../../components/ui/Tabs";
import type { AgentPanelProps } from "../../modules";
import { AGENT_PARTS, GUIDE_CLIENTS, TAG } from "./module-parts";
import { Address, Ask, Block, Bullets, Details, Mono, PanelHead, Step, Steps, Table, Tips } from "./parts";
import { useText, useUiLanguage } from "../../components/LanguageSwitch";
import { englishOnly } from "../../lib/english";

const V = PUBLIC_INTERFACE_VERSION;

/** Every MCP tool: the engine's and the modules'. */
export const mcpToolCount = () => MCP_TOOLS.length + AGENT_PARTS.reduce((n, a) => n + (a.tools?.length ?? 0), 0);
const link = "text-accent hover:underline";

/** An address on this site as the copy buttons copy it, with the tag. */
function addressOf({ base, tag }: AgentPanelProps, path: string): string {
  return TAG && tag ? `${base}${path}?${TAG.query}=${tag}` : `${base}${path}`;
}

const WHEN_EN = {
  daily: `every day at ${EDITION_TIMES.daily}`,
  weekly: `every Monday at ${EDITION_TIMES.weekly}`,
  monthly: `on the 1st at ${EDITION_TIMES.monthly}`,
};
/** The editions' schedule in a sentence's shape, per language. */
const whenOf = (kind: "daily" | "weekly" | "monthly", en: boolean) =>
  en ? WHEN_EN[kind] : { daily: `每天 ${EDITION_TIMES.daily}`, weekly: `每周一 ${EDITION_TIMES.weekly}`, monthly: `每月 1 日 ${EDITION_TIMES.monthly}` }[kind];

const MCP_CLIENTS = [
  { key: "claude", label: "Claude Code" },
  { key: "codex", label: "Codex" },
  { key: "json", label: "JSON 配置" },
  { key: "other", label: "其他客户端" },
] as const;
const CLIENT_EN: Record<string, string> = { json: "JSON config", other: "Other clients" };

export function McpPanel(props: AgentPanelProps) {
  const en = useUiLanguage() === "en";
  const t = useText();
  const url = addressOf(props, "/api/mcp");
  const name = SITE.mcpPrefix;
  const [client, setClient] = useState<string>("claude");
  const ask = en
    ? `Call ${T.latest} and tell me the most important reports of the last 24 hours, with ${SITE.name} links.`
    : `请调用 ${T.latest}，告诉我过去 24 小时最重要的${subjectAfter(" 5 条", "资讯")}，并附 ${SITE.name} 链接。`;
  const does = {
    [T.latest]: en ? "Selected and all reports from the last 24 hours or 7 days" : "过去 24 小时或最近 7 天的精选、全部资讯",
    [T.search]: en ? AGENT_EN.search.scope : AGENT.search.scope,
    [T.hot]: en ? "The current hot list, top 10" : "当前热点榜 Top 10",
    [T.story]: en ? "An event's timeline and continuously updated summary" : "一个热点事件的时间线和持续更新的综述",
    [T.daily]: en ? "The latest daily brief, or one from a chosen date" : subjectAfter("最新或指定日期的", "日报"),
    [T.weekly]: en ? "The latest weekly, or one for a chosen week" : subjectAfter("最新或指定一周的", "周报"),
    [T.monthly]: en ? "The latest monthly, or one for a chosen month" : subjectAfter("最新或指定月份的", "月报"),
    [T.storyGraph]: en ? "An event's relations and source reports in the knowledge graph" : "一个事件在知识图谱里的关系和来源报道",
    [T.entity]: en ? "All of a graph entity's relations, when they took effect or ended, and related events" : "一个图谱实体的全部关系、生效失效时间和相关事件",
    [T.evidenceBundle]: en ? "A machine-readable evidence pack for an event, entity or relation: objects, original links, times and read boundaries" : "一个事件/实体/关系的机器可读证据包：对象、原文链接、时间与读取边界",
    [T.storyRoute]: en ? "An event's stop-by-stop route: each stop with evidence links, happened/collected times and uncertainty notes" : "一个事件的逐站路线：每站带证据链接、发生/收录两种时间和不确定性标注",
  } as Record<string, string>;
  const asks: Record<string, string> = {
    [T.latest]: en ? "What's new today?" : `${subjectAfter("今天有什么", "新闻")}？`,
    [T.search]: en ? AGENT_EN.search.ask : AGENT.search.ask,
    [T.hot]: en ? "What's hot right now?" : "现在最热的是什么？",
    [T.story]: en ? "What's the background of this?" : "这件事的来龙去脉？",
    [T.daily]: en ? "Show me today's daily brief." : "给我今天的日报。",
    [T.weekly]: en ? "What are this week's big stories?" : `${subjectAfter("这周", "圈")}有哪些大事？`,
    [T.monthly]: en ? "What happened last month?" : `${subjectAfter("上个月", "圈")}发生了什么？`,
    [T.storyGraph]: en ? "Which companies and people does this involve?" : "这件事牵涉到哪些公司和人？",
    [T.entity]: en ? "Who is this company connected to lately?" : "这家公司最近和谁有关系？",
    [T.evidenceBundle]: en ? "Put this event's raw evidence into structured data." : "把这件事的原始证据整理成结构化数据。",
    [T.storyRoute]: en ? "Walk me through this event in order, with sources." : "按时间顺序讲讲这件事的经过，附原文出处。",
  };
  return (
    <>
      <PanelHead label={`MCP · ${V}`} title={t(`填一个地址，Agent 多出 ${mcpToolCount()} 个工具`, `Add one address, and an agent gains ${mcpToolCount()} tools`)}>
        {t(
          "标准 Streamable HTTP，匿名只读，不用 token，也不读你的登录状态。适合 Claude 桌面版、Cursor、Cherry Studio 这类支持远程 MCP 的客户端。",
          "Standard Streamable HTTP, anonymous and read-only: no token, and it does not read your login state. For clients with remote MCP support such as Claude Desktop, Cursor and Cherry Studio.",
        )}
      </PanelHead>
      <Steps>
        <Step n={1} title={t("复制服务地址", "Copy the server address")}>
          <Address url={url} />
          {TAG && <p className="mt-2 text-[13px] text-ink-3">{TAG.mcp}</p>}
        </Step>
        <Step n={2} title={t("加到你的客户端", "Add it to your client")}>
          <PillTabs className="mt-3" size="xs" layoutId="agent-mcp-client" label={t("客户端", "Client")} active={client} onSelect={setClient} items={MCP_CLIENTS.map((c) => ({ key: c.key, label: t(c.label, CLIENT_EN[c.key] ?? c.label) }))} />
          {client === "claude" && <CodeBlock className="mb-0 mt-3" lang="bash" code={`claude mcp add --transport http ${name} '${url}'`} />}
          {client === "codex" && <CodeBlock className="mb-0 mt-3" lang="bash" code={`codex mcp add ${name} --url '${url}'`} />}
          {client === "json" && <CodeBlock className="mb-0 mt-3" title={t("Cursor、Cherry Studio 等用 JSON 配置的客户端", "Clients configured by JSON, such as Cursor and Cherry Studio")} lang="json" code={JSON.stringify({ mcpServers: { [name]: { type: "http", url } } }, null, 2)} />}
          {client === "other" && <p className="mt-3">{t(
            `在客户端的 MCP 或连接器设置里新建一项：名称填 ${name}，地址填上面的网址，认证选“无”，不要填 API Key。只支持本地命令的客户端，先用它自带的远程 MCP 代理。`,
            `In the client's MCP or connector settings, make a new entry: the name is ${name}, the address is the URL above, authentication is "none", and no API key. Clients that only run local commands: go through their built-in remote MCP proxy first.`,
          )}</p>}
        </Step>
        <Step n={3} title={t("让 Agent 调一次", "Have the agent call once")}>
          <Ask text={ask} />
          <p className="mt-2 text-[13px] text-ink-3">{t(
            `客户端显示调用了 ${T.latest}，回答里有时间范围、中文摘要和 ${new URL(props.base).host} 链接，就是连上了。`,
            `When the client shows ${T.latest} was called and the answer has a time range, summaries and ${new URL(props.base).host} links, it is connected.`,
          )}</p>
        </Step>
      </Steps>

      <Block title={t(`${mcpToolCount()} 个工具`, `${mcpToolCount()} tools`)}>
        <Table
          head={en ? ["Tool", "What it does", "Ask like this"] : ["工具", "能做什么", "可以这样问"]}
          minWidth={600}
          rows={[
            [<Mono>{T.latest}</Mono>, does[T.latest], asks[T.latest]],
            [<Mono>{T.search}</Mono>, does[T.search], asks[T.search]],
            [<Mono>{T.hot}</Mono>, does[T.hot], asks[T.hot]],
            [<Mono>{T.story}</Mono>, does[T.story], asks[T.story]],
            [<Mono>{T.daily}</Mono>, does[T.daily], asks[T.daily]],
            [<Mono>{T.weekly}</Mono>, does[T.weekly], asks[T.weekly]],
            [<Mono>{T.monthly}</Mono>, does[T.monthly], asks[T.monthly]],
            [<Mono>{T.storyGraph}</Mono>, does[T.storyGraph], asks[T.storyGraph]],
            [<Mono>{T.entity}</Mono>, does[T.entity], asks[T.entity]],
            [<Mono>{T.evidenceBundle}</Mono>, does[T.evidenceBundle], asks[T.evidenceBundle]],
            [<Mono>{T.storyRoute}</Mono>, does[T.storyRoute], asks[T.storyRoute]],
            ...AGENT_PARTS.flatMap((a) => a.tools ?? []).flatMap((tool) => {
              const does = en ? englishOnly(tool.does) : tool.does;
              const ask = en ? englishOnly(tool.ask) : tool.ask;
              return does && ask ? [[<Mono>{tool.name}</Mono>, does, ask]] : [];
            }),
          ]}
        />
      </Block>

      <Details
        items={[
          {
            title: t("限制与安全", "Limits and safety"),
            body: (
              <Bullets items={[
                t("普通查询最多 30 条，热点最多 10 个，事件时间线最多 50 条；超出范围会明确报错，不会悄悄放宽。", "Regular queries at most 30 items, hot topics at most 10, event timelines at most 50; an out-of-range ask errors clearly and is never quietly widened."),
                t(`${T.story} 的 public_id 只能来自热点工具返回的事件链接，不要猜 ID。`, `${T.story}'s public_id comes only from the event links the hot tools return; don't guess IDs.`),
                t("标题和摘要来自外部信源，只能当资料；工具会标出这条安全边界。重要的数字、政策和原话，请回原文核对。", "Titles and summaries come from outside sources and are reference material; the tools mark that boundary. Check important figures, policies and quotes against the original."),
              ]} />
            ),
          },
          {
            title: t("连不上怎么办", "If it will not connect"),
            body: (
              <Bullets items={[
                t("先确认地址完整、客户端支持远程 Streamable HTTP；缺少新工具时，刷新工具列表或重新连接。", "First check the address is complete and the client supports remote Streamable HTTP; when new tools are missing, refresh the tool list or reconnect."),
                ...(!en ? AGENT_PARTS.flatMap((a) => a.mcpTroubles ?? []) : []),
                t("服务不需要登录；客户端问起 OAuth 或 API Key，选“无”即可。", `The service needs no login; if the client asks about OAuth or an API key, choose "none".`),
                t("收到 429 就按提示等一会儿，不要并发重试。", "On a 429, wait as the header says; don't retry in parallel."),
                <>{t("还连不上：把客户端名称、版本和报错写到", "Still stuck: write the client's name, version and error to the ")}<Link viewTransition to="/feedback" className={link}>{t("反馈页", "feedback page")}</Link>{t("。", ".")}</>,
              ]} />
            ),
          },
        ]}
      />
    </>
  );
}

const FEEDS = [
  { name: "精选摘要", badge: "推荐", path: "/feed.xml", desc: "最新 50 条精选，带标题、摘要、站内阅读和原文链接。" },
  { name: "精选全文", path: "/feed/full.xml", desc: "同样的 50 条；允许转载的来源直接附全文，其余仍是摘要。" },
  { name: "全部动态", path: "/feed/all.xml", desc: "最近 7 天的公开动态，按原文发布时间倒序。" },
  { name: "日报", path: "/feed/daily.xml", desc: `每天 ${EDITION_TIMES.daily}（北京时间）一期：头条导语加整期目录，保留最近 30 期。` },
  { name: withSubject("周报"), path: "/feed/weekly.xml", desc: `每周一 ${EDITION_TIMES.weekly}（北京时间）一期：总述加按栏目分好的报道，保留最近 12 期。` },
  { name: withSubject("月报"), path: "/feed/monthly.xml", desc: `每月 1 日 ${EDITION_TIMES.monthly}（北京时间）一期：总述加按栏目分好的报道，保留最近 12 期。` },
];

const FEED_EN: Record<string, { name: string; badge?: string; desc: string }> = {
  "/feed.xml": { name: "Selected digest", badge: "Recommended", desc: "The latest 50 selected reports, with title, summary, on-site reading and the original link." },
  "/feed/full.xml": { name: "Selected full text", desc: "The same 50; sources that allow republication include the full text, the rest stay summaries." },
  "/feed/all.xml": { name: "Everything", desc: "The last 7 days of public reports, newest first by publish time." },
  "/feed/daily.xml": { name: "Daily brief", desc: `One issue ${WHEN_EN.daily} (Beijing time): the headline's intro plus the whole issue's contents; the last 30 issues are kept.` },
  "/feed/weekly.xml": { name: "Weekly report", desc: `One issue ${WHEN_EN.weekly} (Beijing time): the overview plus the week's reports grouped by section; the last 12 issues are kept.` },
  "/feed/monthly.xml": { name: "Monthly report", desc: `One issue ${WHEN_EN.monthly} (Beijing time): the overview plus the month's reports grouped by section; the last 12 issues are kept.` },
};

/** The category feeds, under the names the feeds themselves use. */
const FEED_CATEGORIES = PUBLIC_API_CATEGORY_KEYS.map((key) => [key, feedCategoryLabel(key)] as const);

export function RssPanel(props: AgentPanelProps) {
  const en = useUiLanguage() === "en";
  const t = useText();
  const { base } = props;
  const lead = en
    ? ["Works with mainstream RSS 2.0 readers and automation tools such as n8n and Zapier. Addresses are stable.", ...AGENT_PARTS.flatMap((a) => a.rssLead ?? []).flatMap((s) => (englishOnly(s) ? [englishOnly(s)!] : []))].join("; ")
    : `${["兼容主流 RSS 2.0 阅读器，也能接 n8n、Zapier 这类自动化工具。地址长期不变", ...AGENT_PARTS.flatMap((a) => a.rssLead ?? [])].join("；")}。`;
  return (
    <>
      <PanelHead label="RSS" title={t("复制地址，用阅读器订阅", "Copy the address, subscribe in your reader")}>
        {lead}
      </PanelHead>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FEEDS.map((f) => {
          const e = en ? FEED_EN[f.path] : null;
          const name = e?.name ?? f.name;
          const desc = e?.desc ?? f.desc;
          if (!name || !desc) return null;
          return (
            <div key={f.path} className="card flex flex-col p-4">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-ink">{name}</span>
                {(e?.badge ?? f.badge) && <span className="inline-flex h-[18px] items-center rounded-full bg-accent-soft px-2 text-[11px] font-medium text-accent">{e?.badge ?? f.badge}</span>}
              </div>
              <p className="mt-1 flex-1 text-[13px] leading-[1.7] text-ink-3">{desc}</p>
              <div className="mt-3 flex items-center gap-2 border-t border-line-soft pt-3">
                <code className="mono min-w-0 flex-1 truncate text-[12px] text-ink-4">{base}{f.path}</code>
                <CopyButton text={addressOf(props, f.path)} label={t("复制地址", "Copy address")} className="shrink-0" />
              </div>
            </div>
          );
        })}
      </div>
      {TAG && <p className="mt-3 text-[12.5px] text-ink-4">{TAG.rss}</p>}

      <Block title={t("按分类订阅", "Subscribe by category")}>
        <Table
          head={en ? ["Category", "Summary", "Full text"] : ["分类", "摘要", "全文"]}
          minWidth={420}
          rows={FEED_CATEGORIES.map(([slug, label]) => [
            <span className="font-medium text-ink">{en ? slug : label}</span>,
            <span className="inline-flex items-center gap-2"><Mono>{`/feed/category/${slug}.xml`}</Mono><CopyButton text={addressOf(props, `/feed/category/${slug}.xml`)} className="!h-6 !px-1.5" /></span>,
            <span className="inline-flex items-center gap-2"><Mono>{`/feed/full/category/${slug}.xml`}</Mono><CopyButton text={addressOf(props, `/feed/full/category/${slug}.xml`)} className="!h-6 !px-1.5" /></span>,
          ])}
        />
      </Block>

      <Block title={t("刷新多快合适", "How often to refresh")}>
        <p>{t(
          "阅读器会带着上次的 ETag 来问，内容没变时只回一个很小的 304，不重复下载。30 分钟刷新一次就够，更快也拿不到新的内容。",
          "The reader comes back with the last ETag, and when nothing changed it gets a small 304 instead of the body again. Refreshing every 30 minutes is enough — faster brings nothing new.",
        )}</p>
        <p className="mt-3 text-[13px] text-ink-3">{t(
          `条目链接指向站内阅读页，原文链接在摘要里。能匿名订阅不等于所有用途都获许可${POLICY.terms.notes ? `：${POLICY.terms.notes.rss}` : ""}，见`,
          "Entry links point to the site's reading pages and the original link sits in the summary. Anonymous subscription is not permission for every use — see the ",
        )}<Link viewTransition to="/terms" className={link}>{t(POLICY.terms.name, "Terms of use")}</Link>{t("。", ".")}</p>
      </Block>
    </>
  );
}

const RECIPES = [
  { key: "latest", label: "盯最新资讯" },
  { key: "sync", label: "同步全部精选" },
];
const RECIPE_EN: Record<string, string> = { latest: "Watch the latest", sync: "Sync all selected" };

export function ApiPanel(props: AgentPanelProps) {
  const en = useUiLanguage() === "en";
  const t = useText();
  const { base, tag } = props;
  const userAgent = [ACCESS.userAgent, TAG && tag ? TAG.userAgent(tag) : null].filter(Boolean).join(" ");
  const curl = `curl --compressed${userAgent ? ` -A '${userAgent}'` : ""}`;
  const verify = t("缓存过期后使用前验证 ETag", "Verify the ETag before use once the cache expires");
  const pace = t(
    `内容多久变一次：新资讯全天陆续进来，精选每天变几次到几十次，日报每天 ${EDITION_TIMES.daily}、周报每周一 ${EDITION_TIMES.weekly}、月报每月 1 日 ${EDITION_TIMES.monthly}（北京时间）各一期。${ACCESS.ratePerMinute ? `同一个 IP 每分钟超过约 ${ACCESS.ratePerMinute} 次会收到 429，请按 Retry-After 等待，不要并发重试。` : ""}`,
    `How often content changes: new reports arrive through the day, the picks change a few to a few dozen times a day, and the daily, weekly and monthly briefs publish ${WHEN_EN.daily}, ${WHEN_EN.weekly} and ${WHEN_EN.monthly} (Beijing time).${ACCESS.ratePerMinute ? ` Over about ${ACCESS.ratePerMinute} requests per minute from one IP returns a 429; wait as Retry-After says and don't retry in parallel.` : ""}`,
  );
  const [recipe, setRecipe] = useState<string>("latest");
  const recipes = AGENT_PARTS.flatMap((a) => a.recipes ?? []);
  const items = `${base}/api/v1/items?mode=selected&window=24h&limit=20`;
  return (
    <>
      <PanelHead label={`REST API · ${V}`} title={t("匿名 GET，拿来就能用", "Anonymous GET, ready to use")}>
        {t(
          "不用 token；浏览器跨域、curl 和各语言默认的 HTTP 客户端都能直接调。路径是 /api/v1，字段和错误码以 ",
          "No token; browsers with CORS, curl and every language's default HTTP client can call it directly. Paths are /api/v1; fields and error codes follow ",
        )}<a href="/openapi-v1.json" className={link}>OpenAPI</a>{t(" 为准。", ".")}
      </PanelHead>
      <CodeBlock className="mt-6" title={t("第一个请求", "The first request")} lang="bash" code={`${curl} '${items}'`} />

      <Block title={t("按分类筛选", "Filter by category")}>
        <p>{t("在资讯请求中加上 ", "Add ")}<Mono>category</Mono>{t("，只取对应分类；不传则包含全部分类。返回条目的 ", " to a reports request to take only that category; leave it off for all of them. Returned entries' ")}<Mono>category</Mono>{t(" 也使用下表中的值。", " uses the table's values too.")}</p>
        <Table head={en ? ["Category", "Parameter"] : ["分类", "请求参数"]} rows={FEED_CATEGORIES.map(([key, name]) => [en ? key : name, <Mono>{`category=${key}`}</Mono>])} />
      </Block>

      <Block title={t("用得省，也更快", "Cheaper, and faster too")}>
        <Tips
          items={[
            { title: t("开压缩", "Compress"), text: <>{t("curl 加 ", "Add ")}<Mono>--compressed</Mono>{t("，其他客户端打开 gzip 或 br。JSON 压缩后只有原来的 1/4 到 1/8。", " to curl, or turn on gzip or br in other clients. Compressed JSON is 1/4 to 1/8 the size.")}</> },
            { title: t("带上 ETag", "Send the ETag"), text: <>{t("保存响应里的 ETag，下次带 ", "Save the response's ETag and send ")}<Mono>If-None-Match</Mono>{t("；内容没变时返回 304，不传正文。", " next time; nothing changed comes back as 304 with no body.")}</> },
            { title: t("按节奏取", "Pull on rhythm"), text: t(
              `资讯和热点最快一分钟一次；日报每天 ${EDITION_TIMES.daily} 后取一次，周报、月报出刊后取一次；往回翻页翻到已有的那条就停。`,
              `Reports and hot topics at most once a minute; pull the daily once after ${WHEN_EN.daily}, and the weekly and monthly once after they publish; stop paging back at the first entry you already have.`,
            ) },
          ]}
        />
        <p className="mt-3 text-[13px] leading-[1.75] text-ink-3">{pace}</p>
      </Block>

      <Block title={t("接口一览", "Endpoint map")}>
        <Table
          head={en ? ["Path", "What it's for", "How often to pull"] : ["路径", "用来做什么", "多久取一次"]}
          minWidth={640}
          rows={[
            { group: t("资讯", "Reports") },
            [<Mono>/api/v1/items</Mono>, t("精选或最近 7 天全部动态，可按分类、时间窗、关键词筛", "Selected or the last 7 days of everything, filterable by category, time window and keyword"), t("最快 1 分钟一次", "At most 1 minute apart")],
            { group: t("热点与事件", "Hot topics and events") },
            [<Mono>/api/v1/hot-topics</Mono>, t("当前热点榜 Top 10", "The current hot list, top 10"), t("最快 1 分钟一次", "At most 1 minute apart")],
            [<Mono>{"/api/v1/stories/{publicId}"}</Mono>, t("一个事件的报道时间线、AI 综述和关联事件", "An event's report timeline, AI summary and related events"), t("需要时", "When needed")],
            { group: t("日报", "Daily") },
            [<Mono>/api/v1/dailies/latest</Mono>, t("最新一期日报", "The latest daily issue"), t(`每天 ${EDITION_TIMES.daily} 后一次`, `Once after ${WHEN_EN.daily}`)],
            [<Mono>{"/api/v1/dailies/{date}"}</Mono>, t("指定日期日报；撤稿会移除引用", "A daily by date; retractions remove the citations"), verify],
            [<Mono>/api/v1/dailies</Mono>, t("日报日期索引", "Index of daily dates"), t("每天一次", "Once a day")],
            { group: t("周报与月报", "Weekly and monthly") },
            [<Mono>/api/v1/weeklies/latest</Mono>, t("最新一期周报：头条、总述和一周重点，按栏目分好", "The latest weekly: headline, overview and the week's focus, grouped by section"), t(`每周一 ${EDITION_TIMES.weekly} 后一次`, `Once after ${WHEN_EN.weekly}`)],
            [<Mono>{"/api/v1/weeklies/{week}"}</Mono>, t("指定一周，ISO 周如 2026-W39；撤稿会移除引用", "A chosen ISO week such as 2026-W39; retractions remove the citations"), verify],
            [<Mono>/api/v1/weeklies</Mono>, t("周报索引", "Index of weeklies"), t("每周一次", "Once a week")],
            [<Mono>/api/v1/monthlies/latest</Mono>, t("最新一期月报", "The latest monthly issue"), t(`每月 1 日 ${EDITION_TIMES.monthly} 后一次`, `Once after ${WHEN_EN.monthly}`)],
            [<Mono>{"/api/v1/monthlies/{month}"}</Mono>, t("指定月份，如 2026-09", "A chosen month such as 2026-09"), verify],
            [<Mono>/api/v1/monthlies</Mono>, t("月报索引", "Index of monthlies"), t("每月一次", "Once a month")],
            ...AGENT_PARTS.flatMap((a) => (a.api ? [{ group: en ? englishOnly(a.api.group) ?? "" : a.api.group }, ...a.api.rows.map(([path, does, often]) => [<Mono>{path}</Mono>, en ? englishOnly(does) ?? "" : does, en ? englishOnly(often) ?? "" : often])] : [])),
            { group: t("给 AI 助手", "For AI assistants") },
            [<Mono>/api/v1/agent</Mono>, t(
              `给 Agent 的使用说明，列出的地址返回整理好的中文 Markdown${GUIDE_CLIENTS ? `；${GUIDE_CLIENTS} 用的就是它们` : ""}`,
              `The agent guide; the addresses it list return ready-made Markdown${GUIDE_CLIENTS ? `; ${GUIDE_CLIENTS.split("、").join(", ")} use them` : ""}`,
            ), t("需要时", "When needed")],
            { group: t("完整精选同步", "Full selected sync") },
            [<Mono>/api/v1/selected/snapshot</Mono>, t("当前全部精选，分页一次拿全", "All selected reports, paged through in one pass"), t("只在第一次", "Only the first time")],
            [<Mono>/api/v1/selected/changes</Mono>, t("之后的新增、修改和撤选", "Then the additions, edits and removals"), t("几分钟一次", "Every few minutes")],
          ]}
        />
      </Block>

      <Block title={t("常见用法", "Common recipes")}>
        <PillTabs size="xs" layoutId="agent-api-recipe" label={t("用法", "Recipe")} active={recipe} onSelect={setRecipe} items={[...RECIPES, ...recipes].map((r) => ({ key: r.key, label: en ? RECIPE_EN[r.key] ?? englishOnly(r.label) ?? r.label : r.label }))} />
        {recipe === "latest" && (
          <>
            <CodeBlock className="mb-3 mt-3" lang="bash" code={t(
              `# 第一次：保存响应头里的 ETag\n${curl} -i '${items}'\n# 之后最快每分钟一次，带上 ETag；返回 304 就是没变化\n${curl} -i -H 'If-None-Match: <上次的 ETag>' '${items}'`,
              `# First time: save the ETag from the response headers\n${curl} -i '${items}'\n# From then on at most once a minute, sending the ETag; a 304 means nothing changed\n${curl} -i -H 'If-None-Match: <the last ETag>' '${items}'`,
            )} />
            <p>{t(
              "需要往回翻页时，把 ",
              "To page back, pass ",
            )}<Mono>page.nextCursor</Mono>{t(
              " 作为 cursor 传回去，翻到已经有的那条就停，不要每次把 7 天重翻一遍。",
              " back as cursor and stop at the first entry you already have — don't re-pull the whole 7 days each time.",
            )}</p>
          </>
        )}
        {recipe === "sync" && (
          <>
            <CodeBlock className="mb-3 mt-3" lang="bash" code={t(
              `# 第一次：分页拿全。保存第一页响应里的 cursor（每页都一样）\n${curl} '${base}/api/v1/selected/snapshot?fields=minimal&limit=500'\n# hasMore 为 true 就带上 nextPage 继续翻，直到翻完\n${curl} '${base}/api/v1/selected/snapshot?fields=minimal&limit=500&page=<上一页的 nextPage>'\n# 之后：原样传回 cursor，只拿新增、修改和撤选\n${curl} '${base}/api/v1/selected/changes?cursor=<第一页的 cursor>&limit=100'`,
              `# First time: page through everything. Save the cursor in the first page's response (every page carries it)\n${curl} '${base}/api/v1/selected/snapshot?fields=minimal&limit=500'\n# While hasMore is true, send nextPage and keep going until it is done\n${curl} '${base}/api/v1/selected/snapshot?fields=minimal&limit=500&page=<the last page's nextPage>'\n# Then: send the cursor back unchanged, taking only additions, edits and removals\n${curl} '${base}/api/v1/selected/changes?cursor=<the first page's cursor>&limit=100'`,
            )} />
            <p>{t(
              "每页成功写进本地后再保存新的 cursor。cursor 是流水账水位，放多久都不会过期；返回 409 ",
              "Save the new cursor only after each page is written locally. A cursor is a ledger watermark and never expires; a 409 ",
            )}<Mono>snapshot_required</Mono>{t(
              " 时重新取一次快照，不会悄悄漏数据。",
              " means take the snapshot again — nothing is silently skipped.",
            )}</p>
          </>
        )}
        {recipes.map((r) => recipe === r.key && <r.Body key={r.key} base={base} curl={curl} />)}
      </Block>

      <Block title={t("出错了怎么办", "When something errors")} id="agent-api-recovery">
        <dl className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 gap-y-2.5">
          <dt className="mono text-[13px] text-ink">400</dt>
          <dd>{t("参数不对：按 OpenAPI 和返回的 code 修正，不要自动换成更宽的查询。cursor 无效或滑出时间窗返回 invalid_cursor，从第一页重来。", "Wrong parameters: fix them per OpenAPI and the returned code, and don't quietly widen the query. An invalid or out-of-window cursor returns invalid_cursor — start again from the first page.")}</dd>
          <dt className="mono text-[13px] text-ink">409</dt>
          <dd>{t("snapshot_required：增量没法安全续上，重新取一次完整快照。", "snapshot_required: the increments cannot continue safely; take a full snapshot again.")}</dd>
          <dt className="mono text-[13px] text-ink">429</dt>
          <dd>{t("请求太密：按 Retry-After 等待，不要并发重试。", "Too frequent: wait as Retry-After says; don't retry in parallel.")}</dd>
          <dt className="mono text-[13px] text-ink">5xx</dt>
          <dd>{t("指数退避，先用上次成功的结果；公开服务不承诺 SLA。", "Back off exponentially and reuse the last good result; a public service promises no SLA.")}</dd>
          {!en && AGENT_PARTS.flatMap((a) => a.apiErrors ?? []).map(([status, what]) => (
            <Fragment key={status}>
              <dt className="mono text-[13px] text-ink">{status}</dt>
              <dd>{what}</dd>
            </Fragment>
          ))}
        </dl>
        <p className="mt-4 text-[13px] text-ink-3">{t(
          `能匿名调用不等于所有用途都获许可${POLICY.terms.notes ? `：${POLICY.terms.notes.api}` : ""}，见`,
          "Anonymous calls are not permission for every use — see the ",
        )}<Link viewTransition to="/terms" className={link}>{t(POLICY.terms.name, "Terms of use")}</Link>{t("。", ".")}</p>
      </Block>

    </>
  );
}
