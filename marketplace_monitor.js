const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');

// CONFIGURATION
const SEARCH_QUERY = 'macbook'; // Change this to your item
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const MARKETPLACE_URL = `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(SEARCH_QUERY)}&sortBy=creation_time_descend`;
const SEEN_ITEMS_FILE = 'seen_items.json';
const NEW_ITEMS_FILE = 'new_items.json';
const USER_DATA_DIR = path.join(__dirname, 'user_data_dir'); // Directory to store browser data
const LOCK_FILE = path.join(USER_DATA_DIR, 'SingletonLock');

// Terminal colors for notifications
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m'
};

// Helper function to ensure clean browser profile
function cleanupBrowserProfile() {
  return new Promise((resolve) => {
    // Remove the singleton lock if it exists to prevent "profile in use" errors
    if (fs.existsSync(LOCK_FILE)) {
      try {
        fs.unlinkSync(LOCK_FILE);
        console.log('Removed stale browser lock file');
      } catch (err) {
        console.warn('Could not remove lock file:', err.message);
      }
    }
    
    // Make sure no zombie Chrome processes are using our profile
    exec('pkill -f "' + USER_DATA_DIR + '"', () => {
      // We don't care about the exec result, just wait a moment
      setTimeout(resolve, 1000);
    });
  });
}

// Util to load and save seen items
function loadSeenItems() {
  if (!fs.existsSync(SEEN_ITEMS_FILE)) {
    fs.writeFileSync(SEEN_ITEMS_FILE, '[]', 'utf-8');
    return [];
  }
  return JSON.parse(fs.readFileSync(SEEN_ITEMS_FILE, 'utf-8'));
}
function loadNewItems() {
  if (!fs.existsSync(NEW_ITEMS_FILE)) {
    fs.writeFileSync(NEW_ITEMS_FILE, '[]', 'utf-8');
    return [];
  }
  return JSON.parse(fs.readFileSync(NEW_ITEMS_FILE, 'utf-8'));
}
function saveSeenItems(seenArray) {
  fs.writeFileSync(SEEN_ITEMS_FILE, JSON.stringify(seenArray, null, 2), 'utf-8');
}
function saveNewItems(newArray) {
  fs.writeFileSync(NEW_ITEMS_FILE, JSON.stringify(newArray, null, 2), 'utf-8');
}
function clearNewItems() {
  fs.writeFileSync(NEW_ITEMS_FILE, '[]', 'utf-8');
}

async function checkMarketplace() {
  let seenItems = loadSeenItems(); // Previous run
  let seenLinks = new Set(seenItems.map(item => item.link)); // For fast lookup
  let newItemsArray = []; // Will store current run

  // For accurate comparison, load previous run from seen_items.json, fill new_items.json, then compare

  let browser;
  
  // Create user_data_dir if it doesn't exist
  if (!fs.existsSync(USER_DATA_DIR)){
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  }
  
  // Clean up any stale browser processes or lock files
  await cleanupBrowserProfile();
  
  // Launch with persistent context to maintain login sessions between runs
  browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  // No need for browser.newContext() as we're using a persistent context
  const page = await browser.newPage();
  
  // Set extra browser properties directly on the page
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9'
  });
  
  await page.setViewportSize({ width: 1280, height: 800 });
  
  // Enable console logging from the browser
  page.on('console', msg => console.log(`BROWSER CONSOLE: ${msg.text()}`));
  page.on('pageerror', err => console.error(`BROWSER ERROR: ${err.message}`));
  try {
    console.log('Navigating to:', MARKETPLACE_URL);
    // Use 'load' instead of 'networkidle' - Facebook may not reach network idle
    await page.goto(MARKETPLACE_URL, { waitUntil: 'load', timeout: 30000 });
    
    // Add a small delay to let the page stabilize (important for Facebook's lazy loading)
    console.log('Page loaded, waiting for content to stabilize...');
    await page.waitForTimeout(5000);
    
    // Check if we're on a login page - more reliable detection
    console.log('Checking page state...');
    const isLoginPage = await page.evaluate(() => {
      // Check for login form elements
      const hasPasswordField = document.querySelector('input[type="password"]') !== null;
      const hasEmailField = document.querySelector('input[name="email"]') !== null || 
                            document.querySelector('input[type="email"]') !== null;
      const hasLoginButton = Array.from(document.querySelectorAll('button')).some(btn => 
        btn.textContent.toLowerCase().includes('log in') || 
        btn.textContent.toLowerCase().includes('login'));
      
      // Check for login related text
      const bodyText = document.body.textContent.toLowerCase();
      const hasLoginText = bodyText.includes('log in') || 
                           bodyText.includes('login') ||
                           bodyText.includes('sign in') ||
                           bodyText.includes('facebook') && bodyText.includes('password');
                           
      return hasPasswordField || (hasEmailField && hasLoginButton) || hasLoginText;
    });
    
    if (isLoginPage) {
      console.log('LOGIN PAGE DETECTED - Facebook requires authentication');
      await page.screenshot({ path: 'facebook_login_page.png' });
      await fs.promises.writeFile('facebook_login_page.html', await page.content(), 'utf-8');
      
      console.log('*****************************************************');
      console.log('* MANUAL LOGIN REQUIRED: Please login in the browser window *');
      console.log('* The script will wait for 10 minutes for you to complete login *');
      console.log('* After login, your session will be saved for future runs *');
      console.log('* NOTE: After login, you might need to navigate to the Marketplace *');
      console.log('* section manually to grant permission if requested *');
      console.log('*****************************************************');
      
      // Wait for successful login with a longer timeout (10 minutes)
      try {
        // Check either for navigation or for changes in the page content
        // that would indicate login success
        await Promise.race([
          page.waitForNavigation({ timeout: 300000 }),
          page.waitForFunction(
            () => !document.querySelector('input[type="password"]'),
            { timeout: 300000 }
          )
        ]);
        console.log('Login detected! Session will be reused in future runs.');
        
        // Add additional wait time after login to stabilize
        await page.waitForTimeout(5000);
        
        // Navigate directly to Marketplace after login
        console.log('Navigating to Marketplace after login...');
        await page.goto(MARKETPLACE_URL, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(3000);
      } catch (loginErr) {
        console.error('Login timeout or error:', loginErr);
        await page.screenshot({ path: 'login_failed.png', fullPage: true });
        throw new Error('Login timeout or problem. Please restart the script and try again.');
      }
    }
    
    // Save initial page state for analysis
    console.log('Initial page loaded, saving screenshot...');
    await page.screenshot({ path: 'facebook_initial_page.png', fullPage: true });
    await fs.promises.writeFile('facebook_initial_page.html', await page.content(), 'utf-8');
    // Facebook may require login. If so, you must manually log in the first time and save cookies/session.
    // Wait for listings to load
    // Print the page title to help understand what page we're on
    console.log('Page title:', await page.title());
    
    // Try to check for common Facebook UI elements to see what loaded
    const fbElements = await page.evaluate(() => {
      const selectors = {
        'search_box': document.querySelector('input[placeholder*="Search"]') !== null,
        'navigation_menu': document.querySelector('[role="navigation"]') !== null,
        'marketplace_header': document.querySelector('h1') ? document.querySelector('h1').textContent : null,
        'any_articles': document.querySelectorAll('[role="article"]').length,
        'page_content': document.body.textContent.substring(0, 200) // First 200 chars for context
      };
      return selectors;
    });
    console.log('Facebook UI elements detected:', fbElements);
    
    let items = [];
    try {
      console.log('Waiting for main selector...');
      // Try the main selector with longer timeout
      await page.waitForSelector('[aria-label="Search results"] [role="article"]', { timeout: 30000 });
      items = await page.$$('[aria-label="Search results"] [role="article"]');
      console.log(`Found ${items.length} items with main selector`);
    } catch (e) {
      console.warn('Main selector not found, trying alternative selectors...');
      await page.screenshot({ path: 'marketplace_debug.png', fullPage: true });
      await fs.promises.writeFile('marketplace_debug.html', await page.content(), 'utf-8');
      
      // Try multiple fallback selectors
      const fallbackSelectors = [
        '[role="article"]',
        '[data-pagelet*="Marketplace"] a',
        'a[href*="marketplace/item"]',
        'div[style*="border-radius"] a'
      ];
      
      for (const selector of fallbackSelectors) {
        try {
          console.log(`Trying fallback selector: ${selector}`);
          await page.waitForSelector(selector, { timeout: 10000 });
          items = await page.$$(selector);
          console.log(`Found ${items.length} items with selector: ${selector}`);
          if (items.length > 0) break;
        } catch (err) {
          console.log(`Selector ${selector} not found`);
        }
      }
    }
    for (const item of items) {
      // The item is an <a> element itself
      const link = await item.evaluate(a => a.href);
      // Try to extract title
      let title = await item.$eval('[data-testid="marketplace_listing_title"]', el => el.innerText).catch(async () => {
        // Fallback: aria-label
        const aria = await item.getAttribute('aria-label').catch(() => null);
        if (aria) return aria;
        // Fallback: first span
        return await item.$eval('span', el => el.innerText).catch(() => null);
      });
      // Try to extract price
      let price = await item.$eval('[data-testid="listing_price"]', el => el.innerText).catch(async () => {
        // Fallback: second span
        const spans = await item.$$('span');
        return spans[1] ? await spans[1].evaluate(el => el.innerText) : null;
      });
      // Try to extract location
      let location = await item.$eval('[data-testid="reverse_geocode"]', el => el.innerText).catch(async () => {
        // Fallback: third span
        const spans = await item.$$('span');
        return spans[2] ? await spans[2].evaluate(el => el.innerText) : null;
      });
      // Log for debugging
      console.log({ link, title, price, location });
      const entry = { link, title, price, location };
      newItemsArray.push(entry);
    }
    // Save all current run items to new_items.json
    saveNewItems(newItemsArray);

    // Accurate comparison: compare new_items.json to seen_items.json
    const prevSeen = loadSeenItems();
    const prevLinks = new Set(prevSeen.map(item => item.link));
    let newItems = newItemsArray.filter(item => item.link && !prevLinks.has(item.link));

    if (newItems.length > 0) {
      // Make a prominent terminal notification with colors and sound
      // The \x07 character triggers the terminal bell sound
      console.log('\n');
      console.log(`${COLORS.bgGreen}${COLORS.black}${COLORS.bright}🔔 ALERT! NEW MARKETPLACE ITEMS FOUND! 🔔${COLORS.reset}\x07`);
      console.log(`${COLORS.bright}${COLORS.yellow}============================================${COLORS.reset}`);
      console.log(`${COLORS.cyan}[${new Date().toLocaleString()}] ${COLORS.bright}Found ${COLORS.red}${newItems.length}${COLORS.reset}${COLORS.bright} new items for "${SEARCH_QUERY}":${COLORS.reset}`);
      console.log(`${COLORS.yellow}============================================${COLORS.reset}`);
      
      // Print each item with a nice format
      newItems.forEach((item, index) => {
        console.log(`${COLORS.green}${index + 1}.${COLORS.reset} ${COLORS.bright}${item.title}${COLORS.reset}`);
        console.log(`   ${COLORS.blue}${item.link}${COLORS.reset}`);
        console.log('');
      });
      
      // Ring the bell twice more for attention
      console.log('\x07\x07');
      console.log(`${COLORS.yellow}============================================${COLORS.reset}\n`);
      
      saveSeenItems(seenItems);
      // Send macOS notification
      try {
        // Create an Apple Script that creates a notification
        const title = `${newItems.length} new ${SEARCH_QUERY} items found!`;
        const message = newItems.map(item => item.title || 'Unnamed item').slice(0, 3).join(', ') + 
          (newItems.length > 3 ? ` and ${newItems.length - 3} more...` : '');
        const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}" sound name "Ping"`;
        
        // Execute the Apple Script
        execSync(`osascript -e '${script}'`);
        console.log('Mac notification sent!');
      } catch (notificationErr) {
        console.error('Error sending Mac notification:', notificationErr.message);
      }
      
      // Here you can add more advanced notifications (email, webhook, etc)
    } else {
      console.log(`${COLORS.dim}[${new Date().toLocaleString()}] No new items for "${SEARCH_QUERY}".${COLORS.reset}`);
    }
  } catch (err) {
    console.error('Error during check:', err);
    await page.screenshot({ path: 'facebook_error_page.png', fullPage: true });
    console.log('Error page screenshot saved to facebook_error_page.png');
  } finally {
    // Clean shutdown of the browser
    if (browser) {
      try {
        // After comparison, update seen_items.json to match new_items.json and clear new_items.json
        const newItemsData = loadNewItems();
        saveSeenItems(newItemsData);
        clearNewItems();
        const now = new Date();
        const next = new Date(now.getTime() + CHECK_INTERVAL_MS);
        const fmt = d => d.toLocaleString('en-US', { hour12: false });
        console.log(`done checking marketplace ${fmt(now)} , will run next ${fmt(next)}`);
        await browser.close();
      } catch (err) {
        console.warn('Error closing browser:', err.message);
      }
    }
  }
}

// Initial run
checkMarketplace();
// Schedule periodic checks
setInterval(checkMarketplace, CHECK_INTERVAL_MS);
