// ebay.js — frontend client for the Netlify eBay search function.
// eBay Client ID and Secret stay safely in Netlify environment variables.

const Ebay = {

  async search(query, { limit = 25, sort = "newlyListed" } = {}) {
    query = (query || "").trim();

    if (!query) {
      throw new Error("Enter something to search for.");
    }

    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      sort
    });

    const res = await fetch(`/.netlify/functions/ebay-search?${params.toString()}`);

    let data = {};
    try {
      data = await res.json();
    } catch {
      throw new Error(`eBay search returned an invalid response (${res.status}).`);
    }

    if (!res.ok) {
      throw new Error(data.error || `eBay search failed (${res.status}).`);
    }

    return (data.results || []).map((item) => ({
      id: item.id,
      title: item.title,
      price: item.price && item.currency
        ? `${item.currency} ${item.price}`
        : item.price || null,
      imageUrl: item.imageUrl || null,
      itemWebUrl: item.itemWebUrl || null,
      condition: item.condition || null,
      seller: item.seller || null,
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
