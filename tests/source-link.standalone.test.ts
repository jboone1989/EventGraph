import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import * as cheerio from "cheerio";
import type { FeedItemSummary, SiteItemDetail } from "@aihot/contracts/site";
import { startWebServer, type WebServer } from "../apps/web/tests/web-server.ts";

const at="2026-10-14T06:00:00.000Z";
const link="https://example.org/research/source-story";
const entry: FeedItemSummary = {
  id:"source-link",title:"实验室公开新型语言模型",summary:"该研究团队公开了模型、基准方法及限制。",
  reason:"原始报告详细列出了可重现实验条件。",source:{name:"研究机构"},links:{original:link},
  publishedAt:at,timelineAt:at,category:"research",tags:[],score:80,selected:true,channel:"news",x:null
};
const detail: SiteItemDetail={
  ...entry,x:null,links:{original:link},originalTitle:"Original article",discoveredAt:at,story:null,
  readingMode:"full",author:null,body:null,outline:[],relatedStories:[],topics:[],
  indexable:true,englishIndexable:false,markdownAvailable:false,group:null,hasTranslation:false,bodyLanguage:"original"
};
let web:WebServer;
const api=createServer((req,res)=>{
  const path=new URL(req.url!,"http://local").pathname;
  res.setHeader("content-type","application/json");
  if(path==="/api/site/meta")return res.end(JSON.stringify({changelogVersion:"fixture"}));
  if(path==="/api/site/timeline")return res.end(JSON.stringify({filters:{channel:"all",category:null,tag:null},cards:[{key:entry.id,anchorAt:at,item:entry,group:null}],nextCursor:null,hot:null,dayCounts:{"2026-10-14":1}}));
  if(path==="/api/site/pool")return res.end(JSON.stringify({filters:{channel:"all",category:null,tag:null,q:null,tab:"time"},items:[entry],page:1,pageCount:1,total:1,todayCount:1,freshness:at}));
  if(path==="/api/site/items/source-link")return res.end(JSON.stringify(detail));
  res.statusCode=404;res.end("{}");
});
before(async()=>{web=await startWebServer(api);});
after(async()=>{await web?.stop();});
test("source reports link directly to original on home, all and article, not only to our summary",async()=>{
  for(const path of ["/","/all","/items/source-link"]){
    const res=await fetch(web.origin+path);
    assert.equal(res.status,200,path+" "+web.logs());
    const $=cheerio.load(await res.text());
    const source=$('main a[href="'+link+'"]').filter((_,el)=>/原文|原始报道/.test($(el).text()));
    assert.ok(source.length>0,path+" has no original-reading link");
    const first=source.first();
    assert.equal(first.attr("target"),"_blank");
    assert.match(first.attr("rel")??"",/noopener/);
    assert.equal($('main a[href="/items/source-link"]').length>0,path!=="/items/source-link");
  }
});
