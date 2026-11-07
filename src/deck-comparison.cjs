// Matched factions: same twelve partners, two different choices for the remaining four slots.
// node deck-comparison.cjs [blocks of four per faction] [first block] [output JSON]
const {Worker,isMainThread,workerData,parentPort}=require('node:worker_threads');
const fs=require('node:fs'),P=require('./engine.js');
const rulesDigest=require('./rules-digest.cjs')();
const teams=['ant','bee','beetle','spider','butterfly'];
function simulate({team,count,start}){
  const standard=P.defaultDeck(team),allSpecial={...standard,hits:[],supplies:0,specials:4};
  const result={games:0,standardWins:0,specialWins:0,hitPlays:0,supplyPlays:0,rulesDigest};
  for(let i=0;i<count;i++)for(let k=0;k<4;k++){
    const normalSeat=(k>>1),first=k%2,boxes=normalSeat?[allSpecial,standard]:[standard,allSpecial];
    let seed=Math.imul((start+i)*4+k,0x9e3779b1)>>>0;
    seed=Math.imul(seed^(seed>>>16),0x85ebca6b)>>>0;
    let s=P.newGame({factions:[team,team],decks:boxes,first,rng:()=>seed/4294967296});
    while(s.phase!=='done'){
      if(s.round>180)throw Error('Simulation did not finish');
      const side=s.turn,a=P.chooseAI(s);
      if(side===normalSeat && a.type==='hit')result.hitPlays++;
      if(side===normalSeat && a.type==='supply')result.supplyPlays++;
      s=P.play(s,a);if(s.phase==='scored')s=P.nextRound(s);
    }
    result.games++;if(s.winner===normalSeat)result.standardWins++;else result.specialWins++;
  }return result;
}
if(!isMainThread)parentPort.postMessage(simulate(workerData));
else {
  const count=Number(process.argv[2]||100),start=Number(process.argv[3]||241900);
  if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(start))throw Error('Bad simulation range');
  Promise.all(teams.map((team,i)=>new Promise((resolve,reject)=>{
    const w=new Worker(__filename,{workerData:{team,count,start:start+1000*i}});
    w.on('message',r=>resolve([team,r]));w.on('error',reject);
  }))).then(rows=>{
    const byFaction=Object.fromEntries(rows),games=rows.reduce((n,[,r])=>n+r.games,0),standardWins=rows.reduce((n,[,r])=>n+r.standardWins,0);
    if(rows.some(([,r])=>r.rulesDigest!==rulesDigest))throw Error('Rules changed while simulating');
    const out={games,standardWins,firstBlock:start,blocks:count,byFaction,rulesDigest};
    if(process.argv[4])fs.writeFileSync(process.argv[4],JSON.stringify(out,null,2)+'\n');
    console.log(JSON.stringify(out));
  }).catch(err=>{console.error(err);process.exitCode=1});
}
