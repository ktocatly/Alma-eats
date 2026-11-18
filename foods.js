// The starter food list. Each entry: [name, emoji]
// Allergens are kept in their own group so they can be tracked for weekly rotation.
window.ALMA_CATEGORIES = [
  { id: "allergens", label: "Allergens", short: "Allergens" },
  { id: "veg", label: "Vegetables", short: "Veggies" },
  { id: "fruit", label: "Fruits", short: "Fruits" },
  { id: "grains", label: "Grains & starches", short: "Grains" },
  { id: "protein", label: "Proteins", short: "Proteins" },
  { id: "extras", label: "Herbs, spices & extras", short: "Extras" },
];

window.ALMA_FOODS = (() => {
  const groups = {
    allergens: [
      ["Peanut", "🥜"], ["Egg", "🥚"], ["Cow's milk (yogurt, cheese)", "🥛"],
      ["Wheat", "🌾"], ["Soy", "🫘"], ["Sesame (tahini)", "🫙"],
      ["Fish", "🐟"], ["Shellfish (shrimp)", "🦐"], ["Almond", "🌰"],
      ["Cashew", "🌰"], ["Walnut", "🌰"], ["Hazelnut", "🌰"],
      ["Pistachio", "🌰"], ["Pecan", "🌰"],
    ],
    veg: [
      ["Avocado", "🥑"], ["Sweet potato", "🍠"], ["Carrot", "🥕"],
      ["Broccoli", "🥦"], ["Peas", "🫛"], ["Green beans", "🫛"],
      ["Butternut squash", "🎃"], ["Zucchini", "🥒"], ["Cauliflower", "🥦"],
      ["Spinach", "🥬"], ["Kale", "🥬"], ["Beets", "🟣"],
      ["Bell pepper", "🫑"], ["Tomato", "🍅"], ["Cucumber", "🥒"],
      ["Asparagus", "🌱"], ["Corn", "🌽"], ["Mushroom", "🍄"],
      ["Eggplant", "🍆"], ["Cabbage", "🥬"], ["Onion", "🧅"],
      ["Potato", "🥔"], ["Parsnip", "🥕"], ["Pumpkin", "🎃"],
    ],
    fruit: [
      ["Banana", "🍌"], ["Apple", "🍎"], ["Pear", "🍐"],
      ["Mango", "🥭"], ["Blueberries", "🫐"], ["Strawberries", "🍓"],
      ["Raspberries", "🍓"], ["Peach", "🍑"], ["Plum", "🫐"],
      ["Watermelon", "🍉"], ["Cantaloupe", "🍈"], ["Kiwi", "🥝"],
      ["Orange", "🍊"], ["Pineapple", "🍍"], ["Papaya", "🥭"],
      ["Cherries", "🍒"], ["Grapes (quartered)", "🍇"], ["Prunes", "🫐"],
      ["Apricot", "🍑"], ["Figs", "🟣"], ["Dates", "🟤"], ["Coconut", "🥥"],
    ],
    grains: [
      ["Oatmeal", "🥣"], ["Rice", "🍚"], ["Quinoa", "🌾"],
      ["Barley", "🌾"], ["Millet", "🌾"], ["Buckwheat", "🌾"],
      ["Corn / polenta", "🌽"], ["Pasta", "🍝"], ["Bread / toast", "🍞"],
      ["Rice noodles", "🍜"], ["Couscous", "🥣"],
    ],
    protein: [
      ["Chicken", "🍗"], ["Beef", "🥩"], ["Turkey", "🦃"],
      ["Pork", "🥓"], ["Lamb", "🍖"], ["Salmon", "🐟"],
      ["Sardines", "🐟"], ["Lentils", "🫘"], ["Chickpeas / hummus", "🧆"],
      ["Black beans", "🫘"], ["Tofu", "🧈"], ["Liver", "🥩"],
    ],
    extras: [
      ["Olive oil", "🫒"], ["Butter", "🧈"], ["Cinnamon", "🪵"],
      ["Garlic", "🧄"], ["Ginger", "🫚"], ["Cumin", "🌿"],
      ["Basil", "🌿"], ["Mint", "🌿"], ["Cilantro", "🌿"],
      ["Lemon", "🍋"], ["Turmeric", "🟡"], ["Chia seeds", "⚫"],
    ],
  };
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const out = [];
  for (const [cat, list] of Object.entries(groups)) {
    for (const [name, emoji] of list) {
      out.push({ id: slug(name), name, emoji, cat, allergen: cat === "allergens" });
    }
  }
  return out;
})();
