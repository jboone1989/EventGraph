// Verify the new story Explorer actually switches the shared time context,
// and that unavailable Graphiti does not break the public experience.
import {test, expect} from "@playwright/test";
import {expectNoOverflow, open, samples, watch} from "./site.ts";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const seeded = await samples(base);
for (const english of [false, true]) {
  test(`Explorer changes clocks and remains usable without Graphiti (${english ? "English" : "Chinese"})`, async ({page}) => {
    test.skip(!seeded.story, "No public event available for an Explorer check");
    const problems = watch(page);
    const requests:string[]=[];
    page.on("request",req=> {
      if(new URL(req.url()).pathname.includes("/api/site/knowledge/stories/")) requests.push(req.url());
    });
    await open(page, `${english?"/en":""}/story/${seeded.story}`);
    await expect(page.getByRole("heading",{name:english?"EventGraph Explorer":"事件探索工作台"})).toBeVisible();
    const known = page.getByRole("button",{name:english?"Recorded-time reconstruction":"按收录时间重建"});
    const valid = page.getByRole("button",{name:english?"Valid time":"事实生效时间"});
    await expect(known).toHaveAttribute("aria-pressed","true");
    await valid.click();
    await expect(valid).toHaveAttribute("aria-pressed","true");
    await expect.poll(()=>requests.some(url=>url.includes("clock=valid"))).toBe(true);
    await known.click();
    await expect(known).toHaveAttribute("aria-pressed","true");
    await expect.poll(()=>requests.some(url=>url.includes("clock=known"))).toBe(true);
    const graphTab = page.getByRole("tab",{name:english?"Relations":"关系",exact:true});
    if (await graphTab.isVisible()) {
      await graphTab.click();
      await expect(page.getByRole("heading",{name:english?"Relations at this time":"此时的实体关系"})).toBeVisible();
      const sourcesTab = page.getByRole("tab",{name:english?"Sources":"来源",exact:true});
      await sourcesTab.click();
      await expect(page.getByRole("heading",{name:english?/Reports available by this time|Reports published by this time/:/当时可用的报道来源|该时点之前发布的报道来源/})).toBeVisible();
      await expect(page.getByText(english?/Published/:/发布/).first()).toBeVisible();
      await expect(page.getByText(english?/First seen|First-seen time unavailable/:/收录/).first()).toBeVisible();
      const progress = page.getByRole("region",{name:english?"Event developments at selected time":"按时点筛选的事件进展"});
      if (await progress.count()) await expect(progress).toBeVisible();
      await page.getByRole("tab",{name:english?"Timeline":"时间",exact:true}).click();
      await expect(page.getByRole("region",{name:english?"Event report playback":"事件时间回放"})).toBeVisible();
    }
    await expectNoOverflow(page);
    expect(problems).toEqual([]);
  });
}

// Product acceptance regression: unlike a decorative timeline, the selected
// as-of timestamp controls Cytoscape entities and the facts in the evidence panel.
test("as-of replay changes the SAME focused atlas and excludes future evidence", async ({page}) => {
  test.skip(!seeded.story,"No seeded event");
  await page.addInitScript(()=>localStorage.setItem("livingruntime-language","en"));
  let latestCutoff:number | null = null;
  const graphRequests:string[] = [];
  const unrelatedRequests:string[] = [];
  const person = (key:string)=>({key,name:"E2E "+key,kind:"organization"});
  const evidence = (id:string)=>({articleId:id,url:"https://example.com/"+id,
    source:"Recorded Lab",quote:"Source record",publishedAt:"2026-10-19T08:00:00Z"});
  const first = {id:"proof-1",subject:person("Alpha"),object:person("Beta"),
    predicate:"REPORTED",fact:"E2E Alpha reported E2E Beta.",validAt:null,invalidAt:null,
    evidence:[evidence("source-1")]};
  const later = {id:"proof-2",subject:person("Beta"),object:person("Gamma"),
    predicate:"LINKED",fact:"E2E Beta linked E2E Gamma.",validAt:null,invalidAt:null,
    evidence:[evidence("source-2")]};
  page.on("request",req=>{
    const u=new URL(req.url());
    if(u.pathname.includes("/api/site/knowledge/neighborhood/")||u.pathname.includes("/api/site/knowledge/entities/"))
      unrelatedRequests.push(u.pathname);
  });
  await page.route(/\/api\/site\/knowledge\/stories\/[^?]+\?/,async route=>{
    const u=new URL(route.request().url());
    graphRequests.push(u.searchParams.get("asOf")||"");
    const asOf=Date.parse(u.searchParams.get("asOf")||"");
    latestCutoff??=asOf;
    const selected=asOf<latestCutoff?[first]:[first,later];
    await route.fulfill({json:{entities:selected.length+1,edges:selected,
      temporalSupport:"bitemporal-v1",fidelity:"bounded"}});
  });
  await open(page, "/story/"+seeded.story);
  const panel=page.getByRole("region",{name:"Event Explorer"});
  const timeline=page.getByRole("region",{name:"Event report playback"});
  const graphTab=page.getByRole("tab",{name:"Relations",exact:true});
  if(await graphTab.isVisible())await graphTab.click();
  await expect(panel.locator(".lr-atlas-canvas")).toHaveAttribute("aria-label",/3 entities/);
  await expect(panel.locator(".lr-atlas-canvas")).toHaveAttribute("data-rendered-nodes","3");
  await expect(panel.getByTestId("atlas-coverage-note")).toContainText("At most 60 relations");
  await expect(panel.locator(".lr-atlas-canvas")).toHaveAttribute("data-focus-in-viewport","true");
  await expect(panel.locator(".lr-atlas-canvas canvas").first()).toBeAttached();
  const conn=panel.locator(".lr-atlas-connection").first();
  await conn.getByRole("button",{name:/Evidence/}).click();
  await expect(panel.getByTestId("temporal-pair-evidence")).toContainText("Recorded Lab");
  await panel.getByRole("button",{name:/Close/}).click();
  const timelineTab=page.getByRole("tab",{name:"Timeline",exact:true});
  if(await timelineTab.isVisible())await timelineTab.click();
  const slider=timeline.getByRole("slider");
  await expect(slider).toHaveAttribute("max",/^[1-9]/);
  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveValue("0");
  if(await graphTab.isVisible())await graphTab.click();
  await expect(panel.locator(".lr-atlas-canvas")).toHaveAttribute("aria-label",/2 entities/);
  // Assert the actual Cytoscape nodes, not just the React aria-label.
  await expect(panel.locator(".lr-atlas-canvas")).toHaveAttribute("data-rendered-nodes","2");
  await expect(panel.locator(".lr-atlas-canvas")).toHaveAttribute("data-focus-in-viewport","true");
  await expect(panel.getByText("E2E Gamma")).toHaveCount(0);
  await expect(panel.getByTestId("temporal-pair-evidence")).toHaveCount(0);
  if(await timelineTab.isVisible())await timelineTab.click();
  await slider.focus();
  await slider.press("End");
  if(await graphTab.isVisible())await graphTab.click();
  await expect(panel.locator(".lr-atlas-canvas")).toHaveAttribute("aria-label",/3 entities/);
  await expect(panel.locator(".lr-atlas-canvas")).toHaveAttribute("data-rendered-nodes","3");
  await expect(panel.locator(".lr-atlas-canvas")).toHaveAttribute("data-focus-in-viewport","true");
  expect(new Set(graphRequests).size).toBeGreaterThanOrEqual(2);
  expect(unrelatedRequests).toEqual([]);
});


test("an event with no public relations links to the global graph without inventing an event edge", async ({page}) => {
  test.skip(!seeded.story, "No public event available for an Explorer check");
  await page.addInitScript(()=>localStorage.setItem("livingruntime-language","en"));
  await page.route(/\/api\/site\/knowledge\/stories\/[^?]+\?/, async route => {
    await route.fulfill({json:{entities:0,edges:[],status:"ok",temporalSupport:"bitemporal-v1"}});
  });
  await open(page, "/en/story/"+seeded.story);
  await expect(page.getByText("No public relations are linked to this event at the selected time. The current global graph is not substituted for event evidence.")).toBeVisible();
  await expect(page.getByRole("link",{name:"Explore the global knowledge network separately ↗"})).toHaveAttribute("href","/knowledge");
});
