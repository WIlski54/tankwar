import test from "node:test";
import assert from "node:assert/strict";
import { assignGroupMatch } from "../matchmaking.js";

const players = (count) => Array.from({ length: count }, (_, index) => ({
  id: `p${index + 1}`,
  name: `Pilot ${index + 1}`,
}));

test("group matchmaking waits until three human players are present", () => {
  const match = assignGroupMatch(players(2));
  assert.equal(match.status, "waiting");
  assert.equal(match.requiredPlayers, 1);
  assert.equal(match.waiting.length, 2);
});

test("group matchmaking fills a three-player match with one bot", () => {
  const match = assignGroupMatch(players(3));
  assert.equal(match.status, "ready");
  assert.equal(match.botAdded, true);
  assert.equal(match.teams.alpha.length, 2);
  assert.equal(match.teams.omega.length, 2);
  assert.equal(match.teams.omega[1].isBot, true);
});

test("group matchmaking creates two teams from four humans", () => {
  const match = assignGroupMatch(players(4));
  assert.equal(match.status, "ready");
  assert.equal(match.botAdded, false);
  assert.deepEqual(match.teams.alpha.map((player) => player.id), ["p1", "p3"]);
  assert.deepEqual(match.teams.omega.map((player) => player.id), ["p2", "p4"]);
});

test("additional players remain available for a subsequent match", () => {
  const match = assignGroupMatch(players(6));
  assert.deepEqual(match.bench.map((player) => player.id), ["p5", "p6"]);
});
