import {useEffect,useRef} from "react";
import {useLocation} from "react-router";
import {SITE} from "@aihot/site";
import {useUiLanguage} from "./LanguageSwitch";
import {isEnglishPath} from "../lib/edition";

/** Client-only browser labels. Canonical SSR metadata remains the original publication language. */
function section(path:string){
  if(path==="/")return ["Event Intelligence","Follow current events and their sourced relationships."];
  if(path.startsWith("/all"))return ["All News","Explore original-source reports in AI, crypto and finance."];
  if(path.startsWith("/hot"))return ["Trending Events","Follow events, sources and emerging activity."];
  if(path.startsWith("/knowledge/entity/"))return ["Entity Profile","Review entity relationships and the supporting sources."];
  if(path.startsWith("/explore"))return ["Event explorer","Replay a public event's reports, relations and evidence at any point in time, from the same records the site publishes."];
  if(path==="/calendar")return ["Policy & data calendar","The schedule of official releases — Fed, BLS, ECB, EIA — with an iCal subscription for your own calendar."];
  if(path==="/research")return ["Original research","Signed analysis from EventGraph: method, data and sources stated on every piece, kept apart from aggregated news."];
  if(path.startsWith("/knowledge"))return ["Knowledge Graph","Explore the relationships recorded from published reporting."];
  if(path.startsWith("/story/"))return ["Event Detail","Review the event timeline and its original sources."];
  if(path.startsWith("/items/"))return ["Original Report","Read the source reporting and its provenance."];
  if(path==="/topics")return ["Topics","Browse research topics and related coverage."];
  if(path.startsWith("/topics/"))return ["Topic Coverage","Explore recent news for this research topic."];
  if(path==="/daily/archive")return ["Daily Archive","Browse earlier source digests."];
  if(path.startsWith("/daily"))return ["Daily Brief","Daily source coverage and reporting."];
  if(path.startsWith("/weekly"))return ["Weekly Brief","Weekly source coverage and reporting."];
  if(path.startsWith("/monthly"))return ["Monthly Brief","Monthly source coverage and reporting."];
  const map:Record<string,[string,string]>={
    "/about":["About",`About ${SITE.name} and its evidence-linked approach.`],
    "/changelog":["Product Updates","Track product releases and changes."],
    "/feedback":["Feedback","Send feedback and content corrections."],
    "/starred":["Saved Reports","Your locally saved reports."],
    "/more":["Settings","Settings, language and tools."],
    "/agent":["Agent Access","Connect MCP, REST and RSS agents."],
    "/privacy":["Privacy Information",`How ${SITE.name} handles data.`],
    "/terms":["Terms of Use","Current service use policies."],
    "/search-busy":["Search Busy","Search is temporarily busy."],
  };
  // Unknown pages — modules and admin — keep their server title rather than a bare site name.
  return map[path]??null;
}
const originalMeta=new Map<string,{title:string;description:string|null}>();
export function ClientLanguageMeta(){
  const lang=useUiLanguage();
  const {pathname,search}=useLocation();
  const entered=useRef<string|null>(null);
  // Only /explore's story/case queries change which rule applies; a raw search dep would also re-run
  // on /all paging or search and restore the first visit's cached title over the current query's own.
  const params=new URLSearchParams(search);
  const isExploreDetail=pathname==="/explore"&&!!(params.get("story")?.trim()||params.get("case")?.trim());
  useEffect(()=>{
    // The English edition is rendered with its English title and description already.
    if(isEnglishPath(pathname))return;
    // Story and case routes own their specific SSR titles; the index label must not replace them.
    if(isExploreDetail)return;
    const meta=document.querySelector<HTMLMetaElement>('meta[name="description"]');
    // Capture server values only once per view, before replacing them in EN. Query variants
    // (/all?page=2, /all?q=…) each own a server title, so a language switch back restores this
    // view's title, not the first visit's.
    const key=pathname+search;
    if(!originalMeta.has(key))originalMeta.set(key,{title:document.title,description:meta?.content??null});
    const original=originalMeta.get(key)!;
    if(lang==="en"){
      const labels=section(pathname);
      if(labels){
        document.title=labels[0]+" · "+SITE.name;
        if(meta)meta.content=labels[1];
      }
    }else if(entered.current===key){
      document.title=original.title;
      if(meta&&original.description!==null)meta.content=original.description;
    }
    entered.current=key;
  },[lang,pathname,isExploreDetail]);
  return null;
}
