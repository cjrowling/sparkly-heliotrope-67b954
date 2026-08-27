// scout-brain.js — Scout's matching and discovery brain.
//
// Scout works in layers:
// 1. Match against the user's own cards.
// 2. Build useful search phrases from the card's metadata.
// 3. Prepare progressively broader searches for marketplaces/databases.
//
// The actual eBay API call remains in ebay.js / the Netlify function.
// This file decides WHAT Scout should be looking for.

const ScoutBrain = {

  TIERS: [
    {
      id: "same-release-same-type",
      label: "Same release · same card type",
      description:
        "Other Palace cards from the same release with the same card type."
    },

    {
      id: "same-release-other-player",
      label: "Same release · other Palace players",
      description:
        "Other Palace players from the same release and card type."
    },

    {
      id: "same-release-any-type",
      label: "Same release · other Palace cards",
      description:
        "Other Palace cards from the same release, including different card types."
    },

    {
      id: "same-release-rare",
      label: "Same release · rare cards",
      description:
        "Rare parallels, numbered cards, autographs and relics from the release."
    },

    {
      id: "same-manufacturer-year",
      label: "Same manufacturer · same season",
      description:
        "Palace cards from the same manufacturer and season across different releases."
    },

    {
      id: "broader",
      label: "Broader related cards",
      description:
        "Related Palace cards using progressively broader searches."
    }
  ],


  // ----------------------------------------------------------
  // NORMALISATION
  // ----------------------------------------------------------

  _norm(value) {
    return (value ?? "")
      .toString()
      .trim()
      .toLowerCase();
  },


  _clean(value) {
    return (value ?? "")
      .toString()
      .trim();
  },


  // ----------------------------------------------------------
  // CARD METADATA
  // ----------------------------------------------------------

  matchFields(card) {

    if (!card) return [];

    return [
      {
        label: "Player",
        value: card.player
      },

      {
        label: "Manufacturer",
        value: card.manufacturer
      },

      {
        label: "Set / release",
        value: card.product
      },

      {
        label: "Season",
        value: card.season
      },

      {
        label: "Card type",
        value: card.cardType
      },

      {
        label: "Card number",
        value: card.cardNumber
      },

      {
        label: "Variant / colour",
        value: card.variant
      },

      {
        label: "Numbered",
        value: card.numbered
      },

      {
        label: "Autograph",
        value:
          card.autograph
            ? "Yes"
            : null
      },

      {
        label: "Relic",
        value:
          card.relic
            ? "Yes"
            : null
      }
    ].filter(
      (field) =>
        field.value !== null &&
        field.value !== undefined &&
        field.value !== ""
    );
  },


  // ----------------------------------------------------------
  // LOCAL COLLECTION MATCHING
  // ----------------------------------------------------------

  _matchSameReleaseSameType(
    sourceCard,
    pool
  ) {

    if (
      !sourceCard?.product ||
      !sourceCard?.season ||
      !sourceCard?.cardType
    ) {
      return [];
    }

    const product =
      this._norm(sourceCard.product);

    const season =
      this._norm(sourceCard.season);

    const cardType =
      this._norm(sourceCard.cardType);

    return pool.filter((card) => {

      if (
        sourceCard.id &&
        card.id === sourceCard.id
      ) {
        return false;
      }

      return (
        this._norm(card.product) === product &&
        this._norm(card.season) === season &&
        this._norm(card.cardType) === cardType
      );
    });
  },


  _matchSameReleaseOtherPlayer(
    sourceCard,
    pool
  ) {

    if (
      !sourceCard?.product ||
      !sourceCard?.season ||
      !sourceCard?.cardType
    ) {
      return [];
    }

    const product =
      this._norm(sourceCard.product);

    const season =
      this._norm(sourceCard.season);

    const cardType =
      this._norm(sourceCard.cardType);

    const player =
      this._norm(sourceCard.player);

    return pool.filter((card) => {

      if (
        sourceCard.id &&
        card.id === sourceCard.id
      ) {
        return false;
      }

      return (
        this._norm(card.product) === product &&
        this._norm(card.season) === season &&
        this._norm(card.cardType) === cardType &&
        this._norm(card.player) !== player
      );
    });
  },


  _matchSameRelease(
    sourceCard,
    pool
  ) {

    if (
      !sourceCard?.product ||
      !sourceCard?.season
    ) {
      return [];
    }

    const product =
      this._norm(sourceCard.product);

    const season =
      this._norm(sourceCard.season);

    return pool.filter((card) => {

      if (
        sourceCard.id &&
        card.id === sourceCard.id
      ) {
        return false;
      }

      return (
        this._norm(card.product) === product &&
        this._norm(card.season) === season
      );
    });
  },


  _matchRare(
    sourceCard,
    pool
  ) {

    const sameRelease =
      this._matchSameRelease(
        sourceCard,
        pool
      );

    return sameRelease.filter(
      (card) =>
        !!(
          card.autograph ||
          card.relic ||
          card.numbered ||
          card.variant
        )
    );
  },


  _matchSameManufacturerYear(
    sourceCard,
    pool
  ) {

    if (
      !sourceCard?.manufacturer ||
      !sourceCard?.season
    ) {
      return [];
    }

    const manufacturer =
      this._norm(
        sourceCard.manufacturer
      );

    const season =
      this._norm(
        sourceCard.season
      );

    return pool.filter((card) => {

      if (
        sourceCard.id &&
        card.id === sourceCard.id
      ) {
        return false;
      }

      return (
        this._norm(card.manufacturer) === manufacturer &&
        this._norm(card.season) === season
      );
    });
  },


  // ----------------------------------------------------------
  // MARKETPLACE SEARCH PHRASES
  // ----------------------------------------------------------

  buildSearchQueries(card) {

    if (!card) {
      return [];
    }

    const player =
      this._clean(card.player);

    const product =
      this._clean(card.product);

    const manufacturer =
      this._clean(card.manufacturer);

    const season =
      this._clean(card.season);

    const cardType =
      this._clean(card.cardType);

    const variant =
      this._clean(card.variant);

    const numbered =
      this._clean(card.numbered);

    const queries = [];


    // Most precise search.
    const precise = [
      "Crystal Palace",
      player,
      product,
      cardType,
      variant,
      numbered
    ].filter(Boolean).join(" ");

    if (precise) {
      queries.push({
        tierId: "same-release-same-type",
        query: precise
      });
    }


    // Same release, different player.
    const releaseQuery = [
      "Crystal Palace",
      product,
      season,
      cardType
    ].filter(Boolean).join(" ");

    if (
      releaseQuery &&
      releaseQuery !== precise
    ) {
      queries.push({
        tierId: "same-release-other-player",
        query: releaseQuery
      });
    }


    // Same release, broader.
    const broadReleaseQuery = [
      "Crystal Palace",
      product,
      season
    ].filter(Boolean).join(" ");

    if (
      broadReleaseQuery &&
      !queries.some(
        (q) =>
          q.query === broadReleaseQuery
      )
    ) {
      queries.push({
        tierId: "same-release-any-type",
        query: broadReleaseQuery
      });
    }


    // Manufacturer + season.
    const manufacturerQuery = [
      "Crystal Palace",
      manufacturer,
      season
    ].filter(Boolean).join(" ");

    if (
      manufacturerQuery &&
      !queries.some(
        (q) =>
          q.query === manufacturerQuery
      )
    ) {
      queries.push({
        tierId: "same-manufacturer-year",
        query: manufacturerQuery
      });
    }


    // Player fallback.
    const playerQuery = [
      "Crystal Palace",
      player,
      season
    ].filter(Boolean).join(" ");

    if (
      playerQuery &&
      !queries.some(
        (q) =>
          q.query === playerQuery
      )
    ) {
      queries.push({
        tierId: "broader",
        query: playerQuery
      });
    }


    return queries;
  },


  // ----------------------------------------------------------
  // DATABASE / CHECKLIST SEARCH PHRASES
  // ----------------------------------------------------------

  buildReferenceQueries(card) {

    if (!card) {
      return [];
    }

    const player =
      this._clean(card.player);

    const product =
      this._clean(card.product);

    const manufacturer =
      this._clean(card.manufacturer);

    const season =
      this._clean(card.season);

    const cardType =
      this._clean(card.cardType);

    return [
      [
        player,
        manufacturer,
        product,
        season,
        cardType
      ].filter(Boolean).join(" "),

      [
        player,
        product,
        season
      ].filter(Boolean).join(" "),

      [
        "Crystal Palace",
        product,
        season
      ].filter(Boolean).join(" ")
    ].filter(Boolean);
  },


  // ----------------------------------------------------------
  // SIMILARITY
  // ----------------------------------------------------------

  scoreCard(
    source,
    candidate
  ) {

    if (!source || !candidate) {
      return 0;
    }

    let score = 0;

    if (
      this._norm(source.product) &&
      this._norm(source.product) ===
        this._norm(candidate.product)
    ) {
      score += 40;
    }

    if (
      this._norm(source.season) &&
      this._norm(source.season) ===
        this._norm(candidate.season)
    ) {
      score += 20;
    }

    if (
      this._norm(source.cardType) &&
      this._norm(source.cardType) ===
        this._norm(candidate.cardType)
    ) {
      score += 20;
    }

    if (
      this._norm(source.manufacturer) &&
      this._norm(source.manufacturer) ===
        this._norm(candidate.manufacturer)
    ) {
      score += 10;
    }

    if (
      this._norm(source.variant) &&
      this._norm(source.variant) ===
        this._norm(candidate.variant)
    ) {
      score += 5;
    }

    if (
      !!source.autograph ===
      !!candidate.autograph
    ) {
      score += 2;
    }

    if (
      !!source.relic ===
      !!candidate.relic
    ) {
      score += 2;
    }

    if (
      this._norm(source.player) &&
      this._norm(source.player) ===
        this._norm(candidate.player)
    ) {
      score += 1;
    }

    return score;
  },


  rankCards(
    source,
    cards
  ) {

    return [...cards]
      .map((card) => ({
        card,
        score:
          this.scoreCard(
            source,
            card
          )
      }))
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .map(
        (entry) =>
          entry.card
      );
  },


  // ----------------------------------------------------------
  // MAIN LOCAL MATCHING ENGINE
  // ----------------------------------------------------------

  async findSimilar(
    sourceCard,
    pool = []
  ) {

    if (!sourceCard) {
      return this.TIERS.map(
        (tier) => ({
          tierId: tier.id,
          cards: []
        })
      );
    }

    const tier1 =
      this._matchSameReleaseSameType(
        sourceCard,
        pool
      );

    const tier2 =
      this._matchSameReleaseOtherPlayer(
        sourceCard,
        pool
      );

    const tier3 =
      this._matchSameRelease(
        sourceCard,
        pool
      );

    const tier4 =
      this._matchRare(
        sourceCard,
        pool
      );

    const tier5 =
      this._matchSameManufacturerYear(
        sourceCard,
        pool
      );

    return [
      {
        tierId:
          "same-release-same-type",
        cards:
          this.rankCards(
            sourceCard,
            tier1
          )
      },

      {
        tierId:
          "same-release-other-player",
        cards:
          this.rankCards(
            sourceCard,
            tier2
          )
      },

      {
        tierId:
          "same-release-any-type",
        cards:
          this.rankCards(
            sourceCard,
            tier3
          )
      },

      {
        tierId:
          "same-release-rare",
        cards:
          this.rankCards(
            sourceCard,
            tier4
          )
      },

      {
        tierId:
          "same-manufacturer-year",
        cards:
          this.rankCards(
            sourceCard,
            tier5
          )
      },

      {
        tierId:
          "broader",
        cards: []
      }
    ];
  },


  // ----------------------------------------------------------
  // SCOUT SUMMARY
  // ----------------------------------------------------------

  describeCard(card) {

    if (!card) {
      return "";
    }

    const parts = [
      card.player,
      card.season,
      card.manufacturer,
      card.product,
      card.cardType,
      card.variant,
      card.numbered
    ].filter(Boolean);

    return parts.join(" · ");
  },


  getDiscoveryPlan(card) {

    return {
      source: card || null,

      localMatching: {
        enabled: true,
        pool: "collection + wishlist"
      },

      marketplaceSearches:
        this.buildSearchQueries(card),

      referenceSearches:
        this.buildReferenceQueries(card)
    };
  }

};
