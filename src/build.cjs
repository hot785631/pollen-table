'use strict';
// Ship two portable, self-contained pages; no server or install is needed.
const fs = require('node:fs');
const path = require('node:path');
const art = require('./art.js');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const save = (name, body) => fs.writeFileSync(path.join(__dirname, name), body, 'utf8');
const mode = process.argv[2];
if (mode !== 'plan') {
  const game = read('index.html').replace(/<script\b[^>]*\bsrc=["'](?:\.\/)?([\w.-]+\.js)["'][^>]*>\s*<\/script>/gi,
    (_, name) => '<script>\n' + read(name).replace(/<\/script\s*>/gi, '<\\/script>') + '\n</script>')
    .replace(/<link\b[^>]*\bhref=["'](?:\.\/)?([\w.-]+\.css)["'][^>]*>/gi, (_,name) => '<style>\n' + read(name)+'\n</style>');
  save('花粉擂台·离线试玩.html',game);
  save('花粉擂台-v5.0-五族花道离线版.html',game);
}
if (mode !== 'game') {
  const { defaultDeck, specialRules } = require('./engine.js');
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
  const plan = read('brief.template.html').replaceAll('{{CONCEPT}}', () => read('concept-board.svg').replace(/<\?xml[^>]*\?>/,''))
    .replace('{{DECK_ROWS}}', rows)
    .replace('{{BALANCE}}', balance+commonReport)
    .replace(/\{\{rule:(\w+)\.(\w+)\}\}/g, (_,f,k)=>specialRules(f)[k])
    .replace(/\{\{bug:(\w+)\}\}/g, (_,t)=>art.bug(t)).replace(/\{\{icon:(\w+)\}\}/g, (_,k)=>art.icon(k));
  save('花粉擂台·游戏企划.html',plan);
}
