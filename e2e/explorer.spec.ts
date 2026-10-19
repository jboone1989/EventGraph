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
      await expect(page.getByRole("heading",{name:english?/Sources at this time/:/当时可用的报道来源/})).toBeVisible();
      await page.getByRole("tab",{name:english?"Timeline":"时间",exact:true}).click();
      await expect(page.getByRole("region",{name:english?"Event report playback":"事件时间回放"})).toBeVisible();
    }
    await expectNoOverflow(page);
    expect(problems).toEqual([]);
  });
}
