// Main orchestrator for Facebook Marketplace Monitor (refactored)
const { chromium } = require('playwright');
const path = require('path');
const { ensureDir, readJson, writeJson, clearJson } = require('./utils/fileUtils');
const { extractListingData } = require('./utils/extraction');
const { alertNewItems, logNoNewItems, logNextRun } = require('./utils/notifications');

// CONFIGURATION
const SEARCH_QUERY = 'macbook';
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const DATA_DIR = path.join(__dirname, 'data');
const ASSETS_DIR = path.join(__dirname, 'assets');
const SEEN_ITEMS_FILE = path.join(DATA_DIR, 'seen_items.json');
const NEW_ITEMS_FILE = path.join(DATA_DIR, 'new_items.json');
const MARKETPLACE_URL = `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(SEARCH_QUERY)}&sortBy=creation_time_descend`;

ensureDir(DATA_DIR);
ensureDir(ASSETS_DIR);

async function runMonitorLoop() {
  while (true) {
    try {
      await checkMarketplace();
    } catch (e) {
      console.error('Error in checkMarketplace:', e);
    }
    const now = new Date();
    const nextRun = new Date(Date.now() + CHECK_INTERVAL_MS);
    console.log(`\ndone checking marketplace ${now.toLocaleString()} , will run next ${nextRun.toLocaleString()}`);
    await new Promise(res => setTimeout(res, CHECK_INTERVAL_MS));
  }
}

async function checkMarketplace() {
  let seenItems = readJson(SEEN_ITEMS_FILE);
  let newItemsArray = [];
  let context;
  try {
    const userDataDir = path.join(__dirname, '../user_data_dir');
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ['--disable-blink-features=AutomationControlled']
    });
    const page = await context.newPage();
    await page.goto(MARKETPLACE_URL);
    // Wait for page to load
    await page.waitForTimeout(2000);
    // Detect login requirement: look for login form or absence of Marketplace content
    const loginForm = await page.$('input[name="email"], input[type="password"]');
    const marketplaceContent = await page.$('a[href*="marketplace/item"]');
    if (loginForm || !marketplaceContent) {
      console.log('\n=== MANUAL LOGIN REQUIRED ===');
      console.log('Please log in to Facebook in the opened browser window.');
      console.log('Do NOT close the browser window until the script finishes and closes it automatically.');
      console.log('After you finish logging in and see the Marketplace, press ENTER in this terminal to continue.');
      // Wait for user input
      await new Promise(resolve => process.stdin.once('data', resolve));
      // Optionally, wait a bit more for session/cookies to save
      try {
        await page.waitForTimeout(2000);
      } catch (e) {
        console.warn('Warning: Browser was closed before script could continue.');
        return;
      }
      // Check if page/context is still open
      if (page.isClosed()) {
        console.warn('Page was closed before script could continue. Exiting early.');
        return;
      }
    }
    // Extraction
    const items = await page.$$('a[href*="marketplace/item"]');
    for (const item of items) {
      const entry = await extractListingData(item);
      newItemsArray.push(entry);
    }
    console.log('Writing to NEW_ITEMS_FILE:', JSON.stringify(newItemsArray, null, 2));
    writeJson(NEW_ITEMS_FILE, newItemsArray);
    // Compare
    const prevLinks = new Set(seenItems.map(item => item.link));
    let newItems = newItemsArray.filter(item => item.link && !prevLinks.has(item.link));
    if (newItems.length > 0) {
      alertNewItems(newItems);
    } else {
      logNoNewItems(SEARCH_QUERY);
    }
    // Save screenshot for debugging
    await page.screenshot({ path: path.join(ASSETS_DIR, 'marketplace_debug.png'), fullPage: true });
    // Save HTML for debugging
    const html = await page.content();
    const fs = require('fs');
    fs.writeFileSync(path.join(ASSETS_DIR, 'marketplace_debug.html'), html, 'utf8');
  } catch (err) {
    console.error('Error during check:', err);
    // Save error screenshot
    if (browser) {
      try {
        const page = (await browser.contexts()[0].pages())[0];
        await page.screenshot({ path: path.join(ASSETS_DIR, 'facebook_error_page.png'), fullPage: true });
      } catch {}
    }
  } finally {
    // Update seen_items.json cumulatively and clear new_items.json
    let seenItems = readJson(SEEN_ITEMS_FILE);
    let latestItems = readJson(NEW_ITEMS_FILE);
    const seenLinks = new Set(seenItems.map(item => item.link));
    const trulyNewItems = latestItems.filter(item => item.link && !seenLinks.has(item.link));
    if (trulyNewItems.length > 0) {
      seenItems = seenItems.concat(trulyNewItems);
      writeJson(SEEN_ITEMS_FILE, seenItems);
    }
    clearJson(NEW_ITEMS_FILE);

    if (context) {
      try {
        await context.close();
      } catch (e) {
        // Suppress error if already closed
      }
    }
  }
}

runMonitorLoop();
