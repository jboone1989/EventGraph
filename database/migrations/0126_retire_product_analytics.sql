-- Retire the unused first-party analytics events after replacing the dashboard with Cloudflare.
-- Historical records in this table are permanently deleted on deployment; back up if needed.
-- Published articles, source data, and external Cloudflare/Search Console history are untouched.
DROP TABLE IF EXISTS product_analytics_events;
