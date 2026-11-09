(() => {
  'use strict';
  // Adjacent pieces traverse the same Bézier edge in opposite directions.
  function cut(nodes, rings, seams, labels) {
    return rings.map((ring, i) => {
      let d = 'M' + nodes[ring[0]];
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k], b = ring[(k + 1) % ring.length];
        const forward = seams[a + b], reverse = seams[b + a];
        if (forward) d += 'C' + forward[0] + ' ' + forward[1] + ' ' + nodes[b];
        else if (reverse) d += 'C' + reverse[1] + ' ' + reverse[0] + ' ' + nodes[b];
        else d += 'L' + nodes[b];
      }
      return { d: d + 'Z', label: labels[i] };
    });
  }
  const ant = cut({
    A:[0,0], B:[83,0], C:[211,0], D:[300,0], E:[0,114], F:[111,89], G:[197,120],
    H:[300,78], I:[0,200], J:[81,200], K:[214,200], L:[300,200]
  }, ['ABFE','BCGF','CDHG','EFJI','FGKJ','GHLK'], {
    BF:[[62,50],[153,56]], CG:[[240,29],[166,85]], EF:[[43,153],[76,50]], FG:[[155,71],[162,145]],
    GH:[[239,151],[252,56]], FJ:[[137,153],[59,145]], GK:[[157,168],[253,155]]
  }, [[45,55],[153,47],[255,44],[48,163],[145,154],[255,157]]);
  // A cropped honeycomb: staggered chambers meet in three-way angles.
  const bee = cut({
    A:[0,0],B:[95,0],C:[199,0],D:[300,0],E:[0,111],F:[95,67],G:[144,112],H:[199,69],
    I:[247,113],J:[300,87],K:[0,200],L:[144,200],M:[247,200],N:[300,200]
  }, ['ABFE','BCHGF','CDJIH','EFGLK','GHIML','IJNM'], {},
    [[45,45],[147,46],[249,46],[64,149],[194,148],[273,152]]);
  const beetle = cut({
    A:[0,0],B:[149,0],C:[300,0],D:[0,92],E:[153,48],F:[300,73],
    G:[0,145],H:[163,150],I:[300,128],J:[0,200],K:[153,200],L:[300,200]
  }, ['ABED','BCFE','DEHG','EFIH','GHKJ','HILK'], {
    BE:[[147,14],[151,37]], EH:[[158,73],[166,111]], HK:[[164,166],[162,189]],
    DE:[[60,94],[112,85]], EF:[[201,91],[250,84]], GH:[[62,173],[126,177]], HI:[[207,177],[270,158]]
  }, [[64,41],[232,43],[69,124],[231,115],[80,185],[228,180]]);
  const spider = cut({
    A:[0,0],B:[68,0],C:[221,0],D:[300,0],E:[300,106],F:[300,200],G:[217,200],
    H:[56,200],I:[0,200],J:[0,104],O:[131,88]
  }, ['BCO','CDEO','EFGO','GHO','HIJO','JABO'], {
    OB:[[111,51],[99,38]], OC:[[165,66],[193,26]], OE:[[193,104],[249,102]],
    OG:[[164,132],[182,146]], OH:[[117,122],[73,165]], OJ:[[94,100],[44,98]]
  }, [[133,33],[250,56],[255,153],[147,164],[51,152],[48,59]]);
  const butterfly = cut({
    A:[0,0],B:[150,0],C:[300,0],D:[0,45],E:[300,45],F:[0,154],G:[300,154],
    H:[0,200],I:[150,200],J:[300,200],O:[150,107]
  }, ['ABOD','BCEO','DOF','OEG','FOIH','OGJI'], {
    BO:[[144,38],[146,79]], OI:[[147,130],[152,171]],
    DO:[[81,40],[100,95]], OE:[[200,95],[219,40]],
    FO:[[31,136],[131,151]], OG:[[169,151],[269,136]]
  }, [[88,31],[212,31],[54,98],[246,98],[88,172],[212,172]]);
  const sets = { ant, bee, beetle, spider, butterfly };
  function render(faction, earned, options = {}) {
    const pieces = sets[faction];
    if (!pieces) return '';
    const all = pieces.every((_, i) => Boolean(earned[i]));
    if (all && !options.highlight) return '<div class="puzzle-geometry finished"><div class="puzzle-paint"></div></div>';
    const outlines = pieces.map((p, i) => {
      if (all && options.highlight !== i + 1) return '';
      const lit = options.highlight === i + 1 && earned[i];
      const cls = lit ? 'just-earned' : earned[i] ? 'earned' : 'unearned';
      const label = earned[i] ? '' : '<text x="' + p.label[0] + '" y="' + p.label[1] + '">' + (i + 1) + '</text>';
      return '<g class="' + cls + '" data-piece="' + (i + 1) + '"><path d="' + p.d + '"/>' + label + '</g>';
    }).join('');
    return '<div class="puzzle-geometry" aria-hidden="true"><div class="puzzle-paint"></div>'+
      '<svg class="puzzle-seams" viewBox="0 0 300 200" preserveAspectRatio="none">' + outlines + '</svg></div>';
  }
  window.PollenPuzzle = { render };
})();
