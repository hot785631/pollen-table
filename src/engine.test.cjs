const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("./engine.js");
const factions = ["ant", "bee", "beetle", "spider", "butterfly"];

const fresh = (a = "ant", b = "beetle") => P.newGame({ factions: [a, b], first: 0, rng: () => 0.41 });
const unit = (power, cost = 1) => ({ power, base: P.powerForCost(cost), cost });
const key = a => JSON.stringify(a);
const pass = { type: "pass" };
const close = game => P.play(P.play(game, pass), pass);
const allCards = player => [...player.hand, ...player.draw, ...player.discard];
function deal(player, kinds) {
  const pool = allCards(player);
  player.hand = kinds.map(kind => {
    const i = pool.findIndex(c => c.kind === kind);
    assert.notEqual(i, -1);
    return pool.splice(i, 1)[0];
  });
  player.draw = pool;
  player.discard = [];
}
function skill(game, from, to) {
  const action = P.actions(game).find(a => a.type === "special" && a.from === from && a.to === to);
  assert.ok(action, "expected legal special " + from + "→" + to);
  return action;
}

test("new presets include one supply; migrating an older recipe keeps its chosen cards and adds no supplies", () => {
  const old = { partners: [3, 3, 1, 2, 2, 1, 3, 3], hits: [3, 2, 1] };
  for (const faction of factions) {
    const migrated = P.migrateDeck(old, faction);
    assert.ok(P.validateDeck(migrated));
    assert.deepEqual(migrated.partners.slice(0, 8), old.partners);
    assert.deepEqual(migrated.hits.slice(0, 3), old.hits);
    assert.equal(migrated.supplies, 0);
    assert.deepEqual(P.migrateDeck(null, faction), P.defaultDeck(faction));
    const preset = P.defaultDeck(faction);
    assert.ok(P.validateDeck(preset));
    assert.deepEqual([preset.partners.length, preset.hits.length, preset.specials, preset.supplies], [12, 1, 2, 1]);
    assert.deepEqual([migrated.partners.length, migrated.hits.length, migrated.specials, migrated.supplies], [11, 4, 1, 0]);
    const s = P.newGame({ factions: [faction, "ant"], decks: [old, null] });
    const cards = allCards(s.players[0]);
    assert.equal(cards.length, P.deckLimit);
    assert.equal(cards.filter(c => c.kind === "special").length, 1);
  }
  const heavy = { partners: Array(12).fill(4), hits: Array(2).fill(3), specials: 2, supplies: 0 };
  assert.ok(P.validateDeck(heavy));
  assert.ok(!P.validateDeck({ ...heavy, hits: Array(6).fill(4) }));
  assert.throws(() => P.newGame({ decks: [{ partners: [1], hits: [2] }] }));
});

test("implicit twenty-card recipes are resized deterministically, with the old specials inferred from hits", () => {
  const expected = [1, 1, 2, 3, 4, 5];
  for (let count = 1; count <= 6; count++) {
    const deck = { partners: Array(12).fill(2), hits: Array(8 - count).fill(1) };
    const saved = P.migrateDeck(JSON.parse(JSON.stringify(deck)), "ant");
    assert.equal(saved.supplies, 0);
    assert.equal(saved.specials, expected[count - 1]);
    const state = P.newGame({ factions: ["ant", "ant"], decks: [saved, null] });
    const cards = allCards(state.players[0]);
    assert.equal(new Set(cards.map(c => c.id)).size, P.deckLimit);
    assert.equal(cards.filter(c => c.kind === "special").length, saved.specials);
    assert.equal(allCards(state.players[1]).filter(c => c.kind === "special").length, 2);
  }
});

test("explicit twenty-card recipes retain rare categories and costs, with stable proportional rounding", () => {
  const old = { partners: [1,1,1,1,1,1,1,1,2,2,3,4], hits: [3,3,3,2,1], specials: 2, supplies: 1 };
  const prior = JSON.stringify(old);
  const resized = P.migrateDeck(old);
  assert.deepEqual([resized.partners.length, resized.hits.length, resized.specials, resized.supplies], [10, 4, 1, 1]);
  assert.deepEqual([...new Set(resized.partners)], [1,2,3,4]);
  assert.deepEqual(resized.hits, [3,3,2,1]);
  assert.deepEqual(P.migrateDeck(old), resized);
  assert.deepEqual(P.migrateDeck(resized), resized);
  assert.equal(JSON.stringify(old), prior);
  const rare = P.migrateDeck({ partners: [4], hits: [3], specials: 1, supplies: 17 });
  assert.deepEqual(rare, { partners: [4], hits: [3], specials: 1, supplies: 13 });
});

test("any category can replace another within a sixteen-card deck that retains one partner", () => {
  const builds = [
    { partners: Array(16).fill(1), hits: [], specials: 0, supplies: 0 },
    { partners: [4], hits: [], specials: 15, supplies: 0 },
    { partners: [2], hits: [], specials: 0, supplies: 15 },
    { partners: [3], hits: Array(15).fill(2), specials: 0, supplies: 0 },
    { partners: [1, 2, 3, 4], hits: [1, 2, 3], specials: 6, supplies: 3 },
  ];
  for (const deck of builds) {
    assert.ok(P.validateDeck(deck));
    assert.deepEqual(P.migrateDeck(deck), deck);
    const s = P.newGame({ decks: [deck, deck], first: 0 });
    for (const p of s.players) {
      const pool = allCards(p);
      assert.equal(new Set(pool.map(c => c.id)).size, P.deckLimit);
      assert.deepEqual(pool.filter(c => c.kind === "partner").map(c => c.cost).sort(), [...deck.partners].sort());
      const hits = pool.filter(c => c.kind === "hit");
      assert.deepEqual(hits.map(c => c.impact).sort(), [...deck.hits].sort());
      assert.ok(hits.every(c => c.cost === P.hitCost(c.impact)));
      assert.equal(pool.filter(c => c.kind === "special").length, deck.specials);
      assert.equal(pool.filter(c => c.kind === "supply" && c.cost === P.supplyCost).length, deck.supplies);
    }
  }
  const single = builds[1];
  for (const bad of [{ ...single, partners: [], specials: 16 }, { ...single, supplies: -1 },
    { ...single, specials: 14.5, supplies: 0.5 }, { ...single, specials: 16 }]) {
    assert.ok(!P.validateDeck(bad));
    assert.throws(() => P.newGame({ decks: [bad, null] }));
  }
});

test("opening probability is the chance of at least one card in six without replacement", () => {
  assert.equal(P.openingChance(0), 0);
  assert.equal(P.deckLimit, 16);
  assert.equal(P.openingChance(15), 1);
  assert.ok(Math.abs(P.openingChance(1) - 0.375) < 1e-12);
  assert.ok(Math.abs(P.openingChance(2) - (1 - 10 * 9 / (16 * 15))) < 1e-12);
  assert.ok(Math.abs(P.openingChance(2, 8) - 27 / 28) < 1e-12);
});

test("an unfiltered six-card deal can include every physical card, both specials, or neither", () => {
  const seen = new Set(), starters = new Set();
  let hadNoCheapPartners = false;
  for (let i = 1; i <= 256; i++) {
    const faction = factions[i % factions.length];
    const hand = P.newGame({ factions: [faction, faction], first: 0, rng: () => (Math.imul(i, 2654435761) >>> 0) / 4294967296 }).players[0].hand;
    assert.equal(hand.length, 6);
    assert.equal(new Set(hand.map(c => c.id)).size, 6);
    assert.ok(hand.filter(c => c.kind === "partner").length >= 2);
    hand.forEach(c => seen.add(c.id));
    starters.add(hand.filter(c => c.kind === "special").length);
    hadNoCheapPartners ||= !hand.some(c => c.kind === "partner" && c.cost === 1);
  }
  assert.equal(seen.size, P.deckLimit);
  assert.deepEqual([...starters].sort(), [0, 1, 2]);
  assert.ok(hadNoCheapPartners);
});

test("a hand of six hits can exchange even at zero sun, including when the draw pile must recycle", () => {
  const deck = { partners: Array(8).fill(1), hits: Array(6).fill(1), specials: 2, supplies: 0 };
  const s = P.newGame({ decks: [deck, null], first: 0 });
  const p = s.players[0];
  deal(p, Array(6).fill("hit"));
  p.discard = p.draw.splice(0);
  p.sun = 0;
  assert.deepEqual(new Set(P.actions(s).map(a => a.type)), new Set(["cycle", "pass"]));
  const move = P.chooseAI(s);
  assert.equal(move.type, "cycle");
  const slot = p.hand.findIndex(c => c.id === move.card);
  const t = P.play(s, move);
  assert.equal(t.turn, 1);
  assert.equal(t.players[0].sun, 0);
  assert.equal(t.players[0].hand.length, 6);
  assert.notEqual(t.players[0].hand[slot].id, move.card);
  assert.equal(t.players[0].discard[0].id, move.card);
  assert.deepEqual(t.lastEvent, { type: "cycle", side: 0, cardId: move.card, drawn: [[t.players[0].hand[slot].id], []], reshuffles: [1, 0] });
  assert.equal(p.hand[slot].id, move.card);
  const again = P.play(t, pass);
  assert.ok(!P.actions(again).some(a => a.type === "cycle"));
  assert.equal(new Set(allCards(t.players[0]).map(c => c.id)).size, P.deckLimit);
});

test("free and paid actions alternate; passing is final until round-end and starters alternate A–B–A", () => {
  const deck = { partners: Array(12).fill(1), hits: [1], specials: 2, supplies: 1 };
  let s = P.newGame({ factions: ["ant","ant"], decks: [deck,deck], first: 0 });
  for (let round=1; round<=3; round++) {
    const lead = (round-1) % 2, other = 1-lead;
    assert.equal(s.round, round);
    assert.equal(s.turn, lead);
    assert.ok(s.players.every(p => !p.passed && p.canCycle));
    deal(s.players[lead], ["supply","partner","hit"]);
    deal(s.players[other], ["supply","partner","hit"]);
    const use = type => {
      const a = P.actions(s).find(m => m.type === type);
      assert.ok(a, "missing " + type);
      s = P.play(s,a);
    };
    use("supply"); assert.equal(s.turn, other);
    use("cycle"); assert.equal(s.turn, lead);
    use("partner"); assert.equal(s.turn, other);
    use("hit"); assert.equal(s.turn, lead);
    use("pass"); assert.equal(s.turn, other);
    assert.deepEqual(P.actions(s,lead), []);
    use("partner"); assert.equal(s.turn, other);
    assert.deepEqual(P.actions(s,lead), []);
    assert.ok(s.players[lead].passed);
    use("pass"); assert.equal(s.phase,"scored");
    assert.deepEqual(P.actions(s,0), []); assert.deepEqual(P.actions(s,1), []);
    if (round<3) s = P.nextRound(s);
  }
});

test("paid supply refills each hand size to six, excluding itself during a reshuffle", () => {
  for (const size of [1, 2, 3, 4, 5, 6]) {
    const s = fresh();
    const p = s.players[0];
    deal(p, ["supply", ...Array(size - 1).fill("partner")]);
    // Leave one card to draw, forcing the second draw (when allowed) to reshuffle mid-effect.
    p.discard = p.draw.splice(0, p.draw.length - 1);
    const expectedFirst = p.draw[0].id;
    const move = P.actions(s).find(a => a.type === "supply");
    assert.deepEqual(move, { type: "supply", card: p.hand[0].id });
    const t = P.play(s, move);
    const expectedCount = 7-size;
    assert.equal(t.turn, 1);
    assert.equal(t.players[0].sun, 3-P.supplyCost);
    assert.equal(t.players[0].canCycle, true);
    assert.equal(t.players[0].hand.length, size - 1 + expectedCount);
    assert.equal(p.hand.length, size);
    assert.equal(t.lastEvent.cardId, move.card);
    assert.equal(t.lastEvent.type, "supply");
    assert.deepEqual(t.lastEvent.reshuffles, [expectedCount > 1 ? 1 : 0, 0]);
    assert.equal(t.lastEvent.drawn[0][0], expectedFirst);
    assert.deepEqual(t.lastEvent.drawn, [t.players[0].hand.slice(-expectedCount).map(c => c.id), []]);
    assert.ok(!t.lastEvent.drawn[0].includes(move.card));
    assert.equal(t.players[0].discard.at(-1).id, move.card);
    assert.equal(new Set(allCards(t.players[0]).map(c => c.id)).size, P.deckLimit);
    assert.deepEqual(P.play(s, move), t);
    assert.equal(P.supplyDrawCount(s), expectedCount);
    p.sun = 1;
    assert.equal(P.play(s,move).players[0].sun, 0);
    p.sun = 0;
    assert.ok(!P.actions(s).some(a => a.type === "supply"));
    assert.throws(() => P.play(s,move));
  }
});

test("saved hit tiers keep their impact, while the three normal actions cost zero, one and two sun", () => {
  const old = { partners: Array(12).fill(1), hits: [1,2,3], specials: 1, supplies: 0 };
  assert.deepEqual(P.migrateDeck(old), old);
  assert.deepEqual([1,2,3].map(P.hitCost), [0,1,2]);
  assert.equal(P.supplyCost, 1);
  const s = P.newGame({ decks: [old,null], first: 0 });
  deal(s.players[0], ["hit","hit","hit"]);
  s.board[1][2] = unit(7,4);
  for (const card of s.players[0].hand) {
    s.players[0].sun = card.cost;
    const move = P.actions(s).find(a => a.type === "hit" && a.card === card.id && a.lane === 2);
    assert.ok(move);
    const t = P.play(s, move);
    assert.equal(t.board[1][2].power, 7-card.impact);
    assert.equal(t.players[0].sun, 0);
    assert.equal(t.turn, 1);
    if (card.cost > 0) {
      s.players[0].sun = card.cost-1;
      assert.throws(() => P.play(s, move));
    }
  }
});

test("a paid supply returns to circulation in the same round, but never draws itself and sun limits the chain", () => {
  const deck = { partners: [1], hits: [], specials: 0, supplies: 15 };
  let s = P.newGame({ decks: [deck,null], first: 0 });
  const p = s.players[0];
  deal(p, ["supply"]);
  p.discard = p.draw.splice(6);
  p.sun = 10;
  // The first refill empties the draw pile. This seed leaves the last discarded card
  // on top when the next supply shuffles, so the earlier supply must be eligible.
  s.seed = 1800;
  s.players[1].passed = true;
  function drink(expected) {
    assert.equal(P.supplyDrawCount(s), expected);
    const move = P.actions(s).find(a => a.type === "supply");
    assert.ok(move);
    s = P.play(s, move);
    const p = s.players[0];
    assert.equal(s.lastEvent.drawn[0].length, expected);
    assert.ok(!s.lastEvent.drawn[0].includes(move.card));
    assert.equal(p.hand.length, 6);
    assert.equal(new Set(allCards(p).map(c => c.id)).size, P.deckLimit);
    return move.card;
  }
  const first = drink(6);
  drink(1);
  assert.deepEqual(s.lastEvent.drawn[0], [first]);
  for (let i=2; i<10; i++) drink(1);
  assert.equal(s.players[0].sun, 0);
  assert.ok(!P.actions(s).some(a => a.type === "supply"));
  assert.ok(P.actions(s).some(a => a.type === "cycle"));
});

test("with a low hand AI considers a full refill and can still use a free hit after spending its last sun", () => {
  const deck = { partners: Array(14).fill(1), hits: [1], specials: 0, supplies: 1 };
  let s = P.newGame({ decks: [deck,null], first: 0 });
  const p = s.players[0];
  deal(p, ["supply"]); p.sun = 1;
  const hit = p.draw.findIndex(c => c.kind === "hit");
  p.draw.push(p.draw.splice(hit,1)[0]);
  s.pollen.fill(1); s.startingPollen = 5;
  s.board[1][3] = unit(1); s.players[1].passed = true;
  const draw = P.chooseAI(s);
  assert.equal(draw.type, "supply");
  s = P.play(s, draw);
  assert.equal(s.players[0].sun, 0);
  assert.equal(s.lastEvent.drawn[0].length, 6);
  const strike = P.chooseAI(s);
  assert.ok(strike.type === "hit" && strike.lane === 3);
  s = P.play(s, strike);
  assert.equal(s.board[1][3].power, 0);

  const noHits = { partners: [4], hits: [], specials: 0, supplies: 15 };
  s = P.newGame({ decks: [noHits,null], first: 0 });
  deal(s.players[0], Array(6).fill("supply")); s.players[0].sun = 0; s.players[1].passed = true;
  const move = P.chooseAI(s);
  assert.ok(move.type === "cycle" || move.type === "pass");
  if (move.type === "cycle") { s = P.play(s, move); assert.deepEqual(P.chooseAI(s), pass); }
});

test("deal and round events report the real cards drawn by each seat, without counting retained cards", () => {
  let s = fresh();
  assert.deepEqual(s.lastEvent.drawn, s.players.map(p => p.hand.map(c => c.id)));
  for (const side of [0, 1]) {
    const p = s.players[side];
    p.discard.push(...p.hand.splice(0, side + 1));
  }
  const previous = s.players.map(p => p.hand.map(c => c.id));
  s = close(s);
  assert.deepEqual(s.lastEvent.drawn, [[], []]);
  s = P.nextRound(s);
  assert.deepEqual(s.lastEvent.drawn.map(a => a.length), [1, 2]);
  assert.equal(s.lastEvent.type, "round");
  s.players.forEach((p, side) => {
    assert.deepEqual(p.hand.map(c => c.id), [...previous[side], ...s.lastEvent.drawn[side]]);
  });
});

test("AI may choose a supply with space without reading either player's future draw", () => {
  const s = fresh();
  deal(s.players[0], ["supply", "hit"]);
  for (const player of s.players) {
    Object.defineProperty(player, "draw", { get() { throw Error("read hidden deck order"); } });
  }
  assert.deepEqual(P.chooseAI(s), { type: "supply", card: s.players[0].hand[0].id });
});

test("retained physical cards survive refill, sun caps at ten, rounds may exceed thirty", () => {
  let s = fresh();
  const original = s.players.map(p => p.hand.map(c => c.id));
  for (let round = 1; round <= 32; round++) {
    assert.equal(s.first, (round - 1) % 2);
    assert.ok(s.players.every(p => p.sun === Math.min(2 + round, 10) && p.canCycle));
    assert.deepEqual(s.players.map(p => p.hand.map(c => c.id)), original);
    s = close(s);
    assert.equal(s.phase, "scored");
    s = P.nextRound(s);
    assert.equal(s.board[0].length, 5);
    assert.equal(s.pollen.reduce((a,b) => a+b), s.startingPollen);
  }
});

test("all five lanes draw independently, including all-empty and all-triple boards with no redraw", () => {
  for (const [seed, n] of [[17061,0],[4706892,3]]) {
    const s = P.newGame({ first: 0, rng: () => seed / 4294967296 });
    assert.deepEqual(s.pollen, [n,n,n,n,n]);
    assert.equal(s.startingPollen, 5*n);
  }
  const byLane = Array.from({length:5}, () => [0,0,0,0]);
  const adjacent = Array.from({length:4}, () => [0,0,0,0]);
  const size = 8192, expected = [.10,.70,.15,.05];
  for (let i = 1; i <= size; i++) {
    const s = P.newGame({ first: 0, rng: () => (Math.imul(i, 2654435761) >>> 0) / 4294967296 });
    assert.equal(s.startingPollen, s.pollen.reduce((a,b) => a+b));
    s.pollen.forEach((n,lane) => {
      byLane[lane][n]++;
      if (lane > 0) adjacent[s.pollen[lane-1]][n]++;
    });
  }
  byLane.forEach(counts => counts.forEach((n,i) => assert.ok(Math.abs(n/size-expected[i]) < .025)));
  adjacent.forEach((counts,i) => counts.forEach((n,j) => {
    assert.ok(Math.abs(n/(size*4) - expected[i]*expected[j]) < .012, "neighbor pair " + i + "," + j);
  }));
});

test("the same seed produces identical future flower layouts regardless of exchanges and deck reshuffles", () => {
  let simple = fresh(), exchanging = fresh("butterfly", "spider");
  let reshuffled = false;
  for (let round = 1; round <= 40; round++) {
    assert.deepEqual(exchanging.pollen, simple.pollen);
    for (let i = 0; i < 2; i++) {
      const move = P.actions(exchanging).find(a => a.type === "cycle");
      exchanging = P.play(exchanging, move);
      reshuffled ||= exchanging.lastEvent.reshuffles.some(Boolean);
    }
    simple = P.nextRound(close(simple));
    exchanging = P.nextRound(close(exchanging));
  }
  assert.ok(reshuffled);
});

test("each faction's physical specials keep one cost in hand, draw pile and discard at every flower stage", () => {
  for (const faction of factions) {
    let s = fresh(faction, faction);
    for (const p of s.players) deal(p, ["special"]);
    const i = s.players[0].draw.findIndex(c => c.kind === "special");
    s.players[0].discard.push(s.players[0].draw.splice(i, 1)[0]);
    for (let round = 1; round <= 8; round++) {
      const cost = P.specialRules(faction).cost;
      assert.equal(P.specialCost(faction, round), cost);
      for (const p of s.players) {
        const cards = allCards(p).filter(c => c.kind === "special");
        assert.equal(cards.length, 2);
        assert.ok(cards.every(c => c.cost === cost));
      }
      s = P.nextRound(close(s));
    }
  }
});

test("AI accounts for a free special when configured without reading the opponent's hand", t => {
  const rules = P.specialRules("beetle"), originalCost = rules.cost;
  t.after(() => { rules.cost = originalCost; });
  rules.cost = 0;
  const s = fresh("ant", "beetle");
  s.pollen.fill(1);
  s.players[0].sun = 2;
  s.players[0].hand = [{ kind: "partner", id: "cheap", cost: 1 }, { kind: "partner", id: "strong", cost: 2 }];
  s.players[1].sun = 0;
  Object.defineProperty(s.players[1], "hand", { get() { throw Error("looked at concealed hand"); } });
  s.board[0] = [unit(1), unit(1), unit(1), unit(1), null];
  s.board[1][0] = unit(1);
  assert.equal(P.chooseAI(s).card, "strong");
  // Even without any free faction special, the opponent might hold a free one-strength hit.
  rules.cost = 3;
  assert.equal(P.chooseAI(s).card, "strong");
  s.players[1].passed = true;
  assert.equal(P.chooseAI(s).card, "cheap");
});

test("ants lend all their current power, including previous boosts, and may target ants already over ten", () => {
  let s = fresh();
  deal(s.players[0], ["special", "special"]);
  s.players[0].sun = 10;
  s.board[0][3] = unit(7, 4);
  s.board[0][4] = unit(5, 3);
  s.players[1].passed = true;
  let move = skill(s, 3, 4);
  assert.throws(() => P.play(s, { ...move, card: "missing" }));
  s = P.play(s, move);
  assert.equal(s.board[0][4].power, 12);
  assert.equal(s.board[0][3].power, 7);
  assert.ok(skill(s, 3, 4)); // The ant that already has 12 may still receive another boost.
  s = P.play(s, skill(s, 4, 3));
  assert.equal(s.board[0][3].power, 19);
  assert.equal(s.board[0][4].power, 12);
  assert.equal(s.players[0].hand.length, 0);
  assert.equal(s.players[0].discard.filter(c => c.kind === "special").length, 2);
  assert.equal(s.players[0].sun, 10 - 2 * P.specialCost("ant"));
  const spent = new Set(s.players[0].discard.map(c => c.id));
  s = P.nextRound(P.play(s, pass));
  for (let round = 0; round < 40 && spent.size; round++) {
    if (s.turn !== 0) s = P.play(s, pass);
    s = P.play(s, { type: "cycle", card: s.players[0].hand[0].id });
    s.players[0].hand.forEach(c => spent.delete(c.id));
    while (s.phase === "play") s = P.play(s, pass);
    s = P.nextRound(s);
  }
  assert.equal(spent.size, 0);
});

test("beetle push swaps opposing occupied spaces or uses an empty one, damaging only the pushed insect", () => {
  const s = fresh("beetle", "ant");
  s.players[0].sun = 10;
  deal(s.players[0], ["special"]);
  s.board[0][3] = unit(1);
  s.board[1][3] = unit(4, 3);
  s.board[1][4] = unit(2, 2);
  assert.ok(!P.actions(s).some(a => a.type === "special" && a.from === 4));
  const t = P.play(s, skill(s, 3, 4));
  assert.deepEqual(t.board[1][3], unit(2, 2));
  assert.deepEqual(t.board[1][4], unit(Math.max(0, 4 - P.specialRules("beetle").pushLoss), 3));
  assert.deepEqual(t.board[0], s.board[0]);
  s.board[1][3] = unit(0);
  const u = P.play(s, skill(s, 3, 2));
  assert.equal(u.board[1][3], null);
  assert.equal(u.board[1][2].power, 0);
});

test("a netted beetle tears its own web only during a legal push; AI previews leave every live web intact", () => {
  const s = fresh("beetle", "spider");
  deal(s.players[0], ["special"]);
  s.players[0].sun = 10;
  s.players[1].passed = true;
  s.pollen = [0,0,3,1,1]; s.startingPollen = 5;
  s.board[0][2] = unit(3,2);
  s.webs[0][2] = true;
  s.webs[0][4] = true;
  assert.equal(P.lanePower(s,0,2), 0);
  assert.ok(!P.actions(s).some(a => a.type === "special"), "a beetle cannot remove a web without a facing enemy");
  s.board[1][2] = unit(5,3);
  const untouched = JSON.stringify(s);
  const push = skill(s,2,1);
  assert.deepEqual(P.chooseAI(s), push);
  assert.equal(JSON.stringify(s), untouched);
  const result = P.play(s,push);
  assert.equal(JSON.stringify(s), untouched);
  assert.equal(result.webs[0][2], false);
  assert.equal(result.webs[0][4], true);
  assert.equal(result.board[1][2], null);
  assert.deepEqual(result.board[1][1], unit(Math.max(0,5-P.specialRules("beetle").pushLoss),3));
  assert.equal(P.lanePower(result,0,2), 3);
  assert.equal(result.players[0].sun, 10-P.specialCost("beetle"));
  const settled = P.play(result,pass);
  assert.deepEqual(settled.result.gain, [3,0]);
  assert.equal(settled.result.webs[0][2], false);
  assert.equal(settled.result.webs[0][4], true);
});

test("bee pollen needs a neighboring friendly insect at the receiving end and remains contestable", () => {
  const s = fresh("bee", "ant");
  s.players[0].sun = 10;
  s.pollen.fill(1);
  deal(s.players[0], ["special"]);
  s.board[0][4] = unit(1);
  s.board[1][4] = unit(3, 2);
  assert.deepEqual(P.actions(s).filter(a => a.type === "special").map(a => [a.from, a.to]), [[3, 4]]);
  const moved = P.play(s, skill(s, 3, 4));
  assert.deepEqual(moved.pollen, [1, 1, 1, 0, 2]);
  const final = close(moved);
  assert.deepEqual(final.result.gain, [0, 2]);
  const next = P.nextRound(final);
  assert.equal(next.pollen.reduce((x,y) => x + y), next.startingPollen);
});

test("bees move whole piles, including a pile already larger than three, even to a webbed bee", () => {
  let s = fresh("bee", "spider");
  s.players.forEach(p => { p.sun = 10; });
  deal(s.players[0], ["special", "special"]);
  deal(s.players[1], ["special"]);
  s.pollen = [3,3,2,0,1]; s.startingPollen = 9;
  s.board[0][1] = unit(3,2); s.board[0][2] = unit(7,4); s.board[1][2] = unit(1);
  const first = P.play(s, skill(s, 0, 1));
  assert.deepEqual(first.pollen, [0,6,2,0,1]);
  assert.deepEqual(s.pollen, [3,3,2,0,1]); // Preview didn't change the live game.
  s = P.play(first, skill(first, 2, 2)); // Spider nets the receiving bee.
  assert.ok(!P.actions(s).some(a => a.type === "special" && a.from === 0));
  s = P.play(s, skill(s, 1, 2));
  assert.deepEqual(s.pollen, [0,0,8,0,1]);
  assert.equal(s.pollen.reduce((a,b) => a+b), s.startingPollen);
  assert.equal(P.lanePower(s, 0, 2), 0);
  assert.deepEqual(close(s).result.gain, [0,8]); // The stronger bee delivers, but cannot score.
});

test("bee AI compares the full amounts each legal transfer changes on the board", () => {
  const s = fresh("bee", "ant");
  s.players[0].sun = 10; s.players[1].passed = true;
  deal(s.players[0], ["special"]);
  s.pollen = [1,0,2,0,3]; s.startingPollen = 6;
  s.board[0][1] = unit(1); s.board[0][3] = unit(1);
  for (const lane of [0,2,4]) s.board[1][lane] = unit(3,2);
  assert.deepEqual(P.chooseAI(s), skill(s, 4, 3));
  assert.deepEqual(P.play(s, skill(s, 4, 3)).pollen, [1,0,2,3,0]);
});

test("a net can cover any empty enemy space and blocks deployment only on its own lane for the round", () => {
  const s = fresh("spider", "beetle");
  s.players.forEach(p => { p.sun = 10; });
  deal(s.players[0], ["special", "special"]); deal(s.players[1], ["partner", "hit"]);
  s.pollen = [1, 1, 0, 0, 3];
  s.board[0][2] = unit(1); s.board[0][3] = unit(1); s.board[0][4] = unit(0);
  s.board[1][3] = unit(3);
  const moves = P.actions(s).filter(a => a.type === "special");
  assert.ok(moves.every(a => a.from === a.to));
  assert.deepEqual([...new Set(moves.map(a => a.to))], [0,1,2,3,4]);
  const action = skill(s, 4, 4);
  assert.deepEqual(P.chooseAI(s), action);
  const t = P.play(s, action);
  assert.ok(t.webs[1][4]);
  assert.ok(!t.webs[0][4]);
  assert.deepEqual(t.board, s.board);
  assert.equal(t.board[1][4], null);
  const enemy = P.actions(t);
  assert.ok(!enemy.some(a => a.type === "partner" && a.lane === 4));
  assert.ok(enemy.some(a => a.type === "partner" && a.lane === 2));
  assert.ok(enemy.some(a => a.type === "hit" && a.lane === 2));
  const waiting = P.play(t, pass);
  assert.ok(!P.actions(waiting).some(a => a.type === "special" && a.from === 4));
  assert.notEqual(P.chooseAI(waiting).type, "special", "no point buying an empty web after the opponent passes");
  const settled = P.play(waiting, pass);
  assert.ok(settled.webs.flat().every(x => !x));
  assert.ok(P.nextRound(settled).webs.flat().every(x => !x));
});

test("on the opening round the second player can immediately net an enemy on a rich flower from an empty board", () => {
  let s = fresh("ant", "spider");
  s.pollen = [0,1,0,0,3]; s.startingPollen = 4;
  // Pick a real, affordable partner for the first player, then give the second their net.
  const p = s.players[0], pool = allCards(p);
  const affordable = pool.findIndex(c => c.kind === "partner" && c.cost <= 3);
  p.hand = pool.splice(affordable, 1); p.draw = pool; p.discard = [];
  deal(s.players[1], ["special", "partner"]);
  s = P.play(s, P.actions(s).find(a => a.type === "partner" && a.lane === 4));
  assert.equal(s.turn, 1);
  assert.ok(s.board[1].every(x => x === null));
  const net = skill(s, 4, 4);
  assert.deepEqual(P.chooseAI(s), net);
  s = P.play(s, net);
  assert.equal(s.players[1].sun, 3 - P.specialCost("spider"));
  assert.ok(s.webs[0][4]);
  assert.equal(P.lanePower(s, 0, 4), 0);
  assert.equal(P.lanePower(s, 1, 4), 0);
  s = close(s);
  assert.equal(s.result.winners[4], null);
  assert.deepEqual(s.result.gain, [0,0]);
});

test("spiders may net first then deploy a collector, and AI avoids netting interchangeable empty flowers", () => {
  const s = fresh("spider", "ant");
  s.players[0].sun = 10;
  deal(s.players[0], ["special"]); s.pollen.fill(1);
  assert.notEqual(P.chooseAI(s).type, "special");
  s.pollen[2] = 3;
  assert.deepEqual(P.chooseAI(s), skill(s, 2, 2));
  s.players[1].passed = true;
  assert.notEqual(P.chooseAI(s).type, "special");
  s.players[1].passed = false;
  deal(s.players[0], ["special", "partner"]);
  let prepared = P.play(s, skill(s, 2, 2));
  assert.equal(prepared.board[0][2], null);
  assert.equal(prepared.board[1][2], null);
  assert.ok(!P.actions(prepared).some(a => a.type === "partner" && a.lane === 2));
  prepared = P.play(prepared, pass);
  const drop = P.actions(prepared).find(a => a.type === "partner" && a.lane === 2);
  assert.ok(drop);
  prepared = P.play(prepared, drop);
  prepared = P.play(prepared, pass);
  assert.equal(prepared.result.winners[2], 0);
  assert.deepEqual(prepared.result.gain, [3,0]);
});

test("an occupied web silences only scoring; ant abilities and hit targeting still use actual strength", () => {
  const s = fresh("spider", "ant");
  s.players.forEach(p => { p.sun = 10; });
  deal(s.players[0], ["special", "hit"]); deal(s.players[1], ["special"]);
  s.board[0][4] = unit(1); s.board[1][4] = unit(7, 4); s.board[1][3] = unit(1);
  s.pollen = [0,1,1,1,2];
  const t = P.play(s, skill(s, 4, 4));
  assert.equal(t.board[1][4].power, 7);
  assert.equal(P.scorePower(t.board[1][4], true), 0);
  assert.equal(P.lanePower(t, 1, 4), 0);
  const boosted = P.play(t, skill(t, 4, 3));
  assert.equal(boosted.board[1][3].power, 8); // The netted ant lends its full seven.
  assert.equal(P.lanePower(boosted, 1, 4), 0);
  const hit = P.actions(boosted).find(a => a.type === "hit" && a.lane === 4);
  assert.ok(hit);
  const hurt = P.play(boosted, hit);
  assert.ok(hurt.board[1][4].power < 7 && hurt.board[1][4].power > 0);
  const scored = close(hurt);
  assert.deepEqual(scored.result.gain, [2,1]);
  assert.equal(scored.result.winners[4], 0);
  assert.equal(scored.webs[1][4], false);
  assert.equal(scored.result.webs[1][4], true);
  assert.equal(P.lanePower(scored, 1, 4), 0); // Score screen reads the pre-clear snapshot.
  assert.equal(P.lanePower(scored, 0, 4), 1);
});

test("two facing spiders may net each other, tying a flower despite unequal printed strengths", () => {
  let s = fresh("spider", "spider");
  s.players.forEach(p => { p.sun = 10; deal(p, ["special", "special"]); });
  s.board[0][2] = unit(1); s.board[1][2] = unit(7, 4); s.pollen.fill(1);
  s = P.play(s, skill(s, 2, 2));
  s = P.play(s, skill(s, 2, 2));
  assert.ok(!P.actions(s).some(a => a.type === "special" && a.to === 2));
  assert.deepEqual(P.actions(s).filter(a => a.type === "special").map(a => a.to), [0,1,3,4]);
  assert.deepEqual(s.board.map(row => row[2].power), [1,7]);
  s = close(s);
  assert.equal(s.result.winners[2], null);
  assert.deepEqual(s.result.gain, [0,0]);
  assert.ok(s.result.webs.every(row => row[2]));
  assert.ok(P.nextRound(s).webs.flat().every(x => !x));
});

test("after the opponent passes, AI can win by netting their stronger occupant before scoring", () => {
  let s = fresh("spider", "beetle");
  s.players[0].sun = 10; s.players[0].score = 29; s.players[1].passed = true;
  deal(s.players[0], ["special"]);
  s.board[0][4] = unit(1); s.board[1][4] = unit(7, 4); s.pollen.fill(1);
  assert.deepEqual(P.chooseAI(s), skill(s, 4, 4));
  s = P.play(s, P.chooseAI(s));
  assert.deepEqual(P.chooseAI(s), pass);
  s = P.play(s, pass);
  assert.equal(s.winner, 0);
  assert.equal(P.lanePower(s, 1, 4), 0);
});

test("a fully webbed player can still exchange, pass, and play normally in the new round", () => {
  let s = fresh("ant", "spider");
  s.webs[0].fill(true);
  s.players[1].passed = true;
  deal(s.players[0], Array(6).fill("partner"));
  assert.deepEqual(new Set(P.actions(s).map(a => a.type)), new Set(["cycle", "pass"]));
  for (let i = 0; i < 8 && s.phase === "play"; i++) s = P.play(s, P.chooseAI(s));
  assert.equal(s.phase, "scored");
  s = P.nextRound(s);
  s = P.play(s, pass);
  assert.ok(P.actions(s).some(a => a.type === "partner"));
});

test("weaving destroys only the targeted enemy brood and it cannot hatch next round", () => {
  for (const spider of [0, 1]) {
    const butterfly = 1 - spider;
    let s = fresh(...(spider === 0 ? ["spider", "butterfly"] : ["butterfly", "spider"]));
    s.turn = butterfly;
    s.players.forEach(p => { p.sun = 10; deal(p, ["special"]); });
    s.board[butterfly][2] = unit(3);
    s.pollen[2] = 3;
    s = P.play(s, skill(s, 2, 2));
    s.broods[butterfly][4] = 5;
    const original = structuredClone(s);
    const chosen = skill(s, 2, 2);
    P.chooseAI(s);
    assert.deepEqual(s, original, "AI previews must not destroy live broods");
    const netted = P.play(s, chosen);
    assert.deepEqual(s, original, "a cancelled UI preview must leave its source intact");
    assert.equal(netted.broods[butterfly][2], 0);
    assert.equal(netted.broods[butterfly][4], 5);
    assert.equal(netted.pollen[2], 0, "eaten pollen is not refunded");
    assert.equal(netted.eaten[2], 3);
    assert.equal(netted.board[butterfly][2].power, 3);
    assert.equal(netted.players[spider].sun, 10 - P.specialCost("spider"));
    assert.ok(netted.webs[butterfly][2]);
    const next = P.nextRound(close(netted));
    assert.equal(next.board[butterfly][2], null);
    assert.equal(next.board[butterfly][4].power, 5);
    assert.deepEqual(next.lastEvent.hatched[butterfly], [4]);
  }
});

test("a new brood in an existing web can be destroyed by a second weaving", () => {
  let s = fresh("spider", "butterfly");
  s.players.forEach(p => { p.sun = 10; deal(p, ["special", "special"]); });
  s.board[1][1] = unit(2);
  s = P.play(s, skill(s, 1, 1));
  s = P.play(s, skill(s, 1, 1));
  assert.ok(s.broods[1][1] > 0, "weaving destroys broods present when the card is played");
  s = P.play(s, skill(s, 1, 1));
  assert.equal(s.broods[1][1], 0);
  assert.ok(s.webs[1][1]);
  assert.equal(P.nextRound(close(s)).board[1][1], null);
});

test("AI can destroy a brood on an empty flower after the butterfly has passed", () => {
  const s = fresh("spider", "butterfly");
  s.players[1].passed = true;
  s.players[0].sun = P.specialCost("spider");
  deal(s.players[0], ["special"]);
  s.pollen.fill(0);
  s.broods[1][3] = 7;
  const original = structuredClone(s);
  assert.deepEqual(P.chooseAI(s), skill(s, 3, 3));
  assert.deepEqual(s, original);
  const ended = P.play(P.play(s, skill(s, 3, 3)), pass);
  assert.equal(P.nextRound(ended).board[1][3], null);
});

test("both sides may guard the same lane, with separate meals and newborns at the beginning of the next round", () => {
  let s = fresh("butterfly", "butterfly");
  s.players.forEach(p => { p.sun = 10; deal(p, ["special", "special"]); });
  s.pollen = [1, 1, 1, 0, 2];
  s.board[0][4] = unit(1); s.board[1][4] = unit(5, 3);
  const base = P.specialRules("butterfly").hatchPower;
  assert.deepEqual(P.chooseAI(s), skill(s, 4, 4), "deny the opponent's two flowers and raise a stronger newborn");
  assert.ok(!P.actions(s).some(a => a.type === "special" && a.from !== 4));
  const afterMeal = P.play(s, skill(s, 4, 4));
  assert.deepEqual(afterMeal.board, s.board);
  assert.deepEqual(afterMeal.pollen, [1, 1, 1, 0, 0]);
  assert.deepEqual(afterMeal.eaten, [0, 0, 0, 0, 2]);
  assert.equal(afterMeal.broods[0][4], base + 2);
  s = P.play(afterMeal, skill(afterMeal, 4, 4)); // No pollen left; still guards a base-strength brood.
  assert.equal(s.broods[1][4], base);
  assert.ok(!P.actions(s).some(a => a.type === "special" && a.from === 4));
  s = close(s);
  assert.deepEqual(s.result.gain, [0, 0]);
  assert.equal(s.board[0][4].power, 1); assert.equal(s.board[1][4].power, 5);
  s = P.nextRound(s);
  assert.deepEqual(s.lastEvent.hatched, [[4], [4]]);
  assert.equal(s.board[0][4].power, base + 2); assert.equal(s.board[1][4].power, base);
  assert.ok(s.board.every(row => row[4].hatched && row[4].cost === 0));
  assert.ok(s.players.every(p => p.sun === 4 && allCards(p).length === 16));
  assert.ok(s.broods.flat().every(x => x === 0));
  assert.deepEqual(s.eaten, [0,0,0,0,0]);
  assert.equal(s.pollen.reduce((sum,n) => sum+n, 0), s.startingPollen);
  assert.ok(skill(s, 4, 4), "a newborn can guard the following generation");
});

test("butterflies eat pollen brought by bees; pollen moved there afterwards still scores", () => {
  let s = fresh("bee", "butterfly");
  s.players.forEach(p => { p.sun = 10; });
  deal(s.players[0], ["special", "special"]); deal(s.players[1], ["special"]);
  s.pollen = [1, 0, 3, 2, 1]; s.startingPollen = 7;
  s.board[0][3] = unit(5); s.board[1][3] = unit(1);
  s = P.play(s, skill(s, 2, 3)); assert.equal(s.pollen[3], 5);
  s = P.play(s, skill(s, 3, 3));
  assert.equal(s.eaten[3], 5); assert.equal(s.pollen[3], 0);
  assert.equal(s.broods[1][3], P.specialRules("butterfly").hatchPower + 5);
  s = P.play(s, skill(s, 4, 3));
  assert.equal(s.eaten[3], 5); assert.equal(s.pollen[3], 1);
  assert.equal(s.eaten[3] + s.pollen.reduce((a,b) => a+b), s.startingPollen);
  s = close(s);
  assert.deepEqual(s.result.gain, [1, 0]);
  assert.equal(s.players[1].score, 0);
});

test("guarding leaves the parent vulnerable to hits and pushes; its brood stays with the flower", () => {
  const s = fresh("butterfly", "beetle");
  s.players.forEach(p => { p.sun = 10; });
  deal(s.players[0], ["special"]); deal(s.players[1], ["special", "hit"]);
  s.pollen = [1,1,1,2,0]; s.board[0][3] = unit(5, 3); s.board[1][3] = unit(3, 2);
  const marked = P.play(s, skill(s, 3, 3));
  const hit = P.actions(marked).find(a => a.type === "hit" && a.lane === 3);
  assert.ok(P.play(marked, hit).board[0][3].power < 5);
  const moved = P.play(marked, skill(marked, 3, 4));
  assert.equal(moved.board[0][3], null);
  assert.ok(moved.board[0][4]);
  assert.equal(moved.broods[0][4], 0);
  const hatch = P.specialRules("butterfly").hatchPower + 2;
  assert.equal(moved.broods[0][3], hatch);
  const next = P.nextRound(close(moved));
  assert.equal(next.board[0][3].power, hatch);
  assert.equal(next.board[0][4], null);
});

test("AI keeps a guaranteed win instead of spending its own winning pollen on a brood; a final brood never hatches", () => {
  const s = fresh("butterfly", "spider");
  s.players[0].score = 29; s.players[0].sun = 10; s.players[1].passed = true;
  deal(s.players[0], ["special", "partner"]);
  s.pollen.fill(1); s.board[0][4] = unit(1);
  assert.deepEqual(P.chooseAI(s), pass); // Spending this flower would leave us at 29.
  s.board[1][4] = unit(3);
  s.pollen = [1,1,0,2,1];
  const move = P.chooseAI(s);
  assert.equal(move.type, "partner");
  const win = P.play(P.play(s, move), pass);
  assert.equal(win.winner, 0);
  s.board[0][0] = unit(1);
  const spent = P.play(s, skill(s, 4, 4)); // A human may still guard even though another lane wins the match.
  const ended = P.play(spent, pass);
  assert.equal(ended.winner, 0);
  assert.ok(ended.broods.flat().every(n => n === 0));
  assert.equal(ended.board[0][4].power, 1);
  assert.throws(() => P.nextRound(ended));
});

test("a hit cannot reduce below zero and the insect remains on its lane; a pass allows repeated plays", () => {
  let s = fresh();
  deal(s.players[1], ["hit"]);
  s.board[0][4] = unit(1);
  s = P.play(s, pass);
  const collision = P.actions(s).find(a => a.type === "hit" && a.lane === 4);
  const t = P.play(s, collision);
  assert.equal(t.turn, 1);
  assert.equal(t.board[0][4].power, 0);
  assert.ok(!P.actions(t).some(a => a.type === "hit"));
  const u = P.play(t, pass);
  assert.deepEqual(u.result.winners, [null, null, null, null, null]);
});

test("crossing thirty is decided from the entire round, ties continue past thirty", () => {
  const s = fresh("bee", "ant");
  s.players.forEach(p => { p.score = 29; });
  s.pollen = [1, 2, 0, 1, 1];
  s.board[0][0] = unit(1);
  s.board[1][1] = unit(1);
  let end = close(s);
  assert.equal(end.phase, "done");
  assert.equal(end.winner, 1);
  assert.deepEqual(end.players.map(p => p.score), [30, 31]);
  assert.throws(() => P.nextRound(end));
  s.pollen = [1, 1, 1, 1, 1];
  end = close(s);
  assert.equal(end.phase, "scored");
  assert.deepEqual(end.players.map(p => p.score), [30, 30]);
  end = P.nextRound(end);
  end.pollen.fill(1);
  end.board[0][4] = unit(1);
  assert.equal(close(end).winner, 0);
});

test("AI cannot inspect an opponent's private cards or either player's upcoming draws", () => {
  const s = fresh("bee", "ant");
  s.players[0].sun = 10;
  s.pollen.fill(1);
  deal(s.players[0], ["special"]);
  s.players[1].passed = true;
  s.board[0][1] = unit(1);
  s.board[1][0] = unit(1);
  for (const [player, keys] of [[s.players[1], ["hand", "draw", "discard"]], [s.players[0], ["draw", "discard"]]]) {
    for (const k of keys) Object.defineProperty(player, k, { get() { throw Error("read hidden " + k); } });
  }
  assert.deepEqual(P.chooseAI(s), skill(s, 0, 1));
});

test("ordered faction matches finish at thirty with conserved pollen and unique circulating cards", () => {
  for (const a of factions) for (const b of factions) {
    let s = fresh(a, b);
    while (s.phase !== "done") {
      if (s.phase === "scored") { s = P.nextRound(s); continue; }
      const move = P.chooseAI(s);
      assert.ok(P.actions(s).some(legal => key(legal) === key(move)));
      s = P.play(s, move);
      assert.ok(s.round <= 160, "guard for simulation loop");
      const onTable = s.pollen.reduce((x, y) => x + y, 0);
      assert.equal(onTable + s.eaten.reduce((x,y) => x+y, 0), s.startingPollen);
      if (s.result) assert.ok(s.result.gain[0] + s.result.gain[1] <= onTable);
      assert.ok(s.pollen.every(n => n >= 0));
      assert.ok(s.board.flat().every(x => !x || (Number.isSafeInteger(x.power) && x.power >= 0)));
      for (const p of s.players) {
        assert.equal(allCards(p).length, P.deckLimit);
        assert.equal(new Set(allCards(p).map(card => card.id)).size, P.deckLimit);
        assert.equal(allCards(p).filter(card => card.kind === "partner").length, 12);
        if (p.hand.length === 6) assert.ok(p.hand.filter(card => card.kind === "partner").length >= 2);
        assert.ok(p.sun >= 0 && p.sun <= 10);
      }
    }
    assert.ok(s.players[s.winner].score >= 30);
  }
});
