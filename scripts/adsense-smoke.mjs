/** AdSense ownership-only deployment check.
 * Defaults to verifying that no public publisher ID or ad scripts are exposed.
 * To validate an explicitly enabled site, set ADSENSE_EXPECTED_ID=ca-pub-<16 digits>.
 *
 * Besides the home page and /ads.txt it reads the states a review must never see an ad on
 * (specs/adsense-minimal-readiness-20261111 US3): the English edition, the research section —
 * empty or, when its api is down, its fail-closed 503 — an empty search and the 404 page.
 * None of them may carry ad-serving markup; the verification meta and /ads.txt are not ad requests.
 */
const host=(process.env.PREVIEW_URL??"http://127.0.0.1:3000").replace(/\/$/,"");
const expected=process.env.ADSENSE_EXPECTED_ID?.trim()??"";
if(expected&&!/^ca-pub-[0-9]{16}$/.test(expected))throw new Error("ADSENSE_EXPECTED_ID must be a valid ca-pub-16digit ID");
const AD_MARKERS=["pagead2.googlesyndication.com","adsbygoogle.js","doubleclick.net","google_ads"];
/** What each checked page may answer: the research list fails closed with 503 when its api is down. */
const PAGES=[
  {path:"/",ok:[200]},
  {path:"/en",ok:[200]},
  {path:"/research",ok:[200,503]},
  {path:"/en/research",ok:[200,503]},
  {path:"/all?q=adsense-smoke-no-such-result",ok:[200]},
  {path:"/no-such-page-adsense-smoke",ok:[404]},
];
const fetchWith=async(path)=>fetch(host+path,{signal:AbortSignal.timeout(17000)});
const [home,ads,...rest]=await Promise.all([
  fetchWith("/"),fetchWith("/ads.txt"),...PAGES.slice(1).map((p)=>fetchWith(p.path)),
]);
const html=await home.text(),txt=await ads.text();
const matches=[...html.matchAll(/<meta\s+name="google-adsense-account"\s+content="([^"]+)"\s*\/?\s*>/g)].map(x=>x[1]);
const checked=[];
for(const [i,page] of PAGES.entries()) {
  const res=i===0?home:rest[i-1];
  const body=i===0?html:await res.text();
  const markers=AD_MARKERS.filter((m)=>body.includes(m));
  checked.push({path:page.path,status:res.status,statusOk:page.ok.includes(res.status),adMarkers:markers});
}
const correctAdsTxt=expected ? txt.trim()===`google.com, ${expected.slice(3)}, DIRECT, f08c47fec0942fa0` : ads.status===404;
const correctMeta=expected ? matches.length===1&&matches[0]===expected : matches.length===0;
const pass=home.status===200&&correctAdsTxt&&correctMeta&&checked.every((p)=>p.statusOk&&p.adMarkers.length===0)&&(!expected||ads.status===200&&ads.headers.get("content-type")?.startsWith("text/plain"));
console.log(JSON.stringify({mode:expected?"verification-enabled":"default-off",pageStatus:home.status,adsStatus:ads.status,adsContentType:ads.headers.get("content-type"),metaCount:matches.length,metaCorrect:correctMeta,adsTxtCorrect:correctAdsTxt,pages:checked,pass}));
if(!pass)process.exitCode=1;
