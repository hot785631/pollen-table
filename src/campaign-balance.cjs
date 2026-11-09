// node campaign-balance.cjs [games per faction per stage, even] [starting seed] [JSON output]
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Worker, isMainThread, parentPort } = require("node:worker_threads");
const P = require("./engine.js");
const factions = Object.keys(P.tuning.factions);
const hash = crypto.createHash("sha256");
for (const name of ["engine.js", "tuning.js", "campaign-rules.js", "campaign-balance.cjs"]) {
  hash.update(fs.readFileSync(path.join(__dirname, name), "utf8").replace(/\r\n/g, "\n")).update("\0");
}
const rulesDigest = hash.digest("hex");
const rounded = n => Number(n.toFixed(4));
function seedFor(n) {
  let x = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}
function wilson(wins, games) {
  const p = wins / games, z = 1.96, r = z*z / games;
  const centre = (p + r/2)/(1+r), width = z*Math.sqrt(p*(1-p)/games + r/(4*games))/(1+r);
  return [rounded(centre-width), rounded(centre+width)];
}
function simulate({ faction, stage, n, start, offset }) {
  const record = { games: n, bossWins: 0, bossFirstWins: 0, playerFirstWins: 0, rounds: 0, uses: {}, usageGames:{}, allSkillsGames:0, playerWinExample:null, publicDeals:{},publicPlays:{} };
  const count = (map,card) => {
    if (!card) return;
    const key=card.skill+(card.enhanced?"+":"");
    map[key]=(map[key]||0)+1;
  };
  for (let i = offset; i < offset + n; i++) {
    const first = i % 2;
    const seed = seedFor(start + i + (factions.indexOf(faction)*2+stage-5)*10000019);
    let game = P.newGame({ campaign: { faction, stage }, first, rng: () => seed / 4294967296 });
    count(record.publicDeals,P.visibleSkill(game,1));
    const usedSkills = new Set();
    while (game.phase !== "done") {
      if (game.round > 180) throw Error("Unexpected long game, seed "+seed);
      const action = P.chooseAI(game);
      if (game.turn === 1 && action.type === "special") {
        const card = P.cardForAction(game,1,action);
        const key = card.skill + (card.enhanced ? "+" : "");
        record.uses[key] = (record.uses[key] || 0) + 1;
        usedSkills.add(key);
        if(card.public)count(record.publicPlays,card);
      }
      game = P.play(game, action);
      if (game.phase === "scored") {
        game = P.nextRound(game);
        count(record.publicDeals,P.visibleSkill(game,1));
      }
    }
    if (game.winner === 1) {
      record.bossWins++;
      if (first === 1) record.bossFirstWins++;
      else record.playerFirstWins++;
    } else if (!record.playerWinExample) {
      record.playerWinExample = { index:i, seed, first, rounds:game.round, score:game.players.map(p=>p.score) };
    }
    record.rounds += game.round;
    for (const key of usedSkills) record.usageGames[key]=(record.usageGames[key]||0)+1;
    if (usedSkills.size === game.campaign.skills.length) record.allSkillsGames++;
  }
  return { faction, stage, record, rulesDigest };
}
async function run(n, start, selected = factions) {
  const jobs = [];
  for (const faction of selected) for (const stage of [5,6]) {
    for (let i=0; i<n; i+=8) jobs.push({ faction, stage, n:Math.min(8,n-i), start, offset:i });
  }
  const data = {};
  const workers = Math.min(jobs.length, Number(process.env.POLLEN_CAMPAIGN_WORKERS)||4);
  await Promise.all(Array.from({length:workers}, () => new Promise((resolve, reject) => {
    const worker = new Worker(__filename);
    const next = () => worker.postMessage(jobs.shift() || null);
    worker.on("error",reject).on("exit",code => code ? reject(Error("Worker exit "+code)) : resolve());
    worker.on("message", ({ faction, stage, record, rulesDigest: digest }) => {
      if (digest !== rulesDigest) { reject(Error("Rules changed during the run")); worker.terminate(); return; }
      const row = (data[faction] ??= {})[stage] ??= {games:0,bossWins:0,bossFirstWins:0,playerFirstWins:0,rounds:0,uses:{},usageGames:{},allSkillsGames:0,publicDeals:{},publicPlays:{}};
      for (const key of ["games","bossWins","bossFirstWins","playerFirstWins","rounds","allSkillsGames"]) row[key] += record[key];
      for (const [key,v] of Object.entries(record.uses)) row.uses[key] = (row.uses[key]||0) + v;
      for (const [key,v] of Object.entries(record.usageGames)) row.usageGames[key] = (row.usageGames[key]||0) + v;
      for(const table of ["publicDeals","publicPlays"])for(const [key,v] of Object.entries(record[table]))row[table][key]=(row[table][key]||0)+v;
      if (record.playerWinExample && (!row.playerWinExample || record.playerWinExample.index < row.playerWinExample.index)) {
        row.playerWinExample = record.playerWinExample;
      }
      next();
    });
    next();
  })));
  const encounters = {};
  for (const faction of selected) {
    encounters[faction] = {};
    for (const stage of [5,6]) {
      const row = data[faction][stage], setup = P.campaignEncounter(faction,stage);
      encounters[faction][stage] = { games:row.games, bossWins:row.bossWins, bossWinRate:rounded(row.bossWins/n),
        wilson95:wilson(row.bossWins,n), bossWinsStartingFirst:row.bossFirstWins, bossWinsStartingSecond:row.playerFirstWins,
        meanRounds:rounded(row.rounds/n), skillPlays:Object.fromEntries(Object.entries(row.uses).sort()),
        gamesUsingEachSkill:Object.fromEntries(Object.entries(row.usageGames).sort()), gamesUsingAllSkills:row.allSkillsGames,
        playerWinExample:row.playerWinExample || null,
        publicCardsDealt:Object.fromEntries(Object.entries(row.publicDeals).sort()),publicCardsPlayed:Object.fromEntries(Object.entries(row.publicPlays).sort()),
        deck:setup.deck, skills:setup.skills };
    }
  }
  const baseline = JSON.parse(fs.readFileSync(path.join(__dirname,"balance-result.json"),"utf8"));
  const route = {};
  for (const faction of selected) {
    route[faction] = [1,2,3,4].map(stage => {
      const { opponent } = P.campaignEncounter(faction,stage);
      const row = baseline.matchups[faction+"/"+opponent] || baseline.matchups[opponent+"/"+faction];
      return {stage,opponent,games:row.games,playerWins:row[faction],bossWins:row[opponent]};
    });
  }
  const control = JSON.parse(fs.readFileSync(path.join(__dirname,"campaign-skill-results.json"),"utf8"));
  const engineDigest = require("./rules-digest.cjs")();
  if (baseline.rulesDigest !== engineDigest || control.rulesDigest !== engineDigest) {
    throw Error("Refresh the default-deck and matched-skill reports for this engine before writing the campaign report.");
  }
  return { rulesDigest, baselineDigest:baseline.rulesDigest, skillControl:{file:"campaign-skill-results.json",rulesDigest:control.rulesDigest,games:control.games,startSeed:control.startSeed},
    games:selected.length*2*n, startingSeed:start, gamesPerEncounter:n,
    method:"Both sides use the shipped AI. Player uses their faction's default deck. CPU is always seat 1. First mover alternates; deals are seeded independently. Stages 1–4 use the default-deck head-to-head report.", route, encounters };
}
module.exports = { simulate };
if (!isMainThread && require.main === module) parentPort.on("message", job => job ? parentPort.postMessage(simulate(job)) : parentPort.close());
else if (require.main === module) {
  const n=Number(process.argv[2]||128), seed=Number(process.argv[3]||1040000);
  if (!Number.isSafeInteger(n) || n<2 || n%2 || !Number.isSafeInteger(seed)) throw Error("Use an even positive number of games and an integer seed.");
  const selected=process.env.POLLEN_CAMPAIGN_TEAMS?.split(",") || factions;
  if (!selected.every(t=>factions.includes(t))) throw Error("Unknown faction");
  run(n,seed,selected).then(report=>{
    if (process.argv[4]) fs.writeFileSync(process.argv[4],JSON.stringify(report,null,2)+"\n");
    for (const [f, stages] of Object.entries(report.encounters))
      console.log(f, ...Object.values(stages).map(s=>s.bossWins+"/"+s.games+" ("+Math.round(100*s.bossWinRate)+"%)"));
  }).catch(err=>{console.error(err);process.exitCode=1});
}
