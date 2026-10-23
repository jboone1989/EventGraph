// 搜索引擎读的 head 标签：描述保持单行，canonical 与 og:url 用 sitemap 的地址形态，尾斜杠变体被重定向归一。
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MetaDescriptor } from "react-router";
import { SITE } from "@aihot/site";
import { resolveRedirect } from "@aihot/contracts/http-policy";
import { pageMeta, siteUrl } from "../app/lib/seo.ts";

const first = (tags: MetaDescriptor[], pick: (t: MetaDescriptor) => boolean) =>
  tags.find(pick) as { content?: string; href?: string; title?: string };

test("meta description 折叠换行与连续空白", () => {
  const tags = pageMeta({ title: "标题", description: "第一段\n\n第二段  文本\t\n 第三段", path: "/items/x" });
  const description = first(tags, (t) => "name" in t && t.name === "description").content!;
  assert.ok(!/[\n\r]/.test(description));
  assert.ok(!/\s{2,}/.test(description));
});

test("canonical 与 og:url 去掉尾斜杠，根路径除外", () => {
  const base = siteUrl();
  for (const path of ["/daily/", "/explore/", "/topics/x/", "/"]) {
    const tags = pageMeta({ title: "标题", path });
    const expected = path === "/" ? path : path.replace(/\/+$/, "");
    assert.equal(first(tags, (t) => "rel" in t && t.rel === "canonical").href, `${base}${expected}`);
    assert.equal(first(tags, (t) => "property" in t && t.property === "og:url").content, `${base}${expected}`, path);
  }
});

test("topics 标题只带一次站点后缀", () => {
  const tags = pageMeta({ title: SITE.topicsTitle, path: "/topics" });
  assert.equal(first(tags, (t) => "title" in t).title, `${SITE.topicsTitle} · ${SITE.name}`);
});

test("顶级页面的尾斜杠变体 301 到无斜杠地址", () => {
  for (const path of ["/all/", "/daily/", "/weekly/", "/monthly/", "/en/", "/hot/", "/topics/", "/knowledge/", "/explore/"]) {
    const decision = resolveRedirect(path, "");
    assert.ok(decision && decision.status === 301 && decision.location === path.replace(/\/+$/, ""), path);
  }
  assert.equal(resolveRedirect("/daily", ""), null);
  assert.equal(resolveRedirect("/items/x/", ""), null);
});
