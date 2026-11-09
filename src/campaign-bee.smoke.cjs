// Run with Playwright available in node_modules or NODE_PATH.
const assert = require("node:assert/strict");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {chromium} = require("playwright");

function installFixture() {
  let engine;
  Object.defineProperty(window,"Pollen",{get:()=>engine,set(original){
    engine={...original,newGame(cfg){
      const {ai=false,pollen=[0,3,1,4,0]}=window.beeFixture;
      const side=ai?1:0, game=original.newGame({...cfg,factions:["bee","bee"],first:side,rng:()=>0.37});
      game.round=2;
      game.pollen=[...pollen];
      // Both seats use bees. The receiver has no adjacent ally. Only the feature
      // on the physical card distinguishes its move set from a normal bee card.
      game.board[0][2]={cost:2,base:3,power:3};
      game.board[1][2]={cost:2,base:3,power:3};
      game.players[side].hand=[false,true].map(enhanced=>({
        kind:"special",id:enhanced?"hornet":"ordinary",skill:"bee",cost:original.specialCost("bee"),enhanced
      }));
      game.players[side].sun=4;
      if(!ai)game.players[1].passed=true;
      return game;
    },chooseAI(state){
      if(!window.beeFixture.ai)return original.chooseAI(state);
      return original.actions(state).find(m=>m.card==="hornet"&&m.type==="special"&&m.from===window.beeFixture.source&&m.to===2);
    }};
  }});
  window.beeFlights=[];
  new MutationObserver(records=>{
    for(const rec of records)for(const node of rec.addedNodes){
      if(node.nodeType===1&&node.matches(".bee-mote"))
        window.beeFlights.push([Number(node.dataset.lane),Number(node.dataset.to)]);
    }
  }).observe(document,{childList:true,subtree:true});
}

(async()=>{
  const browser=await chromium.launch({channel:process.env.POLLEN_BROWSER_CHANNEL||"chrome"});
  try {
    const page=await browser.newPage({viewport:{width:768,height:820},reducedMotion:"no-preference"});
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.addInitScript(installFixture);
    await page.goto(pathToFileURL(path.join(__dirname,"index.html")).href);
    const click=action=>page.locator('[data-do="'+action+'"]').first().click();
    const zone=(side,lane)=>page.locator('[data-do=zone][data-side="'+side+'"][data-lane="'+lane+'"]').click();
    const card=id=>page.locator('[data-do=card][data-id="'+id+'"]').click();
    const piles=()=>page.locator(".pollen-node").evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.pollen)));
    const lanes=selector=>page.locator(selector).evaluateAll(nodes=>nodes.map(n=>Number(n.closest("[data-lane]").dataset.lane)));
    async function setup(value={}) {
      await page.evaluate(f=>{window.beeFixture=f;window.beeFlights=[];},value);
      await click("start");
    }
    async function leave(){await click("exit-game");await click("new-team");}
    await click("mode-solo");
    await page.locator("[data-do=team][data-team=bee]").click();
    const original=[0,3,1,4,0];
    for(const [source,expected,origins] of [[1,[0,0,4,4,0],[1]],[3,[0,3,5,0,0],[3]],[2,[0,0,8,0,0],[1,3]]]){
      await setup();
      await card("hornet");
      assert.deepEqual(await lanes(".slot.legal"),[2]);
      await zone(0,2);
      assert.deepEqual(await lanes(".pollen-node.legal"),[1,3]);
      assert.deepEqual(await lanes(".slot:has(.bee-both)"),[2]);
      await zone(source===2?0:2,source);
      assert.deepEqual(await piles(),expected);
      assert.deepEqual(await lanes(".pollen-node .route-marker"),origins);
      assert.equal(await page.locator(".toolbar .prompt").innerText().then(t=>t.includes("左")),origins.includes(1));
      assert.equal(await page.locator(".toolbar .prompt").innerText().then(t=>t.includes("右")),origins.includes(3));
      await click("cancel");
      assert.deepEqual(await piles(),original);
      await card("hornet");await zone(0,2);await zone(source===2?0:2,source);await click("confirm");
      assert.deepEqual(await piles(),expected);
      assert.equal(await page.locator('[data-role-seat="0"] .token').getAttribute("aria-label"),"本轮阳光上限4，还剩2点");
      assert.deepEqual(await page.evaluate(()=>[...new Set(window.beeFlights.map(([i,j])=>i+"-"+j))]),origins.map(i=>i+"-2"));
      await leave();
    }
    // Only one full neighbour. The empty side and the redundant combination
    // must both be unavailable, while the normal bee remains a one-pile move.
    await setup({pollen:[0,3,1,0,0]});
    await card("hornet");await zone(0,2);
    assert.deepEqual(await lanes(".pollen-node.legal"),[1]);
    assert.equal(await page.locator(".bee-both").count(),0);
    await click("cancel");await card("ordinary");await zone(2,1);await zone(0,2);
    assert.deepEqual(await piles(),[0,0,4,0,0]);await leave();
    // The live boss and its post-action report use the same actual movement.
    await page.evaluate(()=>{for(let n=1;n<6;n++)localStorage.setItem("microgrove-campaign-v1-bee-"+n,"1");});
    await click("campaign-map");
    for(const source of [1,3,2]){
      await page.evaluate(source=>{window.beeFixture={ai:true,source};window.beeFlights=[];},source);
      const stage=source===3?6:5;
      await page.locator('[data-do=campaign-stage][data-stage="'+stage+'"]').click();
      assert.match(await page.locator(".campaign-skills").innerText(),/左边、右边或两边/);
      await click("campaign-fight");
      await page.locator(".campaign-activity").waitFor();
      const report=await page.locator(".campaign-activity").innerText();
      assert.ok(report.includes(source===1?"左边":source===3?"右边":"左右两堆"));
      assert.ok(source===2||!report.includes("两堆"));
      assert.deepEqual(await piles(),source===1?[0,0,4,4,0]:source===3?[0,3,5,0,0]:[0,0,8,0,0]);
      await leave();
    }
    assert.deepEqual(errors,[]);
    console.log("PASS solitary hornet: left, right, both, one empty neighbour, normal bee, cost, cancellation, source-specific motion and boss reports.");
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
