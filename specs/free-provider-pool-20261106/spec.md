# Multi-provider free-model pool (2026-11-06)

Approved by owner: add free model sources beyond OpenRouter and NVIDIA.

## Reuse and scope
- Reuse existing provider_connections + registered_models CRUD and auto-routing. No new router, probe scheduler, database tables or worker.
- Add four OpenAI-compatible connection presets: Groq, Gemini, Z.AI, Cloudflare Workers AI. Cloudflare requires the owner's account ID.
- Manually import a conservative set of official free candidates. Provider /models endpoints are not reliable pricing sources; never import an unknown model as free by guessing its name.
- Free-tier qualification on Groq, Gemini, Cloudflare depends on the actual account. Explicit operator confirmation is required. An account upgraded to paid may incur charges; recheck before enabling automatic routing.
- Z.AI free candidates are explicitly shown as free in their official pricing.
- Default new models to enabled=false and route_enabled=false. Existing model configuration, billing and workflow bindings remain unchanged.
- Existing free-only automatic selection and rejection fallover applies across all connected providers. Never silently select an explicitly paid model.
- Model row-level tests and existing cache refresh remain unchanged. No production release implied.

## Reviewed vendor documentation
- https://console.groq.com/docs/rate-limits
- https://ai.google.dev/gemini-api/docs/pricing
- https://docs.z.ai/guides/overview/pricing
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
