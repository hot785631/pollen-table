// node campaign-skill-balance.cjs [blocks of four per pair] [first block] [JSON output]
// Fix every ordinary card, varying only the skill printed on the two special cards.
const fs = require("node:fs");
const {Worker,isMainThread,parentPort}=require("node:worker_threads");
const P=require("./engine.js");
const rulesDigest=require("./rules-digest.cjs")();
const factions=Object.keys(P.tuning.factions);
const commonDecks=Object.fromEntries(factions.map(f=>[f,P.defaultDeck(f)]));
function seedFor(x){
  x=Math.imul(x^(x>>>16),0x21f0aaad);
  x=Math.imul(x^(x>>>15),0x735a2d97);
  return (x^(x>>>15))>>>0;
}
function sample({a,b,start,n,salt}){
  const byCommonDeck={};
  for(let block=start;block<start+n;block++){
    // Within each block all four games have the same two private draws and flowers.
    const seed=seedFor(block+salt);
    const curve=factions[block%factions.length],deck=commonDecks[curve];
    const counts=byCommonDeck[curve]??={awins:0,bwins:0};
    for(const teams of [[a,b],[b,a]])for(const first of [0,1]){
      let s=P.newGame({factions:teams,decks:[deck,deck],first,rng:()=>seed/4294967296});
      while(s.phase!=="done"){
        if(s.round>180)throw Error("Unfinished game "+seed);
        s=P.play(s,P.chooseAI(s));
        if(s.phase==="scored")s=P.nextRound(s);
      }
      if(teams[s.winner]===a)counts.awins++;else counts.bwins++;
    }
  }
  return {a,b,byCommonDeck,rulesDigest};
}
if(!isMainThread)parentPort.on("message",job=>job?parentPort.postMessage(sample(job)):parentPort.close());
else if(require.main===module){
  const blocks=Number(process.argv[2]||80),start=Number(process.argv[3]||1120000),jobs=[],pairs={};
  if(!Number.isSafeInteger(blocks)||blocks<5||blocks%5||!Number.isSafeInteger(start)||start<0)throw Error("Use a multiple of five blocks to give every common deck equal weight.");
  let idx=0;
  for(const [i,a] of factions.entries())for(const b of factions.slice(i+1)){
    pairs[a+"/"+b]={games:0,[a]:0,[b]:0,byCommonDeck:Object.fromEntries(factions.map(f=>[f,{games:0,[a]:0,[b]:0}]))};idx++;
    for(let offset=0;offset<blocks;offset+=8)jobs.push({a,b,start:start+offset,n:Math.min(8,blocks-offset),salt:idx*10000019});
  }
  const workers=Math.min(jobs.length,Number(process.env.POLLEN_CAMPAIGN_WORKERS)||3);
  Promise.all(Array.from({length:workers},()=>new Promise((resolve,reject)=>{
    const w=new Worker(__filename),next=()=>w.postMessage(jobs.shift()||null);
    w.on("error",reject).on("exit",code=>code?reject(Error("Worker exit "+code)):resolve());
    w.on("message",({a,b,byCommonDeck,rulesDigest:digest})=>{
      if(digest!==rulesDigest){reject(Error("Rules changed during sampling"));w.terminate();return;}
      const r=pairs[a+"/"+b];
      for(const [curve,{awins,bwins}] of Object.entries(byCommonDeck)){
        for(const row of [r,r.byCommonDeck[curve]]){
          row[a]+=awins;row[b]+=bwins;row.games+=awins+bwins;
        }
      }
      next();
    });
    next();
  }))).then(()=>{
    const counters={};
    for(const faction of factions){
      counters[faction]=factions.filter(f=>f!==faction).map(opponent=>{
        const row=pairs[faction+"/"+opponent]||pairs[opponent+"/"+faction];
        return {opponent,winsAgainstPlayer:row[opponent],games:row.games};
      }).sort((a,b)=>b.winsAgainstPlayer-a.winsAgainstPlayer||factions.indexOf(a.opponent)-factions.indexOf(b.opponent)).slice(0,2);
    }
    const report={rulesDigest,blocks,startSeed:start,games:blocks*4*10,commonDecks,
      method:"Five equally weighted strata use the five published default recipes. Within each game both sides use the same partner and utility cards, swapping only the two standard skills. Matched blocks of four share initial draws and flower seed, swap factions between seats, and alternate starting player.",pairs,counters};
    if(process.argv[4])fs.writeFileSync(process.argv[4],JSON.stringify(report,null,2)+"\n");
    console.log(JSON.stringify(counters));
  }).catch(err=>{console.error(err);process.exitCode=1});
}
