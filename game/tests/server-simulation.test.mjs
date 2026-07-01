import test from "node:test";
import assert from "node:assert/strict";
import { AuthoritativeMatch } from "../../server/simulation.js";

const roster = [
  { id: "p1", name: "One" },
  { id: "p2", name: "Two" },
  { id: "p3", name: "Three" },
  { id: "p4", name: "Four" },
];

test("authoritative match assigns alternating two-player teams", () => {
  const match = new AuthoritativeMatch("test", roster);
  assert.deepEqual(match.players.map((player) => player.team), ["alpha", "omega", "alpha", "omega"]);
  assert.deepEqual(match.players.map((player) => player.profileId), ["blue", "red", "yellow", "green"]);
});

test("server accepts controls but never client positions", () => {
  const match = new AuthoritativeMatch("test", roster);
  const player = match.players[0];
  const start = { x: player.x, z: player.z };
  match.setInput("p1", { throttle: 1, x: 9999, z: 9999, sequence: 1 });
  match.tick(0.05);
  assert.notEqual(player.z, start.z);
  assert.notEqual(player.z, 9999);
  assert.notEqual(player.x, 9999);
});

test("friendly players are not valid shell targets", () => {
  const match = new AuthoritativeMatch("test", roster);
  const owner = match.players[0];
  const teammate = match.players[2];
  owner.x = teammate.x = 0;
  owner.z = -7;
  teammate.z = 0;
  owner.heading = 0;
  owner.drive.reset(0);
  match.fire(owner);
  for (let index = 0; index < 5; index += 1) match.updateShells(0.02);
  assert.equal(teammate.armor, 100);
});

test("a disconnected player is replaced by a server bot", () => {
  const match = new AuthoritativeMatch("test", roster);
  match.replaceWithBot("p2");
  assert.equal(match.players[1].isBot, true);
  assert.equal(match.players[1].connected, false);
});

test("match ends only when both members of one team are eliminated", () => {
  const match = new AuthoritativeMatch("test", roster);
  const alpha = match.players.filter((player) => player.team === "alpha");
  alpha[0].lives = 0;
  match.checkWinner();
  assert.equal(match.ended, false);
  alpha[1].lives = 0;
  match.checkWinner();
  assert.equal(match.ended, true);
  assert.equal(match.winner, "omega");
});

test("network match owns eighteen power-ups including one satellite", () => {
  const match = new AuthoritativeMatch("test", roster);
  assert.equal(match.powerups.length, 18);
  assert.equal(match.powerups.filter((powerup) => powerup.type === "satellite").length, 1);
});

test("satellite activation is validated and timed by the server", () => {
  const match = new AuthoritativeMatch("test", roster);
  const player = match.players[0];
  player.satelliteCharges = 1;
  match.setInput(player.id, { satellite: true, sequence: 1 });
  match.tick(0.05);
  assert.equal(player.satelliteCharges, 0);
  assert.ok(player.satelliteUntil > 12);
  assert.ok(match.events.some((event) => event.type === "satellite"));
});
