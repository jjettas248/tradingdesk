import { prisma } from "@/server/db/client";
import type { CandidateEvidence } from "@/server/pipeline/types";
import type { ExplanationSections, ReviewSections } from "@/server/llm/types";

export const dynamic = "force-dynamic";

export default async function CandidateDetail({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  const { candidateId } = await params;
  const c = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      tradingDay: true,
      setup: true,
      ticket: {
        include: {
          decision: true,
          explanation: true,
          position: { include: { exits: true, review: true } },
        },
      },
    },
  });

  if (!c) return <p>Candidate not found.</p>;

  const evidence = c.evidence as unknown as CandidateEvidence;
  const checks = evidence?.checks ?? [];
  const explanation = c.ticket?.explanation;
  const revealed = !!explanation?.revealedAt;
  const sections = explanation?.sections as unknown as ExplanationSections | undefined;
  const review = c.ticket?.position?.review;
  const reviewSections = review?.sections as unknown as ReviewSections | undefined;

  return (
    <>
      <h1>
        {c.symbol} {c.direction} — <span className={`badge ${c.status.toLowerCase()}`}>{c.status}</span>
      </h1>
      <p className="muted">
        {c.tradingDay.dateKey} · {c.setup.name}
        {c.rejectedAtStage ? ` · rejected at ${c.rejectedAtStage}: ${c.rejectionReason ?? ""}` : ""}
      </p>

      <h2>Evidence</h2>
      <div className="panel tablewrap">
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>Stage</th>
              <th>Result</th>
              <th>Detail</th>
              <th>Req</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((k) => (
              <tr key={k.key}>
                <td>{k.label}</td>
                <td className="muted">{k.stage}</td>
                <td className={k.passed ? "pos" : "neg"}>{k.passed ? "PASS" : "FAIL"}</td>
                <td className="muted">{k.detail}</td>
                <td className="muted">{k.required ? "•" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {c.ticket && (
        <>
          <h2>Ticket</h2>
          <div className="panel">
            Entry ${c.ticket.entryLow.toFixed(2)}–${c.ticket.entryHigh.toFixed(2)} · Stop ${c.ticket.stopPrice.toFixed(2)} ·
            T1 ${c.ticket.target1Price.toFixed(2)} · T2 ${c.ticket.target2Price.toFixed(2)} · Max entry ${c.ticket.maxEntryPrice.toFixed(2)}
            <br />
            Size {c.ticket.positionSize} {c.ticket.sizeUnit} · Max loss ${c.ticket.maxDollarLoss.toFixed(0)}
            <br />
            <span className="muted">{c.ticket.runnerPlan}</span>
            <br />
            Decision: {c.ticket.decision?.decisionType ?? "pending"}
          </div>
        </>
      )}

      <h2>Why this trade {revealed ? "" : "(sealed until you respond)"}</h2>
      <div className="panel">
        {!explanation && <span className="muted">No explanation (this candidate was never armed).</span>}
        {explanation && !revealed && (
          <span className="muted">
            🔒 Generated {explanation.createdAt.toISOString()} · hash {explanation.contentHash.slice(0, 12)}… · revealed only
            after you record a decision (proves the desk didn&apos;t write it with hindsight).
          </span>
        )}
        {explanation && revealed && sections && (
          <div>
            <p className="muted">
              Generated {explanation.createdAt.toISOString()} · revealed {explanation.revealedAt?.toISOString()} · hash{" "}
              {explanation.contentHash.slice(0, 12)}…
            </p>
            <strong>What the desk recognized</strong>
            <ul>{sections.evidenceChecklist.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <strong>Why this entry</strong>
            <p>{sections.whyThisEntry}</p>
            <strong>What would disprove it</strong>
            <ul>{sections.invalidation.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <strong>Pattern lesson</strong>
            <p>{sections.patternLesson}</p>
            <strong>Ask yourself next time</strong>
            <ul>{sections.reflectionPrompts.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}
      </div>

      {reviewSections && (
        <>
          <h2>Post-trade review</h2>
          <div className="panel">
            <strong>What happened</strong>
            <p>{reviewSections.whatHappened}</p>
            <strong>Thesis</strong>
            <p>{reviewSections.thesisAssessment}</p>
            <strong>Execution</strong>
            <p>{reviewSections.executionAssessment}</p>
            <strong>Exit</strong>
            <p>{reviewSections.exitAssessment}</p>
            <strong>Lesson</strong>
            <p>{reviewSections.patternLesson}</p>
          </div>
        </>
      )}
    </>
  );
}
