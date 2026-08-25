// ai.js — sends a card photo (+ optional listing text) to Claude for identification.
// Uses the user's own Anthropic API key, stored locally, sent directly from the browser.
// That means the key is visible to anyone with access to this device/browser — fine for a
// personal single-user install, NOT something to share or deploy publicly with your key baked in.

const AI_MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You are a football (soccer) trading card identification assistant specialising in Crystal Palace FC cards, mainly from Topps and Panini.

You will be shown a photo of a card and possibly a listing title/description. Identify the card as precisely as you can from what is visible. You will often be uncertain — that is fine and expected. Never guess confidently when you are not; lower confidence is more useful than false precision.

Respond with ONLY a single JSON object, no markdown fences, no commentary, matching exactly this shape:

{
  "player": string or null,
  "club": string or null,
  "season": string or null,
  "manufacturer": string or null,
  "product": string or null,
  "cardType": string or null,
  "cardNumber": string or null,
  "variant": string or null,
  "numbered": string or null,
  "autograph": boolean or null,
  "relic": boolean or null,
  "confidence": number (0-100, your overall confidence in this identification),
  "notes": string (anything uncertain, ambiguous, or worth the collector double-checking; empty string if none)
}

Rules:
- If you cannot make out a field at all, use null for it rather than guessing.
- "numbered" should capture serial numbering exactly as shown, e.g. "07/25" or "1/1", or null if not numbered.
- confidence should reflect the whole identification, not just the player name.
- Keep "notes" short and specific (e.g. "Set could be Chrome or Chrome Sapphire — edge of card is cropped").`;

const AI = {
  async recognizeCard({ apiKey, imageBase64, mediaType, listingText }) {
    if (!apiKey) {
      throw new Error("No API key set. Add your Anthropic API key in Settings first.");
    }

    const userContent = [
      {
        type: "image",
        source: { type: "base64", media_type: mediaType, data: imageBase64 }
      },
      {
        type: "text",
        text: listingText
          ? `Listing title/description for context:\n${listingText}`
          : "No listing text was provided — identify from the image alone."
      }
    ];

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }]
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`API error (${res.status}): ${errText || res.statusText}`);
    }

    const data = await res.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) throw new Error("No text response from the model.");

    let cleaned = textBlock.text.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new Error("Couldn't parse the AI's response as JSON. Raw response: " + cleaned.slice(0, 300));
    }
    return parsed;
  }
};
