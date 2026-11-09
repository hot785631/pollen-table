(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./tuning.js"), require("./campaign-rules.js"));
  else root.Pollen = factory(root.PollenTuning, root.PollenCampaignRules);
})(typeof window === "object" ? window : globalThis, function (tuning, campaigns) {
  "use strict";

  const lanes = [0, 1, 2, 3, 4];
  const deckLimit = 16;
  const adjacent = lanes.map(lane => [lane - 1, lane + 1].filter(i => i >= 0 && i < lanes.length));
  const facing = lanes.map(lane => [lane]);
  const hornetDestinations = lanes.map(lane => [...adjacent[lane], lane]);
  const factions = Object.keys(tuning.factions);
  const partnerCosts = [1, 2, 3, 4];
  const hitImpacts = [1, 2, 3]; // Saved deck.hits values are strengths, including old recipes.
  const hitCost = impact => impact - 1;
  const supplyCost = 1;
  const powerForCost = cost => [0, 1, 3, 5, 7][cost];
  const projectedPower = unit => unit?.power || 0;
  const scorePower = (unit, isWebbed) => isWebbed ? 0 : projectedPower(unit);
  // Every surviving cocoon at a given flower gets an equal whole-number share.
  // Compute all five flowers from one snapshot before changing any cocoon or pile.
  function broodMeal(state, lane) {
    if (state.result?.meals) return state.result.meals[lane];
    const diners = [], counts = [0, 0], shares = [0, 0];
    for (const side of [0, 1]) {
      for (const home of lanes) {
        const forage = state.broodForage[side][home];
        if (!state.broods[side][home] || !(forage ? forage.includes(lane) : home === lane)) continue;
        diners.push({ side, home, amount: 0 });
        counts[side]++;
      }
    }
    const pollen = state.pollen[lane];
    const each = diners.length ? Math.floor(pollen / diners.length) : 0;
    for (const diner of diners) { diner.amount = each; shares[diner.side] += each; }
    return { counts, shares, remaining: pollen - each * diners.length, diners };
  }
  function projectedHatch(state, side, home) {
    if (state.result) return state.result.hatches[side][home];
    const base = state.broods[side][home];
    if (!base) return 0;
    const forage = state.broodForage[side][home];
    let power = base;
    for (const lane of (forage || [home])) {
      const diner = broodMeal(state, lane).diners.find(d => d.side === side && d.home === home);
      power += diner.amount;
    }
    return power;
  }
  function laneFeeder(state, lane) {
    const [a, b] = broodMeal(state, lane).counts;
    return a && !b ? 0 : b && !a ? 1 : null;
  }
  function webDuration(state, side, lane) {
    const source = state.result || state;
    return source.webs[side][lane] ? (source.lastingWebs[side][lane] ? 2 : 1) : 0;
  }
  function lanePower(state, side, lane) {
    const webs = state.result?.webs || state.webs;
    return scorePower(state.board[side][lane], webs[side][lane]);
  }
  const rows = value => [lanes.map(() => value), lanes.map(() => value)];
  const emptyBoard = () => rows(null);
  const specialRules = faction => tuning.factions[faction];
  const specialCost = faction => specialRules(faction).cost;
  const skillOf = (card, fallbackFaction) => card?.skill || fallbackFaction;
  const campaignEncounter = (faction, stage) => campaigns.encounter(faction, stage, defaultDeck);
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

  function randomIndex(state, choices, stream) {
    // Equal-sized buckets; reject the few leftover values when 2^32 isn't divisible by choices.
    const size = Math.floor(4294967296 / choices);
    let value;
    do { value = random(state, stream) * 4294967296; } while (value >= size * choices);
    return Math.floor(value / size);
  }

  function freshPollen(state) {
    const weights = tuning.pollenWeights;
    const total = weights.reduce((a,b) => a + b, 0);
    const pollen = lanes.map(() => {
      let roll = randomIndex(state, total, "pollenSeed");
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

  function makePlayer(faction, deck, side, state, skills) {
    if (!factions.includes(faction)) throw new Error("未知的虫队");
    if (!validateDeck(deck) && legacyRecipe(deck)) deck = migrateDeck(deck, faction);
    if (!validateDeck(deck)) throw new Error("每副牌共 16 张，其中至少要有 1 张伙伴");
    const draw = deck.partners.map((cost, i) => ({ id: side + "-partner-" + i, kind: "partner", cost }));
    draw.push(...deck.hits.map((impact, i) => ({ id: side + "-hit-" + i, kind: "hit", cost: hitCost(impact), impact })));
    skills ??= [{ faction, enhanced: false, copies: deck.specials }];
    let i = 0;
    for (const spec of skills) {
      for (let n = 0; n < spec.copies; n++, i++) {
        draw.push({ id: side + "-special-" + i, kind: "special", skill: spec.faction, enhanced: spec.enhanced, cost: specialCost(spec.faction) });
      }
    }
    for (let i = 0; i < deck.supplies; i++) {
      draw.push({ id: side + "-supply-" + i, kind: "supply", cost: supplyCost });
    }
    shuffle(draw, state);
    const deckOptions = { minPartner: Math.min(...deck.partners),
      minHit: deck.hits.length ? Math.min(...deck.hits.map(hitCost)) : null, hasSpecial: deck.specials > 0, skills };
    return { faction, sun: 3, score: 0, passed: false, canCycle: true, deckOptions,
      hand: [], draw, discard: [] };
  }

  function drawEvent(type, side = null, cardId = null) {
    return { type, side, cardId, drawn: [[], []], reshuffles: [0, 0] };
  }

  function dealPublicSkill(state) {
    if (state.campaign?.stage !== 6) return;
    const skills = state.campaign.skills;
    const spec = skills[randomIndex(state,skills.length,"publicSeed")];
    const card = { id:"1-public-"+state.round, kind:"special", skill:spec.faction, enhanced:spec.enhanced,
      cost:specialCost(spec.faction), public:true };
    state.players[1].publicSkill = card;
    state.lastEvent.revealedSkill = card;
  }
  const visibleSkill = (state, side) => state.players[side].publicSkill || null;
  function cardForAction(state, side, action) {
    const id = typeof action === "string" ? action : action?.card;
    const card = visibleSkill(state,side);
    return card && card.id === id ? card : state.players[side].hand.find(c => c.id === id) || null;
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
    const campaign = options.campaign ? campaignEncounter(options.campaign.faction, options.campaign.stage) : null;
    const teams = campaign ? [campaign.faction, campaign.opponent] : options.factions || ["ant", "beetle"];
    const decks = options.decks || [];
    const seed = Math.floor(rng() * 4294967296) >>> 0;
    const state = { round: 1, first, turn: first, phase: "play", winner: null, result: null,
      board: emptyBoard(), webs: rows(false), lastingWebs: rows(false), broods: rows(0), broodForage: rows(null),
      eaten: lanes.map(() => 0), players: [],
      lastEvent: drawEvent("deal"), seed, pollenSeed: (seed ^ 0x9e3779b9) >>> 0 };
    if (campaign) state.campaign = { faction: campaign.faction, stage: campaign.stage, skills: campaign.skills };
    if (campaign?.stage === 6) state.publicSeed = (seed ^ 0xa341316c) >>> 0;
    // The public flower layout is independent of shuffles and private draw history.
    state.pollen = freshPollen(state);
    for (const side of [0, 1]) {
      const elite = side === 1 && campaign;
      const player = makePlayer(teams[side], elite ? elite.deck : decks[side] ?? defaultDeck(teams[side]), side, state, elite ? elite.skills : undefined);
      refill(state, player, side);
      state.players.push(player);
    }
    dealPublicSkill(state);
    return state;
  }

  // Context has only the acting player's cards and the shared board.
  function context(state, side) {
    const p = state.players[side];
    return { side, own: state.board[side], enemy: state.board[1 - side], pollen: state.pollen,
      ownForage: state.broodForage[side], enemyForage: state.broodForage[1 - side],
      ownLasting: state.lastingWebs[side], enemyLasting: state.lastingWebs[1 - side],
      ownWeb: state.webs[side], enemyWeb: state.webs[1 - side],
      ownBrood: state.broods[side], enemyBrood: state.broods[1 - side],
      faction: p.faction, sun: p.sun, hand: p.hand, publicSkill:visibleSkill(state,side), canCycle: p.canCycle,
      available: availableDraws(p), deckOptions: p.deckOptions };
  }

  function destinations(faction, from, enhanced = false) {
    if (enhanced && faction === "butterfly") return lanes;
    if (enhanced && faction === "ant") return facing[from];
    if (enhanced && faction === "bee") return hornetDestinations[from];
    return (faction === "spider" || faction === "butterfly" ? facing : adjacent)[from];
  }
  function specialFits(c, from, to, faction = c.faction, enhanced = false) {
    switch (faction) {
      case "ant": return c.own[from]?.power > 0 && (enhanced ? adjacent[from].some(i => c.own[i]) : Boolean(c.own[to]));
      case "beetle": return Boolean(c.own[from] && c.enemy[from]);
      case "bee": return Boolean(c.own[to]) && (enhanced && from === to ?
        adjacent[to].length === 2 && adjacent[to].every(i => c.pollen[i] > 0) : c.pollen[from] > 0);
      case "spider": return !c.enemyWeb[to] || c.enemyBrood[to] > 0;
      case "butterfly": return Boolean(c.own[from]) && !c.ownBrood[from];
    }
  }

  function moves(c, showEveryCard = false, legacyDouble = false) {
    const list = [];
    const seen = new Set();
    // Where effects match, the AI spends the expiring public card first.
    for (const card of (c.publicSkill ? [c.publicSkill,...c.hand] : c.hand)) {
      if (!card.public && showEveryCard && c.canCycle && c.available > 0) list.push({ type: "cycle", card: card.id });
      if (card.cost > c.sun) continue;
      // Public legal actions include every physical card. The AI can skip duplicate branches.
      const skill = skillOf(card, c.faction);
      const key = card.kind === "special" ? "special" + skill + card.enhanced : card.kind + (card.impact ?? card.cost);
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
      if (skill === "bee" && card.enhanced) {
        for (const to of lanes) {
          if (!c.own[to]) continue;
          const sources = adjacent[to].filter(lane => c.pollen[lane] > 0);
          if (!legacyDouble || sources.length === 1) {
            for (const from of sources) list.push({ type:"special", card:card.id, from, to });
          }
          if (sources.length === 2) list.push({ type:"special", card:card.id, from:to, to });
        }
        continue;
      }
      for (const from of lanes) {
        for (const to of destinations(skill, from, card.enhanced)) {
          if (!specialFits(c, from, to, skill, card.enhanced)) continue;
          if (skill === "butterfly" && card.enhanced) {
            for (const also of lanes) if (to < also) list.push({ type: "special", card: card.id, from, to, also });
          } else list.push({ type: "special", card: card.id, from, to });
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

  const contextCard = (c,id) => c.publicSkill?.id === id ? c.publicSkill : c.hand.find(card => card.id === id);
  function applyToContext(c, act) {
    let card;
    if (c.publicSkill?.id === act.card) {
      card = c.publicSkill;
      c.publicSkill = null;
    } else {
      const index = c.hand.findIndex(card => card.id === act.card);
      [card] = c.hand.splice(index, 1);
    }
    c.sun -= card.cost;
    if (act.type === "special") {
      const skill = skillOf(card, c.faction), rules = specialRules(skill);
      if (skill === "ant") {
        for (const to of (card.enhanced ? adjacent[act.from] : [act.to])) {
          const unit = c.own[to];
          if (unit) c.own[to] = { ...unit, power: unit.power + c.own[act.from].power };
        }
      } else if (skill === "beetle") {
        const pushed = c.enemy[act.from];
        c.ownWeb[act.from] = false;
        c.ownLasting[act.from] = false;
        c.enemy[act.from] = c.enemy[act.to];
        c.enemy[act.to] = { ...pushed, power: Math.max(0, pushed.power - (card.enhanced ? 4 : rules.pushLoss)) };
      } else if (skill === "bee") {
        for (const source of (card.enhanced && act.from === act.to ? adjacent[act.to] : [act.from])) {
          c.pollen[act.to] += c.pollen[source];
          c.pollen[source] = 0;
        }
      } else if (skill === "spider") {
        c.enemyWeb[act.from] = true;
        if (card.enhanced) c.enemyLasting[act.from] = true;
        c.enemyBrood[act.from] = 0;
        c.enemyForage[act.from] = null;
      } else if (skill === "butterfly") {
        c.ownBrood[act.from] = rules.hatchPower;
        c.ownForage[act.from] = card.enhanced ? [act.to, act.also] : null;
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
    const meals = lanes.map(lane => broodMeal(state, lane));
    const feeders = meals.map(({ counts: [a, b] }) => a && !b ? 0 : b && !a ? 1 : null);
    const winners = lanes.map(lane => {
      const meal = meals[lane];
      for (const diner of meal.diners) state.broods[diner.side][diner.home] += diner.amount;
      state.eaten[lane] = state.pollen[lane] - meal.remaining;
      state.pollen[lane] = meal.remaining;
      if (meal.diners.length && !meal.remaining) return null;
      const a = scorePower(state.board[0][lane], state.webs[0][lane]);
      const b = scorePower(state.board[1][lane], state.webs[1][lane]);
      const winner = a === b ? null : a > b ? 0 : 1;
      if (winner !== null) gain[winner] += state.pollen[lane];
      return winner;
    });
    state.result = { gain, winners, feeders, meals, hatches: state.broods.map(row => [...row]), webs: state.webs, lastingWebs: state.lastingWebs };
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
    if (a.type === "special") return a.card === b.card && a.from === b.from && a.to === b.to && a.also === b.also;
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
      if (used.public) p.publicSkill = null;
      else p.discard.push(used);
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
    result.webs = state.result.lastingWebs.map(row => [...row]);
    result.lastingWebs = rows(false);
    result.broods = rows(0);
    result.broodForage = rows(null);
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
    dealPublicSkill(result);
    return result;
  }

  function after(c, action) {
    const next = { ...c, hand: [...c.hand], own: [...c.own],
      enemy: [...c.enemy], pollen: [...c.pollen] };
    const skill = action.type === "special" && skillOf(contextCard(c,action.card), c.faction);
    if (skill === "spider") {
      next.enemyWeb = [...c.enemyWeb];
      next.enemyBrood = [...c.enemyBrood];
      next.enemyForage = [...c.enemyForage];
      next.enemyLasting = [...c.enemyLasting];
    }
    if (skill === "beetle") { next.ownWeb = [...c.ownWeb]; next.ownLasting = [...c.ownLasting]; }
    if (skill === "butterfly") {
      next.ownBrood = [...c.ownBrood];
      next.ownForage = [...c.ownForage];
    }
    applyToContext(next, action);
    return next;
  }

  function projectedMeals(c) {
    if (c.ownForage.every(i => i === null) && c.enemyForage.every(i => i === null)) return null;
    const remaining = [], hatch = [[...c.ownBrood], [...c.enemyBrood]];
    const table = { broods: [c.ownBrood, c.enemyBrood], broodForage: [c.ownForage, c.enemyForage], pollen: c.pollen };
    for (const lane of lanes) {
      const meal = broodMeal(table, lane);
      remaining[lane] = meal.remaining;
      for (const diner of meal.diners) hatch[diner.side][diner.home] += diner.amount;
    }
    return { remaining, hatch };
  }
  function pollenLeft(c, lane, projected) {
    if (projected) return projected.remaining[lane];
    const diners = Number(c.ownBrood[lane] > 0) + Number(c.enemyBrood[lane] > 0);
    return diners ? c.pollen[lane] % diners : c.pollen[lane];
  }
  function evaluate(c, couldRespond, foeSun, myScore, foeScore) {
    let value = 0, future = 0;
    const largestPartner = powerForCost(Math.min(foeSun, 4));
    const projected = projectedMeals(c);
    for (const lane of lanes) {
      if (c.ownBrood[lane] || c.enemyBrood[lane]) {
        const hatchLead = projected ? projected.hatch[0][lane] - projected.hatch[1][lane] :
          c.ownBrood[lane] - c.enemyBrood[lane] + (Number(c.ownBrood[lane] > 0) - Number(c.enemyBrood[lane] > 0)) * c.pollen[lane];
        if (hatchLead) future += Math.sign(hatchLead) * (0.55 + 0.08 * Math.min(6, Math.abs(hatchLead)));
      }
      if (c.enemyLasting[lane]) future += 0.62;
      if (c.ownLasting[lane]) future -= 0.62;
      const pollen = pollenLeft(c, lane, projected);
      if (!pollen) continue;
      const a = scorePower(c.own[lane], c.ownWeb[lane]);
      const b = scorePower(c.enemy[lane], c.enemyWeb[lane]);
      const lead = a - b;
      if (lead > 0) myScore += pollen;
      if (lead < 0) foeScore += pollen;
      // Once the other player passes, only actual points matter.
      const buffer = couldRespond ? Math.max(-3, Math.min(3, lead)) * 0.09 : 0;
      value += pollen * (Math.sign(lead) + buffer);
      if (foeSun > 0 && c.enemyWeb[lane] && !c.enemy[lane]) {
        if (a > 0) {
          value += pollen * (a <= largestPartner ? 0.72 : 0.15);
        } else {
          // With no collector of our own, a pre-emptive net can only deny pollen.
          // An equally good open flower lets the opponent simply deploy elsewhere.
          let alternative = 0;
          for (const other of lanes) {
            if (other !== lane && !c.enemy[other] && !c.enemyWeb[other] &&
                scorePower(c.own[other], c.ownWeb[other]) <= largestPartner) {
              alternative = Math.max(alternative, pollenLeft(c, other, projected));
            }
          }
          value += 0.65 * Math.max(0, pollen - alternative);
        }
      }
    }
    if (Math.max(myScore, foeScore) >= 30 && myScore !== foeScore) {
      if (!couldRespond) return Math.sign(myScore - foeScore) * 100 + value;
      return value + future * 0.15; // Broods may never hatch in a deciding round.
    }
    return value + future;
  }

  function winsAtClose(c, mine, theirs) {
    const projected = projectedMeals(c);
    for (const lane of lanes) {
      const lead = scorePower(c.own[lane], c.ownWeb[lane]) - scorePower(c.enemy[lane], c.enemyWeb[lane]);
      if (lead > 0) mine += pollenLeft(c, lane, projected);
      if (lead < 0) theirs += pollenLeft(c, lane, projected);
    }
    return mine >= 30 && mine > theirs;
  }

  function exchangeCandidate(c) {
    if (!c.canCycle || !c.hand.length || c.available === 0) return null;
    const partners = c.hand.filter(card => card.kind === "partner").length;
    let chosen = null, highest = -Infinity;
    for (const card of c.hand) {
      const copies = c.hand.filter(other => other.kind === card.kind && other.cost === card.cost && other.impact === card.impact && other.skill === card.skill && other.enhanced === card.enhanced).length;
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

  // Estimate how much pollen one plausible reply could take back. Only public insects,
  // available sun and announced abilities are used; no opponent card identity or draw.
  function hornetPosition(c, opponent, weights) {
    if (opponent.passed) return 0;
    const meals = projectedMeals(c);
    const potential = [], grades = [], remaining = [];
    let worstReply = 0;
    for (const lane of lanes) {
      const mine = scorePower(c.own[lane], c.ownWeb[lane]);
      const theirs = scorePower(c.enemy[lane], c.enemyWeb[lane]);
      const grade = Math.sign(mine-theirs);
      grades[lane] = grade;
      remaining[lane] = pollenLeft(c,lane,meals);
      let exposure = 0;
      if (!c.enemy[lane] && !c.enemyWeb[lane]) {
        for (let fee=1;fee<=Math.min(4,opponent.sun);fee++) {
          const swing = grade-Math.sign(mine-powerForCost(fee));
          exposure = Math.max(exposure,swing*weights.deployment[fee]);
        }
      }
      if (mine > 0) {
        const impact = Math.min(3,opponent.sun+1);
        const hitSwing = grade-Math.sign(Math.max(0,mine-impact)-theirs);
        exposure = Math.max(exposure,hitSwing*weights.hit);
      }
      potential[lane] = grade-exposure;
      worstReply = Math.max(worstReply,exposure*remaining[lane]);
    }
    if (opponent.faction === "bee" && opponent.sun >= specialCost("bee")) {
      for (const from of lanes) for (const to of adjacent[from]) {
        if (c.enemy[to]) worstReply = Math.max(worstReply,weights.transfer*remaining[from]*(grades[from]-grades[to]));
      }
    }
    // A strong body on an empty flower can prepare an actual transfer next action.
    // Look at the reachable, exposed piles only when we really hold the requisite card.
    let preparation = 0;
    const ready = card => card?.skill === "bee" && card.enhanced && card.cost <= c.sun;
    if (ready(c.publicSkill) || c.hand.some(ready)) {
      for (const to of lanes) {
        if (!c.own[to] || potential[to] <= 0 || c.ownWeb[to]) continue;
        let reachable = 0;
        for (const from of adjacent[to]) reachable += remaining[from]*Math.max(0,potential[to]-potential[from]);
        preparation = Math.max(preparation,reachable);
      }
    }
    return weights.preparation*preparation - weights.risk*worstReply;
  }

  function openReplyRisk(c, opponent, theirCard, myScore) {
    if (!theirCard || opponent.passed || theirCard.cost > opponent.sun) return 0;
    // The seventh card is face-up. Model only that known action, using the same
    // legal moves and board effects as play(). The opponent's six cards stay hidden.
    const reverse = { side:1-c.side, faction:opponent.faction, sun:opponent.sun, hand:[], publicSkill:theirCard,
      pollen:c.pollen, own:c.enemy, enemy:c.own, ownWeb:c.enemyWeb, enemyWeb:c.ownWeb,
      ownLasting:c.enemyLasting, enemyLasting:c.ownLasting, ownBrood:c.enemyBrood, enemyBrood:c.ownBrood,
      ownForage:c.enemyForage, enemyForage:c.ownForage };
    const current = evaluate(reverse,false,0,opponent.score,myScore);
    let strongest = current;
    for (const move of moves(reverse)) {
      if (move.type !== "special") continue;
      const response = after(reverse,move);
      strongest = Math.max(strongest,evaluate(response,false,0,opponent.score,myScore));
    }
    return 0.6 * (strongest - current);
  }

  function chooseAI(state, side = state.turn, options = {}) {
    if (state.phase !== "play" || side !== state.turn || state.players[side].passed) return null;
    const c = context(state, side);
    const opponent = state.players[1 - side];
    const legacyDouble = options.beePolicy === "legacy-double";
    const useHornet = !legacyDouble && options.beePolicy !== "baseline" &&
      c.deckOptions.skills.some(spec => spec.faction === "bee" && spec.enhanced && spec.copies > 0);
    // The face of an opponent's hand stays hidden. Check whether the projected board permits
    // their faction's free play, even if the opponent's last sun has already been spent.
    const couldRespond = board => {
      if (opponent.passed) return false;
      if (opponent.sun > 0) return true;
      // A one-strength hit is free and can be drawn or exchanged into. We never
      // inspect the opponent's hand, draw pile, or selected deck to predict one.
      if (board.own.some(unit => projectedPower(unit) > 0)) return true;
      const skills = side === 0 && state.campaign ? state.campaign.skills : [{ faction: opponent.faction, enhanced: false }];
      const reverse = { faction: opponent.faction, own: board.enemy, enemy: board.own, pollen: board.pollen,
        enemyWeb: board.ownWeb, ownBrood: board.enemyBrood, enemyBrood: board.ownBrood };
      return skills.some(spec => specialCost(spec.faction) === 0 && lanes.some(from =>
        destinations(spec.faction, from, spec.enhanced).some(to => specialFits(reverse, from, to, spec.faction, spec.enhanced))));
    };
    const foeSun = opponent.passed ? 0 : opponent.sun;
    const rate = board => evaluate(board, couldRespond(board), foeSun, state.players[side].score, opponent.score)
      + board.sun * 0.005 + (useHornet ? hornetPosition(board, opponent, campaigns.hornetTactics) : 0);
    let best = { type: "pass" };
    const threat = visibleSkill(state,1-side);
    const openRisk = board => threat ? openReplyRisk(board,opponent,threat,state.players[side].score) : 0;
    const holdValue = rate(c) - openRisk(c);
    let bestValue = holdValue;
    if (!couldRespond(c) && winsAtClose(c, state.players[side].score, opponent.score)) return best;
    for (const move of moves(c,false,legacyDouble)) {
      if (move.type === "pass" || move.type === "supply") continue;
      const card = move.type === "special" && contextCard(c,move.card);
      if (foeSun === 0 && card && !card.enhanced && skillOf(card, c.faction) === "spider" &&
          !c.enemyBrood[move.from] &&
          !(projectedPower(c.enemy[move.from]) > 0 && c.pollen[move.from] > 0)) continue;
      const now = after(c, move);
      const value = rate(now);
      let follow = value;
      for (const reply of moves(now,false,legacyDouble)) {
        if (reply.type !== "pass" && reply.type !== "supply") follow = Math.max(follow, rate(after(now, reply)));
      }
      // Prefer an immediate capture to a speculative two-card combination.
      const adjusted = value + (follow - value) * (couldRespond(now) ? 0.60 : 0.90) - openRisk(now);
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
      (opts.hasSpecial && opts.skills.some(spec => specialCost(spec.faction) <= remainingSun && lanes.some(from =>
        destinations(spec.faction, from, spec.enhanced).some(to => specialFits(c, from, to, spec.faction, spec.enhanced)))))
    );
    const supply = couldUseDraw && c.hand.find(card => card.kind === "supply" && card.cost <= c.sun);
    const draw = supply ? { type: "supply", card: supply.id } : null;
    if (draw && c.hand.length <= 3 && bestValue - holdValue < 0.15 * (7 - c.hand.length)) return draw;
    if (best.type !== "pass") return best;
    if (draw && c.hand.length < 6) return draw;
    return exchangeCandidate(c) || draw || best;
  }

  return { newGame, actions, play, nextRound, chooseAI, defaultDeck, validateDeck, migrateDeck, powerForCost, projectedPower, scorePower, lanePower, laneFeeder, broodMeal, projectedHatch, webDuration, skillOf, visibleSkill, cardForAction, campaignEncounter, hitCost, supplyCost, supplyDrawCount, specialCost, specialCount, openingChance, specialRules, tuning, deckLimit };
});
