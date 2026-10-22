## 1. Data stored in your browser

Bookmarks, read status, followed topics and entities, interface language, theme and font settings, recent search terms (up to 10), changelog read state and feedback drafts live in your current browser; list positions, scroll positions and expanded state on return live only in this tab's session storage and are cleared when the tab closes. These reading preferences are not sent to the server; the one exception is the home page's Following view, where your browser includes the topics and entities you follow in the request so the server can return matching reports — the server uses the list only to answer and never writes it to its database. Clearing browser data removes them, and they do not sync across devices. Bookmarks, read status, follows and the theme can be exported and imported on the Saved page.

## 2. Feedback

What you submit on the feedback page, the optional email address, the address of the page you were on, and any screenshot you attach are kept on the server to handle your feedback. When a Feishu group is configured, feedback is forwarded there and the screenshot is uploaded to Feishu, after which the server does not keep it. To prevent abuse, the server keeps a derived, irreversible identifier computed from the network address and browser class, used for rate limiting and banning abusive sources.

## 3. Server and network logs

The site records a limited set of anonymous interaction events: page views, event and article opens, graph node and relationship selections, source-link clicks, search actions (**search terms are not recorded**) and client navigation timings. Fields include the event class, page class, page language, a bounded content identifier, a random session UUID, an optional referrer domain and timings. The random session UUID lives only in this tab's session storage and is not used to identify visitors across sessions. **IP addresses, email addresses, full URLs, search terms and body text are never written to the site's analytics tables.** Event records serve analysis within 90 days; backend summaries show only the last 30 days, and expired records are cleaned up by later writes, so cleanup can lag when traffic is quiet. When the browser sends Do Not Track or Global Privacy Control, the site's JavaScript reporting is skipped.

The site can optionally use Cloudflare Web Analytics and PostHog; data reaches them only after an administrator configures the public tokens. Cloudflare's Beacon counts page views and performance; PostHog receives only a limited set of anonymous event types and the random session identifier, with no input capture or session replay. Before enabling third-party analytics, check the privacy, notice and consent requirements that apply to your actual audience. Google Search Console can be used for search performance analysis; the site only carries its verification mark and never reads visitor information.

Servers, reverse proxies or CDNs may separately keep the technical access logs they need (for example IP, time, request address and browser information); their retention depends on the actual deployment and should be published by the operator.

## 4. Third-party content

What the site shows are summaries of and links to third-party originals. Following an original link takes you to that website, where its own privacy policy applies.

## 5. Contact

State a contact address, and how to query, correct or delete feedback material.

## 6. Google AdSense verification and advertising

The site can be configured for Google AdSense site-ownership verification. The feature is off by default; after an administrator sets a real publisher ID and enables verification, the site publishes the HTML verification meta tag and the `/ads.txt` seller record. **Verification alone does not show ads and does not load Google ad JavaScript through this site's code.**

If AdSense advertising is enabled later, Google and its ad-technology partners may process device identifiers, cookies or other local storage and ad measurement data. Before that happens, the operator must expand this notice with the advertising services actually used, the purposes of processing, cookies and retention, privacy choices, and how consent is given and withdrawn. Serving ads to visitors in the EEA, the UK and Switzerland also calls for a Google-certified, IAB TCF-integrated CMP and the region's privacy and consent requirements.

Neither advertising nor a CMP is enabled by default in this framework, and the operator entries marked to-be-completed on this page must still be verified before public launch.
