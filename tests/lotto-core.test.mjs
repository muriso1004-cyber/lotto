import assert from "node:assert/strict";
import test from "node:test";

import {
  TOTAL_COMBINATIONS,
  WEEKLY_JACKPOT_PROBABILITY,
  createCombination,
  createDraw,
  evaluateTickets,
  rankTicket,
  sampleGeometric,
  summarizeWaitingTimes,
  validateManualNumbers,
} from "../public/simulation-worker.js";

function seededRandom(seed = 123456789) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test("validates exactly six unique numbers between 1 and 45", () => {
  assert.equal(validateManualNumbers([1, 2, 3, 4, 5, 45]), true);
  assert.equal(validateManualNumbers([1, 2, 3, 4, 5]), false);
  assert.equal(validateManualNumbers([1, 2, 3, 4, 5, 5]), false);
  assert.equal(validateManualNumbers([0, 2, 3, 4, 5, 6]), false);
  assert.equal(validateManualNumbers([1, 2, 3, 4, 5, 46]), false);
});

test("creates sorted, unique combinations and a distinct bonus ball", () => {
  const random = seededRandom();
  for (let run = 0; run < 300; run += 1) {
    const ticket = createCombination(6, random);
    assert.equal(ticket.length, 6);
    assert.equal(new Set(ticket).size, 6);
    assert.ok(ticket.every((number) => number >= 1 && number <= 45));
    assert.deepEqual(ticket, [...ticket].sort((a, b) => a - b));
  }

  const draw = createDraw(random);
  assert.equal(draw.winningNumbers.length, 6);
  assert.equal(new Set([...draw.winningNumbers, draw.bonusNumber]).size, 7);
});

test("calculates all Korean Lotto 6/45 ranks including the bonus rule", () => {
  const winning = [1, 2, 3, 4, 5, 6];
  const bonus = 7;
  assert.equal(rankTicket([1, 2, 3, 4, 5, 6], winning, bonus), 1);
  assert.equal(rankTicket([1, 2, 3, 4, 5, 7], winning, bonus), 2);
  assert.equal(rankTicket([1, 2, 3, 4, 5, 8], winning, bonus), 3);
  assert.equal(rankTicket([1, 2, 3, 4, 8, 9], winning, bonus), 4);
  assert.equal(rankTicket([1, 2, 3, 8, 9, 10], winning, bonus), 5);
  assert.equal(rankTicket([1, 2, 8, 9, 10, 11], winning, bonus), 0);
});

test("counts simultaneous ticket ranks without merging duplicate tickets", () => {
  const counts = evaluateTickets(
    [
      [1, 2, 3, 4, 5, 6],
      [1, 2, 3, 4, 5, 6],
      [1, 2, 3, 4, 5, 7],
      [1, 2, 3, 8, 9, 10],
    ],
    [1, 2, 3, 4, 5, 6],
    7,
  );
  assert.deepEqual(counts, { 1: 2, 2: 1, 3: 0, 4: 0, 5: 1 });
});

test("uses the official combination count and 100-ticket weekly probability", () => {
  assert.equal(TOTAL_COMBINATIONS, 8_145_060);
  const expected = 1 - (1 - 1 / 8_145_060) ** 100;
  assert.ok(Math.abs(WEEKLY_JACKPOT_PROBABILITY - expected) < 1e-15);
  assert.ok(1 / WEEKLY_JACKPOT_PROBABILITY > 81_400);
  assert.ok(1 / WEEKLY_JACKPOT_PROBABILITY < 81_500);
});

test("samples and summarizes geometric waiting times deterministically", () => {
  assert.equal(sampleGeometric(0.25, () => 0), 1);
  assert.equal(sampleGeometric(0.25, () => 0.5), 3);
  assert.deepEqual(summarizeWaitingTimes([10, 2, 8, 4, 6]), {
    runs: 5,
    mean: 6,
    median: 6,
    p10: 2,
    p90: 8,
    fastest: 2,
    slowest: 10,
  });
});
