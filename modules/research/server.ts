// The research module in the backend: public reads for the site's pages, guarded writes for the
// editor, and its sitemap entries (specs/002-adsense-readiness US3). The engine never imports this;
// site/modules/server.ts installs it.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { sessionPrincipal } from "@aihot/backend/admin/auth";
import { defineServerModule } from "@aihot/backend/modules";
import { getPublished, listAll, listPublished, saveArticle, setStatus, sitemapEntries } from "./backend/store.ts";

function problem(reply: FastifyReply, status: number, code: string, detail: string) {
  reply.header("Cache-Control", "no-store").code(status);
  return reply.send({ code, detail });
}

/** The same guard /api/admin/* uses (session + CSRF on writes), read from the backend's auth module. */
async function admin(req: FastifyRequest, reply: FastifyReply) {
  const principal = await sessionPrincipal(req.headers.cookie);
  if (!principal) {
    problem(reply, 401, "unauthorized", "先登录后台。");
    return null;
  }
  if (req.method !== "GET" && req.headers["x-csrf-token"] !== principal.csrf) {
    problem(reply, 403, "forbidden", "缺少或过期的 CSRF 令牌。");
    return null;
  }
  return principal;
}

export const researchServer = defineServerModule({
  name: "research",
  http(app: FastifyInstance) {
    // Public reads: the list keeps a minute in shared caches; a piece follows its own edit time.
    app.get("/api/research/articles", async (_req, reply) => {
      const articles = await listPublished();
      return reply.header("Cache-Control", "public, max-age=60, s-maxage=60").send({ articles });
    });
    app.get("/api/research/articles/:slug", async (req, reply) => {
      const article = await getPublished((req.params as { slug: string }).slug);
      if (!article) return problem(reply, 404, "not_found", "没有这篇研究，或它尚未发布。");
      return reply.header("Cache-Control", "public, max-age=60, s-maxage=60").send({ article });
    });
    // The editor's own API, behind the admin session.
    app.get("/api/admin/research", async (req, reply) => {
      if (!(await admin(req, reply))) return reply;
      return reply.send({ articles: await listAll() });
    });
    app.put("/api/admin/research/article", async (req, reply) => {
      const principal = await admin(req, reply);
      if (!principal) return reply;
      try {
        const article = await saveArticle(req.body, principal.name);
        return reply.send({ article });
      } catch (error) {
        if (error instanceof ZodError) return problem(reply, 400, "invalid_request", error.issues.map((i) => `${i.path.join(".") || "稿件"}: ${i.message}`).join("; ").slice(0, 300));
        if ((error as { statusCode?: number }).statusCode === 400) return problem(reply, 400, "invalid_request", String((error as Error).message).slice(0, 300));
        throw error;
      }
    });
    app.post("/api/admin/research/:slug/status", async (req, reply) => {
      const principal = await admin(req, reply);
      if (!principal) return reply;
      const body = req.body as { status?: string; reason?: string };
      if (body.status !== "draft" && body.status !== "published" && body.status !== "retired") return problem(reply, 400, "invalid_request", "未知状态");
      const article = await setStatus((req.params as { slug: string }).slug, body.status, String(body.reason ?? ""), principal.name);
      if (!article) return problem(reply, 404, "not_found", "没有这篇研究。");
      return reply.send({ article });
    });
  },
  sitemap: {
    entries: sitemapEntries,
  },
  llms: () => ({
    pages: ["- `/research`：站方的原创研究（署名、方法与数据来源），`/research/<slug>` 为单篇"],
  }),
});
