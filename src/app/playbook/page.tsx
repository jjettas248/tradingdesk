import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function PlaybookPage() {
  const setups = await prisma.playbookSetup.findMany({ orderBy: { key: "asc" } });

  return (
    <>
      <h1>Playbook</h1>
      <p className="muted">
        The desk trades only these documented setups. Everything else is research. Thresholds are tunable per setup.
      </p>
      {setups.map((s) => (
        <div className="panel" key={s.id}>
          <h2 style={{ marginTop: 0 }}>
            {s.name} <span className="muted">· v{s.version} · {s.active ? "active" : "inactive"} · {s.assetClass}</span>
          </h2>
          <pre className="md">{s.description}</pre>
          <details>
            <summary className="muted">Thresholds</summary>
            <pre className="md">{JSON.stringify(s.thresholds, null, 2)}</pre>
          </details>
        </div>
      ))}
    </>
  );
}
