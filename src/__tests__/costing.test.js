/**
 * Unit tests for pure costing functions.
 * These functions mirror the implementations in src/app.js and are tested
 * in isolation without requiring the DOM or Electron environment.
 */

// ─── Allergen keyword dictionary (mirrors app.js) ─────────────────────────────
const ALLERGEN_KEYWORDS = {
  'Cereals (Gluten)': [
    'flour','wheat','bread','pasta','noodle','rye','barley','oat','spelt','semolina',
    'couscous','bulgur','farro','durum','brioche','croissant','crouton','panko',
    'breadcrumb','crumb','baguette','sourdough','focaccia','ciabatta','pita','pitta',
    'tortilla','wrap','biscuit','cracker','pastry','shortcrust','puff pastry',
    'filo','phyllo','dumpling','gnocchi','soy sauce','worcestershire','malt',
    'beer','ale','lager','stout','gravy','roux','bechamel','thickener',
  ],
  'Crustaceans': [
    'prawn','shrimp','crab','lobster','crayfish','langoustine','scampi',
    'king prawn','tiger prawn','brown crab','spider crab','barnacle',
  ],
  'Eggs': [
    'egg','eggs','yolk','white','albumen','mayonnaise','mayo','hollandaise',
    'meringue','custard','omelette','frittata','quiche','aioli','caesar',
    'carbonara','pasta egg','egg noodle','egg wash',
  ],
  'Fish': [
    'fish','salmon','tuna','cod','haddock','halibut','sea bass','seabass','mackerel',
    'trout','sardine','anchovy','anchovies','sole','plaice','tilapia','monkfish',
    'swordfish','herring','pilchard','whitebait','skate','bream','perch','pike',
    'caviar','roe','fish sauce','worcestershire','caesar dressing',
  ],
  'Lupin': ['lupin','lupine','lupin flour','lupin seed','lupin bean'],
  'Milk': [
    'milk','cream','butter','cheese','parmesan','cheddar','mozzarella','brie',
    'camembert','gouda','edam','feta','ricotta','mascarpone','fromage','gruyere',
    'emmental','halloumi','paneer','ghee','lactose','dairy','yogurt','yoghurt',
    'creme fraiche','sour cream','buttermilk','whey','casein','skimmed','semi-skimmed',
    'full fat milk','double cream','single cream','clotted cream','ice cream',
    'gelato','béchamel','bechamel','white sauce','cheese sauce','milk chocolate',
  ],
  'Molluscs': [
    'squid','octopus','cuttlefish','clam','mussel','oyster','scallop','snail',
    'abalone','whelk','cockle','periwinkle','calamari',
  ],
  'Mustard': [
    'mustard','mustard seed','mustard powder','dijon','wholegrain mustard',
    'english mustard','french mustard','mustard oil','mustard leaf',
  ],
  'Nuts': [
    'almond','hazelnut','walnut','cashew','pecan','pistachio','macadamia',
    'brazil nut','pine nut','chestnut','praline','marzipan','nougat',
    'nut oil','walnut oil','hazelnut oil','almond flour','almond milk',
    'mixed nuts','nut butter','frangipane',
  ],
  'Peanuts': [
    'peanut','groundnut','monkey nut','peanut butter','peanut oil','satay',
    'peanut sauce','kung pao','pad thai','ground nut',
  ],
  'Sesame': [
    'sesame','tahini','sesame oil','sesame seed','hummus','houmous',
    'sesame paste','halva','halvah','bagel seed',
  ],
  'Soya': [
    'soy','soya','tofu','edamame','miso','tempeh','soy sauce','tamari',
    'soybean','soya bean','soya milk','soy milk','soy protein',
    'textured vegetable protein','tvp','bean curd',
  ],
  'Celery': [
    'celery','celeriac','celery salt','celery seed','celery powder',
    'celery leaf','lovage',
  ],
  'Sulphur Dioxide': [
    'wine','white wine','red wine','wine vinegar','balsamic','dried fruit',
    'sultana','raisin','apricot','prune','fig','date','mango dried',
    'preserved lemon','vinegar','cider vinegar','sulphite','sulfite',
    'so2','e220','e221','e222','e223','e224','pickled','pickle',
  ],
};

// ─── Pure functions (mirrors app.js) ─────────────────────────────────────────

function detectAllergens(name) {
  const lower = name.toLowerCase();
  const detected = [];
  for (const [allergen, keywords] of Object.entries(ALLERGEN_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) detected.push(allergen);
  }
  return detected;
}

function costPerUnit(ing) {
  if (!ing.packSize || !ing.packCost) return 0;
  return ing.packCost / ing.packSize / ((ing.yieldPct || 100) / 100);
}

function suggestPrice(foodCost, gp) {
  if (gp >= 100) return 0;
  return foodCost / (1 - gp / 100);
}

function gpToMultiplier(gp) {
  if (gp >= 100) return 0;
  return 1 / (1 - gp / 100);
}

async function hashPin(pin) {
  const enc = new TextEncoder();
  const buf = await globalThis.crypto.subtle.digest('SHA-256', enc.encode('rc-pin-v2:' + pin));
  return 'sha2_' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('detectAllergens', () => {
  test('detects gluten from flour', () => {
    expect(detectAllergens('plain flour')).toContain('Cereals (Gluten)');
  });
  test('detects gluten from wheat', () => {
    expect(detectAllergens('wheat flour')).toContain('Cereals (Gluten)');
  });
  test('detects egg from mayonnaise', () => {
    expect(detectAllergens('mayonnaise')).toContain('Eggs');
  });
  test('detects egg from "egg"', () => {
    expect(detectAllergens('free range egg')).toContain('Eggs');
  });
  test('detects milk from cheddar cheese', () => {
    expect(detectAllergens('cheddar cheese')).toContain('Milk');
  });
  test('detects milk from butter', () => {
    expect(detectAllergens('unsalted butter')).toContain('Milk');
  });
  test('detects crustacean from prawn', () => {
    expect(detectAllergens('king prawn')).toContain('Crustaceans');
  });
  test('detects fish from salmon', () => {
    expect(detectAllergens('atlantic salmon fillet')).toContain('Fish');
  });
  test('detects nut from almond', () => {
    expect(detectAllergens('ground almond')).toContain('Nuts');
  });
  test('detects sesame from tahini', () => {
    expect(detectAllergens('tahini paste')).toContain('Sesame');
  });
  test('detects soya from tofu', () => {
    expect(detectAllergens('firm tofu')).toContain('Soya');
  });
  test('returns empty array for safe ingredient', () => {
    expect(detectAllergens('carrot')).toEqual([]);
  });
  test('returns empty array for water', () => {
    expect(detectAllergens('mineral water')).toEqual([]);
  });
  test('is case-insensitive', () => {
    expect(detectAllergens('WHEAT FLOUR')).toContain('Cereals (Gluten)');
    expect(detectAllergens('Cheddar Cheese')).toContain('Milk');
  });
  test('detects multiple allergens in one name', () => {
    const result = detectAllergens('egg pasta');
    expect(result).toContain('Cereals (Gluten)');
    expect(result).toContain('Eggs');
  });
  test('detects peanut from peanut butter', () => {
    expect(detectAllergens('smooth peanut butter')).toContain('Peanuts');
  });
  test('detects mustard from dijon', () => {
    expect(detectAllergens('dijon mustard')).toContain('Mustard');
  });
  test('detects celery from celeriac', () => {
    expect(detectAllergens('celeriac remoulade')).toContain('Celery');
  });
});

describe('costPerUnit', () => {
  test('basic cost per unit calculation', () => {
    // £5 for 1000g pack = £0.005/g
    const ing = { packSize: 1000, packCost: 5, yieldPct: 100 };
    expect(costPerUnit(ing)).toBeCloseTo(0.005);
  });
  test('applies yield percentage correctly', () => {
    // £5 for 1000g, 80% yield → effective 800g usable → £0.00625/g
    const ing = { packSize: 1000, packCost: 5, yieldPct: 80 };
    expect(costPerUnit(ing)).toBeCloseTo(0.00625);
  });
  test('defaults yieldPct to 100 when missing', () => {
    const ing = { packSize: 500, packCost: 2 };
    expect(costPerUnit(ing)).toBeCloseTo(0.004);
  });
  test('returns 0 when packSize is 0', () => {
    expect(costPerUnit({ packSize: 0, packCost: 5 })).toBe(0);
  });
  test('returns 0 when packCost is 0', () => {
    expect(costPerUnit({ packSize: 1000, packCost: 0 })).toBe(0);
  });
  test('returns 0 when packSize is missing', () => {
    expect(costPerUnit({ packCost: 5 })).toBe(0);
  });
  test('returns 0 when packCost is missing', () => {
    expect(costPerUnit({ packSize: 1000 })).toBe(0);
  });
  test('handles fractional pack sizes', () => {
    // £1.50 for 0.5kg pack = £3/kg = £0.003/g if unit is g and packSize is 500
    const ing = { packSize: 500, packCost: 1.5, yieldPct: 100 };
    expect(costPerUnit(ing)).toBeCloseTo(0.003);
  });
  test('50% yield doubles the cost per unit', () => {
    const base = { packSize: 1000, packCost: 4, yieldPct: 100 };
    const trimmed = { packSize: 1000, packCost: 4, yieldPct: 50 };
    expect(costPerUnit(trimmed)).toBeCloseTo(costPerUnit(base) * 2);
  });
});

describe('suggestPrice', () => {
  test('70% GP on £3 cost → £10 sell price', () => {
    expect(suggestPrice(3, 70)).toBeCloseTo(10);
  });
  test('50% GP on £5 cost → £10 sell price', () => {
    expect(suggestPrice(5, 50)).toBeCloseTo(10);
  });
  test('0% GP returns cost as price (no markup)', () => {
    expect(suggestPrice(5, 0)).toBeCloseTo(5);
  });
  test('returns 0 for exactly 100% GP', () => {
    expect(suggestPrice(5, 100)).toBe(0);
  });
  test('returns 0 for GP above 100', () => {
    expect(suggestPrice(5, 105)).toBe(0);
  });
  test('25% GP food cost target: cost is 25% of price', () => {
    const price = suggestPrice(2.5, 75);
    expect(2.5 / price * 100).toBeCloseTo(25);
  });
  test('result satisfies: cost / price = (100 - gp) / 100', () => {
    const cost = 4;
    const gp = 65;
    const price = suggestPrice(cost, gp);
    expect(cost / price * 100).toBeCloseTo(100 - gp);
  });
});

describe('gpToMultiplier', () => {
  test('70% GP ≈ 3.33× multiplier', () => {
    expect(gpToMultiplier(70)).toBeCloseTo(3.333, 2);
  });
  test('50% GP = 2× multiplier', () => {
    expect(gpToMultiplier(50)).toBeCloseTo(2);
  });
  test('0% GP = 1× multiplier (no markup)', () => {
    expect(gpToMultiplier(0)).toBeCloseTo(1);
  });
  test('returns 0 for 100% GP', () => {
    expect(gpToMultiplier(100)).toBe(0);
  });
  test('multiplier × cost = suggestPrice result', () => {
    const cost = 3;
    const gp = 70;
    expect(gpToMultiplier(gp) * cost).toBeCloseTo(suggestPrice(cost, gp));
  });
});

describe('hashPin', () => {
  test('returns a sha2_ prefixed hex string', async () => {
    const hash = await hashPin('1234');
    expect(hash).toMatch(/^sha2_[0-9a-f]{64}$/);
  });
  test('same PIN produces same hash (deterministic)', async () => {
    const h1 = await hashPin('9876');
    const h2 = await hashPin('9876');
    expect(h1).toBe(h2);
  });
  test('different PINs produce different hashes', async () => {
    const h1 = await hashPin('1111');
    const h2 = await hashPin('2222');
    expect(h1).not.toBe(h2);
  });
  test('includes domain prefix (rc-pin-v2:) in hash input', async () => {
    // "rc-pin-v2:1234" should differ from just "1234"
    const withPrefix = await hashPin('1234');
    // Hash of bare "1234" (SHA-256, no prefix)
    const enc = new TextEncoder();
    const bare = await globalThis.crypto.subtle.digest('SHA-256', enc.encode('1234'));
    const bareHex = 'sha2_' + Array.from(new Uint8Array(bare)).map(b => b.toString(16).padStart(2, '0')).join('');
    expect(withPrefix).not.toBe(bareHex);
  });
});
