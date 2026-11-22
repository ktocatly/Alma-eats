// "Try next": ranks foods Alma hasn't had yet.
// Favors nutrients she's had little of (iron and zinc most, then omega-3s, protein and fat),
// leans savory/green over sweet without excluding fruit, balances food groups,
// and never suggests a new allergen within 3 days of the last new one.
(function (g) {
  const NUTRIENT = { I: "iron", Z: "zinc", O: "omega-3s", P: "protein", F: "healthy fats", C: "vitamin C", A: "vitamin A", K: "calcium", B: "fiber" };
  const WEIGHT = { I: 1.7, Z: 1.5, O: 1.3, P: 1.2, F: 1.2, C: 0.9, A: 0.9, K: 0.9, B: 0.7 };

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 10000) / 10000;
  }
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // foods: [{id, name, cat, allergen}], logs: {id: [YYYY-MM-DD]}, meta: {id: [nutrients, flavor, tip]}
  function rank(foods, logs, meta, today, skip = []) {
    const has = (f) => (logs[f.id] || []).length > 0;
    const tried = foods.filter(has);
    const metaOf = (f) => meta[f.id] || ["", "n", ""];

    const coverage = {};
    for (const k of Object.keys(NUTRIENT)) coverage[k] = 0;
    const catCount = {};
    let sweet = 0;
    for (const f of tried) {
      const [nut, flavor] = metaOf(f);
      for (const n of nut) coverage[n]++;
      catCount[f.cat] = (catCount[f.cat] || 0) + 1;
      if (flavor === "w") sweet++;
    }
    const sweetShare = tried.length ? sweet / tried.length : 0;
    const allergensIn = tried.filter((f) => f.allergen).length;
    const lastNewAllergen = tried
      .filter((f) => f.allergen)
      .map((f) => logs[f.id][0])
      .sort()
      .at(-1);
    const allergenTooSoon = lastNewAllergen && daysBetween(lastNewAllergen, today) < 3;

    const out = [];
    for (const f of foods) {
      if (has(f) || skip.includes(f.id)) continue;
      if (f.allergen && allergenTooSoon) continue;
      const [nut, flavor, tip] = metaOf(f);

      let score = 1;
      const gains = [...nut].map((n) => ({ n, v: WEIGHT[n] / (1 + coverage[n]) })).sort((a, b) => b.v - a.v);
      for (const x of gains) score += x.v;

      // Lean savory, not strictly: fruit is fine while it is a small share of what she has had
      if (flavor === "w") score *= sweetShare < 0.15 ? 1 : sweetShare < 0.3 ? 0.7 : 0.45;
      else if (flavor === "g") score *= 1.2;
      else if (flavor === "s") score *= 1.1;

      if (!f.allergen) score *= 1 + 0.35 / (1 + (catCount[f.cat] || 0)); // balance food groups
      if (f.cat === "extras") score *= 0.55; // seasonings and oils are add-ons, not first foods
      // Allergens show up now and then (more while few are in), never back to back
      if (f.allergen) score *= allergensIn < 6 ? 1 : 0.75;

      score *= 0.7 + 0.6 * hash(today + f.id); // rotates day to day, steady within a day

      // Reason: the nutrients that fill the biggest gaps, plus a short note
      const top = gains.slice(0, 2).map((x) => NUTRIENT[x.n]);
      let note;
      if (f.allergen) note = "new allergen, offer it on its own";
      else if (gains.length && coverage[gains[0].n] === 0) note = "fills a gap";
      else if (flavor === "g") note = "builds a taste for greens";
      else if (flavor === "s" && sweetShare > 0.3) note = "savory balance";
      else note = "a new taste";
      const reason = top.length ? `${cap(top.join(" & "))} · ${note}` : cap(note);

      out.push({ food: f, score, reason, tip });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  g.AlmaSuggest = { rank };
})(typeof globalThis !== "undefined" ? globalThis : self);
