import {useState,useEffect,useRef} from "react";
import {Link,useSearchParams} from "react-router";
import {PhoneBar} from "./shell/PhoneBar";
import {IconArrowRight,IconExternal} from "./icons";
import {removeStar} from "../lib/local-state";
import {trackAnalytics} from "../lib/analytics.client";
import {SITE} from "@aihot/site";

function Header({title,subtitle}:{title:string;subtitle:string}) {
 return <header className="lr-knowledge-header mb-6"><div className="lr-eyebrow text-accent">{SITE.name.toUpperCase()}</div><h1 data-page-title className="lr-page-title mt-3">{title}</h1><p className="mt-3 max-w-[780px] text-[14px] leading-[1.85] text-ink-3">{subtitle}</p></header>;
}
export function EnglishLegal({kind}:{kind:"privacy"|"terms"}) {
 const privacy=kind==="privacy";
 const sections=privacy?[
 ["1. Data stored in your browser","Bookmarks, read status, followed topics and entities, theme and font preferences, recent search terms, language preference and drafts are stored in this browser and are not sent to the server. The one exception is the Following view on the home page: when you open it, your browser includes the topics and entities you follow in the request so the server can return matching reports; the server does not write that list to its database. Some navigation state is held only for your browser tab. Clearing browser data removes it. Bookmarks, read status, follows and theme can be exported and imported."],
 ["2. Feedback submissions","Feedback text, optional email address, the relevant page and any submitted screenshot are processed to respond to feedback. Abuse-prevention controls may use a derived identifier. If integrations are configured, submitted content may be forwarded to internal processing services."],
 ["3. Site analytics","The site records a limited set of anonymous interaction events, such as page views, story and article opens, graph node selections, source link clicks and search actions (search terms are not recorded), together with a random session ID kept only for your browser tab. IP addresses, email addresses, full URLs and search terms are not written to the site's analytics tables. Events are kept for about 90 days. Reporting is skipped when your browser sends Do Not Track or Global Privacy Control. Cloudflare Web Analytics and PostHog receive data only when the operator configures them."],
 ["4. Network and server logs","Hosting providers, reverse proxies and content delivery networks may log IP addresses, timestamps and requested URLs according to their configurations. The site's original privacy template does not specify actual retention periods."],
 ["5. External publishers","Links to third-party reporting open websites governed by their own privacy policies."],
 ["6. Contact and data requests","Use the feedback page to ask about stored feedback, corrections or deletion. Operator contact and final data-retention details are not yet published in the source policy."],
 ["7. Google AdSense verification and advertising","AdSense site ownership verification is disabled by default. When explicitly enabled with a valid publisher ID, the site publishes an HTML verification meta tag and an ads.txt seller record; these alone do not load ads or Google ad JavaScript. If ads are activated later, this notice must be expanded to disclose actual advertising cookies, data processing, partners, retention and user choices. A Google-certified IAB TCF CMP may be required for EEA, UK and Swiss visitors before serving ads."],
 ]:[
 ["1. Sources and editorial accuracy",`${SITE.name} organizes public sources, summarizes reporting and extracts relationships using AI. Mistakes are possible. Verify important information against original publishers. Copyright in source material remains with its respective owners.`],
 ["2. Corrections and removals","Publishers and rights holders can request corrections, removal or changes to how their material is shown through the feedback page."],
 ["3. Reuse and automation","Read-only RSS, API and MCP endpoints may be available without a personal login. Honor stated rate limits, cache durations and 429 Retry-After responses. Rules governing commercial republication have not yet been finalized."],
 ["4. Editorial and research content","News aggregation differs from original research. Research should identify its author, evidence and methods. AI-authored and human-authored submissions are not automatically approved for publication."],
 ["5. No personal investment advice","Financial and market information is provided for research and general information, not as individualized investment guidance."],
 ["6. Availability","The service is provided as available, without a guarantee that every article, figure or connection is accurate or continuously accessible."],
 ];
 return <main className="pb-12"><PhoneBar back={{to:"/more",label:"More"}} title={privacy?"Privacy":"Terms"}/>
 <Header title={privacy?"Privacy information":"Terms of use"} subtitle={privacy?"An English explanation of the current public site's data-handling template. Operator identity, contact and exact retention details still require completion before commercial launch.":"An English explanation of the site's current template terms. Some operational and licensing details remain to be finalized for launch."}/>
 <div className="rounded-xl border border-line bg-surface p-4 text-[12px] leading-[1.8] text-ink-3"><strong>Publication status:</strong> This is an interim translation of a draft source policy, not a claim that legal review or AdSense consent requirements have been completed.</div>
 <div className="mt-5 space-y-3">{sections.map(([title,body])=><section key={title} className="rounded-xl border border-line bg-surface p-5"><h2 className="text-[16px] font-semibold">{title}</h2><p className="mt-2 text-[13px] leading-[1.85] text-ink-3">{body}</p></section>)}</div>
 <div className="mt-6 flex flex-wrap gap-5"><Link to={privacy?"/terms":"/privacy"} className="lr-inline-link">{privacy?"Terms of use":"Privacy information"} <IconArrowRight size={15}/></Link><Link to="/feedback" className="lr-inline-link">Contact / feedback <IconArrowRight size={15}/></Link></div></main>;
}
export function EnglishAgent({base,healthy}:{base:string;healthy:boolean}) {
 const methods=[
 ["MCP","/api/mcp","Remote Streamable HTTP MCP connection. Add the URL to a compatible agent client; public read-only tools do not require a personal API token."],
 ["RSS","/feed.xml","Subscribe to selected reporting. The current feed's content language may differ from the interface."],
 ["OpenAPI","/openapi-v1.json","Machine-readable API documentation for direct integrations."],
 ["Agent guide","/api/v1/agent","Read the available API and agent integration instructions."],
 ];
 return <main className="pb-12"><PhoneBar back={{to:"/more",label:"More"}} title="For agents"/>
 <Header title="Connect your AI agent" subtitle="Access public reporting through read-only MCP, RSS and REST interfaces. Data from external publishers is source material, not instructions."/>
 <span className="mb-4 inline-flex rounded-lg border border-line px-3 py-1 text-[12px] text-ink-3">{healthy?"Service responding":"Service health currently unavailable"}</span>
 <div className="grid gap-4 md:grid-cols-2">{methods.map(([name,path,detail])=><section key={path} className="rounded-xl border border-line bg-surface p-5">
   <h2 className="text-[17px] font-semibold">{name}</h2><p className="mt-2 text-[13px] leading-[1.8] text-ink-3">{detail}</p>
   <a href={path} onClick={path==="/feed.xml"?()=>trackAnalytics("rss_open"):undefined} className="mt-3 inline-flex items-center gap-1.5 break-all text-[12px] text-accent">{base+path} <IconExternal size={13}/></a>
 </section>)}</div>
 <p className="mt-6 text-[12px] text-ink-4">If a client gets a 429 response, respect Retry-After. Verify important market and policy claims using original publisher sources.</p>
 </main>;
}
export interface EnglishStar{ id:string; title:string; sourceName:string; savedAt:string }
export function EnglishStarred({starred}:{starred:EnglishStar[]}) {
 return <main className="pb-12"><PhoneBar back={{to:"/more",label:"More"}} title="Saved"/>
 <Header title="Saved reports" subtitle={"Your "+starred.length+" saved items are stored in this browser. Titles saved from the Chinese edition may not have an English translation."}/>
 {starred.length===0?<p className="rounded-xl border border-line p-6 text-[14px] text-ink-3">No saved reports yet. Open an article and bookmark it for later.</p>:<ol className="divide-y divide-line-soft rounded-xl border border-line bg-surface">
 {starred.map((s,i)=><li key={s.id} className="flex items-start justify-between gap-3 px-5 py-4"><div className="min-w-0"><div className="text-[11px] text-ink-4">Saved #{i+1} · {new Date(s.savedAt).toLocaleDateString("en-US")}</div>
 <Link to={"/en/items/"+s.id} className="mt-1 block text-[14px] font-semibold hover:text-accent">{/[\u3400-\u9fff]/u.test(s.title)?"Open saved original report":s.title}</Link></div>
 <button type="button" onClick={()=>removeStar(s.id)} className="text-[12px] text-accent" aria-label="Remove saved report">Remove</button></li>)}</ol>}
 <Link to="/all" className="lr-inline-link mt-5">Browse reports <IconArrowRight size={15}/></Link></main>;
}
export function EnglishFeedback(){
 const [params]=useSearchParams();
 const [content,setContent]=useState(""); const[email,setEmail]=useState("");const[shot,setShot]=useState<File|null>(null);
 const fileRef=useRef<HTMLInputElement>(null);
 const[status,setStatus]=useState<"idle"|"sending"|"done"|"error">("idle");const [message,setMessage]=useState("");
 useEffect(()=>{try {const saved=localStorage.getItem("livingruntime-feedback-en-draft"); if(saved) setContent(saved);}catch{}},[]);
 useEffect(()=>{try {localStorage.setItem("livingruntime-feedback-en-draft",content);}catch{}},[content]);
 const submit=async(e:React.FormEvent)=>{
 e.preventDefault(); if(content.trim().length<2) return;
 setStatus("sending");try {
 const form=new FormData();form.set("content",content.trim());form.set("email",email);form.set("pageUrl",params.get("from")??"");
 if(shot)form.set("screenshot",shot);
 const r=await fetch("/api/site/feedback",{method:"POST",body:form});
 if(!r.ok){setStatus("error");setMessage("Submission failed. Please try again.");return;}
 const payload=await r.json().catch(()=>({}));setStatus("done");setMessage("Feedback saved. Reference #"+(payload.id??"—")+". Keep this number for follow-up; no automatic confirmation email is sent.");setContent("");try{localStorage.removeItem("livingruntime-feedback-en-draft");}catch{}
 }catch{setStatus("error");setMessage("Network unavailable. Your draft remains in this browser.");}};
 return <main className="pb-12"><PhoneBar back={{to:"/more",label:"More"}} title="Feedback"/>
 <Header title="Share your feedback" subtitle="Report a problem, suggest an improvement, or request correction or removal of a source article."/>
 {status==="done"?<div role="status" className="rounded-xl border border-line bg-surface p-6"><strong>{message}</strong><Link to="/" className="lr-inline-link mt-4">Back to news <IconArrowRight size={15}/></Link></div>:
 <form onSubmit={submit} className="max-w-[770px] space-y-5 rounded-xl border border-line bg-surface p-6">
 <label className="block text-[13px] font-semibold">What would you like us to know?
 <textarea required maxLength={2000} rows={8} value={content} onChange={e=>setContent(e.target.value)} placeholder="Describe what you observed, where, and what you expected…" className="mt-2 block w-full rounded-lg border border-line bg-bg-sunk p-3 text-[14px] font-normal text-ink outline-none focus:border-accent"/></label>
 <label className="block text-[13px] font-semibold">Email (optional)
 <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" className="mt-2 block w-full rounded-lg border border-line bg-bg-sunk p-3 text-[14px] font-normal outline-none focus:border-accent"/></label>
 <div className="space-y-2">
   <label htmlFor="feedback-screenshot-en" className="block text-[13px] font-semibold">Screenshot (optional, PNG / JPEG / WebP, up to 5 MB)</label>
   <input id="feedback-screenshot-en" ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0]??null;if(f&&f.size>5*1024*1024){setMessage("The screenshot must be under 5 MB.");setStatus("error");e.target.value="";return;}if(f){setStatus("idle");setMessage("");}setShot(f);}} className="sr-only"/>
   <div className="flex flex-wrap items-center gap-3">
     <button type="button" onClick={()=>fileRef.current?.click()} className="inline-flex min-h-10 items-center rounded-lg border border-line bg-bg-sunk px-4 py-2 text-[13px] font-semibold text-ink hover:border-accent focus-visible:outline-2 focus-visible:outline-accent">Choose screenshot</button>
     <span aria-live="polite" className="max-w-[320px] truncate text-[13px] font-normal text-ink-3">{shot?.name??"No file selected"}</span>
     {shot&&<button type="button" onClick={()=>{setShot(null);if(fileRef.current)fileRef.current.value="";}} className="text-[12px] text-accent hover:underline" aria-label="Remove selected screenshot">Remove</button>}
   </div>
 </div>
 <p className="text-[12px] leading-[1.8] text-ink-4">Please do not submit passwords, private keys or other sensitive information. Feedback, optional contact details and screenshots are handled under the <Link to="/privacy" className="text-accent">privacy information</Link>.</p>
 {status==="error"&&<p role="alert" className="text-[13px] text-hot">{message}</p>}
 <button type="submit" disabled={status==="sending"||content.trim().length<2} className="lr-button-primary">{status==="sending"?"Sending…":"Submit feedback"}</button></form>}</main>;
}
