import type {FastifyInstance} from "fastify";

import {dailyGraphChanges,entityProfile,publicGraphOverview,publicGraphNetwork,publicGraphRelation,publicStoryGraph,publicAtlasNeighborhood,publicAtlasCenters,graphStats,graphSearch} from "@aihot/backend/publication/knowledge";
import {timingSafeEqual} from "node:crypto";
import {parseGraphTime} from "@aihot/backend/knowledge/temporal";

export function registerKnowledge(app:FastifyInstance){
  app.get<{Querystring:{q?:string;limit?:string}}>("/api/v1/knowledge/search",async(req,reply)=>{
    const expected=process.env.KNOWLEDGE_SEARCH_TOKEN;
    const presented=req.headers.authorization?.replace(/^Bearer /,"");
    if(!expected || !presented || presented.length!==expected.length ||
       !timingSafeEqual(Buffer.from(presented),Buffer.from(expected)))
      return reply.code(401).header("Cache-Control","no-store").send({error:"unauthorized"});
    const q=req.query.q?.trim()??"";
    const limit=Number(req.query.limit??10);
    if(q.length<2||q.length>500||!Number.isInteger(limit)||limit<1||limit>30)
      return reply.code(400).send({error:"invalid_query"});
    return reply.header("Cache-Control","no-store").send(await graphSearch(q,limit));
  });
  app.get("/api/site/knowledge/overview",async(_req,reply)=>
    reply.header("Cache-Control","public, max-age=60").send(await publicGraphOverview()));
  app.get("/api/site/knowledge/network",async(_req,reply)=>{
    const graph=await publicGraphNetwork();
    if(graph.status==="unavailable") return reply.code(503).header("Cache-Control","no-store").send(graph);
    return reply.header("Cache-Control","public, max-age=60").send(graph);
  });
  app.get<{Params:{key:string}}>("/api/site/knowledge/relations/:key",async(req,reply)=>{
    if(req.params.key.length>180)return reply.code(400).send({error:"invalid_relation"});
    const graph=await publicGraphRelation(req.params.key);
    if(graph.status==="unavailable")return reply.code(503).header("Cache-Control","no-store").send(graph);
    if(!graph.edges.length)return reply.code(404).header("Cache-Control","no-store").send({error:"not_found"});
    return reply.header("Cache-Control","public, max-age=60").send(graph);
  });
  app.get<{Querystring:{q?:string}}>("/api/site/knowledge/centers",async(req,reply)=>{
    const q=(req.query.q??"").trim();
    if(q.length>100)return reply.code(400).send({error:"invalid_query"});
    const result=await publicAtlasCenters(q);
    if(result.status==="unavailable")return reply.code(503).header("Cache-Control","no-store").send(result);
    return reply.header("Cache-Control","public, max-age=60").send(result);
  });
  app.get<{Params:{key:string}}>("/api/site/knowledge/neighborhood/:key",async(req,reply)=>{
    if(req.params.key.length>180)return reply.code(400).send({error:"invalid_entity"});
    const result=await publicAtlasNeighborhood(req.params.key);
    if(result.status==="unavailable")return reply.code(503).header("Cache-Control","no-store").send(result);
    if(result.status==="not_found")return reply.code(404).send(result);
    return reply.header("Cache-Control","public, max-age=60").send(result);
  });
  app.get("/api/site/knowledge/stats",async(_req,reply)=>
    reply.header("Cache-Control","public, max-age=60").send(await graphStats()));
  app.get<{Params:{publicId:string};Querystring:{asOf?:string;clock?:string}}>("/api/site/knowledge/stories/:publicId",async(req,reply)=>{
    const {publicId}=req.params;
    if(!/^[a-f0-9-]{36}$/i.test(publicId))return reply.code(400).send({error:"invalid_story"});
    const parsed=parseGraphTime(req.query.asOf, req.query.clock);
    if(parsed.status==="invalid")return reply.code(400).header("Cache-Control","no-store").send({error:"invalid_graph_time"});
    const time=parsed.value;
    const graph=await publicStoryGraph(publicId,new Date(),time ?? undefined);
    // Keep the pre-existing current-snapshot HTTP contract unchanged for existing consumers.
    if(time && (graph.status==="unavailable" || graph.status==="disabled"))
      return reply.code(503).header("Cache-Control","no-store").send(graph);
    return reply.header("Cache-Control",time?"public, max-age=30":"public, max-age=120")
      .send({...graph,...(time?{asOf:time.asOf.toISOString(),clock:time.clock,fidelity:"bounded"}:{})});
  });
  app.get<{Params:{key:string}}>("/api/site/knowledge/entities/:key",async(req,reply)=>{
    const key=req.params.key;
    if(key.length>180)return reply.code(400).send({error:"invalid_entity"});
    return reply.header("Cache-Control","public, max-age=120").send(await entityProfile(key));
  });
  app.get<{Params:{key:string}}>("/api/site/knowledge/daily/:key",async(req,reply)=>{
    const {key}=req.params;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return reply.code(400).send({error:"invalid_date"});
    const changes=await dailyGraphChanges(key).catch(()=>undefined);
    if(changes===undefined)return reply.code(503).header("Cache-Control","no-store").send({error:"unavailable"});
    if(!changes)return reply.code(404).header("Cache-Control","public, max-age=60").send({error:"not_found"});
    return reply.header("Cache-Control","public, max-age=300").send(changes);
  });
}
