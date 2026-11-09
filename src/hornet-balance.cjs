// node hornet-balance.cjs [games per arm, multiple of 4] [first seed index] [output.json]
"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Worker, workerData, isMainThread, parentPort } = require("node:worker_threads");
const P = require("./engine.js");

const legacyDeck = { partners:[1,1,1,2,2,3,3,3,4], hits:[], supplies:1, specials:6 };
const candidate = P.campaignEncounter("bee", 5).deck;
const opponent = P.defaultDeck("bee");
const baseline = {beePolicy:"baseline"};
const olderPolicy = {beePolicy:"legacy-double"};
const arms = {
  oldDeckOldTactics: { deck:legacyDeck, enhanced:true, policy:olderPolicy },
  oldDeckNewTactics: { deck:legacyDeck, enhanced:true },
  regular:           { deck:candidate, enhanced:false, policy:baseline },
  forcedDouble:      { deck:candidate, enhanced:true, policy:olderPolicy },
  optionalGeneric:   { deck:candidate, enhanced:true, policy:baseline },
  shipped:           { deck:candidate, enhanced:true }
};
const contrasts = {
  deckOnly:["oldDeckNewTactics","shipped"], skillOnlySameGenericAI:["regular","optionalGeneric"],
  freerChoicesSameGenericAI:["forcedDouble","optionalGeneric"], policyOnly:["optionalGeneric","shipped"],
  oldTacticsToNew:["forcedDouble","shipped"], regularToShipped:["regular","shipped"],
  wholeEncounter:["oldDeckOldTactics","shipped"]
};
const fixed = n => Number(n.toFixed(4));
function digest() {
  const hash = crypto.createHash("sha256");
  for (const file of ["engine.js","tuning.js","campaign-rules.js","hornet-balance.cjs"])
    hash.update(fs.readFileSync(path.join(__dirname,file),"utf8").replace(/\r\n/g,"\n")).update("\0");
  return hash.digest("hex");
}
function seedFor(index) {
  let n = Math.imul(index ^ index>>>16,0x21f0aaad);
  n = Math.imul(n ^ n>>>15,0x735a2d97);
  return (n ^ n>>>15) >>> 0;
}
function deal(arm, seat, first, seed) {
  const decks = [opponent,opponent];
  decks[seat] = arm.deck;
  const state = P.newGame({factions:["bee","bee"],decks,first,rng:()=>seed/4294967296});
  const player = state.players[seat];
  // The game shuffles ordinary physical cards first. Change only the ability on
  // those same hornet cards, plus the public deck capability consulted by its AI.
  for (const card of [...player.hand,...player.draw,...player.discard]) {
    if (card.kind==="special") { assert.equal(card.cost,2); card.enhanced=arm.enhanced; }
  }
  player.deckOptions.skills = [{faction:"bee",enhanced:arm.enhanced,copies:arm.deck.specials}];
  return state;
}
function checkExperiment() {
  assert.ok([11,12].includes(candidate.partners.length),"Stage 5 must contain the selected high-partner recipe.");
  assert.ok(Object.values(arms).every(arm=>P.validateDeck(arm.deck)));
  assert.equal(P.specialCost("bee"),2);
  const candidateState = deal(arms.shipped,1,1,42);
  const ordinaryState = deal(arms.regular,1,1,42);
  const campaign = P.newGame({campaign:{faction:"bee",stage:5},first:1,rng:()=>42/4294967296});
  for (const player of campaign.players) assert.equal(player.hand.length+player.draw.length+player.discard.length,16);
  assert.deepEqual(candidateState.players,campaign.players,"The experimental hornet must match the real fifth encounter.");
  assert.deepEqual(candidateState.pollen,campaign.pollen);
  for (const side of [0,1]) for (const pile of ["hand","draw"]) {
    const ids = state => state.players[side][pile].map(c=>c.id);
    assert.deepEqual(ids(candidateState),ids(ordinaryState));
  }
  assert.deepEqual(candidateState.pollen,ordinaryState.pollen);
  assert.deepEqual(P.chooseAI(ordinaryState,1),P.chooseAI(ordinaryState,1,baseline));
  const bee = candidateState.players[1];
  bee.hand = [{kind:"special",id:"control-haul",cost:2,skill:"bee",enhanced:true}];
  candidateState.board[1][2] = {power:5,base:5,cost:3};
  candidateState.pollen = [0,2,0,3,0];
  const sources = P.actions(candidateState).filter(a=>a.type==="special" && a.to===2).map(a=>a.from).sort();
  assert.deepEqual(sources,[1,2,3],"Single left, both and single right must all be legal.");
}
function haulOf(game, side, move) {
  if (move.type!=="special") return null;
  const sources = move.from===move.to
    ? [move.to-1,move.to+1].filter(lane=>lane>=0 && lane<game.pollen.length) : [move.from];
  return {side, sources, to:move.to};
}
function replayPollen(start, history, skip) {
  const flowers = [...start];
  for (const haul of history) {
    if (skip(haul)) continue;
    for (const lane of haul.sources) {
      flowers[haul.to] += flowers[lane];
      flowers[lane] = 0;
    }
  }
  return flowers;
}
function tallyRound(game, seat, start, history, row) {
  const winners = game.result.winners;
  const score = flowers => flowers.reduce((n,f,i)=>n+(winners[i]===seat ? f : 0),0);
  const actual = game.result.gain[seat];
  const verified = replayPollen(start,history,()=>false);
  assert.deepEqual(verified,game.pollen);
  assert.equal(score(verified),actual);
  // Both decks only move flowers: no cocoons eat them and routing cannot alter
  // the final combat strengths. Later moves stay on their originally chosen lanes.
  const withoutHornet = score(replayPollen(start,history,haul=>haul.side===seat));
  row.realizedHaulPoints += actual-withoutHornet;
  for (const move of history.filter(h=>h.side===seat)) {
    const delta = actual-score(replayPollen(start,history,h=>h===move));
    if (move.funded===2) row.twoSourceMarginalPollen+=delta;
    else row.oneSourceMarginalPollen+=delta;
    if (delta>0) row.beneficialPlays++;
    else if (delta<0) row.harmfulPlays++;
    else row.neutralPlays++;
  }
}
function playGame(arm, seat, first, seed) {
  let game = deal(arm,seat,first,seed);
  let start = [...game.pollen], history = [];
  const row = {win:0,ownPollen:0,enemyPollen:0,rounds:0,oneSource:0,twoSources:0,
    declaredBoth:0,bothWithOnlyOneFunded:0,pollenTransported:0,realizedHaulPoints:0,
    oneSourceMarginalPollen:0,twoSourceMarginalPollen:0,
    beneficialPlays:0,neutralPlays:0,harmfulPlays:0};
  while (game.phase!=="done") {
    if (game.round>180) throw Error("Unfinished game seed "+seed);
    const actor = game.turn;
    const move = P.chooseAI(game,actor,actor===seat ? arm.policy : baseline);
    const haul = haulOf(game,actor,move);
    if (haul) {
      history.push(haul);
      if (actor===seat) {
        const funded = haul.sources.filter(lane=>game.pollen[lane]>0);
        haul.funded=funded.length;
        assert.ok(funded.length===1 || funded.length===2);
        if (funded.length===2) row.twoSources++; else row.oneSource++;
        if (move.from===move.to) {
          row.declaredBoth++;
          if (funded.length===1) row.bothWithOnlyOneFunded++;
        }
        row.pollenTransported += funded.reduce((n,lane)=>n+game.pollen[lane],0);
      }
    }
    game = P.play(game,move);
    if (game.phase!=="play") {
      tallyRound(game,seat,start,history,row);
      if (game.phase==="scored") {
        game=P.nextRound(game);
        start=[...game.pollen]; history=[];
      }
    }
  }
  row.win=Number(game.winner===seat);
  row.ownPollen=game.players[seat].score; row.enemyPollen=game.players[1-seat].score;
  row.rounds=game.round;
  assert.equal(row.oneSource+row.twoSources,row.beneficialPlays+row.neutralPlays+row.harmfulPlays);
  return row;
}
function sample(start,blocks) {
  const results=[];
  for (let i=0;i<blocks;i++) {
    const seed=seedFor(start+i);
    for (const seat of [0,1]) for (const first of [0,1]) {
      const games={};
      for (const [id,arm] of Object.entries(arms)) games[id]=playGame(arm,seat,first,seed);
      results.push({block:start+i,seat,first,games});
    }
  }
  return results;
}
function group(samples,id) {
  const games=samples.map(s=>s.games[id]), sums={};
  for (const k of Object.keys(games[0])) sums[k]=games.reduce((n,g)=>n+g[k],0);
  const first=samples.filter(s=>s.seat===s.first);
  const firstWins=first.reduce((n,s)=>n+s.games[id].win,0);
  return {games:games.length,wins:sums.win,winPct:fixed(100*sums.win/games.length),
    gamesStartingFirst:first.length,winsStartingFirst:firstWins,winsStartingSecond:sums.win-firstWins,
    meanOwnFinalPollen:fixed(sums.ownPollen/games.length),meanEnemyFinalPollen:fixed(sums.enemyPollen/games.length),
    realizedOwnPollenPerRound:fixed(sums.ownPollen/sums.rounds),meanRounds:fixed(sums.rounds/games.length),
    meanRealizedHaulPointsPerGame:fixed(sums.realizedHaulPoints/games.length),total:sums};
}
function compare(samples,control,test) {
  let gained=0,lost=0;
  const clusters=new Map();
  for (const {block,games} of samples) {
    const a=games[control], b=games[test];
    if (!a.win && b.win) gained++;
    if (a.win && !b.win) lost++;
    const c=clusters.get(block) || {winPct:0,ownPollen:0,realizedHaulPoints:0};
    c.winPct+=100*(b.win-a.win)/4;
    c.ownPollen+=(b.ownPollen-a.ownPollen)/4;
    c.realizedHaulPoints+=(b.realizedHaulPoints-a.realizedHaulPoints)/4;
    clusters.set(block,c);
  }
  const paired={};
  for (const key of ["winPct","ownPollen","realizedHaulPoints"]) {
    const data=[...clusters.values()].map(c=>c[key]);
    const mean=data.reduce((a,b)=>a+b,0)/data.length;
    const se=Math.sqrt(data.reduce((n,x)=>n+(x-mean)**2,0)/(data.length*(data.length-1)));
    paired[key]={difference:fixed(mean),approx95:[fixed(mean-1.96*se),fixed(mean+1.96*se)]};
  }
  return {from:control,to:test,pairedGames:samples.length,flippedToWin:gained,flippedToLoss:lost,paired};
}
async function main() {
  checkExperiment();
  const n=Number(process.argv[2] || 512), firstSeedIndex=Number(process.argv[3] || 1780214823);
  if (!Number.isSafeInteger(n)||n<8||n%4||!Number.isSafeInteger(firstSeedIndex)||firstSeedIndex<0||firstSeedIndex+n/4>2**32)
    throw Error("Require >=8 games per arm, divisible by four, and a valid 32-bit seed interval.");
  const threads=Math.min(3,n/4);
  const blocks=n/4, chunks=[], initial=digest();
  for (let i=0;i<threads;i++) {
    const low=Math.floor(i*blocks/threads), high=Math.floor((i+1)*blocks/threads);
    chunks.push(new Promise((resolve,reject)=>{
      const worker=new Worker(__filename,{workerData:{start:firstSeedIndex+low,blocks:high-low}});
      let reply;
      worker.once("message",data=>{reply=data;});
      worker.once("error",reject);
      worker.once("exit",code=>{
        if (code || !reply || reply.digest!==initial) reject(Error("Worker failed or rules changed."));
        else resolve(reply.samples);
      });
    }));
  }
  const samples=(await Promise.all(chunks)).flat();
  assert.equal(initial,digest(),"Inputs changed. Rerun against the final build.");
  const results=Object.fromEntries(Object.keys(arms).map(id=>[id,group(samples,id)]));
  const comparisons=Object.fromEntries(Object.entries(contrasts).map(([name,[a,b]])=>[name,compare(samples,a,b)]));
  const report={rulesDigest:initial,gamesPerArm:n,totalGames:n*Object.keys(arms).length,blocks,firstSeedIndex,
    protocol:"Disjoint holdout seeds. Four games per seed cross seat and opener. Every arm shares those scenarios. Both seats start with the same respective shuffle permutations across arms; only single-card enhanced flags change in the skill control. During play, draw/discard recycling can diverge. The ordinary default bee opponent always uses baseline AI.",
    accounting:"Own final pollen and own pollen per round are actual engine awards. Haul points replay the same round with this player's hauls omitted, holding final lane winners and all opposing routing decisions fixed. This attributes realized flower distribution conditional on that board, not a replayed opponent strategy. Beneficial/neutral/harmful classify omitting each cast individually; its effect can interact with later casts. One/two sources count actually nonempty lanes drained; declaredBoth counts the button choice including when only one neighbor held flowers. Repeatedly moved flowers can appear repeatedly in pollenTransported.",
    intervals:"Approximate 95% intervals for paired changes use the independent seed block as the unit, with four seat/opener combinations per block. winPct differences are percentage points. Sampling uncertainty refers to these AIs and presets.",
    recipes:{old:legacyDeck,candidate,opponent},arms:Object.fromEntries(Object.entries(arms).map(([id,a])=>[id,{
      deck:a.deck===legacyDeck?"old":"candidate",enhanced:a.enhanced,skillFee:2,policy:a.policy?.beePolicy || "shipped"}])),
    results,comparisons};
  if (process.argv[4]) fs.writeFileSync(process.argv[4],JSON.stringify(report,null,2)+"\n");
  for (const [id,g] of Object.entries(results)) console.log(id,g.wins+"/"+g.games,"own",g.meanOwnFinalPollen,"haul",g.meanRealizedHaulPointsPerGame,"one/two",g.total.oneSource,g.total.twoSources);
}
if (isMainThread) main().catch(error=>{console.error(error);process.exitCode=1;});
else parentPort.postMessage({digest:digest(),samples:sample(workerData.start,workerData.blocks)});
