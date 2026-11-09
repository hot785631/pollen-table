const assert=require("node:assert/strict");
const path=require("node:path");
const os=require("node:os");
const {pathToFileURL}=require("node:url");
const {chromium}=require("playwright");

function installFixture() {
  let api;
  Object.defineProperty(window,"Pollen",{get:()=>api,set(engine){
    api={...engine,newGame(options){
      const s=engine.newGame({...options,first:0,rng:()=>.38});
      if(window.testTable==="action"){
        for(const side of [0,1])for(const lane of [1,2])s.board[side][lane]={cost:2,base:3,power:3};
      }
      window.startingGame=s;return s;
    },chooseAI(state){
      if(window.testTable==="dark"){
        const legal=engine.actions(state);
        return legal.find(m=>m.type==="partner"&&state.players[1].hand.length===6)||legal.find(m=>m.type==="pass");
      }
      if(window.testTable!=="action")return engine.chooseAI(state);
      const moves=engine.actions(state);
      const open=engine.visibleSkill(state,1);
      return moves.find(m=>m.card===open?.id&&m.type==="special")||moves.find(m=>m.type==="pass");
    }};
  }});
}

(async()=>{
  const browser=await chromium.launch({channel:process.env.POLLEN_BROWSER_CHANNEL||"chrome"});
  try {
    const page=await browser.newPage({viewport:{width:1024,height:768},reducedMotion:"reduce"});
    const errors=[];page.on("pageerror",e=>errors.push(e.message));
    await page.addInitScript(installFixture);
    await page.goto(pathToFileURL(path.join(__dirname,"index.html")).href);
    const click=k=>page.locator('[data-do="'+k+'"]').first().click();
    const backs=page.locator(".computer-seat .cpu-back"),open=page.locator(".public-skill.face-up");
    const hidden=page.locator('[data-hand="1"]');
    async function enter(stage){
      await page.locator('[data-do=campaign-stage][data-stage="'+stage+'"]').click();await click("campaign-fight");
    }
    async function leave(){await click("exit-game");await click("new-team");}
    async function checkHidden(n){
      assert.equal(await backs.count(),n);
      assert.equal(await hidden.locator("[data-do=card], [data-id], [data-focus], [id], [title]").count(),0);
      assert.equal(await backs.evaluateAll(nodes=>nodes.some(n=>n.textContent.trim()||n.closest("button")||n.querySelector("[aria-label],[data-id],[id],[title]"))),false);
      assert.match(await hidden.getAttribute("aria-label"),new RegExp("暗牌 "+n+" 张"));
    }
    await click("mode-solo");await click("start");await checkHidden(6);assert.equal(await open.count(),0);
    assert.equal(await page.locator('.seat-bottom.active-seat .card[data-do=card]:not([disabled])').count(),6);
    await backs.first().click();assert.equal(await page.locator('[data-do=confirm]').count(),0);await leave();
    await page.evaluate(()=>{window.testTable="dark";});await click("start");await click("pass");await click("confirm");
    await page.waitForFunction(()=>document.querySelectorAll(".computer-seat .cpu-back").length===5);
    await checkHidden(5);await click("next");await checkHidden(6);await leave();
    await page.evaluate(()=>{window.testTable="";});
    await page.locator("[data-do=team][data-team=spider]").click();
    await page.evaluate(()=>{for(let n=1;n<=5;n++)localStorage.setItem("microgrove-campaign-v1-spider-"+n,"1");});
    await click("campaign-map");
    for(let n=1;n<=5;n++){await enter(n);await checkHidden(6);assert.equal(await page.locator(".public-skill").count(),0);await leave();}
    await enter(6);await checkHidden(6);assert.equal(await open.count(),1);
    for(const [width,height] of [[390,844],[844,390],[568,320],[320,568],[1024,768]]) {
      await page.setViewportSize({width,height});
      const metrics=await page.evaluate(()=>{
        const targets=[...document.querySelectorAll(".computer-seat .cpu-back,.public-skill,.seat-bottom .card")];
        const boxes=targets.map(e=>e.getBoundingClientRect());
        const a=document.querySelector(".seat-top").getBoundingClientRect(),b=document.querySelector(".table").getBoundingClientRect(),c=document.querySelector(".seat-bottom").getBoundingClientRect();
        return {inside:boxes.every(r=>r.left>=0&&r.right<=innerWidth+1&&r.width>0&&r.height>=43),fit:document.documentElement.scrollWidth<=innerWidth,order:a.bottom<=b.top+1&&b.bottom<=c.top+1,overlap:boxes.slice(0,6).some((r,i)=>r.right>boxes[i+1].left+1)};
      });
      assert.deepEqual(metrics,{inside:true,fit:true,order:true,overlap:false},width+"x"+height);
      if(process.env.POLLEN_SEAT_SHOTS){
        const target=path.join(os.tmpdir(),"pollen-solo-boss-"+width+"x"+height+".png");
        await page.screenshot({path:target});console.log(target);
      }
    }
    await click("public-skill-info");assert.equal(await page.locator("#sheet-title").innerText(),"首领明牌");await click("close-sheet");await leave();
    await page.evaluate(()=>{window.testTable="action";});await enter(6);
    const cost=await page.evaluate(()=>Pollen.visibleSkill(window.startingGame,1).cost);
    await click("pass");await click("confirm");await page.locator(".computer-seat.active-seat").waitFor();
    await page.locator(".public-skill.spent").waitFor();
    await checkHidden(6);assert.match(await page.locator(".campaign-activity").innerText(),/打出明牌/);
    assert.match(await page.locator('[data-role-seat="1"] .token').getAttribute("aria-label"),new RegExp("还剩"+(3-cost)+"点"));
    assert.equal(await page.locator(".computer-seat [data-do=pass],.computer-seat [data-do=cycle]").count(),0);
    await click("next");await open.waitFor();await checkHidden(6);
    assert.deepEqual(errors,[]);
    console.log("PASS solo AI seated opposite; anonymous six-card hand; one independent inspectable final-boss skill, spent this round, replaced next round; five viewports.");
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
