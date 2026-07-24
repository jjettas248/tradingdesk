import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function ScoresPage() {
  const snaps = await prisma.scoreSnapshot.findMany({ orderBy: { asOf: "desc" }, take: 60 });
  const latest = (track: string) => snaps.find((s) => s.track === track);
  const trading = latest("TRADING_RESULTS");
  const dev = latest("TRADER_DEVELOPMENT");

  return (
    <>
      <h1>Scores</h1>
      <p className="muted">Two separate tracks: trade quality vs. your development as a trader.</p>

      <div className="panel">
        <strong>Trading results</strong>: {trading ? trading.score.toFixed(1) : "—"} / 100
        <br />
        <strong>Trader development</strong>: {dev ? dev.score.toFixed(1) : "—"} / 100
        <br />
        <span className="muted">
          Development counts patience, sizing discipline, and rule adherence — a controlled loss on a valid, well-managed
          setup still scores well.
        </span>
      </div>

      <h2>History</h2>
      {snaps.length === 0 ? (
        <p className="muted">No scores yet — they populate as trades close and reviews run.</p>
      ) : (
        <div className="panel tablewrap">
          <table>
            <thead>
              <tr>
                <th>As of</th>
                <th>Track</th>
                <th>Score</th>
                <th>Components</th>
              </tr>
            </thead>
            <tbody>
              {snaps.map((s) => (
                <tr key={s.id}>
                  <td className="muted">{s.asOf.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td>{s.track === "TRADING_RESULTS" ? "Results" : "Development"}</td>
                  <td>{s.score.toFixed(1)}</td>
                  <td className="muted">{JSON.stringify(s.components)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
