import {
  LEVEL_COUNT,
  LEVEL_TITLES,
  STATUS_LABEL,
  formatDateTime,
  formatDecimal,
  formatThousands,
  imagesOf,
  loadtestOf,
  pipelineOf,
  reachedLevel,
  tokenSum,
  type LevelResult,
} from '../results';

function Fact({ label, testid, children }: { label: string; testid: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-testid={testid}>{children}</dd>
    </div>
  );
}

function Missing({ part }: { part: string }) {
  return (
    <p className="report-missing" data-testid={`report-${part}-missing`}>
      noch nicht erreicht
    </p>
  );
}

const JOBS = ['check', 'images', 'deploy'] as const;

/**
 * Abschlussbericht: immer sichtbar, sobald ein Level geprüft ist. Er setzt sich aus den Levels zusammen
 * (Tokens aus jedem Level, Pipeline aus Level 6, Images aus Level 7, Lasttest aus Level 9).
 */
export default function Report({ levels, commit, updatedAt }: { levels: LevelResult[]; commit: string | null; updatedAt: string | null }) {
  const checked = levels.some((l) => l.checkedAt !== null);
  const reached = reachedLevel(levels);
  const complete = levels[LEVEL_COUNT - 1]?.status === 'bestanden';
  const tokens = tokenSum(levels);
  const pipeline = pipelineOf(levels);
  const images = imagesOf(levels);
  const loadtest = loadtestOf(levels);

  return (
    <section
      className="report"
      aria-label="Abschlussbericht"
      data-testid="report"
      data-state={checked ? 'ready' : 'empty'}
      data-complete={complete ? 'true' : 'false'}
    >
      <h2 className="report-title">Abschlussbericht</h2>
      {!checked ? (
        <p className="report-empty" data-testid="report-empty">
          Noch kein Abschlussbericht – er erscheint, sobald das erste Level geprüft ist.
        </p>
      ) : (
        <>
          <div className="report-tiles">
            <div className="report-tile">
              <h3>Ergebnis</h3>
              <dl>
                <Fact label="Erreicht" testid="report-reached">{reached} / {LEVEL_COUNT}</Fact>
                <Fact label="Score" testid="report-score">{reached * 10} / 100</Fact>
                <Fact label="Vollständig" testid="report-complete">{complete ? 'ja' : 'nein'}</Fact>
                <Fact label="Commit" testid="report-commit">{commit ? commit.slice(0, 7) : '–'}</Fact>
                <Fact label="Stand" testid="report-time">{formatDateTime(updatedAt)}</Fact>
              </dl>
            </div>
            <div className="report-tile">
              <h3>Tokens</h3>
              {!tokens ? (
                <Missing part="tokens" />
              ) : (
                <dl>
                  <Fact label="Modell" testid="report-model">{tokens.models.join(', ') || '–'}</Fact>
                  <Fact label="Antworten" testid="report-responses">{formatThousands(tokens.responses)}</Fact>
                  <Fact label="Eingabe" testid="report-tokens-input">{formatThousands(tokens.input)}</Fact>
                  <Fact label="Cache schreiben" testid="report-tokens-cache-write">{formatThousands(tokens.cacheWrite5m + tokens.cacheWrite1h)}</Fact>
                  <Fact label="Cache lesen" testid="report-tokens-cache-read">{formatThousands(tokens.cacheRead)}</Fact>
                  <Fact label="Ausgabe" testid="report-tokens-output">{formatThousands(tokens.output)}</Fact>
                  <Fact label="Gesamt" testid="report-tokens-total">{formatThousands(tokens.total)}</Fact>
                  <Fact label="Kosten (API-Preis)" testid="report-cost">{formatDecimal(tokens.costUsd, 2)} USD</Fact>
                </dl>
              )}
            </div>
            <div className="report-tile">
              <h3>Lasttest</h3>
              {!loadtest ? (
                <Missing part="loadtest" />
              ) : (
                <dl>
                  <Fact label="p50" testid="report-p50">{loadtest.p50Ms} ms</Fact>
                  <Fact label="p95" testid="report-p95">{loadtest.p95Ms} ms</Fact>
                  <Fact label="Durchsatz" testid="report-rps">{formatDecimal(loadtest.rps)} Anfragen/s</Fact>
                  <Fact label="Fehler" testid="report-errors">{loadtest.errors}</Fact>
                </dl>
              )}
            </div>
            <div className="report-tile">
              <h3>Images</h3>
              {!images ? (
                <Missing part="images" />
              ) : (
                <dl>
                  <Fact label="Frontend" testid="report-image-frontend">{formatDecimal(images.frontendMB)} MB</Fact>
                  <Fact label="Backend" testid="report-image-backend">{formatDecimal(images.backendMB)} MB</Fact>
                </dl>
              )}
            </div>
            <div className="report-tile">
              <h3>Pipeline</h3>
              {!pipeline ? (
                <Missing part="pipeline" />
              ) : (
                <>
                  <dl>
                    {JOBS.map((job) => (
                      <Fact key={job} label={job} testid={`report-job-${job}`}>
                        {pipeline.jobs[job] !== undefined ? `${pipeline.jobs[job]} s` : '–'}
                      </Fact>
                    ))}
                    <Fact label="Gesamt" testid="report-pipeline-total">{pipeline.totalS} s</Fact>
                  </dl>
                  <a className="report-link" data-testid="report-pipeline-link" href={pipeline.url} target="_blank" rel="noreferrer">
                    Lauf ansehen
                  </a>
                </>
              )}
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
