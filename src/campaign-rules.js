(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PollenCampaignRules = factory();
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  // Remaining factions sorted by the player's default-deck wins in balance-result.json.
  // 1,600 matches per pair, seed blocks 820000–820399.
  const order = {
    ant: ["bee", "spider", "beetle", "butterfly"],
    bee: ["beetle", "butterfly", "spider", "ant"],
    beetle: ["spider", "ant", "butterfly", "bee"],
    spider: ["butterfly", "bee", "ant", "beetle"],
    butterfly: ["ant", "beetle", "bee", "spider"],
  };
  // The two hardest rival skills for each player faction in campaign-skill-results.json.
  // Partners and utility cards match on both sides, across five equally weighted recipes.
  const counters = {
    ant: ["spider", "beetle"], bee: ["ant", "spider"], beetle: ["ant", "butterfly"],
    spider: ["ant", "beetle"], butterfly: ["ant", "spider"],
  };
  // First four counts correspond to the four partner costs.
  const elite = {
    ant:       { partners: [2, 3, 4, 3], hits: [2], supplies: 1 },
    bee:       { partners: [3, 2, 4, 2], hits: [2], supplies: 1 },
    beetle:    { partners: [2, 2, 4, 2], hits: [], supplies: 1 },
    spider:    { partners: [2, 3, 2, 3], hits: [1,2], supplies: 1 },
    butterfly: { partners: [2, 3, 4, 3], hits: [2], supplies: 1 },
  };
  // Finale lists retain the native enhanced card and make room for both foreign skills.
  // extraCounter is an additional copy of the strongest foreign skill in the control.
  const finale = {
    ant:       { partners: [3,3,2,1], extraCounter: 0 },
    bee:       { partners: [3,2,4,2], hits:[2], extraCounter: 0 },
    beetle:    { partners: [2,2,2,4], hits:[2,3], extraCounter: 0 },
    spider:    { partners: [4,3,2,2], hits:[1], extraCounter: 0 },
    butterfly: { partners: [2,1,3,5], hits:[1], extraCounter: 0 },
  };
  function encounter(faction, stage, getDefault) {
    if (!Object.hasOwn(order, faction) || !Number.isInteger(stage) || stage < 1 || stage > 6)
      throw new RangeError("战役需要五族之一和第1至6关");
    const opponent = stage < 5 ? order[faction][stage - 1] : faction;
    if (stage < 5) {
      const deck = getDefault(opponent);
      return { faction, stage, opponent, deck, skills: [{ faction: opponent, enhanced: false, copies: deck.specials }] };
    }
    const preset = stage === 5 ? elite[faction] : finale[faction];
    const partners = preset.partners.flatMap((copies, i) => Array(copies).fill(i + 1));
    const hits = [...(preset.hits || [])], supplies = preset.supplies ?? 1;
    const specials = 16 - partners.length - hits.length - supplies;
    const deck = { partners, hits, supplies, specials };
    const extra = stage === 6 ? finale[faction].extraCounter : 0;
    const skills = [{ faction, enhanced: true, copies: stage === 6 ? specials - 2 - extra : specials }];
    if (stage === 6) skills.push(...counters[faction].map((f,i) => ({ faction: f, enhanced: false, copies: 1 + (i === 0 ? extra : 0) })));
    return { faction, stage, opponent, deck, skills };
  }
  // Weights give a public, hypothetical one-card counterplay a discount for an unknown hand.
  const hornetTactics = { deployment:[0,0.76,0.65,0.53,0.42], hit:0.24, transfer:0.67, preparation:0.18, risk:0.95 };
  return { encounter, hornetTactics };
});
