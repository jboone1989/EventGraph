import type { FastifyInstance } from "fastify";
import { getSpot, SPOT_ASSETS, type SpotAsset } from "@aihot/backend/publication/market";
import { storyMarket } from "@aihot/backend/publication/market";
import { resolveStory } from "@aihot/backend/publication/stories";

/** Public read-only snapshot, separate from article processing. */
export function registerMarket(app: FastifyInstance) {
  app.get("/api/market/spot", async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    if (Object.keys(query).some(k => k !== "asset") || typeof query.asset !== "string") {
      return reply.code(400).send({ error: "asset=BTC|ETH|SOL|XRP|BNB required" });
    }
    const asset = query.asset.toUpperCase();
    if (!SPOT_ASSETS.some(s => s === asset)) return reply.code(400).send({ error: "unsupported asset" });
    const result = await getSpot(asset as SpotAsset);
    reply.header("Cache-Control", "public, max-age=30, s-maxage=60");
    if (!result.observations.length) return reply.code(503).send(result);
    return reply.send(result);
  });
  // Prices around one public event, from the worker's snapshots; an empty list when it names no asset or none was priced.
  app.get<{ Params: { publicId: string } }>("/api/market/stories/:publicId", async (req, reply) => {
    const found = await resolveStory(req.params.publicId);
    const market = found.kind === "found" ? await storyMarket(found.storyId) : null;
    if (!market) return reply.code(404).header("Cache-Control", "public, max-age=60").send({ error: "not_found" });
    reply.header("Cache-Control", "public, max-age=300, s-maxage=300");
    return reply.send(market);
  });
}
