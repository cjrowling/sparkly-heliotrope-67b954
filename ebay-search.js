// netlify/functions/ebay-search.js
//
// Server-side proxy for eBay's Browse API. This is the ONLY place EBAY_CLIENT_ID and
// EBAY_CLIENT_SECRET are read — both stay in Netlify's environment and are never sent
// to the browser. The frontend (js/ebay.js) calls this function with a plain search
// query and gets back plain listing data.
//
// Flow: read credentials from process.env -> get an OAuth app token via the client
// credentials grant -> call the Browse API item_summary/search endpoint -> return a
// trimmed-down JSON shape the app actually uses.

const EBAY_MARKETPLACE = "EBAY_GB"; // UK marketplace, per the club this app is for
const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";

// Cached for the lifetime of a warm function instance only — saves a token request on
// back-to-back searches handled by the same instance. Not persisted anywhere; a cold
// start just fetches a fresh token, which is fine.
let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAppToken(clientId, clientSecret) {
  if (cachedToken && Date.now() < cachedTokenExpiry - 60000) {
    return cachedToken;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${basic}`
      },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope"
    });
  } catch (err) {
    const wrapped = new Error(`Couldn't reach eBay's auth server: ${err.message || err}`);
    wrapped.stage = "oauth-network";
    throw wrapped;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`eBay authentication failed (${res.status}). ${text.slice(0, 300)}`);
    err.stage = "oauth";
    throw err;
  }

  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

exports.handler = async (event) => {
  const headers = {
    "content-type": "application/json",
    "cache-control": "no-store"
  };

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "eBay isn't configured on the server (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET missing from Netlify environment variables)."
      })
    };
  }

  const params = event.queryStringParameters || {};
  const query = (params.q || "").trim();
  if (!query) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing search query (?q=...)." }) };
  }

  const limit = Math.max(1, Math.min(Number(params.limit) || 25, 50));
  const sort = params.sort || "newlyListed";

  let token;
  try {
    token = await getAppToken(clientId, clientSecret);
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: err.message || "eBay authentication failed." })
    };
  }

  let ebayRes;
  try {
    const searchUrl = `${SEARCH_URL}?q=${encodeURIComponent(query)}&sort=${encodeURIComponent(sort)}&limit=${limit}`;
    ebayRes = await fetch(searchUrl, {
      headers: {
        authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE
      }
    });
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: `Couldn't reach eBay's search API: ${err.message || err}` })
    };
  }

  if (!ebayRes.ok) {
    const text = await ebayRes.text().catch(() => "");
    return {
      statusCode: ebayRes.status,
      headers,
      body: JSON.stringify({ error: `eBay search failed (${ebayRes.status}). ${text.slice(0, 300)}` })
    };
  }

  let data;
  try {
    data = await ebayRes.json();
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: "eBay returned a response that couldn't be parsed." })
    };
  }

  const results = (data.itemSummaries || []).map((item) => ({
    id: item.itemId,
    title: item.title,
    price: item.price ? item.price.value : null,
    currency: item.price ? item.price.currency : null,
    imageUrl: (item.image && item.image.imageUrl) || (item.thumbnailImages && item.thumbnailImages[0] && item.thumbnailImages[0].imageUrl) || null,
    itemWebUrl: item.itemWebUrl || null,
    condition: item.condition || null,
    seller: (item.seller && item.seller.username) || null,
    buyingOptions: item.buyingOptions || []
  }));

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ results, total: data.total ?? results.length })
  };
};
