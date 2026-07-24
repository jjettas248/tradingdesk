-- CreateTable
CREATE TABLE "PlaybookSetup" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "thresholds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybookSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingDay" (
    "id" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "sendStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "riskMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "haltActiveAtScan" BOOLEAN NOT NULL DEFAULT false,
    "ticketsArmed" INTEGER NOT NULL DEFAULT 0,
    "entriesLogged" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "entryLow" DOUBLE PRECISION NOT NULL,
    "entryHigh" DOUBLE PRECISION NOT NULL,
    "triggerCondition" TEXT NOT NULL,
    "stopPrice" DOUBLE PRECISION NOT NULL,
    "target1Price" DOUBLE PRECISION NOT NULL,
    "target2Price" DOUBLE PRECISION NOT NULL,
    "maxEntryPrice" DOUBLE PRECISION NOT NULL,
    "positionSize" DOUBLE PRECISION NOT NULL,
    "sizeUnit" TEXT NOT NULL,
    "maxDollarLoss" DOUBLE PRECISION NOT NULL,
    "runnerPlan" TEXT NOT NULL,
    "orderTypeNote" TEXT NOT NULL DEFAULT 'Limit entry + protective bracket (stop + targets)',
    "alertExpiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "telegramChatId" TEXT,
    "telegramMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Explanation" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "evidenceSnapshot" JSONB NOT NULL,
    "sections" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revealedAt" TIMESTAMP(3),

    CONSTRAINT "Explanation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "decisionType" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traderStageAtDecision" TEXT NOT NULL,
    "rawCallbackData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "shortCode" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "setupKey" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "plannedEntryLow" DOUBLE PRECISION NOT NULL,
    "plannedEntryHigh" DOUBLE PRECISION NOT NULL,
    "actualEntryPrice" DOUBLE PRECISION,
    "actualEntryAt" TIMESTAMP(3),
    "positionSize" DOUBLE PRECISION NOT NULL,
    "sizeUnit" TEXT NOT NULL,
    "stopPrice" DOUBLE PRECISION NOT NULL,
    "target1Price" DOUBLE PRECISION NOT NULL,
    "target2Price" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_FILL',
    "lastExceptionType" TEXT,
    "lastExceptionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exit" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "portionPercent" DOUBLE PRECISION NOT NULL,
    "exitPrice" DOUBLE PRECISION NOT NULL,
    "exitAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitReason" TEXT NOT NULL,
    "exitNote" TEXT,
    "maxFavorableExcursion" DOUBLE PRECISION,
    "maxAdverseExcursion" DOUBLE PRECISION,
    "realizedPnl" DOUBLE PRECISION,
    "realizedR" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostTradeReview" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "PostTradeReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreSnapshot" (
    "id" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "positionId" TEXT,
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" DOUBLE PRECISION NOT NULL,
    "components" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquitySnapshot" (
    "id" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equityValue" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskHaltState" (
    "id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggerDrawdownPercent" DOUBLE PRECISION NOT NULL,
    "triggerNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskHaltState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketEvent" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "headline" TEXT,
    "summary" TEXT,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCursor" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmCallLog" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeskConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "telegramChatId" TEXT,
    "currentStage" TEXT NOT NULL DEFAULT 'FOLLOW_AND_STUDY',
    "stageStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextShortCode" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeskConfig_pkey" PRIMARY KEY ("id")
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

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_tradingDayId_fkey" FOREIGN KEY ("tradingDayId") REFERENCES "TradingDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_setupKey_fkey" FOREIGN KEY ("setupKey") REFERENCES "PlaybookSetup"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Explanation" ADD CONSTRAINT "Explanation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exit" ADD CONSTRAINT "Exit_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTradeReview" ADD CONSTRAINT "PostTradeReview_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
