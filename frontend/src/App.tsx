import { useEffect, useState } from 'react';
import { POLL_MS, emptyResults, loadFromApi, loadResults, loadSource, loadUsage, type LoadState, type Source, type Usage } from './results';
import Header from './components/Header';
import Summary from './components/Summary';
import Notice from './components/Notice';
import LevelCard from './components/LevelCard';
import Report from './components/Report';

export default function App() {
  const [source, setSource] = useState<Source | null>(null);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // API-Modus: sofort laden, danach alle POLL_MS erneut (nächster Abruf erst nach Ende des vorigen).
    // Der Verbrauch (/api/usage) kommt mit, fehlt er, bleibt der Bericht ohne Kosten.
    const poll = async () => {
      const [s, u] = await Promise.all([loadFromApi(), loadUsage()]);
      if (!active) return;
      setState(s);
      setUsage(u);
      timer = setTimeout(poll, POLL_MS);
    };

    loadSource().then((src) => {
      if (!active) return;
      setSource(src);
      if (src === 'api') poll();
      else loadResults().then((s) => active && setState(s));
    });

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const results = state.kind === 'ok' ? state.results : emptyResults();
  const notice = state.kind === 'missing' || state.kind === 'invalid' || state.kind === 'unavailable' ? state.kind : null;

  return (
    <div className="app" data-testid="board" data-state={state.kind}>
      <Header run={results.run} source={source} />
      <main className="main">
        {notice && <Notice kind={notice} />}
        <Summary levels={results.levels} updatedAt={results.run.updatedAt} />
        <section className="grid" aria-label="Levels">
          {results.levels.map((l) => (
            <LevelCard key={l.level} result={l} />
          ))}
        </section>
        <Report levels={results.levels} commit={results.run.commit} updatedAt={results.run.updatedAt} usage={source === 'api' ? usage : null} />
      </main>
    </div>
  );
}
