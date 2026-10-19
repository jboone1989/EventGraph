/** Public graph time controls: explicit UTC offset and distinct knowledge/effective-time clocks. */
export type GraphClock = "known" | "valid";
export type GraphTime = {asOf:Date;clock:GraphClock};
export type ParsedGraphTime = {status:"ok";value:GraphTime | null}|{status:"invalid"};

export function parseGraphTime(asOf?:string, clock?:string):ParsedGraphTime {
  if(asOf===undefined && clock===undefined)return {status:"ok",value:null};
  if(!asOf || !/^(?:\d{4})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(asOf)
    || (clock!==undefined && clock!=="known" && clock!=="valid"))return {status:"invalid"};
  const date=new Date(asOf);
  if(!Number.isFinite(date.getTime()) || date.getTime()>Date.now())return {status:"invalid"};
  return {status:"ok",value:{asOf:date,clock:clock==="valid"?"valid":"known"}};
}
