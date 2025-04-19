# Facebook Marketplace Monitor

This script uses Playwright to check Facebook Marketplace for new listings matching a specific search term every 5 minutes.

## Setup

1. Install dependencies:
   ```bash
   npm install playwright
   ```
2. Edit `marketplace_monitor.js` and set your `SEARCH_QUERY`.
3. Run the script:
   ```bash
   node marketplace_monitor.js
   ```

## Notes
- The script will log new items to the console. You can add advanced notifications (email, webhook, etc) where indicated in the code.
- On first run, Facebook may require you to log in. Run the script in headful mode (set `headless: false`) and log in manually, then consider saving cookies for future runs.
- Seen items are tracked in `seen_items.json`.
