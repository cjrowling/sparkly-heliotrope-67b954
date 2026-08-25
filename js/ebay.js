// ebay.js — live search against eBay's official Browse API (free tier).
// Needs an eBay developer app (Client ID + Client Secret from developer.ebay.com — free,
// takes a few minutes to set up). The client-credentials token exchange happens right here
// in the browser, which means the secret is visible to anyone with access to this device —
// same personal-use caveat as the Anthropic key. Fine for your own installed app.
//
// Vinted (and most other resale sites) have no public search API and block scraping in
// their terms, so instead of pretending to search them, we generate a pre-filled search
// link you can tap through to.

const EBAY_MARKETPLACE = "EBAY_GB";

const Ebay = {
  async getToken(clientId, clientSecret) {
    const cachedToken = await DB.getSetting("ebayToken");
    const cachedExpiry = await DB.getSetting("ebayTokenExpiry");
    if (cachedToken && cachedExpiry && Date.now() < Number(cachedExpiry) - 60000) {
      return cachedToken;
    }

    const basic = btoa(`${clientId}:${clientSecret}`);
    const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${basic}`
      },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope"
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`eBay auth failed (${res.status}). Check your Client ID/Secret in Settings. ${t.slice(0, 150)}`);
    }
    const data = await res.json();
    await DB.setSetting("ebayToken", data.access_token);
    await DB.setSetting("ebayTokenExpiry", String(Date.now() + data.expires_in * 1000));
    return data.access_token;
  },

  async search(query, { limit = 25, sort = "newlyListed" } = {}) {
    const clientId = await DB.getSetting("ebayClientId");
    const clientSecret = await DB.getSetting("ebayClientSecret");
    if (!clientId || !clientSecret) {
      throw new Error("Add your eBay Client ID and Client Secret in Settings to search eBay live.");
    }

    const token = await this.getToken(clientId, clientSecret);
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&sort=${sort}&limit=${limit}`;

    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE
      }
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`eBay search failed (${res.status}). ${t.slice(0, 150)}`);
    }
    const data = await res.json();
    return (data.itemSummaries || []).map((item) => ({
      id: item.itemId,
      title: item.title,
      price: item.price ? `${item.price.currency} ${item.price.value}` : null,
      imageUrl: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || null,
      itemWebUrl: item.itemWebUrl,
      condition: item.condition || null,
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
