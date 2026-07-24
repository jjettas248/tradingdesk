import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const candidates = await prisma.candidate.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { tradingDay: true, ticket: { include: { decision: true } } },
  });

  return (
    <>
      <h1>Decision Journal</h1>
      <p className="muted">Every candidate the desk evaluated — armed or passed over — most recent first.</p>
      <div className="panel tablewrap">
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>Symbol</th>
              <th>Setup</th>
              <th>Status</th>
              <th>Rejected at</th>
              <th>Decision</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.id}>
                <td>{c.tradingDay.dateKey}</td>
                <td>{c.symbol} {c.direction}</td>
                <td className="muted">{c.setupKey === "SETUP_1_CATALYST_CONTINUATION" ? "Catalyst" : "Index Trend"}</td>
                <td><span className={`badge ${c.status.toLowerCase()}`}>{c.status}</span></td>
                <td className="muted">{c.rejectedAtStage ?? "—"}</td>
                <td>{c.ticket?.decision?.decisionType ?? "—"}</td>
                <td><a href={`/journal/${c.id}`}>view</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
