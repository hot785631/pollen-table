// node balance.cjs [blocks of four games per pairing] [first block seed] [JSON output]
// Optional tuning runs: POLLEN_ONLY=ant,bee (pairs touching those factions),
// POLLEN_TRIAL=path/to/partial-factions.json. All games use the shipped engine and AI.
const fs = require("node:fs");
const { Worker, workerData, isMainThread, parentPort } = require("node:worker_threads");
const P = require("./engine.js");
const rulesDigest=require('./rules-digest.cjs')();
const names = ["ant","bee","beetle","spider","butterfly"];
const phases = ["3–4","5–7","8–10"];
const rounded = x=>Number(x.toFixed(3));
const openingRecord=()=>({games:0,wins:0,withWeb:0,legalWeb:0,webOnFirstAction:0,webInFirstRound:0});
const counters = ()=>({rounds:0,points:0,net:0,specials:0});
const totals = teams=>Object.fromEntries(teams.map(t=>[t,Object.fromEntries(phases.map(h=>[h,counters()]))]));
function mix(x) {
  x=Math.imul(x^(x>>>16),0x21f0aaad);
  x=Math.imul(x^(x>>>15),0x735a2d97);
  return (x^(x>>>15))>>>0;
}
function run({a,b,n,start,salt,shard,overrides}) {
  if(overrides)for(const [team, patch] of Object.entries(overrides))Object.assign(P.specialRules(team),patch);
  const wins={[a]:0,[b]:0},stats=totals([a,b]),webOpening={first:openingRecord(),second:openingRecord()},roundOrder={rounds:0,firstPoints:0,secondPoints:0};let firstWins=0,totalRounds=0,minRounds=Infinity,maxRounds=0;
  for(let block=start;block<start+n;block++)for(let k=0;k<4;k++){
    const teams=k>=2?[b,a]:[a,b],first=k%2;
    // The four seat/first combinations receive distinct deals; mixing also separates matchups.
    const seed=mix(Math.imul(block*4+k,0x9e3779b1)+salt);
    let state=P.newGame({factions:teams,first,rng:()=>seed/4294967296});
    const spider=teams.indexOf('spider'),w=webOpening[spider===first?'first':'second'];let firstAction=true,webRound=false;
    if(spider>=0)w.games++;
    while(state.phase!=="done"){
      if(state.round>180)throw Error("Unfinished game "+[a,b,seed].join("/"));
      const h=phases[state.round<=2?0:state.round<=5?1:2],side=state.turn;
      const act=P.chooseAI(state);
      if(side===spider&&state.round===1){
        if(firstAction){
          const has=state.players[side].hand.some(c=>c.kind==='special');if(has)w.withWeb++;
          if(has&&P.actions(state).some(m=>m.type==='special'))w.legalWeb++;
          if(act.type==='special')w.webOnFirstAction++;
          firstAction=false;
        }
        if(act.type==='special'&&!webRound){w.webInFirstRound++;webRound=true;}
      }
      if(act.type==="special")stats[teams[side]][h].specials++;
      state=P.play(state,act);
      if(state.phase!=="play"){
        roundOrder.rounds++;roundOrder.firstPoints+=state.result.gain[state.first];roundOrder.secondPoints+=state.result.gain[1-state.first];
        for(const i of [0,1]){const t=stats[teams[i]][h];t.rounds++;t.points+=state.result.gain[i];t.net+=state.result.gain[i]-state.result.gain[1-i];}
        if(state.phase==="scored")state=P.nextRound(state);
      }
    }
    wins[teams[state.winner]]++;if(first===state.winner)firstWins++;if(spider===state.winner)w.wins++;
    totalRounds+=state.round;minRounds=Math.min(minRounds,state.round);maxRounds=Math.max(maxRounds,state.round);
  }
  return {a,b,n:n*4,wins,stats,webOpening,roundOrder,firstWins,totalRounds,minRounds,maxRounds,rulesDigest};
}
async function tournament(n,start,only=[],overrides=null){
  const jobs=[];let salt=0;
  for(const [i,a] of names.entries())for(const b of names.slice(i+1)){
    salt+=101;
    if((process.env.POLLEN_SKIP||'').split(',').some(t=>t===a||t===b))continue;
    if(only.length&&!only.includes(a)&&!only.includes(b))continue;
    for(let j=0;j<n;j+=Math.min(16,n))jobs.push({a,b,n:Math.min(16,n-j),start:start+j,salt,overrides});
  }
  if(!jobs.length)throw Error("No matches selected");
  const results=[];
  const workers=Math.min(jobs.length,Number(process.env.POLLEN_WORKERS)||Math.min(6,require("node:os").availableParallelism()));
  await Promise.all(Array.from({length:workers},()=>new Promise((resolve,reject)=>{
    const w=new Worker(__filename,{workerData:true});
    w.on("error",reject);w.on("exit",code=>code?reject(Error("Worker exit "+code)):resolve());
    const next=()=>{const job=jobs.shift();if(job)w.postMessage(job);else w.postMessage(null)};
    w.on("message",r=>{results.push(r);next()});next();
  })));
  const matchups={},stageTotals=totals(names),overall=Object.fromEntries(names.map(t=>[t,{wins:0,games:0}]));
  const webOpening={first:openingRecord(),second:openingRecord()},roundOrder={rounds:0,firstPoints:0,secondPoints:0};
  let games=0,firstWins=0,totalRounds=0,minRounds=Infinity,maxRounds=0;
  for(const {a,b,n,wins,stats,webOpening:wo,roundOrder:order,firstWins:f,totalRounds:r,minRounds:l,maxRounds:u,rulesDigest:hash} of results){
    if(hash!==rulesDigest)throw Error('Rules changed while simulating');
    for(const role of ['first','second'])for(const k of Object.keys(wo[role]))webOpening[role][k]+=wo[role][k];
    for(const k of Object.keys(roundOrder))roundOrder[k]+=order[k];
    const row=matchups[a+"/"+b]??={games:0,[a]:0,[b]:0};
    row.games+=n;games+=n;firstWins+=f;totalRounds+=r;minRounds=Math.min(minRounds,l);maxRounds=Math.max(maxRounds,u);
    for(const t of [a,b]){
      row[t]+=wins[t];overall[t].wins+=wins[t];overall[t].games+=n;
      for(const h of phases)for(const key of Object.keys(stats[t][h]))stageTotals[t][h][key]+=stats[t][h][key];
    }
  }
  for(const t of names)for(const row of Object.values(stageTotals[t])){
    if(!row.rounds)continue;row.pointsPerRound=rounded(row.points/row.rounds);row.netPerRound=rounded(row.net/row.rounds);
    row.specialsPerRound=rounded(row.specials/row.rounds);
  }
  return {summary:{startSeed:start,lastSeed:start+n-1,games,firstWins,secondWins:games-firstWins,meanRounds:rounded(totalRounds/games),minRounds,maxRounds},
    matchups:Object.fromEntries(Object.entries(matchups).sort()),overall,stageTotals,webOpening,roundOrder,rulesDigest};
}
if(!isMainThread){parentPort.on("message",job=>{if(job)parentPort.postMessage(run(job));else parentPort.close()})}
else if(require.main===module){
  const n=Number(process.argv[2]||24),start=Number(process.argv[3]||1000);
  if(!Number.isSafeInteger(n)||n<=0||!Number.isSafeInteger(start)||start<=0)throw Error("Positive integer arguments required");
  const overrides=process.env.POLLEN_TRIAL?JSON.parse(fs.readFileSync(process.env.POLLEN_TRIAL,"utf8").replace(/^\uFEFF/,"")):null;
  tournament(n,start,(process.env.POLLEN_ONLY||"").split(",").filter(Boolean),overrides).then(data=>{
    if(process.argv[4])fs.writeFileSync(process.argv[4],JSON.stringify(data,null,2)+"\n");else console.log(JSON.stringify(data,null,2));
    if(process.argv[4])console.log(JSON.stringify({games:data.summary.games,overall:Object.fromEntries(Object.entries(data.overall).filter(([,v])=>v.games).map(([t,v])=>[t,rounded(100*v.wins/v.games)])),pairs:Object.fromEntries(Object.entries(data.matchups).map(([k,v])=>[k,rounded(100*v[k.split("/")[0]]/v.games)]))}));
  }).catch(err=>{console.error(err);process.exitCode=1});
}
module.exports={tournament};
