// ebay.js — frontend eBay search client.
// eBay credentials stay safely inside the Netlify server function.
// The browser only sends the search query.

const Ebay = {

  async search(query, { limit = 25, sort = "newlyListed" } = {}) {
    query = (query || "").trim();

    if (!query) {
      throw new Error("Enter a search term first.");
    }

    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      sort
    });

    const res = await fetch(
      `/.netlify/functions/ebay-search?${params.toString()}`
    );

    let data = {};

    try {
      data = await res.json();
    } catch (_) {
      throw new Error(`eBay server returned an invalid response (${res.status}).`);
    }

    if (!res.ok) {
      throw new Error(
        data.error || `eBay search failed (${res.status}).`
      );
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
