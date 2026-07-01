const BOT_PLAYER = Object.freeze({
  id: "core-ai-wingman",
  name: "CORE AI",
  isBot: true,
});

function normalizePlayers(players) {
  const seen = new Set();
  return (Array.isArray(players) ? players : [])
    .map((player, index) => ({
      id: String(player?.id ?? `player-${index + 1}`),
      name: String(player?.name ?? `PLAYER ${index + 1}`).trim() || `PLAYER ${index + 1}`,
      isBot: Boolean(player?.isBot),
      isLocal: Boolean(player?.isLocal),
    }))
    .filter((player) => {
      if (seen.has(player.id)) return false;
      seen.add(player.id);
      return true;
    });
}

export function assignGroupMatch(players) {
  const roster = normalizePlayers(players);
  if (roster.length < 3) {
    return {
      status: "waiting",
      requiredPlayers: 3 - roster.length,
      teams: { alpha: [], omega: [] },
      waiting: roster,
      bench: [],
      botAdded: false,
    };
  }

  const contestants = roster.slice(0, 4);
  const botAdded = contestants.length === 3;
  if (botAdded) contestants.push({ ...BOT_PLAYER });

  return {
    status: "ready",
    requiredPlayers: 0,
    teams: {
      alpha: [contestants[0], contestants[2]],
      omega: [contestants[1], contestants[3]],
    },
    waiting: [],
    bench: roster.slice(4),
    botAdded,
  };
}
