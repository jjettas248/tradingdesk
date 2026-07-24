import { PrismaClient } from "@prisma/client";
import { SETUP_KEYS } from "../src/server/config/constants.ts";
import {
  DEFAULT_SETUP1_THRESHOLDS,
  DEFAULT_SETUP2_THRESHOLDS,
} from "../src/server/pipeline/setups/thresholds.ts";

const prisma = new PrismaClient();

const SETUP1_DESCRIPTION = `## Setup 1 — Catalyst Continuation Pullback

A liquid stock with a genuinely material catalyst and abnormal participation.
Entry is on the **first controlled pullback or reclaim**, never the initial
emotional move.

**Requirements**
- Fresh, material catalyst (freshness is checked deterministically; materiality is the one LLM judgment)
- Significant gap or directional move
- Abnormal relative volume (real participation, not a thin gap)
- Sector confirmation (the name's sector is moving with it)
- Price holds or reclaims a meaningful reference level (anchored VWAP)
- First pullback stays structurally controlled (shallow retrace of the impulse)
- Reward/risk remains favorable after confirmation

**Why wait for the pullback:** the first move is extended; waiting establishes a
closer invalidation and avoids chasing.`;

const SETUP2_DESCRIPTION = `## Setup 2 — Index Trend Pullback

MES or MNQ establishes a directional morning structure supported by broader
evidence. Micro futures, small risk.

**Requirements**
- Clear higher-timeframe context
- Breadth supporting the direction
- Related markets confirming
- Opening structure established
- Pullback into VWAP / prior breakout level / volume-supported zone
- Confirmation before entry
- No imminent major economic release`;

async function main() {
  console.log("Seeding Apex Morning Trading Desk…");

  await prisma.playbookSetup.upsert({
    where: { key: SETUP_KEYS.CATALYST_CONTINUATION },
    update: {},
    create: {
      key: SETUP_KEYS.CATALYST_CONTINUATION,
      name: "Catalyst Continuation Pullback",
      description: SETUP1_DESCRIPTION,
      assetClass: "EQUITY",
      version: 1,
      active: true,
      thresholds: DEFAULT_SETUP1_THRESHOLDS as unknown as object,
    },
  });

  await prisma.playbookSetup.upsert({
    where: { key: SETUP_KEYS.INDEX_TREND_PULLBACK },
    update: {},
    create: {
      key: SETUP_KEYS.INDEX_TREND_PULLBACK,
      name: "Index Trend Pullback",
      description: SETUP2_DESCRIPTION,
      assetClass: "INDEX_FUTURE",
      version: 1,
      active: true,
      thresholds: DEFAULT_SETUP2_THRESHOLDS as unknown as object,
    },
  });

  await prisma.deskConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      currentStage: "FOLLOW_AND_STUDY",
      nextShortCode: 1,
    },
  });

  const startingEquity = Number(process.env.STARTING_EQUITY ?? 10000);
  const existingEquity = await prisma.equitySnapshot.count();
  if (existingEquity === 0) {
    await prisma.equitySnapshot.create({
      data: {
        equityValue: startingEquity,
        source: "MANUAL",
        note: "Initial account equity (seed).",
      },
    });
  }

  console.log(`Seeded 2 setups, DeskConfig, and starting equity $${startingEquity}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
