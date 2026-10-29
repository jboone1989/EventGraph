import type { StoryDetail, StoryRoute } from "@aihot/contracts/site";
import { publicImpactReportsAt, type ImpactLead } from "./impact-evidence.ts";

export const EVIDENCE_DOMAINS = ["energy", "shipping"] as const;
export type EvidenceDomain = (typeof EVIDENCE_DOMAINS)[number];
export type EnergyShippingEvidence = Omit<ImpactLead, "area"> & (
  { domain: "energy"; sourceKind: "eia_reporting" } |
  { domain: "shipping"; sourceKind: "shipping_reporting" }
);

const SHIPPING = /海峡|航运|船运|油轮|港口|航道|航线|停航|船舶|运费|运价|\bshipping\b|\bfreight\b|\bmaritime\b|\btankers?\b|\bstrait\b|\bvessels?\b|\bports?\b/i;

/** Evidence-only projection of existing public stations. No extracted prices,
 * transit counts, freight indices, external fetches or inferred causal edges.
 * EIA's existing RSS reports are energy evidence, not API observations.
 */
export function energyShippingEvidenceAt(
  route: StoryRoute | null,
  timeline: readonly StoryDetail["timeline"][number][],
  asOf: string | null | undefined,
  clock: "known" | "valid",
): Record<EvidenceDomain, EnergyShippingEvidence[]> {
  const out: Record<EvidenceDomain, EnergyShippingEvidence[]> = { energy: [], shipping: [] };
  for (const { lead, searchable } of publicImpactReportsAt(route, timeline, asOf, clock)) {
    const url = new URL(lead.url);
    // Never treat a source display name or a mention of EIA as official EIA evidence.
    const eia = url.protocol === "https:" &&
      (url.hostname === "eia.gov" || url.hostname === "www.eia.gov");
    if (eia) out.energy.push({ ...lead, domain: "energy", sourceKind: "eia_reporting" });
    // IMF commercial permission is unresolved. Do not project PortWatch material.
    if (SHIPPING.test(searchable) && !/portwatch/i.test(searchable + " " + lead.source + " " + lead.url)) {
      out.shipping.push({ ...lead, domain: "shipping", sourceKind: "shipping_reporting" });
    }
  }
  return out;
}
