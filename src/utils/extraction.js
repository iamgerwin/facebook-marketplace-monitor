// DOM extraction logic for Facebook Marketplace listings
// Expects Playwright element handles
async function extractListingData(item) {
  const link = await item.evaluate(a => a.href);

  // Extract title with improved fallback and debug logging
  let title = await item.$eval('[data-testid="marketplace_listing_title"]', el => el.innerText).catch(async () => {
    // fallback: aria-label (if used for title)
    const aria = await item.getAttribute('aria-label').catch(() => null);
    if (aria) return aria;
    // fallback: find a span that doesn't look like a price
    const spans = await item.$$('span');
    let allSpanTexts = [];
    for (let s of spans) {
      let text = await s.evaluate(el => el.innerText).catch(() => '');
      allSpanTexts.push(text);
    }
    // Skip spans that look like prices (e.g., start with 'PHP' or are just numbers)
    let likelyTitle = allSpanTexts.find(t => t && !/^PHP\s?\d|^\d|,|\./i.test(t.trim()));
    if (!likelyTitle && allSpanTexts.length > 0) {
      // fallback: use the first non-empty span
      likelyTitle = allSpanTexts.find(t => t.trim() !== '');
    }
    // Debug log all span texts
    console.log('[extractListingData] Fallback: All span texts:', allSpanTexts);
    return likelyTitle || null;
  });

  // Extract price with debug logging
  let price = await item.$eval('[data-testid="listing_price"]', el => el.innerText).catch(async () => {
    const spans = await item.$$('span');
    let text = spans[1] ? await spans[1].evaluate(el => el.innerText) : null;
    console.log('[extractListingData] Fallback: Price span:', text);
    return text;
  });

  // Extract location robustly, with debug logging
  let location = await item.$eval('[data-testid="reverse_geocode"]', el => el.innerText).catch(async () => {
    const locSpans = await item.$$('span');
    let lastValidSpan = '';
    
    for (const span of locSpans) {
      const text = await span.evaluate(el => el.innerText).catch(() => null);
      if (!text) continue;
      
      const cleanText = text.trim();
      
      // Skip empty or price-like text
      if (!cleanText || /^PHP\s?\d|^\d/i.test(cleanText)) continue;
      
      // If text contains comma (city, region pattern), use it immediately
      if (/,/.test(cleanText)) {
        return cleanText;
      }
      
      // Otherwise store as potential fallback if not title
      if (cleanText !== title) {
        lastValidSpan = cleanText;
      }
    }
    
    return lastValidSpan || '';
  });

  // If location still empty, try to extract from JSON data
  if (!location || typeof location !== 'string' || location.trim() === '') {
    try {
      const jsonData = await item.$eval('*', el => {
        // Look for any element with data-bt or similar attribute containing location data
        const element = el.closest('[data-bt]') || el.closest('[data-store*="location"]');
        if (element) {
          try {
            const data = JSON.parse(element.getAttribute('data-bt') || element.getAttribute('data-store') || '{}');
            if (data.location?.reverse_geocode) {
              return data.location.reverse_geocode;
            }
            return data;
          } catch (e) {
            return null;
          }
        }
        return null;
      });

      if (jsonData?.city_page?.display_name) {
        location = jsonData.city_page.display_name;
      } else if (jsonData?.city && jsonData?.state) {
        location = `${jsonData.city}, ${jsonData.state}`;
      } else if (jsonData?.city) {
        location = jsonData.city;
      } else if (jsonData?.state) {
        location = jsonData.state;
      }
    } catch (e) {
      console.log('[extractListingData] Error extracting JSON location:', e);
    }
  }

  // Debug log extracted values
  console.log('[extractListingData] Extracted:', { link, title, price, location });
  return { link, title, price, location };
}

module.exports = { extractListingData };
