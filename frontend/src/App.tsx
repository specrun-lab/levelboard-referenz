import { useEffect, useState } from 'react';
import { POLL_MS, emptyResults, loadFromApi, loadResults, loadSource, type LoadState, type Source } from './results';
import Header from './components/Header';
import Summary from './components/Summary';
import Notice from './components/Notice';
import LevelCard from './components/LevelCard';

export default function App() {
  const [source, setSource] = useState<Source | null>(null);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // API-Modus: sofort laden, danach alle POLL_MS erneut (nächster Abruf erst nach Ende des vorigen)
    const poll = async () => {
      const s = await loadFromApi();
      if (!active) return;
      setState(s);
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
      </main>
    </div>
  );
}
