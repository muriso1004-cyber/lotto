"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const ALL_NUMBERS = Array.from({ length: 45 }, (_, index) => index + 1);
const TICKETS_PER_WEEK = 100;
const TICKET_PRICE = 1_000;
const EXPECTED_WEEKS = 81_451;

type Phase = "selecting" | "running" | "complete";
type RankCounts = { 1: number; 2: number; 3: number; 4: number; 5: number };
type Draw = { winningNumbers: number[]; bonusNumber: number };

type Progress = {
  week: number;
  ticketsPurchased: number;
  cost: number;
  lastDraw: Draw;
  rankCounts: RankCounts;
};

type Statistics = {
  runs: number;
  mean: number;
  median: number;
  p10: number;
  p90: number;
  fastest: number;
  slowest: number;
  percentile: number;
};

type SimulationResult = {
  week: number;
  ticketsPurchased: number;
  cost: number;
  winningNumbers: number[];
  bonusNumber: number;
  manualWinner: boolean;
  autoFirstPrizeCount: number;
  rankCounts: RankCounts;
  statistics: Statistics;
};

type WorkerMessage =
  | ({ type: "progress"; runId: string } & Progress)
  | { type: "complete"; runId: string; result: SimulationResult }
  | { type: "error"; runId: string; message: string };

const numberFormatter = new Intl.NumberFormat("ko-KR");

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatWon(value: number) {
  return `${formatNumber(value)}원`;
}

function describeDuration(weeks: number) {
  if (weeks < 52) return `${formatNumber(weeks)}주`;
  const years = Math.floor(weeks / 52);
  const remainingWeeks = weeks % 52;
  return remainingWeeks
    ? `${formatNumber(years)}년 ${formatNumber(remainingWeeks)}주`
    : `${formatNumber(years)}년`;
}

function rangeClass(number: number) {
  if (number <= 10) return "yellow";
  if (number <= 20) return "blue";
  if (number <= 30) return "red";
  if (number <= 40) return "gray";
  return "green";
}

function randomPick() {
  const pool = [...ALL_NUMBERS];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, 6).sort((a, b) => a - b);
}

function LottoBall({ number, bonus = false }: { number: number; bonus?: boolean }) {
  return (
    <span className={`result-ball ${rangeClass(number)}${bonus ? " bonus" : ""}`}>
      {number}
    </span>
  );
}

export default function Home() {
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>("selecting");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const selectedSet = useMemo(() => new Set(selectedNumbers), [selectedNumbers]);

  useEffect(() => {
    return () => workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    if (result) {
      window.setTimeout(() => {
        resultHeadingRef.current?.focus({ preventScroll: true });
        resultHeadingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }, [result]);

  function getWorker() {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker("/simulation-worker.js", { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.runId !== activeRunIdRef.current) return;

      if (message.type === "progress") {
        setProgress({
          week: message.week,
          ticketsPurchased: message.ticketsPurchased,
          cost: message.cost,
          lastDraw: message.lastDraw,
          rankCounts: message.rankCounts,
        });
      }

      if (message.type === "complete") {
        setResult(message.result);
        setProgress(null);
        setPhase("complete");
        activeRunIdRef.current = null;
      }

      if (message.type === "error") {
        setError(message.message);
        setProgress(null);
        setPhase("selecting");
        activeRunIdRef.current = null;
      }
    };
    worker.onerror = () => {
      setError("계산을 이어갈 수 없습니다. 잠시 후 다시 시도해주세요.");
      setPhase("selecting");
      activeRunIdRef.current = null;
      worker.terminate();
      workerRef.current = null;
    };
    workerRef.current = worker;
    return worker;
  }

  function toggleNumber(number: number) {
    if (phase === "running") return;
    setError(null);
    setResult(null);
    setPhase("selecting");
    setSelectedNumbers((current) => {
      if (current.includes(number)) return current.filter((item) => item !== number);
      if (current.length >= 6) return current;
      return [...current, number].sort((a, b) => a - b);
    });
  }

  function chooseAutomatically() {
    if (phase === "running") return;
    setSelectedNumbers(randomPick());
    setResult(null);
    setError(null);
    setPhase("selecting");
  }

  function cancelRun(keepSelection = true) {
    const runId = activeRunIdRef.current;
    if (runId) workerRef.current?.postMessage({ type: "cancel", runId });
    workerRef.current?.terminate();
    workerRef.current = null;
    activeRunIdRef.current = null;
    setProgress(null);
    setResult(null);
    setError(null);
    setPhase("selecting");
    if (!keepSelection) setSelectedNumbers([]);
  }

  function startSimulation() {
    if (selectedNumbers.length !== 6 || phase === "running") return;
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeRunIdRef.current = runId;
    setError(null);
    setResult(null);
    setProgress({
      week: 0,
      ticketsPurchased: 0,
      cost: 0,
      lastDraw: { winningNumbers: [], bonusNumber: 0 },
      rankCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
    setPhase("running");
    getWorker().postMessage({
      type: "start",
      runId,
      manualNumbers: selectedNumbers,
    });
  }

  const currentWeek = progress?.week ?? 0;
  const sourceLabel = result
    ? result.manualWinner && result.autoFirstPrizeCount > 0
      ? `수동 1장과 자동 ${result.autoFirstPrizeCount}장이 동시에 당첨됐어요.`
      : result.manualWinner
        ? "직접 고른 수동번호가 1등에 당첨됐어요."
        : `자동번호 ${result.autoFirstPrizeCount}장이 1등에 당첨됐어요.`
    : "";

  return (
    <main className="site-shell">
      <nav className="topbar" aria-label="사이트 정보">
        <a className="brand" href="#top" aria-label="행운연구소 처음으로">
          <span aria-hidden="true">6/45</span>
          행운연구소
        </a>
        <p>오락용 확률 시뮬레이션</p>
      </nav>

      <header className="hero" id="top">
        <div className="hero-copy-block">
          <p className="eyebrow">LOTTO 6/45 · 확률 실험실</p>
          <h1>
            매주 100장,
            <br />언제 1등이 될까?
          </h1>
          <p className="hero-copy">
            나만의 번호 한 장과 새로운 자동번호 99장을 매주 산다면?
            첫 번째 1등이 찾아오는 순간까지 시간을 빠르게 달려보세요.
          </p>
        </div>
        <aside className="odds-card" aria-label="주당 1등 확률 안내">
          <span className="odds-label">주당 100장 기준</span>
          <strong>약 1 / 81,451</strong>
          <p>평균적으로 약 {describeDuration(EXPECTED_WEEKS)}에 한 번</p>
          <div className="odds-track"><span /></div>
          <small>한 장의 1등 확률은 1 / 8,145,060입니다.</small>
        </aside>
      </header>

      <section className="selector-card" aria-labelledby="number-heading">
        <div className="section-heading">
          <div>
            <span className="step-pill">STEP 01</span>
            <h2 id="number-heading">나의 번호 6개를 선택하세요</h2>
            <p>선택한 번호는 매주 한 장씩 똑같이 구매합니다.</p>
          </div>
          <strong className="pick-count" aria-live="polite">
            {selectedNumbers.length} <span>/ 6</span>
          </strong>
        </div>

        <div className="number-grid" aria-label="로또 번호 선택">
          {ALL_NUMBERS.map((number) => {
            const selected = selectedSet.has(number);
            return (
              <button
                className={`number-ball ${rangeClass(number)}${selected ? " selected" : ""}`}
                key={number}
                type="button"
                aria-pressed={selected}
                aria-label={`${number}번${selected ? " 선택됨" : ""}`}
                disabled={phase === "running"}
                onClick={() => toggleNumber(number)}
              >
                {number}
              </button>
            );
          })}
        </div>

        <div className="choice-bar">
          <div>
            <span className="choice-label">나의 고정번호</span>
            <div className="selected-preview" aria-label="선택한 번호">
              {Array.from({ length: 6 }, (_, index) => {
                const number = selectedNumbers[index];
                return number ? (
                  <LottoBall number={number} key={number} />
                ) : (
                  <span className="empty-ball" key={`empty-${index}`}>?</span>
                );
              })}
            </div>
          </div>
          <div className="actions">
            <button
              className="text-button"
              type="button"
              disabled={phase === "running" || selectedNumbers.length === 0}
              onClick={() => cancelRun(false)}
            >
              초기화
            </button>
            <button
              className="ghost-button"
              type="button"
              disabled={phase === "running"}
              onClick={chooseAutomatically}
            >
              번호 자동 선택
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={selectedNumbers.length !== 6 || phase === "running"}
              onClick={startSimulation}
            >
              <span aria-hidden="true">▶</span> 시뮬레이션 시작
            </button>
          </div>
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>

      <section className="rules-strip" aria-label="시뮬레이션 조건">
        <div><span>매주 구매</span><strong>{TICKETS_PER_WEEK}장</strong></div>
        <div><span>구매 구성</span><strong>수동 1 + 자동 99</strong></div>
        <div><span>주간 구매액</span><strong>{formatWon(TICKETS_PER_WEEK * TICKET_PRICE)}</strong></div>
      </section>

      {phase === "running" && progress && (
        <section className="running-card" aria-labelledby="running-heading" aria-live="polite">
          <div className="running-visual" aria-hidden="true">
            <div className="orbit"><span>1</span><span>7</span><span>45</span></div>
            <div className="running-core">추첨중</div>
          </div>
          <div className="running-content">
            <span className="step-pill">STEP 02 · 시간을 달리는 중</span>
            <h2 id="running-heading">아직 1등을 기다리고 있어요</h2>
            <p className="running-week">현재 <strong>{formatNumber(currentWeek)}주차</strong> · {describeDuration(currentWeek)}</p>
            <div className="progress-track"><span /></div>
            <div className="live-metrics">
              <div><span>구매한 복권</span><strong>{formatNumber(progress.ticketsPurchased)}장</strong></div>
              <div><span>누적 구매액</span><strong>{formatWon(progress.cost)}</strong></div>
              <div><span>5등 이상</span><strong>{formatNumber(progress.rankCounts[2] + progress.rankCounts[3] + progress.rankCounts[4] + progress.rankCounts[5])}번</strong></div>
            </div>
            {progress.lastDraw.winningNumbers.length > 0 && (
              <div className="latest-draw">
                <span>최근 추첨</span>
                <div>
                  {progress.lastDraw.winningNumbers.map((number) => <LottoBall number={number} key={number} />)}
                  <i aria-hidden="true">+</i>
                  <LottoBall number={progress.lastDraw.bonusNumber} bonus />
                </div>
              </div>
            )}
            <button className="cancel-button" type="button" onClick={() => cancelRun(true)}>
              시뮬레이션 중단
            </button>
          </div>
        </section>
      )}

      {phase === "complete" && result && (
        <section className="result-section" aria-labelledby="result-heading">
          <div className="result-hero">
            <span className="burst burst-one" aria-hidden="true" />
            <span className="burst burst-two" aria-hidden="true" />
            <p className="result-kicker">JACKPOT · 드디어 찾았습니다</p>
            <h2 id="result-heading" ref={resultHeadingRef} tabIndex={-1}>1등 당첨!</h2>
            <p className="result-lead">
              <strong>{formatNumber(result.week)}주</strong> 만에 찾아온 행운이에요.
              <br />시간으로는 약 {describeDuration(result.week)}입니다.
            </p>
            <div className="winning-numbers" aria-label="1등 당첨번호">
              {result.winningNumbers.map((number) => <LottoBall number={number} key={number} />)}
              <i aria-hidden="true">+</i>
              <LottoBall number={result.bonusNumber} bonus />
            </div>
            <p className="winner-source">★ {sourceLabel}</p>
          </div>

          <div className="result-metrics">
            <div><span>당첨까지 걸린 기간</span><strong>{describeDuration(result.week)}</strong><small>{formatNumber(result.week)}주</small></div>
            <div><span>총 구매한 복권</span><strong>{formatNumber(result.ticketsPurchased)}장</strong><small>매주 100장</small></div>
            <div><span>총 구매 비용</span><strong>{formatWon(result.cost)}</strong><small>당첨금은 계산에서 제외</small></div>
          </div>

          <div className="result-grid">
            <article className="rank-card">
              <div className="card-heading">
                <div><span className="step-pill">그동안의 작은 행운</span><h3>등수별 당첨 기록</h3></div>
                <span className="receipt-icon" aria-hidden="true">#</span>
              </div>
              <div className="rank-list">
                {([2, 3, 4, 5] as const).map((rank) => (
                  <div key={rank}>
                    <span><i className={`rank-dot rank-${rank}`} />{rank}등</span>
                    <strong>{formatNumber(result.rankCounts[rank])}회</strong>
                  </div>
                ))}
              </div>
              <p>등수별 당첨금은 회차에 따라 달라 비용 계산에 포함하지 않았습니다.</p>
            </article>

            <article className="stats-card">
              <div className="card-heading">
                <div><span className="step-pill">1,000번 비교 실험</span><h3>내 행운은 어느 정도?</h3></div>
                <strong className="percentile-badge">{result.statistics.percentile}%</strong>
              </div>
              <p className="comparison-copy">
                이번 결과는 1,000번의 실험 중 <strong>{result.statistics.percentile}%보다 오래</strong> 기다린 결과입니다.
              </p>
              <div className="stat-scale">
                <span style={{ left: `${Math.max(3, Math.min(97, result.statistics.percentile))}%` }}>
                  나의 결과
                </span>
              </div>
              <div className="stat-values">
                <div><span>빠른 10%</span><strong>{describeDuration(result.statistics.p10)}</strong></div>
                <div><span>중앙값</span><strong>{describeDuration(result.statistics.median)}</strong></div>
                <div><span>평균</span><strong>{describeDuration(result.statistics.mean)}</strong></div>
                <div><span>느린 10%</span><strong>{describeDuration(result.statistics.p90)}</strong></div>
              </div>
            </article>
          </div>

          <div className="result-actions">
            <button className="primary-button" type="button" onClick={startSimulation}>같은 번호로 다시 돌리기</button>
            <button className="ghost-button" type="button" onClick={() => cancelRun(false)}>새 번호 선택하기</button>
          </div>
        </section>
      )}

      <footer>
        <p>이 결과는 무작위 확률 실험이며 실제 당첨을 예측하거나 보장하지 않습니다.</p>
        <a href="#top">처음으로 ↑</a>
      </footer>
    </main>
  );
}
