(function () {
  "use strict";
  const E = window.Pollen;
  const art = window.PollenArt;
  const app = document.getElementById("app");
  const sheet = document.getElementById("sheet");
  const sheetBody = document.getElementById("sheet-body");
  const live = document.getElementById("live");
  const names = { ant:"蚂蚁", beetle:"甲虫", bee:"蜜蜂", spider:"蜘蛛", butterfly:"蝴蝶" };
  const skills = {
    ant:{name:"搭把手", row:"own", text:"帮忙的蚂蚁现在有几力，就给隔壁伙伴加几力。它自己仍然一样有力。", ask:"点来帮忙的蚁", next:"点旁边的伙伴"},
    beetle:{name:"顶一顶", row:"enemy", get text(){const n=E.specialRules("beetle").pushLoss;return "把正对甲虫的敌虫顶到邻道。"+(n?"它减 "+n+" 力，最低到 0。":"")+"若邻道有敌虫，两只交换位置。顶撞也能挣脱自己脚下的网。";}, ask:"点甲虫正对的敌虫", next:"点相邻敌方叶位"},
    bee:{name:"搬花粉", row:"pollen", text:"把一朵花的花粉全部搬走，堆到隔壁有自己蜜蜂的花上。新的一堆也能再整堆搬。", ask:"点要搬走的一堆花粉", next:"点旁边有蜂的花道"},
    spider:{name:"织网", row:"enemy", single:true, text:"点对手没结网或有蛹的叶子。空网挡新伙伴；网里的虫这轮不采粉；现有的蛹被摧毁，下轮不孵化。", ask:"点对面没网或有蛹的叶子"},
    butterfly:{name:"守蛹", row:"own", single:true, get text(){return "点自己的蝴蝶留蛹。结算时蛹还在，就吃光本道剩余花粉，下轮孵出 "+E.specialRules("butterfly").hatchPower+"＋吃粉数 力的新蝶。织网破蛹，花粉留在道上。";}, ask:"点场上的蝴蝶守蛹"}
  };
  const laneName = i => "第"+(i+1)+"花道";
  const phases = [
    {name:"初花", id:"early", cap:"3–4", art:'<path d="M13 27V16m0 10q-7 0-8-5 5-1 8 3" fill="#a4bf87" stroke="#476c4c"/><path d="M13 19Q5 16 7 8l5 3 2-7q6 6 4 10-1 3-5 5Z" fill="#e7b29f" stroke="#996c54"/>'},
    {name:"盛花", id:"mid", cap:"5–7", art:'<path d="M13 27V15m0 10q5-5 9-4-1 4-9 5" fill="#9ab57c" stroke="#476c4c"/><path d="M12 7C9 0 4 5 7 10 0 9 2 16 8 16c-3 5 3 9 6 3 3 6 9 3 7-2 7 0 7-7 1-8 1-7-5-8-8-2Z" fill="#f2c96a" stroke="#96713c"/><circle cx="14" cy="13" r="3" fill="#ac7039"/>'},
    {name:"晚花", id:"late", cap:"8–10", art:'<path d="M13 27V13m0 13q7-2 8-8-6 2-8 7" fill="#a1b281" stroke="#476c4c"/><path d="M8 13Q5 7 10 5l3-3 3 3q7 1 5 8l-4 5h-5Z" fill="#cf9b68" stroke="#936646"/><path d="m12 7-1 5m5-5-1 6m4-4-1 3" fill="none" stroke="#8c633f"/>'}
  ];
  const phaseAt = round => phases[round<=2?0:round<=5?1:2];
  const phaseIcon = ph => '<svg aria-hidden="true" viewBox="0 0 28 30" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+ph.art+'</svg>';
  function specialPrice(team) {
    const cost=E.specialCost(team);
    return '<span aria-label="专属费用 '+cost+' 点阳光">'+icon("sun")+cost+'</span>';
  }
  function currentSkillFee() {
    if(sel?.kind!=="special" || !game)return "";
    const team=actorTeam();
    return '<span class="current-fee">'+icon("sun")+E.specialCost(team)+'</span>';
  }
  const TEAMS = Object.keys(names);
  const deckLimit=E.deckLimit;
  const prefKey = "microgrove-pollen-decks-v5";
  const seatPrefKey = "microgrove-pollen-seat-decks-v5";
  const soloChoiceKey = "microgrove-pollen-solo-choices-v5";
  let screen = "home", team = "ant", game = null, sel = null, pending = null;
  let mode = "solo";
  const seatBoxes = [{}, {}];
  const seatDrafts=[null,null];
  const restoredDrafts=new WeakSet();
  const soloSource={};
  const picks = ["ant","beetle"], seatSources = [{},{}];
  let draft = null, dialogMode = "", aiTimer = null, motionLane = null;
  const handViews = [0,1].map(()=>({slots:Array(6).fill(null)}));
  let tally=null;
  const playerName = side => mode==="duo"?"玩家 "+(side+1):side===0?"你":"对手";
  const actorSide = () => mode==="duo"&&game?game.turn:0;
  const actorTeam = () => game?.players[actorSide()].faction||team;
  const canAct = () => game?.phase==="play"&&game.turn===actorSide();
  let decks = {},migrationNotice=false;
  function savedRecord(currentKey) {
    const stem=currentKey.replace(/v5$/,"v");
    for(const version of [5,4,3,2,1]) {
      const raw=localStorage.getItem(stem+version);
      if(raw===null)continue;
      try {const data=JSON.parse(raw);if(data&&typeof data==="object")return {data,old:version!==5};}catch(_){}
    }
    return {data:{},old:false};
  }
  function loadBox(d,t,old) {
    if(old && Array.isArray(d.partners) && Array.isArray(d.hits) && d.partners.length>0) {
      const explicit=Number.isInteger(d.specials)&&Number.isInteger(d.supplies)
        &&d.specials>=0&&d.supplies>=0&&d.partners.length+d.hits.length+d.specials+d.supplies===20;
      const implicit=d.specials===undefined&&d.supplies===undefined&&d.partners.length===12&&d.hits.length>=2&&d.hits.length<=7;
      if((explicit||implicit)&&d.partners.every(n=>[1,2,3,4].includes(n))&&d.hits.every(n=>[1,2,3].includes(n)))migrationNotice=true;
    }
    return E.migrateDeck(d,t);
  }
  function boxFor(boxes,t) {return boxes[t]??(t==="spider"?boxes.mantis:null);}
  function readSources(record,target) {
    if(!record||typeof record!=="object")return;
    for(const t of TEAMS) {
      const source=boxFor(record,t);
      if(source==="preset"||source==="box")target[t]=source;
    }
  }
  try {
    const {data:saved,old}=savedRecord(prefKey);
    for (const t of TEAMS) {const box=boxFor(saved,t);if(box)decks[t]=loadBox(box,t,old);}
    if ((old||saved.mantis&&!saved.spider)&&Object.keys(decks).length) localStorage.setItem(prefKey,JSON.stringify(decks));
  } catch (_) {}
  try {
    const saved=JSON.parse(localStorage.getItem(soloChoiceKey)||"{}");
    if(saved.team==="mantis")team="spider";
    else if(TEAMS.includes(saved.team))team=saved.team;
    readSources(saved.sources,soloSource);
  } catch (_) {}
  try {
    const {data:saved,old}=savedRecord(seatPrefKey);
    let renamed=false;
    for(const side of [0,1]){
      const savedBoxes=saved.boxes?.[side]||{};
      for(const t of TEAMS){const box=boxFor(savedBoxes,t);if(box)seatBoxes[side][t]=loadBox(box,t,old);}
      const selected=saved.teams?.[side];
      if(selected==="mantis"){picks[side]="spider";renamed=true;}
      else if(TEAMS.includes(selected))picks[side]=selected;
      if(savedBoxes.mantis&&!savedBoxes.spider)renamed=true;
      if(saved.sourcesByFaction?.[side])readSources(saved.sourcesByFaction[side],seatSources[side]);
      // Older versions retained just one source for every tribe on a seat.
      // An old "preset" may have been selected automatically on a different tribe.
      else if(saved.sources?.[side]==="box"&&(seatBoxes[side][picks[side]]||decks[picks[side]]))seatSources[side][picks[side]]="box";
    }
    if(old||renamed||saved.boxes&&!saved.sourcesByFaction)saveSeatChoices();
  } catch (_) {}
  function saveSoloChoices() {
    try{localStorage.setItem(soloChoiceKey,JSON.stringify({team,sources:soloSource}));}catch(_){}
  }
  function saveSeatChoices() {
    try{localStorage.setItem(seatPrefKey,JSON.stringify({boxes:seatBoxes,teams:picks,sourcesByFaction:seatSources,sources:picks.map((t,i)=>activeSource(i,t))}));}catch(_){}
  }
  function activeSource(side,t) {
    if(side===null)return decks[t]&&soloSource[t]!=="preset"?"box":"preset";
    const source=seatSources[side][t];
    if(source==="preset")return "preset";
    return seatBoxes[side][t]||(source==="box"&&decks[t])?"box":"preset";
  }
  function chosenDeck(side,t) {
    if(activeSource(side,t)==="preset")return E.defaultDeck(t);
    return side===null?decks[t]:seatBoxes[side][t]||decks[t];
  }
  function abilityBlurb(t) {
    const r=E.specialRules(t);
    if(t==="ant")return "把一只蚂蚁的力量加给相邻伙伴，自己的力量不变。";
    if(t==="beetle")return "把对面的虫顶到邻道或交换位置"+(r.pushLoss?"，被顶的虫减 "+r.pushLoss+" 力":"")+"，甲虫自己也挣脱蛛网。";
    if(t==="bee")return "把一条道的全部花粉搬到相邻、有己方蜜蜂的花道。";
    if(t==="spider")return "点对面没网或有蛹的叶位：空位挡伙伴，有虫则本轮不采粉；现有的蛹被摧毁，下轮不孵化。";
    return "在自己的蝴蝶旁留蛹。活到结算才吃光本道剩余花粉，下轮孵出 "+r.hatchPower+"＋吃粉数 力的新蝶。";
  }
  function abilityPanel(t) {
    return '<div class="team-ability" aria-live="polite"><span class="ability-thumb" aria-hidden="true">'+art.skill(t)+'</span><div class="ability-copy"><div class="ability-title"><strong>'+skills[t].name+'</strong>'+specialPrice(t)+'</div><p>'+abilityBlurb(t)+'</p></div></div>';
  }
  const cycleGlyph='<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a11 11 0 0 1 19-5l3 3M27 4v7h-7M27 19a11 11 0 0 1-19 5l-3-3M5 28v-7h7"/></svg>';
  const icon = (name,cls="") => '<span aria-hidden="true" class="icon '+cls+'">'+(name==="cycle"?cycleGlyph:art.icon(name))+'</span>';
  const bug = t => '<span aria-hidden="true" class="bug">'+art.bug(t)+'</span>';
  const mark = () => '<div class="mast-mark">'+icon("leaf")+'<span class="word-mark">微境</span></div>';
  const say = str => {live.textContent=str;};
  const copy = x => JSON.parse(JSON.stringify(x));
  function helpButton() {return '<button type="button" class="round-btn" data-do="help" aria-label="玩法图解" title="玩法图解">?</button>';}
  function head(inner="") {
    return '<header class="mast">'+mark()+inner+'<div class="row mast-actions">'+helpButton()+'</div></header>';
  }
  function actionButton(id,label,cls="plain",glyph="") {
    return '<button type="button" class="'+cls+'" data-do="'+id+'">'+(glyph?icon(glyph):"")+label+'</button>';
  }
  function render(focusKey) {
    if (!focusKey) focusKey = document.activeElement?.dataset?.focus;
    app.innerHTML = screen==="home"?home():screen==="solo"?soloSetup():screen==="duo"?duoSetup():screen==="deck"?deckScreen():battle();
    if (focusKey) {
      const item=Array.from(app.querySelectorAll("[data-focus]")).find(el=>el.dataset.focus===focusKey && !el.disabled);
      if (item) item.focus({preventScroll:true});
    }
  }
  function home() {
    const notice=migrationNotice?'<p class="home-note" role="status">旧牌盒已按原比例整理为'+deckLimit+'张，可继续调整。</p>':"";
    migrationNotice=false;
    const choice=(id,title,note,images)=>'<button class="mode-choice '+id+'" data-do="mode-'+id+'" data-focus="mode-'+id+'"><span class="mode-symbol" aria-hidden="true">'+images+'</span><span class="mode-copy"><strong>'+title+'</strong><small>'+note+'</small></span></button>';
    return '<div class="wrap mode-home">'+head()+'<section class="home"><div class="home-hero"><h1>花粉擂台</h1><p>五条花道，先带回 30 枚花粉。</p></div><div class="mode-menu">'+choice("solo","单人挑战","和电脑对战",bug("ant")+icon("play"))+choice("duo","双人同桌","坐在平板两边，一人一队",bug("bee")+bug("beetle"))+'</div>'+notice+'</section></div>';
  }
  function soloSetup() {
    const cards=TEAMS.map(t=>'<button type="button" data-do="team" data-team="'+t+'" data-focus="tribe-'+t+'" aria-pressed="'+(t===team)+'" aria-label="选择'+names[t]+'队" class="tribe '+t+(t===team?' chosen':'')+'"><span class="portrait">'+bug(t)+'</span><strong>'+names[t]+'队</strong></button>').join("");
    const choices=decks[team]?'<div class="deck-options solo-deck-options" aria-label="选择牌盒">'+[["preset","预组牌"],["box","我的牌盒"]].map(([v,label])=>'<button class="pill" data-do="solo-deck" data-source="'+v+'" aria-pressed="'+(activeSource(null,team)===v)+'">'+label+'</button>').join("")+'</div>':'';
    return '<div class="wrap">'+head()+'<section class="home solo-setup"><div class="home-hero"><h1>选队</h1></div><div class="roster" aria-label="选择队伍">'+cards+'</div>'+abilityPanel(team)+choices+'<div class="home-actions">'+actionButton("modes","选模式","plain","back")+actionButton("build","配牌","edit-btn","leaf")+actionButton("start","开始对战","solid","play")+'</div></section></div>';
  }
  function pickSeat(side) {
    const t=picks[side];
    if(seatDrafts[side])return '<section class="pick-seat seat-'+side+' editing" aria-label="'+playerName(side)+'配牌"><div class="pick-inner">'+builderEditor(seatDrafts[side],t,side)+'</div></section>';
    const roster=TEAMS.map(x=>'<button class="pick-team '+x+(x===t?' chosen':'')+'" data-do="pick-team" data-seat="'+side+'" data-team="'+x+'" data-focus="pick-'+side+x+'" aria-pressed="'+(x===t)+'" aria-label="'+playerName(side)+'选'+names[x]+'">'+bug(x)+'<strong>'+names[x]+'</strong></button>').join("");
    const choices=(seatBoxes[side][t]||decks[t])?'<div class="deck-options" aria-label="选择牌盒">'+[["preset","预组牌"],["box",seatBoxes[side][t]?"我的牌盒":"单人牌盒"]].map(([v,label])=>'<button class="pill" data-do="pick-deck" data-seat="'+side+'" data-source="'+v+'" aria-pressed="'+(activeSource(side,t)===v)+'">'+label+'</button>').join("")+'</div>':'';
    return '<section class="pick-seat seat-'+side+'" aria-label="'+playerName(side)+'选队"><div class="pick-inner"><h2>'+playerName(side)+' · 选队</h2><div class="mini-roster">'+roster+'</div>'+abilityPanel(t)+choices+'<button class="pill" data-do="seat-build" data-seat="'+side+'">配牌</button></div></section>';
  }
  function duoSetup() {
    const locked=seatDrafts.some(Boolean),disabled=locked?" disabled":"";
    return '<div class="wrap duo-setup">'+pickSeat(1)+'<div class="setup-start"><div class="setup-caption"><strong>双人同桌</strong><small class="setup-status" aria-live="polite">'+duoStatus()+'</small></div><div class="row"><button class="plain" data-do="modes"'+disabled+'>'+icon("back")+'选模式</button><button class="solid" data-do="start-duo"'+disabled+'>'+icon("play")+'开局</button></div></div>'+pickSeat(0)+'</div>';
  }
  function duoStatus() {
    const editing=[0,1].filter(i=>seatDrafts[i]).map(playerName);
    return editing.length?(editing.length===2?"双方":editing[0])+"配牌中":"";
  }
  function refreshSeat(side,focusKey) {
    const old=app.querySelector(".pick-seat.seat-"+side);
    if(!old)return;
    const oldScroll=old.querySelector(".builder-scroll")?.scrollTop||0;
    const template=document.createElement("template");template.innerHTML=pickSeat(side);
    const panel=template.content.firstElementChild;old.replaceWith(panel);
    const scroller=panel.querySelector(".builder-scroll");if(scroller)scroller.scrollTop=oldScroll;
    const focus=Array.from(panel.querySelectorAll("[data-focus]")).find(el=>el.dataset.focus===focusKey&&!el.disabled);
    if(focus)focus.focus({preventScroll:true});
    const locked=seatDrafts.some(Boolean);
    app.querySelector(".setup-start [data-do=start-duo]").disabled=locked;
    app.querySelector(".setup-start [data-do=modes]").disabled=locked;
    app.querySelector(".setup-status").textContent=duoStatus();
  }
  function editDeck(side = null) {
    if(side!==null){seatDrafts[side]=copy(chosenDeck(side,picks[side]));refreshSeat(side);return;}
    screen="deck";draft=copy(chosenDeck(null,team));render();
  }
  const cardGroups = [
    {kind:"partners", label:"伙伴", glyph:"leaf", tiers:[1,2,3,4]},
    {kind:"hits", label:"撞击", glyph:"bump", tiers:[1,2,3]},
    {kind:"supplies", label:"补给", glyph:"supply", tiers:[1]},
    {kind:"specials", label:"专属", glyph:"flower", tiers:[0]}
  ];
  function builderFee(kind,tier,t) {
    if(kind==="hits")return E.hitCost(tier);
    if(kind==="supplies")return E.supplyCost;
    if(kind==="specials")return E.specialCost(t);
    return tier;
  }
  function builderLabel(group,tier,t) {
    const price=builderFee(group.kind,tier,t)+"费";
    if(group.kind==="hits")return price+"撞击，减"+tier+"力";
    if(group.kind==="partners")return price+"伙伴，力量"+E.powerForCost(tier);
    if(group.kind==="supplies")return price+"补给，补满6张手牌";
    return price+skills[t].name;
  }
  const groupSize=(d,k)=>Array.isArray(d[k])?d[k].length:d[k];
  const deckSize=d=>cardGroups.reduce((n,g)=>n+groupSize(d,g.kind),0);
  function copiesOf(d,k,tier){
    return Array.isArray(d[k])?d[k].filter(v=>v===tier).length:d[k];
  }
  function mayAdd(d,k){
    const total=deckSize(d);
    return total<deckLimit && (k==="partners"||d.partners.length>0||total<deckLimit-1);
  }
  function editorOf(el) {
    const k=el.closest("[data-editor]")?.dataset.editor;
    return k==="0"||k==="1"?Number(k):null;
  }
  function changeCopy(side,kind,tier,delta) {
    const d=side===null?draft:seatDrafts[side];
    const g=cardGroups.find(group=>group.kind===kind);
    if(!d||!g||!g.tiers.includes(tier))return;
    if(delta===1 && !mayAdd(d,kind) || delta===-1 && copiesOf(d,kind,tier)===0)return;
    restoredDrafts.delete(d);
    if(Array.isArray(d[kind])) {
      if(delta===1)d[kind].push(tier);
      else d[kind].splice(d[kind].indexOf(tier),1);
    } else d[kind]+=delta;
    const available=delta===1?mayAdd(d,kind):copiesOf(d,kind,tier)>0;
    const focus=(available?delta:-delta)===1?"add":"remove";
    const key=focus+'-'+kind+'-'+tier;
    if(side===null)render(key);else refreshSeat(side,key);
    say((side===null?"":playerName(side))+builderLabel(g,tier,side===null?team:picks[side])+"，现有"+copiesOf(d,kind,tier)+"张，牌盒共"+deckSize(d)+"张。");
  }
  function deckGroup(g,draft,team) {
    return '<section class="deck-group '+g.kind+'"><h2>'+icon(g.glyph)+g.label+'</h2>'+g.tiers.map(tier=>{
      const k=g.kind, quantity=copiesOf(draft,k,tier),cost=builderFee(k,tier,team),suffix=builderLabel(g,tier,team);
      const glyph=k==="partners"?bug(team):k==="specials"?art.skill(team):icon(g.glyph);
      const effect=k==="partners"?'<span class="builder-force" aria-label="力量'+E.powerForCost(tier)+'">'+icon("force")+E.powerForCost(tier)+'</span>':k==="hits"?'<span class="builder-force" aria-label="减力'+tier+'">'+icon("force")+'−'+tier+'</span>':k==="supplies"?'<span class="supply-note">补满 6 张手牌</span>':'<strong>'+skills[team].name+'</strong>';
      const identity='<span class="build-card"><span class="build-art">'+glyph+'</span><span class="build-cost">'+(k==="specials"?specialPrice(team):'<span aria-label="'+cost+'点阳光">'+icon("sun")+cost+'</span>')+'</span>'+effect+'</span>';
      const step=(action,mark,enabled)=>'<button type="button" data-do="'+action+'-copy" data-kind="'+k+'" data-tier="'+tier+'" data-cost="'+cost+'" data-focus="'+action+'-'+k+'-'+tier+'" aria-label="'+(action==="add"?"加一张":"移走一张")+suffix+'" '+(enabled?'':'disabled')+'>'+mark+'</button>';
      return '<div class="build-row" data-group="'+k+'" data-tier="'+tier+'">'+identity+'<span class="stepper">'+step("remove","−",quantity>0)+'<strong class="copies" aria-label="'+quantity+'张">'+quantity+'</strong>'+step("add","＋",mayAdd(draft,k))+'</span></div>';
    }).join("")+(g.kind==="specials"?'<p class="builder-special-rule">'+skills[team].text+'</p>':g.kind==="hits"?'<p class="builder-special-rule">0 费撞击也占 1 个牌位，打出算 1 次行动。</p>':'')+'</section>';
  }
  function probabilityLabel(p){
    if(p===0||p===1)return Math.round(100*p)+"%";
    const rounded=Math.round(p*1000)/10;
    return rounded>=100?">99.9%":rounded===0?"<0.1%":rounded+"%";
  }
  function firstHandOdds(draft,n) {
    const odds=cardGroups.map(g=>{
      const value=n>=6?E.openingChance(groupSize(draft,g.kind),n):null;
      return '<div class="odds-row" data-group="'+g.kind+'"><span>'+icon(g.glyph)+g.label+'</span><span class="odds-track" aria-hidden="true"><i style="width:'+(value===null?0:value*100)+'%"></i></span><strong>'+(value===null?'—':probabilityLabel(value))+'</strong></div>';
    }).join("");
    const note=n<6?"至少放 6 张后显示概率。":n<deckLimit?"按当前 "+n+" 张试算，补满后会变。":"每项是六张里至少出现一次的机会。";
    return '<aside class="draw-odds"><h2>首手 6 张</h2><p>摸到至少一张的概率</p>'+odds+'<small>'+note+'</small></aside>';
  }
  function builderEditor(draft,team,side) {
    const n=deckSize(draft),valid=E.validateDeck(draft);
    const stats=cardGroups.map(g=>'<span data-group="'+g.kind+'">'+icon(g.glyph)+g.label+' <b>'+groupSize(draft,g.kind)+'</b></span>').join("");
    const hint=n===deckLimit?"牌盒满了。先按 − 腾出一格，再按 ＋ 加入想要的牌。":n===deckLimit-1&&!draft.partners.length?"最后一格请放一张伙伴。":"还差 "+(deckLimit-n)+" 张。按 ＋ 加入牌盒，至少留一张伙伴。";
    return '<section class="deck builder '+(side===null?'solo-builder':'seat-editor')+'" data-editor="'+(side??'solo')+'"><div class="deck-heading">'+bug(team)+'<h2>'+(side!==null?playerName(side)+' · ':'')+names[team]+'牌盒</h2><span class="deck-count" aria-label="共'+n+'张，目标'+deckLimit+'">'+n+'<small>/'+deckLimit+'</small></span></div><div class="builder-scroll" tabindex="0" aria-label="牌组内容"><div class="stats-and-restore"><div class="deck-stats">'+stats+'</div><button type="button" class="pill preset-restore" data-do="restore-preset" data-focus="restore-preset" title="恢复当前草稿；保存后才更换牌组">'+(restoredDrafts.has(draft)?"已恢复预组":"恢复预组")+'</button></div><p class="deck-intro">'+hint+'</p><div class="builder-body"><div class="deck-list">'+cardGroups.map(g=>deckGroup(g,draft,team)).join("")+'</div>'+firstHandOdds(draft,n)+'</div></div><div class="deck-foot">'+actionButton("deck-back",side===null?"返回，不保存":"取消","plain","back")+'<button type="button" class="solid" data-do="save-deck" '+(valid?'':'disabled')+'>'+icon("check")+'保存牌组</button></div></section>';
  }
  function deckScreen() {
    return '<div class="wrap builder-window">'+head()+builderEditor(draft,team,null)+'</div>';
  }
  function openSheet(title,body,mode) {
    stopAI();dialogMode=mode;
    sheet.dataset.seat=screen==="battle"&&mode==="duo"&&game.turn===1?"1":"0";
    sheetBody.innerHTML='<div class="sheet-top"><h2 id="sheet-title">'+title+'</h2><button type="button" class="round-btn" data-do="close-sheet" aria-label="关闭">×</button></div>'+body;
    if (!sheet.open) sheet.showModal();
    sheet.querySelector('[data-do="close-sheet"]').focus();
  }
  function closeSheet() {if(sheet.open)sheet.close();}
  function floweringOdds() {
    const weights=E.tuning.pollenWeights,total=weights.reduce((a,b)=>a+b,0);
    const odds=[1,2,0,3].map(n=>(n?n+" 枚":"空花")+" "+Math.round(weights[n]*100/total)+"%").join("、");
    return '<details class="flower-odds"><summary>每条花道的开花机会</summary><p>'+odds+'。五道分别抽取，整桌总数由每道开出的花粉相加得到。</p></details>';
  }
  function openHelp() {
    const team=actorTeam();
    const rows=[
      ["pollen","花粉","每轮每朵花独立开出 0、1、2 或 3 枚花粉。蜜蜂能把整堆搬到隔壁，3 枚搬到已有 1 枚的花上，就变成 4 枚。收粉时比能采粉的力量，大的一边收走这朵剩下的花粉，平手谁都不收。"],
      ["sun","阳光","第一轮每人 3 点，以后每轮多 1 点，升到 10 点为止。每轮重新补满。上限 3～4 点叫初花，5～7 点叫盛花，8～10 点叫晚花。"],
      ["force","伙伴","点虫牌，再点自己这边的空位。脚印旁的数字是力量。"],
      ["bump","撞击","点撞击牌，再点对面的虫。减 1、2、3 力的牌，分别花 "+[1,2,3].map(E.hitCost).join("、")+" 点阳光。虫的力量最低到 0。"],
      ["web","蛛网","织网会摧毁目标位置现有的蛹，花粉留在道上。空网挡手牌伙伴；网中虫保留力量和绝招，但本轮不采粉。甲虫顶撞能挣脱网。若两边都没有采粉力量，就都得 0。收完花粉清网。"],
      ["cocoon","蛹","放蛹时花粉留在道上，蜜蜂可以搬进或搬走花粉。结算时，活着的蛹先吃光本道剩余花粉，下一轮原地孵化。双方在同一道留蛹时，先放的先吃，另一只按基础力量孵化。原蝶被顶走，蛹仍留在原道。"],
      ["supply","补给","花 "+E.supplyCost+" 点阳光打出补给，从自己的牌堆补满 6 张手牌。手里原有 3 张时，打掉补给剩 2 张，再摸 4 张。刚打出的补给等摸完才放进弃牌堆。"],
      ["drawStack","摸牌","绿色牌堆旁边是还没抽的张数，托盘旁边是弃牌数。牌堆空了又要摸牌时，弃牌洗回来。"],
      ["flower",skills[team].name,"花 "+E.specialCost(team)+" 点阳光。"+skills[team].text+deckLimit+" 张牌里至少留 1 张伙伴，本族专属可放 0 到 "+(deckLimit-1)+" 张。"],
      ["cycle","换牌","每轮可以免费换一张手牌。点换牌，再点要换的牌，确认后抽另一张，算作一次行动。新一轮留下手里的牌，从同一个牌堆随机补到六张。"],
      ["check","轮流行动","「先」标在本轮先行动的人旁边，下轮换另一人先。双方都没收手时，一人做一次行动就换对手。出一张牌，包括 0 费牌，或换一次牌，都算一次行动。"],
      ["pass","收手","没有临时跳过。确认收手后，本轮不能再行动。另一方如果还没收手，可以连续出牌或换牌，直到也收手。双方都收手才收花粉，手里没打的牌留下。"],
      ["pollen","胜利","一轮结束时，得分达到 30 且领先的一方获胜。同分达到 30，就继续玩到分出高低。"]
    ];
    if(mode==="duo")rows.unshift(["leaf","同桌","玩家 1 坐下方，玩家 2 坐上方。双方手牌摊开，轮到谁，谁的手牌高亮可用；另一方手牌变灰，等待出牌。"]);
    openSheet("怎么玩",'<ul class="help-list">'+rows.map(([ic,b,t])=>'<li>'+icon(ic)+'<span><strong>'+b+'　</strong>'+t+'</span></li>').join("")+'</ul>'+floweringOdds()+'<div class="sheet-actions">'+actionButton("close-sheet","知道啦","confirm","check")+'</div>',"help");
  }
  function stopAI() {if (aiTimer!==null) {clearTimeout(aiTimer);aiTimer=null;}}
  function clearChoice() {sel=null;pending=null;}
  function begin() {
    stopAI();stopFlights();clearTally();clearChoice();motionLane=null;
    for(const h of handViews)h.slots=Array(6).fill(null);
    const others=TEAMS.filter(t=>t!==team);
    const factions=mode==="duo"?[...picks]:[team,others[Math.floor(Math.random()*others.length)]];
    const boxes=mode==="duo"?picks.map((t,i)=>chosenDeck(i,t)):[chosenDeck(null,team),null];
    game=E.newGame({factions,decks:boxes});
    screen="battle";render();animateTransfers();say("第一轮。"+drawAnnouncement()+playerName(game.turn)+"先出牌。");queueAI();
  }
  const myMoves = ()=>canAct()?E.actions(game,actorSide()):[];
  function drawAnnouncement() {
    const event=game.lastEvent;
    return [0,1].map(side=>{
      const n=event.drawn[side].length;
      if(!n)return "";
      return playerName(side)+(event.reshuffles[side]?"把弃牌洗回牌堆，":"")+"摸了"+n+"张。";
    }).join("");
  }
  function hatchAnnouncement() {
    return game.lastEvent.hatched.map((lanes,side)=>lanes.length?
      playerName(side)+"的"+lanes.map(laneName).join("、")+"孵出新蝴蝶。":"").join("");
  }
  function handTarget(side,id) {
    const hand=app.querySelector('[data-hand="'+side+'"]');
    if(!hand)return app.querySelector('[data-hand-anchor="'+side+'"]');
    // Never attach hidden card IDs or names to a covered slot.
    const visible=[...hand.querySelectorAll(".card")].find(el=>el.dataset.id===id);
    if(visible)return visible;
    const index=game.players[side].hand.findIndex(card=>card.id===id);
    return hand.children[index] || hand;
  }
  function stopFlights() {
    for(const el of document.querySelectorAll(".transfer-card")) {
      for(const motion of el.getAnimations())motion.cancel();
      el.remove();
    }
  }
  function flyBack(from,to,kind,side,delay,duration) {
    if(!from||!to)return;
    const card=document.createElement("span");
    card.className="transfer-card "+kind;
    card.setAttribute("aria-hidden","true");card.dataset.side=String(side);
    const x=from.left+from.width/2,y=from.top+from.height/2;
    const dx=to.left+to.width/2-x,dy=to.top+to.height/2-y;
    card.style.left=x+"px";card.style.top=y+"px";
    document.body.append(card);
    const turn=mode==="duo"&&side===1?180:0;
    const pose=(x,y,angle,size)=>"translate(-50%,-50%) translate("+x+"px,"+y+"px) rotate("+(turn+angle)+"deg) scale("+size+")";
    const arc=side===0?-18:18;
    const motion=card.animate([
      {transform:pose(0,0,-6,.65),opacity:0},
      {offset:.16,transform:pose(dx*.1,dy*.1+arc/3,-9,.96),opacity:1},
      {offset:.62,transform:pose(dx*.63,dy*.63+arc,6,1.05),opacity:1},
      {transform:pose(dx,dy,0,.70),opacity:0}
    ],{delay,duration,easing:"ease-in-out",fill:"both"});
    motion.onfinish=motion.oncancel=()=>card.remove();
  }
  function animateTransfers(previous=null,outgoing=null) {
    if(document.hidden||matchMedia("(prefers-reduced-motion: reduce)").matches||!Element.prototype.animate)return;
    const event=game.lastEvent;
    for(const side of [0,1]) {
      const ids=event.drawn[side];
      if(!ids.length){
        if(side===event.side&&outgoing)flyBack(outgoing,app.querySelector('[data-pile="discard-'+side+'"]')?.getBoundingClientRect(),"discard",side,0,315);
        continue;
      }
      const draw=app.querySelector('[data-pile="draw-'+side+'"]')?.getBoundingClientRect();
      const discard=app.querySelector('[data-pile="discard-'+side+'"]')?.getBoundingClientRect();
      // The old pile can run dry halfway through a round's refill.
      const boundary=event.reshuffles[side] ? previous.players[side].draw.length : -1;
      let delay=0;
      ids.forEach((id,i)=>{
        if(i===boundary) {flyBack(discard,draw,"shuffle",side,delay,300);delay+=305;}
        const target=handTarget(side,id);
        flyBack(draw,target?.getBoundingClientRect(),"draw",side,delay,365);
        if(target?.classList.contains("card")) {
          const opacity=getComputedStyle(target).opacity;
          target.animate([{opacity:.05},{offset:.76,opacity:.05},{opacity}],{delay,duration:365,fill:"backwards"});
        }
        delay+=event.type==="deal"?60:100;
      });
      // A spent supply or exchanged card did not take part in this action's reshuffle.
      if(side===event.side&&outgoing)flyBack(outgoing,discard,"discard",side,boundary>=0?delay:0,315);
    }
  }
  function visibleHand(side) {
    const cards=game.players[side].hand,h=handViews[side];
    const byId=new Map(cards.map(c=>[c.id,c]));
    h.slots=h.slots.map(id=>byId.has(id)?id:null);
    for(const c of cards) {
      if(h.slots.includes(c.id))continue;
      const next=h.slots.indexOf(null);
      if(next!==-1)h.slots[next]=c.id;
    }
    return h.slots.map(id=>byId.get(id)||null);
  }
  function cardLabel(c,side=actorSide()) {const team=game.players[side].faction;return c.kind==="special"?skills[team].name+"，"+c.cost+"费，"+skills[team].text:c.kind==="supply"?"补给，"+c.cost+"费，这次摸"+supplyAmount(side)+"张，把手牌补满6张。":(c.kind==="partner"?"伙伴":"撞击")+"，"+c.cost+"费，"+(c.kind==="partner"?"力量"+E.powerForCost(c.cost):"减力"+c.impact);}
  const frames = {
    partner: {
      outline:"M2 98 3 32Q4 11 26 8Q65 6 98 2L96 70Q95 93 73 95Q37 95 2 98Z",
      detail:"M7 88Q33 67 49 49M13 73 21 75M12 84 26 82M75 20 90 10M79 25 81 17M88 20 87 13",
      fill:"#d3eddf", stroke:"#3c775b", vein:"#93bea4"
    },
    hit: {
      outline:"M15 2H84L98 16V79L85 97H16L2 82V17Z",
      detail:"M4 27 22 5M5 34 27 7M72 92 94 70M79 92 95 75",
      fill:"#fbe2b9", stroke:"#a35a36", vein:"#e5b47e"
    },
    supply: {
      outline:"M5 8Q5 3 11 3H90Q97 3 97 11V83L83 97H11Q3 97 3 89Z",
      detail:"M82 95V83H95M11 20V11H22M12 26H21",
      fill:"#d4eaf0", stroke:"#3b687f", vein:"#88afb8"
    },
    special: {
      outline:"M4 22Q1 8 16 5Q26 1 34 7Q48 -1 56 7Q70 0 77 7Q96 4 96 22Q102 32 95 42Q102 54 95 64Q102 74 95 81Q97 96 83 95Q73 101 64 94Q51 102 41 94Q28 102 19 95Q3 98 4 82Q-1 70 6 62Q-1 51 6 42Q-1 31 4 22Z",
      detail:"M68 14Q73 9 78 14M84 86Q90 86 90 80M17 86Q11 87 11 80",
      fill:"#ebdbee", stroke:"#825688", vein:"#ba96bf"
    }
  };
  function cardFrame(kind) {
    const f=frames[kind];
    return '<svg class="card-shell" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="'+f.outline+'" fill="'+f.fill+'" stroke="'+f.stroke+'" stroke-width="2.5" vector-effect="non-scaling-stroke"/><path d="'+f.outline+'" transform="translate(3.5 3.5) scale(.93)" fill="none" stroke="'+f.vein+'" stroke-width="1.4" vector-effect="non-scaling-stroke"/><path d="'+f.detail+'" fill="none" stroke="'+f.vein+'" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';
  }
  function blockedLeafNote(side) {
    return game.board[side].every(Boolean)?"自己的叶位都站满了伙伴。":"剩下的空叶结着蛛网，收粉后才会打开。";
  }
  function humanCard(c,legal,side=actorSide()) {
    if(!c)return '<span class="card-empty" aria-hidden="true"></span>';
    const team=game.players[side].faction,supply=c.kind==="supply";
    const special=c.kind==="special", cycling=side===actorSide()&&sel?.kind==="cycle", active=sel?.key===c.id||pending?.type==="cycle"&&pending.card===c.id;
    const can=legal.some(m=>m.card===c.id && (cycling?m.type==="cycle":m.type===c.kind));
    const isMyTurn=side===actorSide()&&canAct();
    const middle=c.kind==="partner"?'<span class="card-bug">'+bug(team)+'</span>':special?'<span aria-hidden="true" class="card-action skill-art">'+art.skill(team)+'</span>':'<span class="card-action">'+icon(supply?"supply":"bump")+'</span>';
    let skillStat="";
    if(special&&team==="bee")skillStat='<small class="hatch-caption">搬走整堆</small>';
    if(special&&team==="butterfly")skillStat='<small class="hatch-caption">下轮 '+E.specialRules(team).hatchPower+'＋'+icon("pollen")+'</small>';
    const stat=special?'<span class="special-label">'+skills[team].name+skillStat+'</span>':supply?'<span class="card-stat">'+icon("handBack")+'+'+supplyAmount(side)+'</span>':'<span class="card-stat">'+icon("force")+(c.kind==="hit"?"−"+c.impact:E.powerForCost(c.cost))+'</span>';
    const disabledReason=!isMyTurn?"等你的回合":c.cost>game.players[side].sun?"阳光不足":special?skills[team].text:supply?"没有可摸的牌":c.kind==="hit"?"等对面上场":blockedLeafNote(side);
    return '<button type="button" class="card '+c.kind+(can?'':' off')+(active?' picked':'')+(cycling?' for-cycle':'')+'" data-do="card" data-id="'+c.id+'" data-focus="card-'+c.id+'" aria-pressed="'+Boolean(active)+'" aria-label="'+(cycling?'换走':'')+cardLabel(c,side)+(can?'':'。'+disabledReason)+'" '+(!isMyTurn?"disabled":"")+' title="'+cardLabel(c,side)+'">'+cardFrame(c.kind)+'<span class="cost '+(c.cost===0?'free':'')+'">'+icon("sun")+c.cost+'</span>'+middle+stat+'</button>';
  }
  function score(p,side) {
    const n=tally?tally.display[side]:p.score;
    return '<span class="score" data-score-side="'+side+'" aria-label="已收集'+n+'枚花粉，目标30">'+icon("pollen")+'<b>'+n+'</b><small>/30</small><span class="score-ruler" aria-hidden="true"><i style="width:'+Math.min(100,n/30*100)+'%"></i></span></span>';
  }
  function pileMeters(side) {
    const p=game.players[side],who=playerName(side);
    const meter=(key,glyph,label,n)=>'<span class="pile-meter '+key+'" data-pile="'+key+'-'+side+'" aria-label="'+who+label+'余'+n+'张" title="'+label+' · '+n+' 张">'+icon(glyph)+'<small>'+label+'</small><b>'+n+'</b></span>';
    const aiHand=mode==="solo"&&side===1?'<span class="pile-meter unseen-hand" data-hand-anchor="1" aria-label="对手手里有'+p.hand.length+'张" title="对手的手牌">'+icon("handBack")+'<b>'+p.hand.length+'</b></span>':'';
    return '<div class="pile-group">'+meter("draw","drawStack","牌堆",p.draw.length)+meter("discard","discardTray","弃牌",p.discard.length)+aiHand+'</div>';
  }
  function sideBar(side,view) {
    const p=game.players[side];
    const pendingSupply=pending?.type==="supply"&&game.turn===side?p.hand.find(c=>c.id===pending.card):null;
    const sun=view.players[side].sun-(pendingSupply?.cost??0);
    const passed=p.passed && game.phase==="play";
    const cap=Math.min(game.round+2,10);
    const first=side===game.first?'<small class="first-mark" role="img" aria-label="本轮先手" title="本轮先手">先</small>':"";
    return '<div class="roles" data-role-seat="'+side+'"><div class="row"><span class="role-id">'+bug(p.faction)+first+'</span><span class="role-name">'+playerName(side)+" · "+names[p.faction]+'</span>'+score(p,side)+'</div>'+pileMeters(side)+'<div class="row">'+(passed?'<span class="op-pass">已收手</span>':'')+'<span class="token" aria-label="本轮阳光上限'+cap+'，还剩'+sun+'点">'+icon("sun")+(sun!==p.sun?'<s class="old-number">'+p.sun+'</s>':'')+sun+'<small>/'+cap+'</small></span></div></div>';
  }
  function selectedMoves(legal) {return !sel?[]:legal.filter(m=>m.type===sel.kind&&m.card===sel.key);}
  function specialRow(team,me) {
    const row=skills[team].row;
    return row==="own"?me:row==="enemy"?1-me:2;
  }
  function hotZone(side,lane,moves) {
    if (!sel || pending || sel.kind==="cycle") return false;
    const me=actorSide(),team=actorTeam();
    if (sel.kind!=="special") return side===(sel.kind==="partner"?me:1-me)&&moves.some(m=>m.lane===lane);
    const correctSide=specialRow(team,me);
    if(team==="bee" && sel.from!==undefined && side===me) return moves.some(m=>m.from===sel.from&&m.to===lane);
    if (side!==correctSide) return false;
    return sel.from===undefined?moves.some(m=>m.from===lane):moves.some(m=>m.from===sel.from && m.to===lane);
  }
  function unitSlot(side,lane,view,moves) {
    const shown=view.board[side][lane], now=game.board[side][lane];
    const hot=hotZone(side,lane,moves);
    const web=(view.result?.webs??view.webs)[side][lane],brood=view.broods[side][lane];
    const hatchPower=brood+(!view.result&&E.laneFeeder(view,lane)===side?view.pollen[lane]:0);
    const webPreview=web&&!(game.result?.webs??game.webs)[side][lane],broodPreview=brood&&!game.broods[side][lane];
    const destroyedBrood=pending?.type==="special"&&actorTeam()==="spider"&&game.broods[side][lane]>0&&!brood;
    const released=pending?.type==="special"&&actorTeam()==="beetle"&&side===actorSide()&&lane===pending.from&&game.webs[side][lane]&&!web;
    const diff=(shown?.power??-1)!==(now?.power??-1)||webPreview||broodPreview||destroyedBrood||released;
    const me=actorSide(),team=actorTeam(),skillSide=specialRow(team,me);
    const isFrom=sel?.kind==="special"&&sel.from===lane&&side===skillSide;
    const destination=pending?.type==="special"&&side===skillSide&&pending.to===lane;
    const changed=shown&&now&&now.power!==shown.power;
    const unitClass=(web?" webbed-slot":"")+(web&&shown?" webbed-unit":"")+(webPreview?" web-preview":"")+
      (brood?" brood-slot":"")+(broodPreview?" brood-preview":"")+(shown?.hatched?" hatched":"");
    let artBody='<span aria-hidden="true" class="vacant"></span>';
    if(shown)artBody=bug(game.players[side].faction)+'<span class="unit-power">'+icon("force")+(changed?'<s class="old-number">'+now.power+'</s>':'')+shown.power+'</span>';
    const webMark=web?'<span class="web-marker" aria-hidden="true">'+art.icon("web")+'</span>':"";
    const harvestMark=web&&shown?'<small class="no-harvest" title="本轮不采粉" aria-hidden="true">'+art.icon("noHarvest")+'<span>不采粉</span></small>':"";
    const broodMark=brood?'<span class="brood-marker" aria-hidden="true">'+art.cocoon()+'<small>'+(view.result?'下轮':'预计')+'</small><b>'+hatchPower+'</b></span>':destroyedBrood?'<span class="brood-marker brood-destroyed" aria-hidden="true">'+art.cocoon()+'<b>×</b><small>不孵化</small></span>':"";
    const content=artBody+webMark+harvestMark+broodMark+routeMarker(side===skillSide,lane);
    const label=playerName(side)+laneName(lane)+"，"+(shown?(shown.hatched?"新生蝴蝶，":"")+"力量"+shown.power:"空位")+
      (web?(shown?"，网中虫保留力量和技能，本轮不采粉":"，有网，本轮不能从手牌放伙伴"):released?"，甲虫挣脱蛛网，恢复采粉":"")+(brood?"，留有蛹，预计下轮孵出"+hatchPower+"力蝴蝶":destroyedBrood?"，蛹被摧毁，下轮不孵化":"")+(hot?"，可选择":"");
    return '<button type="button" class="slot '+(hot?"legal ":"")+(diff||destination?"previewed ":"")+(isFrom?"selected":"")+unitClass+'" data-do="zone" data-side="'+side+'" data-lane="'+lane+'" data-focus="zone-'+side+lane+'" aria-label="'+label+'" '+(hot?'':'disabled')+'>'+content+'</button>';
  }
  function routeMarker(onRow,lane) {
    if(!onRow||pending?.type!=="special"||pending.from!==lane||pending.from===pending.to)return "";
    const right=pending.to>lane;
    return '<span class="route-marker '+(right?'right':'left')+'" aria-hidden="true">'+(right?'→':'←')+'</span>';
  }
  function laneWinner(view,lane) {
    if(view.result)return view.result.winners[lane];
    const a=E.lanePower(view,0,lane),b=E.lanePower(view,1,lane);
    return a===b?null:a>b?0:1;
  }
  // The engine has already scored the round. These numbers only present that result.
  function prepareTally() {
    clearTally();
    const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches||document.hidden;
    tally={state:game,running:!reduced,locked:true,flourish:false,timers:new Set(),lane:-1,
      phases:game.pollen.map(()=>reduced?"complete":"pending"),
      display:game.players.map((p,i)=>p.score-(reduced?0:game.result.gain[i])),
      message:reduced?"收粉完成":"开始收花粉"};
  }
  function later(run,delay,fn) {
    const handle=setTimeout(()=>{
      run.timers.delete(handle);
      if(tally===run&&screen==="battle"&&game===run.state)fn();
    },delay);
    run.timers.add(handle);
  }
  function clearPollenFlights() {
    for(const el of document.querySelectorAll(".pollen-flight")){
      for(const motion of el.getAnimations())motion.cancel();
      el.remove();
    }
  }
  function clearTally() {
    if(tally)for(const handle of tally.timers)clearTimeout(handle);
    clearPollenFlights();tally=null;
  }
  function syncTally(run) {
    for(const lane of app.querySelectorAll(".lanes>.lane"))lane.dataset.tally=run.phases[Number(lane.dataset.lane)];
    for(const stamp of app.querySelectorAll("[data-score-side]")){
      const n=run.display[Number(stamp.dataset.scoreSide)];
      stamp.querySelector("b").textContent=n;
      stamp.querySelector(".score-ruler i").style.width=Math.min(100,100*n/30)+"%";
      stamp.setAttribute("aria-label","已收集"+n+"枚花粉，目标30");
    }
    for(const message of app.querySelectorAll(".tally-message"))message.textContent=run.message;
  }
  function awardMessage(lane) {
    const n=game.pollen[lane],winner=game.result.winners[lane];
    const text=n===0?(game.eaten[lane]>0?playerName(game.result.feeders[lane])+"的蛹吃 "+game.eaten[lane]+" 枚，两边 +0 分":"空花，两边 +0"):
      winner===null?"平手，两边 +0":playerName(winner)+"收 "+n+" 枚";
    return laneName(lane)+" · "+text;
  }
  function awardBadge(lane) {
    const n=game.pollen[lane],side=game.result.winners[lane];
    if(game.eaten[lane]>0)return '<span class="collection-result" data-award="feed" aria-hidden="true">'+art.cocoon()+'<b>×'+game.eaten[lane]+'</b></span>';
    const award=n===0?"empty":side===null?"tie":side;
    const symbol=award==="empty"?"空":award==="tie"?"＝":side===0?"↓":"↑";
    return '<span class="collection-result" data-award="'+award+'" aria-hidden="true"><span>'+symbol+'</span><b>+'+((award===0||award===1)?n:0)+'</b></span>';
  }
  function sendPollen(lane,side,index) {
    const start=app.querySelector('.pollen-node[data-lane="'+lane+'"]')?.getBoundingClientRect();
    const target=game.eaten[lane]>0?'.slot[data-side="'+side+'"][data-lane="'+lane+'"]':'[data-score-side="'+side+'"] .icon';
    const end=app.querySelector(target)?.getBoundingClientRect();
    if(!start||!end||!Element.prototype.animate)return;
    const mote=document.createElement("span");
    mote.className="pollen-flight";mote.dataset.side=String(side);mote.dataset.lane=String(lane);
    mote.setAttribute("aria-hidden","true");mote.innerHTML=art.icon("pollen");document.body.append(mote);
    const x=start.left+start.width/2,y=start.top+start.height/2;
    const dx=end.left+end.width/2-x,dy=end.top+end.height/2-y;
    mote.style.left=x+"px";mote.style.top=y+"px";
    const transform=(a,b,s)=>"translate(-50%,-50%) translate("+a+"px,"+b+"px) scale("+s+")";
    const arc=(index%2?1:-1)*13;
    const motion=mote.animate([
      {transform:transform(0,0,.75),opacity:0},
      {offset:.20,transform:transform(.13*dx+arc,.11*dy-9,1.17),opacity:1},
      {offset:.75,transform:transform(.73*dx+arc,.60*dy-16,1),opacity:1},
      {transform:transform(dx,dy,.65),opacity:0}
    ],{duration:310,easing:"ease-in-out",fill:"both"});
    motion.onfinish=motion.oncancel=()=>mote.remove();
  }
  function unlockTallyNav(run) {
    later(run,320,()=>{
      run.locked=false;
      for(const btn of app.querySelectorAll("[data-after-tally]"))btn.disabled=false;
    });
  }
  function finishTally(run,skipped=false) {
    if(tally!==run||!run.running)return;
    for(const handle of run.timers)clearTimeout(handle);
    run.timers.clear();clearPollenFlights();
    run.running=false;run.locked=true;run.phases.fill("complete");
    run.display=game.players.map(p=>p.score);
    run.message="收粉完成";
    run.flourish=game.phase==="done"&&!document.hidden&&!matchMedia("(prefers-reduced-motion: reduce)").matches;
    render();run.flourish=false;
    say((skipped?"已跳过收粉动画。":"收粉完成。")+game.players.map((p,i)=>playerName(i)+" "+p.score+" 分。").join("")+
      (game.phase==="done"?playerName(game.winner)+"赢啦！":""));
    unlockTallyNav(run);
  }
  function startTallyClock() {
    const run=tally;
    if(!run.running){unlockTallyNav(run);return;}
    let at=120;
    for(let lane=0;lane<game.pollen.length;lane++){
      const meal=game.eaten[lane],side=meal?game.result.feeders[lane]:game.result.winners[lane];
      const count=meal||(side===null?0:game.pollen[lane]);
      later(run,at,()=>{
        run.lane=lane;run.phases[lane]="active";run.message=awardMessage(lane);
        syncTally(run);say(run.message);
      });
      for(let i=0;i<count;i++){
        const launch=at+90+i*95;
        later(run,launch,()=>sendPollen(lane,side,i));
        if(!meal)later(run,launch+310,()=>{run.display[side]++;syncTally(run);});
      }
      at+=count?470+(count-1)*95:370;
      later(run,at,()=>{run.phases[lane]="complete";syncTally(run);});
      at+=70;
    }
    later(run,at+90,()=>finishTally(run));
  }
  function tallyButton(action,label,style,glyph) {
    return '<button type="button" class="'+style+'" data-do="'+action+'" data-after-tally'+(tally?.locked?' disabled':'')+'>'+icon(glyph)+label+'</button>';
  }
  function victorySheet() {
    const side=game.winner,p=game.players[side];
    return '<div class="victory-sheet '+(tally?.flourish?'victory-bloom':'')+'" data-winner="'+side+'" role="status">'+
      '<span class="victory-insect">'+bug(p.faction)+'</span><span class="victory-copy"><strong>'+playerName(side)+' · '+names[p.faction]+'赢啦！</strong>'+
      '<span>'+icon("pollen")+'<b>'+p.score+'</b><small>比</small><b>'+game.players[1-side].score+'</b></span></span>'+
      '<span class="victory-petals" aria-hidden="true">'+Array.from({length:8},(_,i)=>'<i style="--petal:'+i+'"></i>').join('')+'</span></div>';
  }
  function pollenSlot(lane,view,moves) {
    const team=actorTeam();
    const hot=hotZone(2,lane,moves),final=game.phase!=="play";
    const n=view.pollen[lane]+(final?game.eaten[lane]:0);
    const feeder=E.laneFeeder(view,lane);
    const w=laneWinner(view,lane), arrow=w===0?"↓":w===1?"↑":"＝";
    const diff=n!==game.pollen[lane],isFrom=team==="bee"&&sel?.from===lane;
    const drops=n?icon("pollen")+(n>1?'<b class="pollen-count">×'+n+'</b>':''):'<span class="pollen-empty" aria-hidden="true"></span><b class="pollen-count">0</b>';
    const showArrow=final||pending && !["cycle","supply"].includes(pending.type);
    const direction=final?awardBadge(lane):feeder!==null&&n?'<span class="destination feed-destination" aria-hidden="true">'+art.cocoon()+'</span>':showArrow&&n?'<span class="destination proposed" aria-hidden="true">'+arrow+'</span>':'';
    const eating=team==="butterfly"&&pending?.type==="special"&&pending.from===lane;
    const label=final?awardMessage(lane):laneName(lane)+"，"+n+"枚花粉"+(feeder!==null?"，若现在结算，由"+playerName(feeder)+"的蛹进食":showArrow&&n?(w===null?"，平手":"，朝向"+playerName(w)):"")+(hot?"，可选择":"");
    const rich=n>=3?" pollen-jackpot":n===2?" pollen-rich":"";
    return '<button type="button" class="pollen-node '+(hot?"legal ":"")+(diff?"previewed ":"")+(isFrom?"selected ":"")+(eating?"eaten-preview":"")+rich+'" data-do="zone" data-side="2" data-pollen="'+n+'" data-lane="'+lane+'" data-focus="zone-2'+lane+'" aria-label="'+label+'" '+(hot?'':'disabled')+'>'+drops+direction+routeMarker(team==="bee",lane)+'</button>';
  }
  function board(view,legal) {
    const choices=selectedMoves(legal);
    return '<div class="table" aria-label="五条花道，上面是'+playerName(1)+'，下面是'+playerName(0)+'"><div class="lanes">'+view.pollen.map((_,lane)=>'<div class="lane '+(motionLane===lane?"ai-lane":"")+'" data-lane="'+lane+'"'+(tally?' data-tally="'+tally.phases[lane]+'"':'')+'>'+unitSlot(1,lane,view,choices)+pollenSlot(lane,view,choices)+unitSlot(0,lane,view,choices)+'</div>').join("")+'</div></div>';
  }
  function specialHint(side,changed) {
    const t=game.players[side].faction;
    const lane=pending.to;
    if(t==="spider"){
      const enemy=changed.board[1-side][lane];
      return (enemy?"对面 "+enemy.power+" 力 · 不采粉":"对面空叶结网")+(game.broods[1-side][lane]?" · 摧毁蛹，下轮不孵化":E.lanePower(changed,side,lane)?"":" · 暂时平手");
    }
    if(t==="butterfly")return '<span class="guard-preview"><span>结算时吃 '+icon("pollen")+(E.laneFeeder(changed,lane)===side?changed.pollen[lane]:0)+'</span></span>';
    if(t==="ant")return "隔壁伙伴 "+game.board[side][lane].power+" → "+changed.board[side][lane].power;
    if(t==="bee"){
      const from=pending.from;
      return '<span class="guard-preview bee-transfer"><span>起 '+icon("pollen")+game.pollen[from]+' → '+changed.pollen[from]+'</span><span>到 '+icon("pollen")+game.pollen[lane]+' → '+changed.pollen[lane]+'</span></span>';
    }
    return "顶去"+laneName(lane)+(game.webs[side][pending.from]&&!changed.webs[side][pending.from]?" · 自己挣脱网":"");
  }
  function toolbar(legal,side,view) {
    const team=actorTeam(),owner=playerName(side);
    if(game.phase!=="play") {
      if(tally?.running)return '<div class="toolbar tally-toolbar"><span class="tally-message">'+tally.message+'</span>'+actionButton("skip-resolution","跳过","plain","pass")+'</div>';
      const g=game.result.gain, done=game.phase==="done";
      const title=done?playerName(game.winner)+"赢啦！":game.players[0].score>=30&&game.players[0].score===game.players[1].score?"平分，再接一轮":"收花粉";
      return '<div class="toolbar"><span class="outcome">'+title+'<span class="token" aria-label="'+owner+'本轮收了'+g[side]+'枚花粉">'+icon("pollen")+'+'+g[side]+'</span></span>'+tallyButton(done?"again":"next",done?"再来一局":"下一轮","confirm",done?"play":"arrow")+(done?tallyButton("new-team","换队","plain","back"):"")+'</div>';
    }
    if(mode==="duo" && game.turn!==side) return '<div class="toolbar"><span class="waiting-label">'+(game.players[side].passed?'这轮已收手':'等'+playerName(game.turn)+'出牌')+'</span></div>';
    if(mode==="solo" && game.turn===1) return '<div class="toolbar"><span class="turn-badge">'+(game.players[0].passed?"对手继续出牌":"对手在想…")+'</span></div>';
    if(pending) {
      const isPass=pending.type==="pass",cycle=pending.type==="cycle";
      const hint=cycle?'<span class="cycle-preview">'+icon("cycle")+'<span class="mystery-card" aria-label="随机新牌">?</span> 换这张？</span>':pending.type==="supply"?supplyHint(side):pending.type==="special"?specialHint(side,view):isPass?"收手后，本轮不能再行动":"看看花粉朝哪边";
      return '<div class="toolbar'+(isPass?' pass-confirm':'')+'">'+currentSkillFee()+'<span class="prompt">'+hint+'</span>'+actionButton("cancel","取消","cancel","back")+actionButton("confirm",isPass?"收手":cycle?"换牌":"出牌","confirm",isPass?"pass":cycle?"cycle":"check")+'</div>';
    }
    if(sel) {
      const prompt=sel.kind==="cycle"?"点一张要换走的牌":sel.kind==="special"?(sel.from===undefined?skills[team].ask:skills[team].next):sel.kind==="hit"?"点对面的虫":"点空叶位";
      return '<div class="toolbar">'+currentSkillFee()+'<span class="prompt">'+prompt+'</span>'+actionButton("cancel","取消","cancel","back")+'</div>';
    }
    const cycleOk=legal.some(a=>a.type==="cycle");
    const cycle='<button type="button" class="pill cycle-control" data-do="cycle" data-focus="cycle" title="每轮免费换一张手牌" '+(cycleOk?'':'disabled')+'>'+icon("cycle")+'换牌</button>';
    return '<div class="toolbar"><span class="turn-badge">'+(legal.every(m=>m.type==="pass")?"可以收手了":mode==="duo"?owner+"出牌":"轮到你")+'</span>'+cycle+actionButton("pass","收手","pill","pass")+'</div>';
  }
  function seatPanel(side,view,legal) {
    const active=game.phase==="play"&&game.turn===side;
    const choice=active?legal:[];
    const won=game.phase==="done"&&!tally?.running&&side===game.winner;
    const hand=won?victorySheet():visibleHand(side).map(c=>humanCard(c,choice,side)).join("");
    const status=game.phase!=="play"?"finished-seat":active?"active-seat":"waiting-seat";
    return '<section class="seat '+(side===1?'seat-top':'seat-bottom')+' '+status+'" data-seat="'+side+'" aria-label="'+playerName(side)+'的座位"><div class="seat-inner">'+sideBar(side,view)+'<div class="hand-section"><div class="hand '+(won?'victory-hand':'')+'" data-hand="'+side+'" aria-label="'+(won?'本局赢家':playerName(side)+'的手牌，'+(active?'可以出牌':'等待出牌'))+'">'+hand+'</div>'+toolbar(choice,side,view)+'</div></div></section>';
  }
  function battle() {
    const legal=myMoves(), view=pending&&!["cycle","supply","pass"].includes(pending.type)?E.play(game,pending):game;
    const ph=phaseAt(game.round);
    const headBar='<header class="mast '+(mode==="duo"?'tt-head':'')+'"><div class="row"><button type="button" class="round-btn" data-do="exit-game" aria-label="返回选队" title="返回选队">‹</button><span class="word-mark">'+(mode==="duo"?'双人同桌':'花粉擂台')+'</span></div><div class="round-indicator"><span>第 '+game.round+' 轮</span><span class="phase-chip '+ph.id+'" aria-label="'+ph.name+'，本阶段每轮上限'+ph.cap+'点阳光">'+phaseIcon(ph)+ph.name+'</span></div>'+helpButton()+'</header>';
    const stage=tally?(tally.running?"counting":"complete"):"play";
    if(mode==="duo") return '<div class="battle wrap tabletop" data-resolution="'+stage+'" data-turn="'+game.turn+'">'+headBar+seatPanel(1,view,legal)+board(view,legal)+seatPanel(0,view,legal)+'</div>';
    const celebrated=game.phase==="done"&&!tally?.running;
    return '<div class="battle wrap" data-resolution="'+stage+'">'+headBar+sideBar(1,view)+board(view,legal)+sideBar(0,view)+'<section class="hand-section" aria-label="'+(celebrated?'本局赢家':'我的手牌')+'"><div class="hand '+(celebrated?'victory-hand':'')+'" data-hand="0">'+(celebrated?victorySheet():visibleHand(0).map(c=>humanCard(c,legal)).join(""))+'</div>'+toolbar(legal,0,view)+'</section></div>';
  }
  function supplyAmount(side) {return E.supplyDrawCount(game,side);}
  function supplyHint(side) {
    const n=supplyAmount(side);
    return "花 "+E.supplyCost+" 阳光，摸 "+n+" 张，补满 6 张";
  }
  function chooseCard(key) {
    if(!canAct())return;
    const side=actorSide(),team=actorTeam();
    const card=game.players[side].hand.find(c=>c.id===key);
    if(!card)return;
    const legal=myMoves();
    if(sel?.kind==="cycle") {
      pending=legal.find(m=>m.type==="cycle"&&m.card===key)||null;
      if(pending) {render();say("换走"+cardLabel(card)+"？确认后才看到抽到的牌。");app.querySelector('[data-do="confirm"]')?.focus({preventScroll:true});}
      return;
    }
    if(sel?.key===key) {clearChoice();render();return;}
    const moves=legal.filter(m=>m.type===card.kind && m.card===key);
    if(!moves.length) {
      const why=game.players[side].sun<card.cost?"这一张需要 "+card.cost+" 点阳光。你还剩 "+game.players[side].sun+" 点。":card.kind==="special"?skills[team].text:card.kind==="hit"?"对面要有一只有力量的虫才能撞击。":card.kind==="supply"?"没有可摸的牌。":blockedLeafNote(side);
      openSheet(card.kind==="special"?skills[team].name:card.kind==="hit"?"撞击":card.kind==="supply"?"补给":"伙伴",'<p>'+why+'</p><div class="sheet-actions">'+actionButton("close-sheet","知道啦","confirm","check")+'</div>',"reason");return;
    }
    sel={key,kind:card.kind};motionLane=null;
    if(card.kind==="supply") {
      pending=moves[0];render();say(supplyHint(side)+"。确认后抽牌。");
      app.querySelector('[data-do="confirm"]')?.focus({preventScroll:true});return;
    }
    pending=null;render();say(cardLabel(card)+"。选择亮起的位置。");
  }
  function chooseZone(side,lane) {
    if(!canAct())return;
    const me=actorSide(),team=actorTeam();
    const legal=myMoves(),opts=selectedMoves(legal);
    if(!hotZone(side,lane,opts))return;
    if(sel.kind==="special" && sel.from===undefined) {
      sel.from=lane;
      if(!skills[team].single){render();say(skills[team].next);focusLegal();return;}
    }
    pending=sel.kind==="special"?opts.find(m=>m.from===sel.from && m.to===lane):opts.find(m=>m.lane===lane);
    render();const v=E.play(game,pending);
    if(sel.kind==="special"&&team==="butterfly")say("预演留蛹。本道仍有"+v.pollen[lane]+"枚花粉，活到结算时才进食。");
    else if(sel.kind==="special"&&team==="bee")say("预演。从"+laneName(pending.from)+"搬走全部 "+game.pollen[pending.from]+" 枚，那里变成 "+v.pollen[pending.from]+" 枚。"+laneName(lane)+"从 "+game.pollen[lane]+" 枚变成 "+v.pollen[lane]+" 枚。确认后搬运。");
    else if(sel.kind==="special"&&team==="spider")say("预演，在对手"+laneName(lane)+"织网。"+(game.broods[1-me][lane]?"摧毁这里的蛹，下轮不孵化。":"")+(v.board[1-me][lane]?"网中虫保留 "+v.board[1-me][lane].power+" 力，这轮不采粉。":"空网不能派伙伴。")+"确认后织网。");
    else if(sel.kind==="special"&&team==="beetle"&&game.webs[me][pending.from]&&!v.webs[me][pending.from])say("预演。甲虫把对面的虫顶去"+laneName(lane)+"，挣脱自己脚下的网，恢复采粉。确认后顶撞。");
    else say("预演。按收粉时的力量，"+v.pollen.map((_,l)=>laneName(l)+"我方"+E.lanePower(v,me,l)+"，对手"+E.lanePower(v,1-me,l)).join("。")+"。确认后出牌。");
    app.querySelector('[data-do="confirm"]')?.focus({preventScroll:true});
  }
  function focusLegal() {app.querySelector(".legal:not(:disabled)")?.focus({preventScroll:true});}
  function actionSummary(a,side) {
    const who=playerName(side);
    if(a.type==="pass")return who+"收手了。";
    if(a.type==="cycle")return who+"换了一张牌。";
    if(a.type==="supply")return who+"用了补给。";
    if(a.type==="special"&&game.players[side].faction==="butterfly")return who+"在"+laneName(a.from)+"留蛹，结算时进食。";
    if(a.type==="special"&&game.players[side].faction==="spider")return who+"在对手的"+laneName(a.to)+"织了网。"+(game.broods[1-side][a.to]?"蛹被摧毁，下轮不孵化。":"");
    if(a.type==="special"&&game.players[side].faction==="bee")return who+"把"+laneName(a.from)+"的全部 "+game.pollen[a.from]+" 枚花粉搬到"+laneName(a.to)+"，堆成 "+(game.pollen[a.from]+game.pollen[a.to])+" 枚。";
    if(a.type==="special"&&game.players[side].faction==="beetle"&&game.webs[side][a.from])return who+"的甲虫把敌虫顶去"+laneName(a.to)+"，挣脱蛛网，可以采粉了。";
    if(a.type==="special")return who+"用了"+skills[game.players[side].faction].name+"，"+laneName(a.from)+(a.from===a.to?"":"到"+laneName(a.to))+"。";
    return who+"在"+laneName(a.lane)+(a.type==="partner"?"派上伙伴":"用了撞击")+"。";
  }
  function enact(a) {
    const side=game.turn;
    const summary=actionSummary(a,side);
    const before=game;
    const outgoing=["cycle","supply"].includes(a.type)?handTarget(side,a.card)?.getBoundingClientRect():null;
    game=E.play(game,a);clearChoice();motionLane=mode==="duo"||side===1?(a.lane??a.to??null):null;
    if((mode==="duo"||side===0)&&a.type==="cycle") {
      const h=handViews[side], k=h.slots.indexOf(a.card);
      if(k!==-1)h.slots[k]=game.lastEvent.drawn[side][0];
    }
    const resolving=game.phase!=="play"&&before.phase==="play";
    if(resolving)prepareTally();
    render();
    animateTransfers(before,outgoing);
    say(summary+drawAnnouncement()+(game.phase==="play"?"轮到"+playerName(game.turn)+"。":"收花粉了。"));
    if(resolving)startTallyClock();
    queueAI();
  }
  function queueAI() {
    stopAI();if(mode!=="solo"||screen!=="battle"||!game||sheet.open||game.phase!=="play"||game.turn!==1)return;
    aiTimer=setTimeout(()=>{aiTimer=null;if(mode==="solo"&&screen==="battle"&&!sheet.open&&game?.phase==="play"&&game.turn===1)enact(E.chooseAI(game));},780);
  }
  function homeFromMatch() {stopAI();stopFlights();clearTally();closeSheet();game=null;clearChoice();screen=mode==="duo"?"duo":"solo";render();}
  function route(el) {
    const action=el.dataset.do,seat=el.closest(".seat");
    if(el.hasAttribute("data-after-tally")&&(tally?.running||tally?.locked))return;
    if(mode==="duo"&&screen==="battle"&&seat&&["pass","card","cycle","cancel","confirm"].includes(action)&&(!canAct()||Number(seat.dataset.seat)!==actorSide()))return;
    switch(action) {
      case "modes":if(seatDrafts.some(Boolean))break;game=null;screen="home";render("mode-"+mode);break;
      case "mode-solo":mode="solo";screen="solo";render("tribe-"+team);break;
      case "mode-duo":mode="duo";screen="duo";render();break;
      case "pick-team":{const side=Number(el.dataset.seat);if(seatDrafts[side])break;picks[side]=el.dataset.team;saveSeatChoices();refreshSeat(side,el.dataset.focus);break;}
      case "pick-deck":{
        const side=Number(el.dataset.seat),t=picks[side];
        if(seatDrafts[side])break;
        seatSources[side][t]=el.dataset.source;
        if(el.dataset.source==="box" && !seatBoxes[side][t] && decks[t])seatBoxes[side][t]=copy(decks[t]);
        saveSeatChoices();refreshSeat(side);break;
      }
      case "start-duo":if(seatDrafts.some(Boolean))break;mode="duo";begin();break;
      case "team":team=el.dataset.team;saveSoloChoices();render();break;
      case "solo-deck":soloSource[team]=el.dataset.source;saveSoloChoices();render();break;
      case "start":begin();break;
      case "again":if(game?.phase==="done"&&!tally?.running&&!tally?.locked)begin();break;
      case "build":editDeck();break;
      case "seat-build":editDeck(Number(el.dataset.seat));break;
      case "add-copy":case "remove-copy":
        changeCopy(editorOf(el),el.dataset.kind,Number(el.dataset.tier),action==="add-copy"?1:-1);break;
      case "restore-preset":{
        const side=editorOf(el),t=side===null?team:picks[side],fresh=E.defaultDeck(t);
        restoredDrafts.add(fresh);
        if(side===null){draft=fresh;render("restore-preset");}
        else {seatDrafts[side]=fresh;refreshSeat(side,"restore-preset");}
        say(names[t]+"预组已放入草稿，保存后才更换牌组。");break;
      }
      case "deck-back":{
        const side=editorOf(el);
        if(side===null){draft=null;screen="solo";render("tribe-"+team);}
        else {seatDrafts[side]=null;refreshSeat(side);}
        break;
      }
      case "save-deck":{
        const side=editorOf(el),d=side===null?draft:seatDrafts[side];
        if(!d||!E.validateDeck(d))break;
        if(side===null) {
          decks[team]=copy(d);soloSource[team]="box";draft=null;saveSoloChoices();
          try{localStorage.setItem(prefKey,JSON.stringify(decks));}catch(_){}
          screen="solo";render("tribe-"+team);
        } else {
          seatBoxes[side][picks[side]]=copy(d);seatSources[side][picks[side]]="box";seatDrafts[side]=null;
          saveSeatChoices();refreshSeat(side);
        }
        say((side===null?"":playerName(side))+"牌盒装好了。");break;
      }
      case "help":openHelp();break;
      case "close-sheet":closeSheet();break;
      case "exit-game":if(game.phase==="done"){homeFromMatch();break;}openSheet("回到选队？",'<p>离开后，这一局就结束了。</p><div class="sheet-actions">'+actionButton("close-sheet","继续玩","confirm","play")+actionButton("new-team","回到选队","plain","back")+'</div>',"exit");break;
      case "new-team":homeFromMatch();break;
      case "card":chooseCard(el.dataset.id);break;
      case "cycle":if(myMoves().some(a=>a.type==="cycle")){sel={kind:"cycle"};pending=null;render();say("选一张要换走的手牌。");app.querySelector(".for-cycle")?.focus({preventScroll:true});}break;
      case "zone":chooseZone(Number(el.dataset.side),Number(el.dataset.lane));break;
      case "cancel":{const k=sel?.key;clearChoice();render(k?"card-"+k:null);break;}
      case "pass":if(canAct()){pending=myMoves().find(a=>a.type==="pass");sel=null;render();say("收手后，本轮不能再行动。确认收手，或取消返回。");app.querySelector('[data-do="confirm"]')?.focus({preventScroll:true});}break;
      case "confirm":if(pending&&canAct())enact(pending);break;
      case "skip-resolution":if(tally?.running)finishTally(tally,true);break;
      case "next":
        if(game.phase==="scored"&&!tally?.running&&!tally?.locked){const before=game;clearTally();game=E.nextRound(game);clearChoice();motionLane=null;render();animateTransfers(before);say("第"+game.round+"轮。"+hatchAnnouncement()+drawAnnouncement()+playerName(game.turn)+"先出牌。");queueAI();}break;
    }
  }
  // A browser may omit both clicks when two children tap opposite seats together.
  // Track each finger separately while leaving scroll gestures to the browser.
  const seatTouches=new Map();
  const recentSeatTaps=new Map();
  const tapSlop=10;
  function cleanSeatTaps() {
    const now=performance.now();
    for(const [id,tap] of recentSeatTaps)if(now-tap.at>900)recentSeatTaps.delete(id);
  }
  function seatControl(target) {
    const b=target?.closest?.("button[data-do]");
    return b&&!b.disabled&&b.closest(".duo-setup .pick-seat")?b:null;
  }
  document.addEventListener("pointerdown",e=>{
    if(e.pointerType!=="touch"){
      if(e.pointerType==="mouse")recentSeatTaps.clear();
      return;
    }
    cleanSeatTaps();recentSeatTaps.delete(e.pointerId);
    const button=seatControl(e.target);
    if(button)seatTouches.set(e.pointerId,{button,x:e.clientX,y:e.clientY,moved:false});
  },true);
  document.addEventListener("pointermove",e=>{
    const t=seatTouches.get(e.pointerId);
    if(t&&Math.hypot(e.clientX-t.x,e.clientY-t.y)>tapSlop)t.moved=true;
  },true);
  document.addEventListener("pointercancel",e=>seatTouches.delete(e.pointerId),true);
  document.addEventListener("pointerup",e=>{
    const t=seatTouches.get(e.pointerId);
    if(!t)return;
    seatTouches.delete(e.pointerId);
    // Also suppress a compatibility click for a drag that ended back on a button.
    recentSeatTaps.set(e.pointerId,{x:e.clientX,y:e.clientY,at:performance.now()});
    if(t.moved||Math.hypot(e.clientX-t.x,e.clientY-t.y)>tapSlop)return;
    if(!t.button.isConnected||t.button!==seatControl(document.elementFromPoint(e.clientX,e.clientY)))return;
    e.preventDefault();route(t.button);
  },true);
  document.addEventListener("click",e=>{
    cleanSeatTaps();
    const touchClick=e.pointerType==="touch"||e.sourceCapabilities?.firesTouchEvents||
      (!e.pointerType && e.detail>0);
    if(touchClick && e.detail!==0) {
      const match=recentSeatTaps.has(e.pointerId)?e.pointerId:
        [...recentSeatTaps].find(([,t])=>Math.hypot(e.clientX-t.x,e.clientY-t.y)<=tapSlop)?.[0];
      if(match!==undefined){recentSeatTaps.delete(match);e.preventDefault();return;}
    }
    const b=e.target.closest("button[data-do]");if(b&&!b.disabled)route(b);
  });
  window.addEventListener("blur",()=>{seatTouches.clear();recentSeatTaps.clear();});
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&!sheet.open&&(pending||sel)){const k=sel?.key;clearChoice();render(k?"card-"+k:null);e.preventDefault();}
    if((e.key==="Enter"||e.key===" ")&&e.target?.dataset?.do==="card"){const k=e.target.dataset.id;setTimeout(()=>{if(sel?.key===k && !pending && !sheet.open)focusLegal();},0);}
  });
  sheet.addEventListener("close",()=>{
    if(sheet.open)return;
    sheetBody.replaceChildren();dialogMode="";queueAI();
  });
  document.addEventListener("visibilitychange",()=>{if(document.hidden){stopFlights();if(tally?.running)finishTally(tally,true);}});
  window.addEventListener("pagehide",()=>{stopFlights();clearPollenFlights();});
  window.addEventListener("resize",()=>{stopFlights();clearPollenFlights();});
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change",e=>{if(e.matches&&tally?.running)finishTally(tally,true);});
  render();
})();
