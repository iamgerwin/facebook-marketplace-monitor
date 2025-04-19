// DOM extraction logic for Facebook Marketplace listings
// Expects Playwright element handles
async function extractListingData(item) {
  const link = await item.evaluate(a => a.href);

  // Extract title with multiple fallback strategies
  let title = await item.$eval('[data-testid="marketplace_listing_title"]', el => el.innerText).catch(async () => {
    // Fallback 1: Try link text if it looks like a product
    const linkText = await item.$eval('a[href*="marketplace/item"]', el => el.innerText.trim()).catch(() => '');
    if (linkText && !/^PHP\s?\d|^\d/i.test(linkText)) {
      return linkText;
    }
    
    // Fallback 2: Find first span with product info
    const spans = await item.$$('span');
    for (const span of spans) {
      const text = await span.evaluate(el => el.innerText.trim()).catch(() => '');
      if (text && !/^PHP\s?\d|^\d/i.test(text)) {
        return text;
      }
    }
    
    return linkText || ''; // Final fallback to link text if nothing else
  });

  // Extract price with debug logging
  let price = await item.$eval('[data-testid="listing_price"]', el => el.innerText).catch(async () => {
    const spans = await item.$$('span');
    let text = spans[1] ? await spans[1].evaluate(el => el.innerText) : null;
    // console.log('[extractListingData] Fallback: Price span:', text);
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
      
      // Skip empty, price-like, or title-like text
      if (!cleanText || 
          /^PHP\s?\d|^\d/i.test(cleanText) ||
          /MacBook|Macbook|Air|Pro|M\d|inch|RAM|SSD|GB|TB/i.test(cleanText)) continue;
      
      // If text contains comma (city, region pattern), use it immediately
      if (/,/.test(cleanText)) {
        return cleanText;
      }
      
      // Only store as fallback if it looks like a location (contains city/region keywords)
      if (/Manila|Quezon|Makati|Taguig|Pasig|NCR|PH-\d+/i.test(cleanText)) {
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
  // console.log('[extractListingData] Extracted:', { link, title, price, location });
  return { link, title, price, location };
}

module.exports = { extractListingData };
