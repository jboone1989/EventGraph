import { test } from "node:test";
import assert from "node:assert/strict";
import { pageType, setAnalyticsConfig, trackAnalytics } from "../apps/web/app/lib/analytics.client.ts";

test("PostHog captures pageviews and a session identity without query strings or person profiles", t => {
  const originals = new Map(["window", "location", "document", "sessionStorage"].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  Object.defineProperties(globalThis, {
    window: { configurable:true, value:{} },
    location: { configurable:true, value:{origin:"https://www.example.com",hostname:"www.example.com",pathname:"/story/public"} },
    document: { configurable:true, value:{documentElement:{lang:"en"},referrer:"https://search.example.com/?private-query"} },
    sessionStorage: { configurable:true, value:{getItem:()=>"3fca01ee-e019-4f38-a543-056f1246824a",setItem:()=>{}} },
  });
  t.after(() => { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis,key,descriptor); else Reflect.deleteProperty(globalThis,key); } });
  const requests: Array<{url: string; body: Record<string, any>}> = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requests.push({url,body:JSON.parse(String(init.body))}); return new Response(null,{status:204});
  });
  setAnalyticsConfig({cloudflareToken:null,posthogToken:"phc_public_test",posthogRegion:"us",searchConsoleVerification:null});
  trackAnalytics("page_view");
  assert.equal(requests.length,2);
  assert.equal(requests[0].body.name,"page_view");
  assert.equal(requests[1].url,"https://us.i.posthog.com/capture/");
  const capture=requests[1].body;
  assert.equal(capture.event,"$pageview");
  assert.equal(capture.properties.distinct_id,"3fca01ee-e019-4f38-a543-056f1246824a");
  assert.equal(capture.properties.$process_person_profile,false);
  assert.equal(capture.properties.source,"eventgraph");
  assert.equal(capture.properties.site_host,"www.example.com");
  assert.equal(capture.properties.$current_url,"https://www.example.com/story/public");
  assert.equal(JSON.stringify(capture).includes("private-query"),false);
});


test("localized English routes retain their page category for PV reporting", () => {
  assert.equal(pageType("/en"), "home");
  assert.equal(pageType("/en/items/article1"), "item");
  assert.equal(pageType("/en/story/event1"), "story");
  assert.equal(pageType("/en/daily/2026-11-05"), "daily");
  assert.equal(pageType("/en/knowledge"), "knowledge");
});
