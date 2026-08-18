export const LOTTO_NUMBER_COUNT = 45;
export const NUMBERS_PER_TICKET = 6;
export const TICKETS_PER_WEEK = 100;
export const AUTO_TICKETS_PER_WEEK = 99;
export const TICKET_PRICE = 1_000;
export const TOTAL_COMBINATIONS = 8_145_060;
export const WEEKLY_JACKPOT_PROBABILITY =
  1 - Math.pow(1 - 1 / TOTAL_COMBINATIONS, TICKETS_PER_WEEK);

let activeRunId = null;

export function validateManualNumbers(numbers) {
  return (
    Array.isArray(numbers) &&
    numbers.length === NUMBERS_PER_TICKET &&
    new Set(numbers).size === NUMBERS_PER_TICKET &&
    numbers.every(
      (number) =>
        Number.isInteger(number) && number >= 1 && number <= LOTTO_NUMBER_COUNT,
    )
  );
}

function createRawCombination(count = NUMBERS_PER_TICKET, random = Math.random) {
  const picked = [];
  while (picked.length < count) {
    const candidate = 1 + Math.floor(random() * LOTTO_NUMBER_COUNT);
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  return picked;
}

export function createCombination(
  count = NUMBERS_PER_TICKET,
  random = Math.random,
) {
  return createRawCombination(count, random).sort((a, b) => a - b);
}

export function createDraw(random = Math.random) {
  const balls = createRawCombination(NUMBERS_PER_TICKET + 1, random);
  return {
    winningNumbers: balls.slice(0, NUMBERS_PER_TICKET).sort((a, b) => a - b),
    bonusNumber: balls[NUMBERS_PER_TICKET],
  };
}

export function rankTicket(ticket, winningNumbers, bonusNumber) {
  const winningSet = new Set(winningNumbers);
  let matches = 0;

  for (const number of ticket) {
    if (winningSet.has(number)) matches += 1;
  }

  if (matches === 6) return 1;
  if (matches === 5 && ticket.includes(bonusNumber)) return 2;
  if (matches === 5) return 3;
  if (matches === 4) return 4;
  if (matches === 3) return 5;
  return 0;
}

export function evaluateTickets(tickets, winningNumbers, bonusNumber) {
  const rankCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const ticket of tickets) {
    const rank = rankTicket(ticket, winningNumbers, bonusNumber);
    if (rank > 0) rankCounts[rank] += 1;
  }
  return rankCounts;
}

export function sampleGeometric(
  probability = WEEKLY_JACKPOT_PROBABILITY,
  random = Math.random,
) {
  const sample = Math.min(1 - Number.EPSILON, Math.max(0, random()));
  return Math.floor(Math.log1p(-sample) / Math.log1p(-probability)) + 1;
}

export function summarizeWaitingTimes(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const valueAt = (fraction) =>
    sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
  const total = sorted.reduce((sum, value) => sum + value, 0);

  return {
    runs: sorted.length,
    mean: Math.round(total / sorted.length),
    median: valueAt(0.5),
    p10: valueAt(0.1),
    p90: valueAt(0.9),
    fastest: sorted[0],
    slowest: sorted[sorted.length - 1],
  };
}

function createComparisonStatistics(currentWeek, random = Math.random) {
  const samples = Array.from({ length: 1_000 }, () =>
    sampleGeometric(WEEKLY_JACKPOT_PROBABILITY, random),
  );
  const summary = summarizeWaitingTimes(samples);
  const fasterOrEqual = samples.filter((week) => week <= currentWeek).length;
  return {
    ...summary,
    percentile: Math.round((fasterOrEqual / samples.length) * 100),
  };
}

function postProgress(runId, week, lastDraw, rankCounts) {
  globalThis.postMessage({
    type: "progress",
    runId,
    week,
    ticketsPurchased: week * TICKETS_PER_WEEK,
    cost: week * TICKETS_PER_WEEK * TICKET_PRICE,
    lastDraw,
    rankCounts: { ...rankCounts },
  });
}

async function runSimulation(runId, manualNumbers) {
  if (!validateManualNumbers(manualNumbers)) {
    globalThis.postMessage({
      type: "error",
      runId,
      message: "1부터 45까지의 서로 다른 번호 6개가 필요합니다.",
    });
    return;
  }

  const fixedTicket = [...manualNumbers].sort((a, b) => a - b);
  const rankCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let week = 0;
  const batchSize = 400;

  while (activeRunId === runId) {
    let latestDraw = null;
    for (let batch = 0; batch < batchSize && activeRunId === runId; batch += 1) {
      week += 1;
      const draw = createDraw();
      latestDraw = draw;
      const manualRank = rankTicket(
        fixedTicket,
        draw.winningNumbers,
        draw.bonusNumber,
      );
      if (manualRank > 0) rankCounts[manualRank] += 1;

      let autoFirstPrizeCount = 0;
      for (let ticketIndex = 0; ticketIndex < AUTO_TICKETS_PER_WEEK; ticketIndex += 1) {
        const autoTicket = createRawCombination();
        const rank = rankTicket(
          autoTicket,
          draw.winningNumbers,
          draw.bonusNumber,
        );
        if (rank > 0) rankCounts[rank] += 1;
        if (rank === 1) autoFirstPrizeCount += 1;
      }

      if (manualRank === 1 || autoFirstPrizeCount > 0) {
        const statistics = createComparisonStatistics(week);
        globalThis.postMessage({
          type: "complete",
          runId,
          result: {
            week,
            ticketsPurchased: week * TICKETS_PER_WEEK,
            cost: week * TICKETS_PER_WEEK * TICKET_PRICE,
            winningNumbers: draw.winningNumbers,
            bonusNumber: draw.bonusNumber,
            manualWinner: manualRank === 1,
            autoFirstPrizeCount,
            rankCounts: { ...rankCounts },
            statistics,
          },
        });
        activeRunId = null;
        return;
      }
    }

    if (activeRunId === runId && latestDraw) {
      postProgress(runId, week, latestDraw, rankCounts);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

if (typeof globalThis.postMessage === "function") {
  globalThis.onmessage = (event) => {
    const message = event.data;
    if (message?.type === "cancel") {
      if (!message.runId || message.runId === activeRunId) activeRunId = null;
      return;
    }

    if (message?.type === "start") {
      activeRunId = message.runId;
      runSimulation(message.runId, message.manualNumbers).catch(() => {
        globalThis.postMessage({
          type: "error",
          runId: message.runId,
          message: "시뮬레이션 중 문제가 발생했습니다. 다시 시도해주세요.",
        });
      });
    }
  };
}
