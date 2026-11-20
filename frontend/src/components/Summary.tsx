import { LEVEL_COUNT, STATUS_LABEL, formatDateTime, reachedLevel, type LevelResult } from '../results';

interface Props {
  levels: LevelResult[];
  updatedAt: string | null;
}

export default function Summary({ levels, updatedAt }: Props) {
  const reached = reachedLevel(levels);
  return (
    <section className="summary" aria-label="Zusammenfassung">
      <div className="summary-main">
        <div className="summary-label">Erreichtes Level</div>
        <div className="summary-value" data-testid="summary-reached">
          {reached} <span className="summary-total">/ {LEVEL_COUNT}</span>
        </div>
      </div>
      <div className="summary-side">
        <div
          className="progress"
          data-testid="summary-progress"
          role="img"
          aria-label={`${reached} von ${LEVEL_COUNT} Levels erreicht`}
        >
          {levels.map((l) => (
            <span
              key={l.level}
              className={`progress-seg status-${l.status}`}
              title={`Level ${l.level}: ${STATUS_LABEL[l.status]}`}
            />
          ))}
        </div>
        <div className="summary-updated">
          Zuletzt aktualisiert: <span data-testid="summary-updated">{formatDateTime(updatedAt)}</span>
        </div>
      </div>
    </section>
  );
}
