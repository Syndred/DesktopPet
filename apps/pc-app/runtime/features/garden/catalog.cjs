"use strict";

// Balance data is deliberately independent from territory capture multipliers.
// No third-party game code or artwork is bundled.
const CROPS = Object.freeze({
  carrot: { id: "carrot", name: "胡萝卜", icon: "🥕", seedItemId: "seed:carrot", harvestItemId: "carrot", growMs: 10 * 60_000, yield: 3, color: "#ed9448" },
  tomato: { id: "tomato", name: "番茄", icon: "🍅", seedItemId: "seed:tomato", harvestItemId: "tomato", growMs: 15 * 60_000, yield: 3, color: "#ef7875" },
  berry: { id: "berry", name: "莓果", icon: "🫐", seedItemId: "seed:berry", harvestItemId: "berry", growMs: 20 * 60_000, yield: 4, color: "#9e8fd4" },
  rice: { id: "rice", name: "稻米", icon: "🌾", seedItemId: "seed:rice", harvestItemId: "rice", growMs: 25 * 60_000, yield: 2, color: "#d2ad54" }
});
const ITEMS = Object.freeze({
  ...Object.fromEntries(Object.values(CROPS).map(c => [c.seedItemId, { id: c.seedItemId, name: `${c.name}种子`, icon: c.icon, category: "seed", source: "探索与对战", effects: null }])),
  carrot: { id: "carrot", name: "胡萝卜", icon: "🥕", category: "food", source: "菜园收获", effects: { satiety: 12, mood: 2, intimacy: 2 } },
  tomato: { id: "tomato", name: "番茄", icon: "🍅", category: "food", source: "菜园收获", effects: { satiety: 10, mood: 3, intimacy: 2 } },
  berry: { id: "berry", name: "莓果", icon: "🫐", category: "food", source: "菜园收获", effects: { satiety: 8, mood: 4, intimacy: 3 } },
  rice: { id: "rice", name: "稻米", icon: "🌾", category: "ingredient", source: "菜园收获", effects: null },
  cooked_rice: { id: "cooked_rice", name: "热乎乎的米饭", icon: "🍚", category: "food", source: "稻米制作", effects: { satiety: 20, mood: 3, intimacy: 4 } }
});
const RECIPES = Object.freeze({ cooked_rice: { id: "cooked_rice", name: "热乎乎的米饭", input: { itemId: "rice", quantity: 1 }, output: { itemId: "cooked_rice", quantity: 1 } } });
const BASE_PLOTS = 6;
const STARTER_SEEDS = 2;
const MAX_QUANTITY = 99;
module.exports = { CROPS, ITEMS, RECIPES, BASE_PLOTS, STARTER_SEEDS, MAX_QUANTITY };
