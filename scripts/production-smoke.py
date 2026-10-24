#!/usr/bin/env python3
"""EventGraph production acceptance: real content + knowledge graph, not just HTTP 200."""
import json
import os
import sys
import urllib.error
import urllib.request

base=os.environ.get("LRSITE_SMOKE_URL","http://127.0.0.1:3000").rstrip("/")
pages=["/","/all","/hot","/knowledge","/topics","/daily","/daily/archive","/feedback","/about","/privacy","/terms","/robots.txt","/sitemap.xml"]
failure=[]
PLACEHOLDERS=(b"\xe8\xaf\xb7\xe5\xa1\xab\xe5\x86\x99",b"\xe8\xaf\xb7\xe5\x86\x99\xe6\x98\x8e")  # 请填写 / 请写明
def get(path,url=None):
    try:
        with urllib.request.urlopen(urllib.request.Request((url or base)+path,headers={"User-Agent":"EventGraph-Production-Smoke/1.0"}),timeout=18) as response:
            return response.status,response.read(400000),response.headers.get("content-type","")
    except urllib.error.HTTPError as err:
        return err.code,err.read(400000),err.headers.get("content-type","")
    except Exception as err:
        failure.append(path+" "+str(err))
        return 0,b"",""
for path in pages:
    status,html,_=get(path)
    if status!=200 or not html:failure.append(path+" status="+str(status))
    print(path,status,len(html))
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
status,sitemap,_=get("/sitemap.xml")
if status!=200 or sitemap.count(b"<loc>")<1:failure.append("sitemap is empty or unavailable")
elif sitemap.count(b"<lastmod>")<sitemap.count(b"<loc>"):failure.append("sitemap entries without lastmod")
status,robots,_=get("/robots.txt")
for bot in (b"Mediapartners-Google",b"Google-Display-Ads-Bot"):
    if bot not in robots:failure.append("robots.txt does not allow "+bot.decode())
# Host normalization behind the production proxy (specs/003-content-assets FR-010): opt-in, since a
# local or staging base has no apex domain to redirect from.
if os.environ.get("SMOKE_EXPECT_HTTPS")=="1":
    from urllib.parse import urlsplit
    parts=urlsplit(base)
    apex="https://"+parts.hostname.removeprefix("www.")
    for target in ["http://"+parts.hostname, apex]:
        try:
            req=urllib.request.Request(target+"/",headers={"User-Agent":"EventGraph-Production-Smoke/1.0"})
            with urllib.request.urlopen(req,timeout=18) as response:
                if response.geturl().split("?")[0].rstrip("/")!=base.rstrip("/"):
                    failure.append(target+" does not redirect to the canonical host")
                print("redirect",target,"->",response.geturl())
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
