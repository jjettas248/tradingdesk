import { PIPELINE_STAGES, SETUP_KEYS, INDEX_FUTURE_SYMBOLS } from "@/server/config/constants";
import type { PipelineDeps, PipelineCandidate } from "@/server/pipeline/context";
import { reject } from "@/server/pipeline/context";
import { EQUITY_TRADE_CANDIDATES } from "@/server/market-data/universe";
import { checkGap, checkRelativeVolume } from "@/server/pipeline/setups/setup1-catalyst-continuation";
import { checkHigherTimeframeContext } from "@/server/pipeline/setups/setup2-index-trend-pullback";

/**
 * Stage 1 — Scanner. Screens the universe for candidates worth the more expensive
 * downstream stages. Cheap, deterministic checks only (gap / RVOL for Setup 1;
 * opening-structure trend for Setup 2). Symbols that fail screening are recorded
 * as REJECTED at the SCANNER stage so the journal shows why they were passed over.
 */
export async function runScanner(deps: PipelineDeps): Promise<PipelineCandidate[]> {
  const market = await deps.provider.getMarketContext(deps.asOf);
  const candidates: PipelineCandidate[] = [];

  // Setup 1 — single-name equities.
  for (const symbol of EQUITY_TRADE_CANDIDATES) {
    const snapshot = await deps.provider.getSnapshot(symbol, deps.asOf);
    if (!snapshot) continue;
    const direction = snapshot.changePercent >= 0 ? "LONG" : "SHORT";
    const c: PipelineCandidate = base(symbol, SETUP_KEYS.CATALYST_CONTINUATION, "EQUITY", direction, snapshot, market);

    const inputs = { snapshot, market, thresholds: deps.thresholds.setup1, catalystAgeHours: null, materialityConfidence: null, rewardRisk: null };
    const gap = checkGap(inputs);
    const rvol = checkRelativeVolume(inputs);
    c.checks.push(gap, rvol);
    if (!gap.passed) reject(c, PIPELINE_STAGES.SCANNER, gap.detail);
    else if (!rvol.passed) reject(c, PIPELINE_STAGES.SCANNER, rvol.detail);
    candidates.push(c);
  }

  // Setup 2 — index micro futures.
  for (const symbol of INDEX_FUTURE_SYMBOLS) {
    const snapshot = await deps.provider.getSnapshot(symbol, deps.asOf);
    if (!snapshot) continue;
    const direction = snapshot.changePercent >= 0 ? "LONG" : "SHORT";
    const c: PipelineCandidate = base(symbol, SETUP_KEYS.INDEX_TREND_PULLBACK, "INDEX_FUTURE", direction, snapshot, market);

    const inputs = { snapshot, market, thresholds: deps.thresholds.setup2, economicReleaseInMinutes: null, rewardRisk: null };
    const htf = checkHigherTimeframeContext(inputs);
    c.checks.push(htf);
    if (!htf.passed) reject(c, PIPELINE_STAGES.SCANNER, htf.detail);
    candidates.push(c);
  }

  return candidates;
}

function base(
  symbol: string,
  setupKey: PipelineCandidate["setupKey"],
  assetClass: PipelineCandidate["assetClass"],
  direction: PipelineCandidate["direction"],
  snapshot: PipelineCandidate["snapshot"],
  market: PipelineCandidate["market"]
): PipelineCandidate {
  return {
    symbol,
    setupKey,
    assetClass,
    direction,
    status: "SCANNED",
    checks: [],
    snapshot,
    market,
    catalystAgeHours: null,
    catalystHeadline: null,
    catalystSummary: null,
    catalystPublishedAt: null,
    materialityConfidence: null,
    materialityReasoning: null,
    flowConfirmed: false,
    economicReleaseInMinutes: null,
  };
}
