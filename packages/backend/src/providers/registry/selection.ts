import { normalizedRegistryActive, listConnections, listRegisteredModels } from './connections.ts';
import { BudgetExceededError } from '../receipts.ts';
import { listProviders } from './repository.ts';
import type { ProviderProfile } from './types.ts';
import { isVerifiedFreeTrialProvider } from './types.ts';
import type { RegisteredModel, ProviderConnection } from '@aihot/contracts/providers';

export type Complexity = 'light' | 'medium' | 'heavy';
const weights: Record<string, Complexity> = {
  prefilter: 'light', score: 'medium', understand: 'heavy', summarize: 'light',
  wording: 'light', structure: 'medium', group: 'heavy', groupReview: 'heavy',
  digest: 'heavy', report: 'heavy', graphiti: 'heavy', translate: 'medium', english: 'medium', explain: 'heavy',
};
const levels: Record<Complexity, number> = { light: 0, medium: 1, heavy: 2 };
const cooling = new Map<string, number>();
const accountCooling = new Map<string, number>();

export function stageComplexity(stage: string): Complexity {
  return stage === 'light' || stage === 'medium' || stage === 'heavy' ? stage : weights[stage] ?? 'medium';
}

/** A 429 may represent an account-wide quota. Do not flood other models using the same key. */
export function coolDownModel(id: string, providerId: string, seconds = 60, accountWide = false) {
  const until = Date.now() + Math.max(1, seconds) * 1000;
  cooling.set(id, until);
  if (accountWide) accountCooling.set(providerId, until);
}

function tierPenalty(actual: Complexity, target: Complexity): number {
  const delta = levels[actual] - levels[target];
  return delta < 0 ? -delta * 150 : delta * 70;
}

/** Legacy NVIDIA path stays available when the normalized registry is disabled. */
export function rankStageProviders(rows: ProviderProfile[], stage: string, now = Date.now(), needsVision = false): ProviderProfile[] {
  const target = stageComplexity(stage), capability = needsVision ? 'vision' : 'text';
  return rows.filter(p => p.vendor === 'nvidia' && isVerifiedFreeTrialProvider(p.modelId) &&
    p.enabled && p.routeEnabled && p.endpoint && p.adapter === 'chat' && p.capabilities.includes(capability) &&
    p.checks.some(c => c.capability === capability && c.status === 'verified' && c.verifiedAt &&
      now - Date.parse(c.verifiedAt) < 86400000))
    .sort((a, b) => tierPenalty(a.complexity, target) - tierPenalty(b.complexity, target) ||
      (a.checks.find(c => c.capability === capability)?.latencyMs ?? 120000) -
      (b.checks.find(c => c.capability === capability)?.latencyMs ?? 120000) ||
      a.modelId.localeCompare(b.modelId));
}

function isFree(m: RegisteredModel, c: ProviderConnection): boolean {
  if (c.vendor.toLowerCase() === 'openrouter') return m.modelId.endsWith(':free') || m.modelId === 'openrouter/free';
  return c.vendor.toLowerCase() === 'nvidia' && c.policy === 'nvidia-free-trial' && isVerifiedFreeTrialProvider(m.modelId);
}

export function rankFreeModels(models: RegisteredModel[], connections: ProviderConnection[], stage: string,
  now = Date.now(), needsVision = false, excluded: ReadonlySet<string> = new Set()): RegisteredModel[] {
  const owners = new Map(connections.map(c => [c.id, c]));
  const capability = needsVision ? 'vision' : 'text', target = stageComplexity(stage);
  return models.filter(m => {
    const c = owners.get(m.providerId);
    return !!c && c.enabled && c.credential.configured && isFree(m, c) &&
      m.enabled && m.routeEnabled && m.adapter === 'chat' &&
      m.routing.eligibleCapabilities.includes(capability) && levels[m.complexity] >= levels[target] && !excluded.has(m.id) &&
      (cooling.get(m.id) ?? 0) <= now && (accountCooling.get(c.id) ?? 0) <= now;
  }).sort((a, b) => {
    const ca = owners.get(a.providerId)!, cb = owners.get(b.providerId)!;
    const vendor = (ca.vendor.toLowerCase() === 'openrouter' ? 0 : 1) -
      (cb.vendor.toLowerCase() === 'openrouter' ? 0 : 1);
    // Match the required tier before preferring a vendor: do not waste heavy
    // OpenRouter capacity on a light task if a light NVIDIA model is healthy.
    return tierPenalty(a.complexity, target) - tierPenalty(b.complexity, target) || vendor ||
      (a.checks.find(c => c.capability === capability)?.latencyMs ?? 120000) -
      (b.checks.find(c => c.capability === capability)?.latencyMs ?? 120000) || a.id.localeCompare(b.id);
  });
}

/** Internal Graphiti proxy always needs a registered model ID, independent of global legacy routing. */
export async function selectConfiguredRegisteredModelForStage(stage: string, needsVision = false,
  excluded: ReadonlySet<string> = new Set()): Promise<string> {
  const [connections, models] = await Promise.all([listConnections(), listRegisteredModels()]);
  const candidates = rankFreeModels(models, connections, stage, Date.now(), needsVision, excluded);
  if (!candidates.length) throw new BudgetExceededError('free-models', 'waiting_for_free_provider', 300);
  return 'model:' + candidates[0]!.id;
}

/** Rank on every call, not once on worker startup. Never route an unknown or paid model automatically. */
export async function selectConfiguredProviderForStage(stage: string, needsVision = false,
  excluded: ReadonlySet<string> = new Set()): Promise<string> {
  if (await normalizedRegistryActive())
    return selectConfiguredRegisteredModelForStage(stage, needsVision, excluded);
  const eligible = rankStageProviders(await listProviders(), stage, Date.now(), needsVision);
  if (!eligible.length) throw new BudgetExceededError('nvidia', 'waiting_for_verified_provider', 300);
  return 'nvidia:' + eligible[0]!.modelId;
}

export async function coolDownReference(reference: string, seconds = 60, accountWide = false): Promise<void> {
  if (!reference.startsWith('model:')) return;
  const id = reference.slice(6);
  const models = await listRegisteredModels();
  const m = models.find(item => item.id === id);
  if (m) coolDownModel(id, m.providerId, seconds, accountWide);
}
