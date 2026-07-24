-- CreateTable
CREATE TABLE "PlaybookSetup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "thresholds" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TradingDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dateKey" TEXT NOT NULL,
    "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "sendStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "riskMultiplier" REAL NOT NULL DEFAULT 1,
    "haltActiveAtScan" BOOLEAN NOT NULL DEFAULT false,
    "ticketsArmed" INTEGER NOT NULL DEFAULT 0,
    "entriesLogged" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradingDayId" TEXT NOT NULL,
    "setupKey" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'LONG',
    "status" TEXT NOT NULL DEFAULT 'SCANNED',
    "rejectedAtStage" TEXT,
    "rejectionReason" TEXT,
    "evidence" JSONB NOT NULL,
    "playbookVersion" INTEGER NOT NULL DEFAULT 1,
    "rank" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Candidate_tradingDayId_fkey" FOREIGN KEY ("tradingDayId") REFERENCES "TradingDay" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Candidate_setupKey_fkey" FOREIGN KEY ("setupKey") REFERENCES "PlaybookSetup" ("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "entryLow" REAL NOT NULL,
    "entryHigh" REAL NOT NULL,
    "triggerCondition" TEXT NOT NULL,
    "stopPrice" REAL NOT NULL,
    "target1Price" REAL NOT NULL,
    "target2Price" REAL NOT NULL,
    "maxEntryPrice" REAL NOT NULL,
    "positionSize" REAL NOT NULL,
    "sizeUnit" TEXT NOT NULL,
    "maxDollarLoss" REAL NOT NULL,
    "runnerPlan" TEXT NOT NULL,
    "orderTypeNote" TEXT NOT NULL DEFAULT 'Limit entry + protective bracket (stop + targets)',
    "alertExpiresAt" DATETIME NOT NULL,
    "sentAt" DATETIME,
    "telegramChatId" TEXT,
    "telegramMessageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ticket_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Explanation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "evidenceSnapshot" JSONB NOT NULL,
    "sections" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revealedAt" DATETIME,
    CONSTRAINT "Explanation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "decisionType" TEXT NOT NULL,
    "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traderStageAtDecision" TEXT NOT NULL,
    "rawCallbackData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Decision_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "shortCode" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "setupKey" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "plannedEntryLow" REAL NOT NULL,
    "plannedEntryHigh" REAL NOT NULL,
    "actualEntryPrice" REAL,
    "actualEntryAt" DATETIME,
    "positionSize" REAL NOT NULL,
    "sizeUnit" TEXT NOT NULL,
    "stopPrice" REAL NOT NULL,
    "target1Price" REAL NOT NULL,
    "target2Price" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_FILL',
    "lastExceptionType" TEXT,
    "lastExceptionAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Position_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Exit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "portionPercent" REAL NOT NULL,
    "exitPrice" REAL NOT NULL,
    "exitAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitReason" TEXT NOT NULL,
    "exitNote" TEXT,
    "maxFavorableExcursion" REAL,
    "maxAdverseExcursion" REAL,
    "realizedPnl" REAL,
    "realizedR" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Exit_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PostTradeReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" DATETIME,
    CONSTRAINT "PostTradeReview_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScoreSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "track" TEXT NOT NULL,
    "positionId" TEXT,
    "asOf" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" REAL NOT NULL,
    "components" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EquitySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asOf" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equityValue" REAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RiskHaltState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "triggeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggerDrawdownPercent" REAL NOT NULL,
    "triggerNote" TEXT,
    "resolvedAt" DATETIME,
    "resolvedNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MarketEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "headline" TEXT,
    "summary" TEXT,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProviderCursor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LlmCallLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purpose" TEXT NOT NULL,
    "relatedCandidateId" TEXT,
    "relatedPositionId" TEXT,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "requestSummary" JSONB NOT NULL,
    "responseSummary" JSONB NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DeskConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "telegramChatId" TEXT,
    "currentStage" TEXT NOT NULL DEFAULT 'FOLLOW_AND_STUDY',
    "stageStartedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextShortCode" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaybookSetup_key_key" ON "PlaybookSetup"("key");

-- CreateIndex
CREATE UNIQUE INDEX "TradingDay_dateKey_key" ON "TradingDay"("dateKey");

-- CreateIndex
CREATE INDEX "TradingDay_dateKey_idx" ON "TradingDay"("dateKey");

-- CreateIndex
CREATE INDEX "Candidate_tradingDayId_status_idx" ON "Candidate"("tradingDayId", "status");

-- CreateIndex
CREATE INDEX "Candidate_status_idx" ON "Candidate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_candidateId_key" ON "Ticket"("candidateId");

-- CreateIndex
CREATE INDEX "Ticket_alertExpiresAt_idx" ON "Ticket"("alertExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Explanation_ticketId_key" ON "Explanation"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_ticketId_key" ON "Decision"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "Position_ticketId_key" ON "Position"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "Position_shortCode_key" ON "Position"("shortCode");

-- CreateIndex
CREATE INDEX "Position_status_idx" ON "Position"("status");

-- CreateIndex
CREATE INDEX "Exit_positionId_idx" ON "Exit"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "PostTradeReview_positionId_key" ON "PostTradeReview"("positionId");

-- CreateIndex
CREATE INDEX "ScoreSnapshot_track_asOf_idx" ON "ScoreSnapshot"("track", "asOf");

-- CreateIndex
CREATE INDEX "EquitySnapshot_asOf_idx" ON "EquitySnapshot"("asOf");

-- CreateIndex
CREATE INDEX "RiskHaltState_active_idx" ON "RiskHaltState"("active");

-- CreateIndex
CREATE INDEX "MarketEvent_symbol_occurredAt_idx" ON "MarketEvent"("symbol", "occurredAt");

-- CreateIndex
CREATE INDEX "MarketEvent_processed_idx" ON "MarketEvent"("processed");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCursor_symbol_key" ON "ProviderCursor"("symbol");

-- CreateIndex
CREATE INDEX "LlmCallLog_purpose_createdAt_idx" ON "LlmCallLog"("purpose", "createdAt");
