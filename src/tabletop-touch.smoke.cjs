// Manual regression: node tabletop-touch.smoke.cjs
// Supply Playwright through node_modules or NODE_PATH. Uses installed Edge by default.
// POLLEN_BROWSER_CHANNEL=chrome or POLLEN_BROWSER_BINARY=/path/to/chromium overrides it.
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const localPage = pathToFileURL(path.join(__dirname, "index.html")).href;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function checkTouchLayout(browser, width, height) {
  const context = await browser.newContext({
    viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const seat = i => page.locator('[data-editor="' + i + '"]');
    const button = (i, action, kind, tier) => seat(i).locator(
      '[data-do="' + action + '-copy"][data-kind="' + kind + '"][data-tier="' + tier + '"]',
    );
    const total = async i => parseInt(await seat(i).locator(".deck-count").innerText(), 10);
    const copies = async (i, kind, tier) => Number(await seat(i).locator(
      '.build-row[data-group="' + kind + '"][data-tier="' + tier + '"] .copies',
    ).innerText());
    const stockedTier = async (i, kind) => {
      const rows = await seat(i).locator('.build-row[data-group="' + kind + '"]').evaluateAll(nodes =>
        nodes.map(row => ({ tier: Number(row.dataset.tier), count: Number(row.querySelector(".copies").textContent) }))
          .filter(tier => tier.count > 0).sort((a, b) => b.count - a.count));
      assert.ok(rows.length, "The default deck needs a removable " + kind + " for this interaction");
      return rows[0];
    };

    // scrollIntoView and then re-read both physical centers: the top seat is rotated.
    async function pointsFor(buttons) {
      for (const b of buttons) await b.scrollIntoViewIfNeeded();
      return Promise.all(buttons.map((b, i) => b.evaluate((el, id) => {
        const r = el.getBoundingClientRect();
        const x = r.x + r.width / 2, y = r.y + r.height / 2;
        if (el.disabled || !el.contains(document.elementFromPoint(x, y))) throw Error("Control is not reachable");
        return { x, y, id, radiusX: 2, radiusY: 2 };
      }, i + 1)));
    }
    const touch = (type, touchPoints) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    async function overlappingTaps(a, b) {
      const pts = await pointsFor([a, b]);
      await touch("touchStart", [pts[0]]);
      await touch("touchStart", pts);
      await delay(45);
      await touch("touchEnd", []);
      await delay(180); // Observe any duplicate synthesized click as well as pointerup.
    }

    await page.goto(localPage);
    await page.locator('[data-do="mode-duo"]').tap();
    for (const side of [1, 0]) {
      await page.locator('[data-do="pick-team"][data-seat="' + side + '"][data-team="ant"]').tap();
      await page.locator('[data-do="seat-build"][data-seat="' + side + '"]').tap();
    }
    assert.deepEqual(await Promise.all([total(0), total(1)]), [16, 16]);
    const partner = await stockedTier(0, "partners");
    const hit = await stockedTier(1, "hits");
    const supplies = await copies(0, "supplies", 1);
    await overlappingTaps(button(0, "remove", "partners", partner.tier), button(1, "remove", "partners", partner.tier));
    assert.deepEqual(await Promise.all([total(0), total(1)]), [15, 15]);
    assert.deepEqual(await Promise.all([copies(0, "partners", partner.tier), copies(1, "partners", partner.tier)]), [partner.count - 1, partner.count - 1]);

    await overlappingTaps(button(0, "add", "supplies", 1), button(1, "remove", "hits", hit.tier));
    assert.deepEqual(await Promise.all([total(0), total(1)]), [16, 14]);
    assert.deepEqual(await Promise.all([copies(0, "supplies", 1), copies(1, "supplies", 1)]), [supplies + 1, supplies]);
    assert.deepEqual(await Promise.all([copies(0, "hits", hit.tier), copies(1, "hits", hit.tier)]), [hit.count, hit.count - 1]);

    const single = await stockedTier(0, "partners");
    await button(0, "remove", "partners", single.tier).tap();
    await delay(180);
    assert.equal(await total(0), 15, "single tap must not count twice");
    assert.equal(await copies(0, "partners", single.tier), single.count - 1);

    const untouched = await stockedTier(1, "partners");
    const [start] = await pointsFor([button(1, "remove", "partners", untouched.tier)]);
    await touch("touchStart", [start]);
    for (let i = 1; i <= 4; i++) {
      await touch("touchMove", [{ ...start, y: start.y + i * 12 }]);
      await delay(30);
    }
    await touch("touchEnd", []);
    await delay(180);
    assert.equal(await total(1), 14, "dragging across a button must not change the deck");
    assert.equal(await copies(1, "partners", untouched.tier), untouched.count);
    assert.deepEqual(errors, []);
    console.log("PASS " + width + "×" + height + ": overlapping taps, different actions, single tap and drag");
  } finally {
    await context.close();
  }
}

async function main() {
  const options = process.env.POLLEN_BROWSER_BINARY
    ? { executablePath: process.env.POLLEN_BROWSER_BINARY }
    : { channel: process.env.POLLEN_BROWSER_CHANNEL || "msedge" };
  const browser = await chromium.launch({ headless: true, ...options });
  try {
    await checkTouchLayout(browser, 1024, 768);
    await checkTouchLayout(browser, 390, 844);
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
