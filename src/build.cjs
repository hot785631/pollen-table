'use strict';
// Ship two portable, self-contained pages; no server or install is needed.
const fs = require('node:fs');
const path = require('node:path');
const art = require('./art.js');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const save = (name, body) => fs.writeFileSync(path.join(__dirname, name), body, 'utf8');
const mode = process.argv[2];

function inlineStylesheet(name) {
  const css = read(name).replace(/url\(\s*(["']?)(?:\.\/)?([\w.-]+\.webp)\1\s*\)/gi, (_, quote, file) => {
    const image = fs.readFileSync(path.join(__dirname, file)).toString('base64');
    return 'url("data:image/webp;base64,' + image + '")';
  });
  return '<style>\n' + css.replace(/<\/style\s*>/gi, '<\\/style>') + '\n</style>';
}

function inlineScript(name) {
  let js = read(name);
  if (name === 'chanson.js') {
    const file = 'petit-pollen.mp3';
    const literal = JSON.stringify(file);
    if (js.split(literal).length !== 2) throw Error('Expected exactly one soundtrack URL');
    const bytes = fs.readFileSync(path.join(__dirname, file));
    js = js.replace(literal, () => JSON.stringify('data:audio/mpeg;base64,' + bytes.toString('base64')));
  }
  return '<script>\n' + js.replace(/<\/script\s*>/gi, '<\\/script>') + '\n</script>';
}

if (mode !== 'plan') {
  const game = read('index.html').replace(/<script\b[^>]*\bsrc=["'](?:\.\/)?([\w.-]+\.js)["'][^>]*>\s*<\/script>/gi,
    (_, name) => inlineScript(name))
    .replace(/<link\b[^>]*\bhref=["'](?:\.\/)?([\w.-]+\.css)["'][^>]*>/gi, (_, name) => inlineStylesheet(name));
  save('花粉擂台·离线试玩.html',game);
  save('花粉擂台-v5.0-五族花道离线版.html',game);
}
if (mode !== 'game') {
  const { defaultDeck, specialRules, powerForCost, campaignEncounter } = require('./engine.js');
  const teamNames = { ant: '蚂蚁', bee: '蜜蜂', beetle: '甲虫', spider:'蜘蛛', butterfly:'蝴蝶' };
  function countByCost(cards, costs) {
    return costs.map(cost => cards.filter(card => card === cost).length).join(' / ');
  }
  const rows = Object.entries(teamNames).map(([faction, name]) => {
    const deck = defaultDeck(faction);
    return '<tr><td>' + name + '</td><td>' + countByCost(deck.partners, [1,2,3,4]) +
      '</td><td>' + countByCost(deck.hits, [1,2,3]) + '</td><td>' + deck.specials +
      ' 张</td><td>' + deck.supplies + ' 张</td></tr>';
  }).join('');
  const { summary, matchups, stageTotals, overall, webOpening, roundOrder, rulesDigest } = JSON.parse(read('balance-result.json').replace(/^\uFEFF/, ''));
  const duel = JSON.parse(read('deck-comparison.json').replace(/^\uFEFF/, ''));
  if(rulesDigest!==require('./rules-digest.cjs')()||duel.rulesDigest!==rulesDigest)throw Error('Re-run the two balance reports before building the guide');
  const phaseRows = Object.entries(teamNames).map(([faction, name]) => {
    const values = ['3–4', '5–7', '8–10'].map(phase => {
      const value = stageTotals[faction][phase].netPerRound;
      return '<td>' + (value > 0 ? '+' : '') + value.toFixed(2).replace('-', '−') + '</td>';
    });
    return '<tr><td>' + name + '</td>' + values.join('') + '</tr>';
  }).join('');
  const percent=(won,total)=>(100*won/total).toFixed(1)+'%';
  const commonReport='<h3>两张普通功能牌值得留吗？</h3><p>同一种族对打，两边的 12 张伙伴完全相同。一边用原预组的 2 张专属、1 张撞击、1 张补给，另一边把普通功能牌全部换成专属（共 4 张）。交换先后手和座位，共打了 '+duel.games.toLocaleString('zh-CN')+
    ' 局；保留普通功能牌的一边赢了 '+duel.standardWins+' 局，胜率 '+percent(duel.standardWins,duel.games)+'。</p>'+
    '<table><caption>默认牌组对「4 张专属」的同族胜率</caption><thead><tr>'+Object.values(teamNames).map(t=>'<th>'+t+'</th>').join('')+'</tr></thead><tbody><tr>'+
    Object.keys(teamNames).map(t=>'<td>'+percent(duel.byFaction[t].standardWins,duel.byFaction[t].games)+'</td>').join('')+'</tr></tbody></table>'+
    '<p class="hint">这项对照只检验「两张都换掉」这个选择，不等同于测过所有自配组合。</p>';
  const factions=Object.keys(teamNames);
  const matrix='<table class="matchgrid"><caption>行上的队伍，对列上队伍的胜率。最后一列为四个对手的合计胜率。</caption><thead><tr><th>队伍</th>'+
    factions.map(f=>'<th>'+teamNames[f]+'</th>').join('')+'<th>总体</th></tr></thead><tbody>'+
    factions.map(f=>'<tr><th>'+teamNames[f]+'</th>'+factions.map(g=>{
      if(f===g)return '<td>—</td>';const w=matchups[f+'/'+g]||matchups[g+'/'+f];
      return '<td title="'+w[f]+' 胜 / '+w.games+' 局">'+percent(w[f],w.games)+'</td>';
    }).join('')+'<td><b>'+percent(overall[f].wins,overall[f].games)+'</b></td></tr>').join('')+'</tbody></table>';
  const balance = '<p>用最终默认牌组打了 ' + summary.games.toLocaleString('zh-CN') + ' 局电脑对战，十组异族对阵各 '+
    Object.values(matchups)[0].games+' 局。每组均分四种座位与首轮先手组合，每局单独洗牌。平均打了 ' +
    summary.meanRounds.toFixed(1) + ' 轮，范围是 ' + summary.minRounds + '–' + summary.maxRounds +
    ' 轮。此批随机种子未用于前面的调参。</p>' + matrix +
    (roundOrder?'<h3>先手与后手</h3><p>以每一轮的先后顺序计算，先手平均收 '+(roundOrder.firstPoints/roundOrder.rounds).toFixed(2)+
      ' 枚，后手平均收 '+(roundOrder.secondPoints/roundOrder.rounds).toFixed(2)+' 枚（共 '+roundOrder.rounds.toLocaleString('zh-CN')+
      ' 轮）。以整局计算，第一轮先手的玩家赢了 '+summary.firstWins+' 局（'+percent(summary.firstWins,summary.games)+
      '），第一轮后手的玩家赢了 '+summary.secondWins+' 局（'+percent(summary.secondWins,summary.games)+'）。每轮交换先手，所以这两种比较回答的是不同问题。</p>':'')+
    (webOpening?'<div class="stripe"><strong>蜘蛛后手能不能出网？</strong> 蜘蛛后手的 '+webOpening.second.games+
      ' 局中，第一手就抽到织网的有 '+webOpening.second.withWeb+' 局；其中 '+webOpening.second.legalWeb+
      ' 局在蜘蛛的第一次行动就能织网。电脑实际选择在首轮用网 '+webOpening.second.webInFirstRound+
      ' 局，其余有牌时也可以留到更值的花道。蜘蛛后手胜率为 '+percent(webOpening.second.wins,webOpening.second.games)+'。</div>':'')+
    '<table><caption>每轮净得分（本方得分减去对手得分）</caption>' +
    '<thead><tr><th>队伍</th><th>初花</th><th>盛花</th><th>晚花</th></tr></thead><tbody>' +
    phaseRows + '</tbody></table>' +
    '<p class="hint">双方都用游戏内的电脑策略，只能看到自己的手牌。复测批次为 ' + summary.startSeed + '–' +
    summary.lastSeed + '。每对只看这一批发牌时，接近五五开的结果有数个百分点的抽样波动。总体胜率接近也不表示每一对都五五开；玩家的打法和自配牌组会改变结果。</p>';
  const expedition = JSON.parse(read('campaign-results.json'));
  const branchNames = {ant:'腥红蚂蚁', bee:'胡蜂', beetle:'长戟大兜虫', spider:'捕鸟蛛', butterfly:'鸟翼凤蝶'};
  const creatureNames = {ant:'琥珀穹冠蚁', bee:'曦光琉璃蜂', beetle:'苍苔月角兜', spider:'星露织蛛', butterfly:'极昼霓裳蝶'};
  const skillNames = {ant:'搭把手', bee:'搬花粉', beetle:'顶一顶', spider:'织网', butterfly:'守蛹'};
  const stageRows = factions.map(faction => {
    const [fifth, sixth] = [5,6].map(n => expedition.encounters[faction][n]);
    for (const stage of [5,6]) {
      const live = campaignEncounter(faction, stage), tested = expedition.encounters[faction][stage];
      if (JSON.stringify([live.deck,live.skills]) !== JSON.stringify([tested.deck,tested.skills]))
        throw Error('Re-run the campaign report for ' + faction + ', stage ' + stage);
    }
    const borrowed = sixth.skills.filter(skill => skill.faction !== faction).map(skill => skillNames[skill.faction]);
    const route = expedition.route[faction].map(r => teamNames[r.opponent]).join(' → ');
    return '<tr><th>'+teamNames[faction]+'</th><td>'+route+'</td><td>'+branchNames[faction]+' '+percent(fifth.bossWins,fifth.games)+'</td><td>'+creatureNames[faction]+' '+percent(sixth.bossWins,sixth.games)+'</td><td>'+borrowed.join('、')+'</td></tr>';
  }).join('');
  const campaignReport = '<h3>首领对默认牌组的实测</h3><p>每种族每位首领各打 '+expedition.gamesPerEncounter+' 局，自己先手和后手各半。双方使用电脑策略，玩家席位带本族默认牌组。下表的百分比是首领获胜的比例。</p><table><thead><tr><th>队伍</th><th>前四关依序</th><th>第五关</th><th>第六关</th><th>终关额外专属</th></tr></thead><tbody>'+stageRows+'</tbody></table>';
  const controls = JSON.parse(read('campaign-skill-results.json'));
  if (expedition.baselineDigest !== rulesDigest || expedition.skillControl.rulesDigest !== controls.rulesDigest)
    throw Error('Re-run the campaign report with the current baseline and skill control results');
  const chiefRows = factions.map(f => {
    const deck = expedition.encounters[f][5].deck;
    const average = deck.partners.reduce((sum, cost) => sum + powerForCost(cost), 0) / deck.partners.length;
    return '<tr><th>'+branchNames[f]+'</th><td>'+countByCost(deck.partners,[1,2,3,4])+'</td><td>'+average.toFixed(2)+'</td><td>'+deck.specials+'</td><td>'+deck.hits.length+'</td><td>'+deck.supplies+'</td></tr>';
  }).join('');
  const deckReport = '<h3>第五关的 16 张实体牌</h3><table><thead><tr><th>分支首领</th><th>1／2／3／4 费伙伴张数</th><th>平均伙伴力量</th><th>专属</th><th>撞击</th><th>补给</th></tr></thead><tbody>'+chiefRows+'</tbody></table>';
  const counterRows = factions.map(f => '<tr><th>'+teamNames[f]+'</th>'+controls.counters[f].map(r =>
    '<td>'+teamNames[r.opponent]+' '+percent(r.winsAgainstPlayer,r.games)+'</td>').join('')+'</tr>').join('');
  const countersReport = '<h3>幻想生物怎样选择另外两种专属</h3><p>在 '+controls.games.toLocaleString('zh-CN')+' 局专属对照中，双方使用相同伙伴和普通功能牌，轮换五套共同底牌并交换座位和先手。每族选对它胜率最高的两个异族。下表为该异族战胜本族的比例。蚂蚁在这组对照中胜过了全部四族，因此它选的是最接近它的两个对手。</p><table><thead><tr><th>本族</th><th>第一种借技来源</th><th>第二种借技来源</th></tr></thead><tbody>'+counterRows+'</tbody></table>';
  const publicCount = field => factions.reduce((sum, f) =>
    sum + Object.values(expedition.encounters[f][6][field]).reduce((total, n) => total + n, 0), 0);
  const faceUpReport = '<p>本次终关对测共翻出 '+publicCount('publicCardsDealt').toLocaleString('zh-CN')+
    ' 张独立明牌，首领实际付费打出了 '+publicCount('publicCardsPlayed').toLocaleString('zh-CN')+
    ' 张。电脑会在出普通手牌、出明牌和收手之间选择。</p>';
  const hornet = JSON.parse(read('hornet-results.json'));
  const hornetRows = Object.entries(hornet.arms).map(([id, arm]) => {
    const row = hornet.results[id];
    const skill = arm.enhanced ? (arm.policy === 'legacy-double' ? '有两堆就全搬' : '可选一堆或两堆') : '普通单搬';
    const strategy = arm.policy === 'shipped' && arm.enhanced ? '胡蜂策略' : '通用策略';
    return '<tr><td>'+(arm.deck==='old'?'旧试配':'新版')+'</td><td>'+skill+'</td><td>'+strategy+'</td><td>'+row.wins+' / '+row.games+'（'+percent(row.wins,row.games)+'）</td><td>'+row.meanOwnFinalPollen.toFixed(1)+'</td></tr>';
  }).join('');
  const hornetReport = '<h3 id="hornet">胡蜂怎样选搬哪一堆</h3><p>搬花粉都要 2 费。胡蜂可以只从左边搬、只从右边搬，或把两边一起搬到己方蜂脚下。电脑会比较当前能拿到的花粉、两边虫力和对手剩余阳光。对手已收手时，可以按当前场面直接判断收获。</p><p>以下各组均对战默认蜜蜂，使用同一批发牌与花道种子并交换座次和先手。末列记录每局结束时胡蜂真正拿到的平均花粉数。</p><table><thead><tr><th>牌组</th><th>2 费专属</th><th>出牌策略</th><th>胡蜂胜局</th><th>平均实得花粉</th></tr></thead><tbody>'+hornetRows+'</tbody></table>';
  const plan = read('brief.template.html').replaceAll('{{CONCEPT}}', () => read('concept-board.svg').replace(/<\?xml[^>]*\?>/,''))
    .replace('{{CAMPAIGN_RESULTS}}', () => campaignReport+faceUpReport+deckReport+hornetReport+countersReport)
    .replace('{{DECK_ROWS}}', () => rows)
    .replace('{{BALANCE}}', () => balance+commonReport)
    .replace(/\{\{rule:(\w+)\.(\w+)\}\}/g, (_,f,k)=>specialRules(f)[k])
    .replace(/\{\{bug:(\w+)\}\}/g, (_,t)=>art.bug(t)).replace(/\{\{icon:(\w+)\}\}/g, (_,k)=>art.icon(k));
  save('花粉擂台·游戏企划.html',plan);
}
