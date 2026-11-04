#!/usr/bin/env python3
"""EventGraph production acceptance: real content + knowledge graph, not just HTTP 200."""
import json
import os
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
for path,key in [("/api/site/hot","entries"),("/api/site/timeline","cards")]:
    status,raw,_=get(path)
    try:count=len(json.loads(raw).get(key,[]))
    except Exception:count=0
    print(path,status,key,count)
    if status!=200 or count<1:failure.append(path+" has no current news data")
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
