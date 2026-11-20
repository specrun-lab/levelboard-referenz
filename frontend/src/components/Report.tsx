import { LEVEL_COUNT, LEVEL_TITLES, STATUS_LABEL, formatDateTime, formatDecimal, parseReport, reachedLevel, type LevelResult } from '../results';

function Fact({ label, testid, children }: { label: string; testid: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-testid={testid}>{children}</dd>
    </div>
  );
}

/** Abschlussbericht (ab Level 10): erscheint, sobald Level 10 mit vollständigen Kennzahlen gemeldet ist. */
export default function Report({ levels, commit }: { levels: LevelResult[]; commit: string | null }) {
  const l10 = levels[LEVEL_COUNT - 1];
  const report = l10 && (l10.status === 'bestanden' || l10.status === 'fehlgeschlagen') ? parseReport(l10.metrics) : null;
  const reached = reachedLevel(levels);

  return (
    <section className="report" aria-label="Abschlussbericht" data-testid="report" data-state={report ? 'ready' : 'empty'}>
      <h2 className="report-title">Abschlussbericht</h2>
      {!report ? (
        <p className="report-empty" data-testid="report-empty">
          Noch kein Abschlussbericht – er erscheint, sobald Level 10 gemeldet ist.
        </p>
      ) : (
        <>
          <div className="report-tiles">
            <div className="report-tile">
              <h3>Ergebnis</h3>
              <dl>
                <Fact label="Erreicht" testid="report-reached">{reached} / {LEVEL_COUNT}</Fact>
                <Fact label="Score" testid="report-score">{reached * 10} / 100</Fact>
                <Fact label="Commit" testid="report-commit">{commit ? commit.slice(0, 7) : '–'}</Fact>
                <Fact label="Erstellt" testid="report-time">{formatDateTime(l10.checkedAt)}</Fact>
              </dl>
            </div>
            <div className="report-tile">
              <h3>Lasttest</h3>
              <dl>
                <Fact label="p50" testid="report-p50">{report.loadtest.p50Ms} ms</Fact>
                <Fact label="p95" testid="report-p95">{report.loadtest.p95Ms} ms</Fact>
                <Fact label="Durchsatz" testid="report-rps">{formatDecimal(report.loadtest.rps)} Anfragen/s</Fact>
                <Fact label="Fehler" testid="report-errors">{report.loadtest.errors}</Fact>
              </dl>
            </div>
            <div className="report-tile">
              <h3>Images</h3>
              <dl>
                <Fact label="Frontend" testid="report-image-frontend">{formatDecimal(report.images.frontendMB)} MB</Fact>
                <Fact label="Backend" testid="report-image-backend">{formatDecimal(report.images.backendMB)} MB</Fact>
              </dl>
            </div>
            <div className="report-tile">
              <h3>Pipeline</h3>
              <dl>
                <Fact label="check" testid="report-job-check">{report.pipeline.jobs.check} s</Fact>
                <Fact label="images" testid="report-job-images">{report.pipeline.jobs.images} s</Fact>
                <Fact label="deploy" testid="report-job-deploy">{report.pipeline.jobs.deploy} s</Fact>
                <Fact label="Gesamt" testid="report-pipeline-total">{report.pipeline.totalS} s</Fact>
                <a className="report-link" data-testid="report-pipeline-link" href={report.pipeline.url} target="_blank" rel="noreferrer">
                  Lauf ansehen
                </a>
              </dl>
            </div>
          </div>
          <ol className="report-levels" data-testid="report-levels">
            {levels.map((l) => (
              <li key={l.level} className={`status-${l.status}`} data-testid="report-level" data-level={l.level} data-status={l.status}>
                <span className="report-level-name">
                  L{String(l.level).padStart(2, '0')} {LEVEL_TITLES[l.level - 1]}
                </span>
                <span className="report-level-status">{STATUS_LABEL[l.status]}</span>
                <span className="report-level-time">{formatDateTime(l.checkedAt)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
