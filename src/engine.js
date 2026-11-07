(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./tuning.js"));
  else root.Pollen = factory(root.PollenTuning);
})(typeof window === "object" ? window : globalThis, function (tuning) {
  "use strict";

  const lanes = [0, 1, 2, 3, 4];
  const deckLimit = 16;
  const adjacent = lanes.map(lane => [lane - 1, lane + 1].filter(i => i >= 0 && i < lanes.length));
  const facing = lanes.map(lane => [lane]);
  const factions = Object.keys(tuning.factions);
  const partnerCosts = [1, 2, 3, 4];
  const hitImpacts = [1, 2, 3]; // Saved deck.hits values are strengths, including old recipes.
  const hitCost = impact => impact - 1;
  const supplyCost = 1;
  const powerForCost = cost => [0, 1, 3, 5, 7][cost];
  const projectedPower = unit => unit?.power || 0;
  const scorePower = (unit, isWebbed) => isWebbed ? 0 : projectedPower(unit);
  function lanePower(state, side, lane) {
    const webs = state.result?.webs || state.webs;
    return scorePower(state.board[side][lane], webs[side][lane]);
  }
  const rows = value => [lanes.map(() => value), lanes.map(() => value)];
  const emptyBoard = () => rows(null);
  const specialRules = faction => tuning.factions[faction];
  const specialCost = faction => specialRules(faction).cost;
  function defaultDeck(faction = "ant") {
    const preset = (specialRules(faction) || specialRules("ant")).deck;
    return { partners: [...preset.partners], hits: [...preset.hits], specials: preset.specials, supplies: preset.supplies };
  }

  function validList(list, values, maximum) {
    return Array.isArray(list) && list.length <= maximum && [...list].every(cost => values.includes(cost));
  }

  function openingChance(copies, total = deckLimit) {
    if (!Number.isInteger(total) || total < 0 || !Number.isInteger(copies) || copies < 0 || copies > total) {
      throw new RangeError("牌数须为整数，类别张数不能超过总数");
    }
    const hand = Math.min(total, 6);
    if (copies === 0) return 0;
    if (total - copies < hand) return 1;
    let miss = 1;
    for (let i = 0; i < hand; i++) miss *= (total - copies - i) / (total - i);
    return 1 - miss;
  }

  function recipeOfSize(deck, size) {
    return Boolean(deck && validList(deck.partners, partnerCosts, size) && deck.partners.length >= 1
      && validList(deck.hits, hitImpacts, size) && Number.isInteger(deck.specials) && deck.specials >= 0
      && Number.isInteger(deck.supplies) && deck.supplies >= 0
      && deck.partners.length + deck.hits.length + deck.specials + deck.supplies === size);
  }

  const validateDeck = deck => recipeOfSize(deck, deckLimit);
  function specialCount(deck) { return deck.specials ?? (deck.partners.length === 8 ? 1 : 8 - deck.hits.length); }

  function legacyRecipe(deck) {
    if (recipeOfSize(deck, 20)) return deck;
    if (!deck || typeof deck !== "object" || "specials" in deck || "supplies" in deck) return null;
    if (!validList(deck.partners, partnerCosts, 12) || !validList(deck.hits, hitImpacts, 7)) return null;
    if (deck.partners.length === 12 && deck.hits.length >= 2) return { ...deck, specials: 8 - deck.hits.length, supplies: 0 };
    if (deck.partners.length === 8 && deck.partners.every(cost => cost <= 3) && deck.hits.length === 3) {
      return { ...deck, specials: 1, supplies: 0 };
    }
    return null;
  }

  function apportion(counts, target) {
    const total = counts.reduce((sum, n) => sum + n, 0);
    const keepEach = counts.filter(Boolean).length <= target;
    const result = counts.map(n => keepEach && n > 0 ? 1 : 0);
    // At each step choose the greatest deficit from the original proportion. Integer
    // arithmetic and the input order break exact ties reproducibly, with no shuffle.
    for (let used = result.reduce((sum, n) => sum + n, 0); used < target; used++) {
      let best = -1, deficit = -Infinity;
      counts.forEach((n, i) => {
        const gap = target * n - total * result[i];
        if (n > 0 && gap > deficit) { best = i; deficit = gap; }
      });
      result[best]++;
    }
    return result;
  }

  function resizeCosts(list, costs, target) {
    const remaining = apportion(costs.map(cost => list.filter(n => n === cost).length), target);
    const kept = list.filter(cost => {
      const tier = costs.indexOf(cost);
      if (!remaining[tier]) return false;
      remaining[tier]--;
      return true;
    });
    // Only the early 12-card recipe needs additional copies. Duplicate original tiers.
    costs.forEach((cost, i) => { for (let n = 0; n < remaining[i]; n++) kept.push(cost); });
    return kept;
  }

  function migrateDeck(deck, faction = "ant") {
    if (validateDeck(deck)) return { partners: [...deck.partners], hits: [...deck.hits], specials: deck.specials, supplies: deck.supplies };
    const old = legacyRecipe(deck);
    if (!old) return defaultDeck(faction);
    const [partners, hits, specials, supplies] = apportion([old.partners.length, old.hits.length, old.specials, old.supplies], deckLimit);
    return { partners: resizeCosts(old.partners, partnerCosts, partners), hits: resizeCosts(old.hits, hitImpacts, hits), specials, supplies };
  }

  // Keeping the generator in the state makes previews repeatable.
  function random(state, stream = "seed") {
    state[stream] = (Math.imul(state[stream], 1664525) + 1013904223) >>> 0;
    return state[stream] / 4294967296;
  }

  function pollenIndex(state, choices) {
    // Equal-sized buckets; reject the few leftover values when 2^32 isn't divisible by choices.
    const size = Math.floor(4294967296 / choices);
    let value;
    do { value = random(state, "pollenSeed") * 4294967296; } while (value >= size * choices);
    return Math.floor(value / size);
  }

  function freshPollen(state) {
    const weights = tuning.pollenWeights;
    const total = weights.reduce((a,b) => a + b, 0);
    const pollen = lanes.map(() => {
      let roll = pollenIndex(state, total);
      for (let value = 0; value < weights.length; value++) {
        if (roll < weights[value]) return value;
        roll -= weights[value];
      }
      throw new Error("花粉权重无效");
    });
    state.startingPollen = pollen.reduce((a,b) => a + b, 0);
    return pollen;
  }

  function shuffle(cards, state) {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(random(state) * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
  }

  function makePlayer(faction, deck, side, state) {
    if (!factions.includes(faction)) throw new Error("未知的虫队");
    if (!validateDeck(deck) && legacyRecipe(deck)) deck = migrateDeck(deck, faction);
    if (!validateDeck(deck)) throw new Error("每副牌共 16 张，其中至少要有 1 张伙伴");
    const draw = deck.partners.map((cost, i) => ({ id: side + "-partner-" + i, kind: "partner", cost }));
    draw.push(...deck.hits.map((impact, i) => ({ id: side + "-hit-" + i, kind: "hit", cost: hitCost(impact), impact })));
    for (let i = 0; i < deck.specials; i++) {
      draw.push({ id: side + "-special-" + i, kind: "special", cost: specialCost(faction) });
    }
    for (let i = 0; i < deck.supplies; i++) {
      draw.push({ id: side + "-supply-" + i, kind: "supply", cost: supplyCost });
    }
    shuffle(draw, state);
    const deckOptions = { minPartner: Math.min(...deck.partners),
      minHit: deck.hits.length ? Math.min(...deck.hits.map(hitCost)) : null, hasSpecial: deck.specials > 0 };
    return { faction, sun: 3, score: 0, passed: false, canCycle: true, deckOptions,
      hand: [], draw, discard: [] };
  }

  function drawEvent(type, side = null, cardId = null) {
    return { type, side, cardId, drawn: [[], []], reshuffles: [0, 0] };
  }

  function drawOne(state, player, side) {
    if (!player.draw.length) {
      player.draw = player.discard.splice(0);
      if (!player.draw.length) return null;
      shuffle(player.draw, state);
      state.lastEvent.reshuffles[side]++;
    }
    const card = player.draw.pop();
    state.lastEvent.drawn[side].push(card.id);
    return card;
  }

  function refill(state, player, side) {
    while (player.hand.length < 6) {
      const card = drawOne(state, player, side);
      if (!card) break;
      player.hand.push(card);
    }
  }

  const availableDraws = p => deckLimit - p.hand.length;
  function supplyDrawCount(state, side = state.turn) {
    const p = state.players[side];
    return Math.max(0, Math.min(6, 7 - p.hand.length, availableDraws(p)));
  }

  function newGame(options = {}) {
    const rng = options.rng || Math.random;
    const first = options.first ?? (rng() < 0.5 ? 0 : 1);
    if (![0, 1].includes(first)) throw new Error("先手须为 0 或 1");
    const teams = options.factions || ["ant", "beetle"];
    const decks = options.decks || [];
    const seed = Math.floor(rng() * 4294967296) >>> 0;
    const state = { round: 1, first, turn: first, phase: "play", winner: null, result: null,
      board: emptyBoard(), webs: rows(false), broods: rows(0), eaten: lanes.map(() => 0), players: [],
      lastEvent: drawEvent("deal"), seed, pollenSeed: (seed ^ 0x9e3779b9) >>> 0 };
    // The public flower layout is independent of shuffles and private draw history.
    state.pollen = freshPollen(state);
    for (const side of [0, 1]) {
      const player = makePlayer(teams[side], decks[side] ?? defaultDeck(teams[side]), side, state);
      refill(state, player, side);
      state.players.push(player);
    }
    return state;
  }

  // Context has only the acting player's cards and the shared board.
  function context(state, side) {
    const p = state.players[side];
    return { own: state.board[side], enemy: state.board[1 - side], pollen: state.pollen, eaten: state.eaten,
      ownWeb: state.webs[side], enemyWeb: state.webs[1 - side],
      ownBrood: state.broods[side], enemyBrood: state.broods[1 - side],
      faction: p.faction, sun: p.sun, hand: p.hand, canCycle: p.canCycle,
      available: availableDraws(p), deckOptions: p.deckOptions };
  }

  function destinations(faction, from) { return (faction === "spider" || faction === "butterfly" ? facing : adjacent)[from]; }
  function specialFits(c, from, to) {
    switch (c.faction) {
      case "ant": return c.own[from]?.power > 0 && Boolean(c.own[to]);
      case "beetle": return Boolean(c.own[from] && c.enemy[from]);
      case "bee": return c.pollen[from] > 0 && Boolean(c.own[to]);
      case "spider": return !c.enemyWeb[to] || c.enemyBrood[to] > 0;
      case "butterfly": return Boolean(c.own[from]) && !c.ownBrood[from];
    }
  }

  function moves(c, showEveryCard = false) {
    const list = [];
    const seen = new Set();
    for (const card of c.hand) {
      if (showEveryCard && c.canCycle && c.available > 0) list.push({ type: "cycle", card: card.id });
      if (card.cost > c.sun) continue;
      // Public legal actions include every physical card. The AI can skip duplicate branches.
      const key = card.kind + (card.impact ?? card.cost);
      if (!showEveryCard && seen.has(key)) continue;
      seen.add(key);
      if (card.kind === "supply") {
        list.push({ type: "supply", card: card.id });
        continue;
      }
      if (card.kind !== "special") {
        for (const lane of lanes) {
          if (card.kind === "partner" ? !c.own[lane] && !c.ownWeb[lane] : c.enemy[lane]?.power > 0) {
            list.push({ type: card.kind, card: card.id, lane });
          }
        }
        continue;
      }
      for (const from of lanes) {
        for (const to of destinations(c.faction, from)) {
          if (specialFits(c, from, to)) {
            list.push({ type: "special", card: card.id, from, to });
          }
        }
      }
    }
    list.push({ type: "pass" });
    return list;
  }

  function actions(state, side = state.turn) {
    if (state.phase !== "play" || side !== state.turn || state.players[side].passed) return [];
    return moves(context(state, side), true);
  }

  function applyToContext(c, act) {
    const index = c.hand.findIndex(card => card.id === act.card);
    const [card] = c.hand.splice(index, 1);
    c.sun -= card.cost;
    if (act.type === "special") {
      const rules = specialRules(c.faction);
      if (c.faction === "ant") {
        const unit = c.own[act.to];
        c.own[act.to] = { ...unit, power: unit.power + c.own[act.from].power };
      } else if (c.faction === "beetle") {
        const pushed = c.enemy[act.from];
        c.ownWeb[act.from] = false;
        c.enemy[act.from] = c.enemy[act.to];
        c.enemy[act.to] = { ...pushed, power: Math.max(0, pushed.power - rules.pushLoss) };
      } else if (c.faction === "bee") {
        const amount = c.pollen[act.from];
        c.pollen[act.from] = 0;
        c.pollen[act.to] += amount;
      } else if (c.faction === "spider") {
        c.enemyWeb[act.from] = true;
        c.enemyBrood[act.from] = 0;
      } else if (c.faction === "butterfly") {
        const meal = c.pollen[act.from];
        c.ownBrood[act.from] = rules.hatchPower + meal;
        c.eaten[act.from] += meal;
        c.pollen[act.from] = 0;
      }
    } else if (card.kind === "partner") {
      const base = powerForCost(card.cost);
      c.own[act.lane] = { power: base, base, cost: card.cost };
    } else if (card.kind === "hit") {
      const unit = c.enemy[act.lane];
      c.enemy[act.lane] = { ...unit, power: Math.max(0, unit.power - card.impact) };
    }
    return card;
  }

  function finishRound(state) {
    const gain = [0, 0];
    const winners = lanes.map(lane => {
      const a = scorePower(state.board[0][lane], state.webs[0][lane]);
      const b = scorePower(state.board[1][lane], state.webs[1][lane]);
      const winner = a === b ? null : a > b ? 0 : 1;
      if (winner !== null) gain[winner] += state.pollen[lane];
      return winner;
    });
    state.result = { gain, winners, webs: state.webs };
    state.webs = rows(false);
    state.players.forEach((player, i) => { player.score += gain[i]; });
    const [a, b] = state.players.map(player => player.score);
    if (Math.max(a, b) >= 30 && a !== b) {
      state.phase = "done";
      state.winner = a > b ? 0 : 1;
      state.broods = rows(0);
    } else {
      state.phase = "scored";
    }
  }

  function sameAction(a, b) {
    if (!b || a.type !== b.type) return false;
    if (a.type === "pass") return true;
    if (a.type === "cycle" || a.type === "supply") return a.card === b.card;
    if (a.type === "special") return a.card === b.card && a.from === b.from && a.to === b.to;
    return a.card === b.card && a.lane === b.lane;
  }

  function play(state, action) {
    const act = actions(state).find(legal => sameAction(legal, action));
    if (!act) throw new Error("这一步现在不能走");
    const result = JSON.parse(JSON.stringify(state));
    const side = result.turn;
    const p = result.players[side];
    result.lastEvent = drawEvent(act.type, side, act.card ?? null);
    if (act.type === "pass") {
      p.passed = true;
    } else if (act.type === "cycle") {
      const slot = p.hand.findIndex(card => card.id === act.card);
      // Put the outgoing card back only AFTER drawing, even when the discard pile is reshuffled.
      const outgoing = p.hand[slot];
      const replacement = drawOne(result, p, side);
      if (!replacement) throw new Error("这轮没有别的牌可换");
      p.hand[slot] = replacement;
      p.discard.push(outgoing);
      p.canCycle = false;
    } else {
      const c = context(result, side);
      const used = applyToContext(c, act);
      // Hold the played supply out of the discard pile until its draws finish.
      if (act.type === "supply") refill(result, p, side);
      p.discard.push(used);
      p.sun = c.sun;
    }
    if (result.players.every(player => player.passed)) finishRound(result);
    else if (!result.players[1 - side].passed) result.turn = 1 - side;
    return result;
  }

  function nextRound(state) {
    if (state.phase !== "scored") throw new Error("当前不能开始下一轮");
    const result = JSON.parse(JSON.stringify(state));
    result.round++;
    result.turn = result.first = 1 - result.first;
    result.phase = "play";
    result.result = null;
    result.board = emptyBoard();
    result.webs = rows(false);
    result.broods = rows(0);
    result.eaten = lanes.map(() => 0);
    result.pollen = freshPollen(result);
    result.lastEvent = drawEvent("round");
    result.lastEvent.hatched = [[], []];
    for (const [side, player] of result.players.entries()) {
      for (const lane of lanes) {
        const power = state.broods[side][lane];
        if (power > 0) {
          result.board[side][lane] = { power, base: power, cost: 0, hatched: true };
          result.lastEvent.hatched[side].push(lane);
        }
      }
      player.sun = Math.min(2 + result.round, 10);
      player.passed = false;
      player.canCycle = true;
      refill(result, player, side);
    }
    return result;
  }

  function after(c, action) {
    const next = { ...c, hand: [...c.hand], own: [...c.own],
      enemy: [...c.enemy], pollen: [...c.pollen] };
    if (action.type === "special" && c.faction === "spider") {
      next.enemyWeb = [...c.enemyWeb];
      next.enemyBrood = [...c.enemyBrood];
    }
    if (action.type === "special" && c.faction === "beetle") next.ownWeb = [...c.ownWeb];
    if (action.type === "special" && c.faction === "butterfly") {
      next.ownBrood = [...c.ownBrood];
      next.eaten = [...c.eaten];
    }
    applyToContext(next, action);
    return next;
  }

  function evaluate(c, couldRespond, foeSun, myScore, foeScore) {
    let value = 0, future = 0;
    const largestPartner = powerForCost(Math.min(foeSun, 4));
    for (const lane of lanes) {
      const a = scorePower(c.own[lane], c.ownWeb[lane]);
      const b = scorePower(c.enemy[lane], c.enemyWeb[lane]);
      const lead = a - b;
      if (lead > 0) myScore += c.pollen[lane];
      if (lead < 0) foeScore += c.pollen[lane];
      // Once the other player passes, only actual points matter.
      const buffer = couldRespond ? Math.max(-3, Math.min(3, lead)) * 0.09 : 0;
      value += c.pollen[lane] * (Math.sign(lead) + buffer);
      if (foeSun > 0 && c.enemyWeb[lane] && !c.enemy[lane]) {
        if (a > 0) {
          value += c.pollen[lane] * (a <= largestPartner ? 0.72 : 0.15);
        } else {
          // With no collector of our own, a pre-emptive net can only deny pollen.
          // An equally good open flower lets the opponent simply deploy elsewhere.
          let alternative = 0;
          for (const other of lanes) {
            if (other !== lane && !c.enemy[other] && !c.enemyWeb[other] &&
                scorePower(c.own[other], c.ownWeb[other]) <= largestPartner) {
              alternative = Math.max(alternative, c.pollen[other]);
            }
          }
          value += 0.65 * Math.max(0, c.pollen[lane] - alternative);
        }
      }
      const hatchLead = c.ownBrood[lane] - c.enemyBrood[lane];
      if (hatchLead) future += Math.sign(hatchLead) * (0.55 + 0.08 * Math.min(6, Math.abs(hatchLead)));
    }
    if (Math.max(myScore, foeScore) >= 30 && myScore !== foeScore) {
      if (!couldRespond) return Math.sign(myScore - foeScore) * 100 + value;
      return value + future * 0.15; // Broods may never hatch in a deciding round.
    }
    return value + future;
  }

  function winsAtClose(c, mine, theirs) {
    for (const lane of lanes) {
      const lead = scorePower(c.own[lane], c.ownWeb[lane]) - scorePower(c.enemy[lane], c.enemyWeb[lane]);
      if (lead > 0) mine += c.pollen[lane];
      if (lead < 0) theirs += c.pollen[lane];
    }
    return mine >= 30 && mine > theirs;
  }

  function exchangeCandidate(c) {
    if (!c.canCycle || !c.hand.length || c.available === 0) return null;
    const partners = c.hand.filter(card => card.kind === "partner").length;
    let chosen = null, highest = -Infinity;
    for (const card of c.hand) {
      const copies = c.hand.filter(other => other.kind === card.kind && other.cost === card.cost && other.impact === card.impact).length;
      let unwanted = copies * 0.4;
      if (card.kind === "partner") {
        unwanted += partners >= 4 ? 0.9 : -2;
        unwanted += card.cost > c.sun ? 0.6 : 0;
      } else {
        unwanted += partners < 2 ? 2 : 0;
        if (card.kind === "hit") unwanted += 0.7 - card.impact * 0.08;
        if (card.kind === "special" && c.hand.filter(x => x.kind === "special").length > 1) unwanted++;
      }
      if (unwanted > highest) {
        highest = unwanted;
        chosen = card;
      }
    }
    if (c.sun === 0 && highest < 1) return null;
    return { type: "cycle", card: chosen.id };
  }

  function chooseAI(state, side = state.turn) {
    if (state.phase !== "play" || side !== state.turn || state.players[side].passed) return null;
    const c = context(state, side);
    const opponent = state.players[1 - side];
    // The face of an opponent's hand stays hidden. Check whether the projected board permits
    // their faction's free play, even if the opponent's last sun has already been spent.
    const couldRespond = board => {
      if (opponent.passed) return false;
      if (opponent.sun > 0) return true;
      // A one-strength hit is free and can be drawn or exchanged into. We never
      // inspect the opponent's hand, draw pile, or selected deck to predict one.
      if (board.own.some(unit => projectedPower(unit) > 0)) return true;
      if (specialCost(opponent.faction) !== 0) return false;
      const reverse = { faction: opponent.faction, own: board.enemy, enemy: board.own, pollen: board.pollen,
        enemyWeb: board.ownWeb, ownBrood: board.enemyBrood, enemyBrood: board.ownBrood };
      return lanes.some(from => destinations(opponent.faction, from).some(to =>
        specialFits(reverse, from, to)));
    };
    const foeSun = opponent.passed ? 0 : opponent.sun;
    const rate = board => evaluate(board, couldRespond(board), foeSun, state.players[side].score, opponent.score)
      + board.sun * 0.005;
    let best = { type: "pass" };
    const holdValue = rate(c);
    let bestValue = holdValue;
    if (!couldRespond(c) && winsAtClose(c, state.players[side].score, opponent.score)) return best;
    const noWebThreat = c.faction === "spider" && foeSun === 0;
    for (const move of moves(c)) {
      if (move.type === "pass" || move.type === "supply") continue;
      if (noWebThreat && move.type === "special" &&
          !c.enemyBrood[move.from] &&
          !(projectedPower(c.enemy[move.from]) > 0 && c.pollen[move.from] > 0)) continue;
      const now = after(c, move);
      const value = rate(now);
      let follow = value;
      for (const reply of moves(now)) {
        if (reply.type !== "pass" && reply.type !== "supply") follow = Math.max(follow, rate(after(now, reply)));
      }
      // Prefer an immediate capture to a speculative two-card combination.
      const adjusted = value + (follow - value) * (couldRespond(now) ? 0.60 : 0.90);
      if (adjusted > bestValue + 0.00001) {
        bestValue = adjusted;
        best = move;
      }
    }
    if (best.type !== "pass" && (c.hand.length > 3 || !c.hand.some(card => card.kind === "supply"))) return best;
    // Compare a large refill with a marginal board play. Only consider options usable
    // with the sun left after paying; never look at the next cards in the pile.
    const opts = c.deckOptions;
    const remainingSun = c.sun - supplyCost;
    const couldUseDraw = c.available > 0 && remainingSun >= 0 && (
      (opts.minPartner <= remainingSun && lanes.some(lane => !c.own[lane] && !c.ownWeb[lane])) ||
      (opts.minHit !== null && opts.minHit <= remainingSun && c.enemy.some(unit => projectedPower(unit) > 0)) ||
      (opts.hasSpecial && specialCost(c.faction) <= remainingSun && lanes.some(from =>
        destinations(c.faction, from).some(to => specialFits(c, from, to))))
    );
    const supply = couldUseDraw && c.hand.find(card => card.kind === "supply" && card.cost <= c.sun);
    const draw = supply ? { type: "supply", card: supply.id } : null;
    if (draw && c.hand.length <= 3 && bestValue - holdValue < 0.15 * (7 - c.hand.length)) return draw;
    if (best.type !== "pass") return best;
    if (draw && c.hand.length < 6) return draw;
    return exchangeCandidate(c) || draw || best;
  }

  return { newGame, actions, play, nextRound, chooseAI, defaultDeck, validateDeck, migrateDeck, powerForCost, projectedPower, scorePower, lanePower, hitCost, supplyCost, supplyDrawCount, specialCost, specialCount, openingChance, specialRules, tuning, deckLimit };
});
