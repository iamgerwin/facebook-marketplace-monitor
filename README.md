# Facebook Marketplace Monitor

This script uses Playwright to check Facebook Marketplace for new listings matching a specific search term at a configurable interval (default: every 10 minutes).

## Setup

1. Install dependencies:
   ```bash
   npm install playwright
   ```
2. Edit `marketplace_monitor.js` and set your `SEARCH_QUERY`.
3. Run the script:
   ```bash
   npm start
   ```

## How It Works
- The script extracts all listings matching your search and writes them to `new_items.json` each run.
- It compares `new_items.json` (current run) with `seen_items.json` (previous run) and only alerts for listings that are new (by link).
- After each run, `seen_items.json` is updated to match `new_items.json`, and `new_items.json` is cleared for the next cycle.
- Extraction of title, price, and location is robust, with fallbacks for Facebook DOM changes.
- The script logs new items to the console and displays the next scheduled check time. You can add advanced notifications (email, webhook, etc) where indicated in the code.
- On first run, Facebook may require you to log in. Run the script in headful mode (set `headless: false`) and log in manually, then consider saving cookies for future runs.
- Use `npm start` to run the script easily.
