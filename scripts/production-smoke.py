#!/usr/bin/env python3
"""EventGraph production acceptance: real content + knowledge graph, not just HTTP 200."""
import json
import os
import shlex
import subprocess
import sys
import urllib.error
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET

base=os.environ.get("LRSITE_SMOKE_URL","http://127.0.0.1:3000").rstrip("/")
pages=["/","/all","/hot","/knowledge","/topics","/daily","/daily/archive","/feedback","/about","/privacy","/terms","/calendar","/robots.txt","/sitemap.xml"]
failure=[]
PLACEHOLDERS=(b"\xe8\xaf\xb7\xe5\xa1\xab\xe5\x86\x99",b"\xe8\xaf\xb7\xe5\x86\x99\xe6\x98\x8e")  # 请填写 / 请写明
def get(path,url=None,max_bytes=400000):
    try:
        with urllib.request.urlopen(urllib.request.Request((url or base)+path,headers={"User-Agent":"EventGraph-Production-Smoke/1.0"}),timeout=18) as response:
            return response.status,response.read(max_bytes),response.headers.get("content-type","")
    except urllib.error.HTTPError as err:
        return err.code,err.read(max_bytes),err.headers.get("content-type","")
    except Exception as err:
        failure.append(path+" "+str(err))
        return 0,b"",""
# The hot list is accepted by evidence, not by count (specs/prod-hot-ranking-release-gate-20261109):
# the empty list of the 2026-11-09 incident is a pass only as a proven sparse window, decided by the
# backend's own read-only probe. Only its aggregate JSON crosses this boundary: no heat SQL here.
def hot_evidence(status,raw):
    if status!=200:return "/api/site/hot is unavailable (status="+str(status)+")"
    try:
        entries=json.loads(raw).get("entries")
        assert isinstance(entries,list)
    except Exception:return "/api/site/hot response is malformed (no entries list)"
    cmd=os.environ.get("EVENTGRAPH_HOT_DIAGNOSTIC_CMD")
    if not cmd:return "EVENTGRAPH_HOT_DIAGNOSTIC_CMD is not set; hot evidence cannot be verified"
    try:
        done=subprocess.run(shlex.split(cmd)+[str(len(entries))],capture_output=True,text=True,timeout=120)
        payload=json.loads(done.stdout.strip())
        diag,acc=payload["diagnostic"],payload["acceptance"]
        assert done.returncode==0 and isinstance(acc,dict) and isinstance(acc.get("accepted"),bool)
        assert isinstance(diag,dict) and isinstance(diag.get("ruleVersion"),str) and isinstance(diag.get("probeAt"),str)
        assert diag.get("snapshot") is None or (isinstance(diag["snapshot"],dict)
            and {"computedAt","ruleVersion","storedEntries","candidates"}<=set(diag["snapshot"]))
        assert isinstance(diag.get("publicEntries"),int) and isinstance(diag.get("eligible"),dict) and isinstance(diag.get("sources"),dict)
    except Exception as err:return "hot ranking diagnostic is unavailable or malformed: "+str(err).split("\n")[0]
    snapshot=diag["snapshot"] or {}
    measured=("computed_at="+str(snapshot.get("computedAt"))+" rule_version="+str(snapshot.get("ruleVersion"))
        +" stored_entries="+str(snapshot.get("storedEntries"))+" candidates="+str(snapshot.get("candidates"))
        +" public_entries="+str(diag["publicEntries"])+" eligible_now="+str(diag["eligible"].get("now"))
        +" eligible_at_snapshot="+str(diag["eligible"].get("atSnapshot"))
        +" scheduled_sources="+str(diag["sources"].get("scheduled"))+" behind_sources="+str(diag["sources"].get("behind")))
    print("/api/site/hot entries",len(entries),"|",measured)
    if not acc["accepted"]:
        return "hot acceptance failed: "+str(acc.get("reason"))+" ("+str(acc.get("detail"))+")"
    print(acc.get("verdict"),"|",measured)
    return None

# Deterministic fixtures for the hot gate itself (no site, no docker): run by Check through
# `python3 scripts/production-smoke.py --selftest`. The verdict comes from the backend evaluator;
# these prove the smoke fails closed on every transport/shape fault and passes through each verdict.
if "--selftest" in sys.argv:
    import contextlib
    import io
    selftest=[]
    def probe(status,body,diagnostic=None,acceptance=None,cmd=None,unset=False):
        os.environ.pop("EVENTGRAPH_HOT_DIAGNOSTIC_CMD",None)
        if cmd is not None:os.environ["EVENTGRAPH_HOT_DIAGNOSTIC_CMD"]=cmd
        elif not unset:
            payload=json.dumps({"diagnostic":diagnostic,"acceptance":acceptance})
            # argv[1] is the payload; the appended public-entry count is argv[2] and ignored.
            os.environ["EVENTGRAPH_HOT_DIAGNOSTIC_CMD"]="python3 -c "+shlex.quote("import sys;print(sys.argv[1])")+" "+shlex.quote(payload)
        out=io.StringIO()
        with contextlib.redirect_stdout(out):result=hot_evidence(status,body)
        return result,out.getvalue()
    def expect(name,ok):
        print(("ok  " if ok else "FAIL")+" "+name)
        if not ok:selftest.append(name)
    rule="test-rule-v1"
    sparse={"probeAt":"2099-03-01T12:05:00Z","ruleVersion":rule,
        "snapshot":{"computedAt":"2099-03-01T12:00:00Z","ruleVersion":rule,"storedEntries":0,"candidates":0},
        "publicEntries":0,"eligible":{"now":0,"atSnapshot":0},"sources":{"scheduled":12,"behind":0}}
    populated=dict(sparse,snapshot=dict(sparse["snapshot"],storedEntries=3,candidates=3),publicEntries=3,eligible={"now":3,"atSnapshot":3})
    ok={"accepted":True,"verdict":"populated"}
    ok_sparse={"accepted":True,"verdict":"expected sparse window"}
    def rejected(reason):return {"accepted":False,"reason":reason,"detail":"fixture "+reason}
    result,out=probe(200,json.dumps({"entries":[{},{},{}]}),populated,ok)
    expect("populated hot passes",result is None and "populated" in out)
    result,out=probe(200,json.dumps({"entries":[]}),sparse,ok_sparse)
    expect("proven sparse window passes with the visible warning",result is None and "expected sparse window" in out and "candidates=0" in out)
    result,_=probe(200,json.dumps({"entries":[]}),dict(sparse,snapshot=None),rejected("hot ranking is absent"))
    expect("absent ranking fails distinctly",result is not None and "hot ranking is absent" in result)
    result,_=probe(200,json.dumps({"entries":[]}),dict(sparse,snapshot=dict(sparse["snapshot"],computedAt="2099-02-01T00:00:00Z")),rejected("hot ranking is stale"))
    expect("stale ranking fails distinctly",result is not None and "hot ranking is stale" in result)
    result,_=probe(200,json.dumps({"entries":[]}),dict(sparse,snapshot=dict(sparse["snapshot"],candidates=2)),rejected("hot eligible candidates are not publicly visible"))
    expect("eligible-but-hidden fails distinctly",result is not None and "not publicly visible" in result)
    result,_=probe(200,json.dumps({"entries":[]}),dict(sparse,sources=dict(sparse["sources"],behind=4)),rejected("hot source collection is behind"))
    expect("lagging sources fail distinctly",result is not None and "source collection is behind" in result)
    result,_=probe(503,b"")
    expect("unavailable hot API fails",result is not None and "unavailable" in result)
    result,_=probe(200,b"<html>not json</html>")
    expect("malformed hot API fails",result is not None and "malformed" in result)
    result,_=probe(200,json.dumps({"entries":3}))
    expect("hot entries without a list fails",result is not None and "malformed" in result)
    result,_=probe(200,json.dumps({"entries":[]}),unset=True)
    expect("missing diagnostic command fails",result is not None and "EVENTGRAPH_HOT_DIAGNOSTIC_CMD" in result)
    result,_=probe(200,json.dumps({"entries":[]}),cmd="false")
    expect("failed diagnostic probe fails",result is not None and "unavailable or malformed" in result)
    result,_=probe(200,json.dumps({"entries":[]}),cmd="printf %s not-json")
    expect("garbage diagnostic output fails",result is not None and "unavailable or malformed" in result)
    result,_=probe(200,json.dumps({"entries":[]}),cmd="printf %s "+shlex.quote(json.dumps({"diagnostic":sparse})))
    expect("diagnostic without acceptance fails",result is not None and "unavailable or malformed" in result)
    print("PASS" if not selftest else "FAIL",json.dumps(selftest))
    sys.exit(1 if selftest else 0)

for path in pages:
    status,html,_=get(path)
    if status!=200 or not html:failure.append(path+" status="+str(status))
    print(path,status,len(html))
# The calendar subscription answers as a calendar, not as a page (specs/004-editorial-ops FR-002).
status,ics,ctype=get("/calendar.ics")
print("/calendar.ics",status,ctype,len(ics))
if status!=200 or not ics.startswith(b"BEGIN:VCALENDAR"):failure.append("/calendar.ics is not a calendar")
if "text/calendar" not in (ctype or ""):failure.append("/calendar.ics content-type is not text/calendar")
status,home,_=get("/")
if b"EventGraph" not in home or b"adsbygoogle.js" in home or b"google-adsense-account" in home:
    failure.append("Home title or AdSense verification is incorrect")
# Policy pages must be filled in (specs/003-content-assets FR-009): a placeholder here blocks review.
for path in ["/privacy","/terms"]:
    status,html,_=get(path)
    if status!=200 or not html:failure.append(path+" is missing")
    elif any(p in html for p in PLACEHOLDERS):failure.append(path+" still contains template placeholders")
    print("placeholders",path,status)
# Discovery must stay trustworthy: every sitemap entry carries a lastmod, and the ad crawlers are allowed.
status,sitemap,_=get("/sitemap.xml",max_bytes=20_000_001)
if status!=200 or len(sitemap)>20_000_000:
    failure.append("sitemap is unavailable or too large to validate fully")
else:
    try:
        root=ET.fromstring(sitemap)
        ns="{http://www.sitemaps.org/schemas/sitemap/0.9}"
        entries=root.findall(ns+"url")
        if not entries or any(not (e.findtext(ns+"loc") and e.findtext(ns+"lastmod")) for e in entries):
            failure.append("sitemap has empty entries or entries without lastmod")
    except ET.ParseError:
        failure.append("sitemap is incomplete or invalid XML")
status,robots,_=get("/robots.txt")
for bot in (b"Mediapartners-Google",b"Google-Display-Ads-Bot"):
    if bot not in robots:failure.append("robots.txt does not allow "+bot.decode())
# Host normalization behind the production proxy (specs/003-content-assets FR-010): opt-in, since a
# local or staging base has no apex domain to redirect from.
if os.environ.get("SMOKE_EXPECT_HTTPS")=="1":
    parts=urllib.parse.urlsplit(base)
    if parts.scheme!="https" or not parts.hostname:
        failure.append("SMOKE_EXPECT_HTTPS requires an https canonical base")
    else:
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None

        origin="http://"+parts.netloc
        apex="https://"+parts.netloc.removeprefix("www.")
        targets=[origin]
        if apex.rstrip("/")!=base.rstrip("/"):
            targets.append(apex)
        opener=urllib.request.build_opener(NoRedirect)
        for target in targets:
            try:
                req=urllib.request.Request(target+"/",headers={"User-Agent":"EventGraph-Production-Smoke/1.0"})
                try:
                    with opener.open(req,timeout=18) as response:
                        code,location=response.status,response.headers.get("Location","")
                except urllib.error.HTTPError as err:
                    code,location=err.code,err.headers.get("Location","")
                destination=urllib.parse.urljoin(target+"/",location)
                if code not in (301,308) or destination.rstrip("/")!=base.rstrip("/"):
                    failure.append(target+" must return permanent 301/308 directly to the canonical host")
                print("redirect",target,code,"->",destination)
            except Exception as err:
                failure.append(target+" "+str(err))

status,raw,_=get("/api/site/hot")
hot=hot_evidence(status,raw)
if hot:failure.append(hot)
# The timeline is real news whatever the hot window holds; it stays a hard count check.
status,raw,_=get("/api/site/timeline")
try:cards=len(json.loads(raw).get("cards",[]))
except Exception:cards=0
print("/api/site/timeline",status,"cards",cards)
if status!=200 or cards<1:failure.append("/api/site/timeline has no current news data")
status,raw,_=get("/api/site/knowledge/stats")
try:graph=json.loads(raw)
except Exception:graph={}
print("knowledge",status,graph)
if status!=200 or graph.get("entities",0)<1 or graph.get("relations",0)<1 or graph.get("episodes",0)<1:
    failure.append("Knowledge graph is unavailable or empty")
status,_,_=get("/ads.txt")
if status!=404:failure.append("AdSense must remain unapproved and off")
print("ads.txt",status)
print("PASS" if not failure else "FAIL",json.dumps(failure))
if failure:sys.exit(1)
