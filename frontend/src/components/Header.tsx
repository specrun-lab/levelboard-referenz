import type { RunInfo, Source } from '../results';

const SOURCE_LABEL: Record<Source, string> = { file: 'Datei', api: 'Backend' };

export default function Header({ run, source }: { run: RunInfo; source: Source | null }) {
  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          ▮▮▮
        </span>
        <span className="brand-name">Levelboard</span>
      </div>
      <dl className="run-meta">
        <div>
          <dt>Durchlauf</dt>
          <dd data-testid="run-id">{run.id}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd data-testid="run-version">{run.version}</dd>
        </div>
        <div className="run-source">
          <dt>Quelle</dt>
          <dd data-testid="run-source" data-source={source ?? ''}>
            {source ? SOURCE_LABEL[source] : '–'}
          </dd>
        </div>
      </dl>
    </header>
  );
}
