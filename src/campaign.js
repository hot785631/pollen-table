(function (root) {
  "use strict";
  const E = root.Pollen;
  const art = root.PollenArt;
  const teams = { ant:"蚂蚁", bee:"蜜蜂", beetle:"甲虫", spider:"蜘蛛", butterfly:"蝴蝶" };
  const collectible = { ant:"琥珀穹冠蚁", bee:"曦光琉璃蜂", beetle:"苍苔月角兜", spider:"星露织蛛", butterfly:"极昼霓裳蝶" };
  const chiefs = { ant:"腥红蚂蚁", bee:"胡蜂", beetle:"长戟大兜虫", spider:"捕鸟蛛", butterfly:"鸟翼凤蝶" };
  function encounter(faction,stage) {
    const rules=E.campaignEncounter(faction,stage);
    return {...rules,name:stage===6?collectible[faction]:stage===5?chiefs[faction]:teams[rules.opponent]+"队"};
  }
  const skillNames = { ant:"搭把手", bee:"搬花粉", beetle:"顶一顶", spider:"织网", butterfly:"守蛹" };
  const stages = [1, 2, 3, 4, 5, 6];
  const memory = new Map();
  const key = (faction, stage) => "microgrove-campaign-v1-"+faction+"-"+stage;
  function best(faction,stage) {
    const id=key(faction,stage);
    let value=memory.get(id)||0;
    try {
      const saved=Number(root.localStorage.getItem(id));
      if(Number.isInteger(saved)&&saved>=1&&saved<=3)value=Math.max(value,saved);
      for(let star=3;star>value;star--)if(root.localStorage.getItem(id+"-star-"+star)==="1"){value=star;break;}
    } catch (_) {}
    return value;
  }
  function unlocked(faction,stage) {
    return Object.hasOwn(teams,faction)&&stages.includes(stage)&&(stage===1||best(faction,stage-1)>0);
  }
  function starsFor(score) {return score<15?3:score<23?2:1;}
  function finish(faction,stage,game) {
    if(game.phase!=="done"||!unlocked(faction,stage))return null;
    const before=best(faction,stage);
    const stars=game.winner===0?starsFor(game.players[1].score):0;
    const record=Math.max(before,stars);
    if(record>before){
      const id=key(faction,stage);
      memory.set(id,record);
      // Separate star keys ensure simultaneous wins in two tabs can only add progress.
      try{root.localStorage.setItem(id+"-star-"+record,"1");root.localStorage.setItem(id,String(record));}catch(_){}
    }
    return {stars,best:record,newPiece:stars>0&&before===0};
  }
  function count(faction){return stages.filter(stage=>best(faction,stage)>0).length;}
  function starsMark(n) {
    return '<span class="campaign-stars" aria-label="'+n+'颗星">'+[1,2,3].map(i=>'<span aria-hidden="true"'+(i<=n?' class="lit"':'')+'>'+(i<=n?'★':'☆')+'</span>').join("")+'</span>';
  }
  const lock='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3"/><rect x="5" y="10" width="14" height="11" rx="3"/><circle cx="12" cy="15" r="1"/></svg>';
  function puzzle(faction,full=false,highlight) {
    const complete=count(faction)===6;
    return '<div class="campaign-puzzle '+(complete?'complete ':'')+(full?'large':'')+'" data-picture="'+faction+'" role="img" aria-label="'+collectible[faction]+'拼图，已得到'+count(faction)+'块，共6块">'+root.PollenPuzzle.render(faction,stages.map(n=>best(faction,n)),{highlight})+'</div>';
  }
  function skillInfo(faction,enhanced) {
    const r=E.specialRules(faction),name=skillNames[faction];
    const usual={
      ant:"把自己的力量加给一只相邻伙伴。",
      bee:"把一堆花粉搬到有己方伙伴的相邻花道。",
      beetle:"把正对的敌虫顶到邻道或交换位置，令它减 "+(r.pushLoss??0)+" 力，也挣脱自己的网。",
      spider:"网住一个敌位一轮。空网挡伙伴，网中虫不采粉，已有的蛹被摧毁。",
      butterfly:"在己方伙伴旁留蛹，收粉时吃本道花粉，下轮孵出 "+(r.hatchPower??0)+" 加吃粉数的力量。"
    };
    const greater={
      ant:"选一只己方伙伴，把它的力量同时加给左右相邻的伙伴。",
      bee:"选一只己方蜂，把左边、右边或两边的整堆花粉搬到它脚下。",
      beetle:"把正对的敌虫顶去邻道或交换位置，令它减 4 力，也挣脱自己的网。",
      spider:"敌位结网两轮，立刻破蛹。空网挡伙伴，网中虫不采粉。",
      butterfly:"在己方伙伴旁留蛹，任选两条不同的花道进食。它们都可以在蛹住的花道以外。"
    };
    return {name, text:(enhanced?greater:usual)[faction]};
  }
  function skillsList(encounter) {
    return '<ul class="campaign-skills">'+encounter.skills.map(s=>{
      const info=skillInfo(s.faction,s.enhanced);
      return '<li><span class="campaign-skill-art" aria-hidden="true">'+art.skill(s.faction)+'</span><div><strong>'+info.name+'</strong><small class="boss-skill-cost" aria-label="'+E.specialCost(s.faction)+'点阳光">'+art.icon("sun")+E.specialCost(s.faction)+'</small>'+(s.enhanced?'<b class="skill-plus">强化</b>':'')+'<p>'+info.text+'</p></div></li>';
    }).join("")+'</ul>';
  }
  function map(faction) {
    const pieces=count(faction);
    return '<section class="campaign-map"><header class="campaign-heading"><div><p>单人战役</p><h1>'+teams[faction]+'之路</h1></div><button type="button" class="plain" data-do="campaign-back">‹ 换队</button></header><div class="campaign-layout"><div class="campaign-stages" aria-label="六道关卡">'+stages.map(stage=>{
      const boss=encounter(faction,stage),open=unlocked(faction,stage),stars=best(faction,stage);
      return '<button type="button" data-do="campaign-stage" data-stage="'+stage+'" data-focus="campaign-stage-'+stage+'" class="campaign-stage '+(open?'':'locked ')+(open&&!stars?'next-stage':'')+'" aria-label="第'+stage+'关，'+boss.name+'，'+(stars?stars+'颗星':open?'可以挑战':'未解锁')+'" '+(open?'':'disabled')+'><span class="stage-number">'+stage+'</span><span class="stage-name">'+boss.name+'</span>'+(open?(stars?starsMark(stars):'<span class="stage-go" aria-hidden="true">›</span>'):'<span class="stage-lock">'+lock+'</span>')+'</button>';
    }).join("")+'</div><aside class="campaign-album"><header><h2>'+collectible[faction]+'</h2><span>'+pieces+' / 6</span></header>'+puzzle(faction)+(pieces===6?'<button type="button" class="solid" data-do="campaign-picture">看完整大图</button>':'<p>每过一关，点亮一块拼图。</p>')+'</aside></div></section>';
  }
  function medalGuide(){return '<div class="medal-guide"><small>胜利时看对手的花粉数</small><span>★★★ <b>0–14</b></span><span>★★ <b>15–22</b></span><span>★ <b>23 以上</b></span></div>';}
  function stageInfo(faction,stage) {
    const foe=encounter(faction,stage);
    const reveal=stage===6?'<p>六张暗牌之外，首领每轮还会从这三种专属里翻开一张明牌。</p>':'';
    return '<div class="campaign-opponent">'+art.bug(foe.opponent)+'<div><small>第 '+stage+' 关 · '+(stage===6?'幻想首领':stage===5?'强化首领':'对手')+'</small><h3>'+foe.name+'</h3></div></div>'+reveal+skillsList(foe)+medalGuide()+'<div class="sheet-actions"><button class="solid" type="button" data-do="campaign-fight" data-stage="'+stage+'">开始挑战 ›</button></div>';
  }
  function result(faction,stage,reward,score) {
    return '<div class="campaign-result" role="status">'+(reward.stars?puzzle(faction,false,stage):'')+'<div>'+(reward.stars?starsMark(reward.stars):'')+'<strong>'+(reward.stars?'第 '+stage+' 关通关':'再试一次')+'</strong><span>对手 '+score+' 枚花粉'+(reward.newPiece?' · 获得第 '+stage+' 块拼图':reward.best?' · 最佳 '+reward.best+' 星':'')+'</span></div></div>';
  }
  root.PollenCampaign={encounter,map,stageInfo,skillsList,skillInfo,puzzle,unlocked,finish,result,best,count,collectible,medalGuide};
})(window);
