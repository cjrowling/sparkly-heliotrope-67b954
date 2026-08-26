// ebay.js — calls our own Netlify serverless function (netlify/functions/ebay-search.js),
// which does the real eBay OAuth + Browse API request server-side using EBAY_CLIENT_ID /
// EBAY_CLIENT_SECRET from Netlify's environment. Those credentials never reach this file
// or the browser — this is the only thing the client ever calls.
//
// Vinted and Depop have no public search API, so those stay as pre-filled search links
// you tap through to rather than pretending to search them.

const Ebay = {
  async search(query, { limit = 25, sort = "newlyListed" } = {}) {
    const url = `/.netlify/functions/ebay-search?q=${encodeURIComponent(query)}&sort=${encodeURIComponent(sort)}&limit=${limit}`;

    let res;
    try {
      res = await fetch(url);
    } catch (err) {
      throw new Error("Couldn't reach the search service. Check your connection and try again.");
    }

    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw new Error(`Search failed (${res.status}). The server didn't return a valid response.`);
    }

    if (!res.ok) {
      throw new Error(data.error || `Search failed (${res.status}).`);
    }

    return (data.results || []).map((item) => ({
      id: item.id,
      title: item.title,
      price: item.price,
      currency: item.currency,
      imageUrl: item.imageUrl,
      itemWebUrl: item.itemWebUrl,
      condition: item.condition,
      seller: item.seller,
      buyingOptions: item.buyingOptions || []
    }));
  },

  vintedSearchUrl(query) {
    return `https://www.vinted.co.uk/catalog?search_text=${encodeURIComponent(query)}`;
  },

  depopSearchUrl(query) {
    return `https://www.depop.com/search/?q=${encodeURIComponent(query)}`;
  },

  ebayWebSearchUrl(query) {
    return `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(query)}&_sop=10`;
  }
};
