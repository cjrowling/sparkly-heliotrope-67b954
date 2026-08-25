// scout-brain.js — the future discovery/matching engine for Scout.
//
// Tier 1 (same release + season + card type, matched against the user's own
// collection/wishlist) is implemented for real. Every other tier is still structure
// only — they return no cards until built. This file exists so that work has a clean,
// obvious home and a fixed interface for the UI to call.
//
// Data contract — a "source card" is any object from the cards store (see js/db.js).
// Every card, collection or wishlist, already carries the metadata the future engine
// needs: player, club, season, manufacturer, product, cardType, cardNumber, variant,
// numbered, autograph, relic, notes, status. No schema changes were needed for this.
//
// Future tiers will compare a source card's metadata against three pools:
//   1. The user's own collection/wishlist — available now via DB.allCards().
//   2. External reference sources (Fanter and future checklist databases) — not yet
//      queryable programmatically, only linkable.
//   3. Live marketplace results (eBay Browse API, Vinted/Depop deep links) — eBay is
//      queryable by free-text today; attribute-driven queries (e.g. build a search
//      string from product+season+cardType) are the natural next step.

const ScoutBrain = {
  TIERS: [
    {
      id: "same-release-same-type",
      label: "Same set/release — Palace, same card type",
      description: "Other Palace cards from the exact same release matching this card's type (e.g. other autos from the same set)."
    },
    {
      id: "same-release-other-player",
      label: "Same set/release — other Palace player, same type",
      description: "Same release, same card type, a different Palace player."
    },
    {
      id: "same-release-any-type",
      label: "Same set/release — other Palace cards",
      description: "Any other Palace card from this exact release, regardless of type."
    },
    {
      id: "same-release-rare",
      label: "Same set/release — other rare Palace cards",
      description: "Rare parallels, relics or numbered cards from this release."
    },
    {
      id: "same-manufacturer-year",
      label: "Same manufacturer + year — Palace cards",
      description: "Palace cards from the same manufacturer and season, different release."
    },
    {
      id: "broader",
      label: "Broader related cards",
      description: "Progressively less similar matches — same competition, similar rarity tier, or same manufacturer across other years."
    }
  ],

  // Fields the engine will read from a source card. Exposed here (rather than left
  // implicit) so the UI can show what it's "matching on" before real results exist.
  matchFields(card) {
    return [
      { label: "Player", value: card?.player },
      { label: "Manufacturer", value: card?.manufacturer },
      { label: "Set/release", value: card?.product },
      { label: "Season", value: card?.season },
      { label: "Card type", value: card?.cardType },
      { label: "Variant/colour", value: card?.variant },
      { label: "Numbered", value: card?.numbered },
      { label: "Autograph", value: card?.autograph ? "Yes" : null },
      { label: "Relic", value: card?.relic ? "Yes" : null }
    ].filter((f) => f.value);
  },

  // Normalises a field for comparison: trimmed, case-insensitive. Still an exact
  // match, just not sensitive to stray whitespace or casing typed into the form.
  _norm(v) {
    return (v ?? "").toString().trim().toLowerCase();
  },

  // Tier 1: same set/release + same season + same card type, from the user's own
  // collection and wishlist. Requires all three fields to be present on the source
  // card — if any are missing there's nothing reliable to match on, so it returns
  // no results rather than guessing.
  _matchSameReleaseSameType(sourceCard, pool) {
    if (!sourceCard?.product || !sourceCard?.season || !sourceCard?.cardType) return [];
    const product = this._norm(sourceCard.product);
    const season = this._norm(sourceCard.season);
    const cardType = this._norm(sourceCard.cardType);
    return pool.filter((c) =>
      c.id !== sourceCard.id &&
      this._norm(c.product) === product &&
      this._norm(c.season) === season &&
      this._norm(c.cardType) === cardType
    );
  },

  // Returns [{ tierId, cards: [] }, ...] — one entry per tier, in similarity order.
  // Only tier 1 is implemented so far, against the local collection/wishlist pool;
  // the rest stay empty until built. `pool` defaults to [] so callers must pass
  // DB.allCards() (or similar) explicitly — keeps this function easy to test.
  async findSimilar(sourceCard, pool = []) {
    const tier1Matches = this._matchSameReleaseSameType(sourceCard, pool);
    return this.TIERS.map((tier) => ({
      tierId: tier.id,
      cards: tier.id === "same-release-same-type" ? tier1Matches : []
    }));
  }
};
