(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PollenTuning = factory();
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  const deck = (partners, hits) => ({ partners, hits, specials: 2, supplies: 1 });
  return {
    pollenWeights: [10, 70, 15, 5], // independently sample 0–3 on each lane
    factions: {
      ant: {
        cost: 1,
        deck: deck([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3], [1]),
      },
      bee: {
        cost: 2,
        deck: deck([1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4], [3]),
      },
      beetle: {
        cost: 2, pushLoss: 2,
        deck: deck([1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4], [2]),
      },
      spider: {
        cost: 3,
        deck: deck([1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 4], [1]),
      },
      butterfly: {
        cost: 3, hatchPower: 4,
        deck: deck([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4], [2]),
      },
    },
  };
});
