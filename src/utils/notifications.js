// Notification helpers for console and future extensibility
const COLORS = {
  reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m', underscore: '\x1b[4m', blink: '\x1b[5m', reverse: '\x1b[7m', hidden: '\x1b[8m',
  black: '\x1b[30m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m',
};

function alertNewItems(newItems) {
  if (!newItems.length) return;
  console.log(COLORS.bright + COLORS.green + '\n=== ALERT! NEW MARKETPLACE ITEMS FOUND! ===' + COLORS.reset);
  newItems.forEach(item => {
    const priceColor = COLORS.yellow;
    const titleColor = COLORS.bright + COLORS.cyan;
    const locationColor = COLORS.magenta;
    const linkColor = COLORS.underscore + COLORS.blue;
    let info =
      priceColor + (item.price || '') + COLORS.reset + '\n' +
      titleColor + (item.title || 'No Title') + COLORS.reset + '\n' +
      locationColor + 'Location: ' + (item.location || 'No Location') + COLORS.reset + '\n' +
      linkColor + (item.link || '') + COLORS.reset + '\n';
    console.log(info);
  });
  console.log(COLORS.reset);
}

function logNoNewItems(query) {
  console.log(`${COLORS.dim}[${new Date().toLocaleString()}] No new items for "${query}".${COLORS.reset}`);
}

function logNextRun(now, intervalMs) {
  const next = new Date(now.getTime() + intervalMs);
  const fmt = d => d.toLocaleString('en-US', { hour12: false });
  console.log(`done checking marketplace ${fmt(now)} , will run next ${fmt(next)}`);
}

module.exports = { COLORS, alertNewItems, logNoNewItems, logNextRun };
