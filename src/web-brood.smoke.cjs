// Run with Playwright available through node_modules or NODE_PATH.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

function prepareFixture(spider) {
  const engine = window.Pollen;
  const original = engine.newGame;
  const next = engine.nextRound;
  engine.newGame = () => {
    const foe = 1 - spider;
    const state = original({
      factions: spider === 0 ? ["spider", "butterfly"] : ["butterfly", "spider"],
      first: foe, rng: () => 0.41,
    });
    state.players.forEach(player => {
      player.sun = 10;
      const pool = [...player.hand, ...player.draw, ...player.discard];
      player.hand = pool.filter(card => card.kind === "special");
      player.draw = pool.filter(card => card.kind !== "special");
      player.discard = [];
    });
    state.board[foe][2] = { power: 3, base: 3, cost: 2 };
    state.board[spider][2] = { power: 1, base: 1, cost: 1 };
    state.broods[foe][4] = engine.specialRules("butterfly").hatchPower;
    state.broodFirst[4] = foe;
    state.pollen = [0, 0, 3, 0, 1];
    state.startingPollen = 4;
    window.fixture = state;
    return state;
  };
  engine.nextRound = state => {
    window.nextFixture = next(state);
    return window.nextFixture;
  };
}

const server = http.createServer((request, response) => {
  const name = new URL(request.url, "http://localhost").pathname.slice(1) || "index.html";
  const file = path.join(__dirname, name);
  if (name.includes("/") || name.includes("..") || !fs.existsSync(file)) {
    response.writeHead(404);
    response.end();
    return;
  }
  const contentType = file.endsWith(".js") ? "text/javascript" :
    file.endsWith(".css") ? "text/css" : "text/html; charset=utf-8";
  response.setHeader("Content-Type", contentType);
  response.end(fs.readFileSync(file));
});

async function checkSeat(browser, spider, viewport) {
  const context = await browser.newContext({
    viewport, hasTouch: true,
    isMobile: true, reducedMotion: spider === 0 ? "reduce" : "no-preference",
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/engine.js", route => route.fulfill({
      contentType: "text/javascript",
      body: fs.readFileSync(path.join(__dirname, "engine.js"), "utf8") +
        "\n(" + prepareFixture.toString() + ")(" + spider + ");",
    }));
    await page.goto("http://127.0.0.1:" + server.address().port);
    await page.locator('[data-do="mode-duo"]').tap();
    await page.locator('[data-do="start-duo"]').tap();
    assert.equal(await page.locator('[data-do="reveal"],[data-do="cover"],.covered-card').count(), 0);
    assert.equal(await page.locator(".card").count(), 4);
    assert.equal(await page.locator(".waiting-seat .card:disabled").count(), 2);
    assert.equal(await page.locator(".active-seat .card:enabled").count(), 2);
    assert.ok((await page.locator(".waiting-seat .card.special").first().getAttribute("aria-label")).startsWith("织网"));
    assert.equal(await page.locator(".waiting-seat .card").first().evaluate(card => getComputedStyle(card).filter), "grayscale(1)");
    const otherCard = await page.locator(".waiting-seat .card").first().boundingBox();
    await page.touchscreen.tap(otherCard.x + otherCard.width / 2, otherCard.y + otherCard.height / 2);
    assert.equal(await page.locator(".card.picked").count(), 0, "waiting player cannot select a card");
    const target = page.locator('.slot[data-side="' + (1 - spider) + '"][data-lane="2"]');
    const flower = page.locator('.pollen-node[data-lane="2"]');
    await page.locator(".active-seat .card.special").first().tap();
    await target.tap();
    assert.equal(await flower.getAttribute("data-pollen"), "3");
    assert.equal(await target.locator(".brood-marker b").textContent(), "7");
    await page.locator('[data-do="confirm"]').tap();
    assert.equal(await flower.getAttribute("data-pollen"), "3");
    assert.equal(await flower.locator(".feed-destination").count(), 1);
    await page.locator(".active-seat .card.special").first().tap();
    await target.tap();
    assert.ok((await target.getAttribute("aria-label")).includes("蛹被摧毁"));
    assert.equal(await target.locator(".brood-destroyed").count(), 1);
    assert.equal(await flower.getAttribute("data-pollen"), "3");
    assert.equal(await flower.locator(".feed-destination").count(), 0);
    if (process.env.POLLEN_SCREENSHOT && spider === 0 && viewport.width === 1024) {
      await page.screenshot({ path: process.env.POLLEN_SCREENSHOT });
    }
    await page.locator('[data-do="cancel"]').tap();
    assert.equal(await target.locator(".brood-destroyed").count(), 0);
    assert.equal(await target.locator(".brood-marker b").textContent(), "7");
    await page.locator(".active-seat .card.special").first().tap();
    await target.tap();
    await page.locator('[data-do="confirm"]').tap();
    assert.equal(await target.locator(".brood-marker").count(), 0);
    assert.equal(await flower.getAttribute("data-pollen"), "3");
    assert.equal(await page.locator(".active-seat").getAttribute("data-seat"), String(1 - spider));
    assert.equal(await page.locator(".waiting-seat .card:enabled").count(), 0);
    for (const side of [1 - spider, spider]) {
      await page.locator('[data-do="pass"]').tap();
      await page.locator('[data-do="confirm"]').tap();
    }
    await page.locator('[data-do="next"]').first().waitFor();
    assert.equal(await flower.locator(".collection-result").getAttribute("data-award"), String(spider));
    assert.equal(await flower.locator(".collection-result b").textContent(), "+3");
    assert.equal(await page.locator('[data-lane="4"] .collection-result[data-award="feed"] b').textContent(), "×1");
    assert.equal(await page.locator('[data-score-side="'+spider+'"] b').first().textContent(), "3");
    await page.locator('[data-do="next"]').first().tap();
    assert.equal(await page.locator('[data-do="reveal"],[data-do="cover"],.covered-card').count(), 0);
    assert.equal(await page.locator(".waiting-seat .card:enabled").count(), 0);
    assert.equal(await page.evaluate(side => window.nextFixture.board[1 - side][2], spider), null);
    assert.equal(await page.evaluate(side => window.nextFixture.board[1 - side][4].power, spider), 5);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function main() {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    headless: true, channel: process.env.POLLEN_BROWSER_CHANNEL || "msedge",
  });
  try {
    for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
      for (const side of [0, 1]) await checkSeat(browser, side, viewport);
    }
    console.log("Both seats on phone and tablet passed open hands, turn locking, destruction preview, cancellation and next-round hatching.");
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => server.close());
