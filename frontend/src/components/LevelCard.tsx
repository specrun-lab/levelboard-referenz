import { LEVEL_TITLES, STATUS_LABEL, formatDateTime, formatDecimal, formatDuration, formatThousands, tokensOf, type LevelResult } from '../results';

export default function LevelCard({ result }: { result: LevelResult }) {
  const { level, status, checkedAt, durationMs, checks } = result;
  const passed = checks.filter((c) => c.ok).length;
  // Verbrauch der Phase (ab Spec 1.2.0): eigene Werte, „in L07“ bei gemeinsamer Phase, sonst „–“
  const use = tokensOf(result);
  const cost = !use ? '–' : 'inLevel' in use ? `in L${String(use.inLevel).padStart(2, '0')}` : `${formatDecimal(use.tokens.costUsd, 2)} USD`;
  const output = use && 'tokens' in use ? formatThousands(use.tokens.output) : '–';
  return (
    <article
      className={`card status-${status}`}
      data-testid="level-card"
      data-level={level}
      data-status={status}
    >
      <div className="card-head">
        <span className="card-number">L{String(level).padStart(2, '0')}</span>
        <span className="badge" data-testid="level-status">
          <span className="badge-dot" aria-hidden="true" />
          {STATUS_LABEL[status]}
        </span>
      </div>
      <h2 className="card-title" data-testid="level-title">
        {LEVEL_TITLES[level - 1]}
      </h2>
      <dl className="card-facts">
        <div>
          <dt>Geprüft</dt>
          <dd data-testid="level-checked-at">{formatDateTime(checkedAt)}</dd>
        </div>
        <div>
          <dt>Dauer</dt>
          <dd data-testid="level-duration">{formatDuration(durationMs)}</dd>
        </div>
        <div>
          <dt>Checks</dt>
          <dd data-testid="level-checks">{checks.length ? `${passed}/${checks.length}` : '–'}</dd>
        </div>
        <div>
          <dt>Kosten</dt>
          <dd data-testid="level-cost">{cost}</dd>
        </div>
        <div>
          <dt>Ausgabe</dt>
          <dd data-testid="level-output">{output}</dd>
        </div>
      </dl>
    </article>
  );
}
