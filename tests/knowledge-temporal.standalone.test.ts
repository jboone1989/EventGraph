import assert from "node:assert/strict";
import {test} from "node:test";
import {parseGraphTime, supportsTemporalGraph} from "../packages/backend/src/knowledge/temporal.ts";

test("current graph requests preserve legacy current snapshot semantics", () => {
  assert.deepEqual(parseGraphTime(), {status:"ok",value:null});
});
test("history requires complete offset-aware timestamps and an explicit supported clock", () => {
  for(const [time, clock] of [
    ["2026-10-19", "known"], ["2026-10-18T12:00:00", "known"],
    ["2026-10-18T12:00:00Z", "future"],
    [undefined, "valid"], ["invalid", "known"],
  ] as const) {
    assert.equal(parseGraphTime(time,clock).status,"invalid");
  }
});
test("known and valid clocks both parse UTC and offset times", () => {
  const known=parseGraphTime("2026-10-01T12:30:00Z","known");
  const valid=parseGraphTime("2026-10-01T20:30:00+08:00","valid");
  assert.equal(known.status,"ok");
  assert.equal(valid.status,"ok");
  if(known.status!=="ok" || valid.status!=="ok")return;
  assert.equal(known.value?.clock,"known");
  assert.equal(valid.value?.clock,"valid");
  assert.equal(known.value?.asOf.toISOString(),valid.value?.asOf.toISOString());
});

test("an old Graphiti instance cannot masquerade as historical knowledge",()=>{
  const asOf={asOf:new Date("2026-10-01T00:00:00Z"),clock:"known" as const};
  assert.equal(supportsTemporalGraph({},asOf),false);
  assert.equal(supportsTemporalGraph({temporalSupport:"bitemporal-v1"},asOf),true);
  assert.equal(supportsTemporalGraph({},undefined),true);
});
