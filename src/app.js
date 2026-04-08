// ─── Electron API bridge ──────────────────────────────────────
// All Node/IPC access goes through window.electronAPI (injected by preload.js).
// XLSX is also provided by the preload — no require() calls in the renderer.
const eAPI = window.electronAPI;
const XLSX = {
  read: (data, opts) => eAPI.xlsx.read(data, opts),
  write: (wb, opts) => eAPI.xlsx.write(wb, opts),
  buildWorkbook: (sheets) => eAPI.xlsx.buildWorkbook(sheets),
  utils: {
    book_new: () => eAPI.xlsx.utils.book_new(),
    book_append_sheet: (wb, ws, name) =>
      eAPI.xlsx.utils.book_append_sheet(wb, ws, name),
    aoa_to_sheet: (data, opts) => eAPI.xlsx.utils.aoa_to_sheet(data, opts),
    sheet_to_json: (ws, opts) => eAPI.xlsx.utils.sheet_to_json(ws, opts),
  },
};

const browserIPC = {
  loadData() {
    return eAPI.loadData();
  },
  saveData(d) {
    return eAPI.saveData(d);
  },
  getDataPath() {
    return eAPI.getDataPath();
  },
  exportPDF(html) {
    eAPI.exportPDF(html);
  },
  saveExcel(buf, name) {
    const arr =
      buf instanceof Uint8Array
        ? Array.from(buf)
        : Array.from(new Uint8Array(buf.buffer || buf));
    return eAPI.saveExcel(arr, name);
  },
  openExcel() {
    return eAPI.openExcel();
  },
  openImage() {
    return eAPI.openImage();
  },
  // open-invoice now returns [{base64, mime, name}] directly from main process
  openInvoice() {
    return eAPI.openInvoice();
  },
  exportAllData() {
    const raw = localStorage.getItem("recipe-costing-data") || "{}";
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      "recipe-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

async function showDataLocation() {
  const info = await eAPI.getDataPath();
  showToast("Data: " + (info?.dataPath || "localStorage"), "success", 3000);
}

// ─── Constants ────────────────────────────────────────────────
const ALLERGENS = [
  "Celery",
  "Cereals (Gluten)",
  "Crustaceans",
  "Eggs",
  "Fish",
  "Lupin",
  "Milk",
  "Molluscs",
  "Mustard",
  "Nuts",
  "Peanuts",
  "Sesame",
  "Soya",
  "Sulphur Dioxide",
];
// ─── Category System — fully editable ────────────────────────
const RECIPE_CATS_DEFAULT = [
  "Starter",
  "Main",
  "Dessert",
  "Side",
  "Sauce",
  "Canape",
  "Bread",
  "Other",
];
const ING_CATS_DEFAULT = [
  "Meat & Poultry",
  "Fish & Seafood",
  "Vegetables",
  "Dairy",
  "Dry Goods",
  "Herbs & Spices",
  "Oils & Condiments",
  "Bakery",
  "Other",
];

function getRecipeCategories() {
  return state.recipeCategories && state.recipeCategories.length
    ? state.recipeCategories
    : [...RECIPE_CATS_DEFAULT];
}
// Guess ingredient category from name using keywords
function guessIngCategory(name) {
  const n = name.toLowerCase();
  const rules = [
    [
      "Meat & Poultry",
      [
        "chicken",
        "beef",
        "lamb",
        "pork",
        "duck",
        "turkey",
        "veal",
        "venison",
        "rabbit",
        "bacon",
        "ham",
        "sausage",
        "mince",
        "steak",
        "breast",
        "thigh",
        "wing",
        "rib",
        "loin",
        "rump",
        "fillet",
        "chorizo",
        "salami",
        "pancetta",
        "prosciutto",
        "bresaola",
        "liver",
        "kidney",
        "offal",
      ],
    ],
    [
      "Fish & Seafood",
      [
        "fish",
        "salmon",
        "tuna",
        "cod",
        "haddock",
        "sea bass",
        "seabass",
        "mackerel",
        "trout",
        "sardine",
        "anchovy",
        "sole",
        "plaice",
        "halibut",
        "monkfish",
        "prawn",
        "shrimp",
        "crab",
        "lobster",
        "scallop",
        "mussel",
        "oyster",
        "squid",
        "octopus",
        "langoustine",
        "crayfish",
        "clam",
        "cockle",
      ],
    ],
    [
      "Vegetables",
      [
        "carrot",
        "onion",
        "potato",
        "tomato",
        "pepper",
        "courgette",
        "aubergine",
        "broccoli",
        "cauliflower",
        "cabbage",
        "lettuce",
        "spinach",
        "kale",
        "leek",
        "celery",
        "fennel",
        "garlic",
        "shallot",
        "mushroom",
        "asparagus",
        "bean",
        "pea",
        "corn",
        "sweetcorn",
        "squash",
        "pumpkin",
        "parsnip",
        "beetroot",
        "radish",
        "cucumber",
        "avocado",
        "artichoke",
      ],
    ],
    [
      "Dairy",
      [
        "milk",
        "cream",
        "butter",
        "cheese",
        "yogurt",
        "yoghurt",
        "creme fraiche",
        "mascarpone",
        "ricotta",
        "mozzarella",
        "parmesan",
        "cheddar",
        "brie",
        "camembert",
        "feta",
        "halloumi",
        "ghee",
        "lactose",
        "whey",
        "dairy",
      ],
    ],
    [
      "Dry Goods",
      [
        "flour",
        "sugar",
        "rice",
        "pasta",
        "noodle",
        "lentil",
        "chickpea",
        "bean",
        "bread",
        "oat",
        "cereal",
        "grain",
        "wheat",
        "semolina",
        "couscous",
        "quinoa",
        "salt",
        "pepper",
        "spice",
        "stock",
        "sauce",
        "oil",
        "vinegar",
        "soy",
        "honey",
        "syrup",
        "jam",
        "chocolate",
        "cocoa",
        "coffee",
        "tea",
        "biscuit",
        "cracker",
        "breadcrumb",
        "panko",
      ],
    ],
    [
      "Herbs & Spices",
      [
        "basil",
        "thyme",
        "rosemary",
        "oregano",
        "parsley",
        "coriander",
        "mint",
        "chive",
        "sage",
        "tarragon",
        "dill",
        "bay",
        "herb",
        "cumin",
        "paprika",
        "turmeric",
        "cinnamon",
        "ginger",
        "cardamom",
        "clove",
        "star anise",
        "vanilla",
        "nutmeg",
        "cayenne",
        "chilli",
        "curry",
        "masala",
      ],
    ],
    [
      "Oils & Condiments",
      [
        "oil",
        "olive",
        "sunflower",
        "rapeseed",
        "vegetable oil",
        "mayonnaise",
        "mustard",
        "ketchup",
        "vinegar",
        "soy sauce",
        "worcestershire",
        "hot sauce",
        "relish",
        "pickle",
        "chutney",
        "pesto",
        "tahini",
        "miso",
        "fish sauce",
        "oyster sauce",
        "hoisin",
        "teriyaki",
        "dressing",
      ],
    ],
    [
      "Bakery",
      [
        "bread",
        "roll",
        "bun",
        "loaf",
        "sourdough",
        "ciabatta",
        "baguette",
        "brioche",
        "croissant",
        "pastry",
        "cake",
        "tart",
        "pie",
        "muffin",
        "scone",
        "bagel",
        "wrap",
        "tortilla",
        "pitta",
        "naan",
        "focaccia",
        "bloomer",
        "viennese",
        "pain",
      ],
    ],
  ];
  for (const [cat, keywords] of rules) {
    if (keywords.some((k) => n.includes(k))) return cat;
  }
  return "";
}

function getIngCategories() {
  return state.ingCategories && state.ingCategories.length
    ? state.ingCategories
    : [...ING_CATS_DEFAULT];
}

// ─── Allergen Keyword Dictionary ──────────────────────────────
const ALLERGEN_KEYWORDS = {
  "Cereals (Gluten)": [
    "flour",
    "wheat",
    "bread",
    "pasta",
    "noodle",
    "rye",
    "barley",
    "oat",
    "spelt",
    "semolina",
    "couscous",
    "bulgur",
    "farro",
    "durum",
    "brioche",
    "croissant",
    "crouton",
    "panko",
    "breadcrumb",
    "crumb",
    "baguette",
    "sourdough",
    "focaccia",
    "ciabatta",
    "pita",
    "pitta",
    "tortilla",
    "wrap",
    "biscuit",
    "cracker",
    "pastry",
    "shortcrust",
    "puff pastry",
    "filo",
    "phyllo",
    "dumpling",
    "gnocchi",
    "soy sauce",
    "worcestershire",
    "malt",
    "beer",
    "ale",
    "lager",
    "stout",
    "gravy",
    "roux",
    "bechamel",
    "thickener",
  ],
  Crustaceans: [
    "prawn",
    "shrimp",
    "crab",
    "lobster",
    "crayfish",
    "langoustine",
    "scampi",
    "king prawn",
    "tiger prawn",
    "brown crab",
    "spider crab",
    "barnacle",
  ],
  Eggs: [
    "egg",
    "eggs",
    "yolk",
    "white",
    "albumen",
    "mayonnaise",
    "mayo",
    "hollandaise",
    "meringue",
    "custard",
    "omelette",
    "frittata",
    "quiche",
    "aioli",
    "caesar",
    "carbonara",
    "pasta egg",
    "egg noodle",
    "egg wash",
  ],
  Fish: [
    "fish",
    "salmon",
    "tuna",
    "cod",
    "haddock",
    "halibut",
    "sea bass",
    "seabass",
    "mackerel",
    "trout",
    "sardine",
    "anchovy",
    "anchovies",
    "sole",
    "plaice",
    "tilapia",
    "monkfish",
    "swordfish",
    "herring",
    "pilchard",
    "whitebait",
    "skate",
    "bream",
    "perch",
    "pike",
    "caviar",
    "roe",
    "fish sauce",
    "worcestershire",
    "caesar dressing",
  ],
  Lupin: ["lupin", "lupine", "lupin flour", "lupin seed", "lupin bean"],
  Milk: [
    "milk",
    "cream",
    "butter",
    "cheese",
    "parmesan",
    "cheddar",
    "mozzarella",
    "brie",
    "camembert",
    "gouda",
    "edam",
    "feta",
    "ricotta",
    "mascarpone",
    "fromage",
    "gruyere",
    "emmental",
    "halloumi",
    "paneer",
    "ghee",
    "lactose",
    "dairy",
    "yogurt",
    "yoghurt",
    "creme fraiche",
    "sour cream",
    "buttermilk",
    "whey",
    "casein",
    "skimmed",
    "semi-skimmed",
    "full fat milk",
    "double cream",
    "single cream",
    "clotted cream",
    "ice cream",
    "gelato",
    "béchamel",
    "bechamel",
    "white sauce",
    "cheese sauce",
    "milk chocolate",
  ],
  Molluscs: [
    "squid",
    "octopus",
    "cuttlefish",
    "clam",
    "mussel",
    "oyster",
    "scallop",
    "snail",
    "abalone",
    "whelk",
    "cockle",
    "periwinkle",
    "calamari",
  ],
  Mustard: [
    "mustard",
    "mustard seed",
    "mustard powder",
    "dijon",
    "wholegrain mustard",
    "english mustard",
    "french mustard",
    "mustard oil",
    "mustard leaf",
  ],
  Nuts: [
    "almond",
    "hazelnut",
    "walnut",
    "cashew",
    "pecan",
    "pistachio",
    "macadamia",
    "brazil nut",
    "pine nut",
    "chestnut",
    "praline",
    "marzipan",
    "nougat",
    "nut oil",
    "walnut oil",
    "hazelnut oil",
    "almond flour",
    "almond milk",
    "mixed nuts",
    "nut butter",
    "frangipane",
  ],
  Peanuts: [
    "peanut",
    "groundnut",
    "monkey nut",
    "peanut butter",
    "peanut oil",
    "satay",
    "peanut sauce",
    "kung pao",
    "pad thai",
    "ground nut",
  ],
  Sesame: [
    "sesame",
    "tahini",
    "sesame oil",
    "sesame seed",
    "hummus",
    "houmous",
    "sesame paste",
    "halva",
    "halvah",
    "bagel seed",
  ],
  Soya: [
    "soy",
    "soya",
    "tofu",
    "edamame",
    "miso",
    "tempeh",
    "soy sauce",
    "tamari",
    "soybean",
    "soya bean",
    "soya milk",
    "soy milk",
    "soy protein",
    "textured vegetable protein",
    "tvp",
    "bean curd",
  ],
  Celery: [
    "celery",
    "celeriac",
    "celery salt",
    "celery seed",
    "celery powder",
    "celery leaf",
    "lovage",
  ],
  "Sulphur Dioxide": [
    "wine",
    "white wine",
    "red wine",
    "wine vinegar",
    "balsamic",
    "dried fruit",
    "sultana",
    "raisin",
    "apricot",
    "prune",
    "fig",
    "date",
    "mango dried",
    "preserved lemon",
    "vinegar",
    "cider vinegar",
    "sulphite",
    "sulfite",
    "so2",
    "e220",
    "e221",
    "e222",
    "e223",
    "e224",
    "pickled",
    "pickle",
  ],
};

function detectAllergens(name) {
  const lower = name.toLowerCase();
  const detected = [];
  for (const [allergen, keywords] of Object.entries(ALLERGEN_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      detected.push(allergen);
    }
  }
  return detected;
}

// ─── State ────────────────────────────────────────────────────
let state = {
  ingredients: [],
  recipes: [],
  suppliers: [],
  sites: [],
  activeSiteId: null,
  activeRecipeId: null,
  activeGP: 70,
  customRecipeCategories: [],
  recipeCategories: [],
  ingCategories: [],
  darkMode: false,
  currency: "£",
  vatRate: 20,
  foodCostTarget: 30,
  locations: [],
  activeLocationId: null,
};

// ─── Dark Mode ────────────────────────────────────────────────
function applyDarkMode(dark) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const btn = document.getElementById("theme-toggle-btn");
  if (btn) btn.textContent = dark ? "☀ Light" : "🌙 Dark";
}
async function installUpdate() {
  if (window.electronAPI?.installUpdate) window.electronAPI.installUpdate();
}

function _setUpdateStatus(html) {
  const el = document.getElementById("update-settings-status");
  if (el) el.innerHTML = html;
}

async function checkForUpdate() {
  if (!window.electronAPI?.checkForUpdate) {
    _setUpdateStatus('<span style="color:var(--text-muted)">Not available in dev mode.</span>');
    return;
  }
  const btn = document.getElementById("check-update-btn");
  if (btn) btn.disabled = true;
  _setUpdateStatus('<span style="color:var(--text-muted)">Checking…</span>');
  const result = await window.electronAPI.checkForUpdate();
  if (result === 'dev') {
    _setUpdateStatus('<span style="color:var(--text-muted)">Not available in dev mode — only works in the installed app.</span>');
  } else if (result === 'error') {
    _setUpdateStatus('<span style="color:var(--red)">Check failed. Make sure you have published a release to GitHub.</span>');
  } else {
    // autoUpdater events will fire if an update is found; set a fallback after 12s
    setTimeout(() => {
      const el = document.getElementById("update-settings-status");
      if (el && el.innerHTML.includes('Checking')) {
        _setUpdateStatus('<span style="color:var(--green)">You\'re up to date.</span>');
      }
    }, 12000);
  }
  if (btn) btn.disabled = false;
}

// ─── PIN Lock ─────────────────────────────────────────────────────────────────
const PIN_KEY = "rc-pin-hash";
let pinBuffer = "";

async function hashPin(pin) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest(
    "SHA-256",
    enc.encode("rc-pin-v2:" + pin),
  );
  return (
    "sha2_" +
    Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

function checkPinEnabled() {
  const stored = localStorage.getItem(PIN_KEY);
  if (!stored) return false;
  if (stored.startsWith("pin_")) {
    // Legacy weak hash — clear it and require the user to set a new PIN
    localStorage.removeItem(PIN_KEY);
    setTimeout(
      () =>
        showToast(
          "PIN reset required: please set a new PIN in Settings (security upgrade)",
          "error",
          7000,
        ),
      1500,
    );
    return false;
  }
  return true;
}

function showPinLock() {
  const overlay = document.getElementById("pin-overlay");
  if (overlay) overlay.style.display = "flex";
  pinBuffer = "";
  updatePinDots();
}

function unlockApp() {
  const overlay = document.getElementById("pin-overlay");
  if (overlay) overlay.style.display = "none";
}

function pinInput(digit) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += digit;
  updatePinDots();
  if (pinBuffer.length === 4) {
    setTimeout(function () {
      verifyPin();
    }, 80);
  }
}

function pinDelete() {
  if (pinBuffer.length > 0) {
    pinBuffer = pinBuffer.slice(0, -1);
    updatePinDots();
  }
}

function updatePinDots(pinState) {
  const dots = document.querySelectorAll(".pin-dot");
  dots.forEach(function (dot, i) {
    dot.classList.remove("filled", "error");
    if (pinState === "error") dot.classList.add("error");
    else if (i < pinBuffer.length) dot.classList.add("filled");
  });
}

async function verifyPin() {
  const stored = localStorage.getItem(PIN_KEY);
  const hash = await hashPin(pinBuffer);
  if (hash === stored) {
    updatePinDots("ok");
    setTimeout(unlockApp, 200);
  } else {
    updatePinDots("error");
    document.getElementById("pin-error").textContent = "Incorrect PIN";
    setTimeout(function () {
      pinBuffer = "";
      updatePinDots();
      document.getElementById("pin-error").textContent = "";
    }, 1200);
  }
}

// Keyboard support on PIN screen
function _onPinKeydown(e) {
  const overlay = document.getElementById("pin-overlay");
  if (!overlay || overlay.style.display === "none") return;
  if (e.key >= "0" && e.key <= "9") pinInput(e.key);
  else if (e.key === "Backspace") pinDelete();
}
document.addEventListener("keydown", _onPinKeydown);

function openPinSetModal() {
  document.getElementById("pin-new").value = "";
  document.getElementById("pin-confirm").value = "";
  document.getElementById("pin-set-error").textContent = "";
  const hasPin = checkPinEnabled();
  document.getElementById("pin-set-title").textContent = hasPin
    ? "Change PIN"
    : "Set PIN Lock";
  document.getElementById("pin-set-modal").classList.remove("hidden");
  setTimeout(function () {
    document.getElementById("pin-new").focus();
  }, 50);
}

function closePinSetModal() {
  document.getElementById("pin-set-modal").classList.add("hidden");
}

async function savePinFromModal() {
  const newPin = document.getElementById("pin-new").value.trim();
  const confirm = document.getElementById("pin-confirm").value.trim();
  const errEl = document.getElementById("pin-set-error");
  if (!/^\d{4}$/.test(newPin)) {
    errEl.textContent = "PIN must be exactly 4 digits (0–9)";
    return;
  }
  if (newPin !== confirm) {
    errEl.textContent = "PINs do not match";
    return;
  }
  localStorage.setItem(PIN_KEY, await hashPin(newPin));
  closePinSetModal();
  renderPinStatus();
  showToast("✓ PIN lock enabled", "success", 2000);
  renderPinStatus();
}

function removePinLock() {
  localStorage.removeItem(PIN_KEY);
  renderPinStatus();
  showToast("PIN lock disabled", "success", 2000);
}

function renderPinStatus() {
  const hasPin = checkPinEnabled();
  const icon = document.getElementById("pin-status-icon");
  const text = document.getElementById("pin-status-text");
  const sub = document.getElementById("pin-status-sub");
  const label = document.getElementById("pin-toggle-label");
  const track = document.getElementById("pin-toggle-track");
  const thumb = document.getElementById("pin-toggle-thumb");
  const actions = document.getElementById("pin-actions-row");

  if (icon) icon.textContent = hasPin ? "🔒" : "🔓";
  if (text)
    text.textContent = hasPin ? "PIN lock enabled" : "PIN lock disabled";
  if (sub)
    sub.textContent = hasPin
      ? "App is locked on startup"
      : "App opens without a PIN";
  if (label) label.textContent = hasPin ? "On" : "Off";
  if (track)
    track.style.background = hasPin ? "var(--accent)" : "var(--border)";
  if (thumb) thumb.style.left = hasPin ? "23px" : "3px";
  if (actions) actions.style.display = hasPin ? "flex" : "none";
}

function togglePinLock() {
  const hasPin = checkPinEnabled();
  if (hasPin) {
    // Turn off — remove PIN immediately
    removePinLock();
  } else {
    // Turn on — open PIN setup modal
    openPinSetModal();
  }
}

// ─── Ingredient Export / Import ───────────────────────────────────────────────
// ─── Allergen Auto-Detection (bulk) ──────────────────────────
function autoDetectAllAllergens() {
  let updated = 0;
  let totalAdded = 0;

  state.ingredients.forEach(function (ing) {
    const detected = detectAllergens(ing.name);
    if (!detected.length) return;

    const before = (ing.allergens || []).length;
    // Merge — keep existing, add new
    const merged = [...new Set([...(ing.allergens || []), ...detected])];
    const added = merged.length - before;

    if (added > 0) {
      ing.allergens = merged;
      totalAdded += added;
      updated++;
    }
  });

  save();
  renderIngredientLibrary();

  const statusEl = document.getElementById("allergen-scan-status");
  if (updated === 0) {
    const msg = "No new allergens found — all ingredients already up to date.";
    if (statusEl) statusEl.textContent = msg;
    showToast(msg, "success", 3000);
  } else {
    const msg = `✓ Updated ${updated} ingredient${updated !== 1 ? "s" : ""} — ${totalAdded} allergen${totalAdded !== 1 ? "s" : ""} added`;
    if (statusEl)
      statusEl.innerHTML = `<span style="color:var(--green);font-weight:600">${msg}</span>`;
    showToast(msg, "success", 3500);
  }
}

// ─── Recipe Export / Import ───────────────────────────────────────────────────
function exportRecipes() {
  if (!state.recipes.length) {
    showToast("No recipes to export", "error", 2000);
    return;
  }
  const data = {
    exportedAt: new Date().toISOString(),
    exportVersion: 1,
    recipes: state.recipes,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "recipes-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("✓ " + state.recipes.length + " recipes exported", "success", 2000);
}

function importRecipesFromFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const data = JSON.parse(ev.target.result);
        const incoming = data.recipes || (Array.isArray(data) ? data : null);
        if (!incoming || !incoming.length)
          throw new Error("No recipes found in file");

        const statusEl = document.getElementById("recipe-import-status");
        const existingNames = new Set(
          state.recipes.map((r) => r.name.toLowerCase()),
        );
        const toAdd = incoming.filter(
          (r) => !existingNames.has((r.name || "").toLowerCase()),
        );
        const dupes = incoming.length - toAdd.length;
        const toUpdate = incoming.filter((r) =>
          existingNames.has((r.name || "").toLowerCase()),
        );

        if (!toAdd.length && !toUpdate.length) {
          if (statusEl) statusEl.textContent = "Nothing to import.";
          showToast("Nothing to import", "error", 2000);
          return;
        }

        // Ensure required fields on new recipes
        toAdd.forEach(function (r) {
          if (!r.id)
            r.id =
              "rec_" +
              Date.now() +
              "_" +
              Math.random().toString(36).slice(2, 7);
          if (!r.ingredients) r.ingredients = [];
          if (!r.subRecipes) r.subRecipes = [];
          if (!r.versions) r.versions = [];
          if (!r.tags) r.tags = [];
        });

        state.recipes.push(...toAdd);

        // Update existing by name — overwrite with imported version
        toUpdate.forEach(function (incoming) {
          const idx = state.recipes.findIndex(
            (r) => r.name.toLowerCase() === (incoming.name || "").toLowerCase(),
          );
          if (idx >= 0)
            state.recipes[idx] = { ...state.recipes[idx], ...incoming };
        });

        save();
        renderSidebarRecipes();

        const parts = [];
        if (toAdd.length)
          parts.push(
            toAdd.length +
              " recipe" +
              (toAdd.length !== 1 ? "s" : "") +
              " added",
          );
        if (toUpdate.length)
          parts.push(
            toUpdate.length +
              " recipe" +
              (toUpdate.length !== 1 ? "s" : "") +
              " updated",
          );
        if (dupes > 0 && !toUpdate.length)
          parts.push(
            dupes + " duplicate" + (dupes !== 1 ? "s" : "") + " skipped",
          );
        const msg = parts.join(", ");
        if (statusEl)
          statusEl.innerHTML =
            '<span style="color:var(--green);font-weight:600">✓ ' +
            msg +
            "</span>";
        showToast("✓ " + msg, "success", 3500);
      } catch (err) {
        showToast("Import failed: " + err.message, "error", 4000);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function exportIngredients() {
  const data = {
    exportedAt: new Date().toISOString(),
    exportVersion: 1,
    ingredients: state.ingredients,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ingredients-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(
    "✓ " + state.ingredients.length + " ingredients exported",
    "success",
    2000,
  );
}

function importIngredientsFromFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const data = JSON.parse(ev.target.result);
        const incoming =
          data.ingredients || (Array.isArray(data) ? data : null);
        if (!incoming || !incoming.length)
          throw new Error("No ingredients found in file");

        const statusEl = document.getElementById("ing-import-status");
        const existingNames = new Set(
          state.ingredients.map((i) => i.name.toLowerCase()),
        );
        const toAdd = incoming.filter(
          (i) => !existingNames.has((i.name || "").toLowerCase()),
        );
        const dupes = incoming.length - toAdd.length;

        if (toAdd.length === 0) {
          if (statusEl)
            statusEl.textContent =
              "All " +
              incoming.length +
              " ingredients already exist — nothing added.";
          showToast("No new ingredients to import", "error", 3000);
          return;
        }

        toAdd.forEach(function (ing) {
          if (!ing.id)
            ing.id =
              "ing_" +
              Date.now() +
              "_" +
              Math.random().toString(36).slice(2, 7);
          if (!ing.allergens) ing.allergens = [];
          if (!ing.nutrition) ing.nutrition = {};
          if (!ing.priceHistory) ing.priceHistory = [];
        });

        state.ingredients.push(...toAdd);
        save();
        renderIngredientLibrary();

        const msg =
          toAdd.length +
          " ingredient" +
          (toAdd.length !== 1 ? "s" : "") +
          " imported" +
          (dupes > 0
            ? " (" +
              dupes +
              " duplicate" +
              (dupes !== 1 ? "s" : "") +
              " skipped)"
            : "");
        if (statusEl) statusEl.textContent = "✓ " + msg;
        showToast("✓ " + msg, "success", 3000);
      } catch (err) {
        showToast("Import failed: " + err.message, "error", 4000);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function exportSuppliers() {
  if (!state.suppliers.length) {
    showToast("No suppliers to export", "error", 2000);
    return;
  }
  const data = {
    exportedAt: new Date().toISOString(),
    exportVersion: 1,
    suppliers: state.suppliers,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "suppliers-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const invoiceCount = state.suppliers.reduce(
    (n, s) => n + (s.invoiceHistory || []).length,
    0,
  );
  showToast(
    "✓ " +
      state.suppliers.length +
      " suppliers exported (" +
      invoiceCount +
      " invoices)",
    "success",
    2500,
  );
}

function importSuppliersFromFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const data = JSON.parse(ev.target.result);
        const incoming = data.suppliers || (Array.isArray(data) ? data : null);
        if (!incoming || !incoming.length)
          throw new Error("No suppliers found in file");

        const statusEl = document.getElementById("sup-import-status");
        const existingNames = new Set(
          state.suppliers.map((s) => s.name.toLowerCase()),
        );
        let added = 0,
          merged = 0;

        incoming.forEach(function (sup) {
          const match = state.suppliers.find(
            (s) => s.name.toLowerCase() === (sup.name || "").toLowerCase(),
          );
          if (match) {
            // Merge invoice history — skip invoices already present by id
            const existingInvIds = new Set(
              (match.invoiceHistory || []).map((i) => i.id),
            );
            const newInvoices = (sup.invoiceHistory || []).filter(
              (i) => !existingInvIds.has(i.id),
            );
            if (newInvoices.length) {
              match.invoiceHistory = (match.invoiceHistory || []).concat(
                newInvoices,
              );
              merged++;
            }
          } else {
            // New supplier — assign fresh id to avoid collisions
            const newSup = Object.assign({}, sup, {
              id:
                "sup_" +
                Date.now() +
                "_" +
                Math.random().toString(36).slice(2, 7),
            });
            if (!newSup.invoiceHistory) newSup.invoiceHistory = [];
            state.suppliers.push(newSup);
            added++;
          }
        });

        save();
        renderSupplierList();

        const parts = [];
        if (added)
          parts.push(
            added + " new supplier" + (added !== 1 ? "s" : "") + " added",
          );
        if (merged)
          parts.push(
            merged +
              " supplier" +
              (merged !== 1 ? "s" : "") +
              " had invoices merged",
          );
        const msg =
          parts.join(", ") ||
          "No changes (all suppliers already exist with same invoices)";
        if (statusEl) statusEl.textContent = "✓ " + msg;
        showToast("✓ " + msg, "success", 3500);
      } catch (err) {
        showToast("Import failed: " + err.message, "error", 4000);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function toggleDarkMode() {
  state.darkMode = !state.darkMode;
  applyDarkMode(state.darkMode);
  save();
}

let editingIngredientId = null;
let confirmCallback = null;
let recipeSnapshot = null;
let dragSrcIdx = null;

// ─── Init ─────────────────────────────────────────────────────
async function init() {
  await initApiKeys(); // load encrypted API keys into memory before anything else
  const saved = await browserIPC.loadData();
  if (saved && saved._loadError) {
    showToast(
      "⚠ Data file could not be decrypted. Your backups are available in Settings → Backup & Restore.",
      "error",
      8000,
    );
  }
  if (saved && !saved._loadError) {
    state = { ...state, ...saved };
    // Migrations
    state.ingredients.forEach((i) => {
      if (!i.allergens) i.allergens = [];
      if (!i.nutrition) i.nutrition = {};
      if (!i.supplierId) i.supplierId = null;
      if (!i.priceHistory) i.priceHistory = [];
      if (!i.altSuppliers) i.altSuppliers = [];
    });
    // Clean up bad invoice history records (Invalid Date, undefined invoice numbers)
    (state.suppliers || []).forEach((sup) => {
      (sup.invoiceHistory || []).forEach((inv) => {
        // Fix bad dates
        if (
          !inv.date ||
          inv.date === "undefined" ||
          inv.date === "null" ||
          isNaN(new Date(inv.date))
        ) {
          inv.date = inv.scannedAt
            ? inv.scannedAt.slice(0, 10)
            : new Date().toISOString().slice(0, 10);
        }
        // Fix bad invoice numbers
        if (
          !inv.invoiceNumber ||
          inv.invoiceNumber === "undefined" ||
          inv.invoiceNumber === "null"
        ) {
          inv.invoiceNumber = "";
        }
      });
    });
    state.recipes.forEach((r) => {
      if (!r.versions) r.versions = [];
      if (!r.photo) r.photo = null;
      if (!r.priceOverride) r.priceOverride = null;
      if (!r.prepTime) r.prepTime = null;
      if (!r.cookTime) r.cookTime = null;
      if (!r.popularity) r.popularity = 50;
      if (!r.competitors) r.competitors = [];
      if (!r.tags) r.tags = [];
      if (r.actualGP === undefined) r.actualGP = null;
      if (r.actualSales === undefined) r.actualSales = null;
      if (r.locked === undefined) r.locked = false;
      if (!r.yieldQty) r.yieldQty = null;
      if (!r.yieldUnit) r.yieldUnit = "";
      // Fix missing recipeUnit — default to library unit so conversions are correct
      (r.ingredients || []).forEach((ri) => {
        if (!ri.recipeUnit) {
          const ing = state.ingredients.find((i) => i.id === ri.ingId);
          if (ing) ri.recipeUnit = ing.unit;
        }
      });
    });
    state.ingredients.forEach((i) => {
      if (i.seasonal === undefined) i.seasonal = false;
      if (!i.actualYield) i.actualYield = null;
      if (i.nutrition === undefined) i.nutrition = null;
    });
    if (!state.foodCostTarget) state.foodCostTarget = 30;
    state.recipes.forEach(function (r) {
      if (!r.costHistory) r.costHistory = [];
    });
    if (!state.suppliers) state.suppliers = [];
    state.suppliers.forEach(function (s) {
      if (!s.invoiceHistory) s.invoiceHistory = [];
    });
    if (!state.sites) state.sites = [];
    if (!state.activeSiteId) state.activeSiteId = null;
    if (!state.customRecipeCategories) state.customRecipeCategories = [];
    // Migrate old custom+default split into unified lists
    if (!state.recipeCategories || !state.recipeCategories.length) {
      state.recipeCategories = [
        ...RECIPE_CATS_DEFAULT,
        ...(state.customRecipeCategories || []),
      ].filter((v, i, a) => a.indexOf(v) === i);
    }
    if (!state.ingCategories || !state.ingCategories.length) {
      state.ingCategories = [...ING_CATS_DEFAULT];
    }
    if (state.darkMode === undefined) state.darkMode = false;
    if (!state.currency) state.currency = "£";
    if (state.vatRate === undefined) state.vatRate = 20;
    if (!state.foodCostTarget) state.foodCostTarget = 30;
  } else if (!saved || saved._loadError) {
    seedData();
  }
  // Auto-sync: rebuild category lists from what's actually on recipes/ingredients
  // This removes stale/empty registered categories and replaces them with real ones
  (function syncCategoriesOnLoad() {
    // ── Recipe categories ──
    const usedRecipeCats = [
      ...new Set((state.recipes || []).map((r) => r.category).filter(Boolean)),
    ];
    if (usedRecipeCats.length > 0) {
      // Keep only registered cats that are actually used (case-insensitive match)
      // Replace the stored name with the one actually on the recipes so casing is consistent
      const merged = [];
      usedRecipeCats.forEach((usedCat) => {
        // Check if already in merged (avoid duplicates)
        if (!merged.some((m) => m.toLowerCase() === usedCat.toLowerCase())) {
          merged.push(usedCat);
        }
      });
      // Preserve any registered cats that ARE in use (take the recipe's casing as canonical)
      // Drop any registered cats with 0 recipes
      state.recipeCategories = merged;
    } else if (!state.recipeCategories || !state.recipeCategories.length) {
      state.recipeCategories = [...RECIPE_CATS_DEFAULT];
    }

    // ── Ingredient categories ──
    const usedIngCats = [
      ...new Set(
        (state.ingredients || []).map((i) => i.category).filter(Boolean),
      ),
    ];
    if (usedIngCats.length > 0) {
      const mergedIng = [];
      usedIngCats.forEach((usedCat) => {
        if (!mergedIng.some((m) => m.toLowerCase() === usedCat.toLowerCase())) {
          mergedIng.push(usedCat);
        }
      });
      // Keep registered ing cats that have 0 items (user may have created them ready to use)
      const regIngCats = state.ingCategories || [];
      regIngCats.forEach((c) => {
        const inUse = state.ingredients.some(
          (i) => (i.category || "").toLowerCase() === c.toLowerCase(),
        );
        const alreadyIn = mergedIng.some(
          (m) => m.toLowerCase() === c.toLowerCase(),
        );
        if (!inUse && !alreadyIn) mergedIng.push(c); // keep empty ing cats (intentional)
      });
      state.ingCategories = mergedIng;
    } else if (!state.ingCategories || !state.ingCategories.length) {
      state.ingCategories = [...ING_CATS_DEFAULT];
    }
  })();

  applyDarkMode(state.darkMode || false);
  renderSiteSelector();
  render();
  showView("home");
  renderLocationTabBar();
  // Show PIN lock if enabled
  if (checkPinEnabled()) showPinLock();

  // Load app version into settings
  if (window.electronAPI?.getAppVersion) {
    window.electronAPI.getAppVersion().then((v) => {
      const el = document.getElementById("app-version-label");
      if (el) el.textContent = v;
      const sidebar = document.getElementById("sidebar-version-label");
      if (sidebar) sidebar.textContent = "v" + v;
    });
  }

  // Wire up auto-update banner
  if (window.electronAPI?.onUpdateAvailable) {
    window.electronAPI.onUpdateAvailable((v) => {
      const banner = document.getElementById("update-banner");
      if (banner) banner.style.display = "flex";
      _setUpdateStatus('<span style="color:var(--accent);font-weight:600">Update available' + (v ? ' (v' + v + ')' : '') + ' — downloading…</span>');
    });
    window.electronAPI.onUpdateDownloaded((v) => {
      const btn = document.getElementById("update-install-btn");
      if (btn) btn.style.display = "block";
      _setUpdateStatus('<span style="color:var(--green);font-weight:600">Ready to install' + (v ? ' v' + v : '') + ' — restart to apply.</span>');
    });
    window.electronAPI.onUpdateError((msg) => {
      console.warn("[update-error]", msg);
    });
  }
}

function seedData() {
  state.ingredients = [
    {
      id: uid(),
      name: "Chicken Breast",
      category: "Meat & Poultry",
      packSize: 1000,
      packCost: 4.8,
      unit: "g",
      yieldPct: 90,
      allergens: [],
    },
    {
      id: uid(),
      name: "Double Cream",
      category: "Dairy",
      packSize: 500,
      packCost: 1.2,
      unit: "ml",
      yieldPct: 100,
      allergens: ["Milk"],
    },
    {
      id: uid(),
      name: "Butter",
      category: "Dairy",
      packSize: 250,
      packCost: 1.55,
      unit: "g",
      yieldPct: 100,
      allergens: ["Milk"],
    },
    {
      id: uid(),
      name: "Garlic Clove",
      category: "Vegetables",
      packSize: 1,
      packCost: 0.1,
      unit: "each",
      yieldPct: 85,
      allergens: [],
    },
    {
      id: uid(),
      name: "Thyme (fresh)",
      category: "Herbs & Spices",
      packSize: 25,
      packCost: 0.75,
      unit: "g",
      yieldPct: 80,
      allergens: [],
    },
    {
      id: uid(),
      name: "Olive Oil",
      category: "Oils & Condiments",
      packSize: 1000,
      packCost: 5.5,
      unit: "ml",
      yieldPct: 100,
      allergens: [],
    },
    {
      id: uid(),
      name: "Pasta (dried)",
      category: "Dry Goods",
      packSize: 500,
      packCost: 0.85,
      unit: "g",
      yieldPct: 100,
      allergens: ["Cereals (Gluten)", "Eggs"],
    },
    {
      id: uid(),
      name: "Parmesan",
      category: "Dairy",
      packSize: 200,
      packCost: 3.2,
      unit: "g",
      yieldPct: 100,
      allergens: ["Milk"],
    },
    {
      id: uid(),
      name: "Lemon",
      category: "Vegetables",
      packSize: 1,
      packCost: 0.35,
      unit: "each",
      yieldPct: 75,
      allergens: [],
    },
    {
      id: uid(),
      name: "Beef Mince (20%)",
      category: "Meat & Poultry",
      packSize: 500,
      packCost: 3.4,
      unit: "g",
      yieldPct: 95,
      allergens: [],
    },
  ];
  state.recipes = [
    {
      id: uid(),
      name: "Pan-Roasted Chicken",
      category: "Main",
      portions: 1,
      notes: "Serve with seasonal veg",
      ingredients: [
        { ingId: state.ingredients[0].id, qty: 220 },
        { ingId: state.ingredients[1].id, qty: 50 },
        { ingId: state.ingredients[2].id, qty: 15 },
        { ingId: state.ingredients[3].id, qty: 2 },
        { ingId: state.ingredients[4].id, qty: 3 },
      ],
      subRecipes: [],
    },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function fmt(n) {
  return (state.currency || "£") + (n || 0).toFixed(2);
}
function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function costPerUnit(ing) {
  if (!ing.packSize || !ing.packCost) return 0;
  return ing.packCost / ing.packSize / ((ing.yieldPct || 100) / 100);
}

// Unit conversion factors — returns factor to multiply qty by to get ing.unit
const UNIT_CONVERSIONS = {
  g: { kg: 1000, g: 1, oz: 28.3495, lb: 453.592 },
  kg: { g: 0.001, kg: 1, oz: 0.0283495, lb: 0.453592 },
  ml: { L: 1000, ml: 1, fl_oz: 29.5735 },
  L: { ml: 0.001, L: 1, fl_oz: 0.0295735 },
  oz: { g: 0.035274, kg: 35.274, oz: 1, lb: 16 },
  lb: { g: 0.00220462, kg: 2.20462, oz: 0.0625, lb: 1 },
};

function getConvertibleUnits(baseUnit) {
  const group = UNIT_CONVERSIONS[baseUnit];
  return group ? Object.keys(group) : [baseUnit];
}

function convertQtyToBase(qty, fromUnit, toUnit) {
  if (fromUnit === toUnit) return qty;
  const group = UNIT_CONVERSIONS[toUnit];
  if (group && group[fromUnit] !== undefined) return qty * group[fromUnit];
  return qty; // no conversion known
}

// ── Lookup Maps ───────────────────────────────────────────────────────────────
// Replaces state.*.find(x => x.id === id) O(n) calls with O(1) Map lookups.
// Rebuilt lazily on first use after invalidation. Call invalidateMaps() at
// the top of any render that follows a state mutation.
let _ingMap = null;
let _recipeMap = null;
let _supplierMap = null;

function invalidateMaps() {
  _ingMap = null;
  _recipeMap = null;
  _supplierMap = null;
}

function getIngMap() {
  if (!_ingMap) _ingMap = new Map((state.ingredients || []).map(i => [i.id, i]));
  return _ingMap;
}

function getRecipeMap() {
  if (!_recipeMap) _recipeMap = new Map((state.recipes || []).map(r => [r.id, r]));
  return _recipeMap;
}

function getSupplierMap() {
  if (!_supplierMap) _supplierMap = new Map((state.suppliers || []).map(s => [s.id, s]));
  return _supplierMap;
}

// ── Cost Cache ────────────────────────────────────────────────────────────────
// Memoises recipeTotalCost() results by recipe ID for the duration of a single
// render cycle. Cleared at the top of each render so values never go stale.
let _costCache = new Map();

function invalidateCostCache() {
  _costCache.clear();
}

function ingLineCostWithUnit(ingId, qty, recipeUnit) {
  const ing = getIngMap().get(ingId);
  if (!ing) return 0;
  // recipeUnit null/undefined means "same as library unit" — no conversion needed
  const effectiveUnit = recipeUnit || ing.unit;
  const convertedQty =
    effectiveUnit !== ing.unit
      ? convertQtyToBase(qty, effectiveUnit, ing.unit)
      : qty;
  return costPerUnit(ing) * (convertedQty || 0);
}

function ingLineCost(ingId, qty, recipeUnit) {
  return ingLineCostWithUnit(ingId, qty, recipeUnit);
}

function recipeTotalCost(recipe, _visited) {
  if (!recipe) return 0;
  const isTopLevel = !_visited;
  if (isTopLevel) {
    const cached = _costCache.get(recipe.id);
    if (cached !== undefined) return cached;
  }
  _visited = _visited || new Set();
  if (_visited.has(recipe.id)) return 0; // circular sub-recipe guard
  _visited.add(recipe.id);
  let total = 0;
  for (const ri of recipe.ingredients || [])
    total += ingLineCost(ri.ingId, ri.qty, ri.recipeUnit);
  for (const sr of recipe.subRecipes || []) {
    const sub = getRecipeMap().get(sr.recipeId);
    if (sub) total += recipeCostPerUnit(sub, _visited) * (sr.qty || 1);
  }
  if (isTopLevel) _costCache.set(recipe.id, total);
  return total;
}

// Cost per single unit of a recipe — respects yield vs portions
function recipeCostPerUnit(recipe, _visited) {
  if (!recipe) return 0;
  const total = recipeTotalCost(recipe, _visited);
  if (recipe.yieldQty && recipe.yieldQty > 0) {
    return total / recipe.yieldQty;
  }
  return total / (recipe.portions || 1);
}

// Human-readable label for what "1 unit" of a recipe means
function recipeUnitLabel(recipe) {
  if (recipe.yieldQty && recipe.yieldQty > 0) {
    return recipe.yieldUnit || "unit";
  }
  return "portion";
}

function recipeAllergens(recipe, _visited) {
  _visited = _visited || new Set();
  if (_visited.has(recipe.id)) return [];
  _visited.add(recipe.id);
  const set = new Set();
  for (const ri of recipe.ingredients || []) {
    const ing = getIngMap().get(ri.ingId);
    if (!ing) continue;
    (ing.allergens || []).forEach((a) => set.add(a));
    detectAllergens(ing.name).forEach((a) => set.add(a));
  }
  for (const sr of recipe.subRecipes || []) {
    const sub = getRecipeMap().get(sr.recipeId);
    if (sub) recipeAllergens(sub, _visited).forEach((a) => set.add(a));
  }
  return [...set];
}

function suggestPrice(foodCost, gp) {
  if (gp >= 100) return 0;
  return foodCost / (1 - gp / 100);
}

// ─── Nutrition ────────────────────────────────────────────────────────────────
function ingQtyInGrams(qty, unit) {
  const u = (unit || "").toLowerCase();
  if (u === "g") return qty;
  if (u === "kg") return qty * 1000;
  if (u === "oz") return qty * 28.3495;
  if (u === "lb") return qty * 453.592;
  if (u === "ml") return qty;
  if (u === "l") return qty * 1000;
  if (u === "fl_oz") return qty * 29.5735;
  return null;
}

function recipeNutritionTotal(recipe, _visited) {
  if (!recipe) return null;
  _visited = _visited || new Set();
  if (_visited.has(recipe.id)) return null;
  _visited.add(recipe.id);
  const nutr = { kcal: 0, protein: 0, fat: 0, carbs: 0, fibre: 0, salt: 0 };
  let hasData = false;
  let partial = false;
  for (const ri of recipe.ingredients || []) {
    const ing = getIngMap().get(ri.ingId);
    if (!ing) continue;
    if (!ing.nutrition) { partial = true; continue; }
    let qty = ri.qty;
    const rUnit = ri.recipeUnit || ing.unit;
    if (rUnit !== ing.unit) qty = convertQtyToBase(ri.qty, rUnit, ing.unit);
    const grams = ingQtyInGrams(qty, ing.unit);
    if (grams === null) { partial = true; continue; }
    const f = grams / 100;
    hasData = true;
    nutr.kcal    += (ing.nutrition.kcal    || 0) * f;
    nutr.protein += (ing.nutrition.protein || 0) * f;
    nutr.fat     += (ing.nutrition.fat     || 0) * f;
    nutr.carbs   += (ing.nutrition.carbs   || 0) * f;
    nutr.fibre   += (ing.nutrition.fibre   || 0) * f;
    nutr.salt    += (ing.nutrition.salt    || 0) * f;
  }
  for (const sr of recipe.subRecipes || []) {
    const sub = getRecipeMap().get(sr.recipeId);
    if (!sub) continue;
    const subTotal = recipeNutritionTotal(sub, new Set(_visited));
    if (!subTotal) { partial = true; continue; }
    if (subTotal.partial) partial = true;
    hasData = true;
    const divisor = sub.yieldQty || sub.portions || 1;
    const f = (sr.qty || 1) / divisor;
    nutr.kcal    += subTotal.kcal    * f;
    nutr.protein += subTotal.protein * f;
    nutr.fat     += subTotal.fat     * f;
    nutr.carbs   += subTotal.carbs   * f;
    nutr.fibre   += subTotal.fibre   * f;
    nutr.salt    += subTotal.salt    * f;
  }
  if (!hasData) return null;
  return { ...nutr, partial };
}

function buildNutritionBar(recipe) {
  const total = recipeNutritionTotal(recipe);
  if (!total) return "";
  const portions = recipe.portions || 1;
  const pp = {
    kcal:    Math.round(total.kcal    / portions),
    protein: (total.protein / portions).toFixed(1),
    fat:     (total.fat     / portions).toFixed(1),
    carbs:   (total.carbs   / portions).toFixed(1),
    fibre:   (total.fibre   / portions).toFixed(1),
    salt:    (total.salt    / portions).toFixed(2),
  };
  const cell = (val, label, col) =>
    `<div style="display:flex;flex-direction:column;align-items:center;padding:4px 13px;border-right:1px solid var(--border)">` +
    `<div style="font-size:13px;font-weight:700;color:${col || "var(--text-primary)"}">` + val + `</div>` +
    `<div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">` + label + `</div>` +
    `</div>`;
  const partialNote = total.partial
    ? `<span title="Some ingredients missing data" style="font-size:9px;color:var(--text-muted);margin-left:4px">*partial</span>`
    : "";
  return (
    `<div style="display:flex;align-items:center;background:var(--bg-card2);border-bottom:1px solid var(--border);overflow-x:auto;flex-shrink:0">` +
    `<div style="padding:0 12px;display:flex;align-items:center;gap:4px;white-space:nowrap;border-right:1px solid var(--border)">` +
    `<span style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Per portion</span>` +
    partialNote +
    `</div>` +
    cell(pp.kcal,           "kcal",    "var(--accent)") +
    cell(pp.protein + "g",  "protein", "var(--green)")  +
    cell(pp.fat     + "g",  "fat")     +
    cell(pp.carbs   + "g",  "carbs")   +
    cell(pp.fibre   + "g",  "fibre")   +
    cell(pp.salt    + "g",  "salt")    +
    `</div>`
  );
}

// GP% → markup multiplier: e.g. 70% GP = 3.33× markup
function gpToMultiplier(gp) {
  if (gp >= 100) return 0;
  return 1 / (1 - gp / 100);
}
// GP% → markup % on cost: e.g. 70% GP = 233% markup on cost
function gpToMarkupPct(gp) {
  if (gp >= 100) return 0;
  return (gpToMultiplier(gp) - 1) * 100;
}
// Sell price + cost → GP%
function priceToGP(sell, cost) {
  if (!sell || sell <= 0) return 0;
  return ((sell - cost) / sell) * 100;
}

async function showDataLocation() {
  const info = await browserIPC.getDataPath();
  showToast("Data: " + info.dataPath, "success", 6000);
}

function logAllRecipeCosts() {
  state.recipes.forEach(function (r) {
    logCostHistory(r);
  });
}

// Debounced save — coalesces rapid keystrokes/changes into one disk write.
// Use debouncedSave() in input/change handlers; use save() for critical actions.
let _saveTimer = null;
function debouncedSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(save, 600);
}

async function save() {
  clearTimeout(_saveTimer); // cancel any pending debounced save — this one wins
  // Stamp lastEdited on the active recipe whenever save is called
  if (state.activeRecipeId) {
    const ar = state.recipes.find((r) => r.id === state.activeRecipeId);
    if (ar) ar.lastEdited = new Date().toISOString();
  }
  _setSaveIndicator("saving");
  try {
    // Defensive check: ensure browserIPC and eAPI are available
    if (typeof browserIPC === "undefined" || !browserIPC.saveData) {
      throw new Error("Save system not initialized. Please restart the app.");
    }
    logAllRecipeCosts();
    if (!state.locations) state.locations = [];
    if (state.activeLocationId) saveActiveLocationData();
    await browserIPC.saveData({
      ingredients: state.ingredients,
      recipes: state.recipes,
      suppliers: state.suppliers,
      sites: state.sites,
      activeSiteId: state.activeSiteId,
      activeGP: state.activeGP,
      foodCostTarget: state.foodCostTarget,
      recipeCategories: state.recipeCategories,
      ingCategories: state.ingCategories,
      darkMode: state.darkMode,
      currency: state.currency,
      vatRate: state.vatRate,
      locations: state.locations,
      activeLocationId: state.activeLocationId,
    });
    _setSaveIndicator("saved");
    // Auto-sync to cloud folder if enabled
    _autoSyncToCloud();
  } catch (e) {
    _setSaveIndicator("error");
    showToast(
      "⚠ Save failed — your data was NOT written to disk: " + e.message,
      "error",
      8000,
    );
    console.error("[save]", e);
  }
}

let _autoSyncDebounce = null;
function _autoSyncToCloud() {
  try {
    const s = _getSyncSettings();
    if (!s.folder || !s.autoSync) return;
    // Debounce: only sync at most once per 30 seconds
    if (_autoSyncDebounce) return;
    _autoSyncDebounce = setTimeout(function() { _autoSyncDebounce = null; }, 30000);
    const data = {
      recipes: state.recipes,
      ingredients: state.ingredients,
      suppliers: state.suppliers,
      settings: {
        currency: state.currency,
        activeGP: state.activeGP,
        vatRate: state.vatRate,
        recipeCategories: state.recipeCategories
      },
      exportDate: new Date().toISOString(),
      version: state.version || '0.0.12'
    };
    window.electronAPI.syncBackupToFolder(s.folder, data).then(function(res) {
      if (res && !res.error) {
        s.lastSync = new Date().toISOString();
        _saveSyncSettings(s);
      }
    }).catch(function() {});
  } catch(e) { /* silent */ }
}

let _saveIndicatorTimer = null;
function _setSaveIndicator(status) {
  const dot = document.getElementById("autosave-dot");
  const txt = document.getElementById("autosave-text");
  if (!dot || !txt) return;
  clearTimeout(_saveIndicatorTimer);
  if (status === "saving") {
    dot.style.background = "var(--accent)";
    txt.textContent = "Saving…";
    txt.style.color = "var(--accent)";
  } else if (status === "error") {
    dot.style.background = "var(--red)";
    txt.textContent = "Save failed!";
    txt.style.color = "var(--red)";
  } else {
    dot.style.background = "var(--green)";
    txt.textContent = "Saved";
    txt.style.color = "var(--green)";
    _saveIndicatorTimer = setTimeout(() => {
      dot.style.background = "var(--text-muted)";
      txt.textContent = "All changes saved";
      txt.style.color = "var(--text-muted)";
    }, 2000);
  }
}

function showToast(msg, type = "success", duration = 3000) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast ${type}`;
  setTimeout(() => {
    t.className = "toast hidden";
  }, duration);
}

// ─── View Routing ──────────────────────────────────────────────
function showView(view) {
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.remove("active"));
  document
    .querySelectorAll(".nav-btn")
    .forEach((b) => b.classList.remove("active"));
  const viewEl = document.getElementById("view-" + view);
  if (viewEl) viewEl.classList.add("active");
  const navBtn = document.querySelector(`[data-view="${view}"]`);
  if (navBtn) navBtn.classList.add("active");
  if (view === "home") renderHome();
  if (view === "ingredients") {
    renderIngredientLibrary();
  }
  if (view === "suppliers") renderSupplierList();
  if (view === "dashboard") {
    renderDashboard();
  }
  if (view === "settings") renderSettingsPage();
  if (view === "settings")
    document.getElementById("invoice-modal")?.classList.add("hidden");
  if (view === "order-sheet") renderOrderSheet();
  if (view === "recipes") {
    // Populate category filter
    const rlCat = document.getElementById("rl-cat");
    if (rlCat) {
      const currentRlCat = rlCat.value;
      const regCatsRl = getRecipeCategories();
      const usedCatsRl = [
        ...new Set(state.recipes.map((r) => r.category).filter(Boolean)),
      ];
      const allRlCats = [...new Set([...regCatsRl, ...usedCatsRl])];
      const rlTotal = state.recipes.filter((r) => !r.yieldQty).length;
      rlCat.innerHTML =
        `<option value="">All categories (${rlTotal})</option>` +
        allRlCats
          .map((c) => {
            const cnt = state.recipes.filter(
              (r) =>
                !r.yieldQty &&
                (r.category || "").toLowerCase() === c.toLowerCase(),
            ).length;
            return `<option value="${escHtml(c)}">${escHtml(c)} (${cnt})</option>`;
          })
          .join("");
      rlCat.value = currentRlCat;
    }
    // Only show the list if no recipe is actively being opened
    if (!state.activeRecipeId) {
      showRecipeList();
    }
  }
  // Hide sidebar recipe section on list view, show on editor or other views
  updateSidebarRecipeVisibility(view);
}

function updateSidebarRecipeVisibility(view) {
  const sidebarRecipes = document.getElementById("sidebar-recipes-section");
  if (!sidebarRecipes) return;
  if (view === "recipes") {
    // Hide when viewing the recipe list panel, show when in editor
    const editorPanel = document.getElementById("recipe-editor-panel");
    const inEditor = editorPanel && editorPanel.style.display !== "none";
    sidebarRecipes.style.display = inEditor ? "" : "none";
  } else {
    // Hide on all other views (ingredients, suppliers, dashboard, etc.)
    sidebarRecipes.style.display = "none";
  }
}

// ─── Recipe List View ─────────────────────────────────────────────────────────

function timeAgo(isoStr) {
  if (!isoStr) return null;
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return "just now";
  if (mins < 60) return mins + "m ago";
  if (hours < 24) return hours + "h ago";
  if (days < 7) return days + "d ago";
  return new Date(isoStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

// ─── Virtual-scroll state for recipe list ─────────────────────────────────────
const REC_PAGE_SIZE = 60;
let _recVirtualList = [];
let _recRenderedTo = 0;

function _recBuildItem(item) {
  if (item.type === "header") {
    const { cat, count, collapsed } = item;
    return `<tr class="rl-grp-hdr" onclick="toggleRlGroup('${escHtml(cat).replace(/'/g, "\\'")}' )" style="cursor:pointer" title="Click to collapse">
        <td colspan="9">
          <div class="rl-grp-inner">
            <span class="rl-grp-arrow" style="transform:${collapsed ? "rotate(-90deg)" : ""}">▼</span>
            <span class="rl-grp-title">${escHtml(cat)}</span>
            <span class="rl-grp-count">${count}</span>
          </div>
        </td>
      </tr>`;
  }
  const { r, cpp, price, gp, gpCol, dotCol, alTags, cur } = item;
  const isActive = r.id === state.activeRecipeId;
  // Staleness badge: costing data not refreshed in 60+ days (only when date is known)
  const lastCostDate = r.lastEdited || r.createdAt;
  const daysOld = lastCostDate
    ? Math.floor((Date.now() - new Date(lastCostDate)) / 86400000)
    : null;
  const staleBadge =
    daysOld !== null && daysOld > 60
      ? `<span title="Last costed ${daysOld}d ago — prices may be outdated" style="font-size:9px;font-weight:700;color:var(--red);background:rgba(220,53,69,0.1);border:1px solid rgba(220,53,69,0.3);border-radius:3px;padding:1px 5px;vertical-align:middle;margin-left:4px">⚠ ${daysOld}d old</span>`
      : "";
  const lockIcon = r.locked
    ? '<span title="Recipe locked" style="font-size:11px;margin-left:4px">🔒</span>'
    : "";
  const timeInfo = [
    r.prepTime ? r.prepTime + "m prep" : "",
    r.cookTime ? r.cookTime + "m cook" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<tr class="rl-row${isActive ? " rl-row-active" : ""}" onclick="openRecipeFromList('${r.id}')">
      <td style="padding:10px 4px 10px 14px;width:32px" onclick="event.stopPropagation()">
        <input type="checkbox" class="rl-row-check" data-id="${r.id}" onchange="onRlCheckChange()"
          style="width:14px;height:14px;cursor:pointer;accent-color:var(--accent)" />
      </td>
      <td class="rl-dot-cell"><span class="rl-dot" style="background:${dotCol}"></span></td>
      <td class="rl-name-cell">
        <div class="rl-name">${escHtml(r.name)}${lockIcon}${r.pricedFlag ? ' <span style="font-size:9px;font-weight:700;color:var(--green);background:rgba(76,175,125,0.12);border:1px solid rgba(76,175,125,0.3);border-radius:3px;padding:1px 5px;vertical-align:middle">✓ PRICED</span>' : ""}${staleBadge}</div>
        <div class="rl-sub">${r.ingredients.length} ingredient${r.ingredients.length !== 1 ? "s" : ""}${(r.methods || []).length ? " · " + r.methods.length + " steps" : ""}${timeInfo ? " · " + timeInfo : ""}${r.tags?.length ? " · " + r.tags.map((t) => "#" + t).join(" ") : ""}${r.lastEdited ? " · edited " + timeAgo(r.lastEdited) : ""}</div>
      </td>
      <td class="rl-portions-cell">${r.portions || 1}</td>
      <td class="rl-cost-cell">${cur}${cpp.toFixed(2)}</td>
      <td class="rl-price-cell">
        ${price ? `<span class="rl-price-val">${cur}${price.toFixed(2)}</span>` : '<span class="rl-no-price">—</span>'}
      </td>
      <td class="rl-gp-cell">
        <span style="font-size:12px;font-weight:700;color:${gpCol}">${gp !== null ? gp.toFixed(0) + "%" : "—"}</span>
      </td>
      <td class="rl-al-cell">${alTags}</td>
      <td class="rl-actions-cell">
        <div class="rl-row-actions">
          <button class="btn-icon" onclick="event.stopPropagation();openRecipeFromList('${r.id}')" title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon danger" onclick="event.stopPropagation();deleteRecipe('${r.id}')" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
}

function _recAppendRows(tbody, upTo) {
  const frag = document.createDocumentFragment();
  const temp = document.createElement("tbody");
  const end = Math.min(upTo, _recVirtualList.length);
  for (let i = _recRenderedTo; i < end; i++) {
    temp.innerHTML = _recBuildItem(_recVirtualList[i]);
    frag.appendChild(temp.firstChild);
  }
  tbody.appendChild(frag);
  _recRenderedTo = end;
}

function _recSetupScroll(tbody) {
  const scroller =
    tbody.closest(".table-scroll-wrap") ||
    tbody.closest('[style*="overflow"]') ||
    tbody.parentElement?.parentElement;
  if (!scroller || scroller._recScrollBound) return;
  scroller._recScrollBound = true;
  scroller.addEventListener(
    "scroll",
    function () {
      if (_recRenderedTo >= _recVirtualList.length) return;
      const nearBottom =
        scroller.scrollTop + scroller.clientHeight >=
        scroller.scrollHeight - 300;
      if (nearBottom) _recAppendRows(tbody, _recRenderedTo + REC_PAGE_SIZE);
    },
    { passive: true },
  );
}

const _rlTagFilters = new Set();
function toggleRlTagFilter(tag) {
  if (_rlTagFilters.has(tag)) _rlTagFilters.delete(tag);
  else _rlTagFilters.add(tag);
  renderRecipeList();
}
function clearRlTagFilters() {
  _rlTagFilters.clear();
  renderRecipeList();
}

var _rlViewMode = 'list'; // 'list' or 'gallery'
function setRecipeView(mode) {
  _rlViewMode = mode;
  // Update toggle button styles
  var listBtn = document.getElementById('rl-view-list');
  var galBtn = document.getElementById('rl-view-gallery');
  if (listBtn) {
    listBtn.style.background = mode === 'list' ? 'var(--accent-bg)' : 'transparent';
    listBtn.style.color = mode === 'list' ? 'var(--accent)' : 'var(--text-muted)';
  }
  if (galBtn) {
    galBtn.style.background = mode === 'gallery' ? 'var(--accent-bg)' : 'transparent';
    galBtn.style.color = mode === 'gallery' ? 'var(--accent)' : 'var(--text-muted)';
  }
  renderRecipeList();
}

function renderRecipeList() {
  invalidateMaps();
  invalidateCostCache();
  // Keep supplier dropdown fresh
  const rlSupEl = document.getElementById("rl-supplier");
  if (rlSupEl) {
    const savedSup = rlSupEl.value;
    rlSupEl.innerHTML =
      '<option value="">All suppliers</option>' +
      state.suppliers
        .map((s) => `<option value="${s.id}">${escHtml(s.name)}</option>`)
        .join("");
    rlSupEl.value = savedSup;
  }
  // Keep category dropdown fresh every render
  const rlCatEl = document.getElementById("rl-cat");
  if (rlCatEl) {
    const savedVal = rlCatEl.value;
    const regC = getRecipeCategories();
    const usedC = [
      ...new Set(state.recipes.map((r) => r.category).filter(Boolean)),
    ];
    const allC = [...new Set([...regC, ...usedC])];
    const tot = state.recipes.filter((r) => !r.yieldQty).length;
    rlCatEl.innerHTML =
      `<option value="">All categories (${tot})</option>` +
      allC
        .map((c) => {
          const cnt = state.recipes.filter(
            (r) =>
              !r.yieldQty &&
              (r.category || "").toLowerCase() === c.toLowerCase(),
          ).length;
          return `<option value="${escHtml(c)}">${escHtml(c)} (${cnt})</option>`;
        })
        .join("");
    rlCatEl.value = savedVal;
  }
  const container = document.getElementById("recipe-list-view");
  if (!container) return;

  const searchVal = (
    document.getElementById("rl-search")?.value || ""
  ).toLowerCase();
  const catFilter = document.getElementById("rl-cat")?.value || "";
  const gpFilter = document.getElementById("rl-gp")?.value || "";
  const sortVal = document.getElementById("rl-sort")?.value || "name";
  const cur = state.currency || "£";
  const target = getFoodCostTarget();

  const supplierFilter = document.getElementById("rl-supplier")?.value || "";
  let recipes = state.recipes.filter((r) => !r.yieldQty);
  if (searchVal) {
    // Support #tag search
    const tagSearch = searchVal.startsWith("#") ? searchVal.slice(1) : null;
    recipes = recipes.filter((r) => {
      if (tagSearch)
        return (r.tags || []).some((t) => t.toLowerCase().includes(tagSearch));
      return (
        r.name.toLowerCase().includes(searchVal) ||
        (r.category || "").toLowerCase().includes(searchVal) ||
        (r.notes || "").toLowerCase().includes(searchVal) ||
        (r.tags || []).some((t) => t.toLowerCase().includes(searchVal))
      );
    });
  }
  if (supplierFilter) {
    recipes = recipes.filter((r) =>
      r.ingredients.some((ri) => {
        const ing = state.ingredients.find((i) => i.id === ri.ingId);
        return ing && ing.supplierId === supplierFilter;
      }),
    );
  }
  if (catFilter)
    recipes = recipes.filter(
      (r) => (r.category || "").toLowerCase() === catFilter.toLowerCase(),
    );
  if (gpFilter === "priced") recipes = recipes.filter((r) => r.priceOverride);
  if (gpFilter === "unpriced")
    recipes = recipes.filter((r) => !r.priceOverride);
  if (gpFilter === "ok")
    recipes = recipes.filter((r) => {
      const p = r.priceOverride;
      const cpp = recipeTotalCost(r) / (r.portions || 1);
      return p && (cpp / p) * 100 <= target;
    });
  if (gpFilter === "over")
    recipes = recipes.filter((r) => {
      const p = r.priceOverride;
      const cpp = recipeTotalCost(r) / (r.portions || 1);
      return p && (cpp / p) * 100 > target;
    });
  if (gpFilter === "confirmed") recipes = recipes.filter((r) => r.pricedFlag);
  if (gpFilter === "unconfirmed")
    recipes = recipes.filter((r) => !r.pricedFlag);
  if (gpFilter === "status-draft")
    recipes = recipes.filter((r) => !r.status || r.status === "draft");
  if (gpFilter === "status-review")
    recipes = recipes.filter((r) => r.status === "review");
  if (gpFilter === "status-approved")
    recipes = recipes.filter((r) => r.status === "approved");
  // Tag filter chips
  if (_rlTagFilters.size > 0)
    recipes = recipes.filter((r) =>
      [..._rlTagFilters].every((t) => (r.tags || []).includes(t)),
    );
  // Populate tag bar
  const tagBar = document.getElementById("rl-tag-bar");
  if (tagBar) {
    const allTags = new Map();
    state.recipes.filter((r) => !r.yieldQty).forEach((r) =>
      (r.tags || []).forEach((t) => allTags.set(t, (allTags.get(t) || 0) + 1)),
    );
    if (allTags.size > 0) {
      tagBar.style.display = "flex";
      const sorted = [...allTags.entries()].sort((a, b) => b[1] - a[1]);
      tagBar.innerHTML =
        '<span style="font-size:11px;color:var(--text-muted);font-weight:600;flex-shrink:0">Tags:</span>' +
        sorted.map(([tag, cnt]) => {
          const active = _rlTagFilters.has(tag);
          return `<button onclick="toggleRlTagFilter('${tag.replace(/'/g, "\\'")}')"
            style="font-size:11px;padding:2px 8px;border-radius:12px;border:1px solid ${active ? "var(--accent)" : "var(--border)"};
            background:${active ? "var(--accent-bg)" : "transparent"};color:${active ? "var(--accent)" : "var(--text-secondary)"};
            cursor:pointer;font-weight:${active ? "700" : "500"};white-space:nowrap">#${escHtml(tag)} <span style="color:var(--text-muted);font-size:10px">${cnt}</span></button>`;
        }).join("") +
        (_rlTagFilters.size > 0
          ? '<button onclick="clearRlTagFilters()" style="font-size:10px;padding:2px 8px;border:none;background:none;color:var(--red);cursor:pointer;font-weight:600">✕ Clear</button>'
          : "");
    } else {
      tagBar.style.display = "none";
    }
  }
  // Sort
  recipes = [...recipes].sort((a, b) => {
    if (sortVal === "name") return a.name.localeCompare(b.name);
    if (sortVal === "cat")
      return (a.category || "").localeCompare(b.category || "");
    if (sortVal === "cost")
      return (
        recipeTotalCost(a) / (a.portions || 1) -
        recipeTotalCost(b) / (b.portions || 1)
      );
    if (sortVal === "price")
      return (b.priceOverride || 0) - (a.priceOverride || 0);
    if (sortVal === "gp") {
      const gpA = a.priceOverride
        ? ((a.priceOverride - recipeTotalCost(a) / (a.portions || 1)) /
            a.priceOverride) *
          100
        : -1;
      const gpB = b.priceOverride
        ? ((b.priceOverride - recipeTotalCost(b) / (b.portions || 1)) /
            b.priceOverride) *
          100
        : -1;
      return gpB - gpA;
    }
    return 0;
  });

  // Stats
  const allRecipes = state.recipes.filter((r) => !r.yieldQty);
  const priced = allRecipes.filter((r) => r.priceOverride).length;
  const onTarget = allRecipes.filter((r) => {
    const p = r.priceOverride;
    const cpp = recipeTotalCost(r) / (r.portions || 1);
    return p && (cpp / p) * 100 <= target;
  }).length;
  const overTgt = allRecipes.filter((r) => {
    const p = r.priceOverride;
    const cpp = recipeTotalCost(r) / (r.portions || 1);
    return p && (cpp / p) * 100 > target;
  }).length;
  const unpriced = allRecipes.filter((r) => !r.priceOverride).length;

  // Update stat chips
  const statsEl = document.getElementById("rl-stats");
  if (statsEl)
    statsEl.innerHTML = `
    <div class="rl-chip">${allRecipes.length} recipe${allRecipes.length !== 1 ? "s" : ""}</div>
    <div class="rl-chip rl-chip-ok">${priced} priced</div>
    <div class="rl-chip rl-chip-ok">${onTarget} on target</div>
    ${overTgt ? `<div class="rl-chip rl-chip-warn">${overTgt} over target</div>` : ""}
    ${unpriced ? `<div class="rl-chip rl-chip-none">${unpriced} no price</div>` : ""}
  `;

  // Group by category
  if (!recipes.length) {
    container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--text-muted)">No recipes match your filters</div>`;
    return;
  }

  const grouped = {};
  const catOrder = getRecipeCategories();
  recipes.forEach((r) => {
    const cat = r.category || "Uncategorised";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(r);
  });

  const sortedCats = [
    ...catOrder.filter((c) => grouped[c]),
    ...Object.keys(grouped).filter((c) => !catOrder.includes(c)),
  ];

  // Build flat virtual list (group headers + recipe rows)
  if (!window._rlCollapsed) window._rlCollapsed = {};
  _recVirtualList = [];
  sortedCats.forEach((cat) => {
    const recs = grouped[cat];
    if (!recs) return;
    const collapsed = window._rlCollapsed[cat];
    _recVirtualList.push({
      type: "header",
      cat,
      count: recs.length,
      collapsed,
    });
    if (!collapsed) {
      recs.forEach((r) => {
        const cpp = recipeTotalCost(r) / (r.portions || 1);
        const price = r.priceOverride;
        const gp = price ? ((price - cpp) / price) * 100 : null;
        const fc = price ? (cpp / price) * 100 : null;
        const gpCol = !price
          ? "var(--text-muted)"
          : fc <= target
            ? "var(--green)"
            : fc <= target + 5
              ? "var(--accent)"
              : "var(--red)";
        const dotCol = !price
          ? "var(--border-light)"
          : fc <= target
            ? "var(--green)"
            : fc <= target + 5
              ? "var(--accent)"
              : "var(--red)";
        const allergens = recipeAllergens(r);
        const alTags = allergens.length
          ? allergens
              .map((a) => `<span class="rl-al-tag">${escHtml(a)}</span>`)
              .join("")
          : `<span class="rl-al-none">None</span>`;
        _recVirtualList.push({
          type: "row",
          r,
          cpp,
          price,
          gp,
          gpCol,
          dotCol,
          alTags,
          cur,
        });
      });
    }
  });

  if (_rlViewMode === 'gallery') {
    _renderRecipeGallery(container, recipes, cur, target);
    return;
  }

  container.innerHTML = `
    <table class="rl-table dash-table" style="margin:0">
      <thead>
        <tr>
          <th style="width:32px;padding:8px"><input type="checkbox" id="rl-check-all" onchange="toggleAllRlChecks(this.checked)" style="width:14px;height:14px;cursor:pointer;accent-color:var(--accent)" title="Select all visible" /></th>
          <th style="width:20px"></th>
          <th>Recipe name</th>
          <th style="text-align:center;width:72px">Portions</th>
          <th style="text-align:right;width:100px">Cost/portion</th>
          <th style="text-align:right;width:90px">Sell price</th>
          <th style="text-align:right;width:64px">GP %</th>
          <th style="width:220px">Allergens</th>
          <th style="width:64px"></th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>`;
  const tbody = container.querySelector("tbody");
  _recRenderedTo = 0;
  _recAppendRows(tbody, REC_PAGE_SIZE);
  _recSetupScroll(tbody);
}

function _renderRecipeGallery(container, recipes, cur, target) {
  var cards = recipes.map(function(r) {
    var totalCost = recipeTotalCost(r);
    var portions = r.portions || 1;
    var cpp = totalCost / portions;
    var price = r.priceOverride;
    var gp = price ? ((price - cpp) / price) * 100 : null;
    var fc = price ? (cpp / price) * 100 : null;
    var gpCol = !price ? 'var(--text-muted)' : fc <= target ? 'var(--green)' : fc <= target + 5 ? 'var(--accent)' : 'var(--red)';
    var allergens = recipeAllergens(r);
    var alStr = allergens.length ? allergens.slice(0, 3).join(', ') + (allergens.length > 3 ? ' +' + (allergens.length - 3) : '') : '';

    var photoHtml = r.photo
      ? '<img src="' + r.photo + '" style="width:100%;height:100%;object-fit:cover" />'
      : '<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg-card2);color:var(--text-muted)">'
        + '<span style="font-size:36px;margin-bottom:4px">📷</span>'
        + '<span style="font-size:10px">No photo</span></div>';

    var catBadge = r.category
      ? '<span style="position:absolute;top:8px;left:8px;font-size:9px;font-weight:700;background:rgba(0,0,0,.55);color:#fff;padding:2px 7px;border-radius:3px;text-transform:uppercase;letter-spacing:.5px">' + escHtml(r.category) + '</span>'
      : '';

    var gpBadge = gp !== null
      ? '<span style="position:absolute;top:8px;right:8px;font-size:10px;font-weight:800;background:' + (fc <= target ? 'rgba(34,197,94,.85)' : fc <= target + 5 ? 'rgba(232,124,46,.85)' : 'rgba(220,38,38,.85)') + ';color:#fff;padding:2px 7px;border-radius:3px">' + gp.toFixed(0) + '%</span>'
      : '';

    return '<div class="rg-card" onclick="openRecipeFromList(\'' + r.id + '\')" style="cursor:pointer;border-radius:var(--radius);border:1px solid var(--border);overflow:hidden;background:var(--bg-card);transition:transform .15s,box-shadow .15s">'
      + '<div style="position:relative;width:100%;height:160px;overflow:hidden">' + photoHtml + catBadge + gpBadge + '</div>'
      + '<div style="padding:10px 12px">'
      + '<div style="font-weight:700;font-size:13px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + escAttr(r.name) + '">' + escHtml(r.name) + '</div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">'
      + '<div style="font-size:11px;color:var(--text-secondary)">'
      + '<span style="font-weight:600">Cost:</span> ' + cur + cpp.toFixed(2)
      + (price ? ' &nbsp;·&nbsp; <span style="font-weight:600">Sell:</span> ' + cur + price.toFixed(2) : '')
      + '</div>'
      + (gp !== null ? '<span style="font-size:11px;font-weight:800;color:' + gpCol + '">' + gp.toFixed(0) + '% GP</span>' : '')
      + '</div>'
      + (alStr ? '<div style="margin-top:5px;font-size:10px;color:var(--text-muted)">⚠ ' + escHtml(alStr) + '</div>' : '')
      + '<div style="margin-top:5px;font-size:10px;color:var(--text-muted)">' + portions + ' portion' + (portions !== 1 ? 's' : '') + ' · ' + r.ingredients.length + ' ingredient' + (r.ingredients.length !== 1 ? 's' : '') + '</div>'
      + '</div></div>';
  }).join('');

  container.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;padding:16px">' + cards + '</div>';
}

function onRlCheckChange() {
  const checks = document.querySelectorAll(".rl-row-check:checked");
  const all = document.querySelectorAll(".rl-row-check");
  const bar = document.getElementById("rl-bulk-bar");
  const countEl = document.getElementById("rl-bulk-count");
  const checkAll = document.getElementById("rl-check-all");
  if (!bar) return;
  if (checks.length > 0) {
    bar.style.display = "flex";
    countEl.textContent = checks.length + " selected";
    // Populate category dropdown
    const catSel = document.getElementById("rl-bulk-cat");
    if (catSel) {
      const cats = getRecipeCategories();
      const usedCats = [
        ...new Set(state.recipes.map((r) => r.category).filter(Boolean)),
      ];
      const allCats = [...new Set([...cats, ...usedCats])];
      catSel.innerHTML = allCats
        .map((c) => `<option value="${escHtml(c)}">${escHtml(c)}</option>`)
        .join("");
    }
  } else {
    bar.style.display = "none";
  }
  if (checkAll)
    checkAll.checked = all.length > 0 && checks.length === all.length;
}

function toggleAllRlChecks(checked) {
  document.querySelectorAll(".rl-row-check").forEach((cb) => {
    cb.checked = checked;
  });
  onRlCheckChange();
}

function clearRlSelection() {
  document.querySelectorAll(".rl-row-check").forEach((cb) => {
    cb.checked = false;
  });
  const checkAll = document.getElementById("rl-check-all");
  if (checkAll) checkAll.checked = false;
  const bar = document.getElementById("rl-bulk-bar");
  if (bar) bar.style.display = "none";
}

function applyRlBulkCat() {
  const checks = document.querySelectorAll(".rl-row-check:checked");
  const newCat = document.getElementById("rl-bulk-cat")?.value;
  if (!checks.length || !newCat) return;
  const ids = [...checks].map((cb) => cb.dataset.id);
  ids.forEach((id) => {
    const r = state.recipes.find((r) => r.id === id);
    if (r) r.category = newCat;
  });
  save();
  clearRlSelection();
  renderRecipeList();
  renderSidebarRecipes();
  showToast(
    `✓ ${ids.length} recipe${ids.length !== 1 ? "s" : ""} moved to "${newCat}"`,
    "success",
    2000,
  );
}

function applyRlBulkStatus() {
  const checks = document.querySelectorAll(".rl-row-check:checked");
  const newStatus = document.getElementById("rl-bulk-status")?.value;
  if (!checks.length || !newStatus) return;
  const ids = [...checks].map((cb) => cb.dataset.id);
  ids.forEach((id) => {
    const r = state.recipes.find((r) => r.id === id);
    if (r) r.status = newStatus;
  });
  save();
  clearRlSelection();
  renderRecipeList();
  renderSidebarRecipes();
  const label =
    { draft: "Draft", review: "In Review", approved: "Approved" }[newStatus] ||
    newStatus;
  showToast(
    `✓ ${ids.length} recipe${ids.length !== 1 ? "s" : ""} set to ${label}`,
    "success",
    2000,
  );
}

async function applyRlBulkExport() {
  const checks = document.querySelectorAll(".rl-row-check:checked");
  if (!checks.length) return;
  const ids = new Set([...checks].map((cb) => cb.dataset.id));
  const selected = state.recipes.filter((r) => ids.has(r.id));
  if (!selected.length) return;
  // Reuse the existing exportAllRecipesExcel but filtered
  const _orig = state.recipes;
  state.recipes = selected;
  await exportAllRecipesExcel();
  state.recipes = _orig;
  clearRlSelection();
}

function toggleRlGroup(cat) {
  if (!window._rlCollapsed) window._rlCollapsed = {};
  window._rlCollapsed[cat] = !window._rlCollapsed[cat];
  renderRecipeList();
}

function openRecipeFromList(id) {
  selectRecipe(id);
  const listPanel = document.getElementById("recipe-list-panel");
  const editorPanel = document.getElementById("recipe-editor-panel");
  if (listPanel) listPanel.style.display = "none";
  if (editorPanel) editorPanel.style.display = "flex";
  renderRecipeEditor();
  updateSidebarRecipeVisibility("recipes");
}

function showRecipeList() {
  const listPanel = document.getElementById("recipe-list-panel");
  const editorPanel = document.getElementById("recipe-editor-panel");
  if (listPanel) listPanel.style.display = "flex";
  if (editorPanel) editorPanel.style.display = "none";
  renderRecipeList();
  updateSidebarRecipeVisibility("recipes");
}

// ─── Home Page ────────────────────────────────────────────────────────────────
function renderHome() {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const greetEl = document.getElementById("home-greeting");
  if (greetEl) greetEl.textContent = greeting + " \u{1F44B}";

  const container = document.getElementById("home-content");
  if (!container) return;

  const recipes = state.recipes || [];
  const ingredients = state.ingredients || [];
  const suppliers = state.suppliers || [];
  const now = Date.now();
  const gpTarget = state.activeGP || 70;
  const cur = state.currency || "\u00a3";

  // ── Health data ────────────────────────────────────────────────────────
  const sellable = recipes.filter((r) => !r.yieldQty);

  const noPrice = sellable.filter((r) => !r.priceOverride);

  const belowGP = sellable.filter((r) => {
    if (!r.priceOverride) return false;
    const cpp = recipeTotalCost(r) / (r.portions || 1);
    return ((r.priceOverride - cpp) / r.priceOverride) * 100 < gpTarget - 2;
  });

  const staleCosting = sellable.filter((r) => {
    const hist = r.costHistory || [];
    if (!hist.length) return false;
    const lastDate = new Date(hist[hist.length - 1].date).getTime();
    return now - lastDate > 30 * 86400000;
  });

  const noCat = sellable.filter((r) => !r.category);

  const totalIssues =
    noPrice.length + belowGP.length + staleCosting.length + noCat.length;

  // Update subtitle
  const summaryEl = document.getElementById("home-health-summary");
  if (summaryEl)
    summaryEl.textContent =
      totalIssues > 0
        ? totalIssues +
          " item" +
          (totalIssues !== 1 ? "s" : "") +
          " need attention"
        : "Everything looks good \u2713";

  // ── Recently edited ────────────────────────────────────────────────────
  const withDate = recipes
    .map((r) => {
      const lastCost = (r.costHistory || []).slice(-1)[0];
      const lastVer = (r.versions || []).slice(-1)[0];
      const dates = [lastCost?.date, lastVer?.savedAt].filter(Boolean);
      const latest = dates.sort().slice(-1)[0] || null;
      return { r, latest };
    })
    .filter((x) => x.latest)
    .sort((a, b) => b.latest.localeCompare(a.latest))
    .slice(0, 5);

  function issueRow(r, badge, action) {
    const cpp = recipeTotalCost(r) / (r.portions || 1);
    const price = r.priceOverride || null;
    const gp = price ? ((price - cpp) / price) * 100 : null;
    const gpCol =
      gp === null
        ? "var(--text-muted)"
        : gp >= gpTarget
          ? "var(--green)"
          : gp >= gpTarget - 8
            ? "var(--accent)"
            : "var(--red)";
    return `<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:6px;background:var(--bg-card2);margin-bottom:3px;cursor:pointer"
      onclick="selectRecipe('${r.id}');showView('recipes')"
      onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background='var(--bg-card2)'">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r.name)}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:1px">${escHtml(r.category || "\u2014")} \u00b7 ${fmt(cpp)}/portion</div>
      </div>
      ${gp !== null ? `<div style="font-size:11px;font-weight:700;color:${gpCol};flex-shrink:0">${gp.toFixed(0)}%</div>` : ""}
      <button class="btn-primary btn-sm" style="font-size:11px;padding:3px 10px;flex-shrink:0"
        onclick="event.stopPropagation();selectRecipe('${r.id}');showView('recipes');setTimeout(()=>document.getElementById('price-override-input')?.focus(),300)">
        ${action}
      </button>
    </div>`;
  }

  function sectionHtml(title, col, items, action, showMoreFn) {
    const shown = items.slice(0, 5);
    const extra = items.length - shown.length;
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-top:3px solid ${col};border-radius:var(--radius);padding:14px 14px 10px;display:flex;flex-direction:column;gap:0">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:${col};margin-bottom:10px">
        ${title} <span style="font-size:11px;font-weight:700;background:${col};color:#fff;border-radius:10px;padding:1px 7px;margin-left:4px">${items.length}</span>
      </div>
      ${shown.map((r) => issueRow(r, "", action)).join("")}
      ${extra > 0 ? `<div style="font-size:11px;color:var(--text-muted);padding:4px 2px;cursor:pointer" onclick="showView('recipes')">\u2026 ${extra} more \u2014 view all recipes</div>` : ""}
    </div>`;
  }

  // ── Getting started checklist ────────────────────────────────────────────
  const hasIngredients = state.ingredients.length >= 3;
  const hasRecipes = sellable.length >= 1;
  const hasPrices = sellable.some((r) => r.priceOverride);
  const hasSupplier = state.suppliers.length >= 1;
  const setupDone = hasIngredients && hasRecipes && hasPrices;

  const checklistHtml = !setupDone
    ? (() => {
        const steps = [
          {
            done: hasIngredients,
            num: "1",
            title: "Add your ingredients",
            desc: "Build your ingredient library with pack sizes and costs — this powers all your recipe costing.",
            action: "showView('ingredients')",
            btn: "Go to ingredients →",
          },
          {
            done: hasRecipes,
            num: "2",
            title: "Build your first recipe",
            desc: "Add ingredients to a recipe and see the cost per portion calculated automatically.",
            action: "newRecipe();showView('recipes')",
            btn: "Create a recipe →",
          },
          {
            done: hasPrices,
            num: "3",
            title: "Set sell prices",
            desc: "Enter your menu prices to see GP% for every dish and spot anything below target.",
            action: "openSetPricesModal()",
            btn: "Set prices →",
          },
        ];
        const doneCount = steps.filter((s) => s.done).length;
        const pct = Math.round((doneCount / steps.length) * 100);

        return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px;margin-bottom:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--text-primary)">Getting started</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${doneCount} of ${steps.length} steps complete</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:100px;height:6px;background:var(--bg-card2);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px;transition:width .3s"></div>
          </div>
          <span style="font-size:12px;font-weight:700;color:var(--accent)">${pct}%</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${steps
          .map(
            (step) => `
          <div style="display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:8px;background:${step.done ? "var(--bg-card2)" : "var(--bg-app)"};border:1px solid ${step.done ? "var(--border)" : "var(--border-light)"}">
            <div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;font-weight:700;
              background:${step.done ? "var(--green)" : "var(--bg-card2)"};
              color:${step.done ? "#fff" : "var(--text-muted)"};
              border:1px solid ${step.done ? "transparent" : "var(--border)"}">
              ${step.done ? "✓" : step.num}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:${step.done ? "var(--text-muted)" : "var(--text-primary)"};${step.done ? "text-decoration:line-through;" : ""}">${step.title}</div>
              ${!step.done ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${step.desc}</div>` : ""}
            </div>
            ${!step.done ? `<button class="btn-primary btn-sm" style="flex-shrink:0;font-size:11px;padding:5px 12px" onclick="${step.action}">${step.btn}</button>` : ""}
          </div>`,
          )
          .join("")}
      </div>
      <div style="margin-top:10px;text-align:right">
        <button style="background:none;border:none;color:var(--text-muted);font-size:11px;cursor:pointer;padding:2px 0" onclick="this.closest('[style*=margin-bottom]').style.display='none'">Dismiss ✕</button>
      </div>
    </div>`;
      })()
    : "";

  // Stats row
  const statsHtml = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
    ${[
      {
        val: sellable.length,
        lbl: "Recipes",
        col: "var(--text-primary)",
        action: "showView('recipes')",
      },
      {
        val: noPrice.length,
        lbl: "No price set",
        col: noPrice.length ? "var(--red)" : "var(--green)",
        action: "showView('recipes')",
      },
      {
        val: belowGP.length,
        lbl: "Below GP target",
        col: belowGP.length ? "var(--accent)" : "var(--green)",
        action: "showView('dashboard')",
      },
      {
        val: staleCosting.length,
        lbl: "Stale costing",
        col: staleCosting.length > 5 ? "var(--accent)" : "var(--text-muted)",
        action: "showView('recipes')",
      },
    ]
      .map(
        (
          s,
        ) => `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;cursor:pointer"
      onclick="${s.action}"
      onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background='var(--bg-card)'">
      <div style="font-size:24px;font-weight:800;color:${s.col};line-height:1">${s.val}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${s.lbl}</div>
    </div>`,
      )
      .join("")}
  </div>`;

  // Issues grid
  const issueGrid =
    noPrice.length || belowGP.length || staleCosting.length || noCat.length
      ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px">
      ${noPrice.length ? sectionHtml("No sell price", "var(--red)", noPrice, "Set price") : ""}
      ${belowGP.length ? sectionHtml("Below " + gpTarget + "% GP target", "var(--accent)", belowGP, "Edit") : ""}
      ${staleCosting.length > 5 ? sectionHtml("Not costed in 30+ days", "var(--blue)", staleCosting, "Open") : ""}
      ${noCat.length ? sectionHtml("No category", "var(--text-muted)", noCat, "Categorise") : ""}
    </div>`
      : `<div style="padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);color:var(--green);font-weight:600;text-align:center;margin-bottom:20px">\u2713 No issues found \u2014 all recipes are priced, on target and freshly costed</div>`;

  // Recently edited
  const recentHtml = withDate.length
    ? `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:14px">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:10px">Recently edited</div>
      ${withDate
        .map(({ r, latest }) => {
          const cpp = recipeTotalCost(r) / (r.portions || 1);
          const price = r.priceOverride || suggestPrice(cpp, state.activeGP);
          const gp = price > 0 ? ((price - cpp) / price) * 100 : 0;
          const gpCol =
            gp >= gpTarget
              ? "var(--green)"
              : gp >= gpTarget - 8
                ? "var(--accent)"
                : "var(--red)";
          const date = new Date(latest).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
          });
          return `<div style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;cursor:pointer"
          onclick="selectRecipe('${r.id}');showView('recipes')"
          onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r.name)}</div>
            <div style="font-size:10px;color:var(--text-muted)">${escHtml(r.category || "\u2014")} \u00b7 ${date}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:12px;font-weight:700;color:var(--accent)">${fmt(price)}</div>
            <div style="font-size:10px;color:${gpCol}">${gp.toFixed(0)}% GP</div>
          </div>
        </div>`;
        })
        .join("")}
    </div>`
    : "";

  container.innerHTML = checklistHtml + statsHtml + issueGrid + recentHtml;
}

function render() {
  renderSidebarRecipes();
}

// ─── Sites ────────────────────────────────────────────────────
function getActiveSite() {
  return state.sites.find((s) => s.id === state.activeSiteId) || null;
}

// ─── Multi-Location ────────────────────────────────────────────
function getActiveLocation() {
  if (!state.locations) return null;
  return state.locations.find((l) => l.id === state.activeLocationId) || null;
}

function saveActiveLocationData() {
  if (!state.locations) state.locations = [];
  // Persist current state into the active location blob
  const loc = getActiveLocation();
  if (!loc) return;
  loc.recipes = JSON.parse(JSON.stringify(state.recipes));
  loc.ingredients = JSON.parse(JSON.stringify(state.ingredients));
  loc.suppliers = JSON.parse(JSON.stringify(state.suppliers));
  loc.recipeCategories = JSON.parse(JSON.stringify(state.recipeCategories));
  loc.ingCategories = JSON.parse(JSON.stringify(state.ingCategories));
  loc.activeGP = state.activeGP;
  loc.foodCostTarget = state.foodCostTarget;
  loc.currency = state.currency;
  loc.vatRate = state.vatRate;
  loc.activeRecipeId = state.activeRecipeId;
}

function loadLocationData(locationId) {
  if (!state.locations) state.locations = [];

  // Save current in-memory state back to the active location ONLY if
  // state.recipes actually belongs to that location (not a stale/partial load)
  if (state.activeLocationId && state.activeLocationId !== locationId) {
    const currentLoc = state.locations.find(
      (l) => l.id === state.activeLocationId,
    );
    if (currentLoc) {
      // Only overwrite if our in-memory count roughly matches what's stored
      // This prevents a partial/empty state from clobbering real data
      const storedCount = (currentLoc.recipes || []).length;
      const memCount = state.recipes.length;
      if (memCount >= storedCount || storedCount === 0) {
        saveActiveLocationData();
      }
      // If memCount < storedCount, it means state was not fully loaded —
      // don't overwrite the stored data with fewer recipes
    }
  }

  state.activeLocationId = locationId;
  state.activeRecipeId = null;

  if (!locationId) return;

  const loc = state.locations.find((l) => l.id === locationId);
  if (!loc) return;

  state.recipes = JSON.parse(JSON.stringify(loc.recipes || []));
  state.ingredients = JSON.parse(JSON.stringify(loc.ingredients || []));
  state.suppliers = JSON.parse(JSON.stringify(loc.suppliers || []));
  state.recipeCategories = JSON.parse(
    JSON.stringify(loc.recipeCategories || []),
  );
  state.ingCategories = JSON.parse(JSON.stringify(loc.ingCategories || []));
  state.activeGP = loc.activeGP || state.activeGP;
  state.foodCostTarget = loc.foodCostTarget || state.foodCostTarget;
  state.currency = loc.currency || state.currency;
  state.vatRate = loc.vatRate != null ? loc.vatRate : state.vatRate;
  state.activeRecipeId = loc.activeRecipeId || null;
}

function openLocationManager() {
  renderLocationTabs();
  document.getElementById("location-manager-modal").classList.remove("hidden");
}

function closeLocationManager() {
  document.getElementById("location-manager-modal").classList.add("hidden");
}

function renderLocationTabs() {
  const body = document.getElementById("location-manager-body");
  if (!body) return;
  if (!state.locations) state.locations = [];
  const locs = state.locations;
  body.innerHTML = locs.length
    ? locs
        .map(
          (l) => `
    <div class="loc-row ${l.id === state.activeLocationId ? "loc-row-active" : ""}" onclick="switchLocation('${l.id}')">
      <div style="flex:1">
        <div style="font-weight:700;font-size:13px">${escHtml(l.name)}</div>
        <div style="font-size:11px;color:var(--text-muted)">
          ${escHtml(l.address || "")}${l.address ? " · " : ""}
          ${l.currency || "£"} · ${l.activeGP || 70}% GP · ${l.vatRate != null ? l.vatRate : 20}% VAT
          · ${(l.recipes || []).length} recipes · ${(l.ingredients || []).length} ingredients
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        ${l.id === state.activeLocationId ? '<span style="font-size:11px;color:var(--accent);font-weight:700">● Active</span>' : ""}
        <button class="btn-secondary btn-sm" onclick="event.stopPropagation();openEditLocation('${l.id}')">Edit</button>
        <button class="btn-icon danger" onclick="event.stopPropagation();deleteLocation('${l.id}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>`,
        )
        .join("")
    : '<div style="color:var(--text-muted);font-size:13px;padding:12px 0">No locations yet. Add your first location below.</div>';
}

function switchLocation(locationId) {
  if (locationId === state.activeLocationId) return;
  loadLocationData(locationId);
  save();
  renderLocationTabs();
  renderLocationTabBar();
  showView("recipes");
  renderSidebarRecipes();
  if (state.activeRecipeId) renderRecipeEditor();
  else
    document.getElementById("editor-placeholder") &&
      (document.getElementById("editor-placeholder").style.display = "");
  showToast(
    "✓ Switched to " + (getActiveLocation()?.name || "location"),
    "success",
    1500,
  );
}

function openAddLocation() {
  document.getElementById("loc-edit-id").value = "";
  document.getElementById("loc-edit-name").value = "";
  document.getElementById("loc-edit-address").value = "";
  document.getElementById("loc-edit-gp").value = state.activeGP || 70;
  document.getElementById("loc-edit-currency").value = state.currency || "£";
  document.getElementById("loc-edit-vat").value = state.vatRate || 20;
  document.getElementById("loc-edit-modal").classList.remove("hidden");
}

function openEditLocation(id) {
  const loc = state.locations.find((l) => l.id === id);
  if (!loc) return;
  document.getElementById("loc-edit-id").value = id;
  document.getElementById("loc-edit-name").value = loc.name || "";
  document.getElementById("loc-edit-address").value = loc.address || "";
  document.getElementById("loc-edit-gp").value = loc.activeGP || 70;
  document.getElementById("loc-edit-currency").value = loc.currency || "£";
  document.getElementById("loc-edit-vat").value =
    loc.vatRate != null ? loc.vatRate : 20;
  document.getElementById("loc-edit-modal").classList.remove("hidden");
}

function saveLocationEdit() {
  const name = document.getElementById("loc-edit-name").value.trim();
  if (!name) {
    showToast("Please enter a location name", "error", 2000);
    return;
  }
  const id = document.getElementById("loc-edit-id").value;
  const data = {
    name,
    address: document.getElementById("loc-edit-address").value.trim(),
    activeGP: Math.min(
      99,
      Math.max(
        1,
        parseFloat(document.getElementById("loc-edit-gp").value) || 70,
      ),
    ),
    currency: document.getElementById("loc-edit-currency").value || "£",
    vatRate: Math.min(
      100,
      Math.max(
        0,
        parseFloat(document.getElementById("loc-edit-vat").value) || 0,
      ),
    ),
  };

  if (id) {
    // Edit existing
    const idx = state.locations.findIndex((l) => l.id === id);
    if (idx >= 0) {
      state.locations[idx] = { ...state.locations[idx], ...data };
      // If editing active location, apply settings immediately
      if (id === state.activeLocationId) {
        state.activeGP = data.activeGP;
        state.currency = data.currency;
        state.vatRate = data.vatRate;
        if (state.activeRecipeId) renderRecipeEditor();
      }
    }
  } else {
    // New location
    if (state.activeLocationId) saveActiveLocationData();
    const newLoc = {
      id: uid(),
      ...data,
      recipes: [],
      ingredients: [],
      suppliers: [],
      recipeCategories: JSON.parse(
        JSON.stringify(state.recipeCategories || []),
      ),
      ingCategories: JSON.parse(JSON.stringify(state.ingCategories || [])),
      foodCostTarget: state.foodCostTarget,
      activeRecipeId: null,
    };
    state.locations.push(newLoc);
    document.getElementById("loc-edit-modal").classList.add("hidden");

    // If there's existing global data and no other locations yet, offer migration
    const hasGlobalData =
      !state.activeLocationId &&
      (state.recipes.length > 0 ||
        state.ingredients.length > 0 ||
        state.suppliers.length > 0);
    if (hasGlobalData) {
      showLocationMigrationDialog(newLoc);
      return;
    }

    // Auto-switch to new location
    loadLocationData(newLoc.id);
    save();
    renderLocationTabs();
    renderLocationTabBar();
    showToast("✓ Created " + name, "success", 1500);
    return;
  }

  document.getElementById("loc-edit-modal").classList.add("hidden");
  save();
  renderLocationTabs();
  renderLocationTabBar();
  showToast("✓ " + (id ? "Updated" : "Created") + " " + name, "success", 1500);
}

// ─── Unified Data Migration Modal ──────────────────────────────────────────────
// Used for both: (a) creating first location, (b) deleting active location
let _migrationContext = null; // { mode: 'create'|'delete', locId, loc }

function showLocationMigrationDialog(newLoc) {
  _migrationContext = { mode: "create", locId: newLoc.id, loc: newLoc };
  openDataMigrationModal({
    title: "📦 What to do with existing data?",
    subtitle: `Choose which items to bring into <strong>${escHtml(newLoc.name)}</strong>. Unselected items stay in the global workspace.`,
    confirmLabel: "Move to Location",
    cancelLabel: "Start fresh (skip all)",
    source: {
      recipes: state.recipes,
      ingredients: state.ingredients,
      suppliers: state.suppliers,
    },
  });
}

function showDeleteLocationDialog(loc) {
  _migrationContext = { mode: "delete", locId: loc.id, loc };
  openDataMigrationModal({
    title: '🗑 Delete "' + escHtml(loc.name) + '" — save any data?',
    subtitle: `Choose which items to keep in the global workspace. Unselected items will be permanently deleted with the location.`,
    confirmLabel: "Keep selected & delete location",
    cancelLabel: "Delete everything",
    source: {
      recipes: loc.recipes || [],
      ingredients: loc.ingredients || [],
      suppliers: loc.suppliers || [],
    },
  });
}

function openDataMigrationModal(opts) {
  const modal = document.getElementById("loc-migration-modal");
  if (!modal) return;
  const { title, subtitle, confirmLabel, cancelLabel, source } = opts;

  document.getElementById("loc-migration-title").innerHTML = title;
  document.getElementById("loc-migration-subtitle").innerHTML = subtitle;
  document.getElementById("loc-migration-confirm-btn").textContent =
    confirmLabel;
  document.getElementById("loc-migration-cancel-btn").textContent = cancelLabel;

  // Build recipe checklist
  const rList = document.getElementById("loc-migrate-recipes");
  const iList = document.getElementById("loc-migrate-ingredients");
  const sList = document.getElementById("loc-migrate-suppliers");

  const makeItem = (item, type) => `
    <label class="migrate-item">
      <input type="checkbox" class="migrate-check" data-type="${type}" data-id="${escHtml(item.id)}" checked />
      <span class="migrate-item-name">${escHtml(item.name || "Untitled")}</span>
      ${type === "recipe" && item.category ? `<span class="migrate-item-cat">${escHtml(item.category)}</span>` : ""}
    </label>`;

  rList.innerHTML = source.recipes.length
    ? source.recipes.map((r) => makeItem(r, "recipe")).join("")
    : '<div class="migrate-empty">No recipes</div>';

  iList.innerHTML = source.ingredients.length
    ? source.ingredients.map((i) => makeItem(i, "ingredient")).join("")
    : '<div class="migrate-empty">No ingredients</div>';

  sList.innerHTML = source.suppliers.length
    ? source.suppliers.map((s) => makeItem(s, "supplier")).join("")
    : '<div class="migrate-empty">No suppliers</div>';

  // Update counts
  updateMigrateCounts();
  modal.classList.remove("hidden");
}

function updateMigrateCounts() {
  ["recipe", "ingredient", "supplier"].forEach((type) => {
    const checks = document.querySelectorAll(
      `.migrate-check[data-type="${type}"]`,
    );
    const selected = [...checks].filter((c) => c.checked).length;
    const el = document.getElementById(`migrate-count-${type}`);
    if (el) el.textContent = `${selected} / ${checks.length} selected`;
  });
}

function migrateSelectAll(type, checked) {
  document
    .querySelectorAll(`.migrate-check[data-type="${type}"]`)
    .forEach((c) => (c.checked = checked));
  updateMigrateCounts();
}

function applyMigration(skipAll) {
  const modal = document.getElementById("loc-migration-modal");
  modal.classList.add("hidden");
  if (!_migrationContext) return;
  const { mode, locId } = _migrationContext;

  const getSelected = (type) => {
    if (skipAll) return [];
    return [
      ...document.querySelectorAll(
        `.migrate-check[data-type="${type}"]:checked`,
      ),
    ].map((c) => c.dataset.id);
  };

  const selectedRecipeIds = new Set(getSelected("recipe"));
  const selectedIngredientIds = new Set(getSelected("ingredient"));
  const selectedSupplierIds = new Set(getSelected("supplier"));

  if (mode === "create") {
    const loc = state.locations.find((l) => l.id === locId);
    if (!loc) return;
    loc.recipes = state.recipes
      .filter((r) => selectedRecipeIds.has(r.id))
      .map((r) => JSON.parse(JSON.stringify(r)));
    loc.ingredients = state.ingredients
      .filter((i) => selectedIngredientIds.has(i.id))
      .map((i) => JSON.parse(JSON.stringify(i)));
    loc.suppliers = state.suppliers
      .filter((s) => selectedSupplierIds.has(s.id))
      .map((s) => JSON.parse(JSON.stringify(s)));
    loc.recipeCategories = JSON.parse(
      JSON.stringify(state.recipeCategories || []),
    );
    loc.ingCategories = JSON.parse(JSON.stringify(state.ingCategories || []));
    loc.foodCostTarget = state.foodCostTarget;
    // Remove moved items from global
    state.recipes = state.recipes.filter((r) => !selectedRecipeIds.has(r.id));
    state.ingredients = state.ingredients.filter(
      (i) => !selectedIngredientIds.has(i.id),
    );
    state.suppliers = state.suppliers.filter(
      (s) => !selectedSupplierIds.has(s.id),
    );
    loadLocationData(locId);
    const n =
      selectedRecipeIds.size +
      selectedIngredientIds.size +
      selectedSupplierIds.size;
    showToast(
      "✓ " +
        (n
          ? n + " item" + (n !== 1 ? "s" : "") + " moved to " + loc.name
          : "Started fresh in " + loc.name),
      "success",
      2000,
    );
  } else {
    // Delete mode — selected items go BACK to global
    const loc = state.locations.find((l) => l.id === locId);
    if (loc) {
      const keptRecipes = (loc.recipes || []).filter((r) =>
        selectedRecipeIds.has(r.id),
      );
      const keptIngredients = (loc.ingredients || []).filter((i) =>
        selectedIngredientIds.has(i.id),
      );
      const keptSuppliers = (loc.suppliers || []).filter((s) =>
        selectedSupplierIds.has(s.id),
      );
      // Merge into global (avoid duplicates by id)
      const existingRIds = new Set(state.recipes.map((r) => r.id));
      const existingIIds = new Set(state.ingredients.map((i) => i.id));
      const existingSIds = new Set(state.suppliers.map((s) => s.id));
      state.recipes = [
        ...state.recipes,
        ...keptRecipes
          .filter((r) => !existingRIds.has(r.id))
          .map((r) => JSON.parse(JSON.stringify(r))),
      ];
      state.ingredients = [
        ...state.ingredients,
        ...keptIngredients
          .filter((i) => !existingIIds.has(i.id))
          .map((i) => JSON.parse(JSON.stringify(i))),
      ];
      state.suppliers = [
        ...state.suppliers,
        ...keptSuppliers
          .filter((s) => !existingSIds.has(s.id))
          .map((s) => JSON.parse(JSON.stringify(s))),
      ];
    }
    state.locations = state.locations.filter((l) => l.id !== locId);
    state.activeLocationId = null;
    state.activeRecipeId = null;
    if (state.locations.length > 0) {
      loadLocationData(state.locations[0].id);
    }
    const n =
      selectedRecipeIds.size +
      selectedIngredientIds.size +
      selectedSupplierIds.size;
    showToast(
      "✓ Location deleted" +
        (n
          ? " · " +
            n +
            " item" +
            (n !== 1 ? "s" : "") +
            " kept in global workspace"
          : ""),
      "success",
      2500,
    );
  }

  save();
  renderLocationTabs();
  renderLocationTabBar();
  showView("recipes");
  renderSidebarRecipes();
  _migrationContext = null;
}

async function deleteLocation(id) {
  const loc = state.locations.find((l) => l.id === id);
  if (!loc) return;
  const isActive = state.activeLocationId === id;

  // Flush current in-memory state back to whichever location is active FIRST
  // so loc.recipes reflects reality before we check hasData
  if (state.activeLocationId) saveActiveLocationData();

  const hasData =
    (loc.recipes || []).length > 0 ||
    (loc.ingredients || []).length > 0 ||
    (loc.suppliers || []).length > 0;

  // Always show migration dialog if location has any data — regardless of whether active
  if (hasData) {
    showDeleteLocationDialog(loc);
    return;
  }

  // Empty location — simple confirm
  if (
    !(await showConfirm('Delete "' + loc.name + '"?', "This cannot be undone."))
  )
    return;

  // If deleting the active location, switch to another first
  if (isActive) {
    const otherLoc = state.locations.find((l) => l.id !== id);
    state.activeLocationId = null;
    state.activeRecipeId = null;
    if (otherLoc) {
      state.recipes = JSON.parse(JSON.stringify(otherLoc.recipes || []));
      state.ingredients = JSON.parse(
        JSON.stringify(otherLoc.ingredients || []),
      );
      state.suppliers = JSON.parse(JSON.stringify(otherLoc.suppliers || []));
      state.activeLocationId = otherLoc.id;
    }
  }
  // If deleting a non-active location, current state.recipes is untouched — safe

  state.locations = state.locations.filter((l) => l.id !== id);
  save();
  renderSidebarRecipes();
  renderLocationTabs();
  renderLocationTabBar();
  if (isActive) showView("recipes");
  showToast("Location deleted", "success", 1500);
}

// showDeleteLocationDialog and deleteLocationConfirmed merged into applyMigration above

function renderLocationTabBar() {
  const bar = document.getElementById("location-tab-bar");
  if (!bar) return;
  if (!state.locations) state.locations = [];
  const locs = state.locations;

  // Only show the tab bar when there are 2+ locations to switch between
  if (locs.length <= 1) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "flex";

  bar.innerHTML =
    locs
      .map((l) => {
        const isActive = l.id === state.activeLocationId;
        const recipeCount = (l.recipes || []).filter((r) => !r.yieldQty).length;
        return `<button class="loc-tab ${isActive ? "loc-tab-active" : ""}"
      onclick="switchLocation('${l.id}')" title="${escHtml(l.address || l.name)} · ${recipeCount} recipes">
      ${isActive ? '<span style="font-size:8px;margin-right:3px;color:var(--accent)">●</span>' : ""}
      ${escHtml(l.name)}
      <span style="font-size:10px;opacity:.6;margin-left:4px">${recipeCount}</span>
    </button>`;
      })
      .join("") +
    `<button class="loc-tab loc-tab-add" onclick="openLocationManager()" title="Manage locations">+ Location</button>`;
}

function renderSiteSelector() {
  const sel = document.getElementById("active-site-select");
  if (!sel) return;
  if (!state.sites.length) {
    sel.innerHTML = '<option value="">Default Kitchen</option>';
    sel.style.display = "none";
    return;
  }
  sel.style.display = "";
  sel.innerHTML =
    '<option value="">Default Kitchen</option>' +
    state.sites
      .map(
        (s) =>
          `<option value="${s.id}" ${s.id === state.activeSiteId ? "selected" : ""}>${escHtml(s.name)}</option>`,
      )
      .join("") +
    '<option value="__manage__">⚙ Manage Sites…</option>';
}

function setActiveSite(val) {
  if (val === "__manage__") {
    document.getElementById("active-site-select").value =
      state.activeSiteId || "";
    showSiteManager();
    return;
  }
  state.activeSiteId = val || null;
  const site = getActiveSite();
  if (site) {
    state.activeGP = site.defaultGP || state.activeGP;
  }
  renderSiteSelector();
  if (state.activeRecipeId) renderRecipeEditor();
  renderSidebarRecipes();
  save();
}

function showSiteManager() {
  const body = document.getElementById("version-modal-body");
  // Reuse version modal for site management
  const modal = document.getElementById("version-modal");
  modal.querySelector("h2").textContent = "Kitchen Sites";
  body.innerHTML = `
    <div style="margin-bottom:14px">
      ${
        state.sites.length
          ? state.sites
              .map(
                (s) => `
        <div class="version-row" style="justify-content:space-between">
          <div>
            <div style="font-weight:600">${escHtml(s.name)}</div>
            <div style="font-size:12px;color:var(--text-muted)">${escHtml(s.location || "")} · GP: ${s.defaultGP}% · VAT: ${s.vat || 20}%</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn-secondary btn-sm" onclick="openSiteModal('${s.id}')">Edit</button>
            <button class="btn-icon danger" onclick="deleteSite('${s.id}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
          </div>
        </div>`,
              )
              .join("")
          : '<div style="color:var(--text-muted);font-size:13px">No sites yet</div>'
      }
    </div>
    <button class="btn-primary" onclick="openSiteModal()">+ Add Site</button>
  `;
  modal.querySelector(".modal-footer").innerHTML =
    `<button class="btn-secondary" onclick="document.getElementById('version-modal').classList.add('hidden');modal.querySelector('h2').textContent='Recipe Versions'">Close</button>`;
  modal.classList.remove("hidden");
}

function openSiteModal(id = null) {
  const site = id ? state.sites.find((s) => s.id === id) : null;
  document.getElementById("site-modal-title").textContent = site
    ? "Edit Site"
    : "Add Kitchen Site";
  document.getElementById("site-name").value = site?.name || "";
  document.getElementById("site-location").value = site?.location || "";
  document.getElementById("site-gp").value = site?.defaultGP || 70;
  document.getElementById("site-vat").value = site?.vat || 20;
  document.getElementById("site-modal").dataset.editId = id || "";
  document.getElementById("site-modal").classList.remove("hidden");
}
function closeSiteModal() {
  document.getElementById("site-modal").classList.add("hidden");
}
function saveSite() {
  const name = document.getElementById("site-name").value.trim();
  if (!name) {
    showToast("Please enter a site name", "error");
    return;
  }
  const id = document.getElementById("site-modal").dataset.editId;
  const data = {
    name,
    location: document.getElementById("site-location").value.trim(),
    defaultGP: Math.min(
      99,
      Math.max(1, parseFloat(document.getElementById("site-gp").value) || 70),
    ),
    vat: Math.min(
      100,
      Math.max(0, parseFloat(document.getElementById("site-vat").value) || 20),
    ),
  };
  if (id) {
    const idx = state.sites.findIndex((s) => s.id === id);
    state.sites[idx] = { ...state.sites[idx], ...data };
  } else {
    state.sites.push({ id: uid(), ...data });
  }
  closeSiteModal();
  renderSiteSelector();
  save();
  showToast("Site saved", "success", 1500);
}
async function deleteSite(id) {
  if (!(await showConfirm("Delete this site?", ""))) return;
  state.sites = state.sites.filter((s) => s.id !== id);
  if (state.activeSiteId === id) state.activeSiteId = null;
  renderSiteSelector();
  save();
}

// ─── Sidebar ──────────────────────────────────────────────────
function renderSidebarRecipes() {
  const container = document.getElementById("recipe-list");
  // Rebuild category filter dropdown dynamically
  const catSel = document.getElementById("recipe-cat-filter");
  if (catSel) {
    const current = catSel.value;
    // Build dropdown from registered categories UNION actual recipe categories
    const registeredCats = getRecipeCategories();
    const usedCats = [
      ...new Set(state.recipes.map((r) => r.category).filter(Boolean)),
    ];
    const allDropdownCats = [...new Set([...registeredCats, ...usedCats])];
    const totalCount = state.recipes.length;
    catSel.innerHTML =
      `<option value="">All (${totalCount})</option>` +
      allDropdownCats
        .map((c) => {
          const cnt = state.recipes.filter(
            (r) => (r.category || "").toLowerCase() === c.toLowerCase(),
          ).length;
          return `<option value="${c}">${escHtml(c)} (${cnt})</option>`;
        })
        .join("");
    catSel.value = current;
  }
  const catFilter = catSel?.value || "";
  const sidebarQ = (
    document.getElementById("sidebar-recipe-search")?.value || ""
  ).toLowerCase();
  let recipes = state.recipes;
  if (catFilter)
    recipes = recipes.filter(
      (r) => (r.category || "").toLowerCase() === catFilter.toLowerCase(),
    );
  if (sidebarQ)
    recipes = recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(sidebarQ) ||
        (r.tags || []).some((t) => t.toLowerCase().includes(sidebarQ)),
    );

  if (!recipes.length) {
    container.innerHTML = `<div style="padding:8px 16px;color:var(--text-muted);font-size:12px">${catFilter ? "No recipes in this category" : "No recipes yet"}</div>`;
    return;
  }

  // Group by category
  const grouped = {};
  // Order by registered category list first, then extras
  const registeredCatOrder = getRecipeCategories();
  const allCats = [
    ...new Set(recipes.map((r) => r.category || "⚠ No Category")),
  ];
  const orderedCats = [
    ...registeredCatOrder.filter((c) => allCats.includes(c)),
    ...allCats.filter((c) => !registeredCatOrder.includes(c)),
  ];
  orderedCats.forEach((c) => {
    grouped[c] = [];
  });
  recipes.forEach((r) => {
    const cat = r.category || "⚠ No Category";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(r);
  });

  const showGroups = !sidebarQ && !catFilter && Object.keys(grouped).length > 1;

  let html = "";
  const renderItem = (r) => {
    const cost = recipeTotalCost(r);
    const cpp = cost / (r.portions || 1);
    const price =
      r.priceOverride && r.priceOverride > 0
        ? r.priceOverride
        : suggestPrice(cpp, state.activeGP);
    const allergens = recipeAllergens(r);
    const isActive = r.id === state.activeRecipeId;
    const gp = state.activeGP;

    // Status indicators
    const flags = [];
    if (r.yieldQty) flags.push(`<span class="sl-flag sl-flag-sub">SUB</span>`);
    if (r.locked) flags.push(`<span class="sl-flag sl-flag-lock">🔒</span>`);
    if (r.status === "review")
      flags.push(
        `<span style="font-size:9px;font-weight:700;color:#f59e0b;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);padding:1px 4px;border-radius:3px">REVIEW</span>`,
      );
    if (r.status === "approved")
      flags.push(
        `<span style="font-size:9px;font-weight:700;color:var(--green);background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);padding:1px 4px;border-radius:3px">✓ OK</span>`,
      );
    if (r.actualSales) {
      const s = r.actualSales;
      const actualGP =
        s.revenue > 0 ? ((s.revenue - cpp * s.covers) / s.revenue) * 100 : 0;
      const col = actualGP >= gp ? "var(--green)" : "var(--red)";
      flags.push(
        `<span style="font-size:9px;font-weight:700;color:${col}">${actualGP.toFixed(0)}%</span>`,
      );
    }

    // GP traffic light
    const fcPct = price > 0 ? (cpp / price) * 100 : 0;
    const fcTarget = getFoodCostTarget();
    const gpDot = r.yieldQty
      ? "" // batch recipe — no dot
      : fcPct <= fcTarget
        ? '<span class="sl-gp-dot sl-gp-ok" title="On target"></span>'
        : fcPct <= fcTarget + 5
          ? '<span class="sl-gp-dot sl-gp-warn" title="Slightly over target"></span>'
          : '<span class="sl-gp-dot sl-gp-bad" title="Over food cost target"></span>';

    return `<div class="sl-item ${isActive ? "sl-item-active" : ""}" onclick="selectRecipe('${r.id}')" oncontextmenu="showRecipeContextMenu(event,'${r.id}');return false;">
      <div class="sl-item-main">
        <div class="sl-item-name">${gpDot}${escHtml(r.name || "Untitled")}${!r.category ? '<span class="sl-flag" style="color:var(--red);background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);font-size:9px;padding:1px 4px;border-radius:3px">NO CAT</span>' : ""}${flags.length ? " " + flags.join("") : ""}</div>
        ${cpp > 0 || allergens.length ? `<div class="sl-item-sub">${cpp > 0 ? fmt(cpp) + " cost" : ""}${allergens.length ? (cpp > 0 ? " · " : "") + "⚠ " + allergens.length + " allergen" + (allergens.length !== 1 ? "s" : "") : ""}</div>` : ""}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0">
        ${
          !r.priceOverride && !r.yieldQty
            ? `
          <div class="sl-item-price" style="display:flex;flex-direction:column;align-items:flex-end;gap:0">
            <span style="font-size:8px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;line-height:1;margin-bottom:1px">est.</span>
            <span style="color:#94a3b8">${fmt(price)}</span>
          </div>
        `
            : `<div class="sl-item-price">${fmt(price)}</div>`
        }
        ${(() => {
          if (!r.priceOverride && !r.yieldQty) {
            // No price set — show neutral label instead of misleading GP%
            return `<div style="font-size:9px;font-weight:500;color:var(--text-muted);line-height:1;opacity:0.7">est.</div>`;
          }
          const actualGp = price > 0 ? ((price - cpp) / price) * 100 : 0;
          const col =
            actualGp >= state.activeGP
              ? "var(--green)"
              : actualGp >= state.activeGP - 5
                ? "var(--accent)"
                : "var(--red)";
          return `<div style="font-size:9px;font-weight:700;color:${col};line-height:1;">${actualGp.toFixed(0)}%</div>`;
        })()}
      </div>
      </div>
    </div>`;
  };

  if (!window._sidebarCollapsed) window._sidebarCollapsed = {};

  if (showGroups) {
    Object.entries(grouped).forEach(([cat, recs]) => {
      const isCollapsed = window._sidebarCollapsed[cat] === true;
      html += `<div class="sl-cat-header" onclick="toggleSidebarCat('${cat.replace(/'/g, "\\'")}')" style="cursor:pointer;user-select:none">
        <span style="font-size:9px;color:var(--text-muted);margin-right:2px">${isCollapsed ? "▶" : "▼"}</span>
        ${escHtml(cat)} <span class="sl-cat-count">${recs.length}</span>
      </div>`;
      if (!isCollapsed) html += recs.map(renderItem).join("");
    });
  } else {
    html = recipes.map(renderItem).join("");
  }

  container.innerHTML = html;
}

function toggleSidebarCat(cat) {
  if (!window._sidebarCollapsed) window._sidebarCollapsed = {};
  window._sidebarCollapsed[cat] = !window._sidebarCollapsed[cat];
  renderSidebarRecipes();
}

function toggleAllSidebarCats() {
  if (!window._sidebarCollapsed) window._sidebarCollapsed = {};
  const cats = [
    ...new Set(state.recipes.map((r) => r.category || "Uncategorised")),
  ];
  const allCollapsed = cats.every((c) => window._sidebarCollapsed[c] === true);
  cats.forEach((c) => {
    window._sidebarCollapsed[c] = !allCollapsed;
  });
  renderSidebarRecipes();
}

// ─── Recipe CRUD ──────────────────────────────────────────────
function newRecipe() {
  showView("recipes");
  const listPanel = document.getElementById("recipe-list-panel");
  const editorPanel = document.getElementById("recipe-editor-panel");
  if (listPanel) listPanel.style.display = "none";
  if (editorPanel) editorPanel.style.display = "flex";
  const recipe = {
    id: uid(),
    name: "New Recipe",
    category: "",
    portions: 1,
    notes: "",
    ingredients: [],
    subRecipes: [],
  };
  state.recipes.push(recipe);
  state.activeRecipeId = recipe.id;
  recipeSnapshot = null;
  render();
  renderRecipeEditor();
  save();
  setTimeout(() => {
    const el = document.querySelector(".recipe-name-input");
    if (el) {
      el.focus();
      el.select();
    }
  }, 50);
}

function selectRecipe(id) {
  state.activeRecipeId = id;
  recipeSnapshot = JSON.parse(
    JSON.stringify(state.recipes.find((r) => r.id === id)),
  );
  const listPanel = document.getElementById("recipe-list-panel");
  const editorPanel = document.getElementById("recipe-editor-panel");
  if (listPanel) listPanel.style.display = "none";
  if (editorPanel) editorPanel.style.display = "flex";
  showView("recipes");
  render();
  renderRecipeEditor();
}

function duplicateRecipe(id) {
  const src = state.recipes.find((r) => r.id === id);
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.name = src.name + " (Copy)";
  state.recipes.push(copy);
  state.activeRecipeId = copy.id;
  recipeSnapshot = JSON.parse(JSON.stringify(copy));
  render();
  renderRecipeEditor();
  save();
  showToast("✓ Duplicated — rename it below", "success", 2000);
  // Auto-select the name so user can rename immediately
  setTimeout(() => {
    const inp = document.querySelector(".recipe-name-input");
    if (inp) {
      inp.focus();
      inp.select();
    }
  }, 100);
}

function toggleRecipeMoreMenu(id, e) {
  e.stopPropagation();
  const menu = document.getElementById("more-menu-" + id);
  if (!menu) return;
  const isHidden = menu.classList.contains("hidden");
  // Close any open more menus
  document
    .querySelectorAll(".rh-more-menu")
    .forEach((m) => m.classList.add("hidden"));
  if (isHidden) {
    menu.classList.remove("hidden");
    setTimeout(() => {
      document.addEventListener("click", function closeFn() {
        document
          .querySelectorAll(".rh-more-menu")
          .forEach((m) => m.classList.add("hidden"));
        document.removeEventListener("click", closeFn);
      });
    }, 0);
  }
}

function closeRecipeMoreMenu(id) {
  const menu = document.getElementById("more-menu-" + id);
  if (menu) menu.classList.add("hidden");
}

function openCopyToLocation(recipeId) {
  const recipe = state.recipes.find((r) => r.id === recipeId);
  if (!recipe) return;
  const modal = document.getElementById("copy-to-loc-modal");
  if (!modal) return;
  document.getElementById("copy-to-loc-name").textContent = recipe.name;
  document.getElementById("copy-to-loc-list").innerHTML = state.locations
    .map(
      (loc) => `
    <div class="ctx-item" style="border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;padding:10px 12px"
      onclick="confirmCopyToLocation('${recipeId}','${loc.id}')">
      <div style="font-weight:600;font-size:13px">📍 ${escHtml(loc.name)}</div>
      <div style="font-size:11px;color:var(--text-muted)">${(loc.recipes || []).length} recipes</div>
    </div>`,
    )
    .join("");
  modal.classList.remove("hidden");
}

function confirmCopyToLocation(recipeId, locId) {
  const recipe = state.recipes.find((r) => r.id === recipeId);
  const loc = state.locations.find((l) => l.id === locId);
  if (!recipe || !loc) return;
  if (!loc.recipes) loc.recipes = [];
  // Deep copy with new id
  const copy = JSON.parse(JSON.stringify(recipe));
  copy.id = uid();
  loc.recipes.push(copy);
  document.getElementById("copy-to-loc-modal").classList.add("hidden");
  save();
  showToast(`✓ "${recipe.name}" copied to ${loc.name}`, "success", 2000);
}

function showRecipeContextMenu(e, id) {
  // Remove any existing context menu
  const existing = document.getElementById("recipe-ctx-menu");
  if (existing) existing.remove();

  const recipe = state.recipes.find((r) => r.id === id);
  if (!recipe) return;

  const menu = document.createElement("div");
  menu.id = "recipe-ctx-menu";
  menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:var(--bg-card);border:1px solid var(--border-light);border-radius:var(--radius-sm);box-shadow:0 8px 24px rgba(0,0,0,.35);z-index:9999;min-width:180px;padding:4px;`;
  menu.innerHTML = `
    <div class="ctx-item" onclick="selectRecipe('${id}');document.getElementById('recipe-ctx-menu')?.remove()">
      ✏️ Open
    </div>
    <div class="ctx-item" onclick="duplicateRecipe('${id}');document.getElementById('recipe-ctx-menu')?.remove()">
      ⧉ Duplicate
    </div>
    <div class="ctx-item" onclick="selectRecipe('${id}');showView('recipes');setTimeout(()=>printRecipe('${id}'),100);document.getElementById('recipe-ctx-menu')?.remove()">
      🖨 Print Cost Sheet
    </div>
    <div class="ctx-item" onclick="printAllergenQRCard('${id}');document.getElementById('recipe-ctx-menu')?.remove()">
      📱 Allergen QR Card
    </div>
    ${
      state.locations.length > 0
        ? `<div class="ctx-item" onclick="openCopyToLocation('${id}');document.getElementById('recipe-ctx-menu')?.remove()">
      📍 Copy to location…
    </div>`
        : ""
    }
    <div class="ctx-divider"></div>
    <div class="ctx-item danger" onclick="deleteRecipe('${id}');document.getElementById('recipe-ctx-menu')?.remove()">
      🗑 Delete
    </div>`;
  document.body.appendChild(menu);

  // Close on any click outside
  setTimeout(() => {
    document.addEventListener("click", function close() {
      document.getElementById("recipe-ctx-menu")?.remove();
      document.removeEventListener("click", close);
    });
  }, 0);
}

async function deleteRecipe(id) {
  const recipe = state.recipes.find((r) => r.id === id);
  const confirmed = await showConfirm(
    `Delete "${recipe?.name}"?`,
    "This cannot be undone.",
  );
  if (!confirmed) return;
  state.recipes = state.recipes.filter((r) => r.id !== id);
  state.activeRecipeId = state.recipes[0]?.id || null;
  render();
  if (state.activeRecipeId) {
    recipeSnapshot = JSON.parse(
      JSON.stringify(state.recipes.find((r) => r.id === state.activeRecipeId)),
    );
    renderRecipeEditor();
  } else {
    showRecipeList();
  }
  save();
}

function getActiveRecipe() {
  return state.recipes.find((r) => r.id === state.activeRecipeId);
}

// ─── Recipe Editor ────────────────────────────────────────────
function renderRecipeEditor() {
  // Always start with a clean cost cache so stale values from a previous render
  // (e.g. before an ingredient was added/removed) never bleed into this render.
  invalidateMaps();
  invalidateCostCache();
  const recipe = getActiveRecipe();
  const editor = document.getElementById("recipe-editor");
  if (!recipe) {
    showRecipeList();
    return;
  }
  // Update breadcrumb
  const bc = document.getElementById("recipe-editor-breadcrumb");
  if (bc)
    bc.textContent =
      (recipe.category || "") + (recipe.category ? " · " : "") + recipe.name;

  const totalCost = recipeTotalCost(recipe);
  const portions = recipe.portions || 1;
  const costPerPortion = totalCost / portions;
  const sugPrice = suggestPrice(costPerPortion, state.activeGP);
  const foodCostPct = sugPrice > 0 ? (costPerPortion / sugPrice) * 100 : 0;
  const scale = recipe.scale || 1;
  const scaledCost = costPerPortion * scale;
  const allergens = recipeAllergens(recipe);

  editor.innerHTML = `
    <div class="recipe-header">

      <!-- Row 1: Title + all actions on same line -->
      <div class="recipe-title-row">
        <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
          <input type="text" class="recipe-name-input" value="${escHtml(recipe.name)}"
            oninput="updateRecipeField('name',this.value)" placeholder="Recipe name…" style="flex:1;min-width:0" />
          ${buildCompletionScore(recipe)}
          <button class="recipe-status-btn status-${recipe.status || "draft"}" onclick="cycleRecipeStatus('${recipe.id}')" title="Click to change status">
            <span class="status-dot ${recipe.status || "draft"}"></span>
            ${{ draft: "Draft", review: "In Review", approved: "Approved" }[recipe.status || "draft"]}
          </button>
        </div>
        <div class="recipe-header-actions">
          <button class="btn-icon" id="undo-btn" onclick="undo()" title="Undo (Ctrl+Z)" disabled>↩</button>
          <button class="btn-icon" id="redo-btn" onclick="redo()" title="Redo (Ctrl+Y)" disabled>↪</button>
          <div class="rh-divider"></div>
          <!-- Primary actions always visible -->
          <button class="btn-secondary btn-sm" onclick="openKitchenView('${recipe.id}')" title="Kitchen view — large text, ingredients &amp; method for service">🍳 Kitchen</button>
          <button class="btn-secondary btn-sm" onclick="printRecipe('${recipe.id}')" title="Export cost sheet PDF">🖨 Cost</button>
          <button class="btn-secondary btn-sm" onclick="duplicateRecipe('${recipe.id}')" title="Duplicate this recipe" style="font-weight:600">⧉ Duplicate</button>
          <!-- More dropdown -->
          <div style="position:relative">
            <button class="btn-secondary btn-sm" onclick="toggleRecipeMoreMenu('${recipe.id}',event)" id="more-btn-${recipe.id}" title="More actions">⋯ More</button>
            <div class="rh-more-menu hidden" id="more-menu-${recipe.id}">
              <div class="rh-more-item" onclick="openBatchModal('${recipe.id}');closeRecipeMoreMenu('${recipe.id}')">⚖ Batch cooking</div>
              <div class="rh-more-item" onclick="checkCompetitorPrice('${recipe.id}');closeRecipeMoreMenu('${recipe.id}')">📊 Market price check (AI)</div>
              <div class="rh-more-item" onclick="openCompetitorModal('${recipe.id}');closeRecipeMoreMenu('${recipe.id}')">£ vs competitors</div>
              <div class="rh-more-item" onclick="showVersionModal('${recipe.id}');closeRecipeMoreMenu('${recipe.id}')">🕐 Versions (v${(recipe.versions || []).length + 1})</div>
              <div class="rh-more-item" onclick="showCostHistoryModal('${recipe.id}');closeRecipeMoreMenu('${recipe.id}')">📈 Cost history</div>
              <div class="rh-more-item" onclick="openMenuModal();closeRecipeMoreMenu('${recipe.id}')">📄 Export menu PDF</div>
              <div class="rh-more-item" onclick="openSpecialsBoard();closeRecipeMoreMenu('${recipe.id}')">📋 Specials board</div>
              <div class="rh-more-item" onclick="printAllergenSheet();closeRecipeMoreMenu('${recipe.id}')">⚠️ Allergen sheet</div>
              <div class="rh-more-item" onclick="openRecipeImport();closeRecipeMoreMenu('${recipe.id}')">✨ Import recipe (AI)</div>
              <div class="rh-more-item" onclick="printRecipeCard('${recipe.id}');closeRecipeMoreMenu('${recipe.id}')">🪪 Recipe card</div>
              <div class="rh-more-item" onclick="printAllergenQRCard('${recipe.id}');closeRecipeMoreMenu('${recipe.id}')">📱 Allergen QR card</div>
              <div class="rh-more-item" onclick="showRecipePhoto('${recipe.id}');closeRecipeMoreMenu('${recipe.id}')">📷 Photo${recipe.photo ? " ✓" : ""}</div>
            </div>
          </div>
          <button class="btn-icon ${recipe.locked ? "active" : ""}" onclick="toggleRecipeLock('${recipe.id}')" title="${recipe.locked ? "Unlock" : "Lock"}">🔒</button>
          <button class="btn-icon danger" onclick="deleteRecipe('${recipe.id}')" title="Delete"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
        </div>
      </div>

      <!-- Row 2: All meta fields in one compact line -->
      <div class="recipe-meta-row">
        <div class="recipe-meta-field" style="position:relative">
          <label>Category</label>
          <div class="rh-cat-select ${!recipe.category ? "rh-cat-empty" : ""}"
            onclick="toggleCatDropdown(event,'${recipe.id}')"
            title="Select category">
            <span class="rh-cat-value">${recipe.category ? escHtml(recipe.category) : "— Select —"}</span>
            <span style="font-size:9px;color:var(--text-muted);margin-left:4px">▾</span>
          </div>
          <div class="rh-cat-dropdown hidden" id="cat-dropdown-${recipe.id}">
            ${[
              ...new Set([
                ...getRecipeCategories(),
                ...(recipe.category ? [recipe.category] : []),
              ]),
            ]
              .map(
                (
                  c,
                ) => `<div class="rh-cat-option ${recipe.category === c ? "active" : ""}" onclick="pickCategory(event,'${recipe.id}','${c.replace(/'/g, "\'")}')">
              ${escHtml(c)}${recipe.category === c ? " ✓" : ""}
            </div>`,
              )
              .join("")}
          </div>
        </div>
        <div class="rh-divider"></div>
        <div class="recipe-meta-field">
          <label>Portions</label>
          <input type="number" min="1" step="1" value="${portions}" onchange="updateRecipeField('portions',+this.value||1)" style="width:55px" />
        </div>
        <div class="recipe-meta-field">
          <label>Scale ×</label>
          <input type="number" min="0.1" step="0.1" value="${scale}" title="Multiply quantities for service" onchange="updateRecipeField('scale',+this.value||1)" style="width:50px" />
        </div>
        <div class="rh-divider"></div>
        <div class="recipe-meta-field" style="flex:1">
          <label>Tags</label>
          <div class="tag-editor" id="tag-editor-wrap">
            ${(recipe.tags || []).map((t) => `<span class="recipe-tag">${escHtml(t)}<button onclick="removeTag('${recipe.id}','${t.replace(/'/g, "\'")}' )" title="Remove">×</button></span>`).join("")}
            <input type="text" class="tag-input" id="tag-input" placeholder="Add tag…" onkeydown="handleTagInput(event,'${recipe.id}')" />
          </div>
        </div>
        <div class="rh-divider"></div>
        <!-- Sub-recipe toggle inline -->
        <button class="btn-secondary btn-sm rh-subbtn ${recipe.yieldQty ? "rh-subbtn-active" : ""}"
          onclick="toggleSubRecipeMode('${recipe.id}')"
          title="${recipe.yieldQty ? "Sub-recipe mode on — click to remove" : "Mark as sub-recipe"}">
          🧩 ${recipe.yieldQty ? "Sub-Recipe" : "Sub-Recipe"}
        </button>
        <!-- Actual GP inline -->
        <button class="btn-secondary btn-sm" onclick="openActualSalesModal('${recipe.id}')"
          style="${recipe.actualSales ? "border-color:var(--accent);color:var(--accent)" : ""}"
          title="Log actual sales to compare real vs theoretical GP">
          📊 GP${
            recipe.actualSales
              ? (() => {
                  const s = recipe.actualSales;
                  const cpp = recipeTotalCost(recipe) / (recipe.portions || 1);
                  const gp = ((s.revenue - cpp * s.covers) / s.revenue) * 100;
                  const col =
                    gp >= state.activeGP ? "var(--green)" : "var(--red)";
                  return (
                    ' <span style=\"color:' +
                    col +
                    '\">' +
                    gp.toFixed(1) +
                    "%</span>"
                  );
                })()
              : ""
          }
        </button>
        <button class="btn-secondary btn-sm" onclick="openReverseCostCalc()" title="Reverse cost calculator — set your sell price, find your max ingredient budget">🧮</button>
        ${recipe.locked ? `<span style="font-size:11px;color:var(--red);font-weight:700;padding:3px 8px;background:rgba(239,68,68,0.1);border-radius:4px">🔒 LOCKED</span>` : ""}
        ${(() => {
          const hist = recipe.costHistory || [];
          if (!hist.length) return "";
          const last = hist[hist.length - 1];
          const daysAgo = Math.floor(
            (Date.now() - new Date(last.date)) / 86400000,
          );
          const label =
            daysAgo === 0
              ? "today"
              : daysAgo === 1
                ? "yesterday"
                : daysAgo + "d ago";
          const colour =
            daysAgo > 30
              ? "var(--red)"
              : daysAgo > 14
                ? "var(--accent)"
                : "var(--text-muted)";
          return `<span title="Last costed on ${last.date}" style="font-size:10px;color:${colour};padding:3px 8px;background:var(--bg-card2);border:1px solid var(--border);border-radius:4px;white-space:nowrap">⏱ Last costed ${label}</span>`;
        })()}
      </div>

      <!-- Row 3: Sub-recipe yield — only when active -->
      ${
        recipe.yieldQty
          ? `
      <div style="display:flex;align-items:center;gap:8px;padding:7px 12px;background:var(--accent-bg);border:1px solid var(--accent);border-radius:7px;margin-top:8px;flex-wrap:wrap">
        <span style="font-size:11px;font-weight:700;color:var(--accent)">🧩 SUB-RECIPE</span>
        <span style="font-size:11px;color:var(--text-muted)">Yield:</span>
        <input type="number" min="0" step="any" value="${recipe.yieldQty}"
          onchange="updateRecipeField('yieldQty',+this.value||null)"
          style="width:60px;background:var(--bg-input);border:1px solid var(--accent);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:3px 7px;border-radius:4px;outline:none" />
        <select onchange="updateRecipeField('yieldUnit',this.value)"
          style="background:var(--bg-input);border:1px solid var(--accent);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:3px 6px;border-radius:4px;outline:none">
          ${["portions", "g", "kg", "ml", "L", "oz", "lb"].map((u) => `<option value="${u}" ${(recipe.yieldUnit || "portions") === u ? "selected" : ""}>${u}</option>`).join("")}
        </select>
        <span style="font-size:12px;color:var(--accent);font-weight:700">${fmt(recipeTotalCost(recipe) / (recipe.yieldQty || 1))} / ${escHtml(recipe.yieldUnit || "unit")}</span>
        <span style="font-size:11px;color:var(--text-muted);margin-left:4px">Used as a component in other recipes</span>
        <button class="btn-secondary btn-sm" style="margin-left:auto;font-size:11px;color:var(--red);border-color:var(--red)" onclick="toggleSubRecipeMode('${recipe.id}')">✕ Remove</button>
      </div>`
          : ""
      }

    </div>


    ${buildCostAlert(foodCostPct)}

    <!-- Sticky live cost bar -->
    ${buildStickyCostBar(recipe, costPerPortion, sugPrice, foodCostPct)}

    <!-- Nutrition bar (visible only when ingredient nutrition data exists) -->
    ${buildNutritionBar(recipe)}

    <!-- Method steps panel -->
    <div class="recipe-notes-panel${(recipe.methods || []).length || recipe.notes ? " notes-has-content" : ""}">
      <div class="recipe-notes-header" onclick="toggleNotesPanel()">
        <div style="display:flex;align-items:center;gap:10px">
          <h3 style="margin:0">📋 Method</h3>
          ${(recipe.methods || []).length ? `<span style="font-size:10px;color:var(--text-muted);background:var(--bg-card2);border:1px solid var(--border);padding:1px 7px;border-radius:10px">${(recipe.methods || []).length} step${(recipe.methods || []).length !== 1 ? "s" : ""}</span>` : ""}
          ${recipe.prepTime || recipe.cookTime ? `<span style="font-size:11px;color:var(--text-muted)">${[recipe.prepTime ? "Prep: " + recipe.prepTime + "min" : null, recipe.cookTime ? "Cook: " + recipe.cookTime + "min" : null].filter(Boolean).join(" · ")}</span>` : ""}
        </div>
        <span id="notes-chevron" style="font-size:11px;color:var(--text-muted)">${(recipe.methods || []).length || recipe.notes ? "▴" : "▾"}</span>
      </div>
      <div class="recipe-notes-body" id="recipe-notes-body" style="${(recipe.methods || []).length || recipe.notes ? "" : "display:none"}">
        <!-- Prep / Cook time -->
        <div style="display:flex;align-items:center;gap:20px;margin-bottom:12px;padding:8px 12px 12px;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:10px;color:var(--text-muted);font-weight:700;letter-spacing:.6px;text-transform:uppercase">Prep</span>
            <input type="number" min="0" placeholder="0" value="${recipe.prepTime || ""}"
              oninput="updateRecipeField('prepTime',+this.value||null)"
              style="width:56px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:13px;font-weight:600;padding:5px 8px;border-radius:5px;outline:none;text-align:center;line-height:1" />
            <span style="font-size:11px;color:var(--text-muted)">min</span>
          </div>
          <div style="width:1px;height:20px;background:var(--border)"></div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:10px;color:var(--text-muted);font-weight:700;letter-spacing:.6px;text-transform:uppercase">Cook</span>
            <input type="number" min="0" placeholder="0" value="${recipe.cookTime || ""}"
              oninput="updateRecipeField('cookTime',+this.value||null)"
              style="width:56px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:13px;font-weight:600;padding:5px 8px;border-radius:5px;outline:none;text-align:center;line-height:1" />
            <span style="font-size:11px;color:var(--text-muted)">min</span>
          </div>
        </div>
        <!-- Numbered steps -->
        <div id="method-steps-list">
          ${(recipe.methods || [])
            .map(
              (step, i) => `
            <div class="method-step" data-idx="${i}">
              <div class="method-step-num">${i + 1}</div>
              <textarea class="method-step-text" rows="2"
                oninput="updateMethodStep(${i},this.value)"
                placeholder="Describe step ${i + 1}…">${escHtml(step)}</textarea>
              <button class="method-step-del" onclick="removeMethodStep(${i})" title="Remove step">×</button>
            </div>
          `,
            )
            .join("")}
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
          <button class="btn-secondary btn-sm" style="font-size:12px" onclick="addMethodStep()">
            + Add Step
          </button>
          <button class="btn-secondary btn-sm" style="font-size:12px" onclick="openPasteMethodModal()" title="Paste numbered text and split into steps automatically">
            📋 Paste Method
          </button>
        </div>
        <!-- Additional Notes — always visible -->
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
          <div style="font-size:10px;font-weight:700;letter-spacing:.8px;color:var(--text-muted);margin-bottom:8px">ADDITIONAL NOTES</div>
          <textarea class="recipe-notes" placeholder="Add any additional notes, allergy reminders, plating instructions…"
            oninput="updateRecipeField('notes',this.value)"
            style="width:100%;min-height:80px;max-height:200px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:var(--font);font-size:13px;line-height:1.6;padding:10px 12px;resize:vertical;outline:none;box-sizing:border-box;transition:border-color .15s"
            onfocus="this.style.borderColor='var(--border-light)'" onblur="this.style.borderColor='var(--border)'">${escHtml(recipe.notes || "")}</textarea>
        </div>
      </div>
    </div>

    <div class="recipe-body">
      <div class="ingredients-panel">
        <div class="panel-heading">
          <h3>Ingredients</h3>
          <span style="font-size:12px;color:var(--text-muted)">${recipe.ingredients.length} items · drag to reorder</span>
        </div>

        <table class="recipe-ing-table">
          <thead>
            <tr>
              <th style="width:20px"></th>
              <th style="width:44%">Ingredient</th>
              <th style="text-align:right;width:70px;padding-right:6px">Qty</th>
              <th style="width:70px;padding-left:4px">Unit</th>
              <th style="text-align:center;width:50px" title="Wastage % — trim/prep loss">Waste%</th>
              <th style="text-align:right;padding-right:14px">Cost</th>
              ${scale !== 1 ? '<th style="text-align:right">Scaled</th>' : ""}
              <th style="width:44px"></th>
            </tr>
          </thead>
          <tbody id="recipe-ing-tbody">
            ${recipe.ingredients.map((ri, idx) => renderIngRow(ri, idx, scale)).join("")}
          </tbody>
        </table>
        <div class="add-ing-wrap" style="position:relative;margin-top:4px">
          <input type="text" class="ing-search-input" id="ing-search-add"
            placeholder="+ Type to search and add ingredient…"
            oninput="showIngDropdown(this.value)"
            onblur="hideIngDropdownDelayed()"
            onkeydown="handleIngSearchKey(event)"
            autocomplete="off" />
          <div class="ing-dropdown hidden" id="ing-dropdown"></div>
        </div>

        <!-- Sub-Recipes -->
        <div class="sub-recipe-section">
          <div class="sub-recipe-header" onclick="toggleSubRecipes()">
            <div class="sub-recipe-title">
              <span>Sub-Recipes</span>
              <span class="badge-sub">${recipe.subRecipes.length}</span>
            </div>
            <span id="sub-recipe-chevron" style="color:var(--text-muted)">▾</span>
          </div>
          <div class="sub-recipe-body" id="sub-recipe-body">${renderSubRecipes(recipe)}</div>
        </div>

        <!-- Allergens -->
        ${
          allergens.length
            ? `
        <div style="margin-top:14px">
          <div class="panel-heading"><h3>Allergens in this recipe</h3></div>
          <div class="allergen-wrap">
            ${allergens.map((a) => `<span class="allergen-tag">⚠ ${escHtml(a)}</span>`).join("")}
          </div>
        </div>`
            : ""
        }

      </div>

      <!-- GP Panel -->
      <div class="gp-panel">
        <div class="cost-summary-card">
          <h3>Cost Breakdown</h3>
          ${buildCostBreakdown(recipe, totalCost, costPerPortion, scale)}
        </div>

        <div class="gp-slider-card">
          <h3>Target GP</h3>
          <div style="display:flex;align-items:center;justify-content:center;gap:8px">
            <div class="gp-value-display" id="gp-display">${state.activeGP}<span>%</span></div>
            <input type="number" min="10" max="99" step="1" value="${state.activeGP}"
              id="gp-number-input"
              oninput="const v=Math.min(99,Math.max(10,+this.value||10));if(v>=10)updateGP(v)"
              style="width:52px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:13px;font-weight:700;padding:4px 6px;border-radius:5px;outline:none;text-align:center"
              title="Type a GP% directly" />
          </div>
          <input type="range" class="gp-slider" min="10" max="99" step="1"
            value="${state.activeGP}" id="gp-slider" oninput="updateGP(+this.value)" />
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:-4px">
            <span>10%</span><span>99%</span>
          </div>
          <div class="gp-presets">
            ${[55, 60, 65, 70, 72, 75, 78, 80]
              .map(
                (g) =>
                  `<button class="gp-preset-btn ${state.activeGP === g ? "active" : ""}" onclick="updateGP(${g})">${g}%</button>`,
              )
              .join("")}
          </div>
        </div>

        <div class="suggested-price-card">
          <div class="suggested-price-label">Suggested Sell Price</div>
          <div class="suggested-price" id="suggested-price">${fmt(sugPrice)}</div>
          <div id="profit-display" style="font-size:16px;font-weight:700;color:var(--green);margin-top:2px">${fmt(sugPrice - costPerPortion)} <span style="font-size:11px;font-weight:400;color:var(--text-muted)">profit / portion</span></div>
          <div class="suggested-price-meta" id="gp-meta">at ${state.activeGP}% GP · food cost ${fmt(costPerPortion)}</div>
          <div id="vat-price-display" style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-top:4px;padding:5px 8px;background:var(--bg-card2);border:1px solid var(--border);border-radius:4px;display:${state.vatRate > 0 ? "block" : "none"}">${state.vatRate > 0 ? '<span style="font-size:10px;font-weight:400;color:var(--text-muted)">' + state.vatRate + "% VAT inc.</span> " + fmt(sugPrice * (1 + (state.vatRate || 20) / 100)) : ""}</div>
          ${scale !== 1 ? `<div style="font-size:12px;color:var(--accent);margin-top:4px">Scaled ×${scale}: sell ${fmt(suggestPrice(scaledCost, state.activeGP))}</div>` : ""}
          <div class="price-comparison" id="price-comparison">${buildPriceComparison(costPerPortion)}</div>
          <!-- Price Override -->
          <div class="price-override-wrap">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted)">Override Sell Price</div>
              ${
                state.vatRate > 0
                  ? `<div style="display:flex;align-items:center;gap:0;background:var(--bg-card2);border:1px solid var(--border);border-radius:4px;overflow:hidden">
                <button id="override-vat-ex" onclick="setOverrideVatMode('ex')"
                  class="${(recipe.priceOverrideVatMode || "ex") === "ex" ? "override-vat-btn active" : "override-vat-btn"}"
                  title="Enter price excluding VAT">ex VAT</button>
                <button id="override-vat-inc" onclick="setOverrideVatMode('inc')"
                  class="${(recipe.priceOverrideVatMode || "ex") === "inc" ? "override-vat-btn active" : "override-vat-btn"}"
                  title="Enter price including VAT">inc VAT</button>
              </div>`
                  : ""
              }
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="color:var(--text-muted);font-size:14px">${state.currency || "£"}</span>
              <input type="number" class="price-override-input" id="price-override-input"
                placeholder="${sugPrice.toFixed(2)}"
                value="${recipe.priceOverride ? ((recipe.priceOverrideVatMode || "ex") === "inc" ? (recipe.priceOverride * (1 + (state.vatRate || 0) / 100)).toFixed(2) : recipe.priceOverride.toFixed(2)) : ""}"
                step="0.01" min="0"
                oninput="updatePriceOverride(+this.value||null)"
                title="Type your own sell price to see resulting GP" />
              ${recipe.priceOverride ? `<button class="btn-icon" onclick="updatePriceOverride(null);document.getElementById('price-override-input').value=''" title="Clear override"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ""}
            </div>
            ${
              recipe.priceOverride
                ? `
            <div class="override-gp-display" id="override-gp-display">
              ${buildOverrideGP(costPerPortion, recipe.priceOverride, recipe.priceOverrideVatMode || "ex")}
            </div>`
                : ""
            }
          </div>
          ${buildActualGPPanel(recipe)}
          <!-- What-if modeller -->
          ${buildWhatIfPanel(recipe, costPerPortion)}
          <!-- Nutrition summary -->
          ${buildNutritionSummary(recipe)}
          <!-- Recipe photo — bottom of panel -->
          <div class="recipe-photo-drop-zone ${recipe.photo ? "has-photo" : ""}"
            id="photo-drop-${recipe.id}"
            ondragover="event.preventDefault();this.classList.add('drag-over')"
            ondragleave="this.classList.remove('drag-over')"
            ondrop="handlePhotoDrop(event,'${recipe.id}')"
            onclick="showRecipePhoto('${recipe.id}')"
            title="${recipe.photo ? "Click to change photo, or drag & drop a new one" : "Click or drag & drop a photo"}">
            ${
              recipe.photo
                ? `<img src="${recipe.photo}" alt="Recipe photo" class="recipe-photo-thumb" />
                 <div class="photo-drop-overlay">
                   <span>📷 Change photo</span>
                 </div>
                 <button class="photo-remove-btn" onclick="event.stopPropagation();updateRecipeField('photo',null)" title="Remove photo">✕</button>`
                : `<div class="photo-drop-placeholder">
                   <div style="font-size:24px;margin-bottom:6px">📷</div>
                   <div style="font-size:12px;font-weight:600;color:var(--text-muted)">Add photo</div>
                   <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Click or drag & drop</div>
                 </div>`
            }
          </div>
        </div>
      </div>
    </div>
  `;

  initDragDrop();
}

function renderIngRow(ri, idx, scale = 1) {
  const ing = state.ingredients.find((i) => i.id === ri.ingId);
  if (!ing) return "";
  const waste = ri.wastePct || 0;
  const costRaw = ingLineCost(ri.ingId, ri.qty, ri.recipeUnit);
  const cost = waste > 0 ? costRaw / (1 - waste / 100) : costRaw;
  const scaledQty = ri.qty * scale;
  const scaledCost = cost * scale;

  const allSuppliers = [
    ...(ing.supplierId
      ? [{ id: ing.supplierId, packCost: ing.packCost, packSize: ing.packSize }]
      : []),
    ...(ing.altSuppliers || []),
  ];
  let cheapestHtml = "";
  if (allSuppliers.length > 1) {
    const cpuMain = ing.packSize > 0 ? ing.packCost / ing.packSize : Infinity;
    const cheaper = (ing.altSuppliers || []).filter((a) => {
      const cpu =
        (a.packSize || ing.packSize) > 0
          ? a.packCost / (a.packSize || ing.packSize)
          : Infinity;
      return cpu < cpuMain * 0.97;
    });
    if (cheaper.length) {
      const best = cheaper.reduce((a, b) => {
        const cpuA = a.packCost / (a.packSize || ing.packSize);
        const cpuB = b.packCost / (b.packSize || ing.packSize);
        return cpuA < cpuB ? a : b;
      });
      const bestCpu = best.packCost / (best.packSize || ing.packSize);
      const saving = Math.round((1 - bestCpu / cpuMain) * 100);
      const supName =
        state.suppliers?.find((s) => s.id === best.supplierId)?.name ||
        "Alt supplier";
      cheapestHtml = `<span style="font-size:9px;color:var(--green);background:rgba(76,175,125,0.1);border:1px solid rgba(76,175,125,0.3);border-radius:3px;padding:1px 4px;margin-left:3px;cursor:default" title="${escHtml(supName)} is ${saving}% cheaper">💚 -${saving}%</span>`;
    }
  }

  return `<tr draggable="true" data-idx="${idx}"
    ondragstart="dragStart(event,${idx})"
    ondragover="dragOver(event,${idx})"
    ondrop="dragDrop(event,${idx})"
    ondragend="dragEnd(event)"
    class="ing-row">
    <td class="drag-handle" title="Drag to reorder">⠿</td>
    <td class="ing-select-cell">
      <span class="ing-name-display ing-name-editable" title="Click to quick-edit prices"
        onclick="openIngQuickEdit('${ing.id}',this)">${escHtml(ing.name)}</span>
      ${cheapestHtml}
      ${(ing.allergens || []).length ? `<span class="allergen-dot" title="${escHtml(ing.allergens.join(", "))}">⚠</span>` : ""}
      ${(() => {
        const hist = ing.priceHistory || [];
        if (hist.length < 1) return "";
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recent = hist.filter((h) => new Date(h.date) >= thirtyDaysAgo);
        if (!recent.length) return "";
        const oldest = recent[0].packCost;
        const pct = oldest > 0 ? ((ing.packCost - oldest) / oldest) * 100 : 0;
        if (pct > 10)
          return `<span class="ing-drift-warn" title="Price up ${pct.toFixed(0)}% in last 30 days">📈+${pct.toFixed(0)}%</span>`;
        if (pct < -10)
          return `<span class="ing-drift-drop" title="Price down ${Math.abs(pct).toFixed(0)}% in last 30 days">📉${pct.toFixed(0)}%</span>`;
        return "";
      })()}
    </td>
    <td style="position:relative;text-align:right;padding-right:6px">
      <input type="number" min="0" step="any" value="${ri.qty}"
        onchange="updateIngQty(${idx},+this.value)"
        oninput="showQtyConversion(this,${idx},'${ing.unit}','${ri.recipeUnit || ing.unit}')"
        onblur="hideQtyConversion(this)"
        style="width:56px" />
      <div class="qty-conversion-tip" style="display:none"></div>
    </td>
    <td style="padding-left:4px;width:70px">
      ${(() => {
        const convertible = getConvertibleUnits(ing.unit);
        if (convertible.length <= 1)
          return `<span style="color:var(--text-muted);font-size:12px">${ing.unit}</span>`;
        return `<select onchange="updateIngUnit(${idx},this.value)" style="background:var(--bg-input);border:1px solid var(--border);color:var(--text-muted);font-family:var(--font);font-size:11px;padding:2px 4px;border-radius:4px;outline:none">
          ${convertible.map((u) => `<option value="${u}" ${(ri.recipeUnit || ing.unit) === u ? "selected" : ""}>${u}</option>`).join("")}
        </select>`;
      })()}
    </td>
    <td style="text-align:center;padding:2px 3px">
      <input type="number" min="0" max="99" step="1" value="${waste || ""}" placeholder="0"
        title="Wastage % — trim/prep loss added to cost"
        onchange="updateIngWaste(${idx},+this.value)"
        style="width:40px;text-align:center;font-size:11px;color:${waste > 0 ? "var(--accent)" : "var(--text-muted)"}" />
    </td>
    <td class="cost-cell" style="text-align:right;padding-right:14px;font-weight:${cost > 0 ? "600" : "400"};color:${cost > 0 ? "var(--text-primary)" : "var(--text-muted)"};">${cost > 0 ? fmt(cost) : '<span style="opacity:.4">—</span>'}${waste > 0 ? `<span style="font-size:9px;color:var(--accent);margin-left:2px" title="${waste}% waste added">+${waste}%</span>` : ""}
    </td>
    ${scale !== 1 ? `<td class="cost-cell" style="color:var(--blue);text-align:right">${fmt(scaledCost)} <span style="font-size:10px;color:var(--text-muted)">(${scaledQty.toFixed(1)}${ing.unit})</span></td>` : ""}
    <td style="padding:2px 3px;text-align:center;white-space:nowrap">
      <button class="btn-icon" onclick="openSubstitutionPanel('${ing.id}')" title="Find cheaper substitutes" style="color:var(--green);font-size:12px;font-weight:700">⇄</button>
      <button class="btn-icon" onclick="duplicateIngLine(${idx})" title="Duplicate row" style="margin-right:1px">⧉</button>
      <button class="btn-icon danger" onclick="removeIngredientLine(${idx})"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </td>
  </tr>`;
}

function showQtyConversion(input, idx, ingUnit, recipeUnit) {
  const tip = input.nextElementSibling;
  if (!tip) return;
  const qty = parseFloat(input.value);
  if (!qty || isNaN(qty)) {
    tip.style.display = "none";
    return;
  }
  const unit = recipeUnit || ingUnit;
  const conversions = {
    g: [
      ["kg", qty / 1000],
      ["oz", qty / 28.35],
      ["lb", qty / 453.6],
    ],
    kg: [
      ["g", qty * 1000],
      ["oz", qty * 35.27],
      ["lb", qty * 2.205],
    ],
    ml: [
      ["L", qty / 1000],
      ["fl oz", qty / 29.57],
      ["cups", qty / 237],
    ],
    L: [
      ["ml", qty * 1000],
      ["fl oz", qty * 33.81],
    ],
    oz: [
      ["g", qty * 28.35],
      ["kg", qty / 35.27],
      ["lb", qty / 16],
    ],
    lb: [
      ["g", qty * 453.6],
      ["kg", qty / 2.205],
      ["oz", qty * 16],
    ],
  };
  const alts = conversions[unit];
  if (!alts) {
    tip.style.display = "none";
    return;
  }
  tip.innerHTML = alts
    .filter(([u, v]) => {
      // Only show sensible ranges
      if (u === "g" && v > 10000) return false;
      if (u === "kg" && v < 0.01) return false;
      if (u === "ml" && v > 10000) return false;
      return true;
    })
    .map(([u, v]) => {
      const disp =
        v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
      return `<span>${disp}${u}</span>`;
    })
    .join(" · ");
  tip.style.display = tip.innerHTML ? "block" : "none";
}

function hideQtyConversion(input) {
  const tip = input.nextElementSibling;
  if (tip)
    setTimeout(() => {
      tip.style.display = "none";
    }, 150);
}

function renderSubRecipes(recipe) {
  let html = "";
  for (let idx = 0; idx < recipe.subRecipes.length; idx++) {
    const sr = recipe.subRecipes[idx];
    const subR = state.recipes.find((r) => r.id === sr.recipeId);
    const subCost = subR ? recipeCostPerUnit(subR) * (sr.qty || 1) : 0;
    const unitLabel = subR ? recipeUnitLabel(subR) : "portion";
    html += `<div class="sub-recipe-item" data-sr-idx="${idx}">
      <div style="flex:2;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${subR ? escHtml(subR.name) : '<span style="color:var(--red)">Recipe not found</span>'}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:1px">${subR ? escHtml(subR.category || "—") : ""} · ${subR ? fmt(recipeCostPerUnit(subR)) + " / " + unitLabel : ""}</div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex:none">
        <input type="number" min="0" step="any" value="${sr.qty || 1}" onchange="updateSubRecipe(${idx},'qty',+this.value)"
          title="Qty used in ${unitLabel}s" style="width:70px" />
        <span style="font-size:12px;font-weight:600;color:var(--text-secondary);white-space:nowrap">${unitLabel}</span>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px">
        <span class="sub-cost">${fmt(subCost)}</span>
      </div>
      <button class="btn-icon danger" onclick="removeSubRecipe(${idx})" title="Remove"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>`;
  }
  html += `<div style="margin-top:10px">
    <button class="btn-secondary btn-sm" onclick="openSubRecipePicker()" style="display:flex;align-items:center;gap:5px">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Recipe as Component
    </button>
  </div>`;
  return html;
}

function openSubRecipePicker() {
  const recipe = getActiveRecipe();
  if (!recipe) return;
  const usedIds = new Set((recipe.subRecipes || []).map((sr) => sr.recipeId));
  const available = state.recipes.filter(
    (r) => r.id !== recipe.id && !usedIds.has(r.id),
  );
  if (!available.length) {
    showToast("No other recipes available to add", "error", 2000);
    return;
  }

  window._subPickerRecipes = available;
  document.getElementById("sub-picker-search").value = "";
  renderSubPickerList(available);
  document.getElementById("sub-recipe-picker-modal").classList.remove("hidden");
  setTimeout(() => document.getElementById("sub-picker-search").focus(), 80);
}

function renderSubPickerList(recipes) {
  const list = document.getElementById("sub-picker-list");
  if (!recipes.length) {
    list.innerHTML =
      '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">No recipes found</div>';
    return;
  }
  // Group by category
  const grouped = {};
  recipes.forEach((r) => {
    const cat = r.category || "Uncategorised";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(r);
  });
  list.innerHTML = Object.entries(grouped)
    .map(
      ([cat, recs]) => `
    <div style="padding:4px 14px 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-muted);background:var(--bg-app);position:sticky;top:0;z-index:1">${escHtml(cat)}</div>
    ${recs
      .map((r) => {
        const cost = recipeTotalCost(r) / (r.portions || 1);
        const isBatch = !!r.yieldQty;
        const batchTag = isBatch
          ? `<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:rgba(139,92,246,0.15);color:#a78bfa;font-weight:700;flex-shrink:0">BATCH · ${r.yieldQty}${r.yieldUnit || ""}</span>`
          : "";
        return `<div onclick="confirmAddSubRecipe('${r.id}')"
          style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .1s"
          onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${escHtml(r.name)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${fmt(cost)} / portion · ${r.ingredients.length} ingredient${r.ingredients.length !== 1 ? "s" : ""}</div>
        </div>
        ${batchTag}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color:var(--text-muted);flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`;
      })
      .join("")}
  `,
    )
    .join("");
}

function filterSubPicker() {
  const q = document.getElementById("sub-picker-search").value.toLowerCase();
  const filtered = (window._subPickerRecipes || []).filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      (r.category || "").toLowerCase().includes(q),
  );
  renderSubPickerList(filtered);
}

function confirmAddSubRecipe(recipeId) {
  const recipe = getActiveRecipe();
  if (!recipe) return;
  const subR = state.recipes.find((r) => r.id === recipeId);
  if (!subR) return;
  if (!recipe.subRecipes) recipe.subRecipes = [];
  recipe.subRecipes.push({ recipeId: subR.id, qty: 1 });
  save();
  document.getElementById("sub-recipe-picker-modal").classList.add("hidden");
  renderRecipeEditor();
  showToast(`"${subR.name}" added as component`, "success", 2000);
}

function addSubRecipe() {
  openSubRecipePicker();
}

function buildStickyCostBar(recipe, costPerPortion, sugPrice, foodCostPct) {
  const price = recipe.priceOverride || sugPrice;
  const gp = price > 0 ? ((price - costPerPortion) / price) * 100 : 0;
  const profit = price - costPerPortion;
  const target = getFoodCostTarget();
  const gpClass =
    gp >= state.activeGP ? "green" : gp >= state.activeGP - 5 ? "amber" : "red";
  const fcClass =
    foodCostPct <= target
      ? "green"
      : foodCostPct <= target + 5
        ? "amber"
        : "red";
  const isPriced = !!recipe.pricedFlag;
  const vatRate = state.vatRate || 0;
  const vatLine =
    vatRate > 0
      ? `<div class="scb-item"><div class="scb-label">Inc. VAT</div><div class="scb-value">${fmt(price * (1 + vatRate / 100))}</div></div>`
      : "";
  return `<div class="sticky-cost-bar" id="sticky-cost-bar">
    <div class="scb-item"><div class="scb-label">Cost/Por.</div><div class="scb-value">${fmt(costPerPortion)}</div></div>
    <div class="scb-item"><div class="scb-label">Sell Price</div><div class="scb-value" style="display:flex;align-items:baseline;gap:5px;justify-content:center">${fmt(price)}${recipe.priceOverride ? '<span style="font-size:9px;font-weight:700;color:var(--accent);letter-spacing:.3px;flex-shrink:0">override</span>' : ""}</div></div>
    <div class="scb-item"><div class="scb-label">GP %</div><div class="scb-value ${gpClass}">${gp.toFixed(1)}%</div></div>
    <div class="scb-item"><div class="scb-label">Food Cost</div><div class="scb-value ${fcClass}">${foodCostPct.toFixed(1)}%</div></div>
    <div class="scb-item"><div class="scb-label">Profit/Por.</div><div class="scb-value ${gpClass}">${fmt(profit)}</div></div>
    ${vatLine}
    <button class="scb-priced-btn ${isPriced ? "is-priced" : ""}" onclick="togglePricedFlag('${recipe.id}')" title="${isPriced ? "Marked as priced — click to unmark" : "Mark this recipe as confirmed & priced"}">
      ${isPriced ? "✓ Priced" : "◎ Mark as Priced"}
    </button>
  </div>`;
}

// ─── Recipe Status Workflow ───────────────────────────────────────────────────
const STATUS_CYCLE = { draft: "review", review: "approved", approved: "draft" };
const STATUS_LABELS = {
  draft: "Draft",
  review: "In Review",
  approved: "Approved",
};

function cycleRecipeStatus(recipeId) {
  const r = state.recipes.find((x) => x.id === recipeId);
  if (!r) return;
  if (r.locked) {
    showToast("Recipe is locked — unlock first 🔒", "error", 2000);
    return;
  }
  const current = r.status || "draft";
  r.status = STATUS_CYCLE[current];
  save();
  // Update the badge in place without full re-render
  const btn = document.querySelector(".recipe-status-btn");
  if (btn) {
    btn.className = `recipe-status-btn status-${r.status}`;
    btn.innerHTML = `<span class="status-dot ${r.status}"></span>${STATUS_LABELS[r.status]}`;
  }
  renderSidebarRecipes();
  showToast(`Status → ${STATUS_LABELS[r.status]}`, "success", 1400);
}

// ─── Reverse Cost Calculator ──────────────────────────────────────────────────
function openReverseCostCalc() {
  const modal = document.getElementById("reverse-cost-modal");
  document.getElementById("rc-currency-sym").textContent =
    state.currency || "£";
  document.getElementById("rc-gp").value = state.activeGP || 75;

  // Populate recipe picker
  const sel = document.getElementById("rc-recipe-compare-sel");
  if (sel) {
    const sellable = state.recipes.filter((r) => !r.yieldQty);
    sel.innerHTML =
      '<option value="">— None —</option>' +
      sellable
        .map(
          (r) =>
            `<option value="${r.id}">${escHtml(r.name)}${r.category ? " · " + escHtml(r.category) : ""}</option>`,
        )
        .join("");
    // Default to active recipe if one is open
    const active = getActiveRecipe();
    if (active) {
      sel.value = active.id;
      // Pre-fill sell price from that recipe
      const cpp = recipeTotalCost(active) / (active.portions || 1);
      const price = active.priceOverride || suggestPrice(cpp, state.activeGP);
      document.getElementById("rc-sell-price").value = price.toFixed(2);
    }
  }

  modal.classList.remove("hidden");
  calcReverseCost();
}

function calcReverseCost() {
  const sellPrice = Math.max(
    0,
    parseFloat(document.getElementById("rc-sell-price").value) || 0,
  );
  const gp = Math.min(
    99.9,
    Math.max(0, parseFloat(document.getElementById("rc-gp").value) || 0),
  );
  const resultEl = document.getElementById("rc-result");
  const compareEl = document.getElementById("rc-active-recipe-compare");

  if (!sellPrice || !gp || gp >= 100) {
    resultEl.style.display = "none";
    compareEl.style.display = "none";
    return;
  }

  const maxCost = sellPrice * (1 - gp / 100);
  const profit = sellPrice - maxCost;
  const foodPct = ((maxCost / sellPrice) * 100).toFixed(1);
  const vatRate = state.vatRate || 0;

  document.getElementById("rc-budget").textContent = fmt(maxCost);
  document.getElementById("rc-budget-sub").textContent =
    `per portion at ${gp}% GP · sell price ${fmt(sellPrice)}`;
  document.getElementById("rc-profit").textContent = fmt(profit);
  document.getElementById("rc-food-cost-pct").textContent = foodPct + "%";

  const vatRow = document.getElementById("rc-vat-row");
  if (vatRate > 0) {
    vatRow.style.display = "block";
    document.getElementById("rc-inc-vat").textContent = fmt(
      sellPrice * (1 + vatRate / 100),
    );
  } else {
    vatRow.style.display = "none";
  }
  resultEl.style.display = "block";

  // Compare with selected recipe
  const selEl = document.getElementById("rc-recipe-compare-sel");
  const selId = selEl ? selEl.value : "";
  const recipe = selId ? state.recipes.find((r) => r.id === selId) : null;
  if (recipe) {
    const cpp = recipeTotalCost(recipe) / (recipe.portions || 1);
    const diff = cpp - maxCost;
    const under = diff <= 0;
    const col = under ? "var(--green)" : "var(--red)";
    const bg = under ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)";
    const border = under ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)";
    const icon = under ? "✓" : "⚠";
    const msg = under
      ? `${icon} <strong>${escHtml(recipe.name)}</strong> costs ${fmt(cpp)}/portion — <strong>${fmt(Math.abs(diff))} under</strong> your budget`
      : `${icon} <strong>${escHtml(recipe.name)}</strong> costs ${fmt(cpp)}/portion — <strong>${fmt(diff)} over</strong> your budget`;
    compareEl.innerHTML = msg;
    compareEl.style.cssText = `display:block;padding:12px 14px;border-radius:var(--radius-sm);font-size:12px;color:${col};background:${bg};border:1px solid ${border}`;
  } else {
    compareEl.style.display = "none";
  }
}

function togglePricedFlag(recipeId) {
  const r = state.recipes.find((x) => x.id === recipeId);
  if (!r) return;
  r.pricedFlag = !r.pricedFlag;
  save();
  const bar = document.getElementById("sticky-cost-bar");
  if (bar) {
    const totalCost = recipeTotalCost(r);
    const cpp = totalCost / (r.portions || 1);
    const sugPrice = suggestPrice(cpp, state.activeGP);
    const foodCostPct = sugPrice > 0 ? (cpp / sugPrice) * 100 : 0;
    bar.outerHTML = buildStickyCostBar(r, cpp, sugPrice, foodCostPct);
  }
  renderSidebarRecipes();
  showToast(r.pricedFlag ? "✓ Marked as priced" : "Unmarked", "success", 1500);
}

function buildCostBreakdown(recipe, totalCost, costPerPortion, scale = 1) {
  const ingCost = recipe.ingredients.reduce(
    (s, ri) => s + ingLineCost(ri.ingId, ri.qty, ri.recipeUnit),
    0,
  );
  const subCost = totalCost - ingCost;
  const portions = recipe.portions || 1;
  let rows = "";
  if (recipe.ingredients.length)
    rows += `<div class="cost-row"><span class="label">Ingredients</span><span class="value">${fmt(ingCost)}</span></div>`;
  if (subCost > 0)
    rows += `<div class="cost-row"><span class="label">Sub-recipes</span><span class="value">${fmt(subCost)}</span></div>`;
  const totalRecipeCost = ingCost + subCost;
  if (recipe.yieldQty && recipe.yieldQty > 0) {
    const unit = recipe.yieldUnit || "unit";
    rows += `<div class="cost-row"><span class="label">Yield</span><span class="value">÷ ${recipe.yieldQty} ${unit}</span></div>`;
    rows += `<div class="cost-row total"><span class="label">Cost / ${unit}</span><span class="value accent">${fmt(totalRecipeCost / recipe.yieldQty)}</span></div>`;
    rows += `<div class="cost-row"><span class="label" style="font-size:11px;color:var(--text-muted)">Cost / portion (${portions})</span><span class="value" style="font-size:12px">${fmt(costPerPortion)}</span></div>`;
  } else {
    if (portions > 1)
      rows += `<div class="cost-row"><span class="label">Portions</span><span class="value">÷ ${portions}</span></div>`;
    rows += `<div class="cost-row total"><span class="label">Cost / portion</span><span class="value accent">${fmt(costPerPortion)}</span></div>`;
  }
  if (scale !== 1)
    rows += `<div class="cost-row"><span class="label">Scaled ×${scale}</span><span class="value" style="color:var(--blue)">${fmt(costPerPortion * scale)}</span></div>`;

  // Top cost drivers
  if (recipe.ingredients.length > 1 && totalRecipeCost > 0) {
    const drivers = recipe.ingredients
      .map((ri) => ({
        ing: state.ingredients.find((i) => i.id === ri.ingId),
        cost: ingLineCost(ri.ingId, ri.qty, ri.recipeUnit),
      }))
      .filter((d) => d.ing && d.cost > 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 4);
    if (drivers.length) {
      rows += `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);font-weight:700;margin-bottom:6px">Top Cost Drivers</div>`;
      drivers.forEach((d) => {
        const pct = Math.round((d.cost / totalRecipeCost) * 100);
        rows += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <div style="flex:1;font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(d.ing.name)}">${escHtml(d.ing.name)}</div>
          <div style="width:60px;height:5px;background:var(--bg-card2);border-radius:3px;flex-shrink:0">
            <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:3px"></div>
          </div>
          <div style="font-size:11px;color:var(--text-muted);width:32px;text-align:right;flex-shrink:0">${pct}%</div>
          <div style="font-size:11px;font-weight:600;width:44px;text-align:right;flex-shrink:0">${fmt(d.cost)}</div>
        </div>`;
      });
      rows += `</div>`;
    }
  }
  rows += buildCostSparkline(recipe);
  return rows;
}

function buildPriceComparison(costPerPortion) {
  const vat = (state.vatRate || 20) / 100;
  const cur = state.currency || "\u00a3";
  const gpTarget = state.activeGP || 70;
  const breakEven = costPerPortion;
  const minPrice = suggestPrice(costPerPortion, gpTarget);
  const basePrice = suggestPrice(costPerPortion, gpTarget);
  const step = basePrice < 5 ? 0.5 : basePrice < 15 ? 1 : 2;
  const points = [];
  for (let i = -3; i <= 3; i++) {
    const p = Math.round((basePrice + i * step) * 100) / 100;
    if (p > costPerPortion * 1.05) points.push(p);
  }
  const covers = 50;
  const activeR = state.recipes
    ? state.recipes.find((r) => r.id === state.activeRecipeId)
    : null;
  const overridePrice = activeR?.priceOverride || null;
  const rows = points.map((price) => {
    const gp = ((price - costPerPortion) / price) * 100;
    const profit = price - costPerPortion;
    const gpCol =
      gp >= gpTarget
        ? "var(--green)"
        : gp >= gpTarget - 8
          ? "var(--accent)"
          : "var(--red)";
    const barW = Math.min(100, Math.max(4, (gp / 100) * 100)).toFixed(0);
    return { price, gp, profit, gpCol, barW };
  });
  const minProfit = rows[0] ? rows[0].profit * covers * 52 : 0;
  const maxProfit = rows[rows.length - 1]
    ? rows[rows.length - 1].profit * covers * 52
    : 0;
  const annualDiff = maxProfit - minProfit;

  return `<div style="margin-top:14px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-muted);margin-bottom:8px">Price scenarios <span style="font-size:9px;font-weight:400;color:var(--text-muted)">\u2014 click a row to apply</span></div>
    <div style="display:grid;grid-template-columns:52px 1fr 36px 52px;gap:4px;font-size:9px;color:var(--text-muted);margin-bottom:4px;padding:0 2px">
      <div>Price</div><div></div><div style="text-align:right">GP%</div><div style="text-align:right">Profit</div>
    </div>
    ${rows
      .map(({ price, gp, profit, gpCol, barW }) => {
        const isOverride =
          overridePrice && Math.abs(price - overridePrice) < 0.015;
        const bg = isOverride ? "var(--accent-bg)" : "var(--bg-card2)";
        const bdr = isOverride
          ? "1px solid var(--accent-dim)"
          : "1px solid transparent";
        return `<div style="background:${bg};border:${bdr};border-radius:5px;padding:5px 7px;margin-bottom:3px;cursor:pointer;display:grid;grid-template-columns:52px 1fr 36px 52px;align-items:center;gap:4px"
        onclick="(function(){const p=${price.toFixed(2)};updatePriceOverride(p);const el=document.getElementById('price-override-input');if(el){el.value=p.toFixed(2);}})()"
        onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background='${isOverride ? "var(--accent-bg)" : "var(--bg-card2)"}'">
        <div style="font-size:12px;font-weight:700;color:${isOverride ? "var(--accent)" : "var(--text-primary)"}">${cur}${price.toFixed(2)}</div>
        <div style="height:5px;background:var(--bg-hover);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${barW}%;background:${gpCol};border-radius:3px"></div>
        </div>
        <div style="text-align:right;font-size:11px;font-weight:700;color:${gpCol}">${gp.toFixed(0)}%</div>
        <div style="text-align:right;font-size:11px;color:var(--text-secondary)">${cur}${profit.toFixed(2)}</div>
      </div>${isOverride ? `<div style="font-size:9px;color:var(--accent);text-align:center;margin:-1px 0 3px;font-weight:700">\u25b2 current</div>` : ""}`;
      })
      .join("")}
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
        <div style="background:var(--bg-card2);border-radius:5px;padding:8px 10px">
          <div style="font-size:9px;color:var(--text-muted);margin-bottom:2px">Break-even</div>
          <div style="font-size:15px;font-weight:700;color:var(--text-primary)">${cur}${breakEven.toFixed(2)}</div>
          <div style="font-size:9px;color:var(--text-muted)">0% GP floor</div>
        </div>
        <div style="background:var(--bg-card2);border-radius:5px;padding:8px 10px">
          <div style="font-size:9px;color:var(--text-muted);margin-bottom:2px">At ${gpTarget}% GP</div>
          <div style="font-size:15px;font-weight:700;color:var(--accent)">${cur}${minPrice.toFixed(2)}</div>
          <div style="font-size:9px;color:var(--text-muted)">suggested minimum</div>
        </div>
      </div>
      ${
        annualDiff > 50
          ? `<div style="font-size:11px;color:var(--text-secondary);line-height:1.5;padding:7px 9px;background:var(--bg-card2);border-radius:5px;border-left:3px solid var(--green)">
        At ${covers} covers/week, this price range is worth <span style="color:var(--green);font-weight:700">${cur}${Math.round(annualDiff).toLocaleString()}/yr</span> difference.
      </div>`
          : ""
      }
    </div>
  </div>`;
}

// ─── Recipe Field Updates ──────────────────────────────────────
function toggleCatDropdown(e, recipeId) {
  e.stopPropagation();
  const dd = document.getElementById("cat-dropdown-" + recipeId);
  if (!dd) return;
  const isHidden = dd.classList.contains("hidden");
  // Close all other open dropdowns
  document
    .querySelectorAll(".rh-cat-dropdown")
    .forEach((d) => d.classList.add("hidden"));
  if (isHidden) {
    dd.classList.remove("hidden");
    // Close on outside click
    setTimeout(() => {
      document.addEventListener("click", function closeDd(ev) {
        dd.classList.add("hidden");
        document.removeEventListener("click", closeDd);
      });
    }, 0);
  }
}

function pickCategory(e, recipeId, cat) {
  e.stopPropagation();
  const r = state.recipes.find((x) => x.id === recipeId);
  if (!r) return;
  if (r.locked) {
    showToast("Recipe is locked — unlock first 🔒", "error", 2000);
    return;
  }
  r.category = cat;
  // Close dropdown
  document
    .querySelectorAll(".rh-cat-dropdown")
    .forEach((d) => d.classList.add("hidden"));
  renderSidebarRecipes();
  renderRecipeEditor();
  save();
}

function updateRecipeField(field, value) {
  const r = getActiveRecipe();
  if (!r) return;
  if (r.locked && field !== "locked") {
    showToast("Recipe is locked — unlock first 🔒", "error", 2000);
    return;
  }
  // Warn on duplicate recipe name (but don't block — just toast)
  if (field === "name" && value.trim()) {
    const dupe = state.recipes.find(
      (x) =>
        x.id !== r.id && x.name.toLowerCase() === value.trim().toLowerCase(),
    );
    if (dupe)
      showToast(
        `⚠ Another recipe named "${dupe.name}" already exists`,
        "error",
        3000,
      );
  }
  r[field] = value;
  r.lastEdited = new Date().toISOString();
  renderSidebarRecipes();
  if (["portions", "scale", "photo"].includes(field)) renderRecipeEditor();
  // Text fields (name/notes/times) fire oninput on every keystroke — debounce
  const isTextInput = ["name", "notes", "prepTime", "cookTime"].includes(field);
  isTextInput ? debouncedSave() : save();
}

function toggleSubRecipeMode(recipeId) {
  const recipe = state.recipes.find((r) => r.id === recipeId);
  if (!recipe) return;
  if (recipe.locked) {
    showToast("Recipe is locked — unlock first", "error", 2000);
    return;
  }
  if (recipe.yieldQty) {
    // Turn off — clear yield
    recipe.yieldQty = null;
    recipe.yieldUnit = "";
  } else {
    // Turn on — set a default yield equal to portions
    recipe.yieldQty = recipe.portions || 1;
    recipe.yieldUnit = "portions";
  }
  save();
  renderRecipeEditor();
}

function updateIngQty(idx, qty) {
  const r = getActiveRecipe();
  if (!r) return;
  pushUndo();
  r.ingredients[idx].qty = qty;
  refreshCostPanel();
  renderSidebarRecipes();
  debouncedSave();
}

function updateIngUnit(idx, unit) {
  const r = getActiveRecipe();
  if (!r) return;
  r.ingredients[idx].recipeUnit = unit; // always store the selected unit explicitly
  refreshCostPanel();
  renderSidebarRecipes();
  save();
}

function updateIngWaste(idx, pct) {
  const r = getActiveRecipe();
  if (!r) return;
  pushUndo();
  r.ingredients[idx].wastePct = pct > 0 ? pct : 0;
  refreshCostPanel();
  renderSidebarRecipes();
  debouncedSave();
}

function duplicateIngLine(idx) {
  const r = getActiveRecipe();
  if (!r) return;
  if (r.locked) {
    showToast("Recipe is locked — unlock first 🔒", "error", 2000);
    return;
  }
  pushUndo();
  const copy = { ...r.ingredients[idx] };
  r.ingredients.splice(idx + 1, 0, copy);
  renderRecipeEditor();
  renderSidebarRecipes();
  save();
  showToast("Row duplicated", "success", 1200);
}

function removeIngredientLine(idx) {
  const r = getActiveRecipe();
  if (!r) return;
  pushUndo();
  r.ingredients.splice(idx, 1);
  renderRecipeEditor();
  renderSidebarRecipes();
  save();
}

function updateSubRecipe(idx, field, value) {
  const r = getActiveRecipe();
  if (!r) return;
  r.subRecipes[idx][field] = field === "qty" ? +value : value;
  debouncedSave();
  renderRecipeEditor();
  renderSidebarRecipes();
}
function removeSubRecipe(idx) {
  const r = getActiveRecipe();
  if (!r) return;
  r.subRecipes.splice(idx, 1);
  renderRecipeEditor();
  renderSidebarRecipes();
  save();
}
function addSubRecipe() {
  openSubRecipePicker();
}
function toggleNotesPanel() {
  const body = document.getElementById("recipe-notes-body");
  const chevron = document.getElementById("notes-chevron");
  if (!body) return;
  const isHidden = body.style.display === "none";
  body.style.display = isHidden ? "" : "none";
  if (chevron) chevron.textContent = isHidden ? "▴" : "▾";
  if (isHidden) {
    setTimeout(() => {
      const ta = body.querySelector("textarea");
      if (ta) ta.focus();
    }, 50);
  }
}

function toggleSubRecipes() {
  const b = document.getElementById("sub-recipe-body"),
    c = document.getElementById("sub-recipe-chevron");
  if (!b) return;
  const hidden = b.style.display === "none";
  b.style.display = hidden ? "" : "none";
  c.textContent = hidden ? "▾" : "▸";
}

// ─── GP Slider ─────────────────────────────────────────────────
function updateGP(gp) {
  state.activeGP = gp;
  const disp = document.getElementById("gp-display");
  const slider = document.getElementById("gp-slider");
  if (disp) disp.innerHTML = gp + "<span>%</span>";
  if (slider) slider.value = gp;
  const numInput = document.getElementById("gp-number-input");
  if (numInput && document.activeElement !== numInput) numInput.value = gp;
  document
    .querySelectorAll(".gp-preset-btn")
    .forEach((b) => b.classList.toggle("active", +b.textContent === gp));
  refreshCostPanel();
  renderSidebarRecipes();
  save();
}

function refreshCostPanel() {
  const recipe = getActiveRecipe();
  if (!recipe) return;
  const totalCost = recipeTotalCost(recipe);
  const portions = recipe.portions || 1;
  const costPerPortion = totalCost / portions;
  const sugPrice = suggestPrice(costPerPortion, state.activeGP);
  const scale = recipe.scale || 1;

  // Update row costs
  const rows = document.querySelectorAll("#recipe-ing-tbody tr");
  recipe.ingredients.forEach((ri, idx) => {
    if (rows[idx]) {
      const cells = rows[idx].querySelectorAll(".cost-cell");
      const rowCost = ingLineCost(ri.ingId, ri.qty, ri.recipeUnit);
      if (cells[0]) cells[0].textContent = fmt(rowCost);
      if (cells[1])
        cells[1].innerHTML = `${fmt(rowCost * scale)} <span style="font-size:10px;color:var(--text-muted)">(${(ri.qty * scale).toFixed(1)}${ri.recipeUnit || state.ingredients.find((i) => i.id === ri.ingId)?.unit || ""})</span>`;
    }
  });

  const card = document.querySelector(".cost-summary-card");
  if (card)
    card.innerHTML =
      "<h3>Cost Breakdown</h3>" +
      buildCostBreakdown(recipe, totalCost, costPerPortion, scale);
  const sp = document.getElementById("suggested-price");
  if (sp) sp.textContent = fmt(sugPrice);
  const meta = document.getElementById("gp-meta");
  if (meta)
    meta.textContent = `at ${state.activeGP}% GP · food cost ${fmt(costPerPortion)} · profit ${fmt(sugPrice - costPerPortion)}/portion`;
  const profitEl = document.getElementById("profit-display");
  if (profitEl)
    profitEl.firstChild.textContent = fmt(sugPrice - costPerPortion) + " ";
  const vatEl = document.getElementById("vat-price-display");
  if (vatEl) {
    if (state.vatRate > 0) {
      vatEl.style.display = "block";
      vatEl.innerHTML =
        '<span style="font-size:10px;font-weight:400;color:var(--text-muted)">' +
        state.vatRate +
        "% VAT inc.</span> " +
        fmt(sugPrice * (1 + (state.vatRate || 20) / 100));
    } else {
      vatEl.style.display = "none";
    }
  }
  const pc = document.getElementById("price-comparison");
  if (pc) pc.innerHTML = buildPriceComparison(costPerPortion);
}

// ─── Drag & Drop Reorder ──────────────────────────────────────
function initDragDrop() {
  // Handled via inline handlers on tr elements
}
function dragStart(e, idx) {
  dragSrcIdx = idx;
  e.dataTransfer.effectAllowed = "move";
  e.target.closest("tr").classList.add("dragging");
}
function dragOver(e, idx) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  document
    .querySelectorAll(".ing-row")
    .forEach((r) => r.classList.remove("drag-over"));
  e.target.closest("tr")?.classList.add("drag-over");
}
function dragDrop(e, idx) {
  e.preventDefault();
  if (dragSrcIdx === null || dragSrcIdx === idx) return;
  const recipe = getActiveRecipe();
  if (!recipe) return;
  const moved = recipe.ingredients.splice(dragSrcIdx, 1)[0];
  recipe.ingredients.splice(idx, 0, moved);
  dragSrcIdx = null;
  renderRecipeEditor();
  save();
}
function dragEnd(e) {
  dragSrcIdx = null;
  document
    .querySelectorAll(".ing-row")
    .forEach((r) => r.classList.remove("dragging", "drag-over"));
}

// ─── Inline Ingredient Quick-Edit Popover ────────────────────────────────────
function openIngQuickEdit(ingId, el) {
  document.querySelectorAll(".ing-quick-edit").forEach((p) => p.remove());
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!ing) return;
  const usedIn = state.recipes.filter((r) =>
    r.ingredients.some((ri) => ri.ingId === ingId),
  );
  const pop = document.createElement("div");
  pop.className = "ing-quick-edit";
  pop.innerHTML = `
    <div class="iqe-header">
      <span class="iqe-name">${escHtml(ing.name)}</span>
      <button onclick="document.querySelectorAll('.ing-quick-edit').forEach(p=>p.remove())" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px;padding:0">✕</button>
    </div>
    <div class="iqe-row">
      <label>Pack Size</label>
      <input type="number" class="iqe-input" id="iqe-size-${ingId}" value="${ing.packSize}" step="any" min="0" />
      <span style="font-size:11px;color:var(--text-muted)">${escHtml(ing.unit)}</span>
    </div>
    <div class="iqe-row">
      <label>Pack Cost</label>
      <span style="font-size:12px;color:var(--text-muted)">${state.currency || "£"}</span>
      <input type="number" class="iqe-input" id="iqe-cost-${ingId}" value="${ing.packCost}" step="0.01" min="0" />
    </div>
    <div class="iqe-row">
      <label>Yield %</label>
      <input type="number" class="iqe-input" id="iqe-yield-${ingId}" value="${ing.yieldPct || 100}" step="1" min="1" max="100" />
      <span style="font-size:11px;color:var(--text-muted)">%</span>
    </div>
    <div class="iqe-preview" id="iqe-preview-${ingId}">Cost/unit: ${fmt(costPerUnit(ing))}/${escHtml(ing.unit)}</div>
    ${usedIn.length ? `<div style="font-size:10px;color:var(--text-muted);margin-top:4px;margin-bottom:4px">Used in: ${usedIn.map((r) => escHtml(r.name)).join(", ")}</div>` : ""}
    <div class="iqe-footer">
      <button class="btn-secondary btn-sm" onclick="document.querySelectorAll('.ing-quick-edit').forEach(p=>p.remove())">Cancel</button>
      <button class="btn-primary btn-sm" onclick="saveIngQuickEdit('${ingId}')">Save</button>
    </div>`;

  // Live cost preview
  ["size", "cost", "yield"].forEach((key) => {
    pop.querySelector(`#iqe-${key}-${ingId}`)?.addEventListener("input", () => {
      const size =
        parseFloat(pop.querySelector(`#iqe-size-${ingId}`).value) || 0;
      const cost =
        parseFloat(pop.querySelector(`#iqe-cost-${ingId}`).value) || 0;
      const yld =
        parseFloat(pop.querySelector(`#iqe-yield-${ingId}`).value) || 100;
      const cpu = size > 0 ? cost / size / (yld / 100) : 0;
      const prev = pop.querySelector(`#iqe-preview-${ingId}`);
      if (prev) prev.textContent = "Cost/unit: " + fmt(cpu) + "/" + ing.unit;
    });
  });

  // Position relative to the ingredient name element, but attach to body
  // so table overflow:hidden doesn't clip it
  document.body.appendChild(pop);
  const rect = el.getBoundingClientRect();
  const popW = 260;
  const left = Math.min(rect.left, window.innerWidth - popW - 10);
  const top = rect.bottom + 4 + window.scrollY;
  pop.style.cssText += `;position:fixed;left:${left}px;top:${rect.bottom + 4}px;z-index:9999;min-width:${popW}px`;

  // Close on outside click — but NOT when clicking inside the popover
  setTimeout(() => {
    document.addEventListener("click", function closePop(e) {
      if (!pop.contains(e.target) && !el.contains(e.target)) {
        pop.remove();
        document.removeEventListener("click", closePop);
      }
    });
  }, 0);

  pop.querySelector(`#iqe-cost-${ingId}`)?.focus();
  pop.querySelector(`#iqe-cost-${ingId}`)?.select();
}

function saveIngQuickEdit(ingId) {
  const pop = document.querySelector(".ing-quick-edit");
  if (!pop) return;
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!ing) return;
  const newSize = parseFloat(pop.querySelector(`#iqe-size-${ingId}`)?.value);
  const newCost = parseFloat(pop.querySelector(`#iqe-cost-${ingId}`)?.value);
  const newYld = parseFloat(pop.querySelector(`#iqe-yield-${ingId}`)?.value);
  if (!isNaN(newSize) && newSize > 0) ing.packSize = newSize;
  const oldCostQE = ing.packCost;
  if (!isNaN(newCost) && newCost >= 0) {
    if (ing.packCost !== newCost) {
      if (!ing.priceHistory) ing.priceHistory = [];
      ing.priceHistory.push({
        date: new Date().toISOString().slice(0, 10),
        packCost: ing.packCost,
      });
    }
    ing.packCost = newCost;
  }
  if (!isNaN(newYld) && newYld > 0) ing.yieldPct = newYld;
  pop.remove();
  save();
  refreshCostPanel();
  renderIngredientLibrary && renderIngredientLibrary();
  showToast("✓ " + ing.name + " updated", "success", 1500);
  if (oldCostQE !== ing.packCost) checkPriceImpact(ing, oldCostQE, ing.packCost);
}

// ─── AI Recipe Import ─────────────────────────────────────────────────────────
function openRecipeImport() {
  const modal = document.getElementById("recipe-import-modal");
  if (!modal) return;
  document.getElementById("recipe-import-url").value = "";
  document.getElementById("recipe-import-text").value = "";
  document.getElementById("recipe-import-result").innerHTML = "";
  document.getElementById("recipe-import-result").classList.add("hidden");
  document.getElementById("recipe-import-btn").disabled = false;
  document.getElementById("recipe-import-btn").textContent = "✨ Import Recipe";
  modal.classList.remove("hidden");
}

async function runRecipeImport() {
  const key = getAiKey("gemini-flash") || getAiKey("gemini-flash-lite") || "";
  if (!key) {
    showToast("Add your Google API key in Settings first", "error", 3000);
    return;
  }

  const url = document.getElementById("recipe-import-url").value.trim();
  const text = document.getElementById("recipe-import-text").value.trim();
  if (!url && !text) {
    showToast("Paste a URL or recipe text first", "error", 2000);
    return;
  }

  const btn = document.getElementById("recipe-import-btn");
  btn.disabled = true;
  btn.textContent = "⏳ Importing…";

  const ingList = state.ingredients
    .map((i) => `${i.name} (${i.unit})`)
    .join(", ");
  const subRecipeList =
    state.recipes
      .filter((r) => r.yieldQty)
      .map((r) => r.name)
      .join(", ") || "none";
  const prompt = `You are a recipe costing assistant. Extract the recipe from the following ${url ? "URL content" : "text"} and return ONLY a JSON object with this exact structure:
{
  "name": "Recipe name",
  "portions": 1,
  "category": "one of: Starters, Mains, Desserts, Breakfast, Sides, Sauces, Other",
  "notes": "cooking method summary",
  "ingredients": [
    { "name": "ingredient name", "qty": 100, "unit": "g", "libraryMatch": "exact name from library if match found or null", "subRecipeMatch": "exact sub-recipe name if this is a prepared component or null" }
  ]
}

My ingredient library contains: ${ingList}

My existing sub-recipes (prepared components) are: ${subRecipeList}

Rules:
- libraryMatch: if the ingredient closely matches one in my library, put the exact library name. Otherwise null.
- subRecipeMatch: if the ingredient is a prepared component matching one of my sub-recipes, put the exact sub-recipe name. Otherwise null. libraryMatch and subRecipeMatch are mutually exclusive.
- Units must be one of: g, kg, ml, L, each, oz, lb, portion
- IMPORTANT: Include ALL ingredients even if not in the library. Do not skip or omit any ingredient.

${url ? "URL: " + url : "Recipe text:\n" + text}

Return ONLY valid JSON, no markdown, no explanation.`;

  try {
    const raw = await callGeminiText(prompt);
    const recipe = JSON.parse(raw);
    renderImportPreview(recipe);
  } catch (e) {
    showToast("Import failed: " + e.message, "error", 4000);
    btn.disabled = false;
    btn.textContent = "✨ Import Recipe";
  }
}

function renderImportPreview(importedRecipe) {
  const btn = document.getElementById("recipe-import-btn");
  btn.textContent = "✨ Import Recipe";
  btn.disabled = false;

  const resultDiv = document.getElementById("recipe-import-result");
  resultDiv.classList.remove("hidden");

  const ingRows = (importedRecipe.ingredients || [])
    .map((ri, idx) => {
      const libMatch = ri.libraryMatch
        ? state.ingredients.find((i) => i.name === ri.libraryMatch)
        : null;
      const subMatch = ri.subRecipeMatch
        ? state.recipes.find((r) => r.name === ri.subRecipeMatch)
        : null;
      // Fuzzy fallback — try case-insensitive match if AI got slightly wrong name
      const fuzzyLib =
        !libMatch && !subMatch
          ? state.ingredients.find(
              (i) => i.name.toLowerCase() === ri.name.toLowerCase(),
            )
          : null;
      const fuzzyRecipe =
        !libMatch && !subMatch && !fuzzyLib
          ? state.recipes.find(
              (r) => r.name.toLowerCase() === ri.name.toLowerCase(),
            )
          : null;
      const finalLib = libMatch || fuzzyLib;
      const finalSub = subMatch || fuzzyRecipe;

      let matchHtml;
      if (finalSub) {
        matchHtml = `<span style="color:var(--blue,#60a5fa);font-size:10px">⧉ sub-recipe: "${escHtml(finalSub.name)}"</span>`;
      } else if (finalLib) {
        matchHtml = `<span style="color:var(--green);font-size:10px">✓ "${escHtml(finalLib.name)}"</span>`;
      } else {
        matchHtml = `<span style="color:var(--accent);font-size:10px">＋ will be added to library</span>`;
      }

      // Attach resolved matches to the ri object for confirmRecipeImport to use
      ri._resolvedLib = finalLib || null;
      ri._resolvedSub = finalSub || null;

      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
      <input type="checkbox" class="import-ri-check" data-idx="${idx}" checked style="flex-shrink:0" />
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600">${escHtml(ri.name)}</div>
        ${matchHtml}
      </div>
      <input type="number" class="iqe-input import-ri-qty" data-idx="${idx}" value="${ri.qty}" step="any" min="0" style="width:60px" />
      <span style="font-size:11px;color:var(--text-muted);width:30px">${escHtml(ri.unit)}</span>
    </div>`;
    })
    .join("");

  const totalIngs = (importedRecipe.ingredients || []).length;
  const matched = (importedRecipe.ingredients || []).filter(
    (ri) => ri._resolvedLib,
  ).length;
  const subCount = (importedRecipe.ingredients || []).filter(
    (ri) => ri._resolvedSub,
  ).length;
  const newCount = totalIngs - matched - subCount;

  resultDiv.innerHTML = `
    <div style="font-size:13px;font-weight:700;margin-bottom:2px">${escHtml(importedRecipe.name || "Imported Recipe")}</div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">${importedRecipe.portions || 1} portion${importedRecipe.portions !== 1 ? "s" : ""} · ${escHtml(importedRecipe.category || "")}</div>
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
      ${matched ? `<span style="font-size:10px;color:var(--green);background:rgba(34,197,94,.12);padding:2px 8px;border-radius:10px">✓ ${matched} matched</span>` : ""}
      ${subCount ? `<span style="font-size:10px;color:#60a5fa;background:rgba(96,165,250,.12);padding:2px 8px;border-radius:10px">⧉ ${subCount} sub-recipe${subCount !== 1 ? "s" : ""}</span>` : ""}
      ${newCount ? `<span style="font-size:10px;color:var(--accent);background:var(--accent-bg);padding:2px 8px;border-radius:10px">＋ ${newCount} new to library</span>` : ""}
    </div>
    <div style="margin-bottom:10px;max-height:220px;overflow-y:auto">${ingRows}</div>
    <button class="btn-primary" style="width:100%" onclick="confirmRecipeImport(${JSON.stringify(importedRecipe).replace(/"/g, "&quot;")})">
      ✓ Create Recipe
    </button>`;
}

function confirmRecipeImport(importedRecipe) {
  // Gather checked ingredients with updated qtys
  const checks = document.querySelectorAll(".import-ri-check");
  const qtys = document.querySelectorAll(".import-ri-qty");
  const recipe = {
    id: uid(),
    name: importedRecipe.name || "Imported Recipe",
    category: importedRecipe.category || "",
    portions: importedRecipe.portions || 1,
    notes: importedRecipe.notes || "",
    ingredients: [],
    subRecipes: [],
    versions: [],
    tags: [],
    locked: false,
    priceOverride: null,
    costHistory: [],
  };

  let addedToLibrary = 0;
  let addedSubs = 0;

  (importedRecipe.ingredients || []).forEach((ri, idx) => {
    if (!checks[idx]?.checked) return;
    const qty = parseFloat(qtys[idx]?.value) || ri.qty || 100;

    // Sub-recipe link
    if (ri._resolvedSub) {
      recipe.subRecipes = recipe.subRecipes || [];
      recipe.subRecipes.push({
        recipeId: ri._resolvedSub.id,
        qty,
        unit: ri.unit || "portion",
      });
      addedSubs++;
      return;
    }

    // Matched library ingredient
    if (ri._resolvedLib) {
      recipe.ingredients.push({
        ingId: ri._resolvedLib.id,
        qty,
        recipeUnit: ri.unit || ri._resolvedLib.unit,
      });
      return;
    }

    // Not in library — create a stub ingredient and add it
    const newIng = {
      id: uid(),
      name: ri.name,
      category: "Other",
      packSize: 1,
      packCost: 0,
      unit: ri.unit || "g",
      yieldPct: 100,
      allergens: [],
      priceHistory: [],
      costHistory: [],
      nutrition: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
      supplierId: null,
      altSuppliers: [],
      seasonal: false,
    };
    state.ingredients.push(newIng);
    recipe.ingredients.push({
      ingId: newIng.id,
      qty,
      recipeUnit: ri.unit || newIng.unit,
    });
    addedToLibrary++;
  });

  state.recipes.push(recipe);
  state.activeRecipeId = recipe.id;
  document.getElementById("recipe-import-modal").classList.add("hidden");
  render();
  renderRecipeEditor();
  save();
  showView("recipes");
  const parts = [`✓ "${recipe.name}" imported`];
  if (recipe.ingredients.length)
    parts.push(
      `${recipe.ingredients.length} ingredient${recipe.ingredients.length !== 1 ? "s" : ""}`,
    );
  if (addedSubs)
    parts.push(`${addedSubs} sub-recipe${addedSubs !== 1 ? "s" : ""}`);
  if (addedToLibrary)
    parts.push(
      `${addedToLibrary} new item${addedToLibrary !== 1 ? "s" : ""} added to library`,
    );
  showToast(parts.join(" · "), "success", 4000);
}

// ─── Ingredient Search Dropdown ────────────────────────────────
let hideDropdownTimer;
// Tracks keyboard-focused item index in the dropdown
let _ingDropdownFocusIdx = -1;

function handleIngSearchKey(e) {
  const dropdown = document.getElementById("ing-dropdown");

  if (e.key === "Escape") {
    e.target.value = "";
    if (dropdown) {
      dropdown.classList.add("hidden");
      dropdown.innerHTML = "";
    }
    _multiAddSelected.clear();
    _ingDropdownFocusIdx = -1;
    e.target.blur();
    return;
  }

  if (!dropdown || dropdown.classList.contains("hidden")) return;

  const items = [...dropdown.querySelectorAll(".ing-dd-item")];
  if (!items.length) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    _ingDropdownFocusIdx = Math.min(_ingDropdownFocusIdx + 1, items.length - 1);
    updateIngDropdownFocus(items);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    _ingDropdownFocusIdx = Math.max(_ingDropdownFocusIdx - 1, 0);
    updateIngDropdownFocus(items);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (_ingDropdownFocusIdx >= 0 && items[_ingDropdownFocusIdx]) {
      items[_ingDropdownFocusIdx].dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
    } else if (items.length === 1) {
      items[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    }
  }
}

function updateIngDropdownFocus(items) {
  items.forEach((item, i) => {
    if (i === _ingDropdownFocusIdx) {
      item.classList.add("ing-dd-item-focused");
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("ing-dd-item-focused");
    }
  });
}

// Reset focus index when dropdown is refreshed
const _origShowIngDropdown = showIngDropdown;
showIngDropdown = function (query) {
  _ingDropdownFocusIdx = -1;
  _origShowIngDropdown(query);
};

// Tracks which ingredients are selected in multi-add mode
let _multiAddSelected = new Set();

function showIngDropdown(query) {
  clearTimeout(hideDropdownTimer);
  const dropdown = document.getElementById("ing-dropdown");
  if (!dropdown) return;
  const q = query.trim().toLowerCase();
  if (!q) {
    dropdown.classList.add("hidden");
    dropdown.innerHTML = "";
    return;
  }
  const matches = state.ingredients
    .filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.category || "").toLowerCase().includes(q) ||
        (i.supplierId &&
          (state.suppliers.find((s) => s.id === i.supplierId)?.name || "")
            .toLowerCase()
            .includes(q)),
    )
    .slice(0, 12);

  const html = matches.length
    ? matches
        .map((ing) => {
          const cpu = costPerUnit(ing);
          const hasAllergens = (ing.allergens || []).length > 0;
          return `<div class="ing-dd-item"
          onmousedown="event.preventDefault();addIngredientToRecipe('${ing.id}')">
          <div class="ing-dd-info" style="flex:1;min-width:0">
            <div class="dd-name">${escHtml(ing.name)}${hasAllergens ? ` <span style="color:var(--accent);font-size:10px" title="${escHtml((ing.allergens || []).join(", "))}">⚠</span>` : ""}</div>
            <div class="dd-cost">${escHtml(ing.category || "Other")} · ${fmt(cpu)}/${ing.unit}</div>
          </div>
          <button class="ing-dd-add-btn" title="Add and keep searching"
            onmousedown="event.preventDefault();event.stopPropagation();addIngAndStay('${ing.id}')">+</button>
        </div>`;
        })
        .join("")
    : `<div class="ing-dropdown-empty">No results — <span style="color:var(--accent);cursor:pointer" onmousedown="event.preventDefault();openIngredientModal(null,document.getElementById('ing-search-add').value)">+ Add to library</span></div>`;

  dropdown.innerHTML = html;
  dropdown.classList.remove("hidden");
}

function toggleMultiAdd(ingId, el) {
  if (_multiAddSelected.has(ingId)) {
    _multiAddSelected.delete(ingId);
    el.classList.remove("ing-dd-item-checked");
    el.querySelector("input").checked = false;
  } else {
    _multiAddSelected.add(ingId);
    el.classList.add("ing-dd-item-checked");
    el.querySelector("input").checked = true;
  }
  const footer = document.querySelector(".ing-dd-footer");
  if (_multiAddSelected.size > 0) {
    const footerHtml = `<div class="ing-dd-footer">
      <span style="font-size:11px;color:var(--text-muted)">${_multiAddSelected.size} selected</span>
      <button class="btn-primary btn-sm" onmousedown="event.preventDefault();addMultipleIngredients()">Add ${_multiAddSelected.size} to recipe</button>
    </div>`;
    if (footer) footer.outerHTML = footerHtml;
    else
      document
        .getElementById("ing-dropdown")
        ?.insertAdjacentHTML("beforeend", footerHtml);
  } else if (footer) {
    footer.remove();
  }
  // Return focus to search input
  document.getElementById("ing-search-add")?.focus();
}

function addIngAndStay(ingId) {
  const recipe = getActiveRecipe();
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!recipe || !ing) return;
  recipe.ingredients.push({
    ingId,
    qty: ["each", "portion"].includes(ing.unit) ? 1 : 100,
    recipeUnit: ing.unit,
  });
  save();
  // Preserve search text and dropdown state across the re-render
  const searchEl = document.getElementById("ing-search-add");
  const searchVal = searchEl?.value || "";
  renderRecipeEditor();
  renderSidebarRecipes();
  showToast(`✓ ${ing.name} added`, "success", 1200);
  // Restore search input and re-open dropdown so user can keep adding
  setTimeout(() => {
    const inp = document.getElementById("ing-search-add");
    if (inp) {
      inp.value = searchVal;
      inp.focus();
      if (searchVal) showIngDropdown(searchVal);
    }
  }, 30);
}

function addMultipleIngredients() {
  const recipe = getActiveRecipe();
  if (!recipe) return;
  _multiAddSelected.forEach((ingId) => {
    const ing = state.ingredients.find((i) => i.id === ingId);
    if (ing)
      recipe.ingredients.push({
        ingId,
        qty: ["each", "portion"].includes(ing.unit) ? 1 : 100,
        recipeUnit: ing.unit,
      });
  });
  _multiAddSelected.clear();
  renderRecipeEditor();
  renderSidebarRecipes();
  save();
  setTimeout(() => {
    const inp = document.getElementById("ing-search-add");
    if (inp) {
      inp.value = "";
      inp.focus();
    }
  }, 50);
  showToast(`✓ Added to recipe`, "success", 1500);
}

function hideIngDropdownDelayed() {
  hideDropdownTimer = setTimeout(() => {
    const d = document.getElementById("ing-dropdown");
    if (d) {
      d.classList.add("hidden");
      d.innerHTML = "";
    }
    _multiAddSelected.clear();
  }, 250);
}

function addIngredientToRecipe(ingId) {
  const recipe = getActiveRecipe();
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!recipe || !ing) return;
  recipe.ingredients.push({
    ingId,
    qty: ["each", "portion"].includes(ing.unit) ? 1 : 100,
    recipeUnit: ing.unit,
  });
  renderRecipeEditor();
  renderSidebarRecipes();
  save();
  // Close dropdown and clear search, ready for next
  const dropdown = document.getElementById("ing-dropdown");
  if (dropdown) {
    dropdown.classList.add("hidden");
    dropdown.innerHTML = "";
  }
  setTimeout(() => {
    const inp = document.getElementById("ing-search-add");
    if (inp) {
      inp.value = "";
      inp.focus();
    }
  }, 50);
}

// ─── Inline Allergen Popover ──────────────────────────────────────────────────
function openAllergenPopover(ingId, el) {
  document.querySelectorAll(".allergen-popover").forEach((p) => p.remove());
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!ing) return;

  const pop = document.createElement("div");
  pop.className = "allergen-popover";
  pop.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Allergens — ${escHtml(ing.name)}</div>
    <div class="allergen-pop-grid">
      ${ALLERGENS.map((a) => {
        const checked = (ing.allergens || []).includes(a);
        return `<label class="allergen-pop-item ${checked ? "allergen-pop-checked" : ""}">
          <input type="checkbox" value="${escHtml(a)}" ${checked ? "checked" : ""} onchange="updateIngAllergenInline('${ingId}',this)" />
          <span>${escHtml(a)}</span>
        </label>`;
      }).join("")}
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
      <button class="btn-secondary btn-sm" onclick="autoDetectAllergenInline('${ingId}')">⚡ Auto-detect</button>
      <button class="btn-primary btn-sm" onclick="this.closest('.allergen-popover').remove();renderIngredientLibrary()">Done</button>
    </div>`;

  document.body.appendChild(pop);
  const rect = el.getBoundingClientRect();
  pop.style.cssText = `position:fixed;left:${Math.min(rect.left, window.innerWidth - 240)}px;top:${rect.bottom + 4}px;z-index:9999;`;

  setTimeout(() => {
    document.addEventListener("click", function closeAP(e) {
      if (!pop.contains(e.target) && !el.contains(e.target)) {
        pop.remove();
        renderIngredientLibrary();
        document.removeEventListener("click", closeAP);
      }
    });
  }, 0);
}

function updateIngAllergenInline(ingId, checkbox) {
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!ing) return;
  if (!ing.allergens) ing.allergens = [];
  const label = checkbox.closest("label");
  if (checkbox.checked) {
    if (!ing.allergens.includes(checkbox.value))
      ing.allergens.push(checkbox.value);
    label?.classList.add("allergen-pop-checked");
  } else {
    ing.allergens = ing.allergens.filter((a) => a !== checkbox.value);
    label?.classList.remove("allergen-pop-checked");
  }
  save();
}

function autoDetectAllergenInline(ingId) {
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!ing) return;
  const detected = detectAllergens(ing.name);
  ing.allergens = [...new Set([...(ing.allergens || []), ...detected])];
  save();
  // Re-render the popover
  document.querySelectorAll(".allergen-popover").forEach((p) => p.remove());
  const cell = document.querySelector(
    `.ing-allergen-cell[onclick*="${ingId}"]`,
  );
  if (cell) openAllergenPopover(ingId, cell);
  else renderIngredientLibrary();
  const n = detected.length;
  showToast(
    n
      ? `⚡ ${n} allergen${n !== 1 ? "s" : ""} detected`
      : "No new allergens found",
    "success",
    1500,
  );
}

function openIngPriceEdit(ingId, el) {
  document.querySelectorAll(".ing-price-pop").forEach((p) => p.remove());
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!ing) return;

  const affectedRecipes = state.recipes.filter((r) =>
    r.ingredients.some((ri) => ri.ingId === ingId),
  );

  const pop = document.createElement("div");
  pop.className = "ing-price-pop";
  pop.innerHTML = `
    <div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:8px">${escHtml(ing.name)}</div>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
      <span style="color:var(--text-muted);font-size:13px">${state.currency || "£"}</span>
      <input type="number" id="ing-price-pop-input" class="iqe-input" value="${ing.packCost}"
        step="0.01" min="0" style="width:90px;font-size:15px;font-weight:700" />
      <span style="font-size:11px;color:var(--text-muted)">per ${ing.packSize}${ing.unit}</span>
    </div>
    <div id="ing-price-pop-preview" style="font-size:12px;color:var(--accent);font-weight:600;margin-bottom:6px">
      ${fmt(costPerUnit(ing))}/${ing.unit}
    </div>
    ${affectedRecipes.length ? `<div id="ing-price-recipe-impact" style="font-size:11px;color:var(--text-muted);margin-bottom:8px;padding-top:6px;border-top:1px solid var(--border)">Used in ${affectedRecipes.length} recipe${affectedRecipes.length !== 1 ? "s" : ""} — <span id="ing-price-impact-detail">enter price to see impact</span></div>` : ""}
    <div style="display:flex;gap:6px;margin-top:4px">
      <button class="btn-secondary btn-sm" onclick="this.closest('.ing-price-pop').remove()">Cancel</button>
      <button class="btn-primary btn-sm" onclick="saveIngPriceEdit('${ingId}')">Save</button>
    </div>`;

  document.body.appendChild(pop);
  const rect = el.getBoundingClientRect();
  pop.style.cssText = `position:fixed;left:${Math.min(rect.left, window.innerWidth - 220)}px;top:${rect.bottom + 4}px;z-index:9999;min-width:200px;`;

  const input = pop.querySelector("#ing-price-pop-input");
  input?.addEventListener("input", () => {
    const cost = parseFloat(input.value) || 0;
    const cpu =
      ing.packSize > 0
        ? cost / ing.packSize / ((ing.yieldPct || 100) / 100)
        : 0;
    const oldCpu = costPerUnit(ing);
    pop.querySelector("#ing-price-pop-preview").textContent =
      fmt(cpu) + "/" + ing.unit;
    // Recipe impact
    const impactEl = pop.querySelector("#ing-price-impact-detail");
    if (impactEl && cost > 0 && cost !== ing.packCost) {
      const diff = cpu - oldCpu;
      const affected = state.recipes.filter((r) =>
        r.ingredients.some((ri) => ri.ingId === ingId),
      );
      const maxDiff = Math.max(
        ...affected.map((r) => {
          const ri = r.ingredients.find((x) => x.ingId === ingId);
          return Math.abs(diff * (ri?.qty || 0));
        }),
      );
      const col = cost > ing.packCost ? "var(--red)" : "var(--green)";
      const sign = cost > ing.packCost ? "+" : "";
      impactEl.innerHTML = `<span style="color:${col};font-weight:700">up to ${sign}${fmt(maxDiff)}/portion cost change</span>`;
    } else if (impactEl) {
      impactEl.textContent = "enter price to see impact";
    }
  });
  input?.focus();
  input?.select();

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveIngPriceEdit(ingId);
    if (e.key === "Escape") pop.remove();
  });

  setTimeout(() => {
    document.addEventListener("click", function closePP(e) {
      if (!pop.contains(e.target) && !el.contains(e.target)) {
        pop.remove();
        document.removeEventListener("click", closePP);
      }
    });
  }, 0);
}

function saveIngPriceEdit(ingId) {
  const pop = document.querySelector(".ing-price-pop");
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!pop || !ing) return;
  const oldCostPE = ing.packCost;
  const newCost = parseFloat(pop.querySelector("#ing-price-pop-input").value);
  if (!isNaN(newCost) && newCost >= 0) {
    if (ing.packCost !== newCost) {
      if (!ing.priceHistory) ing.priceHistory = [];
      ing.priceHistory.push({
        date: new Date().toISOString().slice(0, 10),
        packCost: ing.packCost,
      });
      ing.packCost = newCost;
      showToast("✓ Price updated", "success", 1500);
    }
  }
  pop.remove();
  save();
  renderIngredientLibrary();
  if (oldCostPE !== ing.packCost) checkPriceImpact(ing, oldCostPE, ing.packCost);
}

// ─── Ingredient Library ────────────────────────────────────────
function setIngSort(col) {
  const sel = document.getElementById("ing-sort");
  if (!sel) return;
  // Toggle asc/desc if clicking the same column
  if (sel.value === col) sel.value = col + "-desc";
  else if (sel.value === col + "-desc") sel.value = col;
  else sel.value = col;
  renderIngredientLibrary();
}

// ─── Alt Supplier Modal Helpers ───────────────────────────────────────────
function renderAltSuppliersInModal(altSuppliers) {
  const wrap = document.getElementById("alt-suppliers-wrap");
  if (!wrap) return;
  wrap.innerHTML = "";
  (altSuppliers || []).forEach(function (alt, idx) {
    wrap.appendChild(buildAltSupplierRow(alt, idx));
  });
}

function buildAltSupplierRow(alt, idx) {
  const div = document.createElement("div");
  div.className = "alt-supplier-row";
  div.dataset.idx = idx;
  const suppliers = state.suppliers;
  const selOptions = suppliers
    .map(
      (s) =>
        `<option value="${s.id}" ${alt.supplierId === s.id ? "selected" : ""}>${escHtml(s.name)}</option>`,
    )
    .join("");
  div.innerHTML = `
    <select class="alt-sup-supplier" style="flex:2;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:4px 7px;border-radius:4px;outline:none">
      <option value="">— Select supplier —</option>${selOptions}
    </select>
    <input type="number" class="alt-sup-pack-size" placeholder="Pack size" min="0" step="any" value="${alt.packSize || ""}"
      style="width:70px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:4px 7px;border-radius:4px;outline:none" />
    <input type="number" class="alt-sup-pack-cost" placeholder="Cost £" min="0" step="0.01" value="${alt.packCost || ""}"
      style="width:70px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:4px 7px;border-radius:4px;outline:none" />
    <input type="text" class="alt-sup-note" placeholder="Note (optional)" value="${escHtml(alt.note || "")}"
      style="flex:1;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:4px 7px;border-radius:4px;outline:none" />
    <button class="btn-icon danger" onclick="removeAltSupplierRow(${idx})" title="Remove">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;
  return div;
}

function addAltSupplierRow() {
  const wrap = document.getElementById("alt-suppliers-wrap");
  if (!wrap) return;
  const idx = wrap.children.length;
  wrap.appendChild(
    buildAltSupplierRow(
      { supplierId: "", packSize: "", packCost: "", note: "" },
      idx,
    ),
  );
}

function removeAltSupplierRow(idx) {
  const rows = document.querySelectorAll(".alt-supplier-row");
  if (rows[idx]) rows[idx].remove();
  // Re-index
  document.querySelectorAll(".alt-supplier-row").forEach(function (r, i) {
    r.dataset.idx = i;
    const btn = r.querySelector(".btn-icon.danger");
    if (btn) btn.setAttribute("onclick", `removeAltSupplierRow(${i})`);
  });
}

function getAltSuppliersFromModal() {
  const rows = document.querySelectorAll(".alt-supplier-row");
  const result = [];
  rows.forEach(function (row) {
    const supplierId = row.querySelector(".alt-sup-supplier")?.value || "";
    const packSize =
      parseFloat(row.querySelector(".alt-sup-pack-size")?.value) || 0;
    const packCost =
      parseFloat(row.querySelector(".alt-sup-pack-cost")?.value) || 0;
    const note = row.querySelector(".alt-sup-note")?.value.trim() || "";
    if (supplierId || packCost)
      result.push({ supplierId, packSize, packCost, note });
  });
  return result;
}

// ─── Supplier Comparison Modal ─────────────────────────────────────────────
function openSupplierCompare(ingId) {
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!ing) return;

  document.getElementById("sup-compare-ing-name").textContent = ing.name;
  document.getElementById("sup-compare-unit").textContent = ing.unit;
  renderSupplierCompareTable(ing);
  document.getElementById("sup-compare-modal").classList.remove("hidden");
}

function renderSupplierCompareTable(ing) {
  const yieldPct = (ing.yieldPct || 100) / 100;
  const unit = ing.unit;

  // Build rows: current primary + all alts
  const rows = [];

  // Primary supplier
  const primarySup = state.suppliers.find((s) => s.id === ing.supplierId);
  if (ing.packCost && ing.packSize) {
    rows.push({
      supplierId: ing.supplierId,
      supplierName: primarySup ? primarySup.name : "No supplier",
      packSize: ing.packSize,
      packCost: ing.packCost,
      note: "",
      isPrimary: true,
      cpu: ing.packCost / ing.packSize / yieldPct,
    });
  }

  // Alt suppliers
  (ing.altSuppliers || []).forEach(function (alt) {
    if (!alt.packCost || !alt.packSize) return;
    const sup = state.suppliers.find((s) => s.id === alt.supplierId);
    rows.push({
      supplierId: alt.supplierId,
      supplierName: sup ? sup.name : "Unknown supplier",
      packSize: alt.packSize,
      packCost: alt.packCost,
      note: alt.note || "",
      isPrimary: false,
      cpu: alt.packCost / alt.packSize / yieldPct,
    });
  });

  if (!rows.length) {
    document.getElementById("sup-compare-body").innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px">No supplier pricing entered yet.<br><small>Edit the ingredient to add suppliers.</small></td></tr>';
    return;
  }

  // Find cheapest cpu
  const minCpu = Math.min(...rows.map((r) => r.cpu));

  let html = "";
  rows.forEach(function (row, idx) {
    const isCheapest = row.cpu === minCpu && rows.length > 1;
    const saving = row.cpu > minCpu ? (row.cpu - minCpu) * ing.packSize : 0;
    html += `<tr style="${isCheapest ? "background:rgba(34,197,94,0.06)" : ""}">
      <td style="font-weight:${row.isPrimary ? "700" : "400"}">${escHtml(row.supplierName)}${row.isPrimary ? ' <span style="font-size:10px;color:var(--accent);background:var(--accent-bg);border:1px solid var(--accent-dim);padding:1px 5px;border-radius:3px">Active</span>' : ""}</td>
      <td style="text-align:right">${fmt(row.packCost)}</td>
      <td style="text-align:right">${row.packSize} ${unit}</td>
      <td style="text-align:right;font-weight:700;color:${isCheapest ? "var(--green)" : "var(--text-primary)"}">${fmt(row.cpu)}
        ${isCheapest && rows.length > 1 ? '<span style="font-size:10px;background:rgba(34,197,94,0.15);color:var(--green);border:1px solid rgba(34,197,94,0.3);padding:1px 5px;border-radius:3px;margin-left:4px">Cheapest</span>' : ""}
        ${saving > 0 ? `<div style="font-size:10px;color:var(--red)">+${fmt(saving)}/pack vs cheapest</div>` : ""}
      </td>
      <td style="color:var(--text-muted);font-size:12px">${escHtml(row.note)}</td>
      <td style="text-align:right">
        ${!row.isPrimary ? `<button class="btn-secondary btn-sm" style="font-size:11px" onclick="switchPrimarySupplier('${ing.id}', ${idx})">Use This</button>` : ""}
      </td>
    </tr>`;
  });
  document.getElementById("sup-compare-body").innerHTML = html;
}

function switchPrimarySupplier(ingId, rowIdx) {
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!ing) return;

  // Build same rows array as renderSupplierCompareTable
  const rows = [];
  if (ing.packCost && ing.packSize) {
    rows.push({
      supplierId: ing.supplierId,
      packSize: ing.packSize,
      packCost: ing.packCost,
      note: "",
      isPrimary: true,
    });
  }
  (ing.altSuppliers || []).forEach(function (alt) {
    if (alt.packCost && alt.packSize) rows.push({ ...alt, isPrimary: false });
  });

  const selected = rows[rowIdx];
  if (!selected || selected.isPrimary) return;

  // Swap: selected becomes primary, old primary goes to altSuppliers
  const oldPrimary = {
    supplierId: ing.supplierId,
    packSize: ing.packSize,
    packCost: ing.packCost,
    note: "",
    isPrimary: false,
  };

  ing.supplierId = selected.supplierId;
  ing.packCost = selected.packCost;
  ing.packSize = selected.packSize;

  // Rebuild altSuppliers without the selected row, add old primary
  const newAlts = (ing.altSuppliers || []).filter(function (alt) {
    return !(
      alt.supplierId === selected.supplierId &&
      alt.packCost === selected.packCost &&
      alt.packSize === selected.packSize
    );
  });
  if (oldPrimary.packCost && oldPrimary.packSize) newAlts.push(oldPrimary);
  ing.altSuppliers = newAlts;

  save();
  renderSupplierCompareTable(ing);
  renderIngredientLibrary();
  if (state.activeRecipeId) refreshCostPanel();
  showToast(
    "✓ Switched to " +
      (state.suppliers.find((s) => s.id === ing.supplierId)?.name ||
        "new supplier"),
    "success",
    2000,
  );
  // Refresh global savings panel if it's open behind this modal
  _refreshGlobalSavingsPanel();
}

// ─── Global Supplier Savings Panel ───────────────────────────────────────────
function openSupplierSavingsPanel() {
  const cur = state.currency || "£";
  const rows = [];
  state.ingredients.forEach((ing) => {
    if (!(ing.altSuppliers || []).length || !ing.packCost || !ing.packSize) return;
    const yld = (ing.yieldPct || 100) / 100;
    const primaryCpu = ing.packCost / ing.packSize / yld;
    const primarySup = state.suppliers.find((s) => s.id === ing.supplierId);
    let cheapest = null;
    for (const alt of ing.altSuppliers) {
      if (!alt.packCost || !alt.packSize) continue;
      const altCpu = alt.packCost / alt.packSize / yld;
      if (!cheapest || altCpu < cheapest.cpu) {
        cheapest = { ...alt, cpu: altCpu, supName: state.suppliers.find((s) => s.id === alt.supplierId)?.name || "Unknown" };
      }
    }
    if (!cheapest) return;
    const saving = primaryCpu - cheapest.cpu;
    const pct = primaryCpu > 0 ? (saving / primaryCpu) * 100 : 0;
    rows.push({
      ing, primaryCpu, primaryName: primarySup?.name || "No supplier",
      cheapestCpu: cheapest.cpu, cheapestName: cheapest.supName,
      cheapestAlt: cheapest, saving, pct,
    });
  });
  rows.sort((a, b) => b.pct - a.pct); // biggest % saving first

  const cheaper = rows.filter((r) => r.pct >= 3);
  const totalSaving = cheaper.reduce((s, r) => s + r.saving, 0);
  const modal = document.getElementById("sup-savings-modal");
  if (!modal) {
    // Create modal dynamically
    const div = document.createElement("div");
    div.id = "sup-savings-modal";
    div.className = "modal-overlay hidden";
    div.innerHTML = `<div class="modal" style="width:900px;max-height:90vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <div><h2>🏷 Supplier Price Compare</h2>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Ingredients where an alternative supplier is cheaper — switch to save money</div></div>
        <button class="modal-close" onclick="document.getElementById('sup-savings-modal').classList.add('hidden')">✕</button>
      </div>
      <div id="sup-savings-body" class="modal-body" style="flex:1;overflow-y:auto;padding:0"></div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('sup-savings-modal').classList.add('hidden')">Close</button>
        <button class="btn-primary" id="sup-savings-switch-btn" onclick="applySupplierSavings()">🔄 Switch all checked to cheapest</button>
      </div>
    </div>`;
    document.body.appendChild(div);
  }
  _renderSupplierSavings(rows, cheaper, totalSaving);
  document.getElementById("sup-savings-modal").classList.remove("hidden");
}

function _renderSupplierSavings(rows, cheaper, totalSaving) {
  const cur = state.currency || "£";
  const body = document.getElementById("sup-savings-body");
  if (!body) return;
  let html = "";
  if (cheaper.length > 0) {
    html += `<div style="padding:12px 20px;background:var(--green-bg);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">
      <span style="font-size:18px">💰</span>
      <div style="flex:1"><span style="font-size:13px;font-weight:700;color:var(--green)">${cheaper.length} ingredient${cheaper.length !== 1 ? "s" : ""}</span>
      <span style="font-size:12px;color:var(--text-secondary)"> could be cheaper — potential saving: </span>
      <span style="font-size:13px;font-weight:700;color:var(--green)">${cur}${totalSaving.toFixed(4)}/unit avg</span></div>
      <button class="btn-secondary btn-sm" onclick="document.querySelectorAll('.sup-sav-check').forEach(c=>c.checked=true)">Select all</button>
      <button class="btn-secondary btn-sm" onclick="document.querySelectorAll('.sup-sav-check').forEach(c=>c.checked=false)">Deselect</button>
    </div>`;
  }
  if (!rows.length) {
    html += `<div style="padding:40px;text-align:center;color:var(--text-muted)">
      <div style="font-size:24px;margin-bottom:8px">✓</div>
      <div style="font-size:13px">No ingredients have alternative suppliers yet.<br>Add alternative suppliers when editing ingredients.</div>
    </div>`;
  } else {
    html += `<table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:var(--bg-sidebar)">
        <th style="padding:8px 10px;text-align:left;width:30px"></th>
        <th style="padding:8px 10px;text-align:left">Ingredient</th>
        <th style="padding:8px 10px;text-align:left">Current Supplier</th>
        <th style="padding:8px 10px;text-align:right">Current /${cur}</th>
        <th style="padding:8px 10px;text-align:left">Cheapest Alt</th>
        <th style="padding:8px 10px;text-align:right">Alt /${cur}</th>
        <th style="padding:8px 10px;text-align:right">Saving</th>
      </tr></thead><tbody>`;
    rows.forEach((r) => {
      const isCheaper = r.pct >= 3;
      const isDearer = r.pct <= -3;
      const savCol = isCheaper ? "var(--green)" : isDearer ? "var(--red)" : "var(--text-muted)";
      html += `<tr style="${isCheaper ? "background:rgba(76,175,125,0.04)" : ""};cursor:pointer" title="Click to compare all suppliers for ${escHtml(r.ing.name)}" onclick="openSupplierCompare('${r.ing.id}')">
        <td style="padding:6px 10px" onclick="event.stopPropagation()">${isCheaper ? `<input type="checkbox" class="sup-sav-check" data-ing-id="${r.ing.id}" checked style="accent-color:var(--accent);cursor:pointer;width:16px;height:16px">` : ""}</td>
        <td style="padding:6px 10px;font-weight:600"><span style="color:var(--accent);text-decoration:underline;text-decoration-style:dotted">${escHtml(r.ing.name)}</span><div style="font-size:10px;color:var(--text-muted)">${escHtml(r.ing.category || "Other")} · ${r.ing.packSize}${r.ing.unit}</div></td>
        <td style="padding:6px 10px;color:var(--text-secondary)">${escHtml(r.primaryName)}</td>
        <td style="padding:6px 10px;text-align:right;font-weight:600">${cur}${r.primaryCpu.toFixed(4)}</td>
        <td style="padding:6px 10px;color:var(--text-secondary)">${escHtml(r.cheapestName)}</td>
        <td style="padding:6px 10px;text-align:right;font-weight:700;color:${isCheaper ? "var(--green)" : "var(--text-primary)"}">${cur}${r.cheapestCpu.toFixed(4)}</td>
        <td style="padding:6px 10px;text-align:right" onclick="event.stopPropagation()">
          <span style="font-weight:700;color:${savCol}">${isCheaper ? "↓" : isDearer ? "↑" : "—"} ${Math.abs(r.pct).toFixed(1)}%</span>
          ${isCheaper ? `<div style="font-size:10px;color:var(--green)">Save ${cur}${r.saving.toFixed(4)}/${r.ing.unit}</div>` : ""}
          ${isCheaper ? `<button class="btn-secondary btn-sm" style="font-size:10px;margin-top:4px;padding:2px 8px" onclick="_switchSingleSupplier('${r.ing.id}')">⚡ Switch</button>` : ""}
        </td>
      </tr>`;
    });
    html += "</tbody></table>";
  }
  body.innerHTML = html;
}

function applySupplierSavings() {
  const checks = document.querySelectorAll(".sup-sav-check:checked");
  let switched = 0;
  checks.forEach((cb) => {
    const ingId = cb.dataset.ingId;
    const ing = state.ingredients.find((i) => i.id === ingId);
    if (!ing || !(ing.altSuppliers || []).length) return;
    const yld = (ing.yieldPct || 100) / 100;
    // Find cheapest alt
    let best = null, bestIdx = -1;
    (ing.altSuppliers || []).forEach((alt, idx) => {
      if (!alt.packCost || !alt.packSize) return;
      const cpu = alt.packCost / alt.packSize / yld;
      if (!best || cpu < best.cpu) { best = { ...alt, cpu }; bestIdx = idx; }
    });
    if (!best || bestIdx < 0) return;
    const primaryCpu = ing.packCost / ing.packSize / yld;
    if (best.cpu >= primaryCpu * 0.97) return; // not actually cheaper
    // Demote current primary to alt
    const oldPrimary = {
      supplierId: ing.supplierId, packSize: ing.packSize,
      packCost: ing.packCost, note: "",
    };
    // Promote cheapest alt
    const chosen = ing.altSuppliers[bestIdx];
    ing.supplierId = chosen.supplierId;
    ing.packCost = chosen.packCost;
    ing.packSize = chosen.packSize;
    // Replace the alt with old primary
    ing.altSuppliers.splice(bestIdx, 1, oldPrimary);
    switched++;
  });
  if (!switched) { showToast("No items selected", "error", 2000); return; }
  save();
  renderIngredientLibrary();
  if (state.activeRecipeId) renderRecipeEditor();
  document.getElementById("sup-savings-modal").classList.add("hidden");
  showToast(`✓ Switched ${switched} ingredient${switched !== 1 ? "s" : ""} to cheaper supplier`, "success", 2500);
}

function _switchSingleSupplier(ingId) {
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!ing || !(ing.altSuppliers || []).length) return;
  const yld = (ing.yieldPct || 100) / 100;
  let best = null, bestIdx = -1;
  (ing.altSuppliers || []).forEach((alt, idx) => {
    if (!alt.packCost || !alt.packSize) return;
    const cpu = alt.packCost / alt.packSize / yld;
    if (!best || cpu < best.cpu) { best = { ...alt, cpu }; bestIdx = idx; }
  });
  if (!best || bestIdx < 0) return;
  const primaryCpu = ing.packSize > 0 ? ing.packCost / ing.packSize / yld : Infinity;
  if (best.cpu >= primaryCpu * 0.97) { showToast("Alt supplier is not cheaper", "error", 2000); return; }
  // Demote current primary to alt
  const oldPrimary = {
    supplierId: ing.supplierId, packSize: ing.packSize,
    packCost: ing.packCost, note: "",
  };
  const chosen = ing.altSuppliers[bestIdx];
  ing.supplierId = chosen.supplierId;
  ing.packCost = chosen.packCost;
  ing.packSize = chosen.packSize;
  ing.altSuppliers.splice(bestIdx, 1, oldPrimary);
  save();
  renderIngredientLibrary();
  if (state.activeRecipeId) renderRecipeEditor();
  const newSupName = (state.suppliers || []).find(s => s.id === ing.supplierId)?.name || "new supplier";
  showToast("✓ " + escHtml(ing.name) + " switched to " + escHtml(newSupName), "success", 2500);
  // Re-render the savings panel
  openSupplierSavingsPanel();
}

function _refreshGlobalSavingsPanel() {
  const modal = document.getElementById("sup-savings-modal");
  if (!modal || modal.classList.contains("hidden")) return;
  // Re-run the same logic as openSupplierSavingsPanel but just refresh the body
  const cur = state.currency || "£";
  const rows = [];
  state.ingredients.forEach((ing) => {
    if (!(ing.altSuppliers || []).length || !ing.packCost || !ing.packSize) return;
    const yld = (ing.yieldPct || 100) / 100;
    const primaryCpu = ing.packCost / ing.packSize / yld;
    const primarySup = state.suppliers.find((s) => s.id === ing.supplierId);
    let cheapest = null;
    for (const alt of ing.altSuppliers) {
      if (!alt.packCost || !alt.packSize) continue;
      const altCpu = alt.packCost / alt.packSize / yld;
      if (!cheapest || altCpu < cheapest.cpu) {
        cheapest = { ...alt, cpu: altCpu, supName: state.suppliers.find((s) => s.id === alt.supplierId)?.name || "Unknown" };
      }
    }
    if (!cheapest) return;
    const saving = primaryCpu - cheapest.cpu;
    const pct = primaryCpu > 0 ? (saving / primaryCpu) * 100 : 0;
    rows.push({
      ing, primaryCpu, primaryName: primarySup?.name || "No supplier",
      cheapestCpu: cheapest.cpu, cheapestName: cheapest.supName,
      cheapestAlt: cheapest, saving, pct,
    });
  });
  rows.sort((a, b) => b.pct - a.pct);
  const cheaper = rows.filter((r) => r.pct >= 3);
  const totalSaving = cheaper.reduce((s, r) => s + r.saving, 0);
  _renderSupplierSavings(rows, cheaper, totalSaving);
}

function renderIngCatSidebar() {
  const catNav = document.getElementById("ing-cat-nav");
  const supNav = document.getElementById("ing-sup-nav");
  if (!catNav || !supNav) return;
  const active = window._ingCatFilter || "";
  const activeType = window._ingCatFilterType || "all";
  const cats = getIngCategories();
  const allCount = state.ingredients.length;
  const noSupCount = state.ingredients.filter((i) => !i.supplierId).length;
  const now = Date.now();

  function pill(label, count, isActive, onclick, danger, staleCount) {
    const base = `display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;cursor:pointer;font-size:11px;white-space:nowrap;flex-shrink:0;`;
    const activeStyle = `background:var(--accent-bg);border:1px solid var(--accent-dim);color:var(--accent);font-weight:600;`;
    const dangerStyle = `background:var(--red-bg);border:1px solid rgba(224,92,92,0.3);color:var(--red);font-weight:600;`;
    const inactiveStyle = `background:var(--bg-card2);border:1px solid var(--border);color:var(--text-secondary);`;
    const style =
      base + (isActive ? activeStyle : danger ? dangerStyle : inactiveStyle);
    const staleTag = staleCount
      ? `<span style="font-size:9px;color:var(--accent);font-weight:700">⏰${staleCount}</span>`
      : "";
    return `<div style="${style}" onclick="${onclick}">${escHtml(label)}${staleTag}<span style="opacity:.65;font-size:10px">${count}</span></div>`;
  }

  // ── Category pills ──────────────────────────────────────────────────────
  let catHtml = pill(
    "All",
    allCount,
    activeType === "all",
    "setIngCatFilter('','all')",
    false,
  );
  cats.forEach((cat) => {
    const cnt = state.ingredients.filter(
      (i) => (i.category || "").toLowerCase() === cat.toLowerCase(),
    ).length;
    if (!cnt) return;
    const isActive =
      activeType === "cat" && active.toLowerCase() === cat.toLowerCase();
    catHtml += pill(
      cat,
      cnt,
      isActive,
      `setIngCatFilter('${cat.replace(/'/g, "\'")}','cat')`,
    );
  });
  if (noSupCount) {
    const isActive = activeType === "nosup";
    catHtml += pill(
      "No supplier",
      noSupCount,
      isActive,
      "setIngCatFilter('','nosup')",
      !isActive,
    );
  }
  catNav.innerHTML = catHtml;

  // ── Supplier pills ──────────────────────────────────────────────────────
  let supHtml = "";
  state.suppliers.forEach((sup) => {
    const cnt = state.ingredients.filter((i) => i.supplierId === sup.id).length;
    if (!cnt) return;
    const isActive = activeType === "sup" && active === sup.id;
    const stale = state.ingredients.filter((i) => {
      if (i.supplierId !== sup.id) return false;
      const hist = i.priceHistory || [];
      return (
        hist.length &&
        now - new Date(hist[hist.length - 1].date).getTime() > 60 * 86400000
      );
    }).length;
    supHtml += pill(
      sup.name,
      cnt,
      isActive,
      `setIngCatFilter('${sup.id}','sup')`,
      false,
      stale,
    );
  });
  // Stale prices flag pill at end of supplier row
  const totalStale = state.ingredients.filter((i) => {
    const hist = i.priceHistory || [];
    return (
      hist.length &&
      now - new Date(hist[hist.length - 1].date).getTime() > 60 * 86400000
    );
  }).length;
  if (totalStale) {
    const isActive = activeType === "stale";
    supHtml += pill(
      "Stale prices",
      totalStale,
      isActive,
      "setIngCatFilter('','stale')",
      !isActive,
    );
  }
  supNav.innerHTML =
    supHtml ||
    `<span style="font-size:11px;color:var(--text-muted);font-style:italic">No suppliers linked</span>`;
}

function setIngCatFilter(val, type) {
  window._ingCatFilter = val;
  window._ingCatFilterType = type;
  renderIngCatSidebar();
  renderIngredientLibrary();
}

// ─── Virtual-scroll state for ingredient library ──────────────────────────────
const ING_PAGE_SIZE = 80;
let _ingVirtualList = []; // full sorted+filtered list
let _ingRenderedTo = 0; // how many rows are currently in the DOM

function _ingBuildRow(ing) {
  const cpu = costPerUnit(ing);
  const al = ing.allergens || [];
  const hist = ing.priceHistory || [];
  const lastUpdated = (() => {
    if (!hist.length)
      return '<span style="color:var(--text-muted);font-size:11px">—</span>';
    const last = hist[hist.length - 1];
    const daysAgo = Math.floor((Date.now() - new Date(last.date)) / 86400000);
    const delta = hist.length >= 2 ? last.cost - hist[hist.length - 2].cost : 0;
    const arrow =
      delta > 0.001
        ? '<span style="color:var(--red)">↑</span>'
        : delta < -0.001
          ? '<span style="color:var(--green)">↓</span>'
          : "";
    return `<span style="font-size:11px;color:var(--text-muted)">${daysAgo === 0 ? "today" : daysAgo + "d ago"} ${arrow}</span>`;
  })();
  return `<tr>
    <td style="padding:5px 8px;text-align:center">
      <input type="checkbox" class="ing-row-check" data-id="${ing.id}" onchange="onIngCheckChange()"
        style="width:14px;height:14px;cursor:pointer;accent-color:var(--accent)" />
    </td>
    <td style="font-weight:600;cursor:pointer" onclick="openIngredientModal('${ing.id}')" title="Edit ingredient" class="ing-name-cell">${escHtml(ing.name)}</td>
    <td><span class="cat-badge">${escHtml(ing.category)}</span></td>
    <td>${ing.packSize} ${ing.unit}</td>
    <td>
      <span class="ing-price-editable" onclick="openIngPriceEdit('${ing.id}',this)" title="Click to edit price">
        ${fmt(ing.packCost)}
      </span>
    </td>
    <td>${ing.unit}</td>
    <td class="cost-val">${fmt(cpu)}</td>
    <td>${lastUpdated}</td>
    <td style="text-align:right">
      <div style="display:inline-flex;gap:4px;align-items:center">
      <button class="btn-icon" onclick="showPriceHistory('${ing.id}')" title="Price history">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      </button>
      <button class="btn-icon" onclick="openPriceUpdateWizard('${ing.id}')" title="Update price &amp; reprice all affected recipes" style="color:var(--accent)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
      </button>
      <button class="btn-icon" onclick="openIngredientModal('${ing.id}')" title="Edit">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="btn-icon danger" onclick="deleteIngredient('${ing.id}')" title="Delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
      </div>
    </td>
  </tr>`;
}

function _ingAppendRows(tbody, upTo) {
  const frag = document.createDocumentFragment();
  const temp = document.createElement("tbody");
  const end = Math.min(upTo, _ingVirtualList.length);
  for (let i = _ingRenderedTo; i < end; i++) {
    temp.innerHTML = _ingBuildRow(_ingVirtualList[i]);
    frag.appendChild(temp.firstChild);
  }
  tbody.appendChild(frag);
  _ingRenderedTo = end;
}

function _ingSetupScroll(tbody) {
  const scroller =
    tbody.closest(".table-scroll-wrap") ||
    tbody.closest('[style*="overflow"]') ||
    tbody.parentElement?.parentElement;
  if (!scroller || scroller._ingScrollBound) return;
  scroller._ingScrollBound = true;
  scroller.addEventListener(
    "scroll",
    function () {
      if (_ingRenderedTo >= _ingVirtualList.length) return;
      const nearBottom =
        scroller.scrollTop + scroller.clientHeight >=
        scroller.scrollHeight - 300;
      if (nearBottom) _ingAppendRows(tbody, _ingRenderedTo + ING_PAGE_SIZE);
    },
    { passive: true },
  );
}

function renderIngredientLibrary() {
  invalidateMaps();
  renderIngCatSidebar();
  const q = (document.getElementById("ing-search")?.value || "").toLowerCase();
  const sortBy = document.getElementById("ing-sort")?.value || "name";
  const tbody = document.getElementById("ing-tbody");
  if (!tbody) return;

  const filterType = window._ingCatFilterType || "all";
  const filterVal = window._ingCatFilter || "";

  // Update panel title
  const titleEl = document.getElementById("ing-panel-title");
  const badgeEl = document.getElementById("ing-stale-badge");
  const now = Date.now();

  const allergenFilter =
    document.getElementById("ing-allergen-filter")?.value || "";
  const seasonalFilter =
    document.getElementById("ing-seasonal-filter")?.checked || false;
  const nowMs = Date.now();
  let filtered = state.ingredients
    .filter((i) => {
      if (filterType === "cat")
        return (i.category || "").toLowerCase() === filterVal.toLowerCase();
      if (filterType === "sup") return i.supplierId === filterVal;
      if (filterType === "nosup") return !i.supplierId;
      if (filterType === "stale") {
        const hist = i.priceHistory || [];
        return (
          hist.length &&
          nowMs - new Date(hist[hist.length - 1].date).getTime() > 60 * 86400000
        );
      }
      return true; // 'all'
    })
    .filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        (i.supplierId &&
          (state.suppliers.find((s) => s.id === i.supplierId)?.name || "")
            .toLowerCase()
            .includes(q)) ||
        (i.allergens || []).some((a) => a.toLowerCase().includes(q)),
    )
    .filter((i) => {
      if (allergenFilter === "none") return !(i.allergens || []).length;
      if (allergenFilter) return (i.allergens || []).includes(allergenFilter);
      return true;
    })
    .filter((i) => !seasonalFilter || i.seasonal);

  // Update title
  if (titleEl) {
    const total = filtered.length;
    if (filterType === "all")
      titleEl.textContent = total + " ingredient" + (total !== 1 ? "s" : "");
    else if (filterType === "cat")
      titleEl.textContent = filterVal + " · " + total;
    else if (filterType === "sup")
      titleEl.textContent =
        (state.suppliers.find((s) => s.id === filterVal)?.name || "Supplier") +
        " · " +
        total;
    else if (filterType === "nosup")
      titleEl.textContent = "No supplier · " + total;
    else if (filterType === "stale")
      titleEl.textContent = "Stale prices · " + total;
  }

  // Stale count badge for current view
  const staleInView = filtered.filter((i) => {
    const hist = i.priceHistory || [];
    return (
      hist.length &&
      now - new Date(hist[hist.length - 1].date).getTime() > 60 * 86400000
    );
  }).length;
  if (badgeEl) {
    if (staleInView > 0) {
      badgeEl.style.display = "block";
      badgeEl.innerHTML = `<span style="font-size:11px;color:var(--accent);font-weight:700;padding:2px 8px;background:var(--accent-bg);border:1px solid var(--accent-dim);border-radius:4px;cursor:pointer" onclick="filterStaleOnly()" title="Click to show only stale">⏰ ${staleInView} stale price${staleInView !== 1 ? "s" : ""}</span>`;
    } else {
      badgeEl.style.display = "none";
    }
  }

  const dir = sortBy.endsWith("-desc") ? -1 : 1;
  const key = sortBy.replace("-desc", "");

  filtered = filtered.slice().sort((a, b) => {
    if (key === "name") return dir * a.name.localeCompare(b.name);
    if (key === "category")
      return (
        dir *
        (a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
      );
    if (key === "vendor") {
      const sa = getSupplierMap().get(a.supplierId)?.name || "";
      const sb = getSupplierMap().get(b.supplierId)?.name || "";
      return dir * (sa.localeCompare(sb) || a.name.localeCompare(b.name));
    }
    if (key === "cost") return dir * (costPerUnit(a) - costPerUnit(b));
    return 0;
  });

  // Update column header arrows
  ["name", "category", "cost"].forEach((col) => {
    const el = document.getElementById("col-" + col);
    if (!el) return;
    const arrow = el.querySelector(".sort-arrow");
    if (!arrow) return;
    if (key === col) arrow.textContent = dir === 1 ? " ↑" : " ↓";
    else arrow.textContent = "";
  });
  if (!filtered.length) {
    tbody.innerHTML = q
      ? `<tr><td colspan="9">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 8px">
            <span style="color:var(--text-muted);font-size:13px">No ingredient found matching "<strong style="color:var(--text-primary)">${escHtml(q)}</strong>"</span>
            <button class="btn-primary btn-sm" onclick="openIngredientModal(null,'${escHtml(q).replace(/'/g, "\\'")}')">
              + Add "${escHtml(q)}"
            </button>
          </div>
        </td></tr>`
      : `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No ingredients found</td></tr>`;
    return;
  }
  _ingVirtualList = filtered;
  _ingRenderedTo = 0;
  tbody.innerHTML = "";
  _ingAppendRows(tbody, ING_PAGE_SIZE);
  _ingSetupScroll(tbody);
}

// ─── Ingredient Modal ──────────────────────────────────────────
function openIngredientModal(id = null, prefillName = "") {
  editingIngredientId = id;
  const title = document.getElementById("ing-modal-title");
  // Always rebuild category dropdown dynamically
  const ingCatSel = document.getElementById("ing-category");
  ingCatSel.innerHTML = getIngCategories()
    .map((c) => `<option>${escHtml(c)}</option>`)
    .join("");

  if (id) {
    const ing = state.ingredients.find((i) => i.id === id);
    title.textContent = "Edit Ingredient";
    document.getElementById("ing-name").value = ing.name;
    document.getElementById("ing-category").value = ing.category;
    document.getElementById("ing-pack-size").value = ing.packSize;
    document.getElementById("ing-unit").value = ing.unit;
    document.getElementById("ing-pack-cost").value = ing.packCost;
    document.getElementById("ing-yield").value = ing.yieldPct || 100;
    document.getElementById("ing-kcal").value = ing.nutrition?.kcal || "";
    document.getElementById("ing-protein").value = ing.nutrition?.protein || "";
    document.getElementById("ing-fat").value = ing.nutrition?.fat || "";
    document.getElementById("ing-carbs").value = ing.nutrition?.carbs || "";
    populateSupplierDropdown(ing.supplierId || null);
    renderAltSuppliersInModal(ing.altSuppliers || []);
    renderAllergenGrid(ing.allergens || []);
    renderSeasonalInModal(ing);
  } else {
    title.textContent = "Add Ingredient";
    [
      "ing-name",
      "ing-pack-size",
      "ing-pack-cost",
      "ing-kcal",
      "ing-protein",
      "ing-fat",
      "ing-carbs",
    ].forEach((x) => (document.getElementById(x).value = ""));
    document.getElementById("ing-yield").value = 100;
    // Pre-fill name from search term if provided
    if (prefillName) {
      document.getElementById("ing-name").value = prefillName;
    }
    populateSupplierDropdown(null);
    renderAltSuppliersInModal([]);
    renderAllergenGrid([]);
    renderSeasonalInModal(null);
  }
  document.getElementById("ing-modal").classList.remove("hidden");
  updateCostPreview();
  ["ing-pack-size", "ing-pack-cost", "ing-yield"].forEach((x) => {
    document.getElementById(x).oninput = updateCostPreview;
  });
  // Focus name field if new, otherwise focus first empty field
  setTimeout(() => {
    const nameEl = document.getElementById("ing-name");
    if (nameEl) {
      nameEl.focus();
      if (prefillName) nameEl.select(); // select so user can correct if needed
    }
  }, 50);
  // Wire name input to auto-detect allergens (only for new ingredients)
  const nameInput = document.getElementById("ing-name");
  nameInput.oninput = function () {
    if (!editingIngredientId) {
      if (!this.value.trim()) {
        renderAllergenGrid([]);
        const hint = document.getElementById("allergen-detect-hint");
        if (hint) {
          hint.textContent = "";
          hint.style.display = "none";
        }
      } else {
        autoDetectAllergens(this.value);
      }
    }
  };
  setTimeout(() => nameInput.focus(), 50);
}

function renderAllergenGrid(selected, autoDetected = []) {
  const grid = document.getElementById("allergen-grid");
  grid.innerHTML = ALLERGENS.map((a) => {
    const isChecked = selected.includes(a);
    const isAuto = autoDetected.includes(a);
    return `<label class="allergen-check ${isAuto ? "allergen-auto" : ""}">
      <input type="checkbox" value="${escHtml(a)}" ${isChecked ? "checked" : ""} />
      <span class="allergen-check-name">${escHtml(a)}</span>
      ${isAuto ? '<span class="allergen-auto-badge">auto</span>' : ""}
    </label>`;
  }).join("");
}

function renderSeasonalInModal(ing) {
  const wrap = document.getElementById("seasonal-wrap");
  if (!wrap) return;
  wrap.innerHTML = renderSeasonalFields(ing);
}

function autoDetectAllergens(name) {
  if (!name.trim()) return;
  const detected = detectAllergens(name);
  const currentlyChecked = getSelectedAllergens();
  // Merge: keep anything already manually checked, add auto-detected
  const merged = [...new Set([...currentlyChecked, ...detected])];
  renderAllergenGrid(merged, detected);
  // Show feedback
  const preview = document.getElementById("allergen-detect-hint");
  if (preview) {
    if (detected.length) {
      preview.textContent = `⚡ Auto-detected: ${detected.join(", ")}`;
      preview.style.display = "block";
    } else {
      preview.textContent = "";
      preview.style.display = "none";
    }
  }
}

function getSelectedAllergens() {
  return [...document.querySelectorAll("#allergen-grid input:checked")].map(
    (c) => c.value,
  );
}

function updateCostPreview() {
  const packSize = Math.max(
    0,
    parseFloat(document.getElementById("ing-pack-size").value) || 0,
  );
  const packCost = Math.max(
    0,
    parseFloat(document.getElementById("ing-pack-cost").value) || 0,
  );
  const yieldPct = Math.min(
    100,
    Math.max(1, parseFloat(document.getElementById("ing-yield").value) || 100),
  );
  const unit = document.getElementById("ing-unit").value;
  // New card preview
  const unitEl = document.getElementById("ing-cost-preview-unit");
  const unitLbl = document.getElementById("ing-cost-preview-unit-lbl");
  const yieldEl = document.getElementById("ing-cost-preview-yield");
  const yieldLbl = document.getElementById("ing-cost-preview-yield-lbl");
  if (packSize > 0 && packCost > 0) {
    const cpu = packCost / packSize;
    const cpuYield = cpu / (yieldPct / 100);
    if (unitEl) unitEl.textContent = fmt(cpu);
    if (unitLbl) unitLbl.textContent = "per " + unit;
    if (yieldEl) {
      yieldEl.textContent = fmt(cpuYield);
      yieldEl.style.color =
        yieldPct < 100 ? "var(--accent)" : "var(--text-primary)";
    }
    if (yieldLbl) yieldLbl.textContent = yieldPct + "% yield applied";
  } else {
    if (unitEl) unitEl.textContent = "—";
    if (unitLbl) unitLbl.textContent = "enter pack size & cost";
    if (yieldEl) yieldEl.textContent = "—";
    if (yieldLbl) yieldLbl.textContent = "effective cost";
  }
  // Keep hidden legacy field in sync for anything that reads it
  const preview = document.getElementById("ing-cost-preview");
  if (preview && packSize > 0 && packCost > 0) {
    preview.textContent = `Cost per ${unit}: ${fmt(packCost / packSize / (yieldPct / 100))}  ·  Yield: ${yieldPct}%`;
  }
}

function openIngQuickAddSupplier() {
  document.getElementById("ing-quick-sup-wrap").style.display = "block";
  document.getElementById("ing-quick-sup-name").focus();
}

function saveIngQuickSupplier() {
  const name = document.getElementById("ing-quick-sup-name").value.trim();
  if (!name) {
    showToast("Please enter a supplier name", "error", 2000);
    return;
  }
  const contact = document.getElementById("ing-quick-sup-contact").value.trim();
  const newSup = {
    id: uid(),
    name,
    contact,
    phone: "",
    email: "",
    accountNumber: "",
    deliveryDays: "",
    notes: "",
    invoiceHistory: [],
  };
  if (!state.suppliers) state.suppliers = [];
  state.suppliers.push(newSup);
  save();
  // Add to dropdown and select it
  const sel = document.getElementById("ing-supplier");
  if (sel) {
    const opt = document.createElement("option");
    opt.value = newSup.id;
    opt.textContent = name;
    sel.appendChild(opt);
    sel.value = newSup.id;
  }
  document.getElementById("ing-quick-sup-wrap").style.display = "none";
  document.getElementById("ing-quick-sup-name").value = "";
  document.getElementById("ing-quick-sup-contact").value = "";
  showToast("✓ " + name + " added as supplier", "success", 2000);
}

function filterStaleOnly() {
  const q = document.getElementById("ing-search");
  // Already filtered in view — just highlight stale in title
  window._ingStaleOnly = !window._ingStaleOnly;
  renderIngredientLibrary();
}

function closeIngredientModal() {
  document.getElementById("ing-modal").classList.add("hidden");
  editingIngredientId = null;
}

function saveIngredient() {
  const name = document.getElementById("ing-name").value.trim();
  if (!name) {
    showToast("Please enter an ingredient name", "error");
    return;
  }
  const newPackCost = Math.max(
    0,
    parseFloat(document.getElementById("ing-pack-cost").value) || 0,
  );
  const data = {
    name,
    category: document.getElementById("ing-category").value,
    packSize: Math.max(
      0,
      parseFloat(document.getElementById("ing-pack-size").value) || 0,
    ),
    packCost: newPackCost,
    unit: document.getElementById("ing-unit").value,
    yieldPct: Math.min(
      100,
      Math.max(
        1,
        parseFloat(document.getElementById("ing-yield").value) || 100,
      ),
    ),
    allergens: getSelectedAllergens(),
    supplierId: document.getElementById("ing-supplier").value || null,
    altSuppliers: getAltSuppliersFromModal(),
    nutrition: {
      kcal: Math.max(
        0,
        parseFloat(document.getElementById("ing-kcal").value) || 0,
      ),
      protein: Math.max(
        0,
        parseFloat(document.getElementById("ing-protein").value) || 0,
      ),
      fat: Math.max(
        0,
        parseFloat(document.getElementById("ing-fat").value) || 0,
      ),
      carbs: Math.max(
        0,
        parseFloat(document.getElementById("ing-carbs").value) || 0,
      ),
    },
    seasonal: document.getElementById("ing-seasonal")?.checked || false,
    seasonStart: (() => {
      const v = parseInt(document.getElementById("ing-season-start")?.value);
      return !isNaN(v) && v >= 1 && v <= 12 ? v : null;
    })(),
    seasonEnd: (() => {
      const v = parseInt(document.getElementById("ing-season-end")?.value);
      return !isNaN(v) && v >= 1 && v <= 12 ? v : null;
    })(),
  };
  if (editingIngredientId) {
    const idx = state.ingredients.findIndex(
      (i) => i.id === editingIngredientId,
    );
    logPriceChange(
      state.ingredients[idx],
      state.ingredients[idx].packCost,
      newPackCost,
    );
    state.ingredients[idx] = { ...state.ingredients[idx], ...data };
  } else {
    // Duplicate detection (only if setting enabled)
    const duplicate =
      state.warnDuplicates !== false &&
      state.ingredients.find(
        (i) =>
          i.name.toLowerCase() === name.toLowerCase() &&
          i.category === data.category,
      );
    const nearMatch =
      state.warnDuplicates !== false &&
      !duplicate &&
      state.ingredients.find(
        (i) =>
          i.name.toLowerCase().replace(/\s+/g, "") ===
          name.toLowerCase().replace(/\s+/g, ""),
      );
    if (duplicate) {
      if (
        !confirm(
          `"${name}" already exists in ${data.category}. Add anyway as a duplicate?`,
        )
      )
        return;
    } else if (nearMatch) {
      if (
        !confirm(
          `Similar ingredient "${nearMatch.name}" already exists. Add "${name}" anyway?`,
        )
      )
        return;
    }
    state.ingredients.push({ id: uid(), priceHistory: [], ...data });
  }
  closeIngredientModal();
  renderIngredientLibrary();
  if (state.activeRecipeId) renderRecipeEditor();
  save();
  showToast(`✓ ${data.name} saved`, "success", 1500);
}

// ─── Duplicate Ingredient Scanner ────────────────────────────────────────────
function openDuplicateScanModal() {
  document.getElementById("duplicate-scan-modal").classList.remove("hidden");
  runDuplicateScan();
}

function normName(n) {
  return n.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function runDuplicateScan() {
  const ings = state.ingredients;
  const groups = [];
  const visited = new Set();

  ings.forEach((a, i) => {
    if (visited.has(a.id)) return;
    const group = [a];
    ings.forEach((b, j) => {
      if (i === j || visited.has(b.id)) return;
      const exact = a.name.toLowerCase().trim() === b.name.toLowerCase().trim();
      const near = !exact && normName(a.name) === normName(b.name);
      if (exact || near) group.push(b);
    });
    if (group.length > 1) {
      group.forEach((g) => visited.add(g.id));
      groups.push(group);
    }
  });

  const exactCount = groups.filter((g) =>
    g.every(
      (x) => x.name.toLowerCase().trim() === g[0].name.toLowerCase().trim(),
    ),
  ).length;
  const nearCount = groups.length - exactCount;
  const summaryEl = document.getElementById("dup-scan-summary");
  summaryEl.innerHTML =
    groups.length === 0
      ? `<div style="display:flex;align-items:center;gap:8px;color:var(--green);font-size:13px;font-weight:600"><span style="font-size:18px">✓</span> No duplicates found — your library is clean!</div>`
      : `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:4px;width:100%">
        <span style="font-size:12px;font-weight:700;color:var(--red)">${groups.length} group${groups.length !== 1 ? "s" : ""} found</span>
        <span style="color:var(--border)">|</span>
        ${exactCount ? `<span style="font-size:12px;color:var(--text-secondary)">${exactCount} exact</span>` : ""}
        ${nearCount ? `<span style="font-size:12px;color:var(--accent)">${nearCount} near match${nearCount !== 1 ? "es" : ""}</span>` : ""}
      </div>`;

  const resultsEl = document.getElementById("dup-scan-results");
  if (groups.length === 0) {
    resultsEl.innerHTML = "";
    return;
  }

  // Store groups on window for merge access
  window._dupGroups = groups;

  resultsEl.innerHTML = groups
    .map((group, gi) => {
      const isExact = group.every(
        (x) =>
          x.name.toLowerCase().trim() === group[0].name.toLowerCase().trim(),
      );
      const badge = isExact
        ? `<span style="font-size:10px;font-weight:700;color:var(--red);background:var(--red-bg);padding:2px 8px;border-radius:20px;letter-spacing:.4px">EXACT</span>`
        : `<span style="font-size:10px;font-weight:700;color:var(--accent);background:var(--accent-bg);padding:2px 8px;border-radius:20px;letter-spacing:.4px">NEAR MATCH</span>`;

      const rows = group
        .map((ing, ri) => {
          const cpp =
            ing.packSize > 0
              ? (ing.packCost / ing.packSize) * (100 / (ing.yieldPct || 100))
              : 0;
          const usedIn = state.recipes.filter((r) =>
            r.ingredients.some((x) => x.ingId === ing.id),
          ).length;
          const usedBadge =
            usedIn > 0
              ? `<span style="color:var(--green);font-weight:600">${usedIn} recipe${usedIn !== 1 ? "s" : ""}</span>`
              : `<span style="color:var(--text-muted)">unused</span>`;
          return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:9px 12px;font-size:13px;font-weight:600;color:var(--text-primary)">${escHtml(ing.name)}</td>
        <td style="padding:9px 12px;font-size:12px;color:var(--text-secondary)">${escHtml(ing.category || "—")}</td>
        <td style="padding:9px 12px;font-size:12px;color:var(--text-secondary)">${ing.packSize || 0} ${escHtml(ing.unit || "")}</td>
        <td style="padding:9px 12px;font-size:12px;font-weight:600">${fmt(ing.packCost)}</td>
        <td style="padding:9px 12px;font-size:12px;color:var(--text-muted)">${fmt(cpp)}/100g</td>
        <td style="padding:9px 12px;font-size:12px">${usedBadge}</td>
        <td style="padding:9px 12px;text-align:right">
          <button onclick="dupDeleteSingle('${ing.id}')"
            style="padding:4px 10px;font-size:11px;font-weight:600;background:transparent;border:1px solid var(--red);color:var(--red);border-radius:5px;cursor:pointer;transition:var(--transition)"
            onmouseover="this.style.background='var(--red-bg)'" onmouseout="this.style.background='transparent'">
            Delete
          </button>
        </td>
      </tr>`;
        })
        .join("");

      // Merge button only shown when 2+ in group
      const mergeBtn =
        group.length >= 2
          ? `<button onclick="openDupMergeModal(${gi})"
           style="padding:5px 14px;font-size:11px;font-weight:600;background:var(--accent);color:#fff;border:none;border-radius:5px;cursor:pointer;transition:var(--transition)"
           onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
           Merge into one
         </button>`
          : "";

      return `<div style="margin-bottom:14px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;padding:9px 14px;background:var(--bg-card2);border-bottom:1px solid var(--border)">
        ${badge}
        <span style="font-size:12px;color:var(--text-muted)">${group.length} entries</span>
        <div style="margin-left:auto">${mergeBtn}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;background:var(--bg-card)">
        <thead>
          <tr style="background:var(--bg-card2)">
            <th style="text-align:left;padding:6px 12px;font-size:10px;font-weight:700;letter-spacing:.6px;color:var(--text-muted);text-transform:uppercase;border-bottom:1px solid var(--border)">Name</th>
            <th style="text-align:left;padding:6px 12px;font-size:10px;font-weight:700;letter-spacing:.6px;color:var(--text-muted);text-transform:uppercase;border-bottom:1px solid var(--border)">Category</th>
            <th style="text-align:left;padding:6px 12px;font-size:10px;font-weight:700;letter-spacing:.6px;color:var(--text-muted);text-transform:uppercase;border-bottom:1px solid var(--border)">Pack Size</th>
            <th style="text-align:left;padding:6px 12px;font-size:10px;font-weight:700;letter-spacing:.6px;color:var(--text-muted);text-transform:uppercase;border-bottom:1px solid var(--border)">Pack Cost</th>
            <th style="text-align:left;padding:6px 12px;font-size:10px;font-weight:700;letter-spacing:.6px;color:var(--text-muted);text-transform:uppercase;border-bottom:1px solid var(--border)">Unit Cost</th>
            <th style="text-align:left;padding:6px 12px;font-size:10px;font-weight:700;letter-spacing:.6px;color:var(--text-muted);text-transform:uppercase;border-bottom:1px solid var(--border)">Used In</th>
            <th style="border-bottom:1px solid var(--border)"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
    })
    .join("");
}

async function dupDeleteSingle(id) {
  const ing = state.ingredients.find((i) => i.id === id);
  if (!ing) return;
  const usedIn = state.recipes.filter((r) =>
    r.ingredients.some((ri) => ri.ingId === id),
  );
  const msg = usedIn.length
    ? `Used in ${usedIn.length} recipe(s) — those links will be removed.`
    : "Not used in any recipes.";
  if (!(await showConfirm(`Delete "${ing.name}"?`, msg))) return;
  state.ingredients = state.ingredients.filter((i) => i.id !== id);
  state.recipes.forEach((r) => {
    r.ingredients = r.ingredients.filter((ri) => ri.ingId !== id);
  });
  save();
  showToast(`Deleted "${ing.name}"`, "success", 1800);
  runDuplicateScan();
  renderIngredientLibrary();
}

function openDupMergeModal(groupIdx) {
  const group = window._dupGroups[groupIdx];
  if (!group || group.length < 2) return;

  // Sort group so the most recently updated price is first
  const now = Date.now();
  const withAge = group
    .map((ing) => {
      const hist = ing.priceHistory || [];
      const lastEntry = hist.length ? hist[hist.length - 1] : null;
      const lastDate = lastEntry ? new Date(lastEntry.date).getTime() : 0;
      const daysAgo = lastDate ? Math.floor((now - lastDate) / 86400000) : null;
      return { ing, lastDate, daysAgo, lastEntry };
    })
    .sort((a, b) => b.lastDate - a.lastDate); // newest price first

  const priceRows = withAge
    .map(({ ing, daysAgo, lastEntry }, i) => {
      const cpp = ing.packSize > 0 ? ing.packCost / ing.packSize : 0;
      const usedIn = state.recipes.filter((r) =>
        r.ingredients.some((x) => x.ingId === ing.id),
      ).length;

      // Age badge
      let ageBadge = "";
      if (i === 0 && daysAgo !== null) {
        ageBadge = `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:rgba(34,197,94,0.12);color:var(--green);border:1px solid rgba(34,197,94,0.3);flex-shrink:0">✓ NEWEST</span>`;
      } else if (daysAgo !== null) {
        const col =
          daysAgo > 60
            ? "var(--red)"
            : daysAgo > 30
              ? "var(--accent)"
              : "var(--text-muted)";
        ageBadge = `<span style="font-size:10px;color:${col};flex-shrink:0">${daysAgo}d ago</span>`;
      } else {
        ageBadge = `<span style="font-size:10px;color:var(--text-muted);flex-shrink:0">No history</span>`;
      }

      // Price history mini-list (last 3 entries)
      const hist = (ing.priceHistory || []).slice(-3).reverse();
      const histHtml = hist.length
        ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:.5px;text-transform:uppercase;margin-bottom:4px">Recent price changes</div>
        ${hist
          .map((h) => {
            const oldP = h.packCost !== undefined ? h.packCost : null;
            const newP = h.newCost !== undefined ? h.newCost : null;
            const changeStr =
              oldP !== null && newP !== null
                ? `${fmt(oldP)} → ${fmt(newP)}`
                : fmt(oldP !== null ? oldP : newP);
            const chgCol =
              newP && oldP && newP > oldP
                ? "var(--red)"
                : newP && oldP && newP < oldP
                  ? "var(--green)"
                  : "var(--text-muted)";
            return `<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:2px">
            <span>${h.date}</span><span style="color:${chgCol};font-weight:600">${changeStr}</span>
          </div>`;
          })
          .join("")}
      </div>`
        : "";

      return `<label style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border:2px solid ${i === 0 ? "var(--green)" : "var(--border)"};border-radius:8px;cursor:pointer;background:${i === 0 ? "rgba(34,197,94,0.04)" : "var(--bg-card)"};margin-bottom:10px;transition:border-color .15s"
              onmouseover="this.style.borderColor='var(--accent)'" onmouseout="if(!document.getElementById('mp-price-${i}').checked)this.style.borderColor='${i === 0 ? "var(--green)" : "var(--border)"}'">
        <input type="radio" name="merge-price-pick" id="mp-price-${i}" value="${ing.id}" ${i === 0 ? "checked" : ""} style="accent-color:var(--accent);width:15px;height:15px;flex-shrink:0;margin-top:2px" />
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="font-size:13px;font-weight:700;color:var(--text-primary)">${escHtml(ing.name)}</span>
            ${ageBadge}
          </div>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <div style="text-align:center">
              <div style="font-size:18px;font-weight:800;color:var(--accent)">${fmt(ing.packCost)}</div>
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">Pack cost</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:15px;font-weight:700;color:var(--text-secondary)">${ing.packSize || 0} ${escHtml(ing.unit || "")}</div>
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">Pack size</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:15px;font-weight:700;color:var(--text-secondary)">${fmt(cpp)}/${escHtml(ing.unit || "unit")}</div>
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">Cost/unit</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:15px;font-weight:700;color:${usedIn ? "var(--blue)" : "var(--text-muted)"}">${usedIn}</div>
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">Recipe${usedIn !== 1 ? "s" : ""}</div>
            </div>
          </div>
          ${histHtml}
        </div>
      </label>`;
    })
    .join("");

  const modal = document.getElementById("dup-merge-modal");
  document.getElementById("dup-merge-price-rows").innerHTML = priceRows;
  // Use the name from the most-used or first ingredient
  const mostUsed = [...group].sort(
    (a, b) =>
      state.recipes.filter((r) => r.ingredients.some((x) => x.ingId === b.id))
        .length -
      state.recipes.filter((r) => r.ingredients.some((x) => x.ingId === a.id))
        .length,
  )[0];
  document.getElementById("dup-merge-name").value = mostUsed.name;
  modal.dataset.groupIdx = groupIdx;
  // Store sorted order so confirmDupMerge knows which ingredient ID was picked
  modal.dataset.sortedIds = JSON.stringify(withAge.map((x) => x.ing.id));
  modal.classList.remove("hidden");
}

async function confirmDupMerge() {
  const modal = document.getElementById("dup-merge-modal");
  const groupIdx = parseInt(modal.dataset.groupIdx);
  const group = window._dupGroups[groupIdx];
  if (!group) return;

  // Radio value is now the ingredient ID of the picked price source
  const pickedId = document.querySelector(
    'input[name="merge-price-pick"]:checked',
  )?.value;
  const keepName =
    document.getElementById("dup-merge-name").value.trim() || group[0].name;
  const priceSrc = group.find((i) => i.id === pickedId) || group[0];

  // The ingredient we keep — always group[0], updated with chosen price + name
  const keepId = group[0].id;
  const deleteIds = group.slice(1).map((i) => i.id);

  // Update the kept ingredient
  const keepIdx = state.ingredients.findIndex((i) => i.id === keepId);
  if (keepIdx < 0) return;
  state.ingredients[keepIdx] = {
    ...state.ingredients[keepIdx],
    name: keepName,
    packCost: priceSrc.packCost,
    packSize: priceSrc.packSize,
    unit: priceSrc.unit,
    yieldPct: priceSrc.yieldPct,
    supplierId: priceSrc.supplierId || state.ingredients[keepIdx].supplierId,
  };

  // Re-point all recipe ingredient links from deleted ids → keepId
  deleteIds.forEach((delId) => {
    state.recipes.forEach((r) => {
      r.ingredients.forEach((ri) => {
        if (ri.ingId === delId) ri.ingId = keepId;
      });
      // Remove any now-duplicate recipe ingredient entries (same ingId twice)
      const seen = new Set();
      r.ingredients = r.ingredients.filter((ri) => {
        if (seen.has(ri.ingId)) return false;
        seen.add(ri.ingId);
        return true;
      });
    });
    state.ingredients = state.ingredients.filter((i) => i.id !== delId);
  });

  save();
  modal.classList.add("hidden");
  showToast(`✓ Merged into "${keepName}"`, "success", 2000);
  runDuplicateScan();
  renderIngredientLibrary();
  if (state.activeRecipeId) renderRecipeEditor();
}

async function deleteIngredient(id) {
  const ing = state.ingredients.find((i) => i.id === id);
  if (!ing) return;
  const affected = state.recipes.filter((r) =>
    r.ingredients.some((ri) => ri.ingId === id),
  );
  const msg = affected.length
    ? `Used in ${affected.length} recipe${affected.length !== 1 ? "s" : ""}: ${affected
        .slice(0, 3)
        .map((r) => r.name)
        .join(
          ", ",
        )}${affected.length > 3 ? " …" : ""}. It will be removed from all of them.`
    : "This ingredient is not used in any recipe.";
  if (!(await showConfirm(`Delete "${ing.name}"?`, msg))) return;
  state.ingredients = state.ingredients.filter((i) => i.id !== id);
  state.recipes.forEach((r) => {
    r.ingredients = r.ingredients.filter((ri) => ri.ingId !== id);
  });
  renderIngredientLibrary();
  if (state.activeRecipeId) renderRecipeEditor();
  save();
}

// ─── Dashboard ─────────────────────────────────────────────────
function renderDashboard() {
  const container = document.getElementById("dashboard-content");
  // Rebuild category filter
  const dashCatSel = document.getElementById("dash-cat-filter");
  if (dashCatSel) {
    const cur = dashCatSel.value;
    const usedCats = [
      ...new Set(
        state.recipes
          .filter((r) => !r.yieldQty)
          .map((r) => r.category)
          .filter(Boolean),
      ),
    ];
    dashCatSel.innerHTML =
      '<option value="">All categories</option>' +
      usedCats
        .map((c) => `<option value="${escHtml(c)}">${escHtml(c)}</option>`)
        .join("");
    dashCatSel.value = cur;
  }
  const dashCatFilter = dashCatSel?.value || "";
  // Exclude sub-recipes (batch recipes with yieldQty) from ALL dashboard calculations
  const sellableRecipes = state.recipes.filter(
    (r) =>
      !r.yieldQty &&
      (!dashCatFilter ||
        (r.category || "").toLowerCase() === dashCatFilter.toLowerCase()),
  );
  if (!sellableRecipes.length) {
    container.innerHTML =
      '<div class="empty-state" style="padding-top:60px"><div class="empty-icon">📊</div><h2>No recipes yet</h2><p>Add recipes to see your cost dashboard</p></div>';
    return;
  }

  const rows = sellableRecipes
    .map((r) => {
      const cost = recipeTotalCost(r) / (r.portions || 1);
      const isOverride = !!(r.priceOverride && r.priceOverride > 0);
      const price = isOverride
        ? r.priceOverride
        : suggestPrice(cost, state.activeGP);
      const gp = price > 0 ? ((price - cost) / price) * 100 : 0;
      const profit = price - cost;
      const allergens = recipeAllergens(r);
      return { r, cost, price, gp, profit, allergens, isOverride };
    })
    .sort((a, b) => b.cost - a.cost);

  const avgGP = rows.reduce((s, x) => s + x.gp, 0) / rows.length;
  const totalRecipes = rows.length;
  const withAllergens = rows.filter((x) => x.allergens.length > 0).length;
  const costiest = rows[0];
  const cheapest = rows[rows.length - 1];
  const byProfit = [...rows].sort((a, b) => b.profit - a.profit);
  const mostProfitable = byProfit[0];
  const leastProfitable = byProfit[byProfit.length - 1];
  const avgProfit = rows.reduce((s, x) => s + x.profit, 0) / rows.length;

  const allAllergenCounts = {};
  ALLERGENS.forEach((a) => {
    allAllergenCounts[a] = 0;
  });
  rows.forEach(({ allergens }) =>
    allergens.forEach((a) => {
      if (allAllergenCounts[a] !== undefined) allAllergenCounts[a]++;
    }),
  );
  const topAllergens = Object.entries(allAllergenCounts)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  container.innerHTML = `
    <!-- KPI cards -->
    <div class="dash-kpi-row">
      <div class="dash-kpi">
        <div class="kpi-val">${totalRecipes}</div>
        <div class="kpi-lbl">Total Recipes</div>
      </div>
      <div class="dash-kpi">
        <div class="kpi-val" style="color:var(--accent)">${avgGP.toFixed(1)}%</div>
        <div class="kpi-lbl">Avg Target GP</div>
      </div>
      <div class="dash-kpi">
        <div class="kpi-val" style="color:var(--green)">${fmt(cheapest.cost)}</div>
        <div class="kpi-lbl">Lowest Cost/Portion</div>
        <div class="kpi-sub">${escHtml(cheapest.r.name)}</div>
      </div>
      <div class="dash-kpi">
        <div class="kpi-val" style="color:var(--red)">${fmt(costiest.cost)}</div>
        <div class="kpi-lbl">Highest Cost/Portion</div>
        <div class="kpi-sub">${escHtml(costiest.r.name)}</div>
      </div>
      <div class="dash-kpi">
        <div class="kpi-val">${withAllergens}</div>
        <div class="kpi-lbl">Recipes with Allergens</div>
      </div>
      <div class="dash-kpi">
        <div class="kpi-val" style="color:var(--green)">${fmt(avgProfit)}</div>
        <div class="kpi-lbl">Avg Profit / Portion</div>
      </div>
      <div class="dash-kpi">
        <div class="kpi-val" style="color:var(--green)">${fmt(mostProfitable.profit)}</div>
        <div class="kpi-lbl">🥇 Top Earner</div>
        <div class="kpi-sub">${escHtml(mostProfitable.r.name)}</div>
      </div>
      <div class="dash-kpi">
        <div class="kpi-val" style="color:var(--red)">${fmt(leastProfitable.profit)}</div>
        <div class="kpi-lbl">⚠ Lowest Earner</div>
        <div class="kpi-sub">${escHtml(leastProfitable.r.name)}</div>
      </div>
    </div>

    <!-- GP Health / Margin Mix -->
    ${(() => {
      const gpTarget = state.activeGP || 70;
      const highGP = rows.filter(x => x.gp >= gpTarget);
      const midGP = rows.filter(x => x.gp >= gpTarget - 10 && x.gp < gpTarget);
      const lowGP = rows.filter(x => x.gp < gpTarget - 10);
      const totalR = rows.length;
      const pctH = ((highGP.length / totalR) * 100).toFixed(0);
      const pctM = ((midGP.length / totalR) * 100).toFixed(0);
      const pctL = ((lowGP.length / totalR) * 100).toFixed(0);

      return `<div class="dash-grid" style="margin-bottom:20px">
        <div class="dash-card">
          <h3 class="dash-card-title">🎯 Margin Health — Target ${gpTarget}%</h3>
          <div style="display:flex;gap:4px;height:22px;border-radius:6px;overflow:hidden;margin-bottom:14px">
            ${highGP.length ? `<div style="flex:${highGP.length};background:var(--green);position:relative;min-width:20px" title="${highGP.length} recipes above target">
              <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff">${pctH}%</span>
            </div>` : ''}
            ${midGP.length ? `<div style="flex:${midGP.length};background:var(--accent);position:relative;min-width:20px" title="${midGP.length} recipes within 10% of target">
              <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff">${pctM}%</span>
            </div>` : ''}
            ${lowGP.length ? `<div style="flex:${lowGP.length};background:var(--red);position:relative;min-width:20px" title="${lowGP.length} recipes below target">
              <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff">${pctL}%</span>
            </div>` : ''}
          </div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:6px"><div style="width:10px;height:10px;border-radius:50%;background:var(--green)"></div><span style="font-size:11px;color:var(--text-secondary)">Above target: <b>${highGP.length}</b></span></div>
            <div style="display:flex;align-items:center;gap:6px"><div style="width:10px;height:10px;border-radius:50%;background:var(--accent)"></div><span style="font-size:11px;color:var(--text-secondary)">Near target: <b>${midGP.length}</b></span></div>
            <div style="display:flex;align-items:center;gap:6px"><div style="width:10px;height:10px;border-radius:50%;background:var(--red)"></div><span style="font-size:11px;color:var(--text-secondary)">Below target: <b>${lowGP.length}</b></span></div>
          </div>
          ${lowGP.length ? `<div style="margin-top:6px;padding-top:10px;border-top:1px solid var(--border)">
            <div style="font-size:11px;font-weight:600;color:var(--red);margin-bottom:6px">⚠ Recipes below ${gpTarget - 10}% GP:</div>
            <div style="display:flex;flex-direction:column;gap:4px;max-height:160px;overflow-y:auto">
              ${lowGP.sort((a,b) => a.gp - b.gp).map(x => `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--bg-card2);border-radius:var(--radius-sm);cursor:pointer" onclick="selectRecipe('${x.r.id}');showView('recipes')">
                <span style="font-size:12px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(x.r.name)}</span>
                <span style="font-size:12px;font-weight:700;color:var(--red)">${x.gp.toFixed(1)}%</span>
                <span style="font-size:11px;color:var(--text-muted)">${fmt(x.cost)} cost</span>
              </div>`).join('')}
            </div>
          </div>` : `<div style="margin-top:6px;padding-top:10px;border-top:1px solid var(--border);font-size:12px;color:var(--green);font-weight:600">✓ All recipes are within target range</div>`}
        </div>

        <!-- Spending by Supplier -->
        <div class="dash-card">
          <h3 class="dash-card-title">🏪 Spend by Supplier</h3>
          ${(() => {
            const supSpend = {};
            rows.forEach(({r}) => {
              (r.ingredients || []).forEach(ri => {
                const ing = getIngMap().get(ri.ingId);
                if (!ing) return;
                const sup = (state.suppliers || []).find(s => s.id === ing.supplierId);
                const supName = sup ? sup.name : 'Unassigned';
                const lineCost = ingLineCost(ri.ingId, ri.qty, ri.recipeUnit);
                supSpend[supName] = (supSpend[supName] || 0) + lineCost;
              });
            });
            const sorted = Object.entries(supSpend).sort((a,b) => b[1] - a[1]);
            const totalSpend = sorted.reduce((s, [,v]) => s + v, 0);
            if (!sorted.length) return '<div style="font-size:12px;color:var(--text-muted)">No supplier data</div>';
            const colors = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316'];
            // SVG donut
            let cumPct = 0;
            const donutParts = sorted.map(([name, spend], idx) => {
              const pct = totalSpend > 0 ? spend / totalSpend : 0;
              const startAngle = cumPct * 2 * Math.PI - Math.PI / 2;
              cumPct += pct;
              const endAngle = cumPct * 2 * Math.PI - Math.PI / 2;
              const large = pct > 0.5 ? 1 : 0;
              const r = 50;
              const x1 = 60 + r * Math.cos(startAngle);
              const y1 = 60 + r * Math.sin(startAngle);
              const x2 = 60 + r * Math.cos(endAngle);
              const y2 = 60 + r * Math.sin(endAngle);
              const col = colors[idx % colors.length];
              if (pct >= 0.999) return `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${col}" stroke-width="20"/>`;
              if (pct < 0.005) return '';
              return `<path d="M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2}" fill="none" stroke="${col}" stroke-width="20"/>`;
            });
            return `<div style="display:flex;gap:16px;align-items:flex-start">
              <svg viewBox="0 0 120 120" width="110" height="110" style="flex-shrink:0">
                ${donutParts.join('')}
                <text x="60" y="56" text-anchor="middle" font-size="11" font-weight="800" fill="var(--text-primary)">${fmt(totalSpend)}</text>
                <text x="60" y="70" text-anchor="middle" font-size="7" fill="var(--text-muted)">total / portion</text>
              </svg>
              <div style="display:flex;flex-direction:column;gap:5px;flex:1;min-width:0;max-height:180px;overflow-y:auto">
                ${sorted.map(([name, spend], idx) => {
                  const pct = totalSpend > 0 ? ((spend / totalSpend) * 100).toFixed(1) : '0.0';
                  const col = colors[idx % colors.length];
                  return `<div style="display:flex;align-items:center;gap:6px">
                    <div style="width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0"></div>
                    <span style="font-size:11px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary)">${escHtml(name)}</span>
                    <span style="font-size:11px;font-weight:700;color:var(--text-primary);flex-shrink:0">${fmt(spend)}</span>
                    <span style="font-size:10px;color:var(--text-muted);flex-shrink:0;width:36px;text-align:right">${pct}%</span>
                  </div>`;
                }).join('')}
              </div>
            </div>`;
          })()}
        </div>
      </div>`;
    })()}

    <!-- Cost Trend — Top 10 most-used ingredients -->
    ${(() => {
      // Find top ingredients by usage across filtered recipes
      const ingUsage = {};
      rows.forEach(({r}) => {
        (r.ingredients || []).forEach(ri => {
          if (ri.ingId) ingUsage[ri.ingId] = (ingUsage[ri.ingId] || 0) + 1;
        });
      });
      const topIngIds = Object.entries(ingUsage)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id]) => id);
      const ingWithHist = topIngIds
        .map(id => state.ingredients.find(i => i.id === id))
        .filter(Boolean)
        .filter(i => (i.priceHistory || []).length >= 2);
      if (!ingWithHist.length) return '';

      const sparkColors = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16','#06b6d4'];

      const cards = ingWithHist.map(function(ing, idx) {
        const hist = (ing.priceHistory || []).slice(-12);
        const points = hist
          .filter(function(h) { return h.newCost !== undefined; })
          .map(function(h) { return { date: new Date(h.date), cost: h.newCost }; });
        points.push({ date: new Date(), cost: ing.packCost });
        if (points.length < 2) return '';
        const costs = points.map(function(p) { return p.cost; });
        const minC = Math.min.apply(null, costs);
        const maxC = Math.max.apply(null, costs);
        const range = maxC - minC || 1;
        const svgW = 220, svgH = 40;
        const step = svgW / (points.length - 1);
        const polyPoints = points.map(function(p, pi) {
          var px = pi * step;
          var py = svgH - ((p.cost - minC) / range) * (svgH - 4) - 2;
          return px.toFixed(1) + ',' + py.toFixed(1);
        }).join(' ');
        const firstCost = points[0].cost;
        const lastCost = points[points.length - 1].cost;
        const change = firstCost > 0 ? ((lastCost - firstCost) / firstCost * 100) : 0;
        const changeCol = change > 2 ? 'var(--red)' : change < -2 ? 'var(--green)' : 'var(--text-muted)';
        const lineCol = sparkColors[idx % sparkColors.length];
        const lastX = ((points.length - 1) * step).toFixed(1);
        const lastY = (svgH - ((lastCost - minC) / range) * (svgH - 4) - 2).toFixed(1);
        return '<div style="background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
          + '<span style="font-size:12px;font-weight:600;color:var(--text-primary);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escHtml(ing.name) + '">' + escHtml(ing.name) + '</span>'
          + '<span style="font-size:11px;font-weight:700;color:' + changeCol + '">' + (change > 0 ? '+' : '') + change.toFixed(1) + '%</span>'
          + '</div>'
          + '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" width="100%" height="' + svgH + '" preserveAspectRatio="none" style="display:block">'
          + '<polyline points="' + polyPoints + '" fill="none" stroke="' + lineCol + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
          + '<circle cx="' + lastX + '" cy="' + lastY + '" r="3" fill="' + lineCol + '"/>'
          + '</svg>'
          + '<div style="display:flex;justify-content:space-between;margin-top:4px">'
          + '<span style="font-size:10px;color:var(--text-muted)">' + fmt(firstCost) + '</span>'
          + '<span style="font-size:10px;color:var(--text-muted)">&rarr; ' + fmt(lastCost) + '</span>'
          + '</div></div>';
      }).join('');

      return '<div class="dash-card" style="margin-bottom:20px">'
        + '<h3 class="dash-card-title">📈 Cost Trends — Top Ingredients</h3>'
        + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">'
        + cards + '</div></div>';
    })()}

    <!-- GP% by Category Chart -->
    ${(() => {
      const cats = [
        ...new Set(rows.map((x) => x.r.category || "Uncategorised")),
      ];
      if (cats.length < 2) return "";
      const catStats = cats
        .map((cat) => {
          const catRows = rows.filter(
            (x) => (x.r.category || "Uncategorised") === cat,
          );
          const avgGp = catRows.reduce((s, x) => s + x.gp, 0) / catRows.length;
          const avgProfit =
            catRows.reduce((s, x) => s + x.profit, 0) / catRows.length;
          return { cat, avgGp, avgProfit, count: catRows.length };
        })
        .sort((a, b) => b.avgGp - a.avgGp);
      const maxGp = Math.max(...catStats.map((c) => c.avgGp), 100);
      return `<div class="dash-card" style="margin-bottom:20px">
        <h3 class="dash-card-title">📊 Avg GP% by Category</h3>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
          ${catStats
            .map(({ cat, avgGp, avgProfit, count }) => {
              const barW = Math.max(2, (avgGp / maxGp) * 100).toFixed(1);
              const col =
                avgGp >= 75
                  ? "var(--green)"
                  : avgGp >= 65
                    ? "var(--accent)"
                    : "var(--red)";
              return `<div style="display:flex;align-items:center;gap:10px">
              <div style="width:140px;font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0" title="${escHtml(cat)}">${escHtml(cat)}</div>
              <div style="flex:1;background:var(--bg-card2);border-radius:4px;height:18px;overflow:hidden">
                <div style="width:${barW}%;height:100%;background:${col};border-radius:4px;transition:width .3s"></div>
              </div>
              <div style="width:48px;text-align:right;font-size:12px;font-weight:700;color:${col};flex-shrink:0">${avgGp.toFixed(1)}%</div>
              <div style="width:60px;text-align:right;font-size:11px;color:var(--text-muted);flex-shrink:0">${fmt(avgProfit)} avg</div>
              <div style="width:30px;text-align:right;font-size:10px;color:var(--text-muted);flex-shrink:0">${count} rec</div>
            </div>`;
            })
            .join("")}
        </div>
      </div>`;
    })()}

    <!-- Revenue Potential Summary -->
    <div class="dash-card" style="margin-bottom:20px">
      <h3 class="dash-card-title">💵 Revenue Potential per Cover</h3>
      <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center">
        ${(() => {
          const totalCostAll = rows.reduce((s,x) => s + x.cost, 0);
          const totalPriceAll = rows.reduce((s,x) => s + x.price, 0);
          const totalProfitAll = rows.reduce((s,x) => s + x.profit, 0);
          const avgCost = totalCostAll / rows.length;
          const avgPrice = totalPriceAll / rows.length;
          const avgProfitAll = totalProfitAll / rows.length;
          const medianProfit = [...rows].sort((a,b) => a.profit - b.profit)[Math.floor(rows.length / 2)].profit;
          return `
            <div style="text-align:center;padding:8px 16px;background:var(--bg-card2);border-radius:var(--radius-sm);flex:1;min-width:100px">
              <div style="font-size:20px;font-weight:800;color:var(--text-primary)">${fmt(avgCost)}</div>
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Avg food cost</div>
            </div>
            <div style="font-size:20px;color:var(--text-muted)">→</div>
            <div style="text-align:center;padding:8px 16px;background:var(--bg-card2);border-radius:var(--radius-sm);flex:1;min-width:100px">
              <div style="font-size:20px;font-weight:800;color:var(--accent)">${fmt(avgPrice)}</div>
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Avg sell price</div>
            </div>
            <div style="font-size:20px;color:var(--text-muted)">=</div>
            <div style="text-align:center;padding:8px 16px;background:var(--bg-card2);border-radius:var(--radius-sm);flex:1;min-width:100px">
              <div style="font-size:20px;font-weight:800;color:var(--green)">${fmt(avgProfitAll)}</div>
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Avg profit / portion</div>
            </div>
            <div style="text-align:center;padding:8px 16px;background:var(--bg-card2);border-radius:var(--radius-sm);flex:1;min-width:100px">
              <div style="font-size:20px;font-weight:800;color:var(--accent)">${fmt(medianProfit)}</div>
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Median profit</div>
            </div>`;
        })()}
      </div>
    </div>

    <div class="dash-grid">
      <!-- Profitability Ranking -->
      <div class="dash-card" style="grid-column:1/3">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <h3 class="dash-card-title" style="margin-bottom:0">💰 Profitability Ranking</h3>
          <div style="display:flex;gap:6px;align-items:center">
            <span style="font-size:11px;color:var(--text-muted)">Sort by:</span>
            <button class="btn-secondary btn-sm" onclick="renderDashboard._sortProfit='profit';renderDashboard()" id="psort-profit"
              style="font-size:11px;${!renderDashboard._sortProfit || renderDashboard._sortProfit === "profit" ? "background:var(--accent-bg);border-color:var(--accent);color:var(--accent)" : ""}">Profit £</button>
            <button class="btn-secondary btn-sm" onclick="renderDashboard._sortProfit='gp';renderDashboard()" id="psort-gp"
              style="font-size:11px;${renderDashboard._sortProfit === "gp" ? "background:var(--accent-bg);border-color:var(--accent);color:var(--accent)" : ""}">GP %</button>
            <button class="btn-secondary btn-sm" onclick="renderDashboard._sortProfit='price';renderDashboard()" id="psort-price"
              style="font-size:11px;${renderDashboard._sortProfit === "price" ? "background:var(--accent-bg);border-color:var(--accent);color:var(--accent)" : ""}">Sell Price</button>
          </div>
        </div>
        ${(() => {
          const sortKey = renderDashboard._sortProfit || "profit";
          const ranked = [...rows].sort((a, b) => b[sortKey] - a[sortKey]);
          const maxProfit = ranked[0].profit;
          const medals = ["🥇", "🥈", "🥉"];
          return ranked
            .map((x, i) => {
              const barW =
                maxProfit > 0 ? Math.max(4, (x.profit / maxProfit) * 100) : 4;
              const gpCol =
                x.gp >= 75
                  ? "var(--green)"
                  : x.gp >= 65
                    ? "var(--accent)"
                    : "var(--red)";
              const profitCol = x.profit > 0 ? "var(--green)" : "var(--red)";
              return `<div class="profit-rank-row" onclick="selectRecipe('${x.r.id}');showView('recipes')" title="Open recipe">
              <div class="profit-rank-pos">${i < 3 ? medals[i] : `<span style="color:var(--text-muted);font-size:12px">${i + 1}</span>`}</div>
              <div class="profit-rank-name">
                <div style="font-weight:600;font-size:13px">${escHtml(x.r.name)}</div>
                <div style="font-size:11px;color:var(--text-muted)">${escHtml(x.r.category || "—")}${x.isOverride ? ' · <span style="color:var(--accent);font-size:10px">override</span>' : ""}</div>
              </div>
              <div class="profit-rank-bar-wrap">
                <div class="profit-rank-bar" style="width:${barW.toFixed(0)}%;background:${profitCol}"></div>
              </div>
              <div class="profit-rank-stats">
                <span style="font-weight:700;color:${profitCol};min-width:52px;text-align:right">${fmt(x.profit)}</span>
                <span style="color:var(--text-muted);font-size:11px;min-width:32px;text-align:right">${x.gp.toFixed(0)}%</span>
                <span style="color:var(--text-muted);font-size:11px;min-width:50px;text-align:right">${fmt(x.price)}</span>
                <span style="color:var(--text-muted);font-size:11px;min-width:50px;text-align:right">${fmt(x.cost)}</span>
              </div>
            </div>`;
            })
            .join("");
        })()}
        <div style="display:flex;justify-content:flex-end;gap:20px;font-size:11px;color:var(--text-muted);margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
          <span>Profit/portion</span><span>GP%</span><span>Sell price</span><span>Food cost</span>
        </div>
      </div>
    </div>

    <div class="dash-grid">
      <!-- Recipe cost table -->
      <div class="dash-card" style="grid-column:1/3">
        <h3 class="dash-card-title">All Recipes — Cost & Price</h3>
        <table class="dash-table">
          <thead><tr>
            <th>Recipe</th><th>Category</th><th>Cost/Portion</th>
            <th>Sell Price</th><th>GP%</th><th>Markup</th><th>Allergens</th>
          </tr></thead>
          <tbody>
            ${rows
              .map(
                ({ r, cost, price, gp, allergens, isOverride }) => `
            <tr onclick="selectRecipe('${r.id}')" style="cursor:pointer">
              <td style="font-weight:600">${escHtml(r.name)}</td>
              <td><span class="cat-badge">${escHtml(r.category)}</span></td>
              <td class="cost-val">${fmt(cost)}</td>
              <td style="color:var(--accent);font-weight:700">${fmt(price)}${isOverride ? ' <span title="Price override" style="font-size:10px;background:var(--accent-dim);color:var(--accent);padding:1px 5px;border-radius:3px;font-weight:600;vertical-align:middle">override</span>' : ""}</td>
              <td>
                <div class="gp-bar-wrap">
                  <div class="gp-bar" style="width:${Math.min(gp, 100)}%;background:${gp >= 75 ? "var(--green)" : gp >= 65 ? "var(--accent)" : "var(--red)"}"></div>
                  <span class="gp-bar-val" style="color:${gp >= 75 ? "var(--green)" : gp >= 65 ? "var(--accent)" : "var(--red)"}">${gp.toFixed(1)}%</span>
                </div>
              </td>
              <td style="font-size:13px;color:var(--green);font-weight:700">${fmt(price - cost)}<br><span style="font-size:10px;color:var(--text-muted)">per portion</span></td>
              <td>${
                allergens.length
                  ? allergens
                      .slice(0, 3)
                      .map(
                        (a) =>
                          `<span class="allergen-tag-sm">${escHtml(a)}</span>`,
                      )
                      .join(" ") +
                    (allergens.length > 3 ? ` +${allergens.length - 3}` : "")
                  : '<span style="color:var(--text-muted);font-size:11px">None</span>'
              }</td>
            </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>

      <!-- Allergen overview -->
      <div class="dash-card">
        <h3 class="dash-card-title">Top Allergens Across Menu</h3>
        ${
          topAllergens.length
            ? topAllergens
                .map(
                  ([a, c]) => `
          <div class="allergen-bar-row">
            <span class="allergen-bar-name">${escHtml(a)}</span>
            <div class="allergen-bar-wrap">
              <div class="allergen-bar-fill" style="width:${Math.round((c / totalRecipes) * 100)}%"></div>
            </div>
            <span class="allergen-bar-count">${c} recipe${c !== 1 ? "s" : ""}</span>
          </div>`,
                )
                .join("")
            : '<div style="color:var(--text-muted);font-size:13px">No allergens recorded</div>'
        }
      </div>

      <!-- Category breakdown -->
      <div class="dash-card">
        <h3 class="dash-card-title">Recipes by Category</h3>
        ${(() => {
          const regCats = getRecipeCategories();
          const allUsedCats = [
            ...new Set(rows.map((x) => x.r.category).filter(Boolean)),
          ];
          const orderedCats = [
            ...regCats.filter((c) => allUsedCats.includes(c)),
            ...allUsedCats.filter((c) => !regCats.includes(c)),
          ];
          return orderedCats
            .map((cat) => {
              const catRows = rows.filter((x) => x.r.category === cat);
              if (!catRows.length) return "";
              const avgCost =
                catRows.reduce((s, x) => s + x.cost, 0) / catRows.length;
              return `<div class="cat-dash-row">
              <span class="cat-badge">${escHtml(cat)}</span>
              <span style="color:var(--text-muted);font-size:12px">${catRows.length} recipe${catRows.length !== 1 ? "s" : ""}</span>
              <span style="color:var(--accent);font-size:12px;font-weight:600">avg ${fmt(avgCost)}</span>
            </div>`;
            })
            .join("");
        })()}
      </div>
    </div>

    <!-- Price Drift Alerts -->
    ${(() => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const alerts = state.ingredients
        .map((ing) => {
          const hist = (ing.priceHistory || []).filter(
            (h) => new Date(h.date) >= thirtyDaysAgo && h.newCost !== undefined,
          );
          if (!hist.length) return null;
          const oldCost = hist[0].packCost;
          const newCost = ing.packCost;
          const pct = oldCost > 0 ? ((newCost - oldCost) / oldCost) * 100 : 0;
          if (Math.abs(pct) < 5) return null;
          const affectedRecipes = state.recipes.filter((r) =>
            r.ingredients.some((ri) => ri.ingId === ing.id),
          );
          return { ing, pct, oldCost, newCost, affectedRecipes };
        })
        .filter(Boolean)
        .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
        .slice(0, 8);

      if (!alerts.length)
        return '<div class="dash-card" style="grid-column:1/3;margin-top:0"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><h3 class="dash-card-title" style="margin-bottom:0">🔔 Price Drift Alerts</h3></div><div style="font-size:13px;color:var(--green);font-weight:600">✓ No significant price changes in the last 30 days</div></div>';
      return `<div class="dash-card" style="grid-column:1/3;margin-top:0">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <h3 class="dash-card-title" style="margin-bottom:0">🔔 Price Drift Alerts</h3>
          <span style="font-size:11px;color:var(--text-muted)">Ingredients with &gt;5% price change in the last 30 days</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${alerts
            .map((a) => {
              const up = a.pct > 0;
              const col = up ? "var(--red)" : "var(--green)";
              return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-card2);border:1px solid var(--border);border-left:3px solid ${col};border-radius:var(--radius-sm)">
              <div style="font-size:18px;font-weight:800;color:${col};min-width:56px;text-align:right">${up ? "+" : ""}${a.pct.toFixed(0)}%</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${escHtml(a.ing.name)}</div>
                <div style="font-size:11px;color:var(--text-muted)">${fmt(a.oldCost)} → ${fmt(a.newCost)} · ${a.ing.packSize}${a.ing.unit}</div>
              </div>
              <div style="font-size:11px;color:var(--text-muted);text-align:right;flex-shrink:0">
                ${
                  a.affectedRecipes.length
                    ? `<span style="color:${col};font-weight:600">${a.affectedRecipes.length} recipe${a.affectedRecipes.length !== 1 ? "s" : ""} affected</span><br><span style="font-size:10px">${a.affectedRecipes
                        .slice(0, 2)
                        .map((r) => escHtml(r.name))
                        .join(
                          ", ",
                        )}${a.affectedRecipes.length > 2 ? " +more" : ""}</span>`
                    : '<span style="color:var(--text-muted)">Unused</span>'
                }
              </div>
              <button onclick="openIngredientModal('${a.ing.id}')" style="padding:4px 10px;font-size:11px;font-weight:600;background:var(--bg-input);border:1px solid var(--border);color:var(--text-secondary);border-radius:5px;cursor:pointer;flex-shrink:0">Update</button>
            </div>`;
            })
            .join("")}
        </div>
      </div>`;
    })()}
  `;
}

// ─── Dashboard PDF Export ──────────────────────────────────────
function exportDashboardPDF() {
  const sellableRecipes = state.recipes.filter(r => !r.yieldQty);
  if (!sellableRecipes.length) { toast('No recipes to export'); return; }

  const rows = sellableRecipes.map(r => {
    const cost = recipeTotalCost(r) / (r.portions || 1);
    const isOverride = !!(r.priceOverride && r.priceOverride > 0);
    const price = isOverride ? r.priceOverride : suggestPrice(cost, state.activeGP);
    const gp = price > 0 ? ((price - cost) / price) * 100 : 0;
    const profit = price - cost;
    return { name: r.name, category: r.category || '—', cost, price, gp, profit };
  }).sort((a, b) => b.profit - a.profit);

  const avgGP = rows.reduce((s, x) => s + x.gp, 0) / rows.length;
  const avgProfit = rows.reduce((s, x) => s + x.profit, 0) / rows.length;
  const totalProfit = rows.reduce((s, x) => s + x.profit, 0);
  const gpTarget = state.activeGP || 70;
  const belowTarget = rows.filter(x => x.gp < gpTarget - 10).length;

  // Build printable HTML
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dashboard Report</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;margin:40px;color:#1a1a2e;font-size:12px}
    h1{font-size:22px;margin-bottom:4px} .sub{color:#666;font-size:12px;margin-bottom:20px}
    .kpi-row{display:flex;gap:12px;margin-bottom:20px}
    .kpi{border:1px solid #ddd;border-radius:8px;padding:12px 16px;flex:1;text-align:center}
    .kpi-v{font-size:22px;font-weight:800} .kpi-l{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th{text-align:left;padding:6px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #ccc;color:#666}
    td{padding:6px 8px;border-bottom:1px solid #eee} tr:nth-child(even) td{background:#f9f9fb}
    .green{color:#059669} .red{color:#dc2626} .accent{color:#6366f1}
    @media print{body{margin:20px}}
  </style></head><body>
  <h1>Cost Dashboard Report</h1>
  <div class="sub">${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})} &mdash; ${rows.length} recipes</div>
  <div class="kpi-row">
    <div class="kpi"><div class="kpi-v">${rows.length}</div><div class="kpi-l">Total Recipes</div></div>
    <div class="kpi"><div class="kpi-v accent">${avgGP.toFixed(1)}%</div><div class="kpi-l">Avg GP%</div></div>
    <div class="kpi"><div class="kpi-v green">${fmt(avgProfit)}</div><div class="kpi-l">Avg Profit / Portion</div></div>
    <div class="kpi"><div class="kpi-v">${fmt(totalProfit)}</div><div class="kpi-l">Total Profit (all portions)</div></div>
    <div class="kpi"><div class="kpi-v ${belowTarget ? 'red' : 'green'}">${belowTarget}</div><div class="kpi-l">Below Target GP</div></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Recipe</th><th>Category</th><th>Cost/Portion</th><th>Sell Price</th><th>GP%</th><th>Profit/Portion</th></tr></thead>
    <tbody>${rows.map((x,i) => {
      const gpCls = x.gp >= 75 ? 'green' : x.gp >= 65 ? 'accent' : 'red';
      return `<tr><td>${i+1}</td><td><b>${escHtml(x.name)}</b></td><td>${escHtml(x.category)}</td><td>${fmt(x.cost)}</td><td class="accent"><b>${fmt(x.price)}</b></td><td class="${gpCls}"><b>${x.gp.toFixed(1)}%</b></td><td class="${x.profit>=0?'green':'red'}"><b>${fmt(x.profit)}</b></td></tr>`;
    }).join('')}</tbody>
  </table>
  <script>window.onload=function(){window.print()}<\/script>
  </body></html>`;

  browserIPC.exportPDF(html);
}

// ─── Batch PDF Report (all recipes in one document) ──────────
function exportBatchPDF() {
  const sellable = state.recipes.filter(r => !r.yieldQty);
  if (!sellable.length) { showToast('No recipes to export', 'error'); return; }
  const cur = state.currency || '£';
  const gp = state.activeGP || 70;
  const vatRate = state.vatRate || 0;
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  const pages = sellable.map(recipe => {
    const totalCost = recipeTotalCost(recipe);
    const portions = recipe.portions || 1;
    const cpp = totalCost / portions;
    const isOverride = !!(recipe.priceOverride && recipe.priceOverride > 0);
    const price = isOverride ? recipe.priceOverride : suggestPrice(cpp, gp);
    const profit = price - cpp;
    const gpPct = price > 0 ? ((price - cpp) / price) * 100 : 0;
    const allergens = recipeAllergens(recipe);

    const ingRows = (recipe.ingredients || []).map(ri => {
      const ing = state.ingredients.find(i => i.id === ri.ingId);
      if (!ing) return '';
      const cost = ingLineCost(ri.ingId, ri.qty, ri.recipeUnit);
      const pct = totalCost > 0 ? ((cost / totalCost) * 100).toFixed(0) : 0;
      return '<tr><td>' + escHtml(ing.name) + '</td><td style="text-align:right">' + ri.qty + ' ' + (ri.recipeUnit || ing.unit) + '</td><td style="text-align:right">' + cur + cost.toFixed(2) + '</td><td style="text-align:right;color:#888">' + pct + '%</td></tr>';
    }).join('');

    // Sub-recipe rows
    const subRows = (recipe.subRecipes || []).map(function(sr) {
      const subR = state.recipes.find(function(r) { return r.id === sr.recipeId; });
      if (!subR) return '';
      const unitLabel = recipeUnitLabel(subR);
      const subCost = recipeCostPerUnit(subR) * (sr.qty || 1);
      const pct = totalCost > 0 ? ((subCost / totalCost) * 100).toFixed(0) : 0;
      // Build a short list of what's inside the sub-recipe
      var subIngNames = (subR.ingredients || []).slice(0, 4).map(function(ri2) {
        var ing2 = state.ingredients.find(function(i) { return i.id === ri2.ingId; });
        return ing2 ? ing2.name : '';
      }).filter(Boolean).join(', ');
      if ((subR.ingredients || []).length > 4) subIngNames += ' +' + ((subR.ingredients || []).length - 4) + ' more';
      var nestedSubs = (subR.subRecipes || []).length;
      if (nestedSubs) subIngNames += (subIngNames ? ' · ' : '') + nestedSubs + ' sub-recipe' + (nestedSubs > 1 ? 's' : '');

      return '<tr style="background:#f7f7fa">'
        + '<td><span style="color:#e87c2e;font-weight:700;font-size:10px;margin-right:4px">SUB</span>' + escHtml(subR.name)
        + (subIngNames ? '<div style="font-size:10px;color:#999;margin-top:1px">' + escHtml(subIngNames) + '</div>' : '')
        + '</td>'
        + '<td style="text-align:right">' + (sr.qty || 1) + ' ' + unitLabel + '</td>'
        + '<td style="text-align:right">' + cur + subCost.toFixed(2) + '</td>'
        + '<td style="text-align:right;color:#888">' + pct + '%</td></tr>';
    }).join('');

    return '<div class="page-break">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a1a2e;padding-bottom:8px;margin-bottom:14px">'
      + '<div><div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#e87c2e;font-weight:700">Recipe Cost Sheet</div>'
      + '<h2 style="font-size:20px;font-weight:900;margin:2px 0 0">' + escHtml(recipe.name) + '</h2>'
      + '<div style="font-size:11px;color:#666">' + escHtml(recipe.category || '—') + ' · ' + portions + ' portion' + (portions !== 1 ? 's' : '') + '</div></div>'
      + '<div style="text-align:right;font-size:11px;color:#888"><div>GP Target: <b>' + gp + '%</b></div><div>' + date + '</div></div></div>'
      + (function() {
          var priceWithVat = vatRate > 0 ? price * (1 + vatRate / 100) : price;
          return '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px">'
            + '<div class="kpi"><div class="kpi-l">Food Cost</div><div class="kpi-v">' + cur + cpp.toFixed(2) + '</div></div>'
            + '<div class="kpi" style="background:#1a1a2e;color:#fff;border-color:#1a1a2e"><div class="kpi-l" style="color:rgba(255,255,255,.6)">Sell Price (ex VAT)</div><div class="kpi-v">' + cur + price.toFixed(2) + (isOverride ? ' <span style="font-size:9px;opacity:.7">override</span>' : '') + '</div></div>'
            + '<div class="kpi" style="background:#2d2d5e;color:#fff;border-color:#2d2d5e"><div class="kpi-l" style="color:rgba(255,255,255,.6)">Sell Price (inc VAT' + (vatRate > 0 ? ' ' + vatRate + '%' : '') + ')</div><div class="kpi-v">' + cur + priceWithVat.toFixed(2) + '</div></div>'
            + '<div class="kpi" style="background:#e87c2e;color:#fff;border-color:#e87c2e"><div class="kpi-l" style="color:rgba(255,255,255,.6)">Profit</div><div class="kpi-v">' + cur + profit.toFixed(2) + '</div></div>'
            + '<div class="kpi"><div class="kpi-l">GP%</div><div class="kpi-v" style="color:' + (gpPct >= 70 ? '#059669' : gpPct >= 60 ? '#e87c2e' : '#dc2626') + '">' + gpPct.toFixed(1) + '%</div></div></div>';
        })()
      + '<table><thead><tr><th>Ingredient</th><th style="text-align:right">Qty</th><th style="text-align:right">Cost</th><th style="text-align:right">%</th></tr></thead>'
      + '<tbody>' + ingRows + subRows + '</tbody>'
      + '<tfoot><tr><td colspan="2"><b>Total</b></td><td style="text-align:right"><b>' + cur + totalCost.toFixed(2) + '</b></td><td></td></tr></tfoot></table>'
      + (allergens.length ? '<div style="margin-top:10px;padding:8px 12px;background:#fff7f0;border:1px solid #e87c2e;border-radius:5px;font-size:11px;color:#c85a00"><b>⚠ Allergens:</b> ' + allergens.join(' · ') + '</div>' : '')
      + (function() {
          var n = recipeNutritionTotal(recipe);
          if (!n || (!n.kcal && !n.protein && !n.fat && !n.carbs)) return '';
          return '<div style="margin-top:10px;display:flex;gap:0;border:1px solid #e0e0e8;border-radius:6px;overflow:hidden;font-size:11px">'
            + [['Calories', Math.round(n.kcal) + 'kcal'], ['Protein', n.protein.toFixed(1) + 'g'], ['Fat', n.fat.toFixed(1) + 'g'], ['Carbs', n.carbs.toFixed(1) + 'g'],
               ['Fibre', (n.fibre || 0).toFixed(1) + 'g'], ['Salt', (n.salt || 0).toFixed(2) + 'g']]
              .map(function(pair) {
                return '<div style="flex:1;text-align:center;padding:6px 4px;border-right:1px solid #e0e0e8">'
                  + '<div style="font-size:13px;font-weight:800;color:#1a1a2e">' + pair[1] + '</div>'
                  + '<div style="font-size:8px;text-transform:uppercase;letter-spacing:.5px;color:#999">' + pair[0] + '</div></div>';
              }).join('')
            + '</div>';
        })()
      + '</div>';
  }).join('');

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
    + '*{box-sizing:border-box;margin:0;padding:0} body{font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;font-size:12px;padding:30px 36px}'
    + '.page-break{page-break-after:always;margin-bottom:30px;padding-bottom:20px}'
    + '.page-break:last-child{page-break-after:auto}'
    + '.kpi{border:1px solid #e0e0e8;border-radius:6px;padding:10px 12px}'
    + '.kpi-l{font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:4px}'
    + '.kpi-v{font-size:20px;font-weight:900}'
    + 'table{width:100%;border-collapse:collapse;margin-top:6px}'
    + 'th{text-align:left;padding:5px 8px;background:#f7f7fa;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#888;border-bottom:2px solid #e0e0e8}'
    + 'td{padding:5px 8px;border-bottom:1px solid #f0f0f0;font-size:11px}'
    + 'tfoot td{background:#f7f7fa;border-top:2px solid #e0e0e8}'
    + '@media print{.page-break{page-break-after:always}}'
    + '</style></head><body>'
    + '<div style="text-align:center;margin-bottom:30px;padding-bottom:16px;border-bottom:3px solid #1a1a2e">'
    + '<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#e87c2e;font-weight:700">Full Menu</div>'
    + '<h1 style="font-size:26px;font-weight:900">Recipe Cost Report</h1>'
    + '<div style="font-size:12px;color:#888;margin-top:4px">' + sellable.length + ' recipes · ' + date + ' · Target GP ' + gp + '%</div></div>'
    + pages + '</body></html>';

  browserIPC.exportPDF(html);
}

// ─── Kitchen View ────────────────────────────────────────────────────────────
let _kvRecipeId = null;
let _kvMultiplier = 1;

let _kvStep = 0;

function openKitchenView(recipeId) {
  _kvRecipeId = recipeId;
  const recipe = state.recipes.find((r) => r.id === recipeId);
  if (!recipe) return;
  _kvMultiplier = recipe.portions || 1;
  _kvStep = 0;
  renderKitchenView();
  document.getElementById("kitchen-view-overlay").style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeKitchenView() {
  document.getElementById("kitchen-view-overlay").style.display = "none";
  document.body.style.overflow = "";
}

function kvAdjustPortions(delta) {
  _kvMultiplier = Math.max(1, _kvMultiplier + delta);
  renderKitchenView();
}

function kvStepNav(dir) {
  const recipe = state.recipes.find((r) => r.id === _kvRecipeId);
  if (!recipe) return;
  const steps = recipe.methods || [];
  _kvStep = Math.max(0, Math.min(steps.length - 1, _kvStep + dir));
  renderKvStepPanel(steps);
}

function renderKitchenView() {
  const recipe = state.recipes.find((r) => r.id === _kvRecipeId);
  if (!recipe) return;
  const base = recipe.portions || 1;
  const scale = _kvMultiplier / base;

  document.getElementById("kv-name").textContent = recipe.name;
  const allergens = recipeAllergens(recipe);
  document.getElementById("kv-meta").textContent = [
    recipe.category,
    allergens.length ? "\u26a0 " + allergens.join(", ") : "",
  ]
    .filter(Boolean)
    .join(" \u00b7 ");
  document.getElementById("kv-port-val").textContent = _kvMultiplier;
  document.getElementById("kv-port-base").textContent =
    base !== 1 ? "(base: " + base + ")" : "";

  // Ingredients — qty + name layout
  const ings = (recipe.ingredients || [])
    .map((ri) => {
      const ing = state.ingredients.find((i) => i.id === ri.ingId);
      if (!ing) return "";
      const scaledQty = ri.qty * scale;
      const displayQty =
        scaledQty % 1 === 0
          ? scaledQty.toString()
          : scaledQty.toFixed(2).replace(/\.?0+$/, "");
      const unit = ri.recipeUnit || ing.unit;
      return `<div style="display:flex;align-items:baseline;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:16px;font-weight:700;color:var(--text-primary);min-width:48px;text-align:right;flex-shrink:0">${displayQty}</span>
      <span style="font-size:11px;color:var(--text-muted);min-width:24px;flex-shrink:0">${escHtml(unit)}</span>
      <span style="font-size:13px;color:var(--text-secondary)">${escHtml(ing.name)}</span>
    </div>`;
    })
    .join("");
  document.getElementById("kv-ing-list").innerHTML =
    ings ||
    '<div style="color:var(--text-muted);font-size:13px">No ingredients</div>';

  // Allergens block
  const allergenBlock = document.getElementById("kv-allergen-block");
  if (allergenBlock) {
    allergenBlock.innerHTML = allergens.length
      ? `<div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border)">
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Allergens</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${allergens.map((a) => `<span style="font-size:11px;padding:2px 7px;border-radius:4px;background:var(--red-bg);color:var(--red);border:1px solid rgba(224,92,92,0.2)">${escHtml(a)}</span>`).join("")}
          </div>
        </div>`
      : "";
  }

  // Notes
  const notesWrap = document.getElementById("kv-notes-wrap");
  if (notesWrap)
    notesWrap.innerHTML = recipe.notes
      ? `<div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border)"><div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Notes</div><div style="font-size:13px;color:var(--text-secondary);line-height:1.5">${escHtml(recipe.notes)}</div></div>`
      : "";

  // Step panel
  const steps = recipe.methods || [];
  if (_kvStep >= steps.length && steps.length > 0) _kvStep = 0;
  renderKvStepPanel(steps);
}

function renderKvStepPanel(steps) {
  const total = steps.length;
  const cur = _kvStep;

  const counterEl = document.getElementById("kv-step-counter");
  const dotsEl = document.getElementById("kv-step-dots");
  const numLbl = document.getElementById("kv-step-num-label");
  const textEl = document.getElementById("kv-step-text");
  const listEl = document.getElementById("kv-step-list");
  const prevBtn = document.getElementById("kv-prev-btn");
  const nextBtn = document.getElementById("kv-next-btn");

  if (!total) {
    if (counterEl) counterEl.textContent = "";
    if (dotsEl) dotsEl.innerHTML = "";
    if (numLbl) numLbl.textContent = "";
    if (textEl) textEl.textContent = "No method steps added yet.";
    if (listEl) listEl.innerHTML = "";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) {
      nextBtn.textContent = "No steps";
      nextBtn.disabled = true;
    }
    return;
  }

  if (counterEl) counterEl.textContent = "Step " + (cur + 1) + " of " + total;
  if (dotsEl)
    dotsEl.innerHTML = steps
      .map(
        (_, i) =>
          `<div style="width:7px;height:7px;border-radius:50%;background:${i === cur ? "var(--accent)" : "var(--border-light)"}"></div>`,
      )
      .join("");
  if (numLbl) {
    numLbl.textContent = "Step " + (cur + 1);
    numLbl.style.color = "var(--accent)";
  }
  if (textEl) textEl.textContent = steps[cur];

  if (listEl)
    listEl.innerHTML = steps
      .map((step, i) => {
        const done = i < cur;
        const active = i === cur;
        return `<div style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:5px;font-size:11px;cursor:pointer;${active ? "background:var(--accent-bg);border:1px solid var(--accent-dim)" : "background:transparent;border:1px solid transparent"}"
      onclick="_kvStep=${i};renderKvStepPanel(${JSON.stringify(steps)})">
      <div style="width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;
        background:${done ? "var(--green)" : active ? "var(--accent)" : "var(--bg-card2)"};
        color:${done || active ? "#fff" : "var(--text-muted)"}">${done ? "\u2713" : i + 1}</div>
      <span style="color:${active ? "var(--accent)" : done ? "var(--text-muted)" : "var(--text-secondary)"};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${escHtml(step)}</span>
    </div>`;
      })
      .join("");

  if (prevBtn) {
    prevBtn.disabled = cur === 0;
    prevBtn.style.opacity = cur === 0 ? "0.4" : "1";
  }
  if (nextBtn) {
    if (cur === total - 1) {
      nextBtn.textContent = "\u2713 Done";
      nextBtn.disabled = false;
      nextBtn.onclick = function () {
        closeKitchenView();
      };
    } else {
      nextBtn.textContent = "Next step \u2192";
      nextBtn.disabled = false;
      nextBtn.onclick = function () {
        kvStepNav(1);
      };
    }
  }
}

// ─── Cost Trend Sparkline ─────────────────────────────────────────────────────
function buildCostSparkline(recipe) {
  const hist = (recipe.costHistory || []).slice(-30);
  if (hist.length < 2) return "";
  const vals = hist.map((h) => h.cost);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 0.001;
  const w = 80,
    h = 28,
    pad = 3;
  const pts = vals
    .map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const first = vals[0],
    last = vals[vals.length - 1];
  const trend =
    last > first * 1.02
      ? "var(--red)"
      : last < first * 0.98
        ? "var(--green)"
        : "var(--text-muted)";
  const pct = first > 0 ? ((last - first) / first) * 100 : 0;
  const sign = pct >= 0 ? "+" : "";
  return `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
    <svg width="${w}" height="${h}" style="flex-shrink:0">
      <polyline points="${pts}" fill="none" stroke="${trend}" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="${(pad + ((vals.length - 1) / (vals.length - 1)) * (w - pad * 2)).toFixed(1)}" cy="${(h - pad - ((last - min) / range) * (h - pad * 2)).toFixed(1)}" r="2.5" fill="${trend}"/>
    </svg>
    <div>
      <div style="font-size:11px;font-weight:700;color:${trend}">${sign}${pct.toFixed(1)}% in ${hist.length} days</div>
      <div style="font-size:10px;color:var(--text-muted)">${fmt(first)} → ${fmt(last)} / portion</div>
    </div>
  </div>`;
}

// ─── Multi-Recipe Price Update Wizard ────────────────────────────────────────
function openPriceUpdateWizard(ingId) {
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!ing) return;
  const affected = state.recipes.filter((r) =>
    r.ingredients.some((ri) => ri.ingId === ingId),
  );
  if (!affected.length) {
    showToast("No recipes use this ingredient", "success", 2000);
    return;
  }

  const modal = document.getElementById("price-update-wizard-modal");
  document.getElementById("puw-ing-name").textContent = ing.name;
  document.getElementById("puw-current-cost").textContent =
    `Pack cost: ${fmt(ing.packCost)} · ${ing.packSize}${ing.unit} · ${fmt(costPerUnit(ing))}/${ing.unit}`;
  document.getElementById("puw-new-cost").value = ing.packCost;
  modal.dataset.ingId = ingId;
  modal.classList.remove("hidden");
  renderPriceUpdateWizard();
}

function renderPriceUpdateWizard() {
  const modal = document.getElementById("price-update-wizard-modal");
  const ingId = modal.dataset.ingId;
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!ing) return;
  const newCost =
    parseFloat(document.getElementById("puw-new-cost").value) || ing.packCost;
  const newCPU = newCost / ing.packSize / ((ing.yieldPct || 100) / 100);
  const oldCPU = costPerUnit(ing);
  const diff = newCPU - oldCPU;

  const rows = state.recipes
    .filter((r) => r.ingredients.some((ri) => ri.ingId === ingId))
    .map((recipe) => {
      const ri = recipe.ingredients.find((r) => r.ingId === ingId);
      const oldCPP = recipeTotalCost(recipe) / (recipe.portions || 1);
      const ingChange = diff * (ri.qty || 0);
      const newCPP = oldCPP + ingChange;
      const oldSell =
        recipe.priceOverride || suggestPrice(oldCPP, state.activeGP);
      const oldGP = oldSell > 0 ? ((oldSell - oldCPP) / oldSell) * 100 : 0;
      const newGP = oldSell > 0 ? ((oldSell - newCPP) / oldSell) * 100 : 0;
      const neededSell = suggestPrice(newCPP, state.activeGP);
      const gpDiff = newGP - oldGP;
      const col =
        gpDiff < -1
          ? "var(--red)"
          : gpDiff > 1
            ? "var(--green)"
            : "var(--text-muted)";
      return `<tr>
      <td style="padding:10px 12px;font-weight:600">${escHtml(recipe.name)}</td>
      <td style="padding:10px 12px;text-align:right">${fmt(oldCPP)}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:600">${fmt(newCPP)}</td>
      <td style="padding:10px 12px;text-align:right;color:${col};font-weight:700">${gpDiff >= 0 ? "+" : ""}${gpDiff.toFixed(1)}%</td>
      <td style="padding:10px 12px;text-align:right;color:var(--text-muted)">${fmt(neededSell)}</td>
      <td style="padding:10px 12px;text-align:center">
        <label style="cursor:pointer">
          <input type="checkbox" class="puw-apply-check" data-recipe-id="${recipe.id}" data-new-sell="${neededSell.toFixed(4)}" checked
            style="width:15px;height:15px;accent-color:var(--accent)" />
        </label>
      </td>
    </tr>`;
    })
    .join("");

  document.getElementById("puw-table-body").innerHTML = rows;
}

async function confirmPriceUpdateWizard() {
  const modal = document.getElementById("price-update-wizard-modal");
  const ingId = modal.dataset.ingId;
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!ing) return;
  const newCost = parseFloat(document.getElementById("puw-new-cost").value);
  if (!newCost || newCost <= 0) {
    showToast("Enter a valid new pack cost", "error");
    return;
  }

  // Update ingredient price
  const oldCostPUW = ing.packCost;
  logPriceChange(ing, ing.packCost, newCost);
  ing.packCost = newCost;
  if (!ing.priceHistory) ing.priceHistory = [];
  ing.priceHistory.push({
    date: new Date().toISOString().slice(0, 10),
    packCost: ing.packCost,
    newCost,
  });

  // Apply checked sell price updates
  const checks = modal.querySelectorAll(".puw-apply-check:checked");
  let updated = 0;
  checks.forEach((cb) => {
    const r = state.recipes.find((x) => x.id === cb.dataset.recipeId);
    if (r && !r.locked) {
      r.priceOverride = parseFloat(cb.dataset.newSell);
      updated++;
    }
  });

  save();
  modal.classList.add("hidden");
  renderIngredientLibrary();
  if (state.activeRecipeId) renderRecipeEditor();
  renderSidebarRecipes();
  showToast(
    `✓ Price updated · ${updated} recipe${updated !== 1 ? "s" : ""} repriced`,
    "success",
    2500,
  );
  if (oldCostPUW !== newCost) checkPriceImpact(ing, oldCostPUW, newCost);
}

// ─── Ingredient Substitution ─────────────────────────────────────────────────
function openSubstitutionPanel(ingId) {
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!ing) return;
  document.querySelectorAll(".ing-sub-panel").forEach((p) => p.remove());

  const sameUnit = ["g", "kg", "oz", "lb"].includes(ing.unit)
    ? ["g", "kg", "oz", "lb"]
    : ["ml", "L", "fl_oz"].includes(ing.unit)
      ? ["ml", "L", "fl_oz"]
      : [ing.unit];

  const myCPU = costPerUnit(ing);
  const recipe = getActiveRecipe();
  // Calculate per-portion saving context
  const ri = recipe ? recipe.ingredients.find((x) => x.ingId === ingId) : null;
  const portions = recipe ? (recipe.portions || 1) : 1;

  const subs = state.ingredients
    .filter(
      (x) =>
        x.id !== ingId &&
        sameUnit.includes(x.unit) &&
        x.packSize > 0 &&
        x.packCost > 0,
    )
    .map((x) => {
      const cpu = costPerUnit(x);
      const saving = myCPU > 0 ? ((myCPU - cpu) / myCPU) * 100 : 0;
      const sameCat = x.category === ing.category;
      // Per-portion saving (if ingredient used in current recipe)
      const portionSave = ri ? ((myCPU - cpu) * (ri.qty || 0)) / portions : 0;
      // Nutrition comparison
      const nA = ing.nutrition;
      const nB = x.nutrition;
      let nutrMatch = null;
      if (nA && nB) {
        const diff = Math.abs((nA.kcal || 0) - (nB.kcal || 0));
        nutrMatch = diff < 30 ? "similar" : (nB.kcal || 0) < (nA.kcal || 0) ? "lighter" : "richer";
      }
      return { ing: x, cpu, saving, sameCat, portionSave, nutrMatch, nutrB: nB };
    })
    .filter((x) => x.saving > 0) // only cheaper options
    .sort((a, b) => {
      // Prioritise same category, then by saving
      if (a.sameCat !== b.sameCat) return a.sameCat ? -1 : 1;
      return b.saving - a.saving;
    })
    .slice(0, 6);

  if (!subs.length) {
    showToast("No cheaper alternatives found in library", "success", 2000);
    return;
  }

  const cur = state.currency || "£";
  const panel = document.createElement("div");
  panel.className = "ing-sub-panel";
  panel.style.cssText =
    "position:absolute;left:0;right:0;z-index:200;background:var(--bg-card2);border:1px solid var(--accent);border-radius:var(--radius);padding:12px 14px;margin-top:4px;box-shadow:var(--shadow)";
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.6px;text-transform:uppercase">Cheaper Alternatives for ${escHtml(ing.name)}</div>
      <button onclick="this.closest('.ing-sub-panel').remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:0">✕</button>
    </div>
    ${subs
      .map(
        (s) => {
          const catBadge = s.sameCat
            ? `<span style="font-size:9px;background:var(--blue-bg);color:var(--blue);border:1px solid rgba(91,141,238,.3);padding:1px 5px;border-radius:3px;margin-left:4px">Same category</span>`
            : "";
          const nutrInfo = s.nutrMatch
            ? `<span style="font-size:10px;color:var(--text-muted);margin-left:6px">· ${s.nutrMatch === "similar" ? "≈ similar kcal" : s.nutrMatch === "lighter" ? "↓ fewer kcal" : "↑ more kcal"}</span>`
            : (s.nutrB ? "" : `<span style="font-size:10px;color:var(--text-muted);margin-left:6px">· no nutrition data</span>`);
          const portionHtml = s.portionSave > 0.001
            ? `<div style="font-size:10px;color:var(--green)">Save ${cur}${s.portionSave.toFixed(2)}/portion</div>`
            : "";
          return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${escHtml(s.ing.name)}${catBadge}</div>
          <div style="font-size:11px;color:var(--text-muted)">${escHtml(s.ing.category || "Other")} · ${fmt(s.cpu)}/${s.ing.unit}${nutrInfo}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:13px;font-weight:800;color:var(--green)">−${s.saving.toFixed(0)}%</div>
          ${portionHtml}
        </div>
        <button onclick="swapIngredientInRecipe('${ingId}','${s.ing.id}');this.closest('.ing-sub-panel').remove()"
          style="padding:5px 10px;font-size:11px;font-weight:600;background:var(--green-bg);border:1px solid var(--green);color:var(--green);border-radius:5px;cursor:pointer;white-space:nowrap">
          Swap In
        </button>
      </div>`;
        },
      )
      .join("")}
    <div style="font-size:11px;color:var(--text-muted);margin-top:8px">Same-category matches shown first. Only ingredients in your library with compatible units.</div>`;

  // Find the ingredient row in the recipe table
  const rows = document.querySelectorAll("#recipe-ing-tbody tr");
  if (!recipe) {
    showToast("Open a recipe to use substitutions", "error", 2000);
    return;
  }
  const idx = recipe.ingredients.findIndex((x) => x.ingId === ingId);
  if (idx >= 0 && rows[idx]) {
    rows[idx].style.position = "relative";
    rows[idx].appendChild(panel);
  } else {
    showToast("Ingredient not found in current recipe", "error", 2000);
  }
}

function swapIngredientInRecipe(oldIngId, newIngId) {
  const recipe = getActiveRecipe();
  if (!recipe) return;
  const ri = recipe.ingredients.find((x) => x.ingId === oldIngId);
  if (!ri) return;
  const newIng = state.ingredients.find((i) => i.id === newIngId);
  if (!newIng) return;
  ri.ingId = newIngId;
  ri.recipeUnit = newIng.unit;
  save();
  renderRecipeEditor();
  refreshCostPanel();
  renderSidebarRecipes();
  showToast(`Swapped to ${newIng.name}`, "success", 2000);
}

// ─── Bulk Recategorise ────────────────────────────────────────────────────────
function onIngCheckChange() {
  const checks = document.querySelectorAll(".ing-row-check:checked");
  const bar = document.getElementById("ing-bulk-bar");
  const countEl = document.getElementById("ing-bulk-count");
  if (!bar) return;
  if (checks.length > 0) {
    bar.style.display = "flex";
    countEl.textContent = checks.length + " selected";
    const sel = document.getElementById("ing-bulk-cat");
    const cats = getIngCategories();
    sel.innerHTML = cats
      .map((c) => `<option value="${escHtml(c)}">${escHtml(c)}</option>`)
      .join("");
    const supSel = document.getElementById("ing-bulk-sup");
    if (supSel) {
      supSel.innerHTML =
        '<option value="">— select —</option>' +
        state.suppliers
          .map((s) => `<option value="${s.id}">${escHtml(s.name)}</option>`)
          .join("");
    }
  } else {
    bar.style.display = "none";
  }
  const all = document.querySelectorAll(".ing-row-check");
  const checkAll = document.getElementById("ing-check-all");
  if (checkAll)
    checkAll.checked = all.length > 0 && checks.length === all.length;
}

function toggleAllIngChecks(checked) {
  document.querySelectorAll(".ing-row-check").forEach((cb) => {
    cb.checked = checked;
  });
  onIngCheckChange();
}

function clearIngSelection() {
  document.querySelectorAll(".ing-row-check").forEach((cb) => {
    cb.checked = false;
  });
  const checkAll = document.getElementById("ing-check-all");
  if (checkAll) checkAll.checked = false;
  const bar = document.getElementById("ing-bulk-bar");
  if (bar) bar.style.display = "none";
}

function applyBulkRecategorise() {
  const checks = document.querySelectorAll(".ing-row-check:checked");
  const newCat = document.getElementById("ing-bulk-cat")?.value;
  if (!checks.length || !newCat) return;
  const ids = [...checks].map((cb) => cb.dataset.id);
  ids.forEach((id) => {
    const ing = state.ingredients.find((i) => i.id === id);
    if (ing) ing.category = newCat;
  });
  save();
  clearIngSelection();
  renderIngredientLibrary();
  showToast(
    `✓ ${ids.length} ingredient${ids.length !== 1 ? "s" : ""} moved to "${newCat}"`,
    "success",
    2000,
  );
}

function applyBulkSupplier() {
  const checks = document.querySelectorAll(".ing-row-check:checked");
  const supId = document.getElementById("ing-bulk-sup")?.value;
  if (!checks.length || !supId) {
    showToast("Select a supplier first", "error", 2000);
    return;
  }
  const ids = [...checks].map((cb) => cb.dataset.id);
  ids.forEach((id) => {
    const ing = state.ingredients.find((i) => i.id === id);
    if (ing) ing.supplierId = supId;
  });
  save();
  clearIngSelection();
  renderIngredientLibrary();
  const supName =
    state.suppliers.find((s) => s.id === supId)?.name || "supplier";
  showToast(
    `✓ ${ids.length} ingredient${ids.length !== 1 ? "s" : ""} assigned to ${supName}`,
    "success",
    2500,
  );
}

// ─── Paste Method ─────────────────────────────────────────────────────────────
function openPasteMethodModal() {
  document.getElementById("paste-method-input").value = "";
  document.getElementById("paste-method-preview").style.display = "none";
  document.getElementById("paste-method-confirm").disabled = true;
  document.getElementById("paste-method-modal").classList.remove("hidden");
  setTimeout(() => document.getElementById("paste-method-input").focus(), 100);
}

function parsePastedMethod(text) {
  if (!text.trim()) return [];
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const numbered = /^(\d+[\.\)]\s*|[-•*]\s+)/;
  const steps = [];
  let current = "";
  for (const line of lines) {
    if (numbered.test(line)) {
      if (current.trim()) steps.push(current.trim());
      current = line.replace(/^(\d+[\.\)]\s*|[-•*]\s+)/, "");
    } else if (current) {
      current += " " + line;
    } else {
      steps.push(line);
    }
  }
  if (current.trim()) steps.push(current.trim());
  if (steps.length === 0) return lines;
  return steps.filter((s) => s.length > 0);
}

function previewPasteMethod() {
  const text = document.getElementById("paste-method-input").value;
  const steps = parsePastedMethod(text);
  const preview = document.getElementById("paste-method-preview");
  const stepsEl = document.getElementById("paste-method-steps-preview");
  const label = document.getElementById("paste-method-preview-label");
  const btn = document.getElementById("paste-method-confirm");
  if (!steps.length) {
    preview.style.display = "none";
    btn.disabled = true;
    return;
  }
  label.textContent = `${steps.length} step${steps.length !== 1 ? "s" : ""} detected`;
  stepsEl.innerHTML = steps
    .map(
      (s, i) => `
    <div style="display:flex;gap:10px;align-items:flex-start;padding:6px 10px;background:var(--bg-card2);border-radius:5px">
      <span style="width:20px;height:20px;border-radius:50%;background:var(--accent);color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">${i + 1}</span>
      <span style="font-size:13px;color:var(--text-primary);line-height:1.5">${escHtml(s)}</span>
    </div>`,
    )
    .join("");
  preview.style.display = "flex";
  btn.disabled = false;
}

function confirmPasteMethod() {
  const text = document.getElementById("paste-method-input").value;
  const steps = parsePastedMethod(text);
  if (!steps.length) return;
  const recipe = getActiveRecipe();
  if (!recipe) return;
  if (!recipe.methods) recipe.methods = [];
  if (recipe.methods.length === 0) {
    recipe.methods = steps;
  } else {
    recipe.methods.push(...steps);
  }
  save();
  document.getElementById("paste-method-modal").classList.add("hidden");
  renderRecipeEditor();
  const body = document.getElementById("recipe-notes-body");
  if (body) body.style.display = "";
  showToast(
    `✓ ${steps.length} step${steps.length !== 1 ? "s" : ""} added`,
    "success",
    1800,
  );
}

// ─── Photo Drag & Drop ───────────────────────────────────────────────────────
async function handlePhotoDrop(e, recipeId) {
  e.preventDefault();
  const zone = e.currentTarget;
  zone.classList.remove("drag-over");
  const file = e.dataTransfer?.files?.[0];
  if (!file || !file.type.startsWith("image/")) {
    showToast("Please drop an image file", "error", 2000);
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    const recipe = state.recipes.find((r) => r.id === recipeId);
    if (!recipe) return;
    recipe.photo = ev.target.result;
    save();
    renderRecipeEditor();
    showToast("✓ Photo added", "success", 1500);
  };
  reader.readAsDataURL(file);
}

// ─── AI Auto-Categorise ──────────────────────────────────────────────────────
let _aiCatSuggestions = []; // [{id, name, currentCat, suggestedCat}]

function openAiCategoriseModal() {
  if (!getActiveKey()) {
    showToast("Add an AI API key in Settings first", "error", 3000);
    return;
  }
  const modal = document.getElementById("ai-categorise-modal");
  document.getElementById("ai-cat-other-count").textContent =
    state.ingredients.filter((i) => i.category === "Other").length;
  document.getElementById("ai-cat-all-count").textContent =
    state.ingredients.length;
  document.getElementById("ai-cat-status").style.display = "none";
  document.getElementById("ai-cat-results").style.display = "none";
  document.getElementById("ai-cat-run-btn").style.display = "";
  document.getElementById("ai-cat-apply-btn").style.display = "none";
  document.getElementById("ai-cat-subtitle").textContent =
    "Sends ingredient names to AI — get back suggested categories in bulk";
  _aiCatSuggestions = [];
  modal.classList.remove("hidden");
}

function updateAiCatScope() {
  document.getElementById("ai-cat-results").style.display = "none";
  document.getElementById("ai-cat-run-btn").style.display = "";
  document.getElementById("ai-cat-apply-btn").style.display = "none";
}

async function runAiCategorise() {
  const scope =
    document.querySelector('input[name="ai-cat-scope"]:checked')?.value ||
    "other";
  const ings =
    scope === "other"
      ? state.ingredients.filter((i) => i.category === "Other")
      : state.ingredients;

  if (!ings.length) {
    showToast("No ingredients to categorise", "error", 2000);
    return;
  }

  const statusEl = document.getElementById("ai-cat-status");
  const runBtn = document.getElementById("ai-cat-run-btn");
  runBtn.disabled = true;
  runBtn.textContent = "⏳ Running…";
  statusEl.style.display = "block";
  statusEl.textContent = `Sending ${ings.length} ingredients to AI in batches…`;

  const existingCats = [
    "Bakery",
    "Dairy",
    "Dry Goods",
    "Fish & Seafood",
    "Herbs & Spices",
    "Meat & Poultry",
    "Oils & Condiments",
    "Vegetables",
    "Other",
    ...(state.ingCategories || []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const BATCH = 60;
  _aiCatSuggestions = [];
  let processed = 0;

  try {
    for (let i = 0; i < ings.length; i += BATCH) {
      const batch = ings.slice(i, i + BATCH);
      statusEl.textContent = `Processing ${processed + batch.length} / ${ings.length} ingredients…`;

      const prompt = `You are a food & beverage inventory categorisation assistant.
Categorise each ingredient into exactly one of these categories: ${existingCats.join(", ")}.
Respond ONLY with a JSON array, no markdown, no explanation.
Each element: {"name": "<exact ingredient name>", "category": "<category>"}

Ingredients to categorise:
${batch.map((x) => x.name).join("\n")}`;

      const raw = await callGeminiText(prompt);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = [];
      }

      parsed.forEach((item) => {
        const ing = batch.find((x) => x.name === item.name);
        if (ing && item.category && item.category !== ing.category) {
          _aiCatSuggestions.push({
            id: ing.id,
            name: ing.name,
            currentCat: ing.category,
            suggestedCat: item.category,
          });
        }
      });
      processed += batch.length;
    }

    renderAiCatResults();
    statusEl.style.display = "none";
    runBtn.disabled = false;
    runBtn.textContent = "✨ Run AI";
    runBtn.style.display = "none";
    document.getElementById("ai-cat-apply-btn").style.display = "";
  } catch (err) {
    statusEl.textContent = "⚠ Error: " + err.message;
    statusEl.style.background = "rgba(239,68,68,0.1)";
    statusEl.style.borderColor = "var(--red)";
    statusEl.style.color = "var(--red)";
    runBtn.disabled = false;
    runBtn.textContent = "✨ Run AI";
  }
}

function renderAiCatResults() {
  const listEl = document.getElementById("ai-cat-list");
  const label = document.getElementById("ai-cat-results-label");
  const resultsEl = document.getElementById("ai-cat-results");

  if (!_aiCatSuggestions.length) {
    listEl.innerHTML =
      '<div style="color:var(--green);font-size:13px;padding:12px 0">✓ All ingredients already have good categories — no changes suggested.</div>';
    label.textContent = "No changes needed";
    resultsEl.style.display = "block";
    return;
  }

  label.textContent = `${_aiCatSuggestions.length} suggested changes — tick to apply`;
  listEl.innerHTML = _aiCatSuggestions
    .map(
      (s, i) => `
    <label style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:var(--bg-card2);border-radius:5px;cursor:pointer;border:1px solid transparent"
      onmouseover="this.style.borderColor='var(--border)'" onmouseout="this.style.borderColor='transparent'">
      <input type="checkbox" class="ai-cat-check" data-idx="${i}" checked style="width:14px;height:14px;accent-color:var(--accent);flex-shrink:0" />
      <span style="flex:1;font-size:13px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(s.name)}</span>
      <span style="font-size:11px;color:var(--text-muted);flex-shrink:0">${escHtml(s.currentCat)}</span>
      <span style="font-size:11px;color:var(--text-muted);flex-shrink:0">→</span>
      <span style="font-size:11px;font-weight:700;color:var(--accent);flex-shrink:0">${escHtml(s.suggestedCat)}</span>
    </label>`,
    )
    .join("");
  resultsEl.style.display = "block";
}

function aiCatSelectAll(checked) {
  document.querySelectorAll(".ai-cat-check").forEach((cb) => {
    cb.checked = checked;
  });
}

function applyAiCategories() {
  const checks = document.querySelectorAll(".ai-cat-check:checked");
  let count = 0;
  checks.forEach((cb) => {
    const idx = parseInt(cb.dataset.idx);
    const s = _aiCatSuggestions[idx];
    if (!s) return;
    const ing = state.ingredients.find((i) => i.id === s.id);
    if (ing) {
      ing.category = s.suggestedCat;
      count++;
    }
  });
  save();
  document.getElementById("ai-categorise-modal").classList.add("hidden");
  renderIngredientLibrary();
  showToast(
    `✓ ${count} ingredient${count !== 1 ? "s" : ""} recategorised`,
    "success",
    2500,
  );
}

function openMenuModal() {
  document.getElementById("menu-gp-input").value = state.activeGP;
  // Populate category checkboxes from current categories (only those with recipes)
  // Build list from registered categories (ordered) + any unregistered ones found in recipes
  const registeredCats = getRecipeCategories();
  const recipeCats = [
    ...new Set(state.recipes.map((r) => r.category).filter(Boolean)),
  ];
  // Registered ones first (in order), then any extras not in the registered list
  const cats = [
    ...registeredCats.filter((c) => recipeCats.includes(c)),
    ...recipeCats.filter((c) => !registeredCats.includes(c)),
  ];
  const wrap = document.getElementById("menu-cat-checkboxes");
  if (wrap) {
    wrap.innerHTML = cats
      .map((c) => {
        const count = state.recipes.filter((r) => r.category === c).length;
        return `<label style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" class="menu-cat-check" value="${escHtml(c)}" checked />
        ${escHtml(c)} <span style="color:var(--text-muted);font-size:11px">${count} recipe${count !== 1 ? "s" : ""}</span>
      </label>`;
      })
      .join("");
    if (!cats.length)
      wrap.innerHTML =
        '<div style="color:var(--text-muted);font-size:12px">No recipes with categories yet</div>';
  }
  document.getElementById("menu-modal").classList.remove("hidden");
}

function menuCatSelectAll(checked) {
  document
    .querySelectorAll(".menu-cat-check")
    .forEach((cb) => (cb.checked = checked));
}

function exportMenuPDF() {
  const title = document.getElementById("menu-title-input").value || "Our Menu";
  const selectedCats = new Set(
    [...document.querySelectorAll(".menu-cat-check:checked")].map(
      (cb) => cb.value,
    ),
  );
  const gp =
    parseFloat(document.getElementById("menu-gp-input").value) ||
    state.activeGP;
  const priceMode =
    document.querySelector('input[name="menu-price-mode"]:checked')?.value ||
    "keep-override";
  const showCost = document.getElementById("menu-show-cost").checked;
  const showAllergens = document.getElementById("menu-show-allergens").checked;
  const date = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  let recipes = state.recipes;
  if (selectedCats.size > 0)
    recipes = recipes.filter((r) => selectedCats.has(r.category));
  if (priceMode === "saved-only")
    recipes = recipes.filter((r) => r.priceOverride && r.priceOverride > 0);

  // Build ordered category map — follow custom category order, only selected
  // Also include any recipe categories not in the registered list
  const registeredOrder = getRecipeCategories();
  const allRecipeCats = [
    ...new Set(recipes.map((r) => r.category).filter(Boolean)),
  ];
  const catOrder = [
    ...registeredOrder.filter((c) => allRecipeCats.includes(c)),
    ...allRecipeCats.filter((c) => !registeredOrder.includes(c)),
  ].filter((c) => selectedCats.size === 0 || selectedCats.has(c));
  const byCategory = {};
  catOrder.forEach((c) => {
    byCategory[c] = [];
  });
  recipes.forEach((r) => {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  });
  // Remove empty categories
  Object.keys(byCategory).forEach((k) => {
    if (!byCategory[k].length) delete byCategory[k];
  });

  let sectionsHtml = "";
  for (const [cat, recs] of Object.entries(byCategory)) {
    sectionsHtml += `<div class="menu-section">
      <h2 class="menu-cat">${cat}</h2>
      ${recs
        .map((r) => {
          const cost = recipeTotalCost(r) / (r.portions || 1);
          const price =
            priceMode === "recalc-all"
              ? suggestPrice(cost, gp)
              : r.priceOverride && r.priceOverride > 0
                ? r.priceOverride
                : suggestPrice(cost, gp);
          const allergens = recipeAllergens(r);
          const vatInc = price * (1 + (state.vatRate || 0) / 100);
          const displayPrice = state.vatRate > 0 ? vatInc : price;
          return `<div class="menu-item">
          <div class="menu-item-left">
            <div class="menu-item-name">${escHtml(r.name)}</div>
            ${r.notes ? `<div class="menu-item-desc">${escHtml(r.notes)}</div>` : ""}
            ${showAllergens && allergens.length ? `<div class="menu-item-allergens">Contains: ${allergens.join(" · ")}</div>` : ""}
            ${showCost ? `<div class="menu-item-cost">Cost: ${fmt(cost)} · GP: ${gp}% · Profit: ${fmt(price - cost)}</div>` : ""}
          </div>
          <div class="menu-item-right">
            <div class="menu-item-price">${fmt(displayPrice)}</div>

          </div>
        </div>`;
        })
        .join("")}
    </div>`;
  }

  const cur = state.currency || "£";
  const vatRate = state.vatRate || 0;
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Lato:wght@300;400;700&display=swap');
  body{font-family:'Lato',Georgia,serif;color:#1a1a2e;background:#fffef9;padding:50px 60px;max-width:860px;margin:0 auto}
  .menu-header{text-align:center;padding-bottom:28px;margin-bottom:36px;position:relative}
  .menu-header::after{content:'';display:block;width:80px;height:3px;background:#c8a96e;margin:14px auto 0}
  .menu-header h1{font-family:'Playfair Display','Georgia',serif;font-size:42px;font-weight:900;letter-spacing:1px;color:#1a1a2e;line-height:1.1}
  .menu-header .subtitle{font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#888;margin-top:10px;font-weight:300}
  .menu-section{margin-bottom:36px;break-inside:avoid}
  .menu-cat{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:3px;color:#c8a96e;margin-bottom:16px;display:flex;align-items:center;gap:12px}
  .menu-cat::before,.menu-cat::after{content:'';flex:1;height:1px;background:#e8e0d0}
  .menu-item{padding:14px 0;border-bottom:1px solid #f0ece4;display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
  .menu-item:last-child{border-bottom:none}
  .menu-item-left{flex:1}
  .menu-item-name{font-size:16px;font-weight:700;color:#1a1a2e;font-family:'Playfair Display','Georgia',serif}
  .menu-item-desc{font-size:12px;color:#777;margin-top:4px;line-height:1.5;font-style:italic}
  .menu-item-allergens{font-size:10px;color:#c85a00;margin-top:5px;font-style:normal;letter-spacing:.3px}
  .menu-item-cost{font-size:10px;color:#aaa;margin-top:3px}
  .menu-item-right{text-align:right;flex-shrink:0}
  .menu-item-price{font-size:18px;font-weight:700;color:#1a1a2e;font-family:'Playfair Display','Georgia',serif}
  .menu-item-vat{font-size:10px;color:#aaa;margin-top:2px}
  .footer{margin-top:40px;font-size:10px;color:#ccc;text-align:center;border-top:1px solid #e8e0d0;padding-top:14px;letter-spacing:.5px}
  @media print{body{padding:30px 40px}@page{margin:15mm}}
</style>
</head><body>
  <div class="menu-header">
    <h1>${escHtml(title)}</h1>
    <div class="subtitle">${date}</div>
  </div>
  ${sectionsHtml}
  <div class="footer">All prices ${showCost ? "at " + gp + "% GP · " : ""}${vatRate > 0 ? "inc. " + vatRate + "% VAT · " : ""}Please inform us of any allergies or dietary requirements</div>
</body></html>`;

  document.getElementById("menu-modal").classList.add("hidden");
  browserIPC.exportPDF(html);
}

// ─── Menu Excel Export ────────────────────────────────────────
async function exportMenuExcel() {
  const title = document.getElementById("menu-title-input").value || "Our Menu";
  const selectedCats = new Set(
    [...document.querySelectorAll(".menu-cat-check:checked")].map(
      (cb) => cb.value,
    ),
  );
  const gp =
    parseFloat(document.getElementById("menu-gp-input").value) ||
    state.activeGP;
  const priceMode =
    document.querySelector('input[name="menu-price-mode"]:checked')?.value ||
    "keep-override";
  const showCost = document.getElementById("menu-show-cost").checked;
  const showAllergens = document.getElementById("menu-show-allergens").checked;
  const vatRate = state.vatRate || 0;
  const cur = state.currency || "£";

  let recipes = state.recipes;
  if (selectedCats.size > 0)
    recipes = recipes.filter((r) => selectedCats.has(r.category));
  if (priceMode === "saved-only")
    recipes = recipes.filter((r) => r.priceOverride && r.priceOverride > 0);

  const registeredOrder = getRecipeCategories();
  const allRecipeCats = [
    ...new Set(recipes.map((r) => r.category).filter(Boolean)),
  ];
  const catOrder = [
    ...registeredOrder.filter((c) => allRecipeCats.includes(c)),
    ...allRecipeCats.filter((c) => !registeredOrder.includes(c)),
  ].filter((c) => selectedCats.size === 0 || selectedCats.has(c));

  let wb = XLSX.utils.book_new();
  const rows = [];

  // Title row
  rows.push([title]);
  rows.push([
    "Generated: " +
      new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
  ]);
  rows.push([]);

  // Headers
  const headers = ["Category", "Recipe", "Description / Notes"];
  if (showCost) headers.push("Cost/Portion", "GP %", "Profit");
  headers.push("Sell Price" + (vatRate > 0 ? " (ex VAT)" : ""));
  if (vatRate > 0) headers.push("Sell Price (inc VAT)");
  if (showAllergens) headers.push("Allergens");
  rows.push(headers);

  const headerRowIdx = rows.length; // 1-based for xlsx

  for (const cat of catOrder) {
    const catRecipes = recipes.filter((r) => r.category === cat);
    if (!catRecipes.length) continue;
    // Category separator row
    rows.push([cat]);
    const catRowIdx = rows.length;

    for (const r of catRecipes) {
      const cost = recipeTotalCost(r) / (r.portions || 1);
      const price =
        priceMode === "recalc-all"
          ? suggestPrice(cost, gp)
          : r.priceOverride && r.priceOverride > 0
            ? r.priceOverride
            : suggestPrice(cost, gp);
      const actualGP = price > 0 ? ((price - cost) / price) * 100 : 0;
      const profit = price - cost;
      const priceIncVat = price * (1 + vatRate / 100);
      const allergens = recipeAllergens(r);

      const row = [cat, r.name, r.notes || ""];
      if (showCost)
        row.push(
          Math.round(cost * 100) / 100,
          Math.round(actualGP * 10) / 10,
          Math.round(profit * 100) / 100,
        );
      row.push(Math.round(price * 100) / 100);
      if (vatRate > 0) row.push(Math.round(priceIncVat * 100) / 100);
      if (showAllergens) row.push(allergens.join(", ") || "None");
      rows.push(row);
    }
    rows.push([]); // spacer between categories
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  const colWidths = [{ wch: 16 }, { wch: 28 }, { wch: 36 }];
  if (showCost) colWidths.push({ wch: 12 }, { wch: 8 }, { wch: 10 });
  colWidths.push({ wch: 14 });
  if (vatRate > 0) colWidths.push({ wch: 16 });
  if (showAllergens) colWidths.push({ wch: 40 });
  ws["!cols"] = colWidths;

  // Style title rows (bold via special cell values aren't supported in SheetJS CE —
  // but we can mark them for the user to see structure clearly)
  // Freeze header row
  ws["!freeze"] = { xSplit: 0, ySplit: headerRowIdx };

  wb = XLSX.utils.book_append_sheet(wb, ws, "Menu");

  // Summary sheet — totals by category
  const summaryRows = [["Menu Summary — " + title], []];
  summaryRows.push([
    "Category",
    "Items",
    "Avg Sell Price",
    "Avg Cost",
    "Avg GP %",
  ]);
  for (const cat of catOrder) {
    const catRecipes = recipes.filter((r) => r.category === cat);
    if (!catRecipes.length) continue;
    const prices = catRecipes.map((r) => {
      const cost = recipeTotalCost(r) / (r.portions || 1);
      return priceMode === "recalc-all"
        ? suggestPrice(cost, gp)
        : r.priceOverride && r.priceOverride > 0
          ? r.priceOverride
          : suggestPrice(cost, gp);
    });
    const costs = catRecipes.map((r) => recipeTotalCost(r) / (r.portions || 1));
    const avgPrice = prices.reduce((s, v) => s + v, 0) / prices.length;
    const avgCost = costs.reduce((s, v) => s + v, 0) / costs.length;
    const avgGP = avgPrice > 0 ? ((avgPrice - avgCost) / avgPrice) * 100 : 0;
    summaryRows.push([
      cat,
      catRecipes.length,
      Math.round(avgPrice * 100) / 100,
      Math.round(avgCost * 100) / 100,
      Math.round(avgGP * 10) / 10,
    ]);
  }
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [
    { wch: 18 },
    { wch: 8 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
  ];
  wb = XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  await browserIPC.saveExcel(
    buf,
    title.replace(/[^a-zA-Z0-9 ]/g, "_") + "_Menu.xlsx",
  );
  document.getElementById("menu-modal").classList.add("hidden");
  showToast("✓ Menu exported to Excel", "success", 2000);
}

// ─── Recipe Cost Sheet PDF ─────────────────────────────────────
function printRecipe(id) {
  const recipe = state.recipes.find((r) => r.id === id);
  if (!recipe) return;
  if (!recipe.category) {
    showToast("Please select a category before exporting", "error", 3000);
    return;
  }
  const totalCost = recipeTotalCost(recipe);
  const portions = recipe.portions || 1;
  const costPerPortion = totalCost / portions;
  const gp = state.activeGP;
  const sugPrice = suggestPrice(costPerPortion, gp);
  const profit = sugPrice - costPerPortion;
  const vatRate = state.vatRate || 0;
  const vatInclPrice = sugPrice * (1 + vatRate / 100);
  const allergens = recipeAllergens(recipe);
  const date = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const scale = recipe.scale || 1;
  const cur = state.currency || "£";

  // Cost drivers (top 4)
  const drivers = recipe.ingredients
    .map((ri) => ({
      ing: state.ingredients.find((i) => i.id === ri.ingId),
      cost: ingLineCost(ri.ingId, ri.qty, ri.recipeUnit),
    }))
    .filter((d) => d.ing && d.cost > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  const ingRows = recipe.ingredients
    .map((ri) => {
      const ing = state.ingredients.find((i) => i.id === ri.ingId);
      if (!ing) return "";
      const cost = ingLineCost(ri.ingId, ri.qty, ri.recipeUnit);
      const pct = totalCost > 0 ? ((cost / totalCost) * 100).toFixed(0) : 0;
      const sup = state.suppliers.find((s) => s.id === ing.supplierId);
      return `<tr>
      <td>${escHtml(ing.name)}${sup ? `<span style="font-size:10px;color:#888;margin-left:6px">${escHtml(sup.name)}</span>` : ""}</td>
      <td style="text-align:right">${ri.qty}${scale !== 1 ? `<em style="color:#aaa;font-size:11px"> ×${scale}=${(ri.qty * scale).toFixed(1)}</em>` : ""} ${ing.unit}</td>
      <td style="text-align:right">${fmt(costPerUnit(ing))}/${ing.unit}</td>
      <td style="text-align:right;font-weight:600">${fmt(cost)}</td>
      <td style="text-align:right;color:#888;font-size:11px">${pct}%</td>
    </tr>`;
    })
    .join("");

  // GP table rows
  const gpRows = [60, 65, 70, 72, 75, 78, 80]
    .map((g) => {
      const p = suggestPrice(costPerPortion, g);
      const pr = p - costPerPortion;
      return `<tr style="${g === gp ? "background:#1a1a2e;color:white" : ""}">
      <td style="text-align:center;font-weight:${g === gp ? "800" : "600"}">${g}%</td>
      <td style="text-align:right">${cur}${p.toFixed(2)}</td>
      <td style="text-align:right;${g === gp ? "" : "color:#27ae60"}">${cur}${pr.toFixed(2)}</td>
      ${vatRate > 0 ? `<td style="text-align:right;color:${g === gp ? "rgba(255,255,255,.7)" : "#888"};font-size:11px">${cur}${(p * (1 + vatRate / 100)).toFixed(2)}</td>` : ""}
    </tr>`;
    })
    .join("");

  // Cost driver bars
  const driverBars = drivers
    .map((d) => {
      const pct = totalCost > 0 ? (d.cost / totalCost) * 100 : 0;
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
      <div style="width:130px;font-size:11px;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(d.ing.name)}</div>
      <div style="flex:1;height:6px;background:#f0f0f0;border-radius:3px"><div style="width:${pct.toFixed(0)}%;height:100%;background:#1a1a2e;border-radius:3px"></div></div>
      <div style="width:35px;text-align:right;font-size:11px;color:#888">${pct.toFixed(0)}%</div>
      <div style="width:50px;text-align:right;font-size:11px;font-weight:600">${fmt(d.cost)}</div>
    </div>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a2e;font-size:13px;padding:36px 40px;max-width:900px;margin:0 auto}
  /* Header */
  .rpt-header{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:14px;margin-bottom:24px;border-bottom:3px solid #1a1a2e}
  .rpt-title-block .label{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#e87c2e;font-weight:700;margin-bottom:4px}
  .rpt-title-block h1{font-size:28px;font-weight:900;letter-spacing:-.3px}
  .rpt-title-block .sub{font-size:13px;color:#666;margin-top:5px}
  .rpt-meta{text-align:right;font-size:12px;color:#888;line-height:1.9}
  .rpt-meta strong{color:#1a1a2e}
  /* KPI boxes */
  .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px}
  .kpi{border:1px solid #e0e0e8;border-radius:8px;padding:14px 16px}
  .kpi.primary{background:#1a1a2e;color:white;border-color:#1a1a2e}
  .kpi.accent{background:#e87c2e;color:white;border-color:#e87c2e}
  .kpi .label{font-size:9px;letter-spacing:1.5px;text-transform:uppercase;opacity:.6;margin-bottom:6px}
  .kpi .value{font-size:26px;font-weight:900;line-height:1}
  .kpi .hint{font-size:11px;opacity:.65;margin-top:5px}
  /* Two-column layout */
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:20px}
  /* Section titles */
  .section-title{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#888;font-weight:700;margin-bottom:10px;padding-bottom:5px;border-bottom:1px solid #eee}
  /* Ingredient table */
  table{width:100%;border-collapse:collapse}
  th{text-align:left;padding:7px 10px;background:#f7f7fa;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#888;border-bottom:2px solid #e0e0e8}
  td{padding:7px 10px;border-bottom:1px solid #f0f0f0;font-size:12.5px;vertical-align:middle}
  tr:last-child td{border-bottom:none}
  tfoot td{background:#f7f7fa;font-weight:700;border-top:2px solid #e0e0e8}
  /* GP table */
  .gp-table td{padding:6px 10px;font-size:12px}
  .gp-table tr.active td{border-radius:0}
  /* Allergen box */
  .allergen-box{background:#fff7f0;border:1px solid #e87c2e;border-radius:6px;padding:10px 14px;font-size:12px;color:#c85a00;margin-top:16px}
  /* Notes */
  .notes-box{border:1px solid #e0e0e8;border-radius:6px;padding:12px 14px;background:#fafafa;margin-top:12px;font-size:12.5px;color:#555;line-height:1.6}
  /* Footer */
  .rpt-footer{margin-top:32px;font-size:10px;color:#ccc;border-top:1px solid #eee;padding-top:10px;display:flex;justify-content:space-between}
</style></head><body>

  <div class="rpt-header">
    <div class="rpt-title-block">
      <div class="label">Recipe Costing Report</div>
      <h1>${escHtml(recipe.name)}</h1>
      <div class="sub">${escHtml(recipe.category)} · ${portions} portion${portions !== 1 ? "s" : ""}${scale !== 1 ? ` · Scale ×${scale}` : ""}${recipe.tags && recipe.tags.length ? ` · ${recipe.tags.join(", ")}` : ""}${recipe.locked ? " · 🔒 Locked" : ""}</div>
    </div>
    <div class="rpt-meta">
      <div><strong>Date</strong> ${date}</div>
      <div><strong>Target GP</strong> ${gp}%</div>
      ${vatRate > 0 ? `<div><strong>VAT</strong> ${vatRate}%</div>` : ""}
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi">
      <div class="label">Food Cost / Portion</div>
      <div class="value">${cur}${costPerPortion.toFixed(2)}</div>
      <div class="hint">${portions} portion${portions !== 1 ? "s" : ""} · total ${cur}${totalCost.toFixed(2)}</div>
    </div>
    <div class="kpi primary">
      <div class="label">Sell Price (ex. VAT)</div>
      <div class="value">${cur}${sugPrice.toFixed(2)}</div>
      <div class="hint">at ${gp}% GP</div>
    </div>
    <div class="kpi accent">
      <div class="label">Profit / Portion</div>
      <div class="value">${cur}${profit.toFixed(2)}</div>
      <div class="hint">${cur}${(profit * portions).toFixed(2)} for ${portions} portion${portions !== 1 ? "s" : ""}</div>
    </div>
    ${
      vatRate > 0
        ? `<div class="kpi">
      <div class="label">Price inc. ${vatRate}% VAT</div>
      <div class="value">${cur}${vatInclPrice.toFixed(2)}</div>
      <div class="hint">Menu price inc. tax</div>
    </div>`
        : `<div class="kpi">
      <div class="label">Food Cost %</div>
      <div class="value">${(100 - gp).toFixed(0)}%</div>
      <div class="hint">of sell price is food cost</div>
    </div>`
    }
  </div>

  <div style="margin-bottom:20px">
    <div class="section-title">Ingredient Breakdown</div>
    <table>
      <thead><tr><th>Ingredient</th><th style="text-align:right">Quantity</th><th style="text-align:right">Unit Cost</th><th style="text-align:right">Line Cost</th><th style="text-align:right">% of Total</th></tr></thead>
      <tbody>${ingRows}</tbody>
      <tfoot><tr>
        <td colspan="3">Total Recipe Cost</td>
        <td style="text-align:right">${cur}${totalCost.toFixed(2)}</td>
        <td style="text-align:right">100%</td>
      </tr></tfoot>
    </table>
  </div>

  <div class="two-col">
    <div>
      <div class="section-title">GP% Pricing Table</div>
      <table class="gp-table">
        <thead><tr><th style="text-align:center">GP%</th><th style="text-align:right">Sell Price</th><th style="text-align:right">Profit/Portion</th>${vatRate > 0 ? `<th style="text-align:right">Inc. VAT</th>` : ""}</tr></thead>
        <tbody>${gpRows}</tbody>
      </table>
    </div>
    <div>
      <div class="section-title">Top Cost Drivers</div>
      ${driverBars || '<div style="color:#aaa;font-size:12px">No ingredients</div>'}
      ${
        allergens.length
          ? `
      <div class="allergen-box" style="margin-top:14px">
        <strong>⚠ Allergens:</strong> ${allergens.map((a) => escHtml(a)).join(" · ")}
      </div>`
          : ""
      }
    </div>
  </div>

  ${recipe.notes ? `<div class="notes-box"><strong>Method / Notes:</strong><br>${escHtml(recipe.notes)}</div>` : ""}

  <div class="rpt-footer">
    <span>Recipe Costing App · Confidential</span>
    <span>Generated ${date}</span>
  </div>
</body></html>`;

  browserIPC.exportPDF(html);
}

// ─── Export All Recipes Excel ──────────────────────────────────
async function exportAllRecipesExcel() {
  try {
    // Build all sheet data first (no contextBridge calls yet)
    const sheets = [];

    // Sheet 1: Summary
    sheets.push({
      name: "Summary",
      cols: [
        { wch: 28 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
        { wch: 14 }, { wch: 18 }, { wch: 8  }, { wch: 40 },
      ],
      rows: [
        [
          "Recipe Name", "Category", "Portions", "Total Cost",
          "Cost/Portion", `Sell Price (${state.activeGP}% GP)`, "GP%", "Allergens",
        ],
        ...state.recipes.map((r) => {
          const total = recipeTotalCost(r);
          const cpp   = total / (r.portions || 1);
          const price = suggestPrice(cpp, state.activeGP);
          const gp    = price > 0 ? ((price - cpp) / price) * 100 : 0;
          return [
            r.name, r.category, r.portions,
            +total.toFixed(2), +cpp.toFixed(2), +price.toFixed(2),
            +gp.toFixed(1), recipeAllergens(r).join(", "),
          ];
        }),
      ],
    });

    // One sheet per recipe
    state.recipes.forEach((r) => {
      const total = recipeTotalCost(r);
      const cpp   = total / (r.portions || 1);
      const price = suggestPrice(cpp, state.activeGP);
      sheets.push({
        name: r.name,
        cols: [{ wch: 24 }, { wch: 8 }, { wch: 6 }, { wch: 14 }, { wch: 14 }],
        rows: [
          ["Ingredient", "Qty", "Unit", "Unit Cost (£)", "Line Cost (£)"],
          ...r.ingredients
            .map((ri) => {
              const ing = state.ingredients.find((i) => i.id === ri.ingId);
              if (!ing) return null;
              return [
                ing.name, ri.qty, ri.recipeUnit || ing.unit,
                +costPerUnit(ing).toFixed(4),
                +ingLineCost(ri.ingId, ri.qty, ri.recipeUnit).toFixed(2),
              ];
            })
            .filter(Boolean),
          [],
          ["", "", "", "Total Cost",    +total.toFixed(2)],
          ["", "", "", "Cost / Portion", +cpp.toFixed(2)],
          ["", "", "", `Sell Price (${state.activeGP}% GP)`, +price.toFixed(2)],
          [],
          ["Allergens", recipeAllergens(r).join(", ")],
          ["Notes", r.notes || ""],
        ],
      });
    });

    // Ingredient library sheet
    sheets.push({
      name: "Ingredient Library",
      cols: [
        { wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 12 },
        { wch: 6  }, { wch: 8  }, { wch: 12 }, { wch: 40 },
      ],
      rows: [
        ["Name", "Category", "Pack Size", "Pack Cost (£)", "Unit", "Yield %", "Cost/Unit (£)", "Allergens"],
        ...state.ingredients.map((i) => [
          i.name, i.category, i.packSize, i.packCost, i.unit, i.yieldPct,
          +costPerUnit(i).toFixed(4), (i.allergens || []).join(", "),
        ]),
      ],
    });

    // Single IPC call — XLSX built entirely in main process, no contextBridge buffer issues
    const result = await eAPI.buildAndSaveExcel(
      sheets,
      `recipe-costing-export-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
    if (result && result.error) throw new Error(result.error);
    if (result)
      showToast(`✓ Exported ${state.recipes.length} recipes to Excel`, "success", 3000);
  } catch (e) {
    showToast("Export failed: " + e.message, "error", 5000);
  }
}

// ─── Confirm Dialog ────────────────────────────────────────────
function showConfirm(title, message) {
  return new Promise((resolve) => {
    confirmCallback = resolve;
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-message").textContent = message;
    document.getElementById("confirm-modal").classList.remove("hidden");
  });
}
function closeConfirm(result) {
  document.getElementById("confirm-modal").classList.add("hidden");
  if (confirmCallback) {
    confirmCallback(result);
    confirmCallback = null;
  }
}

// ─── Excel Import ──────────────────────────────────────────────
let importState = {
  workbook: null,
  sheetData: [],
  headers: [],
  mapping: {},
  parsedRows: [],
};
const IMPORT_FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "category", label: "Category", required: false },
  { key: "packSize", label: "Pack Size", required: false },
  { key: "packCost", label: "Pack Cost", required: true },
  { key: "unit", label: "Unit", required: false },
  { key: "yieldPct", label: "Yield %", required: false },
];
const ALIASES = {
  name: [
    "name",
    "ingredient",
    "item",
    "description",
    "product",
    "ingredient name",
    "item name",
  ],
  category: ["category", "cat", "type", "group", "section"],
  packSize: [
    "pack size",
    "packsize",
    "size",
    "qty",
    "quantity",
    "pack qty",
    "case size",
    "weight",
    "volume",
  ],
  packCost: [
    "pack cost",
    "packcost",
    "cost",
    "price",
    "unit price",
    "£",
    "gbp",
    "total cost",
    "supplier price",
    "ex vat",
    "net price",
  ],
  unit: ["unit", "uom", "measure", "unit of measure", "units"],
  yieldPct: ["yield", "yield %", "yield%", "waste", "prep yield", "usable %"],
};

async function startImportExcel() {
  importState = {
    workbook: null,
    sheetData: [],
    headers: [],
    mapping: {},
    parsedRows: [],
  };
  const result = await browserIPC.openExcel();
  if (!result) return;
  try {
    const data = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
    const wb = XLSX.read(data, { type: "array" });
    importState.workbook = wb;
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (!rows.length) {
      showToast("Spreadsheet is empty", "error");
      return;
    }
    importState.sheetData = rows;
    importState.headers = Object.keys(rows[0]);
    importState.mapping = {};
    IMPORT_FIELDS.forEach((f) => {
      const m = importState.headers.find((h) =>
        ALIASES[f.key].includes(h.trim().toLowerCase()),
      );
      if (m) importState.mapping[f.key] = m;
    });
    document.getElementById("import-file-info").innerHTML =
      `📄 <strong>${escHtml(result.name)}</strong> — ${rows.length} rows`;
    document.getElementById("import-file-info").classList.remove("hidden");
    renderImportMapping();
    document.getElementById("import-mapping").classList.remove("hidden");
    document.getElementById("import-preview").classList.add("hidden");
    document.getElementById("import-map-btn").classList.remove("hidden");
    document.getElementById("import-confirm-btn").classList.add("hidden");
    document.getElementById("import-modal").classList.remove("hidden");
  } catch (e) {
    showToast("Could not read file: " + e.message, "error", 5000);
  }
}

function renderImportMapping() {
  const noneOpt = `<option value="">— not mapped —</option>`;
  const preview = importState.sheetData[0] || {};
  document.getElementById("import-map-tbody").innerHTML = IMPORT_FIELDS.map(
    (f) => {
      const mapped = importState.mapping[f.key] || "";
      return `<tr>
      <td>${f.label}${f.required ? ' <span style="color:var(--red)">*</span>' : ""}</td>
      <td><select onchange="updateImportMapping('${f.key}',this.value)">${noneOpt}${importState.headers.map((h) => `<option value="${escHtml(h)}" ${h === mapped ? "selected" : ""}>${escHtml(h)}</option>`).join("")}</select></td>
      <td><span class="import-preview-val" id="import-prev-${f.key}">${escHtml(mapped ? String(preview[mapped] ?? "") : "")}</span></td>
    </tr>`;
    },
  ).join("");
}
function updateImportMapping(k, v) {
  importState.mapping[k] = v;
  const el = document.getElementById("import-prev-" + k);
  if (el) el.textContent = v ? String(importState.sheetData[0]?.[v] ?? "") : "";
}
function showImportPreview() {
  if (!importState.mapping.name) {
    showToast("Please map the Name column", "error");
    return;
  }
  if (!importState.mapping.packCost) {
    showToast("Please map the Pack Cost column", "error");
    return;
  }
  const existingNames = new Set(
    state.ingredients.map((i) => i.name.trim().toLowerCase()),
  );
  importState.parsedRows = importState.sheetData
    .map((row) => {
      const m = importState.mapping;
      const name = String(row[m.name] ?? "").trim();
      if (!name) return null;
      const packCost = parseFloat(
        String(row[m.packCost]).replace(/[£$,]/g, "").trim(),
      );
      const unitRaw = m.unit ? String(row[m.unit] ?? "").trim() : "";
      const unitMap = {
        grams: "g",
        gram: "g",
        kilograms: "kg",
        millilitres: "ml",
        milliliters: "ml",
        litres: "L",
        liters: "L",
        pieces: "each",
        piece: "each",
      };
      const VALID_UNITS = [
        "g",
        "kg",
        "ml",
        "L",
        "each",
        "portion",
        "tbsp",
        "tsp",
      ];
      const unit = VALID_UNITS.includes(unitRaw)
        ? unitRaw
        : unitMap[unitRaw.toLowerCase()] || "g";
      const catRaw = m.category ? String(row[m.category] ?? "").trim() : "";
      const category = getIngCategories().includes(catRaw) ? catRaw : "Other";
      const packSize = m.packSize
        ? parseFloat(String(row[m.packSize]).replace(/,/g, "")) || 1
        : 1;
      const yieldPct = m.yieldPct
        ? Math.min(100, Math.max(1, parseFloat(row[m.yieldPct]) || 100))
        : 100;
      const isDupe = existingNames.has(name.toLowerCase());
      let status = "new",
        error = "";
      if (isNaN(packCost) || packCost <= 0) {
        status = "error";
        error = "Invalid cost";
      } else if (isDupe) status = "dupe";
      return {
        name,
        category,
        packSize,
        packCost,
        unit,
        yieldPct,
        allergens: [],
        status,
        error,
        isDupe,
      };
    })
    .filter(Boolean);

  const counts = { new: 0, dupe: 0, error: 0 };
  importState.parsedRows.forEach((r) => {
    if (counts[r.status] !== undefined) counts[r.status]++;
  });
  document.getElementById("import-preview-stats").innerHTML = `
    <div class="stat"><div class="stat-val green">${counts.new}</div><div class="stat-lbl">New</div></div>
    <div class="stat"><div class="stat-val amber">${counts.dupe}</div><div class="stat-lbl">Duplicate</div></div>
    <div class="stat"><div class="stat-val red">${counts.error}</div><div class="stat-lbl">Errors</div></div>
    <div class="stat"><div class="stat-val">${importState.parsedRows.length}</div><div class="stat-lbl">Total</div></div>`;
  document.getElementById("import-preview-tbody").innerHTML =
    importState.parsedRows
      .map(
        (r) => `<tr style="${r.status === "error" ? "opacity:.5" : ""}">
    <td style="font-weight:500">${escHtml(r.name)}</td>
    <td><span class="cat-badge">${escHtml(r.category)}</span></td>
    <td>${r.packSize}</td><td>£${r.packCost.toFixed(2)}</td><td>${r.unit}</td><td>${r.yieldPct}%</td>
    <td>${r.status === "new" ? '<span class="import-status-new">✓ New</span>' : r.status === "dupe" ? '<span class="import-status-dupe">⚠ Dupe</span>' : `<span class="import-status-err">✕ ${r.error}</span>`}</td>
  </tr>`,
      )
      .join("");

  document.getElementById("import-mapping").classList.add("hidden");
  document.getElementById("import-preview").classList.remove("hidden");
  document.getElementById("import-map-btn").classList.add("hidden");
  document.getElementById("import-confirm-btn").classList.remove("hidden");
}
function confirmImport() {
  const skipDupes = document.getElementById("import-skip-dupes").checked;
  const updateDupes = document.getElementById("import-update-dupes").checked;
  let added = 0,
    updated = 0,
    skipped = 0,
    errors = 0;
  for (const row of importState.parsedRows) {
    if (row.status === "error") {
      errors++;
      continue;
    }
    if (row.isDupe) {
      if (updateDupes) {
        const idx = state.ingredients.findIndex(
          (i) => i.name.trim().toLowerCase() === row.name.toLowerCase(),
        );
        if (idx >= 0) {
          state.ingredients[idx] = { ...state.ingredients[idx], ...row };
          updated++;
        }
      } else if (skipDupes) {
        skipped++;
        continue;
      } else {
        state.ingredients.push({ id: uid(), ...row });
        added++;
      }
    } else {
      state.ingredients.push({ id: uid(), ...row });
      added++;
    }
  }
  save();
  closeImportModal();
  renderIngredientLibrary();
  showToast(
    `✓ ${added} added, ${updated} updated, ${skipped} skipped, ${errors} errors`,
    "success",
    5000,
  );
}
function closeImportModal() {
  document.getElementById("import-modal").classList.add("hidden");
}

// ─── Template Download ─────────────────────────────────────────
async function downloadTemplate() {
  let wb = XLSX.utils.book_new();
  const wsData = [
    ["Name", "Category", "Pack Size", "Pack Cost", "Unit", "Yield %"],
    ["Chicken Breast", "Meat & Poultry", "1000", "4.80", "g", "90"],
    ["Double Cream", "Dairy", "500", "1.20", "ml", "100"],
    ["Olive Oil", "Oils & Condiments", "1000", "5.50", "ml", "100"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [
    { wch: 25 },
    { wch: 20 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
  ];
  wb = XLSX.utils.book_append_sheet(wb, ws, "Ingredients");
  const notes = [
    ["Field", "Required", "Notes"],
    ["Name", "Yes", "Ingredient name"],
    [
      "Category",
      "No",
      "Meat & Poultry, Fish & Seafood, Vegetables, Dairy, Dry Goods, Herbs & Spices, Oils & Condiments, Bakery, Other",
    ],
    ["Pack Size", "No", "Numeric pack size (e.g. 1000 for 1kg bag)"],
    ["Pack Cost", "Yes", "Cost in £ (e.g. 4.80)"],
    ["Unit", "No", "g, kg, ml, L, each, portion, tbsp, tsp"],
    ["Yield %", "No", "1–100 usable % after prep (default 100)"],
  ];
  const wsN = XLSX.utils.aoa_to_sheet(notes);
  wsN["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 65 }];
  wb = XLSX.utils.book_append_sheet(wb, wsN, "Notes");
  const buf = new Uint8Array(
    XLSX.write(wb, { type: "array", bookType: "xlsx" }),
  );
  const ok = await browserIPC.saveExcel(buf, "ingredient-import-template.xlsx");
  if (ok) showToast("✓ Template downloaded", "success");
}

// ─── Discard & Keyboard ────────────────────────────────────────
function discardRecipeChanges() {
  const recipe = getActiveRecipe();
  if (!recipe) return;
  if (recipeSnapshot) {
    const idx = state.recipes.findIndex((r) => r.id === state.activeRecipeId);
    if (idx >= 0)
      state.recipes[idx] = JSON.parse(JSON.stringify(recipeSnapshot));
    save();
    render();
    renderRecipeEditor();
    showToast("Changes discarded", "error", 2000);
  } else {
    state.recipes = state.recipes.filter((r) => r.id !== state.activeRecipeId);
    state.activeRecipeId = state.recipes[0]?.id || null;
    save();
    render();
    if (state.activeRecipeId) {
      recipeSnapshot = JSON.parse(
        JSON.stringify(
          state.recipes.find((r) => r.id === state.activeRecipeId),
        ),
      );
      renderRecipeEditor();
    } else {
      showRecipeList();
    }
    showToast("New recipe discarded", "error", 2000);
  }
}

function _noInputFocused() {
  const tag = document.activeElement?.tagName;
  return tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT";
}
function _noModalOpen() {
  return !document.querySelector(".modal-overlay:not(.hidden)");
}
function _onGlobalKeydown(e) {
  // Global shortcuts — always active
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    openSearch();
    return;
  }
  if (e.key === "Escape" && searchOpen) {
    e.preventDefault();
    closeSearch();
    return;
  }
  // Ctrl+Shift+L = toggle light/dark theme
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "L") {
    e.preventDefault();
    toggleDarkMode();
    return;
  }
  // Ctrl+, = open settings
  if ((e.ctrlKey || e.metaKey) && e.key === ",") {
    e.preventDefault();
    showView("settings");
    return;
  }
  // Ctrl+P = print recipe cost sheet (when recipe is open)
  if ((e.ctrlKey || e.metaKey) && e.key === "p") {
    e.preventDefault();
    if (state.activeRecipeId) printRecipe(state.activeRecipeId);
    return;
  }
  // Ctrl+D = duplicate recipe (when recipe is open)
  if ((e.ctrlKey || e.metaKey) && e.key === "d") {
    e.preventDefault();
    if (state.activeRecipeId) duplicateRecipe(state.activeRecipeId);
    return;
  }
  // Ctrl+I = focus ingredient search (when recipe is open)
  if ((e.ctrlKey || e.metaKey) && e.key === "i") {
    e.preventDefault();
    const inp = document.getElementById("ing-search-add");
    if (inp) { inp.focus(); inp.select(); }
    return;
  }
  // Only fire character shortcuts when not typing in inputs and no modal open
  if (_noInputFocused() && _noModalOpen()) {
    // ? = shortcuts help
    if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
      openShortcutsHelp();
      return;
    }
    // N = new recipe
    if (e.key === "n" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      newRecipe();
      showView("recipes");
      return;
    }
    // Navigation: 1-7 = sidebar sections
    const navMap = { "1": "home", "2": "recipes", "3": "ingredients", "4": "suppliers", "5": "dashboard", "6": "tools", "7": "order-sheet" };
    if (navMap[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      showView(navMap[e.key]);
      return;
    }
  }
  const ingOpen = !document
    .getElementById("ing-modal")
    .classList.contains("hidden");
  const importOpen = !document
    .getElementById("import-modal")
    .classList.contains("hidden");
  const confirmOpen = !document
    .getElementById("confirm-modal")
    .classList.contains("hidden");
  const menuOpen = !document
    .getElementById("menu-modal")
    .classList.contains("hidden");

  if (ingOpen) {
    if (e.key === "Enter" && document.activeElement?.tagName !== "SELECT") {
      e.preventDefault();
      saveIngredient();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeIngredientModal();
    }
    return;
  }
  if (importOpen) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeImportModal();
    }
    return;
  }
  if (menuOpen) {
    if (e.key === "Escape") {
      e.preventDefault();
      document.getElementById("menu-modal").classList.add("hidden");
    }
    return;
  }
  const subPickerOpen = !document
    .getElementById("sub-recipe-picker-modal")
    .classList.contains("hidden");
  if (subPickerOpen) {
    if (e.key === "Escape") {
      e.preventDefault();
      document
        .getElementById("sub-recipe-picker-modal")
        .classList.add("hidden");
    }
    return;
  }
  if (confirmOpen) {
    if (e.key === "Enter") {
      e.preventDefault();
      closeConfirm(true);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeConfirm(false);
    }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
    e.preventDefault();
    undo();
    return;
  }
  if (
    (e.ctrlKey || e.metaKey) &&
    (e.key === "y" || (e.key === "z" && e.shiftKey))
  ) {
    e.preventDefault();
    redo();
    return;
  }
  if (state.activeRecipeId) {
    if (e.key === "Escape") {
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT")
      ) {
        active.blur();
        const recipe = getActiveRecipe();
        if (recipe) recipeSnapshot = JSON.parse(JSON.stringify(recipe));
      } else {
        discardRecipeChanges();
      }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const recipe = getActiveRecipe();
      if (recipe) {
        recipeSnapshot = JSON.parse(JSON.stringify(recipe));
        save();
        showToast("✓ Saved", "success", 1500);
      }
    }
  }
}
document.addEventListener("keydown", _onGlobalKeydown);

// ─── Price Override ────────────────────────────────────────────
function updatePriceOverride(val) {
  const recipe = getActiveRecipe();
  if (!recipe) return;
  const vatMode = recipe.priceOverrideVatMode || "ex";
  const vatRate = state.vatRate || 0;
  // Always store ex-VAT internally
  const exVatVal =
    val && val > 0
      ? vatMode === "inc"
        ? val / (1 + vatRate / 100)
        : val
      : null;
  recipe.priceOverride = exVatVal;
  const cpp = recipeTotalCost(recipe) / (recipe.portions || 1);
  const wrap = document.querySelector(".override-gp-display");
  if (exVatVal && exVatVal > 0) {
    if (!wrap) {
      const pw = document.querySelector(".price-override-wrap");
      if (pw) {
        const d = document.createElement("div");
        d.className = "override-gp-display";
        d.id = "override-gp-display";
        d.innerHTML = buildOverrideGP(cpp, exVatVal, vatMode);
        pw.appendChild(d);
      }
    } else {
      wrap.innerHTML = buildOverrideGP(cpp, exVatVal, vatMode);
    }
  } else if (wrap) {
    wrap.innerHTML = "";
  }
  save();
}

function setOverrideVatMode(mode) {
  const recipe = getActiveRecipe();
  if (!recipe) return;
  const oldMode = recipe.priceOverrideVatMode || "ex";
  if (oldMode === mode) return;
  recipe.priceOverrideVatMode = mode;
  const vatRate = state.vatRate || 0;
  // Convert displayed input value to new mode
  const input = document.getElementById("price-override-input");
  if (input && recipe.priceOverride) {
    const exVat = recipe.priceOverride;
    input.value =
      mode === "inc"
        ? (exVat * (1 + vatRate / 100)).toFixed(2)
        : exVat.toFixed(2);
  }
  // Update toggle button styles
  document
    .getElementById("override-vat-ex")
    ?.classList.toggle("active", mode === "ex");
  document
    .getElementById("override-vat-inc")
    ?.classList.toggle("active", mode === "inc");
  // Refresh GP display
  const cpp = recipeTotalCost(recipe) / (recipe.portions || 1);
  const wrap = document.querySelector(".override-gp-display");
  if (recipe.priceOverride && wrap)
    wrap.innerHTML = buildOverrideGP(cpp, recipe.priceOverride, mode);
  save();
}

function buildOverrideGP(cpp, price, vatMode) {
  if (!price || price <= 0) return "";
  // price is always ex-VAT internally
  const vatRate = state.vatRate || 0;
  const incVatPrice = price * (1 + vatRate / 100);
  const gp = ((price - cpp) / price) * 100;
  const col =
    gp >= 70 ? "var(--green)" : gp >= 55 ? "var(--accent)" : "var(--red)";
  let html =
    '<div style="margin-top:8px;padding:8px;background:var(--bg-card2);border-radius:6px;border:1px solid var(--border)">' +
    '<div style="display:flex;justify-content:space-between;font-size:12px">' +
    '<span style="color:var(--text-muted)">Actual GP</span>' +
    '<span style="font-weight:700;color:' +
    col +
    '">' +
    gp.toFixed(1) +
    "%</span></div>" +
    '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:4px">' +
    '<span style="color:var(--text-muted)">Profit / portion</span>' +
    '<span style="color:var(--green);font-weight:700">' +
    fmt(price - cpp) +
    "</span></div>";
  if (vatRate > 0) {
    html +=
      '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:4px;padding-top:4px;border-top:1px solid var(--border)">' +
      '<span style="color:var(--text-muted)">Ex VAT</span><span style="color:var(--text-secondary)">' +
      fmt(price) +
      "</span></div>" +
      '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:2px">' +
      '<span style="color:var(--text-muted)">Inc ' +
      vatRate +
      '% VAT</span><span style="color:var(--text-secondary);font-weight:600">' +
      fmt(incVatPrice) +
      "</span></div>";
  }
  html += "</div>";
  return html;
}

// ─── Nutrition ─────────────────────────────────────────────────
function recipeNutrition(recipe) {
  const totals = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  const portions = recipe.portions || 1;
  for (const ri of recipe.ingredients || []) {
    const ing = state.ingredients.find((i) => i.id === ri.ingId);
    if (!ing || !ing.nutrition) continue;
    const n = ing.nutrition;
    const factor = (ri.qty || 0) / 100;
    totals.kcal += (n.kcal || 0) * factor;
    totals.protein += (n.protein || 0) * factor;
    totals.fat += (n.fat || 0) * factor;
    totals.carbs += (n.carbs || 0) * factor;
  }
  return {
    kcal: totals.kcal / portions,
    protein: totals.protein / portions,
    fat: totals.fat / portions,
    carbs: totals.carbs / portions,
  };
}

function buildNutritionSummary(recipe) {
  // Use recipeNutritionTotal — same function as the header bar — so both
  // panels always show identical values (correct unit conversion + sub-recipes).
  const n = recipeNutritionTotal(recipe);
  if (!n || (!n.kcal && !n.protein && !n.fat && !n.carbs)) return "";
  const partial = n.partial
    ? '<div style="font-size:10px;color:var(--text-muted);margin-top:4px">*partial — some ingredients missing data</div>'
    : "";
  return (
    '<div class="nutrition-card">' +
    '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);margin-bottom:8px">Nutrition / Portion</div>' +
    '<div class="nutrition-grid">' +
    '<div class="nut-item"><div class="nut-val">' +
    Math.round(n.kcal) +
    '</div><div class="nut-lbl">kcal</div></div>' +
    '<div class="nut-item"><div class="nut-val">' +
    n.protein.toFixed(1) +
    'g</div><div class="nut-lbl">Protein</div></div>' +
    '<div class="nut-item"><div class="nut-val">' +
    n.fat.toFixed(1) +
    'g</div><div class="nut-lbl">Fat</div></div>' +
    '<div class="nut-item"><div class="nut-val">' +
    n.carbs.toFixed(1) +
    'g</div><div class="nut-lbl">Carbs</div></div>' +
    "</div>" +
    partial +
    "</div>"
  );
}

// ─── Recipe Photo ──────────────────────────────────────────────
async function showRecipePhoto(id) {
  const recipe = state.recipes.find((r) => r.id === id);
  if (!recipe) return;
  const result = await browserIPC.openImage();
  if (!result) return;
  recipe.photo = result.dataUrl;
  save();
  renderRecipeEditor();
  showToast("Photo attached", "success", 1500);
}

// ─── Recipe Versioning ─────────────────────────────────────────
function showVersionModal(id) {
  const recipe = state.recipes.find((r) => r.id === id);
  if (!recipe) return;
  const modal = document.getElementById("version-modal");
  modal.querySelector("h2").textContent = "Recipe Versions";
  const body = document.getElementById("version-modal-body");
  const versions = recipe.versions || [];
  const currentCost = recipeTotalCost(recipe) / (recipe.portions || 1);
  let html =
    '<div class="version-current">' +
    '<div class="version-label">Current (v' +
    (versions.length + 1) +
    ")</div>" +
    '<div class="version-meta">Cost: ' +
    fmt(currentCost) +
    " &middot; " +
    recipe.ingredients.length +
    " ingredients</div>" +
    "</div>";
  if (versions.length) {
    html += versions
      .slice()
      .reverse()
      .map(function (v, i) {
        const idx = versions.length - 1 - i;
        const diff = currentCost - v.costPerPortion;
        const diffCol =
          diff > 0
            ? "var(--red)"
            : diff < 0
              ? "var(--green)"
              : "var(--text-muted)";
        return (
          '<div class="version-row">' +
          '<div><div class="version-label">v' +
          (idx + 1) +
          " &mdash; " +
          escHtml(v.label || new Date(v.savedAt).toLocaleDateString("en-GB")) +
          "</div>" +
          '<div class="version-meta">' +
          v.date +
          " &middot; Cost: " +
          fmt(v.costPerPortion) +
          " &middot; " +
          v.ingredientCount +
          " ingredients" +
          '<span style="color:' +
          diffCol +
          ';margin-left:8px">' +
          (diff >= 0 ? "+" : "") +
          fmt(diff) +
          " vs now</span></div></div>" +
          '<div style="display:flex;gap:6px;align-items:center">' +
          '<button class="btn-secondary btn-sm" onclick="restoreVersion(\'' +
          id +
          "'," +
          idx +
          ')">Restore</button>' +
          '<button class="btn-icon danger" onclick="deleteVersion(\'' +
          id +
          "'," +
          idx +
          ')">&#x1F5D1;</button>' +
          "</div></div>"
        );
      })
      .join("");
  } else {
    html +=
      '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">No saved versions yet &mdash; click Save below to snapshot the current recipe.</div>';
  }
  body.innerHTML = html;
  modal.querySelector(".modal-footer").innerHTML =
    "<button class=\"btn-secondary\" onclick=\"document.getElementById('version-modal').classList.add('hidden')\">Close</button>" +
    '<button class="btn-primary" onclick="saveCurrentVersion()">Save Current as Version</button>';
  modal.classList.remove("hidden");
}

function saveCurrentVersion() {
  const recipe = getActiveRecipe();
  if (!recipe) return;
  if (!recipe.versions) recipe.versions = [];
  const label = "v" + (recipe.versions.length + 1);
  recipe.versions.push({
    label: label,
    savedAt: Date.now(),
    date: new Date().toLocaleDateString("en-GB"),
    costPerPortion: recipeTotalCost(recipe) / (recipe.portions || 1),
    ingredientCount: recipe.ingredients.length,
    snapshot: JSON.parse(
      JSON.stringify({
        ingredients: recipe.ingredients,
        subRecipes: recipe.subRecipes,
        portions: recipe.portions,
        notes: recipe.notes,
      }),
    ),
  });
  save();
  showVersionModal(recipe.id);
  showToast(label + " saved", "success", 1500);
}

async function restoreVersion(id, idx) {
  const recipe = state.recipes.find((r) => r.id === id);
  if (!recipe) return;
  if (
    !(await showConfirm(
      "Restore this version?",
      "Current ingredients will be replaced. Save current version first if needed.",
    ))
  )
    return;
  const v = recipe.versions[idx];
  Object.assign(recipe, v.snapshot);
  save();
  document.getElementById("version-modal").classList.add("hidden");
  renderRecipeEditor();
  renderSidebarRecipes();
  showToast("Version restored", "success", 2000);
}

async function deleteVersion(id, idx) {
  const recipe = state.recipes.find((r) => r.id === id);
  if (!recipe) return;
  if (!(await showConfirm("Delete this version?", ""))) return;
  recipe.versions.splice(idx, 1);
  save();
  showVersionModal(id);
}

// ─── Cost History ─────────────────────────────────────────────
function logCostHistory(recipe) {
  if (!recipe) return;
  if (!recipe.costHistory) recipe.costHistory = [];
  const cost = recipeTotalCost(recipe) / (recipe.portions || 1);
  const today = new Date().toISOString().slice(0, 10);
  // Only log once per day per recipe
  const last = recipe.costHistory[recipe.costHistory.length - 1];
  if (last && last.date === today) {
    last.cost = cost; // update today's entry
  } else {
    recipe.costHistory.push({ date: today, cost: cost });
  }
  // Keep only last 180 days
  if (recipe.costHistory.length > 180)
    recipe.costHistory = recipe.costHistory.slice(-180);
}

function showCostHistoryModal(id) {
  const recipe = state.recipes.find((r) => r.id === id);
  if (!recipe) return;
  const history = (recipe.costHistory || []).slice(-60); // show last 60 days
  const modal = document.getElementById("cost-history-modal");
  document.getElementById("cost-history-title").textContent =
    "Cost History — " + recipe.name;

  if (history.length < 2) {
    document.getElementById("cost-history-body").innerHTML =
      '<div style="color:var(--text-muted);font-size:13px;padding:20px;text-align:center">' +
      '<div style="font-size:28px;margin-bottom:12px">📈</div>' +
      "Not enough history yet. Cost is logged daily as you use the app.<br>" +
      '<span style="font-size:11px">Come back tomorrow to see a trend.</span></div>';
    modal.classList.remove("hidden");
    return;
  }

  const costs = history.map((h) => h.cost);
  const minC = Math.min(...costs);
  const maxC = Math.max(...costs);
  const range = maxC - minC || 0.01;
  const W = 600,
    H = 140,
    PAD = 28;
  const xStep = (W - PAD * 2) / (history.length - 1);

  // Build SVG polyline
  const points = history
    .map(function (h, i) {
      const x = PAD + i * xStep;
      const y = PAD + (1 - (h.cost - minC) / range) * (H - PAD * 2);
      return x.toFixed(1) + "," + y.toFixed(1);
    })
    .join(" ");

  // X-axis date labels (show ~5 evenly spaced)
  const labelIdxs = [
    0,
    Math.floor(history.length * 0.25),
    Math.floor(history.length * 0.5),
    Math.floor(history.length * 0.75),
    history.length - 1,
  ];
  const labels = [...new Set(labelIdxs)]
    .map(function (i) {
      const x = PAD + i * xStep;
      const d = history[i].date;
      const label = new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
      });
      return (
        '<text x="' +
        x.toFixed(0) +
        '" y="' +
        (H - 4) +
        '" text-anchor="middle" font-size="10" fill="var(--text-muted)">' +
        label +
        "</text>"
      );
    })
    .join("");

  // Y-axis labels
  const yLabels = [minC, (minC + maxC) / 2, maxC]
    .map(function (v, i) {
      const y = PAD + (1 - (v - minC) / range) * (H - PAD * 2);
      return (
        '<text x="' +
        (PAD - 4) +
        '" y="' +
        y.toFixed(0) +
        '" text-anchor="end" dominant-baseline="middle" font-size="10" fill="var(--text-muted)">' +
        fmt(v) +
        "</text>"
      );
    })
    .join("");

  // Dots for hover
  const dots = history
    .map(function (h, i) {
      const x = PAD + i * xStep;
      const y = PAD + (1 - (h.cost - minC) / range) * (H - PAD * 2);
      return (
        '<circle cx="' +
        x.toFixed(1) +
        '" cy="' +
        y.toFixed(1) +
        '" r="3" fill="var(--accent)" opacity="0.7">' +
        "<title>" +
        h.date +
        ": " +
        fmt(h.cost) +
        "</title></circle>"
      );
    })
    .join("");

  const currentCost = recipeTotalCost(recipe) / (recipe.portions || 1);
  const firstCost = history[0].cost;
  const diff = currentCost - firstCost;
  const diffPct = ((diff / firstCost) * 100).toFixed(1);
  const diffCol =
    diff > 0 ? "var(--red)" : diff < 0 ? "var(--green)" : "var(--text-muted)";

  const svg =
    '<svg viewBox="0 0 ' +
    W +
    " " +
    H +
    '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">' +
    '<line x1="' +
    PAD +
    '" y1="' +
    PAD +
    '" x2="' +
    PAD +
    '" y2="' +
    (H - PAD) +
    '" stroke="var(--border)" stroke-width="1"/>' +
    '<line x1="' +
    PAD +
    '" y1="' +
    (H - PAD) +
    '" x2="' +
    (W - PAD) +
    '" y2="' +
    (H - PAD) +
    '" stroke="var(--border)" stroke-width="1"/>' +
    yLabels +
    labels +
    '<polyline points="' +
    points +
    '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>' +
    dots +
    "</svg>";

  document.getElementById("cost-history-body").innerHTML =
    '<div style="display:flex;gap:24px;margin-bottom:16px;flex-wrap:wrap">' +
    '<div style="text-align:center"><div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">Current Cost/Portion</div><div style="font-size:20px;font-weight:700;color:var(--accent)">' +
    fmt(currentCost) +
    "</div></div>" +
    '<div style="text-align:center"><div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">vs ' +
    history[0].date +
    '</div><div style="font-size:20px;font-weight:700;color:' +
    diffCol +
    '">' +
    (diff >= 0 ? "+" : "") +
    fmt(diff) +
    " (" +
    (diff >= 0 ? "+" : "") +
    diffPct +
    "%)</div></div>" +
    '<div style="text-align:center"><div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">Days tracked</div><div style="font-size:20px;font-weight:700">' +
    history.length +
    "</div></div>" +
    "</div>" +
    '<div style="background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px">' +
    svg +
    "</div>" +
    '<div style="margin-top:12px"><table class="dash-table" style="width:100%"><thead><tr><th>Date</th><th style="text-align:right">Cost/Portion</th><th style="text-align:right">Change</th></tr></thead><tbody>' +
    history
      .slice()
      .reverse()
      .slice(0, 30)
      .map(function (h, i, arr) {
        const prev = arr[i + 1];
        const chg = prev ? h.cost - prev.cost : null;
        const chgStr =
          chg !== null
            ? '<span style="color:' +
              (chg > 0
                ? "var(--red)"
                : chg < 0
                  ? "var(--green)"
                  : "var(--text-muted)") +
              '">' +
              (chg >= 0 ? "+" : "") +
              fmt(chg) +
              "</span>"
            : "—";
        return (
          '<tr><td style="color:var(--text-secondary)">' +
          h.date +
          '</td><td style="text-align:right;font-weight:600">' +
          fmt(h.cost) +
          '</td><td style="text-align:right">' +
          chgStr +
          "</td></tr>"
        );
      })
      .join("") +
    "</tbody></table></div>";

  modal.classList.remove("hidden");
}

// ─── QR Code ──────────────────────────────────────────────────

// ─── Suppliers ─────────────────────────────────────────────────
const _collapsedSuppliers = new Set();
function renderSupplierList() {
  const container = document.getElementById("supplier-list-content");
  if (!container) return;
  if (!state.suppliers.length) {
    container.innerHTML =
      '<div class="empty-state" style="padding-top:60px"><div class="empty-icon">🚚</div><h2>No suppliers yet</h2><p>Add your first supplier to link to ingredients and scan invoices</p></div>';
    return;
  }
  const q = (document.getElementById("supplier-search")?.value || "")
    .toLowerCase()
    .trim();
  const suppliers = q
    ? state.suppliers.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.contact || "").toLowerCase().includes(q) ||
          (s.email || "").toLowerCase().includes(q),
      )
    : state.suppliers;
  if (!suppliers.length) {
    container.innerHTML =
      '<div style="padding:24px;color:var(--text-muted);font-size:13px;text-align:center">No suppliers match "' +
      escHtml(q) +
      '"</div>';
    return;
  }
  container.innerHTML =
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:14px">' +
    suppliers
      .map(function (sup) {
        const linked = state.ingredients.filter((i) => i.supplierId === sup.id);
        const invoiceHistory = sup.invoiceHistory || [];
        const invoiceCount = invoiceHistory.length;
        const totalSpend = invoiceHistory.reduce(
          (s, i) => s + (i.total || 0),
          0,
        );
        const deliveryDays = sup.deliveryDays || sup.delivery || "";
        const linkedIds = new Set(linked.map((i) => i.id));
        const affectedRecipes = state.recipes.filter((r) =>
          r.ingredients.some((ri) => linkedIds.has(ri.ingId)),
        );
        const now = Date.now();
        const staleCount = linked.filter((ing) => {
          const hist = ing.priceHistory || [];
          return (
            hist.length &&
            now - new Date(hist[hist.length - 1].date).getTime() > 60 * 86400000
          );
        }).length;
        const last2 = invoiceHistory.slice(0, 2);
        let trendVal = "",
          trendCol = "var(--text-muted)";
        if (last2.length >= 2 && last2[1].total > 0) {
          const diff = last2[0].total - last2[1].total;
          const pct = (diff / last2[1].total) * 100;
          trendCol = diff > 0 ? "var(--red)" : "var(--green)";
          trendVal =
            (diff > 0 ? "\u25b2 " : "\u25bc ") + Math.abs(pct).toFixed(1) + "%";
        }
        const spark = invoiceHistory.slice(0, 8).reverse();
        let sparkHtml = "";
        if (spark.length >= 2) {
          const maxSpend = Math.max(...spark.map((i) => i.total || 0));
          sparkHtml =
            '<div style="display:flex;align-items:flex-end;gap:3px;height:32px;margin-top:8px">' +
            spark
              .map((inv, idx) => {
                const h =
                  maxSpend > 0
                    ? Math.max(
                        4,
                        Math.round(((inv.total || 0) / maxSpend) * 100),
                      )
                    : 4;
                const isLast = idx === spark.length - 1;
                const col = isLast
                  ? trendCol === "var(--red)"
                    ? "var(--red)"
                    : trendCol === "var(--green)"
                      ? "var(--green)"
                      : "var(--accent)"
                  : "var(--border-light)";
                return (
                  '<div style="flex:1;height:' +
                  h +
                  "%;background:" +
                  col +
                  ";border-radius:2px 2px 0 0;opacity:" +
                  (isLast ? "1" : "0.6") +
                  '" title="' +
                  fmt(inv.total || 0) +
                  '"></div>'
                );
              })
              .join("") +
            "</div>" +
            '<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text-muted);margin-top:2px"><span>oldest</span><span>latest</span></div>';
        }
        const initial = sup.name.trim()[0].toUpperCase();
        const avatarColors = [
          "#1a4db5",
          "#2d7a52",
          "#7a4a00",
          "#6b2d7a",
          "#9b3535",
        ];
        const avatarBg =
          avatarColors[sup.name.charCodeAt(0) % avatarColors.length];
        return (
          '<div class="supplier-card" style="display:flex;flex-direction:column">' +
          '<div style="padding:14px 16px 10px;border-bottom:1px solid var(--border)">' +
          '<div style="display:flex;align-items:flex-start;gap:10px">' +
          '<div style="width:36px;height:36px;border-radius:8px;background:' +
          avatarBg +
          "22;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:" +
          avatarBg +
          ";flex-shrink:0;border:1px solid " +
          avatarBg +
          '44">' +
          initial +
          "</div>" +
          '<div style="flex:1;min-width:0"><div class="supplier-name">' +
          escHtml(sup.name) +
          "</div>" +
          '<div class="supplier-meta">' +
          [sup.contact, sup.phone, sup.email]
            .filter(Boolean)
            .map(escHtml)
            .join(" \u00b7 ") +
          "</div></div>" +
          '<div style="display:flex;gap:4px;flex-shrink:0">' +
          '<button class="btn-icon" onclick="openSupplierModal(\'' +
          sup.id +
          '\')" title="Edit">\u270f\ufe0f</button>' +
          '<button class="btn-icon danger" onclick="deleteSupplier(\'' +
          sup.id +
          '\')" title="Delete">\ud83d\uddd1</button>' +
          '<button class="btn-primary btn-sm" onclick="openInvoiceModal(\'' +
          sup.id +
          "')\">📄 Scan Invoice</button>" +
          '<button class="btn-icon" onclick="toggleSupplierBody(\'' +
          sup.id +
          '\')" title="Collapse / Expand" id="sup-chev-' +
          sup.id +
          '" style="margin-left:2px;font-size:11px;width:26px;height:26px">' +
          (_collapsedSuppliers.has(sup.id) ? "&#9654;" : "&#9660;") +
          "</button>" +
          "</div></div>" +
          '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">' +
          (deliveryDays
            ? '<span class="sup-pill">🚚 ' + escHtml(deliveryDays) + "</span>"
            : "") +
          (sup.accountNumber
            ? '<span class="sup-pill">Acc: ' +
              escHtml(sup.accountNumber) +
              "</span>"
            : "") +
          (linked.length
            ? '<span class="sup-pill" style="color:var(--green);font-weight:600">' +
              linked.length +
              " ingredient" +
              (linked.length !== 1 ? "s" : "") +
              "</span>"
            : '<span class="sup-pill" style="opacity:.5">No ingredients</span>') +
          (affectedRecipes.length
            ? '<span class="sup-pill" style="color:var(--blue)">' +
              affectedRecipes.length +
              " recipe" +
              (affectedRecipes.length !== 1 ? "s" : "") +
              "</span>"
            : "") +
          (staleCount
            ? '<span class="sup-pill" style="color:var(--accent);font-weight:600;cursor:pointer" onclick="setIngCatFilter(\'' +
              sup.id +
              "','sup');showView('ingredients')\">\u23f0 " +
              staleCount +
              " stale</span>"
            : "") +
          (sup.notes
            ? '<span class="sup-pill" style="font-style:italic">' +
              escHtml(sup.notes) +
              "</span>"
            : "") +
          "</div></div>" +
          '<div id="sup-body-' +
          sup.id +
          '"' +
          (_collapsedSuppliers.has(sup.id) ? ' style="display:none"' : "") +
          ">" +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid var(--border)">' +
          '<div style="padding:10px 14px;border-right:1px solid var(--border)"><div style="font-size:9px;color:var(--text-muted);margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px">Total spend</div><div style="font-size:17px;font-weight:700;color:var(--text-primary)">' +
          (totalSpend ? fmt(totalSpend) : "—") +
          "</div></div>" +
          '<div style="padding:10px 14px;border-right:1px solid var(--border)"><div style="font-size:9px;color:var(--text-muted);margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px">Invoices</div><div style="font-size:17px;font-weight:700;color:var(--text-primary)">' +
          (invoiceCount || "—") +
          "</div></div>" +
          '<div style="padding:10px 14px"><div style="font-size:9px;color:var(--text-muted);margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px">vs last invoice</div><div style="font-size:17px;font-weight:700;color:' +
          trendCol +
          '">' +
          (trendVal || "—") +
          "</div></div>" +
          "</div>" +
          (invoiceCount >= 2
            ? '<div style="padding:10px 16px 12px"><div style="font-size:9px;color:var(--text-muted);margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px">Spend per invoice</div>' +
              sparkHtml +
              "</div>"
            : '<div style="padding:10px 14px;font-size:11px;color:var(--text-muted)">No invoice history yet</div>') +
          buildSupplierCatalogue(sup) +
          buildInvoiceHistory(sup) +
          "</div>" +
          "</div>"
        );
      })
      .join("") +
    "</div>";
}

// ─── Supplier Product Catalogue ────────────────────────────────────────────
function buildSupplierCatalogue(sup) {
  const primaryIngs = state.ingredients.filter(function (i) {
    return i.supplierId === sup.id;
  });
  const altIngs = state.ingredients.filter(function (i) {
    return (
      i.supplierId !== sup.id &&
      (i.altSuppliers || []).some(function (a) {
        return a.supplierId === sup.id;
      })
    );
  });

  if (!primaryIngs.length && !altIngs.length) return "";

  // Build combined row list
  const rows = [];
  primaryIngs.forEach(function (ing) {
    rows.push({
      ing: ing,
      packCost: ing.packCost,
      packSize: ing.packSize,
      isPrimary: true,
    });
  });
  altIngs.forEach(function (ing) {
    const alt = (ing.altSuppliers || []).find(function (a) {
      return a.supplierId === sup.id;
    });
    rows.push({
      ing: ing,
      packCost: alt ? alt.packCost : 0,
      packSize: alt ? alt.packSize : 0,
      isPrimary: false,
    });
  });

  // Sort: primary first, then alphabetical
  rows.sort(function (a, b) {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.ing.name.localeCompare(b.ing.name);
  });

  const tableRows = rows
    .map(function (r) {
      const cpu =
        r.packSize > 0 && r.packCost > 0
          ? fmt(r.packCost / r.packSize) + "/" + (r.ing.unit || "unit")
          : "—";
      return (
        "<tr>" +
        '<td style="font-size:12px;padding:5px 8px;font-weight:' +
        (r.isPrimary ? "600" : "400") +
        '">' +
        escHtml(r.ing.name) +
        "</td>" +
        '<td style="font-size:11px;padding:5px 8px;color:var(--text-muted)">' +
        escHtml(r.ing.category || "") +
        "</td>" +
        '<td style="font-size:11px;padding:5px 8px;text-align:right">' +
        (r.packCost ? fmt(r.packCost) : "—") +
        "</td>" +
        '<td style="font-size:11px;padding:5px 8px;text-align:right;color:var(--text-muted)">' +
        (r.packSize ? r.packSize + " " + (r.ing.unit || "") : "—") +
        "</td>" +
        '<td style="font-size:11px;padding:5px 8px;text-align:right;color:var(--text-muted)">' +
        cpu +
        "</td>" +
        '<td style="font-size:10px;padding:5px 8px;text-align:center">' +
        (r.isPrimary
          ? '<span style="background:rgba(34,197,94,0.12);color:var(--green);border:1px solid rgba(34,197,94,0.3);padding:1px 6px;border-radius:3px;font-weight:600">Primary</span>'
          : '<span style="background:var(--accent-bg);color:var(--accent);border:1px solid var(--accent-dim);padding:1px 6px;border-radius:3px">Alt</span>') +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  const catId = "sup-cat-" + sup.id;
  return (
    '<div style="border-top:1px solid var(--border)">' +
    '<div style="padding:8px 14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none" onclick="toggleSupplierCatalogue(\'' +
    sup.id +
    "')\"><span style=\"font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600\">Products (" +
    rows.length +
    ')</span>' +
    '<svg id="sup-cat-arrow-' +
    sup.id +
    '" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .2s"><polyline points="6 9 12 15 18 9"/></svg>' +
    "</div>" +
    '<div id="' +
    catId +
    '" style="display:none;padding:0 4px 8px">' +
    '<table style="width:100%;border-collapse:collapse">' +
    '<thead><tr style="border-bottom:1px solid var(--border)">' +
    '<th style="font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);padding:3px 8px;font-weight:600;text-align:left">Ingredient</th>' +
    '<th style="font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);padding:3px 8px;font-weight:600;text-align:left">Category</th>' +
    '<th style="font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);padding:3px 8px;font-weight:600;text-align:right">Pack Cost</th>' +
    '<th style="font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);padding:3px 8px;font-weight:600;text-align:right">Pack Size</th>' +
    '<th style="font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);padding:3px 8px;font-weight:600;text-align:right">Cost/Unit</th>' +
    '<th style="font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);padding:3px 8px;font-weight:600;text-align:center">Role</th>' +
    "</tr></thead><tbody>" +
    tableRows +
    "</tbody></table></div></div>"
  );
}

function toggleSupplierCatalogue(supId) {
  const panel = document.getElementById("sup-cat-" + supId);
  const arrow = document.getElementById("sup-cat-arrow-" + supId);
  if (!panel) return;
  const isOpen = panel.style.display !== "none";
  panel.style.display = isOpen ? "none" : "block";
  if (arrow) arrow.style.transform = isOpen ? "" : "rotate(180deg)";
}

function toggleSupplierBody(supId) {
  const body = document.getElementById("sup-body-" + supId);
  const chev = document.getElementById("sup-chev-" + supId);
  if (!body) return;
  const isOpen = body.style.display !== "none";
  body.style.display = isOpen ? "none" : "";
  if (isOpen) _collapsedSuppliers.add(supId);
  else _collapsedSuppliers.delete(supId);
  if (chev) chev.innerHTML = isOpen ? "&#9654;" : "&#9660;";
}

function buildInvoiceHistory(sup) {
  const allHistory = sup.invoiceHistory || [];
  if (!allHistory.length) return "";
  const totalSpend = allHistory.reduce(
    (s, i) => s + (i.total || 0),
    0,
  );
  const creditTotal = allHistory.filter(function(i) { return i.isCredit || (i.total || 0) < 0; }).reduce(function(s, i) { return s + Math.abs(i.total || 0); }, 0);

  // Group by month
  const months = {};
  allHistory.forEach(function(inv) {
    var _d = inv.date && inv.date !== "undefined" && inv.date !== "null"
      ? new Date(inv.date + "T00:00:00") : null;
    var key = _d && !isNaN(_d) ? _d.getFullYear() + '-' + String(_d.getMonth() + 1).padStart(2, '0') : 'unknown';
    if (!months[key]) months[key] = { invoices: [], label: '', total: 0 };
    months[key].invoices.push(inv);
    months[key].total += (inv.total || 0);
    if (_d && !isNaN(_d)) {
      months[key].label = _d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    } else {
      months[key].label = 'Unknown date';
    }
  });

  // Sort month keys newest first
  var sortedKeys = Object.keys(months).sort().reverse();

  function _buildInvRow(inv) {
    var changes = [];
    if (inv.updatedCount)
      changes.push('<span style="color:var(--green)">' + inv.updatedCount + " updated</span>");
    if (inv.addedCount)
      changes.push('<span style="color:var(--blue)">' + inv.addedCount + " added</span>");
    var _d = inv.date && inv.date !== "undefined" && inv.date !== "null"
      ? new Date(inv.date + "T00:00:00") : null;
    var dateStr = _d && !isNaN(_d)
      ? _d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
      : "—";
    var fileName = inv.fileName
      ? '<span style="font-size:10px;color:var(--text-muted)">' + escHtml(inv.fileName) + "</span>"
      : "";
    var isCredit = inv.isCredit || (inv.total || 0) < 0;
    var totalCol = isCredit ? 'var(--red)' : 'var(--accent)';
    var creditBadge = isCredit ? '<span style="font-size:9px;font-weight:700;background:rgba(239,68,68,.15);color:var(--red);padding:1px 5px;border-radius:3px;margin-left:4px">CREDIT</span>' : '';
    var creditAppliedBadge = inv.creditApplied ? '<span style="font-size:9px;font-weight:400;color:var(--red);margin-left:4px">(-' + fmt(inv.creditApplied) + ' credit)</span>' : '';
    return (
      '<tr class="invoice-history-row" data-sup="' + escAttr(sup.id) + '" data-inv="' + escAttr(inv.id) + '">' +
      '<td class="inv-td" style="white-space:nowrap">' + dateStr + "</td>" +
      '<td class="inv-td" style="overflow:hidden;min-width:0">' +
      '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">' +
      '<span style="font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
      escHtml(inv.invoiceNumber && inv.invoiceNumber !== "undefined" && inv.invoiceNumber !== "null" ? inv.invoiceNumber : "—") +
      "</span>" + creditBadge +
      (inv.total ? '<span style="color:' + totalCol + ';font-weight:700;font-size:12px;white-space:nowrap">' + fmt(Math.abs(inv.total)) + (isCredit ? ' CR' : '') + "</span>" : "") + creditAppliedBadge +
      "</div>" +
      (changes.length ? '<div style="margin-top:2px;display:flex;gap:4px;flex-wrap:wrap">' + changes.map(function(c) { return '<span style="font-size:10px">' + c + "</span>"; }).join("") + "</div>" : "") +
      (fileName ? '<div style="margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + fileName + "</div>" : "") +
      "</td>" +
      '<td class="inv-td" style="white-space:nowrap;text-align:right;vertical-align:middle">' +
      '<button class="btn-secondary btn-sm inv-view-btn" data-sup="' + escAttr(sup.id) + '" data-inv="' + escAttr(inv.id) + '">View</button>' +
      '<button class="btn-icon danger inv-del-btn" data-sup="' + escAttr(sup.id) + '" data-inv="' + escAttr(inv.id) + '" title="Delete" style="margin-left:6px;width:22px;height:22px;font-size:12px;display:inline-flex;align-items:center;justify-content:center">✕</button>' +
      "</td></tr>"
    );
  }

  var monthSections = sortedKeys.map(function(key) {
    var m = months[key];
    var monthTotal = m.total;
    var invoiceCount = m.invoices.length;
    var monthRows = m.invoices.map(_buildInvRow).join('');
    var totalCol = monthTotal < 0 ? 'var(--red)' : 'var(--accent)';
    return '<div class="inv-month-group" style="margin-bottom:4px">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:var(--bg-sidebar);border-radius:var(--radius-sm);margin-bottom:2px;cursor:pointer" onclick="this.parentElement.querySelector(\'.inv-month-body\').classList.toggle(\'hidden\')">'
      + '<span style="font-size:11px;font-weight:700;color:var(--text-secondary)">' + escHtml(m.label) + ' <span style="font-weight:400;color:var(--text-muted)">(' + invoiceCount + ')</span></span>'
      + '<span style="font-size:11px;font-weight:700;color:' + totalCol + '">' + fmt(Math.abs(monthTotal)) + (monthTotal < 0 ? ' CR' : '') + '</span>'
      + '</div>'
      + '<table class="inv-month-body" style="width:100%;border-collapse:collapse;font-size:11px">'
      + '<colgroup><col style="width:60px"><col style="min-width:0"><col style="width:88px"></colgroup>'
      + '<tbody>' + monthRows + '</tbody></table></div>';
  }).join('');

  var summaryLine = '<div style="display:flex;gap:12px;font-size:11px;margin-bottom:8px;padding:6px 8px;background:var(--bg-card2);border-radius:var(--radius-sm)">'
    + '<span style="color:var(--text-muted)">Total: <b style="color:var(--accent)">' + fmt(totalSpend) + '</b></span>'
    + (creditTotal > 0 ? '<span style="color:var(--text-muted)">Credits: <b style="color:var(--red)">' + fmt(creditTotal) + '</b></span>' : '')
    + '<span style="color:var(--text-muted)">' + allHistory.length + ' invoice' + (allHistory.length !== 1 ? 's' : '') + '</span>'
    + '</div>';

  return '<div class="inv-hist-wrap">' + summaryLine + monthSections + "</div>";
}

// Escape a value for use inside an HTML attribute (double-quoted)
function escAttr(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Event delegation for invoice rows — avoids all inline onclick issues
document.addEventListener("click", function (e) {
  // View button or row click
  const viewBtn = e.target.closest(".inv-view-btn");
  const row = e.target.closest(".invoice-history-row");
  const delBtn = e.target.closest(".inv-del-btn");
  if (delBtn) {
    e.stopPropagation();
    deleteInvoiceRecord(delBtn.dataset.sup, delBtn.dataset.inv);
    return;
  }
  if (viewBtn) {
    e.stopPropagation();
    openInvoiceDetail(viewBtn.dataset.sup, viewBtn.dataset.inv);
    return;
  }
  if (row && !e.target.closest("button")) {
    openInvoiceDetail(row.dataset.sup, row.dataset.inv);
  }
});

function openInvoiceDetail(supplierId, invoiceId) {
  const sup = state.suppliers.find((s) => s.id === supplierId);
  if (!sup) return;
  const inv = (sup.invoiceHistory || []).find((i) => i.id === invoiceId);
  if (!inv) return;

  const dateStr = inv.date
    ? new Date(inv.date + "T00:00:00").toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "—";
  const lines = inv.lines || [];

  let linesHtml;
  if (lines.length) {
    linesHtml =
      '<table class="dash-table" style="width:100%">' +
      "<thead><tr>" +
      "<th>Item on Invoice</th><th>Linked Ingredient</th>" +
      '<th style="text-align:right">Pack Size</th>' +
      '<th style="text-align:right">Pack Cost</th>' +
      '<th style="text-align:center">Status</th>' +
      "</tr></thead><tbody>" +
      lines
        .map(function (line) {
          const badge = line.wasAdded
            ? '<span style="font-size:10px;background:rgba(34,197,94,0.15);color:var(--green);border:1px solid rgba(34,197,94,0.3);padding:2px 7px;border-radius:3px;font-weight:700">Added</span>'
            : line.wasMatched
              ? '<span style="font-size:10px;background:var(--accent-bg);color:var(--accent);border:1px solid var(--accent-dim);padding:2px 7px;border-radius:3px;font-weight:700">Updated</span>'
              : '<span style="font-size:10px;background:var(--bg-card2);color:var(--text-muted);border:1px solid var(--border);padding:2px 7px;border-radius:3px">Skipped</span>';
          const packSizeStr = line.packSize
            ? line.packSize + " " + escHtml(line.unit || "")
            : "—";
          return (
            "<tr>" +
            '<td style="font-weight:600">' +
            escHtml(line.name) +
            "</td>" +
            '<td style="color:var(--text-muted);font-size:12px">' +
            (line.linkedName && line.linkedName !== line.name
              ? escHtml(line.linkedName)
              : "—") +
            "</td>" +
            '<td style="text-align:right;color:var(--text-secondary)">' +
            packSizeStr +
            "</td>" +
            '<td style="text-align:right;color:var(--accent);font-weight:700">' +
            fmt(line.packCost) +
            "</td>" +
            '<td style="text-align:center">' +
            badge +
            "</td>" +
            "</tr>"
          );
        })
        .join("") +
      "</tbody></table>";
  } else {
    linesHtml =
      '<div style="color:var(--text-muted);font-size:13px;padding:30px;text-align:center">' +
      '<div style="font-size:28px;margin-bottom:12px">📋</div>' +
      "No line items stored for this invoice.<br>" +
      '<span style="font-size:11px">Invoices scanned after this update will include full line detail.</span>' +
      "</div>";
  }

  var isCreditInv = inv.isCredit || (inv.total || 0) < 0;
  document.getElementById("invoice-detail-supplier").textContent = sup.name;
  document.getElementById("invoice-detail-number").innerHTML =
    escHtml(inv.invoiceNumber || "No invoice number") +
    (isCreditInv ? ' <span style="font-size:11px;font-weight:700;background:rgba(239,68,68,.15);color:var(--red);padding:2px 7px;border-radius:4px">CREDIT NOTE</span>' : '');
  document.getElementById("invoice-detail-date").textContent = dateStr;
  var _totalHtml = inv.total
    ? '<span style="color:' + (isCreditInv ? 'var(--red)' : 'var(--accent)') + ';font-weight:700">' + fmt(Math.abs(inv.total)) + (isCreditInv ? ' CR' : '') + '</span>'
    : "—";
  if (inv.creditApplied) {
    _totalHtml += ' <span style="font-size:11px;color:var(--red)">(-' + fmt(inv.creditApplied) + ' credit applied → net ' + fmt(Math.abs(inv.total) - inv.creditApplied) + ')</span>';
  }
  if (isCreditInv && inv.linkedInvoiceId) {
    var _linkedInv = (sup.invoiceHistory || []).find(function(i) { return i.id === inv.linkedInvoiceId; });
    if (_linkedInv) {
      _totalHtml += '<div style="font-size:11px;color:var(--text-secondary);margin-top:4px">Linked to invoice: <b>' + escHtml(_linkedInv.invoiceNumber || '—') + '</b></div>';
    }
  }
  document.getElementById("invoice-detail-total").innerHTML = _totalHtml;
  document.getElementById("invoice-detail-lines").innerHTML = linesHtml;
  document.getElementById("invoice-detail-modal").dataset.supplierId =
    supplierId;
  document.getElementById("invoice-detail-modal").dataset.invoiceId = invoiceId;
  document.getElementById("invoice-detail-modal").classList.remove("hidden");
}

function deleteInvoiceRecord(supplierId, invoiceId) {
  const sup = state.suppliers.find(function (s) {
    return s.id === supplierId;
  });
  if (!sup) return;
  sup.invoiceHistory = (sup.invoiceHistory || []).filter(function (i) {
    return i.id !== invoiceId;
  });
  save();
  renderSupplierList();
}

// ─── Ingredient Price Impact ───────────────────────────────────
function showPriceImpact(ingId) {
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!ing) return;

  // Find all recipes that use this ingredient
  const affected = [];
  state.recipes.forEach(function (recipe) {
    const ri = recipe.ingredients.find((r) => r.ingId === ingId);
    if (!ri) return;
    const currentCost = recipeTotalCost(recipe);
    const cpp = currentCost / (recipe.portions || 1);
    const currentSell =
      recipe.priceOverride || suggestPrice(cpp, state.activeGP);
    const currentGP = recipe.priceOverride
      ? ((recipe.priceOverride - cpp) / recipe.priceOverride) * 100
      : state.activeGP;
    const ingContrib = ingLineCost(ingId, ri.qty, ri.recipeUnit);
    affected.push({ recipe, ri, cpp, currentSell, currentGP, ingContrib });
  });

  const modal = document.getElementById("price-impact-modal");
  document.getElementById("price-impact-ing-name").textContent = ing.name;
  document.getElementById("price-impact-current-cost").textContent =
    fmt(ing.packCost) +
    " / " +
    ing.packSize +
    ing.unit +
    " = " +
    fmt(costPerUnit(ing)) +
    "/" +
    ing.unit;

  if (!affected.length) {
    document.getElementById("price-impact-body").innerHTML =
      '<div style="color:var(--text-muted);font-size:13px;padding:20px;text-align:center">This ingredient is not used in any recipes.</div>';
    modal.classList.remove("hidden");
    return;
  }

  // Render table with impact preview at different price changes
  const changes = [-20, -10, -5, 5, 10, 20, 30];
  let html =
    '<div style="margin-bottom:14px">' +
    '<label style="font-size:12px;font-weight:600;color:var(--text-secondary)">Simulate new pack cost: ' +
    '<input type="number" id="price-impact-sim" step="0.01" min="0" value="' +
    ing.packCost +
    '" ' +
    'style="background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);padding:4px 8px;border-radius:4px;font-size:13px;width:90px;outline:none" ' +
    'oninput="updatePriceImpactSim(' +
    JSON.stringify(ingId) +
    ')" /> ' +
    "(currently " +
    fmt(ing.packCost) +
    ")</label></div>";

  html +=
    '<div id="price-impact-results">' +
    buildPriceImpactTable(ing, affected, ing.packCost) +
    "</div>";
  document.getElementById("price-impact-body").innerHTML = html;
  modal.classList.remove("hidden");
}

function buildPriceImpactTable(ing, affected, newPackCost) {
  const newCPU = newPackCost / ing.packSize / ((ing.yieldPct || 100) / 100);
  const oldCPU = costPerUnit(ing);
  const diff = newCPU - oldCPU;
  let html =
    '<table class="dash-table" style="width:100%"><thead><tr>' +
    "<th>Recipe</th>" +
    '<th style="text-align:right">Cost/Portion now</th>' +
    '<th style="text-align:right">Cost/Portion new</th>' +
    '<th style="text-align:right">Change</th>' +
    '<th style="text-align:right">GP impact</th>' +
    "</tr></thead><tbody>";

  affected.forEach(function (a) {
    const ingChange = diff * a.ri.qty;
    const newCPP = a.cpp + ingChange;
    const newSell =
      a.recipe.priceOverride || suggestPrice(newCPP, state.activeGP);
    const newGP = a.recipe.priceOverride
      ? ((a.recipe.priceOverride - newCPP) / a.recipe.priceOverride) * 100
      : state.activeGP;
    const gpDiff = newGP - a.currentGP;
    const cppDiff = newCPP - a.cpp;
    const cppCol =
      cppDiff > 0
        ? "var(--red)"
        : cppDiff < 0
          ? "var(--green)"
          : "var(--text-muted)";
    const gpCol =
      gpDiff < 0
        ? "var(--red)"
        : gpDiff > 0
          ? "var(--green)"
          : "var(--text-muted)";
    html +=
      "<tr>" +
      '<td style="font-weight:600">' +
      escHtml(a.recipe.name) +
      "</td>" +
      '<td style="text-align:right">' +
      fmt(a.cpp) +
      "</td>" +
      '<td style="text-align:right">' +
      fmt(newCPP) +
      "</td>" +
      '<td style="text-align:right;color:' +
      cppCol +
      ';font-weight:600">' +
      (cppDiff >= 0 ? "+" : "") +
      fmt(cppDiff) +
      "</td>" +
      '<td style="text-align:right;color:' +
      gpCol +
      '">' +
      (gpDiff >= 0 ? "+" : "") +
      gpDiff.toFixed(1) +
      "% GP</td>" +
      "</tr>";
  });
  html += "</tbody></table>";

  if (newPackCost !== ing.packCost) {
    const totalCPPChange = affected.reduce((s, a) => s + diff * a.ri.qty, 0);
    const dir = totalCPPChange >= 0 ? "up" : "down";
    html =
      '<div style="padding:8px 12px;background:' +
      (totalCPPChange > 0 ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)") +
      ';border-radius:var(--radius-sm);margin-bottom:10px;font-size:12px;color:var(--text-secondary)">' +
      "Pack cost " +
      (newPackCost > ing.packCost ? "▲" : "▼") +
      " " +
      fmt(Math.abs(newPackCost - ing.packCost)) +
      " — affects <strong>" +
      affected.length +
      " recipe" +
      (affected.length !== 1 ? "s" : "") +
      "</strong>" +
      "</div>" +
      html;
  }
  return html;
}

function updatePriceImpactSim(ingId) {
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!ing) return;
  const newCost =
    parseFloat(document.getElementById("price-impact-sim")?.value) ||
    ing.packCost;
  const affected = [];
  state.recipes.forEach(function (recipe) {
    const ri = recipe.ingredients.find((r) => r.ingId === ingId);
    if (!ri) return;
    const cpp = recipeTotalCost(recipe) / (recipe.portions || 1);
    const currentSell =
      recipe.priceOverride || suggestPrice(cpp, state.activeGP);
    const currentGP = recipe.priceOverride
      ? ((recipe.priceOverride - cpp) / recipe.priceOverride) * 100
      : state.activeGP;
    affected.push({ recipe, ri, cpp, currentSell, currentGP });
  });
  const el = document.getElementById("price-impact-results");
  if (el) el.innerHTML = buildPriceImpactTable(ing, affected, newCost);
}

let editingSupplierId = null;
function openSupplierModal(id) {
  id = id || null;
  editingSupplierId = id;
  const sup = id ? state.suppliers.find((s) => s.id === id) : null;
  document.getElementById("supplier-modal-title").textContent = sup
    ? "Edit Supplier"
    : "Add Supplier";
  document.getElementById("sup-name").value = sup ? sup.name || "" : "";
  document.getElementById("sup-contact").value = sup ? sup.contact || "" : "";
  document.getElementById("sup-phone").value = sup ? sup.phone || "" : "";
  document.getElementById("sup-email").value = sup ? sup.email || "" : "";
  document.getElementById("sup-account").value = sup ? sup.account || "" : "";
  document.getElementById("sup-delivery").value = sup ? sup.delivery || "" : "";
  document.getElementById("sup-notes").value = sup ? sup.notes || "" : "";
  document.getElementById("supplier-modal").classList.remove("hidden");
  setTimeout(function () {
    document.getElementById("sup-name").focus();
  }, 50);
}
function closeSupplierModal() {
  document.getElementById("supplier-modal").classList.add("hidden");
  editingSupplierId = null;
}
function saveSupplier() {
  const name = document.getElementById("sup-name").value.trim();
  if (!name) {
    showToast("Please enter a supplier name", "error");
    return;
  }
  const data = {
    name: name,
    contact: document.getElementById("sup-contact").value.trim(),
    phone: document.getElementById("sup-phone").value.trim(),
    email: document.getElementById("sup-email").value.trim(),
    account: document.getElementById("sup-account").value.trim(),
    delivery: document.getElementById("sup-delivery").value.trim(),
    notes: document.getElementById("sup-notes").value.trim(),
  };
  if (editingSupplierId) {
    const idx = state.suppliers.findIndex((s) => s.id === editingSupplierId);
    state.suppliers[idx] = Object.assign({}, state.suppliers[idx], data);
  } else {
    state.suppliers.push(Object.assign({ id: uid() }, data));
  }
  closeSupplierModal();
  renderSupplierList();
  save();
  showToast(data.name + " saved", "success", 1500);
}
async function deleteSupplier(id) {
  if (
    !(await showConfirm(
      "Delete this supplier?",
      "Ingredients linked to them will be unlinked.",
    ))
  )
    return;
  state.ingredients.forEach(function (i) {
    if (i.supplierId === id) i.supplierId = null;
  });
  state.suppliers = state.suppliers.filter((s) => s.id !== id);
  renderSupplierList();
  save();
}

function populateSupplierDropdown(selectedId) {
  selectedId = selectedId || null;
  const sel = document.getElementById("ing-supplier");
  if (!sel) return;
  sel.innerHTML =
    '<option value="">— None —</option>' +
    state.suppliers
      .map(function (s) {
        return (
          '<option value="' +
          s.id +
          '"' +
          (s.id === selectedId ? " selected" : "") +
          ">" +
          escHtml(s.name) +
          "</option>"
        );
      })
      .join("");
}

// ─── Price History ─────────────────────────────────────────────
function logPriceChange(ing, oldCost, newCost) {
  if (!ing.priceHistory) ing.priceHistory = [];
  if (oldCost === newCost) return;
  // Store in unified format: { date, packCost } = the OLD price before the change
  // This matches the format used by quick-edit and invoice scanning
  ing.priceHistory.push({
    date: new Date().toISOString().slice(0, 10),
    packCost: oldCost,
    newCost: newCost,
    change: newCost - oldCost,
  });
}

// ─── Price Change Impact Alert ─────────────────────────────────
function checkPriceImpact(ing, oldCost, newCost) {
  if (!ing || oldCost === newCost || !oldCost || !newCost) return;
  const pctChange = ((newCost - oldCost) / oldCost) * 100;
  const cur = state.currency || "£";
  const target = getFoodCostTarget();
  // Find all recipes using this ingredient
  const affected = [];
  for (const r of state.recipes) {
    const ri = (r.ingredients || []).find((x) => x.ingId === ing.id);
    if (!ri) continue;
    const portions = r.portions || 1;
    const totalCost = recipeTotalCost(r);
    const cpp = totalCost / portions;
    const sellPrice = r.priceOverride || suggestPrice(cpp, state.activeGP);
    if (!sellPrice || sellPrice <= 0) continue;
    const foodCostPct = (cpp / sellPrice) * 100;
    affected.push({ recipe: r, cpp, foodCostPct, overTarget: foodCostPct > target });
  }
  if (!affected.length) return;
  const overCount = affected.filter((a) => a.overTarget).length;
  const dir = pctChange > 0 ? "↑" : "↓";
  const dirCol = pctChange > 0 ? "var(--red)" : "var(--green)";
  // Build notification
  let html =
    `<div id="price-impact-banner" style="position:fixed;bottom:24px;right:24px;width:380px;max-height:340px;` +
    `background:var(--bg-card);border:1px solid ${overCount ? "var(--red)" : "var(--border)"};border-radius:10px;` +
    `box-shadow:0 8px 32px rgba(0,0,0,0.3);z-index:999;overflow:hidden;font-family:var(--font)">` +
    `<div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">` +
    `<span style="font-size:14px">${overCount ? "⚠️" : "ℹ️"}</span>` +
    `<div style="flex:1;min-width:0">` +
    `<div style="font-size:12px;font-weight:700;color:var(--text-primary)">${escHtml(ing.name)} <span style="color:${dirCol}">${dir} ${Math.abs(pctChange).toFixed(1)}%</span></div>` +
    `<div style="font-size:11px;color:var(--text-muted)">${cur}${oldCost.toFixed(2)} → ${cur}${newCost.toFixed(2)} · affects ${affected.length} recipe${affected.length !== 1 ? "s" : ""}` +
    (overCount ? ` · <span style="color:var(--red);font-weight:700">${overCount} over target</span>` : "") + `</div>` +
    `</div>` +
    `<button onclick="document.getElementById('price-impact-banner')?.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:2px">✕</button>` +
    `</div>`;
  // Show affected recipes (max 6)
  const show = affected.sort((a, b) => b.foodCostPct - a.foodCostPct).slice(0, 6);
  html += '<div style="overflow-y:auto;max-height:240px;padding:6px 10px">';
  show.forEach((a) => {
    const col = a.overTarget ? "var(--red)" : "var(--green)";
    html +=
      `<div style="display:flex;align-items:center;gap:8px;padding:5px 4px;border-bottom:1px solid var(--border);cursor:pointer" ` +
      `onclick="selectRecipe('${a.recipe.id}');showView('recipes');document.getElementById('price-impact-banner')?.remove()">` +
      `<div style="flex:1;font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(a.recipe.name)}</div>` +
      `<div style="font-size:11px;color:var(--text-muted)">${cur}${a.cpp.toFixed(2)}/p</div>` +
      `<div style="font-size:11px;font-weight:700;color:${col}">${a.foodCostPct.toFixed(1)}%</div>` +
      `</div>`;
  });
  if (affected.length > 6)
    html += `<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:6px">+ ${affected.length - 6} more</div>`;
  html += "</div></div>";
  // Remove any existing banner first
  document.getElementById("price-impact-banner")?.remove();
  document.body.insertAdjacentHTML("beforeend", html);
  // Auto-dismiss after 12s
  setTimeout(() => document.getElementById("price-impact-banner")?.remove(), 12000);
}

function checkBulkPriceImpact(changes) {
  if (!changes.length) return;
  const target = getFoodCostTarget();
  const cur = state.currency || "£";
  invalidateCostCache();
  const affectedMap = new Map();
  for (const r of state.recipes) {
    const portions = r.portions || 1;
    const totalCost = recipeTotalCost(r);
    const cpp = totalCost / portions;
    const sellPrice = r.priceOverride || suggestPrice(cpp, state.activeGP);
    if (!sellPrice || sellPrice <= 0) continue;
    const uses = changes.some(({ ing }) => (r.ingredients || []).some((ri) => ri.ingId === ing.id));
    if (!uses) continue;
    const foodCostPct = (cpp / sellPrice) * 100;
    affectedMap.set(r.id, { recipe: r, cpp, foodCostPct, overTarget: foodCostPct > target });
  }
  const affected = [...affectedMap.values()];
  if (!affected.length) return;
  const overCount = affected.filter((a) => a.overTarget).length;
  let html =
    `<div id="price-impact-banner" style="position:fixed;bottom:24px;right:24px;width:380px;max-height:340px;` +
    `background:var(--bg-card);border:1px solid ${overCount ? "var(--red)" : "var(--border)"};border-radius:10px;` +
    `box-shadow:0 8px 32px rgba(0,0,0,0.3);z-index:999;overflow:hidden;font-family:var(--font)">` +
    `<div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">` +
    `<span style="font-size:14px">${overCount ? "⚠️" : "ℹ️"}</span>` +
    `<div style="flex:1;min-width:0">` +
    `<div style="font-size:12px;font-weight:700;color:var(--text-primary)">Bulk price update — ${changes.length} ingredients</div>` +
    `<div style="font-size:11px;color:var(--text-muted)">${affected.length} recipe${affected.length !== 1 ? "s" : ""} affected` +
    (overCount ? ` · <span style="color:var(--red);font-weight:700">${overCount} over target</span>` : "") + `</div>` +
    `</div>` +
    `<button onclick="document.getElementById('price-impact-banner')?.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:2px">✕</button>` +
    `</div>`;
  const show = affected.sort((a, b) => b.foodCostPct - a.foodCostPct).slice(0, 6);
  html += '<div style="overflow-y:auto;max-height:240px;padding:6px 10px">';
  show.forEach((a) => {
    const col = a.overTarget ? "var(--red)" : "var(--green)";
    html +=
      `<div style="display:flex;align-items:center;gap:8px;padding:5px 4px;border-bottom:1px solid var(--border);cursor:pointer" ` +
      `onclick="selectRecipe('${a.recipe.id}');showView('recipes');document.getElementById('price-impact-banner')?.remove()">` +
      `<div style="flex:1;font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(a.recipe.name)}</div>` +
      `<div style="font-size:11px;color:var(--text-muted)">${cur}${a.cpp.toFixed(2)}/p</div>` +
      `<div style="font-size:11px;font-weight:700;color:${col}">${a.foodCostPct.toFixed(1)}%</div>` +
      `</div>`;
  });
  if (affected.length > 6)
    html += `<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:6px">+ ${affected.length - 6} more</div>`;
  html += "</div></div>";
  document.getElementById("price-impact-banner")?.remove();
  document.body.insertAdjacentHTML("beforeend", html);
  setTimeout(() => document.getElementById("price-impact-banner")?.remove(), 15000);
}

function showPriceHistory(ingId) {
  const ing = state.ingredients.find((i) => i.id === ingId);
  if (!ing) return;
  document.getElementById("price-history-title").textContent =
    "Price History — " + ing.name;
  const history = (ing.priceHistory || []).slice().reverse();
  document.getElementById("price-history-body").innerHTML = history.length
    ? '<table class="dash-table" style="width:100%"><thead><tr><th>Date</th><th>Old Cost</th><th>New Cost</th><th>Change</th></tr></thead><tbody>' +
      history
        .map(function (h) {
          // Support both formats: {packCost, newCost} and legacy {oldCost, newCost}
          const oldPrice = h.packCost !== undefined ? h.packCost : h.oldCost;
          const newPrice = h.newCost !== undefined ? h.newCost : null;
          const change =
            newPrice !== null ? newPrice - oldPrice : h.change || 0;
          const col =
            change > 0
              ? "var(--red)"
              : change < 0
                ? "var(--green)"
                : "var(--text-muted)";
          return (
            "<tr><td>" +
            new Date(h.date).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }) +
            "</td>" +
            "<td>" +
            fmt(oldPrice) +
            "</td>" +
            "<td>" +
            (newPrice !== null ? fmt(newPrice) : "—") +
            "</td>" +
            '<td style="color:' +
            col +
            ';font-weight:600">' +
            (change >= 0 ? "+" : "") +
            fmt(change) +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table>"
    : '<div style="color:var(--text-muted);font-size:13px">No price changes recorded yet.</div>';
  document.getElementById("price-history-modal").classList.remove("hidden");
}

// ─── Invoice Scanner ───────────────────────────────────────────
let invoiceResults = [];

// ─── AI Settings ──────────────────────────────────────────────────────────────
const AI_MODELS = [
  { id: "claude", label: "Claude Sonnet", keyHint: "Anthropic key" },
  { id: "gemini-flash", label: "Gemini 2.5 Flash", keyHint: "Google key" },
  {
    id: "gemini-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    keyHint: "Google key",
  },
];

function getAiEnabled() {
  try {
    return (
      JSON.parse(localStorage.getItem("rc-ai-enabled") || "null") || [
        "claude",
        "gemini-flash",
        "gemini-flash-lite",
      ]
    );
  } catch (e) {
    return ["claude", "gemini-flash", "gemini-flash-lite"];
  }
}

// ─── In-memory API key cache ──────────────────────────────────────────────────
// Loaded from OS-encrypted storage (safeStorage) at startup via initApiKeys().
// Stays in memory — no further disk access for each key read.
let _apiKeys = {};

async function initApiKeys() {
  try {
    const keys = await window.electronAPI.loadAllApiKeys();
    _apiKeys = keys || {};
    // Migrate any keys that are still only in localStorage (first run after upgrade)
    for (const m of AI_MODELS) {
      const legacy = localStorage.getItem("rc-key-" + m.id);
      if (legacy && !_apiKeys[m.id]) {
        await window.electronAPI.saveApiKey(m.id, legacy);
        _apiKeys[m.id] = legacy;
        localStorage.removeItem("rc-key-" + m.id); // remove plaintext copy
      }
    }
  } catch (e) {
    _apiKeys = {};
  }
}

function getAiKey(modelId) {
  return _apiKeys[modelId] || "";
}

// ─── Single source of truth for active model/key ─────────────────────────────
function getNutrModel() {
  const saved = localStorage.getItem("rc-nutr-model");
  const sel = document.getElementById("nutr-model");
  const selected = sel?.value || saved || getActiveModel();
  if (getAiKey(selected)) {
    localStorage.setItem("rc-nutr-model", selected);
    return selected;
  }
  for (const m of AI_MODELS) { if (getAiKey(m.id)) return m.id; }
  return selected;
}
function updateNutrModelUI() {
  const sel = document.getElementById("nutr-model");
  const model = sel?.value || getNutrModel();
  if (sel) localStorage.setItem("rc-nutr-model", model);
  const statusEl = document.getElementById("nutr-ai-status");
  if (!statusEl) return;
  const hasKey = !!getAiKey(model);
  const isGemini = model.startsWith("gemini");
  statusEl.innerHTML = hasKey
    ? '<span style="color:var(--green);font-weight:700">✓ Key ready</span>'
    : `<span style="color:var(--red)">No key — add ${isGemini ? "Gemini" : "Claude"} key in Settings</span>`;
}
function getActiveModel() {
  // Check persisted selection first
  const saved = localStorage.getItem("rc-active-model");
  const sel = document.getElementById("inv-model");
  const selected = sel?.value || saved || "gemini-flash-lite";

  // If the selected model has a key, use it
  if (getAiKey(selected)) {
    localStorage.setItem("rc-active-model", selected);
    return selected;
  }
  // Otherwise fall back to whichever model has a key
  for (const m of AI_MODELS) {
    if (getAiKey(m.id)) return m.id;
  }
  return selected; // return selection anyway so error message names the right model
}
function getActiveKey() {
  const model = getActiveModel();
  return getAiKey(model);
}
async function saveAiKey(modelId) {
  const input = document.getElementById("ai-key-" + modelId);
  const key = input ? input.value.trim() : "";
  if (key) {
    _apiKeys[modelId] = key;
    await window.electronAPI.saveApiKey(modelId, key);
    showToast("✓ Key saved", "success", 1500);
    renderSettingsPage();
    rebuildModelDropdown();
  } else {
    showToast("Key is empty — use 🗑 to clear", "error", 2000);
  }
}
async function clearAiKey(modelId) {
  delete _apiKeys[modelId];
  await window.electronAPI.clearApiKey(modelId);
  const input = document.getElementById("ai-key-" + modelId);
  if (input) input.value = "";
  showToast("Key cleared", "success", 1500);
  renderSettingsPage();
  rebuildModelDropdown();
  updateInvoiceModelUI();
  updateNutrModelUI();
}
function clearInvoiceKey() {
  const model = document.getElementById("inv-model")?.value || "claude";
  clearAiKey(model);
}
function saveAiSettings() {
  const enabled = AI_MODELS.map((m) => m.id).filter((id) => {
    const cb = document.getElementById("ai-enable-" + id);
    return cb ? cb.checked : true;
  });
  if (enabled.length === 0) {
    showToast("Keep at least one model enabled", "error", 2000);
    return;
  }
  localStorage.setItem("rc-ai-enabled", JSON.stringify(enabled));
  rebuildModelDropdown();
  showToast("✓ Saved", "success", 1000);
}
function applyAiSettings() {
  saveAiSettings();
  rebuildModelDropdown();
  showToast("✓ AI settings saved", "success", 1500);
}
function _populateModelSelect(sel, storageKey, onChangeFn) {
  if (!sel) return;
  const enabled = getAiEnabled();
  const labels = {
    claude: "Claude Sonnet",
    "gemini-flash": "Gemini 2.5 Flash",
    "gemini-flash-lite": "Gemini 2.5 Flash-Lite",
  };
  const current = sel.value;
  sel.innerHTML = "";
  AI_MODELS.forEach(function (m) {
    if (!enabled.includes(m.id)) return;
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = labels[m.id] || m.label;
    sel.appendChild(opt);
  });
  const saved = localStorage.getItem(storageKey);
  if (saved && [...sel.options].some((o) => o.value === saved)) sel.value = saved;
  else if ([...sel.options].some((o) => o.value === current)) sel.value = current;
  sel.onchange = function () {
    localStorage.setItem(storageKey, this.value);
    onChangeFn();
  };
  onChangeFn();
}
function rebuildModelDropdown() {
  _populateModelSelect(
    document.getElementById("inv-model"), "rc-active-model", updateInvoiceModelUI
  );
  _populateModelSelect(
    document.getElementById("nutr-model"), "rc-nutr-model", updateNutrModelUI
  );
}
function openAiSettingsModal() {
  showView("settings");
}

function openBulkPastePrice() {
  const modal = document.getElementById("bulk-price-modal");
  if (!modal) return;
  document.getElementById("bulk-price-input").value = "";
  document.getElementById("bulk-price-preview").innerHTML = "";
  modal.classList.remove("hidden");
}

function parseBulkPrices() {
  const text = document.getElementById("bulk-price-input").value;
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const preview = document.getElementById("bulk-price-preview");

  const results = [];
  lines.forEach((line) => {
    // Accept formats: "chicken breast 4.95", "chicken breast, £4.95", "chicken breast: 4.95/kg"
    const match = line.match(/^(.+?)[\s,]+[£$€]?([\d.]+)/);
    if (!match) return;
    const name = match[1].trim().toLowerCase();
    const price = parseFloat(match[2]);
    if (isNaN(price) || price <= 0) return;

    // Find closest match in library
    const exact = state.ingredients.find((i) => i.name.toLowerCase() === name);
    const partial =
      !exact &&
      state.ingredients.find(
        (i) =>
          i.name.toLowerCase().includes(name) ||
          name.includes(i.name.toLowerCase()),
      );
    const ing = exact || partial;

    results.push({ line, name, price, ing, matched: !!ing });
  });

  if (!results.length) {
    preview.innerHTML =
      '<div style="color:var(--text-muted);font-size:12px">No valid lines found. Format: "ingredient name, price"</div>';
    return;
  }

  preview.innerHTML = `
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">${results.filter((r) => r.matched).length} of ${results.length} lines matched to your library</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="color:var(--text-muted)">
        <th style="text-align:left;padding:3px 6px">Ingredient</th>
        <th style="text-align:right;padding:3px 6px">Old Price</th>
        <th style="text-align:right;padding:3px 6px">New Price</th>
        <th style="text-align:right;padding:3px 6px">Change</th>
      </tr></thead>
      <tbody>
        ${results
          .map((r) => {
            if (!r.matched)
              return `<tr><td style="padding:4px 6px;color:var(--text-muted);font-style:italic" colspan="4">⚠ "${escHtml(r.name)}" — not found in library</td></tr>`;
            const diff = r.price - r.ing.packCost;
            const pct = r.ing.packCost > 0 ? (diff / r.ing.packCost) * 100 : 0;
            const col =
              diff > 0
                ? "var(--red)"
                : diff < 0
                  ? "var(--green)"
                  : "var(--text-muted)";
            return `<tr style="border-top:1px solid var(--border)">
            <td style="padding:4px 6px;font-weight:600">${escHtml(r.ing.name)}</td>
            <td style="padding:4px 6px;text-align:right;color:var(--text-muted)">${fmt(r.ing.packCost)}</td>
            <td style="padding:4px 6px;text-align:right;font-weight:600">${fmt(r.price)}</td>
            <td style="padding:4px 6px;text-align:right;color:${col}">${diff >= 0 ? "+" : ""}${pct.toFixed(0)}%</td>
          </tr>`;
          })
          .join("")}
      </tbody>
    </table>
    ${results.filter((r) => r.matched).length > 0 ? `<button class="btn-primary" style="width:100%;margin-top:12px" onclick="applyBulkPrices()">✓ Apply ${results.filter((r) => r.matched).length} Price Updates</button>` : ""}`;

  // Store results for apply
  document.getElementById("bulk-price-modal").dataset.pending = JSON.stringify(
    results
      .filter((r) => r.matched)
      .map((r) => ({ ingId: r.ing.id, price: r.price })),
  );
}

function applyBulkPrices() {
  const modal = document.getElementById("bulk-price-modal");
  const pending = JSON.parse(modal.dataset.pending || "[]");
  let updated = 0;
  const changes = [];
  pending.forEach(({ ingId, price }) => {
    const ing = state.ingredients.find((i) => i.id === ingId);
    if (!ing || ing.packCost === price) return;
    const oldCost = ing.packCost;
    if (!ing.priceHistory) ing.priceHistory = [];
    ing.priceHistory.push({
      date: new Date().toISOString().slice(0, 10),
      packCost: ing.packCost,
    });
    ing.packCost = price;
    changes.push({ ing, oldCost, newCost: price });
    updated++;
  });
  modal.classList.add("hidden");
  save();
  renderIngredientLibrary && renderIngredientLibrary();
  if (state.activeRecipeId) renderRecipeEditor();
  showToast(
    `✓ ${updated} ingredient price${updated !== 1 ? "s" : ""} updated`,
    "success",
    2500,
  );
  // Show impact for the biggest price change
  if (changes.length === 1) checkPriceImpact(changes[0].ing, changes[0].oldCost, changes[0].newCost);
  else if (changes.length > 1) checkBulkPriceImpact(changes);
}

async function loadBackupList() {
  const statusEl = document.getElementById("backup-list-status");
  const listEl = document.getElementById("backup-list");
  if (!listEl) return;
  if (statusEl) statusEl.textContent = "Loading…";
  listEl.innerHTML = "";
  try {
    const backups = await window.electronAPI.listBackups();
    if (statusEl)
      statusEl.textContent = backups.length
        ? backups.length + " backup(s) available"
        : "No auto-backups yet — one is created with each save.";
    backups.forEach((b) => {
      // Parse timestamp from filename: recipe-data-2026-03-31T12-34-56.enc
      const ts = b.name
        .replace("recipe-data-", "")
        .replace(".enc", "")
        .replace(".json", "");
      const display = ts
        .replace("T", " ")
        .replace(/-(?=\d\d:|\d\d-\d\d$)/g, ":")
        .slice(0, 16);
      const kb = Math.round(b.size / 1024);
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-sm)";
      row.innerHTML = `
        <div>
          <div style="font-size:13px;font-weight:600;font-family:monospace">${escHtml(display)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${kb} KB · ${escHtml(b.name)}</div>
        </div>
        <button class="btn-secondary btn-sm" onclick="restoreFromBackup('${escHtml(b.name)}')" style="flex-shrink:0">↩ Restore</button>`;
      listEl.appendChild(row);
    });
  } catch (e) {
    if (statusEl) statusEl.textContent = "Could not load backups: " + e.message;
  }
}

async function restoreFromBackup(filename) {
  if (
    !confirm(
      'Restore from backup "' +
        filename +
        '"?\n\nYour current data will be saved as a pre-restore backup first, then the app will reload.',
    )
  )
    return;
  try {
    await window.electronAPI.restoreBackup(filename);
    showToast("✓ Backup restored — reloading…", "success", 2000);
    setTimeout(() => location.reload(), 1800);
  } catch (e) {
    showToast("Restore failed: " + e.message, "error", 4000);
  }
}

// ─── Cloud Sync / Folder Backup ─────────────────────────────────
function _getSyncSettings() {
  try {
    const raw = localStorage.getItem('cloudSyncSettings');
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}
function _saveSyncSettings(s) {
  localStorage.setItem('cloudSyncSettings', JSON.stringify(s));
}

async function chooseSyncFolder() {
  const folder = await window.electronAPI.chooseSyncFolder();
  if (!folder) return;
  const s = _getSyncSettings();
  s.folder = folder;
  _saveSyncSettings(s);
  _renderSyncUI();
  showToast('Sync folder set: ' + folder, 'success', 3000);
}

function clearSyncFolder() {
  if (!confirm('Disconnect cloud sync folder? Existing backups in the folder will not be deleted.')) return;
  const s = _getSyncSettings();
  delete s.folder;
  s.autoSync = false;
  _saveSyncSettings(s);
  _renderSyncUI();
  showToast('Cloud sync disconnected', 'info', 2000);
}

function openSyncFolder() {
  const s = _getSyncSettings();
  if (s.folder) window.electronAPI.openFolder(s.folder);
}

function toggleAutoSync() {
  const s = _getSyncSettings();
  const cb = document.getElementById('sync-auto-toggle');
  s.autoSync = cb ? cb.checked : false;
  _saveSyncSettings(s);
  showToast(s.autoSync ? 'Auto-sync enabled' : 'Auto-sync disabled', 'info', 2000);
}

async function runSyncNow() {
  const s = _getSyncSettings();
  if (!s.folder) { showToast('No sync folder selected', 'error'); return; }
  const statusEl = document.getElementById('sync-status');
  if (statusEl) statusEl.textContent = 'Syncing…';
  try {
    const data = {
      recipes: state.recipes,
      ingredients: state.ingredients,
      suppliers: state.suppliers,
      settings: {
        currency: state.currency,
        activeGP: state.activeGP,
        vatRate: state.vatRate,
        recipeCategories: state.recipeCategories
      },
      exportDate: new Date().toISOString(),
      version: state.version || '0.0.12'
    };
    const result = await window.electronAPI.syncBackupToFolder(s.folder, data);
    if (result.error) {
      showToast('Sync failed: ' + result.error, 'error', 4000);
      if (statusEl) statusEl.textContent = 'Last sync failed: ' + result.error;
    } else {
      s.lastSync = new Date().toISOString();
      _saveSyncSettings(s);
      showToast('✓ Synced to cloud folder', 'success', 2500);
      _renderSyncUI();
    }
  } catch(e) {
    showToast('Sync failed: ' + e.message, 'error', 4000);
    if (statusEl) statusEl.textContent = 'Sync error: ' + e.message;
  }
}

async function _renderSyncUI() {
  const s = _getSyncSettings();
  const pathEl = document.getElementById('sync-folder-path');
  const controlsEl = document.getElementById('sync-controls');
  const openBtn = document.getElementById('btn-open-sync-folder');
  const autoToggle = document.getElementById('sync-auto-toggle');
  const statusEl = document.getElementById('sync-status');
  const listEl = document.getElementById('sync-backup-list');

  if (!pathEl) return;

  if (s.folder) {
    pathEl.textContent = s.folder;
    pathEl.title = s.folder;
    if (controlsEl) controlsEl.style.display = 'block';
    if (openBtn) openBtn.style.display = '';
    if (autoToggle) autoToggle.checked = !!s.autoSync;
    if (statusEl) {
      statusEl.textContent = s.lastSync
        ? 'Last synced: ' + new Date(s.lastSync).toLocaleString()
        : 'Never synced — click "Sync Now" to create first backup';
    }

    // Load cloud backup list
    if (listEl) {
      try {
        const backups = await window.electronAPI.listSyncBackups(s.folder);
        if (backups.length) {
          listEl.innerHTML = backups.slice(0, 10).map(function(b) {
            const date = new Date(b.mtime).toLocaleString();
            const sizeKB = (b.size / 1024).toFixed(0);
            return '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-sm)">'
              + '<span style="font-size:12px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary)">' + escHtml(b.name) + '</span>'
              + '<span style="font-size:11px;color:var(--text-muted);flex-shrink:0">' + sizeKB + ' KB · ' + date + '</span>'
              + '<button class="btn-secondary btn-sm" onclick="restoreSyncBackup(\'' + escHtml(b.name) + '\')" style="font-size:11px;flex-shrink:0">Restore</button>'
              + '</div>';
          }).join('');
        } else {
          listEl.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">No backups in sync folder yet</div>';
        }
      } catch(e) {
        listEl.innerHTML = '<div style="font-size:12px;color:var(--red)">Could not read sync folder</div>';
      }
    }
  } else {
    pathEl.textContent = 'No folder selected';
    if (controlsEl) controlsEl.style.display = 'none';
    if (openBtn) openBtn.style.display = 'none';
  }
}

async function restoreSyncBackup(filename) {
  const s = _getSyncSettings();
  if (!s.folder) return;
  if (!confirm('Restore from cloud backup "' + filename + '"?\n\nThis will replace all current data. A local backup will be made first.')) return;
  try {
    const result = await window.electronAPI.restoreSyncBackup(s.folder, filename);
    if (result.error) { showToast('Restore failed: ' + result.error, 'error', 4000); return; }
    // Apply the data
    const data = result.data;
    if (data.recipes) state.recipes = data.recipes;
    if (data.ingredients) state.ingredients = data.ingredients;
    if (data.suppliers) state.suppliers = data.suppliers;
    if (data.settings) {
      if (data.settings.currency) state.currency = data.settings.currency;
      if (data.settings.activeGP) state.activeGP = data.settings.activeGP;
      if (data.settings.vatRate !== undefined) state.vatRate = data.settings.vatRate;
      if (data.settings.recipeCategories) state.recipeCategories = data.settings.recipeCategories;
    }
    await save();
    showToast('✓ Cloud backup restored — reloading…', 'success', 2000);
    setTimeout(function() { location.reload(); }, 1800);
  } catch(e) {
    showToast('Restore failed: ' + e.message, 'error', 4000);
  }
}

function renderSettingsPage() {
  renderPinStatus();
  loadBackupList();
  _renderSyncUI();
  // Location count
  const locCountEl = document.getElementById("settings-loc-count");
  if (locCountEl) {
    const lc = (state.locations || []).length;
    locCountEl.textContent = lc ? lc + " location" + (lc !== 1 ? "s" : "") + " configured" : "No locations yet — using default";
  }
  // AI models
  const enabled = getAiEnabled();
  AI_MODELS.forEach(function (m) {
    const cb = document.getElementById("ai-enable-" + m.id);
    if (cb) cb.checked = enabled.includes(m.id);
    const ki = document.getElementById("ai-key-" + m.id);
    if (ki) ki.value = getAiKey(m.id);
    const st = document.getElementById("ai-key-status-" + m.id);
    if (st) {
      const hasKey = !!getAiKey(m.id);
      st.innerHTML = hasKey
        ? '<span style="color:var(--green);font-weight:700">✓ Saved</span>'
        : '<span style="color:var(--text-muted)">No key</span>';
    }
  });
  // USDA key
  const usdaKeySettingsEl = document.getElementById("usda-key-input-settings");
  if (usdaKeySettingsEl) usdaKeySettingsEl.value = getAiKey("usda");
  const usdaStatusSettingsEl = document.getElementById("usda-key-status-settings");
  if (usdaStatusSettingsEl) {
    usdaStatusSettingsEl.innerHTML = getAiKey("usda")
      ? '<span style="color:var(--green);font-weight:700">✓ Saved</span>'
      : '<span style="color:var(--text-muted)">No key</span>';
  }

  // General settings
  const currEl = document.getElementById("setting-currency");
  if (currEl) currEl.value = state.currency || "£";
  const vatEl = document.getElementById("setting-vat");
  if (vatEl) vatEl.value = state.vatRate !== undefined ? state.vatRate : 20;
  const fcEl = document.getElementById("setting-food-cost-target");
  if (fcEl) fcEl.value = state.foodCostTarget || 30;
  const gpEl = document.getElementById("setting-default-gp");
  if (gpEl) gpEl.value = state.activeGP || 70;
  const dmEl = document.getElementById("setting-dark-mode");
  if (dmEl) dmEl.checked = !!state.darkMode;
  const wdEl = document.getElementById("setting-warn-duplicates");
  if (wdEl) wdEl.checked = state.warnDuplicates !== false;
}

async function saveUsdaKeySettings() {
  const key = (document.getElementById("usda-key-input-settings")?.value || "").trim();
  if (!key) { showToast("Key is empty — use 🗑 to clear", "error", 2000); return; }
  _apiKeys["usda"] = key;
  await window.electronAPI.saveApiKey("usda", key);
  showToast("✓ USDA key saved", "success", 1500);
  renderSettingsPage();
}
async function clearUsdaKeySettings() {
  delete _apiKeys["usda"];
  await window.electronAPI.clearApiKey("usda");
  const inp = document.getElementById("usda-key-input-settings");
  if (inp) inp.value = "";
  showToast("USDA key cleared", "success", 1500);
  renderSettingsPage();
}

function flashSettingsSaved() {
  const el = document.getElementById("settings-save-status");
  if (!el) return;
  el.textContent = "✓ Saved";
  clearTimeout(window._settingsSaveTimer);
  window._settingsSaveTimer = setTimeout(() => {
    el.textContent = "";
  }, 2000);
}

function saveGeneralSettings() {
  const currency = document.getElementById("setting-currency")?.value || "£";
  const vatRate = Math.min(
    100,
    Math.max(
      0,
      parseFloat(document.getElementById("setting-vat")?.value) || 20,
    ),
  );
  const foodCost = Math.min(
    100,
    Math.max(
      1,
      parseFloat(document.getElementById("setting-food-cost-target")?.value) ||
        30,
    ),
  );
  const defaultGP = Math.min(
    99,
    Math.max(
      1,
      parseFloat(document.getElementById("setting-default-gp")?.value) || 70,
    ),
  );
  const darkMode =
    document.getElementById("setting-dark-mode")?.checked || false;
  const warnDuplicates =
    document.getElementById("setting-warn-duplicates")?.checked !== false;

  state.currency = currency;
  state.vatRate = vatRate;
  state.foodCostTarget = foodCost;
  state.activeGP = defaultGP;
  state.darkMode = darkMode;
  state.warnDuplicates = warnDuplicates;

  applyDarkMode(darkMode);
  save();
  showToast("✓ Settings saved", "success", 1500);
  // Refresh recipe editor GP if open
  const recipe = getActiveRecipe();
  if (recipe) renderRecipeEditor();
}

function openInvoiceModal(supplierId) {
  supplierId = supplierId || null;
  invoiceResults = [];

  // Reset header fields
  document.getElementById("inv-number").value = "";
  document.getElementById("inv-date").value = "";
  document.getElementById("inv-total").value = "";

  // Reset status and results area
  document.getElementById("invoice-status").textContent =
    "Upload invoice images or PDF. Select multiple files for multi-page invoices.";
  document.getElementById("invoice-results-body").innerHTML = "";
  document.getElementById("invoice-results").classList.add("hidden");

  // Reset buttons
  document.getElementById("invoice-scan-btn").classList.remove("hidden");
  document.getElementById("invoice-apply-btn").classList.add("hidden");

  // Clear stored modal metadata from previous scan
  const modal = document.getElementById("invoice-modal");
  modal.dataset.supplierId = supplierId || "";
  modal.dataset.fileName = "";
  modal.dataset.invoiceNumber = "";
  modal.dataset.invoiceDate = "";
  modal.dataset.invoiceTotal = "";

  // Reset credit note checkbox and remove any old credit-link row
  var creditCb = document.getElementById("inv-credit-note");
  if (creditCb) {
    creditCb.checked = false;
    creditCb.onchange = function() { _toggleCreditLinkDropdown(supplierId); };
  }
  var oldCreditLink = document.getElementById("credit-link-row");
  if (oldCreditLink) oldCreditLink.remove();

  // Show manual button
  var manualBtn = document.getElementById("invoice-manual-btn");
  if (manualBtn) manualBtn.classList.remove("hidden");

  modal.classList.remove("hidden");
  rebuildModelDropdown();
  updateInvoiceModelUI();
}

function closeInvoiceModal() {
  // Cancel any in-flight progress animation
  if (window._invScanInterval) {
    clearInterval(window._invScanInterval);
    window._invScanInterval = null;
  }
  document.getElementById("invoice-modal").classList.add("hidden");
  // Reset scan button so it's ready next time
  document.getElementById("invoice-scan-btn").classList.remove("hidden");
  document.getElementById("invoice-apply-btn").classList.add("hidden");
}

function openManualInvoiceEntry() {
  const modal = document.getElementById("invoice-modal");
  const suppId = modal.dataset.supplierId;
  const isCredit = document.getElementById("inv-credit-note")?.checked || false;

  // Build manual entry form in results area
  const resultsBody = document.getElementById("invoice-results-body");
  const resultsWrap = document.getElementById("invoice-results");
  resultsWrap.classList.remove("hidden");
  document.getElementById("invoice-scan-btn").classList.add("hidden");
  document.getElementById("invoice-manual-btn").classList.add("hidden");
  document.getElementById("invoice-status").innerHTML =
    (isCredit ? '<span style="color:var(--red);font-weight:700">📋 Credit Note</span> — ' : '') +
    'Add line items manually. Each row is one ingredient from the invoice.';

  // Pre-fill date to today if empty
  var dateEl = document.getElementById("inv-date");
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);

  // Credit note: show "link to invoice" selector
  var _creditLinkHtml = '';
  if (isCredit && suppId) {
    var _sup = state.suppliers.find(function(s) { return s.id === suppId; });
    var _invoices = (_sup && _sup.invoiceHistory || []).filter(function(i) { return !i.isCredit && (i.total || 0) > 0; });
    _creditLinkHtml = '<div id="credit-link-row" style="margin-bottom:10px;padding:8px 10px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:var(--radius-sm)">'
      + '<label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Link credit to invoice (optional — if blank, deducts from month total)</label>'
      + '<select id="credit-linked-inv" style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:5px 6px;border-radius:4px">'
      + '<option value="">— No specific invoice (deduct from month) —</option>'
      + _invoices.map(function(inv) {
          var _d = inv.date ? new Date(inv.date + 'T00:00:00') : null;
          var _ds = _d && !isNaN(_d) ? _d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
          return '<option value="' + escAttr(inv.id) + '">' + escHtml(inv.invoiceNumber || '—') + ' — ' + _ds + ' — ' + fmt(Math.abs(inv.total || 0)) + '</option>';
        }).join('')
      + '</select></div>';
  }

  resultsBody.innerHTML =
    _creditLinkHtml
    + '<div id="manual-inv-lines" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px"></div>'
    + '<button class="btn-secondary btn-sm" onclick="_addManualInvLine()" style="margin-bottom:12px">+ Add line item</button>';

  // Add first empty line
  _addManualInvLine();

  // Show apply button
  document.getElementById("invoice-apply-btn").classList.remove("hidden");
  document.getElementById("invoice-apply-btn").textContent = isCredit ? 'Apply Credit Note' : 'Apply Invoice';
  document.getElementById("invoice-apply-btn").onclick = function() { applyManualInvoice(); };
}

function _toggleCreditLinkDropdown(suppId) {
  var isCredit = document.getElementById("inv-credit-note")?.checked || false;
  var existing = document.getElementById("credit-link-row");
  if (!isCredit) {
    if (existing) existing.remove();
    // Update apply button text if visible
    var applyBtn = document.getElementById("invoice-apply-btn");
    if (applyBtn && !applyBtn.classList.contains('hidden')) applyBtn.textContent = 'Apply Price Updates';
    return;
  }
  // Update apply button text
  var applyBtn = document.getElementById("invoice-apply-btn");
  if (applyBtn && !applyBtn.classList.contains('hidden')) applyBtn.textContent = 'Apply Credit Note';

  if (existing) return; // already shown
  if (!suppId) return;

  var _sup = state.suppliers.find(function(s) { return s.id === suppId; });
  var _invoices = (_sup && _sup.invoiceHistory || []).filter(function(i) { return !i.isCredit && (i.total || 0) > 0; });

  var linkDiv = document.createElement('div');
  linkDiv.id = 'credit-link-row';
  linkDiv.style.cssText = 'margin-bottom:10px;padding:8px 10px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:var(--radius-sm)';
  linkDiv.innerHTML = '<label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Link credit to invoice (optional — if blank, deducts from month total)</label>'
    + '<select id="credit-linked-inv" style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:5px 6px;border-radius:4px">'
    + '<option value="">— No specific invoice (deduct from month) —</option>'
    + _invoices.map(function(inv) {
        var _d = inv.date ? new Date(inv.date + 'T00:00:00') : null;
        var _ds = _d && !isNaN(_d) ? _d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        return '<option value="' + escAttr(inv.id) + '">' + escHtml(inv.invoiceNumber || '—') + ' — ' + _ds + ' — ' + fmt(Math.abs(inv.total || 0)) + '</option>';
      }).join('')
    + '</select>';

  // Insert at top of results body or before the status line
  var resultsBody = document.getElementById("invoice-results-body");
  if (resultsBody) {
    resultsBody.insertBefore(linkDiv, resultsBody.firstChild);
  }
}

var _manualInvLineIdx = 0;
function _addManualInvLine() {
  _manualInvLineIdx++;
  var container = document.getElementById("manual-inv-lines");
  if (!container) return;
  var idx = _manualInvLineIdx;

  var _inputStyle = 'background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:5px 6px;border-radius:4px;outline:none';

  var row = document.createElement('div');
  row.className = 'manual-inv-row';
  row.id = 'manual-inv-row-' + idx;
  row.style.cssText = 'display:flex;gap:6px;align-items:center;padding:8px 10px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-sm)';
  row.innerHTML =
    '<div style="flex:2;min-width:0;position:relative">'
    + '<input type="hidden" id="mil-ing-' + idx + '" value="">'
    + '<input type="text" id="mil-search-' + idx + '" placeholder="Search ingredient or type new…" autocomplete="off" style="width:100%;box-sizing:border-box;' + _inputStyle + '">'
    + '<div id="mil-dd-' + idx + '" style="display:none;position:absolute;top:100%;left:0;right:0;max-height:180px;overflow-y:auto;background:var(--bg-card);border:1px solid var(--border);border-radius:0 0 4px 4px;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,.25)"></div>'
    + '</div>'
    + '<input type="number" id="mil-cost-' + idx + '" placeholder="Pack cost" step="0.01" min="0" style="width:80px;' + _inputStyle + '">'
    + '<input type="number" id="mil-size-' + idx + '" placeholder="Pack size" step="any" min="0" style="width:72px;' + _inputStyle + '">'
    + '<select id="mil-unit-' + idx + '" style="width:60px;' + _inputStyle + '">'
    + '<option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">l</option><option value="each">each</option></select>'
    + '<button onclick="document.getElementById(\'manual-inv-row-' + idx + '\').remove()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;padding:2px 4px" title="Remove">✕</button>';
  container.appendChild(row);

  // Wire up searchable dropdown
  _initIngSearchDropdown(idx);
}

function _initIngSearchDropdown(idx) {
  var searchEl = document.getElementById('mil-search-' + idx);
  var hiddenEl = document.getElementById('mil-ing-' + idx);
  var ddEl = document.getElementById('mil-dd-' + idx);
  if (!searchEl || !ddEl) return;

  function renderDropdown(query) {
    var q = (query || '').toLowerCase();
    var matches = state.ingredients.filter(function(ing) {
      return !q || ing.name.toLowerCase().indexOf(q) !== -1;
    }).slice(0, 50);
    if (!matches.length) {
      ddEl.innerHTML = '<div style="padding:6px 8px;font-size:11px;color:var(--text-secondary)">No matches — name will be added as new ingredient</div>';
      ddEl.style.display = 'block';
      return;
    }
    ddEl.innerHTML = matches.map(function(ing) {
      return '<div class="mil-dd-item" data-id="' + escAttr(ing.id) + '" style="padding:5px 8px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--border);color:var(--text-primary)">'
        + escHtml(ing.name) + ' <span style="color:var(--text-secondary);font-size:10px">(' + ing.packSize + ing.unit + ' — ' + fmt(ing.packCost) + ')</span></div>';
    }).join('');
    ddEl.style.display = 'block';
  }

  searchEl.addEventListener('focus', function() { renderDropdown(searchEl.value); });
  searchEl.addEventListener('input', function() {
    hiddenEl.value = ''; // clear selection when user types
    renderDropdown(searchEl.value);
  });

  ddEl.addEventListener('mousedown', function(e) {
    var item = e.target.closest('.mil-dd-item');
    if (!item) return;
    e.preventDefault();
    var ingId = item.dataset.id;
    var ing = state.ingredients.find(function(i) { return i.id === ingId; });
    if (ing) {
      hiddenEl.value = ingId;
      searchEl.value = ing.name;
      // Auto-fill pack cost, size, unit
      var costEl = document.getElementById('mil-cost-' + idx);
      var sizeEl = document.getElementById('mil-size-' + idx);
      var unitEl = document.getElementById('mil-unit-' + idx);
      if (costEl && !costEl.value) costEl.value = ing.packCost || '';
      if (sizeEl && !sizeEl.value) sizeEl.value = ing.packSize || '';
      if (unitEl) unitEl.value = ing.unit || 'g';
    }
    ddEl.style.display = 'none';
  });

  searchEl.addEventListener('blur', function() {
    setTimeout(function() { ddEl.style.display = 'none'; }, 200);
  });
}

function applyManualInvoice() {
  var modal = document.getElementById("invoice-modal");
  var suppId = modal.dataset.supplierId;
  var isCredit = document.getElementById("inv-credit-note")?.checked || false;
  var container = document.getElementById("manual-inv-lines");
  if (!container) return;

  var rows = container.querySelectorAll('.manual-inv-row');
  var updated = 0, added = 0;
  var lines = [];
  var priceAlerts = [];

  rows.forEach(function(row) {
    var idx = row.id.replace('manual-inv-row-', '');
    var ingId = document.getElementById('mil-ing-' + idx)?.value || '';
    var searchVal = document.getElementById('mil-search-' + idx)?.value.trim() || '';
    var newName = ingId ? '' : searchVal; // if no ingredient selected, treat search text as new name
    var packCost = parseFloat(document.getElementById('mil-cost-' + idx)?.value) || 0;
    var packSize = parseFloat(document.getElementById('mil-size-' + idx)?.value) || 0;
    var unit = document.getElementById('mil-unit-' + idx)?.value || 'g';

    if (!packCost && !newName && !ingId) return; // skip empty rows

    if (isCredit) packCost = -Math.abs(packCost); // credit notes are negative

    if (ingId) {
      // Update existing ingredient
      var ing = state.ingredients.find(function(i) { return i.id === ingId; });
      if (ing) {
        if (!ing.altSuppliers) ing.altSuppliers = [];
        var isDefaultSupplier = !suppId || !ing.supplierId || ing.supplierId === suppId;
        var absCost = Math.abs(packCost);

        if (isDefaultSupplier && absCost > 0) {
          // Default supplier → update main ingredient price
          var oldCost = ing.packCost;
          ing.packCost = absCost;
          if (packSize > 0) ing.packSize = packSize;
          if (!ing.priceHistory) ing.priceHistory = [];
          ing.priceHistory.push({
            date: new Date().toISOString(),
            packCost: oldCost,
            newCost: absCost,
            source: isCredit ? 'credit-note' : 'manual-invoice'
          });
          if (suppId && !ing.supplierId) ing.supplierId = suppId;
          if (oldCost > 0) {
            var pctChange = ((absCost - oldCost) / oldCost) * 100;
            if (Math.abs(pctChange) >= 3) priceAlerts.push({ ing: ing, pctChange: pctChange, oldCost: oldCost, newCost: absCost });
          }
        } else if (!isDefaultSupplier && absCost > 0) {
          // Different supplier → add/update as alt only, never touch default price
          var existingAlt = ing.altSuppliers.find(function(a) { return a.supplierId === suppId; });
          if (existingAlt) {
            existingAlt.packCost = absCost;
            if (packSize > 0) existingAlt.packSize = packSize;
          } else {
            ing.altSuppliers.push({
              supplierId: suppId,
              packSize: packSize || ing.packSize,
              packCost: absCost,
            });
          }
          if (!ing.priceHistory) ing.priceHistory = [];
          ing.priceHistory.push({
            date: new Date().toISOString(),
            packCost: existingAlt ? existingAlt.packCost : 0,
            newCost: absCost,
            source: (isCredit ? 'credit-note' : 'manual-invoice') + ' (alt supplier)'
          });
        }
        updated++;
        lines.push({ name: ing.name, linkedName: ing.name, packCost: absCost, packSize: ing.packSize, unit: ing.unit, wasMatched: true, wasAdded: false, wasAddedAsAlt: !isDefaultSupplier });
      }
    } else if (newName) {
      // Add as new ingredient
      var newIng = {
        id: uid(),
        name: newName,
        category: '',
        packCost: Math.abs(packCost),
        packSize: packSize || 1,
        unit: unit,
        yieldPct: 100,
        allergens: [],
        priceHistory: [],
        altSuppliers: [],
        supplierId: suppId || null,
      };
      state.ingredients.push(newIng);
      added++;
      lines.push({ name: newName, linkedName: newName, packCost: Math.abs(packCost), packSize: newIng.packSize, unit: unit, wasMatched: false, wasAdded: true, wasAddedAsAlt: false });
    }
  });

  if (!updated && !added) { showToast('No items to apply', 'error', 2000); return; }

  // Save invoice record
  if (suppId) {
    var sup = state.suppliers.find(function(s) { return s.id === suppId; });
    if (sup) {
      if (!sup.invoiceHistory) sup.invoiceHistory = [];
      var invNum = document.getElementById('inv-number').value.trim();
      var invDate = document.getElementById('inv-date').value.trim();
      var invTotal = parseFloat(document.getElementById('inv-total').value) || 0;
      if (isCredit && invTotal > 0) invTotal = -invTotal;

      // Credit note linkage
      var linkedInvId = '';
      if (isCredit) {
        var linkEl = document.getElementById('credit-linked-inv');
        linkedInvId = linkEl ? linkEl.value : '';
        // If linked to a specific invoice, deduct from that invoice's recorded total
        if (linkedInvId) {
          var linkedInv = sup.invoiceHistory.find(function(i) { return i.id === linkedInvId; });
          if (linkedInv) {
            linkedInv.creditApplied = (linkedInv.creditApplied || 0) + Math.abs(invTotal);
          }
        }
      }

      sup.invoiceHistory.unshift({
        id: uid(),
        invoiceNumber: (isCredit ? 'CR: ' : '') + (invNum || '—'),
        date: invDate || new Date().toISOString().slice(0, 10),
        total: invTotal,
        itemCount: lines.length,
        updatedCount: updated,
        addedCount: added,
        fileName: isCredit ? 'Credit Note (manual)' : 'Manual entry',
        scannedAt: new Date().toISOString(),
        isCredit: isCredit,
        linkedInvoiceId: linkedInvId || null,
        lines: lines,
      });
    }
  }

  save();
  invalidateMaps();
  document.getElementById("invoice-modal").classList.add("hidden");
  if (state.activeRecipeId) renderRecipeEditor();
  renderIngredientLibrary();
  if (suppId) renderSupplierList();

  var msg = isCredit
    ? '✓ Credit note applied: ' + updated + ' updated, ' + added + ' added'
    : '✓ Manual invoice applied: ' + updated + ' updated, ' + added + ' added';
  showToast(msg, 'success', 3000);

  if (priceAlerts.length) {
    checkBulkPriceImpact(priceAlerts.map(function(a) { return { ing: a.ing, oldCost: a.oldCost, newCost: a.newCost }; }));
  }
}

function updateInvoiceModelUI() {
  const model = document.getElementById("inv-model")?.value || "claude";
  const statusEl = document.getElementById("inv-key-status");
  if (!statusEl) return;
  const hasKey = !!getAiKey(model);
  const isGemini = model === "gemini-flash" || model === "gemini-flash-lite";
  if (hasKey) {
    statusEl.innerHTML =
      '<span style="color:var(--green);font-size:11px">✓ Key set</span>';
  } else {
    statusEl.innerHTML =
      '<span style="color:var(--red);font-size:11px">✗ No key — go to Settings to add</span>';
  }
}

function saveInvoiceKey() {
  const model = document.getElementById("inv-model")?.value || "claude";
  const key = document.getElementById("inv-api-key")?.value.trim() || "";
  if (key) {
    localStorage.setItem("rc-key-" + model, key);
    showToast("✓ Key saved", "success", 1500);
  } else {
    showToast("Key is empty — use 🗑 to clear", "error", 2000);
  }
  updateInvoiceModelUI();
}

function getInvoiceKey() {
  const model = document.getElementById("inv-model")?.value || "claude";
  const inline = document.getElementById("inv-api-key")?.value.trim();
  return inline || getAiKey(model) || "";
}

// ─── Text-only AI helper — proxied through main process ───────────────────────
async function callGeminiText(prompt, maxTokens) {
  const model = getActiveModel();
  const key = getActiveKey();
  if (!key)
    throw new Error(
      "No API key found for " + model + ". Add it in Settings → AI Models.",
    );
  const text = await window.electronAPI.callAi(
    model,
    prompt,
    key,
    maxTokens || 1000,
  );
  return text.replace(/```json|```/g, "").trim();
}

function buildInvoicePrompt(categories) {
  return (
    "This is a supplier invoice or delivery note. Extract each product line and return ONLY valid JSON, no markdown, no explanation.\n\n" +
    '{"invoiceNumber":"","invoiceDate":"YYYY-MM-DD or empty","invoiceTotal":0.00,"items":[{"name":"product name","unitPrice":0.00,"deliveredQty":1,"packSize":0,"unit":"g|ml|each","category":"","libraryMatch":null}]}' +
    "\n\nCRITICAL RULES:\n" +
    '- invoiceNumber: look for Invoice No, Invoice #, Document Number, Doc No, Reference. Return as string (digits only, no prefix).\n' +
    '  FoodPoint: header box on every page shows "Invoice No: 295636" -> "295636". NOTE: in raw text this appears AFTER the line items.\n' +
    '  Brakes/Sysco: top-right box labeled "Document Number" e.g. "9352218620" -> "9352218620". Ignore "IHO" prefix in raw text.\n' +
    '  The raw text may concatenate number+date+total like "935221862025.03.2026127.84" — split them: number=9352218620, date=25.03.2026, total=127.84.\n' +
    '- invoiceDate: scan ALL pages for the date. Convert ANY format to YYYY-MM-DD.\n' +
    '  Slash formats (FoodPoint): 26/03/26->2026-03-26, 28/03/26->2026-03-28. NOTE: appears after line items in raw text.\n' +
    '  Dot formats (Brakes/Sysco): 25.03.2026->2026-03-25, 20.03.2026->2026-03-20.\n' +
    '  FoodPoint: "Invoice Date: 26/03/26" -> "2026-03-26". Brakes/Sysco: "Invoice Date" box top-right.\n' +
    "- invoiceTotal: look on ALL pages - totals are often on the LAST page.\n" +
    '  FoodPoint: LAST page has "Grand Total £692.32" -> 692.32 or "Grand Total £1134.87" -> 1134.87. Strip the £ symbol. Use Grand Total, NOT Total Net.\n' +
    '  Brakes/Sysco: bottom-right section labeled "INVOICE TOTAL" — use the Value (GBP) column total, e.g. 127.84. Food items are 0% VAT so net=gross.\n' +
    "- unitPrice: use the UNIT PRICE or Net column - NEVER the Value/Total column.\n" +
    "- deliveredQty: use the Qty or Delivered column. Default 1.\n" +
    "\n- packSize + unit:\n" +
    "  BULK (meat, veg, cheese, oil, milk, cream, juice, sauce) -> multiply all numbers, convert to g or ml:\n" +
    "    1x2kg->2000g, 4x2.5kg->10000g, 1x1ltr->1000ml, 10x220ml->2200ml, 8x1Ltr->8000ml\n" +
    "  PORTION (cans, biscuits, cubes, eggs, fish fingers, sachets, muffins, tortillas) -> count pieces, unit=each:\n" +
    "    1x60->60each, 1x300->300each, 24x150ml Coke->24each, 60x56g fish->60each, 4x30Ea eggs->120each\n" +
    "  FoodPoint packsize column: 1Ea->1each, 500g->500g, 2.5Kg->2500g, 2L->2000ml, 2.27Btl->2270ml, 1Tin->1each\n" +
    "\n- VERIFIED FoodPoint examples:\n" +
    "  Baked Beans A10 packsize=1Tin qty=12 net=3.50 -> packSize=1,unit=each,deliveredQty=12\n" +
    "  Mayonnaise 5L qty=1 net=8.20 -> packSize=5000,unit=ml,deliveredQty=1\n" +
    "  Rapeseed Oil 20L qty=2 net=26.00 -> packSize=20000,unit=ml,deliveredQty=2\n" +
    "  Cacklebean Eggs 4x30Ea Box qty=8 net=30.00 -> packSize=120,unit=each,deliveredQty=8\n" +
    "  Avocado Hass 18Ea qty=5 net=17.50 -> packSize=18,unit=each,deliveredQty=5\n" +
    "  Button Mushroom 2.5Kg qty=6 net=6.00 -> packSize=2500,unit=g,deliveredQty=6\n" +
    "  Whole Milk 2L qty=36 net=1.23 -> packSize=2000,unit=ml,deliveredQty=36\n" +
    "\n- VERIFIED Brakes/Sysco examples (columns: Brakes Code | Description | Case Qty | Unit Price | Value):\n" +
    "  Sysco Classic Sliced Ham 80% 1x454g caseQty=4 unitPrice=3.42 -> packSize=454,unit=g,deliveredQty=4,unitPrice=3.42\n" +
    "  Sysco Cl Mature White Cheddar min 4.75kg caseQty=1 unitPrice=31.79 -> packSize=4750,unit=g,deliveredQty=1,unitPrice=31.79\n" +
    "  Sysco Simply Falafel 1x1.4kg caseQty=1 unitPrice=13.68 -> packSize=1400,unit=g,deliveredQty=1,unitPrice=13.68\n" +
    "  Gosh Beetroot Falafel 2x1kg caseQty=1 unitPrice=27.01 -> packSize=2000,unit=g,deliveredQty=1,unitPrice=27.01\n" +
    "  Dry Cured Thick Cut Back Bacon 1x2kg caseQty=4 unitPrice=10.42 -> packSize=2000,unit=g,deliveredQty=4,unitPrice=10.42\n" +
    "- category: one of: " +
    categories.join(", ") +
    ". If unsure use Other.\n" +
    "- libraryMatch: if the item closely matches an ingredient in the library, return the EXACT library name. Otherwise null.\n" +
    "\nLibrary ingredients (name only):\n" +
    state.ingredients
      .map(function (i) {
        return i.name;
      })
      .join("\n")
  );
}

async function startInvoiceScan() {
  const results = await browserIPC.openInvoice();
  if (!results || !results.length) return;

  document.getElementById("invoice-modal").dataset.fileName = results
    .map((r) => r.name)
    .join(", ");
  document.getElementById("invoice-scan-btn").classList.add("hidden");

  const model = document.getElementById("inv-model")?.value || "claude";
  const pageLabel = results.length > 1 ? results.length + " pages" : "invoice";

  try {
    const modelName =
      model === "gemini-flash" || model === "gemini-flash-lite"
        ? "Gemini"
        : "Claude";
    const steps =
      results.length > 1
        ? [
            "Reading " + results.length + " pages…",
            "Extracting line items…",
            "Matching to your library…",
            "Almost done…",
          ]
        : [
            "Reading invoice…",
            "Extracting line items…",
            "Matching to your library…",
            "Almost done…",
          ];
    let _stepIdx = 0;
    document.getElementById("invoice-status").innerHTML =
      '<div style="display:flex;align-items:center;gap:10px">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" style="animation:spin 1s linear infinite;flex-shrink:0"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>' +
      '<span id="inv-progress-text" style="font-size:13px;color:var(--text-secondary)">' +
      steps[0] +
      "</span>" +
      '<span style="font-size:11px;color:var(--text-muted);margin-left:4px">via ' +
      modelName +
      "</span>" +
      "</div>" +
      '<div style="margin-top:8px;height:3px;background:var(--bg-card2);border-radius:2px;overflow:hidden">' +
      '<div id="inv-progress-bar" style="height:100%;width:0%;background:var(--accent);border-radius:2px;transition:width 0.8s ease"></div>' +
      "</div>";
    // Animate steps while waiting for AI
    const _stepInterval = setInterval(function () {
      _stepIdx = Math.min(_stepIdx + 1, steps.length - 1);
      const pct = Math.round((_stepIdx / (steps.length - 1)) * 80); // max 80% until done
      const el = document.getElementById("inv-progress-text");
      const bar = document.getElementById("inv-progress-bar");
      if (el) el.textContent = steps[_stepIdx];
      if (bar) bar.style.width = pct + "%";
      if (_stepIdx >= steps.length - 1) clearInterval(_stepInterval);
    }, 2800);
    window._invScanInterval = _stepInterval;

    const prompt = buildInvoicePrompt(getIngCategories());

    const apiKey = getInvoiceKey().trim();
    if (!apiKey)
      throw new Error(
        "No API key set. Go to ⚙ Settings to add your " +
          (model === "gemini-flash" || model === "gemini-flash-lite"
            ? "Google"
            : "Anthropic") +
          " API key.",
      );

    const files = results.map((r) => ({ base64: r.base64, mime: r.mime }));
    const data = await window.electronAPI.scanInvoice(
      files,
      prompt,
      model,
      apiKey,
    );
    const text = (data.content || [])
      .filter(function (b) {
        return b.type === "text";
      })
      .map(function (b) {
        return b.text;
      })
      .join("");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    const items = Array.isArray(parsed) ? parsed : parsed.items || [];
    const invoiceHeader = Array.isArray(parsed)
      ? {}
      : {
          invoiceNumber: parsed.invoiceNumber || "",
          invoiceDate: parsed.invoiceDate || "",
          invoiceTotal: parsed.invoiceTotal || 0,
        };
    const modal = document.getElementById("invoice-modal");
    modal.dataset.invoiceNumber = invoiceHeader.invoiceNumber;
    modal.dataset.invoiceDate = invoiceHeader.invoiceDate;
    modal.dataset.invoiceTotal = invoiceHeader.invoiceTotal;
    if (invoiceHeader.invoiceNumber)
      document.getElementById("inv-number").value = invoiceHeader.invoiceNumber;
    if (invoiceHeader.invoiceDate)
      document.getElementById("inv-date").value = invoiceHeader.invoiceDate;
    if (invoiceHeader.invoiceTotal)
      document.getElementById("inv-total").value = invoiceHeader.invoiceTotal;

    // If header fields are still missing, do a second focused pass
    const headerMissing =
      !invoiceHeader.invoiceNumber ||
      !invoiceHeader.invoiceDate ||
      !invoiceHeader.invoiceTotal;
    if (headerMissing) {
      try {
        const headerPrompt =
          "Look at this invoice carefully, including ALL pages. Find and return ONLY this JSON, nothing else:\n" +
          '{"invoiceNumber":"","invoiceDate":"YYYY-MM-DD","invoiceTotal":0.00}\n\n' +
          "invoiceNumber rules:\n" +
          '- Look for: Invoice No, Invoice #, Document Number, Doc No, Reference.\n' +
          '- FoodPoint: header box on EVERY page shows "Invoice No: 295636" -> "295636". In raw text this appears AFTER the line items.\n' +
          '- Brakes/Sysco: top-right box labeled "Document Number", return digits only e.g. "9352218620". Ignore any "IHO" prefix.\n' +
          '- Raw text may concatenate number+date+total with no spaces e.g. "935221862025.03.2026127.84" — split correctly: number=9352218620\n\n' +
          "invoiceDate rules:\n" +
          '- Convert any format to YYYY-MM-DD.\n' +
          '- Slash (FoodPoint): 26/03/26 -> 2026-03-26, 28/03/26 -> 2026-03-28. Appears AFTER line items in raw text.\n' +
          '- Dot (Brakes/Sysco): 25.03.2026 -> 2026-03-25, 20.03.2026 -> 2026-03-20\n' +
          '- Brakes/Sysco: top-right box labeled "Invoice Date"\n\n' +
          "invoiceTotal rules:\n" +
          '- FoodPoint: LAST page shows "Grand Total £692.32" -> 692.32. Strip £ symbol. Use Grand Total NOT Total Net.\n' +
          '- Brakes/Sysco: bottom-right labeled "INVOICE TOTAL", use Value (GBP) column. Food is 0% VAT so net=gross e.g. 127.84 -> 127.84\n\n' +
          "Return ONLY the JSON object, no markdown, no explanation.";
        let headerData;
        {
          const hFiles = results.map((r) => ({
            base64: r.base64,
            mime: r.mime,
          }));
          const hd = await window.electronAPI.scanInvoice(
            hFiles,
            headerPrompt,
            model,
            apiKey,
          );
          const ht = (hd.content || [])
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("");
          headerData = JSON.parse(ht.replace(/```json|```/g, "").trim());
        }
        if (!invoiceHeader.invoiceNumber && headerData.invoiceNumber) {
          document.getElementById("inv-number").value = String(
            headerData.invoiceNumber,
          );
        }
        if (!invoiceHeader.invoiceDate && headerData.invoiceDate) {
          document.getElementById("inv-date").value = headerData.invoiceDate;
        }
        if (!invoiceHeader.invoiceTotal && headerData.invoiceTotal) {
          document.getElementById("inv-total").value = headerData.invoiceTotal;
        }
      } catch (e) {
        /* header retry failed silently */
      }
    }

    // Complete progress bar
    clearInterval(window._invScanInterval);
    const barEl = document.getElementById("inv-progress-bar");
    if (barEl) barEl.style.width = "100%";
    const validCats = new Set(getIngCategories());
    invoiceResults = items.map(function (item) {
      const lower = item.name.toLowerCase();

      // 1. Use AI's libraryMatch suggestion first (exact name lookup)
      let match = null;
      if (item.libraryMatch && item.libraryMatch !== "null") {
        match = state.ingredients.find(function (i) {
          return i.name.toLowerCase() === item.libraryMatch.toLowerCase();
        });
      }
      // 2. Fall back to smart substring match — avoid false positives
      if (!match) {
        // Only match if the library name is ≥60% as long as the invoice name
        // AND the invoice name contains the full library name (not partial word)
        match = state.ingredients.find(function (i) {
          const libLower = i.name.toLowerCase();
          // Invoice name contains the full library name
          if (lower.includes(libLower) && libLower.length >= lower.length * 0.6)
            return true;
          // Library name contains the full invoice name (e.g. short invoice name)
          if (libLower.includes(lower) && lower.length >= libLower.length * 0.6)
            return true;
          return false;
        });
      }

      const suggestedCat =
        item.category && validCats.has(item.category) ? item.category : "";

      // unitPrice = cost per case as invoiced (the Unit Price column)
      // deliveredQty = how many cases were delivered
      const unitPrice = item.unitPrice || item.packCost || 0;
      const deliveredQty =
        item.deliveredQty && item.deliveredQty > 0 ? item.deliveredQty : 1;
      // packCost = unit price (already per case — this goes straight into the library)
      const packCost = unitPrice;
      // lineTotal for display = unitPrice × deliveredQty
      const lineTotal = Math.round(unitPrice * deliveredQty * 100) / 100;

      return Object.assign({}, item, {
        unitPrice: unitPrice,
        deliveredQty: deliveredQty,
        lineTotal: lineTotal,
        caseQty: deliveredQty,
        packCost: packCost,
        matchedId: match ? match.id : null,
        selected: !!match,
        supplierId: modal.dataset.supplierId || null,
        newCategory: suggestedCat || getIngCategories()[0] || "Other",
        aiCategory: suggestedCat,
      });
    });
    renderInvoiceResults();
  } catch (e) {
    const msg = e.message || String(e);
    clearInterval(window._invScanInterval);
    document.getElementById("invoice-status").innerHTML =
      '<span style="color:var(--red)">Error: ' +
      escHtml(msg) +
      "</span>" +
      '<br><span style="font-size:11px;color:var(--text-muted)">Check your API key and internet connection, then try again.</span>';
    document.getElementById("invoice-scan-btn").classList.remove("hidden");
  }
}

// ── Invoice ingredient search combo helpers ───────────────────────────────
function buildInvoiceIngredientSearch(idx, matchedId, inputStyle) {
  var sorted = state.ingredients.slice().sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
  var matchedIng = matchedId
    ? state.ingredients.find(function (x) { return x.id === matchedId; })
    : null;
  var currentName = matchedIng ? escHtml(matchedIng.name) : '';
  var optsHtml =
    '<div class="ing-srch-opt unmatch" data-id="" onmousedown="ingSearchSelect(event,this,' + idx + ')">— Unmatch —</div>';
  sorted.forEach(function (x) {
    optsHtml +=
      '<div class="ing-srch-opt" data-id="' + x.id + '" onmousedown="ingSearchSelect(event,this,' + idx + ')">' +
      escHtml(x.name) + '</div>';
  });
  return (
    '<div class="ing-srch-wrap">' +
    '<input type="text" class="ing-srch-input" placeholder="Search ingredient..." value="' + currentName + '" ' +
    'onfocus="ingSearchFocus(this)" oninput="ingSearchFilter(this)" onblur="ingSearchBlur(this,' + idx + ')" ' +
    'style="' + inputStyle + '" />' +
    '<div class="ing-srch-drop">' + optsHtml + '</div>' +
    '</div>'
  );
}

function ingSearchFocus(input) {
  var drop = input.nextElementSibling;
  drop.style.display = 'block';
  ingSearchFilter(input);
}

function ingSearchFilter(input) {
  var drop = input.nextElementSibling;
  var q = input.value.toLowerCase().trim();
  drop.querySelectorAll('.ing-srch-opt').forEach(function (opt) {
    var show = !q || opt.dataset.id === '' || opt.textContent.toLowerCase().includes(q);
    opt.style.display = show ? '' : 'none';
  });
}

function ingSearchSelect(event, opt, idx) {
  event.preventDefault();
  var id = opt.dataset.id || null;
  var input = opt.closest('.ing-srch-wrap').querySelector('.ing-srch-input');
  input.value = id ? opt.textContent : '';
  invoiceResults[idx].matchedId = id;
  opt.closest('.ing-srch-drop').style.display = 'none';
}

function ingSearchBlur(input, idx) {
  input.nextElementSibling.style.display = 'none';
  var matchedId = invoiceResults[idx] && invoiceResults[idx].matchedId;
  if (matchedId) {
    var ing = state.ingredients.find(function (x) { return x.id === matchedId; });
    input.value = ing ? ing.name : '';
  } else {
    input.value = '';
  }
}

function renderInvoiceResults() {
  const found = invoiceResults.length;
  const matched = invoiceResults.filter(function (r) {
    return r.matchedId;
  }).length;
  const unmatched = invoiceResults.filter(function (r) {
    return !r.matchedId;
  }).length;

  document.getElementById("invoice-status").innerHTML =
    "Found <strong>" +
    found +
    " items</strong> &middot; " +
    '<strong style="color:var(--green)">' +
    matched +
    " matched</strong> &middot; " +
    '<strong style="color:var(--accent)">' +
    unmatched +
    " new</strong>";

  document.getElementById("invoice-results").classList.remove("hidden");
  document.getElementById("invoice-apply-btn").classList.remove("hidden");

  const sel = function (inputStyle) {
    return (
      "background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:3px 6px;border-radius:4px;outline:none;" +
      (inputStyle || "")
    );
  };

  // ── Section 1: existing ingredient price updates ──────────────
  const existingItems = invoiceResults.filter(function (r) {
    return r.matchedId;
  });
  const newItems = invoiceResults.filter(function (r) {
    return !r.matchedId;
  });

  let html = "";

  if (existingItems.length) {
    html +=
      '<div class="invoice-section-title">Update Existing Prices (' +
      existingItems.length +
      ")</div>";
    html +=
      '<table class="dash-table" style="width:100%;margin-bottom:16px"><thead><tr>' +
      "<th>Invoice Item</th><th>Match To</th><th>Case</th><th>Pack Cost</th><th>Pack Size</th><th>Apply</th>" +
      "</tr></thead><tbody>";
    invoiceResults.forEach(function (item, i) {
      if (!item.matchedId) return;
      const ing = state.ingredients.find(function (x) {
        return x.id === item.matchedId;
      });
      const caseWarn =
        item.deliveredQty > 1
          ? '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">📦 ' +
            item.deliveredQty +
            " cases delivered · line total " +
            fmt(item.lineTotal) +
            "</div>"
          : "";
      // Supplier status badge: shows whether this invoice supplier will become primary or alt
      // Also shows price comparison vs current primary (Feature 3)
      const invSuppId = item.supplierId;
      let supplierBadge = "";
      if (invSuppId && ing) {
        if (!ing.supplierId) {
          supplierBadge =
            '<div style="font-size:10px;color:var(--green);margin-top:3px">Will set as primary supplier</div>';
        } else if (ing.supplierId === invSuppId) {
          // Price comparison: this IS the primary supplier — show vs last known price
          let priceNote = "";
          if (ing.packCost > 0 && item.packCost > 0 && item.packCost !== ing.packCost) {
            const _priceDiff = item.packCost - ing.packCost;
            const _pricePct = (_priceDiff / ing.packCost) * 100;
            priceNote = _priceDiff > 0
              ? ' &nbsp;<span style="color:var(--red);font-weight:600">▲ +' + Math.abs(_pricePct).toFixed(1) + '% vs last</span>'
              : ' &nbsp;<span style="color:var(--green);font-weight:600">▼ -' + Math.abs(_pricePct).toFixed(1) + '% vs last</span>';
          }
          supplierBadge =
            '<div style="font-size:10px;color:var(--green);margin-top:3px">✓ Default supplier — will update price' + priceNote + '</div>';
        } else {
          const _alreadyAlt = (ing.altSuppliers || []).some(function (a) {
            return a.supplierId === invSuppId;
          });
          const _otherSup = state.suppliers.find(function (s) {
            return s.id === ing.supplierId;
          });
          const _otherSupName = _otherSup ? _otherSup.name : "another supplier";

          // Price comparison: compare scanned cost-per-unit vs current primary
          let priceCompNote = "";
          if (ing.packSize > 0 && ing.packCost > 0 && item.packCost > 0) {
            const _primaryCpu = ing.packCost / ing.packSize;
            const _invPackSize = item.packSize || ing.packSize;
            const _invCpu = _invPackSize > 0 ? item.packCost / _invPackSize : 0;
            if (_invCpu > 0 && _primaryCpu > 0) {
              const _cpuDiff = _invCpu - _primaryCpu;
              const _cpuPct = (_cpuDiff / _primaryCpu) * 100;
              if (Math.abs(_cpuPct) >= 0.5) {
                priceCompNote = _cpuDiff < 0
                  ? ' &nbsp;<span style="color:var(--green);font-weight:600">▼ ' + Math.abs(_cpuPct).toFixed(1) + '% cheaper/unit than primary</span>'
                  : ' &nbsp;<span style="color:var(--red);font-weight:600">▲ ' + Math.abs(_cpuPct).toFixed(1) + '% pricier/unit than primary</span>';
              }
            }
          }

          // Set-as-primary checkbox (Feature 1)
          const _setPrimaryChk =
            '<label style="display:block;font-size:10px;color:var(--accent);margin-top:3px;cursor:pointer">' +
            '<input type="checkbox"' +
            (item.setAsPrimary ? ' checked' : '') +
            ' onchange="invoiceResults[' + i + '].setAsPrimary=this.checked" style="margin-right:4px;cursor:pointer">' +
            'Set as primary supplier' +
            '</label>';

          if (_alreadyAlt) {
            supplierBadge =
              '<div style="font-size:10px;color:var(--accent);margin-top:3px">Alt. supplier — default price unchanged' +
              priceCompNote +
              '</div>' + _setPrimaryChk;
          } else {
            supplierBadge =
              '<div style="font-size:10px;color:var(--accent);margin-top:3px">New alt. supplier (default: ' +
              escHtml(_otherSupName) +
              ' — price unchanged)' + priceCompNote + '</div>' + _setPrimaryChk;
          }
        }
      }
      html +=
        "<tr>" +
        '<td style="font-weight:600">' +
        escHtml(item.name) +
        caseWarn +
        "</td>" +
        '<td>' +
        buildInvoiceIngredientSearch(i, item.matchedId, sel('width:160px;box-sizing:border-box')) +
        supplierBadge +
        '</td>' +
        '<td style="text-align:center;font-size:12px;color:var(--text-muted)">' +
        (item.deliveredQty > 1
          ? '<span style="color:var(--text-muted)">' +
            item.deliveredQty +
            "×</span>"
          : "1×") +
        "</td>" +
        '<td><input type="number" step="0.01" min="0" value="' +
        item.packCost.toFixed(2) +
        '" onchange="invoiceResults[' +
        i +
        '].packCost=+this.value" style="' +
        sel("width:80px") +
        '"/>' +
        (item.deliveredQty > 1
          ? '<div style="font-size:10px;color:var(--green);font-weight:600">✓ unit price</div>'
          : "") +
        "</td>" +
        '<td><input type="number" step="any" min="0" value="' +
        (item.packSize || (ing && ing.packSize) || "") +
        '" placeholder="' +
        (ing ? ing.packSize : "") +
        '" onchange="invoiceResults[' +
        i +
        '].packSize=+this.value||null" style="' +
        sel("width:65px") +
        '"/>' +
        '<span style="font-size:11px;color:var(--text-muted);margin-left:3px">' +
        (ing ? escHtml(ing.unit) : "") +
        "</span></td>" +
        '<td style="text-align:center"><input type="checkbox"' +
        (item.selected ? " checked" : "") +
        ' onchange="invoiceResults[' +
        i +
        '].selected=this.checked"/></td>' +
        "</tr>";
    });
    html += "</tbody></table>";
  }

  // ── Section 2: new ingredients to add ────────────────────────
  if (newItems.length) {
    html +=
      '<div class="invoice-section-title">Add New Ingredients (' +
      newItems.length +
      ")</div>";
    html +=
      '<p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Fill in the details for any items you want to add to your ingredient library.</p>';
    html +=
      '<table class="dash-table" style="width:100%"><thead><tr>' +
      "<th>Invoice Name</th><th>Library Name</th><th>Category</th><th>Case</th><th>Pack Cost</th><th>Pack Size</th><th>Unit</th><th>Add</th>" +
      "</tr></thead><tbody>";

    invoiceResults.forEach(function (item, i) {
      if (item.matchedId) return;
      // Initialise new-item fields if not set
      if (!item.newName) item.newName = item.name;
      // Category: use AI suggestion → keyword guess → first category
      if (!item.newCategory) {
        item.newCategory =
          item.aiCategory ||
          guessIngCategory(item.name) ||
          getIngCategories()[0] ||
          "Other";
      }
      if (!item.newUnit) item.newUnit = item.unit || "g";
      if (!item.newPackSize) item.newPackSize = item.packSize || 0;
      if (item.addNew === undefined) item.addNew = true;

      const newCaseWarn =
        item.deliveredQty > 1
          ? '<div style="font-size:10px;color:var(--text-muted)">📦 ' +
            item.deliveredQty +
            " cases · line total £" +
            item.lineTotal.toFixed(2) +
            "</div>"
          : "";
      html +=
        "<tr>" +
        '<td style="color:var(--text-muted);font-size:12px">' +
        escHtml(item.name) +
        newCaseWarn +
        "</td>" +
        '<td><input type="text" value="' +
        escHtml(item.newName) +
        '" onchange="invoiceResults[' +
        i +
        '].newName=this.value" style="' +
        sel("width:130px") +
        '"/></td>' +
        '<td style="white-space:nowrap">' +
        '<select onchange="invoiceResults[' +
        i +
        '].newCategory=this.value" style="' +
        sel("max-width:115px") +
        '">' +
        getIngCategories()
          .map(function (c) {
            return (
              '<option value="' +
              escHtml(c) +
              '"' +
              (c === item.newCategory ? " selected" : "") +
              ">" +
              escHtml(c) +
              "</option>"
            );
          })
          .join("") +
        "</select>" +
        (item.aiCategory
          ? '<span title="AI suggested" style="font-size:9px;background:var(--accent-bg);color:var(--accent);border:1px solid var(--accent-dim);padding:1px 4px;border-radius:3px;margin-left:4px;font-weight:700">AI</span>'
          : item.newCategory !== (getIngCategories()[0] || "") &&
              item.newCategory
            ? '<span title="Auto-guessed from name" style="font-size:9px;background:rgba(34,197,94,0.12);color:var(--green);border:1px solid rgba(34,197,94,0.3);padding:1px 4px;border-radius:3px;margin-left:4px;font-weight:700">auto</span>'
            : "") +
        "</td>" +
        '<td style="text-align:center;font-size:12px;color:var(--text-muted)">' +
        (item.deliveredQty > 1 ? item.deliveredQty + "×" : "1×") +
        "</td>" +
        '<td><input type="number" step="0.01" min="0" value="' +
        item.packCost.toFixed(2) +
        '" onchange="invoiceResults[' +
        i +
        '].packCost=+this.value" style="' +
        sel("width:70px") +
        '"/>' +
        (item.deliveredQty > 1
          ? '<div style="font-size:10px;color:var(--green);font-weight:600">✓ unit price</div>'
          : "") +
        "</td>" +
        '<td><input type="number" step="any" min="0" value="' +
        (item.newPackSize || "") +
        '" placeholder="e.g. 1000" onchange="invoiceResults[' +
        i +
        '].newPackSize=+this.value||0" style="' +
        sel("width:70px") +
        '"/></td>' +
        '<td><select onchange="invoiceResults[' +
        i +
        '].newUnit=this.value" style="' +
        sel("width:60px") +
        '">' +
        ["g", "kg", "ml", "L", "each", "portion", "tbsp", "tsp"]
          .map(function (u) {
            return (
              "<option" +
              (u === item.newUnit ? " selected" : "") +
              ">" +
              u +
              "</option>"
            );
          })
          .join("") +
        "</select></td>" +
        '<td style="text-align:center"><input type="checkbox"' +
        (item.addNew ? " checked" : "") +
        ' onchange="invoiceResults[' +
        i +
        '].addNew=this.checked"/></td>' +
        "</tr>";
    });
    html += "</tbody></table>";
  }

  document.getElementById("invoice-results-body").innerHTML = html;
}

function applyInvoiceUpdates() {
  let updated = 0,
    added = 0;
  const supplierId =
    document.getElementById("invoice-modal").dataset.supplierId || null;
  const isCredit = document.getElementById("inv-credit-note")?.checked || false;

  const priceAlerts = []; // track rises for summary
  const cheaperAltCandidates = []; // track newly-added alts that are cheaper than primary
  invoiceResults.forEach(function (item) {
    // ── Update existing ──────────────────────────────────────
    if (item.matchedId && item.selected) {
      const ing = state.ingredients.find(function (i) {
        return i.id === item.matchedId;
      });
      if (ing) {
        const newCost = item.packCost;
        const newPackSize = item.packSize || ing.packSize;
        if (!ing.altSuppliers) ing.altSuppliers = [];

        // Determine relationship: is scanned supplier the default?
        const isDefaultSupplier = !supplierId || !ing.supplierId || ing.supplierId === supplierId;

        if (isDefaultSupplier) {
          // ── Default supplier → update main ingredient price ──
          const oldCost = ing.packCost;
          logPriceChange(ing, oldCost, newCost);
          if (oldCost > 0 && newCost > 0 && newCost !== oldCost) {
            const pctChange = ((newCost - oldCost) / oldCost) * 100;
            priceAlerts.push({
              name: ing.name,
              oldCost,
              newCost,
              pctChange,
              oldPackSize: ing.packSize,
              newPackSize: newPackSize,
              unit: ing.unit,
            });
          }
          ing.packCost = newCost;
          if (item.packSize) ing.packSize = item.packSize;
          if (supplierId && !ing.supplierId) ing.supplierId = supplierId;
        } else if (item.setAsPrimary) {
          // ── User explicitly chose to promote this supplier to primary ──
          const _oldPrimary = {
            supplierId: ing.supplierId,
            packSize: ing.packSize,
            packCost: ing.packCost,
          };
          const oldCost = ing.packCost;
          // Remove this supplier from alts if it was there
          ing.altSuppliers = ing.altSuppliers.filter(function (a) {
            return a.supplierId !== supplierId;
          });
          // Demote old primary to alt
          if (_oldPrimary.packCost && _oldPrimary.packSize) {
            ing.altSuppliers.push(_oldPrimary);
          }
          ing.supplierId = supplierId;
          ing.packCost = newCost;
          if (item.packSize) ing.packSize = item.packSize;
          logPriceChange(ing, oldCost, newCost);
          if (oldCost > 0 && newCost > 0 && newCost !== oldCost) {
            priceAlerts.push({
              name: ing.name,
              oldCost,
              newCost,
              pctChange: ((newCost - oldCost) / oldCost) * 100,
              oldPackSize: _oldPrimary.packSize,
              newPackSize: newPackSize,
              unit: ing.unit,
            });
          }
        } else {
          // ── Different supplier → add/update as alt only, never touch default price ──
          const _existingAlt = ing.altSuppliers.find(function (a) {
            return a.supplierId === supplierId;
          });
          if (_existingAlt) {
            // Log alt price change for reporting
            var _oldAltCost = _existingAlt.packCost;
            _existingAlt.packCost = newCost;
            if (item.packSize) _existingAlt.packSize = item.packSize;
            if (_oldAltCost > 0 && newCost > 0 && newCost !== _oldAltCost) {
              var _altSup = state.suppliers.find(function(s) { return s.id === supplierId; });
              priceAlerts.push({
                name: ing.name + ' (' + (_altSup ? _altSup.name : 'alt') + ')',
                oldCost: _oldAltCost,
                newCost: newCost,
                pctChange: (((newCost - _oldAltCost) / _oldAltCost) * 100),
                oldPackSize: _existingAlt.packSize,
                newPackSize: newPackSize,
                unit: ing.unit,
              });
            }
          } else {
            // New alt supplier entry
            ing.altSuppliers.push({
              supplierId: supplierId,
              packSize: newPackSize,
              packCost: newCost,
            });
          }

          // Detect if this alt is cheaper than the current default
          if (ing.packSize > 0 && ing.packCost > 0 && newCost > 0) {
            const _altPS = item.packSize || ing.packSize;
            const _altCpu = _altPS > 0 ? newCost / _altPS : 0;
            const _primCpu = ing.packCost / ing.packSize;
            if (_altCpu > 0 && _altCpu < _primCpu) {
              const _primSup = state.suppliers.find(function (s) {
                return s.id === ing.supplierId;
              });
              cheaperAltCandidates.push({
                ingId: ing.id,
                ingName: ing.name,
                primarySupName: _primSup ? _primSup.name : "current supplier",
                primaryCpu: _primCpu,
                altCpu: _altCpu,
                saving: ((_primCpu - _altCpu) / _primCpu) * 100,
                unit: ing.unit,
              });
            }
          }
        }
        updated++;
      }
    }
    // ── Add new ──────────────────────────────────────────────
    if (!item.matchedId && item.addNew) {
      const name = (item.newName || item.name || "").trim();
      if (!name) return;
      const autoAllergens = detectAllergens(name); // auto-detect from name
      state.ingredients.push({
        id: uid(),
        name: name,
        category: item.newCategory || getIngCategories()[0] || "Other",
        packSize: item.newPackSize || 0,
        packCost: item.packCost || 0,
        unit: item.newUnit || "g",
        yieldPct: 100,
        allergens: autoAllergens,
        nutrition: {},
        supplierId: supplierId,
        priceHistory: [],
        altSuppliers: [],
        seasonal: false,
      });
      added++;
    }
  });

  // Save invoice record to supplier
  const modal = document.getElementById("invoice-modal");
  const suppId = modal.dataset.supplierId || supplierId;
  if (suppId) {
    const sup = state.suppliers.find(function (s) {
      return s.id === suppId;
    });
    if (sup) {
      if (!sup.invoiceHistory) sup.invoiceHistory = [];
      // Sanitise: reject literal 'undefined'/'null' strings from AI
      const _rawInvNum = document.getElementById("inv-number").value.trim();
      const _rawInvDate = document.getElementById("inv-date").value.trim();
      const _rawInvTot = document.getElementById("inv-total").value;
      const _cleanNum =
        _rawInvNum && _rawInvNum !== "undefined" && _rawInvNum !== "null"
          ? _rawInvNum
          : "";
      const _cleanDate =
        _rawInvDate &&
        _rawInvDate !== "undefined" &&
        _rawInvDate !== "null" &&
        !isNaN(new Date(_rawInvDate))
          ? _rawInvDate
          : new Date().toISOString().slice(0, 10);
      var _parsedTotal = parseFloat(_rawInvTot) || parseFloat(modal.dataset.invoiceTotal) || 0;
      const _cleanTotal = isCredit && _parsedTotal > 0 ? -_parsedTotal : _parsedTotal;

      // Credit note linkage (AI scan path)
      var _linkedInvId = '';
      if (isCredit) {
        var _linkEl = document.getElementById('credit-linked-inv');
        _linkedInvId = _linkEl ? _linkEl.value : '';
        if (_linkedInvId) {
          var _linkedInv = sup.invoiceHistory.find(function(i) { return i.id === _linkedInvId; });
          if (_linkedInv) {
            _linkedInv.creditApplied = (_linkedInv.creditApplied || 0) + Math.abs(_cleanTotal);
          }
        }
      }

      sup.invoiceHistory.unshift({
        id: uid(),
        invoiceNumber: (isCredit ? 'CR: ' : '') + _cleanNum,
        date: _cleanDate,
        total: _cleanTotal,
        isCredit: isCredit,
        linkedInvoiceId: _linkedInvId || null,
        itemCount: invoiceResults.length,
        updatedCount: updated,
        addedCount: added,
        fileName: modal.dataset.fileName || "",
        scannedAt: new Date().toISOString(),
        lines: invoiceResults.map(function (item) {
          const ing = item.matchedId
            ? state.ingredients.find(function (i) {
                return i.id === item.matchedId;
              })
            : null;
          return {
            name: item.name,
            linkedName: ing ? ing.name : item.newName || null,
            packCost: item.packCost || 0,
            packSize: item.packSize || (ing ? ing.packSize : 0) || 0,
            unit: item.unit || (ing ? ing.unit : "") || "",
            wasMatched: !!item.matchedId,
            wasAdded: !item.matchedId && !!item.addNew,
            wasAddedAsAlt: !!(
              item.matchedId &&
              suppId &&
              ing &&
              ing.supplierId &&
              ing.supplierId !== suppId &&
              (ing.altSuppliers || []).some(function (a) {
                return a.supplierId === suppId;
              })
            ),
          };
        }),
      });
    }
  }
  save();
  document.getElementById("invoice-modal").classList.add("hidden");
  if (state.activeRecipeId) renderRecipeEditor();
  renderIngredientLibrary();
  if (suppId) renderSupplierList();

  // Show price alert banner if any prices changed
  if (priceAlerts.length) {
    const rises = priceAlerts.filter(function (a) {
      return a.pctChange > 0;
    });
    const drops = priceAlerts.filter(function (a) {
      return a.pctChange < 0;
    });
    showPriceAlertSummary(priceAlerts, rises, drops);
  }

  // Flag recipes affected by any price change
  if (priceAlerts.length) {
    const changedIngIds = new Set(
      priceAlerts
        .map(function (a) {
          const ing = state.ingredients.find(function (i) {
            return i.name === a.name;
          });
          return ing ? ing.id : null;
        })
        .filter(Boolean),
    );
    const affectedRecipes = state.recipes.filter(function (r) {
      return r.ingredients.some(function (ri) {
        return changedIngIds.has(ri.ingId);
      });
    });
    if (affectedRecipes.length) {
      showAffectedRecipesAlert(affectedRecipes, priceAlerts);
    }
  }

  // Feature 4: show banner if any newly-added alt supplier is cheaper than primary
  if (cheaperAltCandidates.length) {
    showCheaperAltSuggestionsAlert(cheaperAltCandidates, supplierId);
  }

  const parts = [];
  if (updated)
    parts.push(updated + " price" + (updated !== 1 ? "s" : "") + " updated");
  if (added)
    parts.push(added + " ingredient" + (added !== 1 ? "s" : "") + " added");
  if (priceAlerts.length)
    parts.push(
      priceAlerts.filter(function (a) {
        return a.pctChange > 0;
      }).length +
        " price rise" +
        (priceAlerts.filter(function (a) {
          return a.pctChange > 0;
        }).length !== 1
          ? "s"
          : "") +
        " detected",
    );
  showToast(
    (isCredit ? "✓ Credit note applied: " : "✓ ") + (parts.join(" · ") || "No changes"),
    priceAlerts.some(function (a) {
      return a.pctChange > 0;
    })
      ? "error"
      : "success",
    3500,
  );
}

function showAffectedRecipesAlert(recipes, priceAlerts) {
  const modal = document.getElementById("affected-recipes-modal");
  if (!modal) return;
  const rises = priceAlerts.filter(function (a) {
    return a.pctChange > 0;
  });

  let html =
    '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">' +
    rises.length +
    " price rise" +
    (rises.length !== 1 ? "s" : "") +
    " affect" +
    (rises.length === 1 ? "s" : "") +
    " these recipes. " +
    "Recipes marked ⚠ are now over their food cost target.</div>";

  html +=
    '<table class="dash-table" style="width:100%"><thead><tr>' +
    '<th>Recipe</th><th style="text-align:right">Old Cost</th>' +
    '<th style="text-align:right">New Cost</th><th style="text-align:right">Change</th><th></th>' +
    "</tr></thead><tbody>";

  recipes.forEach(function (r) {
    const portions = r.portions || 1;
    const newCost = recipeTotalCost(r) / portions;
    const sugPrice = r.priceOverride || suggestPrice(newCost, state.activeGP);
    const foodCostPct = sugPrice > 0 ? (newCost / sugPrice) * 100 : 0;
    const target = getFoodCostTarget();
    const overTarget = foodCostPct > target + 0.05;

    // Estimate old cost by reversing the price changes
    let oldCost = newCost;
    r.ingredients.forEach(function (ri) {
      const ing = state.ingredients.find(function (i) {
        return i.id === ri.ingId;
      });
      if (!ing) return;
      const alert = rises.find(function (a) {
        return a.name === ing.name;
      });
      if (!alert) return;
      const oldCpu =
        alert.oldCost / ing.packSize / ((ing.yieldPct || 100) / 100);
      const newCpu = costPerUnit(ing);
      const diff = (oldCpu - newCpu) * ri.qty;
      oldCost += diff / portions;
    });

    const costChange = newCost - oldCost;
    const col = costChange > 0 ? "var(--red)" : "var(--green)";

    html +=
      "<tr>" +
      '<td style="font-weight:600">' +
      escHtml(r.name) +
      (overTarget ? ' <span style="color:var(--red)">⚠</span>' : "") +
      "</td>" +
      '<td style="text-align:right;color:var(--text-muted)">' +
      fmt(oldCost) +
      "</td>" +
      '<td style="text-align:right;font-weight:700">' +
      fmt(newCost) +
      "</td>" +
      '<td style="text-align:right;color:' +
      col +
      ';font-weight:700">' +
      (costChange >= 0 ? "+" : "") +
      fmt(costChange) +
      "</td>" +
      '<td style="text-align:right"><button class="btn-secondary btn-sm" style="font-size:11px" onclick="selectRecipe(\'' +
      r.id +
      "');showView('recipes');document.getElementById('affected-recipes-modal').classList.add('hidden')\">Open →</button></td>" +
      "</tr>";
  });

  html += "</tbody></table>";
  document.getElementById("affected-recipes-body").innerHTML = html;
  modal.classList.remove("hidden");
}

// Feature 4: Banner offering to switch primary supplier when newly-added alt is cheaper
function showCheaperAltSuggestionsAlert(candidates, invSupplierId) {
  if (!candidates.length) return;
  const invSup = invSupplierId
    ? state.suppliers.find(function (s) { return s.id === invSupplierId; })
    : null;
  const invSupName = invSup ? invSup.name : "this supplier";

  // Build or reuse a floating banner element
  let banner = document.getElementById("cheaper-alt-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "cheaper-alt-banner";
    banner.style.cssText =
      "position:fixed;bottom:80px;right:20px;z-index:9999;max-width:420px;width:calc(100% - 40px);" +
      "background:var(--bg-card);border:1px solid rgba(34,197,94,0.4);border-radius:10px;" +
      "box-shadow:0 4px 24px rgba(0,0,0,.25);font-family:var(--font);overflow:hidden";
    document.body.appendChild(banner);
  }

  const rows = candidates
    .map(function (c) {
      return (
        '<tr style="border-top:1px solid var(--border)">' +
        '<td style="padding:6px 10px;font-size:12px;font-weight:600">' + escHtml(c.ingName) + "</td>" +
        '<td style="padding:6px 10px;font-size:11px;color:var(--text-muted);text-align:right">' +
        fmt(c.primaryCpu) + "/" + escHtml(c.unit) +
        "</td>" +
        '<td style="padding:6px 10px;font-size:11px;color:var(--green);font-weight:700;text-align:right">' +
        fmt(c.altCpu) + "/" + escHtml(c.unit) +
        " <span style=\"font-size:10px\">(-" + c.saving.toFixed(1) + "%)</span>" +
        "</td>" +
        '<td style="padding:6px 10px;text-align:right">' +
        '<button class="btn-primary btn-sm" style="font-size:11px;white-space:nowrap" ' +
        'onclick="switchPrimaryFromBanner(\'' + c.ingId + "','" + invSupplierId + "')\">" +
        "Switch Now</button>" +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  banner.innerHTML =
    '<div style="padding:10px 12px 8px;display:flex;align-items:center;justify-content:space-between">' +
    '<span style="font-size:12px;font-weight:700;color:var(--green)">💡 Cheaper pricing found via ' + escHtml(invSupName) + '</span>' +
    '<button onclick="document.getElementById(\'cheaper-alt-banner\').remove()" ' +
    'style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;line-height:1;padding:0 2px">&times;</button>' +
    "</div>" +
    '<div style="padding:0 4px 8px;overflow-x:auto">' +
    '<table style="width:100%;border-collapse:collapse;min-width:320px">' +
    '<thead><tr>' +
    '<th style="font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);padding:3px 10px;text-align:left;font-weight:600">Ingredient</th>' +
    '<th style="font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);padding:3px 10px;text-align:right;font-weight:600">Current/unit</th>' +
    '<th style="font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);padding:3px 10px;text-align:right;font-weight:600">New/unit</th>' +
    '<th></th>' +
    "</tr></thead><tbody>" +
    rows +
    "</tbody></table></div>" +
    '<div style="padding:4px 12px 10px;font-size:10px;color:var(--text-muted)">' +
    'Switching will promote ' + escHtml(invSupName) + ' to primary and keep your current supplier as alt.' +
    "</div>";
}

function switchPrimaryFromBanner(ingId, newSupplierId) {
  const ing = state.ingredients.find(function (i) { return i.id === ingId; });
  if (!ing || !newSupplierId) return;
  // Reuse existing alt supplier entry for the new primary
  const altEntry = (ing.altSuppliers || []).find(function (a) {
    return a.supplierId === newSupplierId;
  });
  if (!altEntry) return;

  const oldPrimary = { supplierId: ing.supplierId, packSize: ing.packSize, packCost: ing.packCost };

  ing.supplierId = newSupplierId;
  ing.packCost = altEntry.packCost;
  ing.packSize = altEntry.packSize;

  // Remove new primary from alts, add old primary to alts
  ing.altSuppliers = (ing.altSuppliers || []).filter(function (a) {
    return a.supplierId !== newSupplierId;
  });
  if (oldPrimary.packCost && oldPrimary.packSize) {
    ing.altSuppliers.push(oldPrimary);
  }

  save();
  renderIngredientLibrary();
  renderSupplierList();
  showToast("✓ Switched primary supplier for " + ing.name, "success", 2500);

  // Remove the row from the banner; if no more rows, close banner
  const banner = document.getElementById("cheaper-alt-banner");
  if (banner) {
    const rows = banner.querySelectorAll("tbody tr");
    rows.forEach(function (row) {
      const btn = row.querySelector("button");
      if (btn && btn.getAttribute("onclick") && btn.getAttribute("onclick").includes(ingId)) {
        row.remove();
      }
    });
    const remaining = banner.querySelectorAll("tbody tr").length;
    if (!remaining) banner.remove();
  }
}

function showPriceAlertSummary(all, rises, drops) {
  if (!all.length) return;
  const modal = document.getElementById("price-alert-modal");
  if (!modal) return;
  const gpTarget = state.activeGP || 70;

  // Build per-recipe impact for rises
  const overTargetRecipes = [];
  if (rises.length) {
    const riseIngIds = new Set();
    rises.forEach(function (a) {
      const ing = state.ingredients.find(function (i) {
        return i.name === a.name;
      });
      if (ing) riseIngIds.add(ing.id);
    });
    state.recipes
      .filter(function (r) {
        return !r.yieldQty;
      })
      .forEach(function (r) {
        if (
          !r.ingredients.some(function (ri) {
            return riseIngIds.has(ri.ingId);
          })
        )
          return;
        const cpp = recipeTotalCost(r) / (r.portions || 1);
        const price = r.priceOverride;
        if (!price) return;
        const gp = ((price - cpp) / price) * 100;
        if (gp < gpTarget - 1) overTargetRecipes.push({ r, cpp, price, gp });
      });
  }

  let html = "";

  // Summary tiles
  html +=
    '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">';
  if (rises.length)
    html +=
      '<div style="flex:1;min-width:100px;padding:10px 12px;background:var(--red-bg);border:1px solid rgba(224,92,92,0.3);border-radius:8px"><div style="font-size:20px;font-weight:700;color:var(--red)">' +
      rises.length +
      '</div><div style="font-size:11px;color:var(--text-muted)">price rise' +
      (rises.length !== 1 ? "s" : "") +
      "</div></div>";
  if (drops.length)
    html +=
      '<div style="flex:1;min-width:100px;padding:10px 12px;background:var(--green-bg);border:1px solid rgba(76,175,125,0.3);border-radius:8px"><div style="font-size:20px;font-weight:700;color:var(--green)">' +
      drops.length +
      '</div><div style="font-size:11px;color:var(--text-muted)">price drop' +
      (drops.length !== 1 ? "s" : "") +
      "</div></div>";
  if (overTargetRecipes.length)
    html +=
      '<div style="flex:1;min-width:140px;padding:10px 12px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.3);border-radius:8px"><div style="font-size:20px;font-weight:700;color:var(--red)">' +
      overTargetRecipes.length +
      '</div><div style="font-size:11px;color:var(--text-muted)">below ' +
      gpTarget +
      "% GP now</div></div>";
  html += "</div>";

  // Recipes now below target
  if (overTargetRecipes.length) {
    html +=
      '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--red);margin-bottom:8px">\u26a0 Recipes now below GP target</div>';
    html +=
      '<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:16px">';
    overTargetRecipes
      .sort(function (a, b) {
        return a.gp - b.gp;
      })
      .forEach(function (item) {
        const sugPrice = suggestPrice(item.cpp, gpTarget);
        const priceDiff = sugPrice - item.price;
        html +=
          '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--bg-card2);border:1px solid var(--border);border-left:3px solid var(--red);border-radius:6px">' +
          '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
          escHtml(item.r.name) +
          "</div>" +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:1px">cost ' +
          fmt(item.cpp) +
          " \u00b7 price " +
          fmt(item.price) +
          " \u2192 suggest " +
          fmt(sugPrice) +
          " (+" +
          fmt(priceDiff) +
          ")</div></div>" +
          '<div style="font-size:13px;font-weight:700;color:var(--red);flex-shrink:0">' +
          item.gp.toFixed(1) +
          "%</div>" +
          "<button class=\"btn-primary btn-sm\" style=\"flex-shrink:0;font-size:11px;padding:4px 10px\" onclick=\"document.getElementById('price-alert-modal').classList.add('hidden');selectRecipe('" +
          item.r.id +
          "');showView('recipes');setTimeout(function(){var el=document.getElementById('price-override-input');if(el)el.focus();},400)\">Fix \u2192</button>" +
          "</div>";
      });
    html += "</div>";
  }

  // Price changes tables
  if (rises.length) {
    html +=
      '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--red);margin-bottom:6px">\u2b06 Price rises</div>';
    html +=
      '<table class="dash-table" style="width:100%;margin-bottom:14px"><thead><tr><th>Ingredient</th><th style="text-align:right">Was</th><th style="text-align:right">Now</th><th style="text-align:right">Change</th></tr></thead><tbody>';
    rises
      .sort(function (a, b) {
        return b.pctChange - a.pctChange;
      })
      .forEach(function (a) {
        html +=
          '<tr><td style="font-weight:600">' +
          escHtml(a.name) +
          '</td><td style="text-align:right;color:var(--text-muted)">' +
          fmt(a.oldCost) +
          '</td><td style="text-align:right;font-weight:700">' +
          fmt(a.newCost) +
          '</td><td style="text-align:right;color:var(--red);font-weight:700">+' +
          a.pctChange.toFixed(1) +
          "%</td></tr>";
      });
    html += "</tbody></table>";
  }
  if (drops.length) {
    html +=
      '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--green);margin-bottom:6px">\u2b07 Price drops</div>';
    html +=
      '<table class="dash-table" style="width:100%;margin-bottom:8px"><thead><tr><th>Ingredient</th><th style="text-align:right">Was</th><th style="text-align:right">Now</th><th style="text-align:right">Change</th></tr></thead><tbody>';
    drops.forEach(function (a) {
      html +=
        "<tr><td>" +
        escHtml(a.name) +
        '</td><td style="text-align:right;color:var(--text-muted)">' +
        fmt(a.oldCost) +
        '</td><td style="text-align:right;font-weight:700">' +
        fmt(a.newCost) +
        '</td><td style="text-align:right;color:var(--green);font-weight:700">' +
        a.pctChange.toFixed(1) +
        "%</td></tr>";
    });
    html += "</tbody></table>";
  }

  const titleEl = modal.querySelector("h2");
  if (titleEl)
    titleEl.textContent = overTargetRecipes.length
      ? "\u26a0 " +
        overTargetRecipes.length +
        " recipe" +
        (overTargetRecipes.length !== 1 ? "s" : "") +
        " need attention"
      : "Invoice price changes";

  document.getElementById("price-alert-body").innerHTML = html;
  modal.classList.remove("hidden");
}

// ─── Site Manager ──────────────────────────────────────────────
function openSiteModal(id) {
  id = id || null;
  const site = id ? state.sites.find((s) => s.id === id) : null;
  document.getElementById("site-modal-title").textContent = site
    ? "Edit Site"
    : "Add Kitchen Site";
  document.getElementById("site-name").value = site ? site.name || "" : "";
  document.getElementById("site-location").value = site
    ? site.location || ""
    : "";
  document.getElementById("site-gp").value = site ? site.defaultGP || 70 : 70;
  document.getElementById("site-vat").value = site ? site.vat || 20 : 20;
  document.getElementById("site-modal").dataset.editId = id || "";
  document.getElementById("site-modal").classList.remove("hidden");
}
function closeSiteModal() {
  document.getElementById("site-modal").classList.add("hidden");
}
function saveSite() {
  const name = document.getElementById("site-name").value.trim();
  if (!name) {
    showToast("Please enter a site name", "error");
    return;
  }
  const id = document.getElementById("site-modal").dataset.editId;
  const data = {
    name: name,
    location: document.getElementById("site-location").value.trim(),
    defaultGP: Math.min(
      99,
      Math.max(1, parseFloat(document.getElementById("site-gp").value) || 70),
    ),
    vat: Math.min(
      100,
      Math.max(0, parseFloat(document.getElementById("site-vat").value) || 20),
    ),
  };
  if (id) {
    const idx = state.sites.findIndex((s) => s.id === id);
    state.sites[idx] = Object.assign({}, state.sites[idx], data);
  } else {
    state.sites.push(Object.assign({ id: uid() }, data));
  }
  closeSiteModal();
  renderSiteSelector();
  save();
  showToast("Site saved", "success", 1500);
}
async function deleteSite(id) {
  if (!(await showConfirm("Delete this site?", ""))) return;
  state.sites = state.sites.filter((s) => s.id !== id);
  if (state.activeSiteId === id) state.activeSiteId = null;
  renderSiteSelector();
  save();
}

// ─── Undo / Redo ──────────────────────────────────────────────
const undoStack = [];
const redoStack = [];
const MAX_UNDO = 30;

function pushUndo() {
  const r = getActiveRecipe();
  if (!r) return;
  undoStack.push({ recipeId: r.id, snapshot: JSON.parse(JSON.stringify(r)) });
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
  updateUndoButtons();
}

function undo() {
  if (!undoStack.length) return;
  const r = getActiveRecipe();
  if (!r) return;
  const entry = undoStack.pop();
  redoStack.push({ recipeId: r.id, snapshot: JSON.parse(JSON.stringify(r)) });
  const idx = state.recipes.findIndex((x) => x.id === entry.recipeId);
  if (idx === -1) return;
  state.recipes[idx] = entry.snapshot;
  state.activeRecipeId = entry.recipeId;
  renderRecipeEditor();
  renderSidebarRecipes();
  save();
  updateUndoButtons();
  showToast("Undone", "success", 1000);
}

function redo() {
  if (!redoStack.length) return;
  const entry = redoStack.pop();
  const r = state.recipes.find((x) => x.id === entry.recipeId);
  if (r)
    undoStack.push({ recipeId: r.id, snapshot: JSON.parse(JSON.stringify(r)) });
  const idx = state.recipes.findIndex((x) => x.id === entry.recipeId);
  if (idx === -1) return;
  state.recipes[idx] = entry.snapshot;
  state.activeRecipeId = entry.recipeId;
  renderRecipeEditor();
  renderSidebarRecipes();
  save();
  updateUndoButtons();
  showToast("Redone", "success", 1000);
}

function updateUndoButtons() {
  const ub = document.getElementById("undo-btn");
  const rb = document.getElementById("redo-btn");
  if (ub) ub.disabled = !undoStack.length;
  if (rb) rb.disabled = !redoStack.length;
}

// ─── Food Cost % Target Alert ──────────────────────────────────
function getFoodCostTarget() {
  return state.foodCostTarget || 30;
}

function buildCostAlert(costPct) {
  const target = getFoodCostTarget();
  if (costPct <= target + 0.05) return ""; // ignore floating point noise and tiny overages
  const over = (costPct - target).toFixed(1);
  return (
    '<div class="cost-alert-banner">' +
    '<span class="cost-alert-icon">⚠</span>' +
    "Food cost " +
    costPct.toFixed(1) +
    "% — " +
    over +
    "% over your " +
    target +
    "% target" +
    '<button class="btn-icon" style="margin-left:auto;font-size:11px" onclick="openCostTargetModal()" title="Change target">Edit target</button>' +
    "</div>"
  );
}

function openCostTargetModal() {
  const current = getFoodCostTarget();
  const val = prompt("Set food cost % target (e.g. 30):", current);
  if (val === null) return;
  const num = parseFloat(val);
  if (isNaN(num) || num <= 0 || num >= 100) {
    showToast("Enter a valid percentage", "error");
    return;
  }
  state.foodCostTarget = num;
  save();
  renderRecipeEditor();
  showToast("Target set to " + num + "%", "success", 1500);
}

// ─── Batch Cooking Calculator ──────────────────────────────────
function openBatchModal(id) {
  const recipe = state.recipes.find((r) => r.id === id);
  if (!recipe) return;
  const modal = document.getElementById("batch-modal");
  document.getElementById("batch-recipe-name").textContent = recipe.name;
  document.getElementById("batch-covers").value = recipe.portions || 1;
  document.getElementById("batch-modal").dataset.recipeId = id;
  renderBatchTable(id, recipe.portions || 1);
  modal.classList.remove("hidden");
}

function renderBatchTable(id, covers) {
  const recipe = state.recipes.find((r) => r.id === id);
  if (!recipe) return;
  const base = recipe.portions || 1;
  const factor = covers / base;
  const totalCost = recipeTotalCost(recipe) * factor;
  const cpp = totalCost / covers;
  const sellPrice = recipe.priceOverride
    ? recipe.priceOverride
    : suggestPrice(cpp, state.activeGP);

  let rows = recipe.ingredients
    .map((ri) => {
      const ing = state.ingredients.find((i) => i.id === ri.ingId);
      if (!ing) return "";
      const scaledQty = ri.qty * factor;
      const scaledCost = ingLineCost(ri.ingId, ri.qty, ri.recipeUnit) * factor;
      return (
        "<tr><td>" +
        escHtml(ing.name) +
        "</td>" +
        '<td style="color:var(--text-muted)">' +
        ing.unit +
        "</td>" +
        '<td style="font-weight:600">' +
        (scaledQty % 1 === 0 ? scaledQty : scaledQty.toFixed(2)) +
        "</td>" +
        '<td style="color:var(--accent)">' +
        fmt(scaledCost) +
        "</td></tr>"
      );
    })
    .join("");

  document.getElementById("batch-table-body").innerHTML = rows;
  document.getElementById("batch-summary").innerHTML =
    '<div class="batch-summary-grid">' +
    '<div class="batch-kpi"><div class="batch-kpi-val">' +
    covers +
    '</div><div class="batch-kpi-lbl">Covers</div></div>' +
    '<div class="batch-kpi"><div class="batch-kpi-val">' +
    fmt(totalCost) +
    '</div><div class="batch-kpi-lbl">Total Food Cost</div></div>' +
    '<div class="batch-kpi"><div class="batch-kpi-val">' +
    fmt(cpp) +
    '</div><div class="batch-kpi-lbl">Cost / Cover</div></div>' +
    '<div class="batch-kpi"><div class="batch-kpi-val" style="color:var(--accent)">' +
    fmt(sellPrice * covers) +
    '</div><div class="batch-kpi-lbl">Total Revenue</div></div>' +
    '<div class="batch-kpi"><div class="batch-kpi-val" style="color:var(--green)">' +
    fmt((sellPrice - cpp) * covers) +
    '</div><div class="batch-kpi-lbl">Total GP £</div></div>' +
    "</div>";
}

function updateBatchCovers() {
  const id = document.getElementById("batch-modal").dataset.recipeId;
  const covers = parseInt(document.getElementById("batch-covers").value) || 1;
  renderBatchTable(id, covers);
}

async function printBatchSheet() {
  const id = document.getElementById("batch-modal").dataset.recipeId;
  const recipe = state.recipes.find((r) => r.id === id);
  if (!recipe) return;
  const covers = parseInt(document.getElementById("batch-covers").value) || 1;
  const factor = covers / (recipe.portions || 1);
  const totalCost = recipeTotalCost(recipe) * factor;
  const cpp = totalCost / covers;

  const rows = recipe.ingredients
    .map((ri) => {
      const ing = state.ingredients.find((i) => i.id === ri.ingId);
      if (!ing) return "";
      const scaledQty = ri.qty * factor;
      return (
        "<tr><td>" +
        escHtml(ing.name) +
        "</td><td>" +
        (scaledQty % 1 === 0 ? scaledQty : scaledQty.toFixed(2)) +
        " " +
        escHtml(ing.unit) +
        "</td><td>" +
        fmt(ingLineCost(ri.ingId, ri.qty, ri.recipeUnit) * factor) +
        "</td></tr>"
      );
    })
    .join("");

  const html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    "<style>body{font-family:Arial,sans-serif;padding:30px;color:#111}h1{font-size:20px;margin-bottom:4px}h2{font-size:14px;color:#666;font-weight:normal;margin-bottom:20px}" +
    "table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#f0f0f0;padding:8px;text-align:left;font-size:12px}td{padding:8px;border-bottom:1px solid #eee;font-size:13px}" +
    ".summary{display:flex;gap:24px;margin-top:20px;flex-wrap:wrap}.kpi{background:#f8f8f8;padding:12px 18px;border-radius:6px}.kv{font-size:20px;font-weight:700}.kl{font-size:11px;color:#888}</style>" +
    "</head><body>" +
    "<h1>Batch Sheet — " +
    escHtml(recipe.name) +
    "</h1>" +
    "<h2>" +
    covers +
    " covers · Printed " +
    new Date().toLocaleDateString("en-GB") +
    "</h2>" +
    "<table><thead><tr><th>Ingredient</th><th>Quantity</th><th>Cost</th></tr></thead><tbody>" +
    rows +
    "</tbody></table>" +
    '<div class="summary">' +
    '<div class="kpi"><div class="kv">' +
    fmt(totalCost) +
    '</div><div class="kl">Total Food Cost</div></div>' +
    '<div class="kpi"><div class="kv">' +
    fmt(cpp) +
    '</div><div class="kl">Cost / Cover</div></div>' +
    "</div></body></html>";

  browserIPC.exportPDF(html);
}

// ─── Allergen Compliance Report ────────────────────────────────
function openAllergenReport() {
  const modal = document.getElementById("allergen-report-modal");
  // Populate category dropdown from real data
  const catSel = document.getElementById("allergen-report-category");
  if (catSel) {
    const usedCats = [
      ...new Set(state.recipes.map((r) => r.category).filter(Boolean)),
    ].sort();
    catSel.innerHTML =
      '<option value="">All Categories</option>' +
      usedCats
        .map((c) => `<option value="${escHtml(c)}">${escHtml(c)}</option>`)
        .join("");
    catSel.value = "";
  }
  // Init AI tab
  const countEl = document.getElementById("ar-ai-ing-count");
  if (countEl) countEl.textContent = state.ingredients.length + " ingredients";
  const noKeyEl = document.getElementById("ar-ai-no-key");
  const hasKey = !!getActiveKey();
  if (noKeyEl) noKeyEl.style.display = hasKey ? "none" : "block";
  // Show which model will be used
  const modelLbl = document.getElementById("ar-ai-model-label");
  if (modelLbl) {
    if (hasKey) {
      const m = getActiveModel();
      const label =
        m === "claude"
          ? "Claude Sonnet"
          : m === "gemini-flash"
            ? "Gemini 2.5 Flash"
            : m === "gemini-flash-lite"
              ? "Gemini 2.5 Flash-Lite"
              : m;
      modelLbl.textContent = label;
      modelLbl.style.color = "var(--text-primary)";
    } else {
      modelLbl.textContent = "No API key set";
      modelLbl.style.color = "var(--red)";
    }
  }
  arResetToIdle();
  arShowTab("report");
  renderAllergenReport();
  modal.classList.remove("hidden");
}

function renderAllergenReport() {
  const catFilter =
    document.getElementById("allergen-report-category")?.value || "";
  const recipes = catFilter
    ? state.recipes.filter(
        (r) => (r.category || "").toLowerCase() === catFilter.toLowerCase(),
      )
    : state.recipes;
  const body = document.getElementById("allergen-report-body");
  const countEl = document.getElementById("ar-report-count");
  if (countEl)
    countEl.textContent =
      recipes.length + " recipe" + (recipes.length !== 1 ? "s" : "");

  let html =
    '<table class="dash-table" style="width:100%">' +
    "<thead><tr><th>Recipe</th><th>Category</th>" +
    ALLERGENS.map(
      (a) =>
        '<th style="font-size:10px;padding:4px 6px;min-width:28px;text-align:center" title="' +
        escHtml(a) +
        '">' +
        escHtml(a.split(" ")[0].substring(0, 4)) +
        "</th>",
    ).join("") +
    "</tr></thead><tbody>";

  recipes.forEach((r) => {
    const allergens = recipeAllergens(r);
    html +=
      '<tr><td style="font-weight:600">' +
      escHtml(r.name) +
      "</td>" +
      '<td><span class="cat-badge">' +
      escHtml(r.category) +
      "</span></td>" +
      ALLERGENS.map((a) =>
        allergens.includes(a)
          ? '<td style="text-align:center;color:var(--red);font-weight:700" title="Contains ' +
            escHtml(a) +
            '">✓</td>'
          : '<td style="text-align:center;color:var(--text-muted)">—</td>',
      ).join("") +
      "</tr>";
  });

  html += "</tbody></table>";
  body.innerHTML = html;
}

async function printAllergenReport() {
  const catFilter =
    document.getElementById("allergen-report-category")?.value || "";
  const recipes = catFilter
    ? state.recipes.filter((r) => r.category === catFilter)
    : state.recipes;

  const headerRow =
    "<tr><th>Recipe</th><th>Category</th>" +
    ALLERGENS.map(
      (a) =>
        '<th style="font-size:10px;writing-mode:vertical-rl;transform:rotate(180deg);min-width:22px;padding:4px 2px">' +
        escHtml(a) +
        "</th>",
    ).join("") +
    "</tr>";

  const rows = recipes
    .map((r) => {
      const allergens = recipeAllergens(r);
      return (
        "<tr><td>" +
        escHtml(r.name) +
        "</td><td>" +
        escHtml(r.category) +
        "</td>" +
        ALLERGENS.map((a) =>
          allergens.includes(a)
            ? '<td style="text-align:center;background:#fee;color:#c00;font-weight:700">✓</td>'
            : '<td style="text-align:center;color:#ccc">—</td>',
        ).join("") +
        "</tr>"
      );
    })
    .join("");

  const html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    "<style>body{font-family:Arial,sans-serif;padding:24px;font-size:12px}h1{font-size:18px;margin-bottom:4px}h2{color:#666;font-weight:normal;font-size:12px;margin-bottom:16px}" +
    "table{width:100%;border-collapse:collapse}th{background:#f0f0f0;padding:6px 4px;text-align:left;border:1px solid #ddd}td{padding:5px 4px;border:1px solid #eee}" +
    ".legend{margin-top:16px;font-size:11px;color:#666}</style>" +
    "</head><body>" +
    "<h1>Allergen Compliance Report</h1>" +
    "<h2>" +
    (catFilter || "All Categories") +
    " · " +
    recipes.length +
    " recipes · Printed " +
    new Date().toLocaleDateString("en-GB") +
    "</h2>" +
    "<table><thead>" +
    headerRow +
    "</thead><tbody>" +
    rows +
    "</tbody></table>" +
    '<div class="legend">✓ = Contains allergen &nbsp;&nbsp; — = Not present &nbsp;&nbsp; Always verify with your supplier</div>' +
    "</body></html>";

  browserIPC.exportPDF(html);
}

// ═══════════════════════════════════════════════════════════════════════════
// MENU PRINT TOOL
// ═══════════════════════════════════════════════════════════════════════════

const _mpActiveFilters = new Set(); // 'gf' | 'nf' | 'df' | 'ef' | 'sf'

// Derive dietary-safe tags from a recipe's allergen set
function menuDietaryTags(recipe) {
  const allergens = recipeAllergens(recipe);
  const tags = [];
  if (!allergens.includes("Cereals (Gluten)")) tags.push("GF");
  if (!allergens.includes("Nuts") && !allergens.includes("Peanuts")) tags.push("NF");
  if (!allergens.includes("Milk")) tags.push("DF");
  if (!allergens.includes("Eggs")) tags.push("EF");
  if (!allergens.includes("Crustaceans") && !allergens.includes("Molluscs")) tags.push("SF");
  return tags;
}

function openMenuPrint() {
  const modal = document.getElementById("menu-print-modal");
  if (!modal) return;
  // Populate category filter
  const catSel = document.getElementById("mp-cat-filter");
  if (catSel) {
    const usedCats = [
      ...new Set(state.recipes.map((r) => r.category).filter(Boolean)),
    ].sort();
    catSel.innerHTML =
      '<option value="">All Categories</option>' +
      usedCats
        .map((c) => `<option value="${escHtml(c)}">${escHtml(c)}</option>`)
        .join("");
    catSel.value = "";
  }
  // Reset active filters
  _mpActiveFilters.clear();
  document.querySelectorAll(".mp-chip").forEach((b) => b.classList.remove("active"));
  // Reset search
  const searchEl = document.getElementById("mp-search");
  if (searchEl) searchEl.value = "";
  renderMenuPrintPreview();
  modal.classList.remove("hidden");
}

function mpToggleFilter(key) {
  if (_mpActiveFilters.has(key)) _mpActiveFilters.delete(key);
  else _mpActiveFilters.add(key);
  const btn = document.getElementById("mp-chip-" + key);
  if (btn) btn.classList.toggle("active", _mpActiveFilters.has(key));
  renderMenuPrintPreview();
}

function _mpFilteredRecipes() {
  const catFilter = document.getElementById("mp-cat-filter")?.value || "";
  const search = (document.getElementById("mp-search")?.value || "")
    .toLowerCase()
    .trim();
  return state.recipes.filter((r) => {
    if (catFilter && r.category !== catFilter) return false;
    if (search && !r.name.toLowerCase().includes(search)) return false;
    if (_mpActiveFilters.size > 0) {
      const tags = menuDietaryTags(r);
      for (const f of _mpActiveFilters) {
        if (!tags.includes(f.toUpperCase())) return false;
      }
    }
    return true;
  });
}

function renderMenuPrintPreview() {
  const showPrices = document.getElementById("mp-show-prices")?.checked !== false;
  const showGP = document.getElementById("mp-show-gp")?.checked === true;
  const groupByCat = document.getElementById("mp-group-cat")?.checked !== false;
  const showAllergens = document.getElementById("mp-show-allergens")?.checked !== false;
  const cur = state.currency || "£";
  const vatRate = state.vatRate || 0;

  const recipes = _mpFilteredRecipes();

  const countEl = document.getElementById("mp-recipe-count");
  if (countEl)
    countEl.textContent =
      recipes.length + " recipe" + (recipes.length !== 1 ? "s" : "") + " selected";

  const preview = document.getElementById("menu-print-preview");
  if (!preview) return;

  if (!recipes.length) {
    preview.innerHTML =
      '<div style="text-align:center;padding:48px 20px;color:var(--text-muted)">' +
      '<div style="font-size:32px;margin-bottom:10px">🍽</div>' +
      "<div>No recipes match the current filters</div></div>";
    return;
  }

  const TAG_COLORS = {
    GF: ["#c8960c", "#c8960c22"],
    NF: ["#b35400", "#b3540022"],
    DF: ["#0059b3", "#0059b322"],
    EF: ["#8800a0", "#8800a022"],
    SF: ["#006e30", "#006e3022"],
  };

  function recipeCard(r) {
    const tags = menuDietaryTags(r);
    const allergens = recipeAllergens(r);
    const cpp = recipeTotalCost(r) / (r.portions || 1);
    const priceExVat =
      r.priceOverride ||
      (cpp > 0 ? suggestPrice(cpp, state.activeGP || 70) : 0);
    const priceIncVat = vatRate > 0 ? priceExVat * (1 + vatRate / 100) : priceExVat;
    const gp =
      priceExVat > 0
        ? (((priceExVat - cpp) / priceExVat) * 100).toFixed(1)
        : null;

    const tagsHtml = tags
      .map((t) => {
        const [fg, bg] = TAG_COLORS[t] || ["var(--accent)", "var(--accent-bg)"];
        return (
          `<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;` +
          `background:${bg};color:${fg};border:1px solid ${fg}44">${t}</span>`
        );
      })
      .join("");

    const allergensHtml = showAllergens && allergens.length
      ? `<div style="font-size:10px;color:var(--red);margin-top:3px;line-height:1.4">` +
        `<span style="font-weight:700">Allergens:</span> ${escHtml(allergens.join(', '))}</div>`
      : "";

    const notesHtml = r.notes
      ? `<div style="font-size:11px;color:var(--text-muted);margin-top:3px;line-height:1.5;` +
        `overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-style:italic">` +
        escHtml(r.notes) +
        "</div>"
      : "";

    const priceHtml =
      showPrices && priceIncVat > 0
        ? `<div style="font-size:16px;font-weight:800;color:var(--accent);white-space:nowrap">${cur}${priceIncVat.toFixed(2)}</div>`
        : "";
    const gpHtml =
      showGP && gp
        ? `<div style="font-size:10px;color:var(--text-muted)">GP&nbsp;${gp}%</div>`
        : "";

    return (
      `<div class="card" style="padding:13px 15px;display:flex;flex-direction:column;gap:5px">` +
      `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">` +
      `<div style="font-size:13px;font-weight:700;color:var(--text-primary);line-height:1.3">${escHtml(r.name)}</div>` +
      `<div style="text-align:right;flex-shrink:0">${priceHtml}${gpHtml}</div>` +
      `</div>` +
      notesHtml +
      (tags.length
        ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:1px">${tagsHtml}</div>`
        : "") +
      allergensHtml +
      `</div>`
    );
  }

  let html = "";
  if (groupByCat) {
    const cats = [
      ...new Set(recipes.map((r) => r.category || "Uncategorised")),
    ].sort();
    cats.forEach((cat) => {
      const catRecipes = recipes.filter(
        (r) => (r.category || "Uncategorised") === cat,
      );
      html +=
        `<div style="margin-bottom:28px">` +
        `<div style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;` +
        `color:var(--text-muted);padding-bottom:6px;border-bottom:2px solid var(--border);margin-bottom:12px">` +
        escHtml(cat) +
        ` <span style="font-weight:400;opacity:.55">(${catRecipes.length})</span></div>` +
        `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">` +
        catRecipes.map(recipeCard).join("") +
        `</div></div>`;
    });
  } else {
    html =
      `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">` +
      recipes.map(recipeCard).join("") +
      `</div>`;
  }

  // Legend key at the bottom
  const allTags = [...new Set(recipes.flatMap((r) => menuDietaryTags(r)))];
  const TAG_LABELS = {
    GF: "Gluten Free",
    NF: "Nut Free",
    DF: "Dairy Free",
    EF: "Egg Free",
    SF: "Shellfish Free",
  };
  if (allTags.length) {
    html +=
      `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;` +
      `margin-top:8px;padding-top:12px;border-top:1px solid var(--border);` +
      `font-size:11px;color:var(--text-muted)">` +
      `<span style="font-weight:600">Key:</span>` +
      allTags
        .map((t) => {
          const [fg, bg] = TAG_COLORS[t] || ["var(--accent)", "var(--accent-bg)"];
          return (
            `<span style="display:flex;align-items:center;gap:4px">` +
            `<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;` +
            `background:${bg};color:${fg};border:1px solid ${fg}44">${t}</span>` +
            escHtml(TAG_LABELS[t] || t) +
            `</span>`
          );
        })
        .join("") +
      `</div>`;
  }

  preview.innerHTML = html;
}

async function printMenuCard() {
  const showPrices = document.getElementById("mp-show-prices")?.checked !== false;
  const showGP = document.getElementById("mp-show-gp")?.checked === true;
  const groupByCat = document.getElementById("mp-group-cat")?.checked !== false;
  const showAllergens = document.getElementById("mp-show-allergens")?.checked !== false;
  const menuTitle =
    (document.getElementById("mp-menu-title")?.value || "").trim() || "Our Menu";
  const cur = state.currency || "£";
  const vatRate = state.vatRate || 0;

  const recipes = _mpFilteredRecipes();
  if (!recipes.length) {
    showToast("No recipes to print", "error");
    return;
  }

  const TAG_COLORS_PRINT = {
    GF: "#a07000",
    NF: "#924200",
    DF: "#004fa0",
    EF: "#750090",
    SF: "#005c28",
  };
  const TAG_LABELS = {
    GF: "Gluten Free",
    NF: "Nut Free",
    DF: "Dairy Free",
    EF: "Egg Free",
    SF: "Shellfish Free",
  };

  function buildDish(r) {
    const tags = menuDietaryTags(r);
    const allergens = recipeAllergens(r);
    const cpp = recipeTotalCost(r) / (r.portions || 1);
    const priceExVat =
      r.priceOverride ||
      (cpp > 0 ? suggestPrice(cpp, state.activeGP || 70) : 0);
    const priceIncVat = vatRate > 0 ? priceExVat * (1 + vatRate / 100) : priceExVat;
    const gp =
      priceExVat > 0
        ? (((priceExVat - cpp) / priceExVat) * 100).toFixed(1)
        : null;

    const badgesHtml = tags
      .map(
        (t) =>
          `<span class="badge" style="color:${TAG_COLORS_PRINT[t] || "#555"};` +
          `border-color:${TAG_COLORS_PRINT[t] || "#555"}60">${t}</span>`,
      )
      .join("");

    const allergensLine = showAllergens && allergens.length
      ? `<div style="font-size:9px;color:#c00;margin-top:2px"><b>Allergens:</b> ${escHtml(allergens.join(', '))}</div>`
      : "";

    return (
      `<div class="dish">` +
      `<div class="dish-header">` +
      `<div class="dish-name">${escHtml(r.name)}</div>` +
      (showPrices && priceIncVat > 0
        ? `<div class="dish-price">${cur}${priceIncVat.toFixed(2)}</div>`
        : "") +
      `</div>` +
      (r.notes
        ? `<div class="dish-desc">${escHtml(r.notes)}</div>`
        : "") +
      (tags.length || (showGP && gp)
        ? `<div class="dish-footer">` +
          (tags.length ? `<div class="badges">${badgesHtml}</div>` : "<div></div>") +
          (showGP && gp ? `<div class="dish-gp">GP ${gp}%</div>` : "") +
          `</div>`
        : "") +
      allergensLine +
      `</div>`
    );
  }

  let bodyHtml = "";
  if (groupByCat) {
    const cats = [
      ...new Set(recipes.map((r) => r.category || "Other")),
    ].sort();
    cats.forEach((cat) => {
      const catRecipes = recipes.filter(
        (r) => (r.category || "Other") === cat,
      );
      bodyHtml +=
        `<div class="section">` +
        `<div class="section-title">${escHtml(cat)}</div>` +
        `<div class="dish-grid">` +
        catRecipes.map(buildDish).join("") +
        `</div></div>`;
    });
  } else {
    bodyHtml =
      `<div class="section"><div class="dish-grid">` +
      recipes.map(buildDish).join("") +
      `</div></div>`;
  }

  const usedTags = [...new Set(recipes.flatMap((r) => menuDietaryTags(r)))];
  const legendHtml = usedTags.length
    ? `<div class="legend">` +
      usedTags
        .map(
          (t) =>
            `<span style="display:inline-flex;align-items:center;gap:3px">` +
            `<span class="badge" style="color:${TAG_COLORS_PRINT[t] || "#555"};` +
            `border-color:${TAG_COLORS_PRINT[t] || "#555"}60">${t}</span>` +
            `${escHtml(TAG_LABELS[t] || t)}</span>`,
        )
        .join("") +
      `</div>`
    : "";

  const html =
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escHtml(menuTitle)}</title>` +
    `<style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Georgia,serif;background:#fff;color:#111;padding:32px 40px;font-size:12px}
      .menu-title{font-size:28px;font-weight:bold;text-align:center;letter-spacing:3px;text-transform:uppercase;margin-bottom:4px}
      .menu-sub{font-size:10px;color:#999;text-align:center;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:30px;padding-bottom:14px;border-bottom:2px solid #222}
      .section{margin-bottom:26px}
      .section-title{font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#888;border-bottom:1px solid #ddd;padding-bottom:5px;margin-bottom:12px}
      .dish-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .dish{padding:11px 13px;border:1px solid #e5e5e5;border-radius:5px;display:flex;flex-direction:column;gap:4px}
      .dish-header{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
      .dish-name{font-size:13px;font-weight:bold;color:#111;line-height:1.3}
      .dish-price{font-size:14px;font-weight:bold;color:#111;white-space:nowrap;flex-shrink:0}
      .dish-desc{font-size:11px;color:#777;line-height:1.5;font-style:italic}
      .dish-footer{display:flex;justify-content:space-between;align-items:center;margin-top:2px}
      .badges{display:flex;gap:3px;flex-wrap:wrap}
      .badge{font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;border:1px solid}
      .dish-gp{font-size:10px;color:#aaa}
      .legend{margin-top:18px;padding-top:10px;border-top:1px solid #ddd;font-size:10px;color:#888;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
      @media print{body{padding:16px 20px}}
    </style></head><body>` +
    `<div class="menu-title">${escHtml(menuTitle)}</div>` +
    `<div class="menu-sub">${new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })} &nbsp;·&nbsp; ${recipes.length} dish${recipes.length !== 1 ? "es" : ""}</div>` +
    bodyHtml +
    legendHtml +
    `</body></html>`;

  browserIPC.exportPDF(html);
}

// ═══════════════════════════════════════════════════════════════════════════
// NUTRITION SCANNER
// ═══════════════════════════════════════════════════════════════════════════

let _nutrSource = "usda";
let _nutrSuggestions = [];
let _nutrResultsCache = { usda: {}, ai: {} }; // persists across scans within one modal session

function openNutritionScanner() {
  const modal = document.getElementById("nutr-scan-modal");
  if (!modal) return;
  const missing = state.ingredients.filter((i) => !i.nutrition).length;
  const total = state.ingredients.length;
  const missingEl = document.getElementById("nutr-scope-missing-count");
  const allEl = document.getElementById("nutr-scope-all-count");
  if (missingEl) missingEl.textContent = "(" + missing + " of " + total + ")";
  if (allEl) allEl.textContent = "(" + total + ")";
  const usdaKey = getAiKey("usda");
  const keyInp = document.getElementById("nutr-usda-key-input");
  if (keyInp) keyInp.value = usdaKey;
  _nutrUpdateUsdaStatus(usdaKey);
  _populateModelSelect(
    document.getElementById("nutr-model"), "rc-nutr-model", updateNutrModelUI
  );
  _updateNutrScanBtn();
  _nutrResultsCache = { usda: {}, ai: {} };
  _nutrSuggestions = [];
  nutrShowState("idle");
  modal.classList.remove("hidden");
}

function _nutrUpdateUsdaStatus(key) {
  const el = document.getElementById("nutr-usda-key-status");
  if (!el) return;
  el.innerHTML = key
    ? '<span style="color:var(--green);font-weight:700">✓ Key saved</span>'
    : '<span style="color:var(--text-muted)">No key saved — get a free key at fdc.nal.usda.gov</span>';
}

function _nutrUpdateAiStatus() {
  updateNutrModelUI();
}

function _updateNutrScanBtn() {
  const btn = document.getElementById("nutr-scan-btn");
  if (!btn) return;
  const scope =
    document.querySelector('input[name="nutr-scope"]:checked')?.value || "missing";
  const count =
    scope === "missing"
      ? state.ingredients.filter((i) => !i.nutrition).length
      : state.ingredients.length;
  const srcLabel = _nutrSource === "usda" ? "USDA" : "AI";
  btn.textContent =
    "🔍 Scan " + count + " ingredient" + (count !== 1 ? "s" : "") + " with " + srcLabel;
}

function nutrSelectSource(src) {
  _nutrSource = src;
  document.getElementById("nutr-src-usda").classList.toggle("active", src === "usda");
  document.getElementById("nutr-src-ai").classList.toggle("active", src === "ai");
  const usdaDot = document.getElementById("nutr-usda-dot");
  const aiDot = document.getElementById("nutr-ai-dot");
  if (usdaDot) {
    usdaDot.textContent = src === "usda" ? "●" : "◎";
    usdaDot.style.color = src === "usda" ? "var(--accent)" : "var(--text-muted)";
  }
  if (aiDot) {
    aiDot.textContent = src === "ai" ? "●" : "◎";
    aiDot.style.color = src === "ai" ? "var(--accent)" : "var(--text-muted)";
  }
  _updateNutrScanBtn();
}

function nutrShowState(st) {
  ["idle", "progress", "results", "error"].forEach((s) => {
    const el = document.getElementById("nutr-" + s);
    if (!el) return;
    el.style.display = s === st ? (s === "results" ? "flex" : "block") : "none";
  });
  const applyBtn = document.getElementById("nutr-apply-btn");
  if (applyBtn) applyBtn.style.display = st === "results" ? "" : "none";
}

async function saveNutrUsdaKey() {
  const key = (document.getElementById("nutr-usda-key-input")?.value || "").trim();
  if (!key) { showToast("Key is empty", "error", 2000); return; }
  _apiKeys["usda"] = key;
  await window.electronAPI.saveApiKey("usda", key);
  _nutrUpdateUsdaStatus(key);
  _updateNutrScanBtn();
  showToast("✓ USDA key saved", "success", 1500);
}

async function clearNutrUsdaKey() {
  delete _apiKeys["usda"];
  await window.electronAPI.clearApiKey("usda");
  const inp = document.getElementById("nutr-usda-key-input");
  if (inp) inp.value = "";
  _nutrUpdateUsdaStatus("");
  _updateNutrScanBtn();
  showToast("USDA key cleared", "success", 1500);
}

async function runNutritionScan() {
  const scope =
    document.querySelector('input[name="nutr-scope"]:checked')?.value || "missing";
  const ings =
    scope === "missing"
      ? state.ingredients.filter((i) => !i.nutrition)
      : state.ingredients;
  const noKeyEl = document.getElementById("nutr-idle-no-key");
  if (!ings.length) { showToast("No ingredients to scan", "error", 2000); return; }
  if (_nutrSource === "usda") {
    const key = getAiKey("usda");
    if (!key) {
      if (noKeyEl) { noKeyEl.style.display = "block"; noKeyEl.textContent = "Please save your USDA API key first."; }
      return;
    }
    if (noKeyEl) noKeyEl.style.display = "none";
    await _runUsdaScan(ings);
  } else {
    const key = getActiveKey();
    if (!key) {
      if (noKeyEl) { noKeyEl.style.display = "block"; noKeyEl.textContent = "No AI key found — add one in Settings → AI Invoice Scanner."; }
      return;
    }
    if (noKeyEl) noKeyEl.style.display = "none";
    await _runAiNutrScan(ings);
  }
}

async function _runUsdaScan(ings) {
  nutrShowState("progress");
  const bar = document.getElementById("nutr-progress-bar");
  const txt = document.getElementById("nutr-progress-text");
  const sub = document.getElementById("nutr-progress-sub");
  if (bar) bar.style.width = "5%";
  if (txt) txt.textContent = "Fetching from USDA FoodData Central…";
  const key = getAiKey("usda");
  const BATCH = 5;
  const allResults = {};
  try {
    for (let i = 0; i < ings.length; i += BATCH) {
      const batch = ings.slice(i, i + BATCH);
      const pct = Math.round((i / ings.length) * 85 + 5);
      if (bar) bar.style.width = pct + "%";
      if (txt)
        txt.textContent =
          "Looking up " + Math.min(i + BATCH, ings.length) + " of " + ings.length + " ingredients…";
      if (sub) sub.textContent = batch.map((x) => x.name).join(", ");
      const batchRes = await window.electronAPI.fetchUsdaNutrition(
        batch.map((x) => x.name),
        key,
      );
      Object.assign(allResults, batchRes);
    }
    if (bar) bar.style.width = "100%";
    if (txt) txt.textContent = "Processing results…";
    // Store in cache keyed by ingId
    ings.forEach((ing) => {
      if (allResults[ing.name]) {
        _nutrResultsCache.usda[ing.id] = { ...allResults[ing.name], source: "usda" };
      }
    });
    _buildNutrSuggestions();
    setTimeout(_renderNutritionResults, 200);
  } catch (e) {
    nutrShowState("error");
    const errEl = document.getElementById("nutr-error-msg");
    if (errEl) errEl.textContent = "USDA error: " + (e.message || String(e));
  }
}

function _parseAiNutrJson(raw) {
  // Strip markdown fences and leading/trailing whitespace
  let s = raw.replace(/```json|```/g, "").trim();
  // Extract outermost {...}
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in AI response");
  s = s.slice(start, end + 1);
  try {
    return JSON.parse(s);
  } catch {
    // Truncated response — trim to last complete entry ending with `}`
    const lastGood = s.lastIndexOf("},");
    if (lastGood === -1) throw new Error("AI returned malformed JSON");
    return JSON.parse(s.slice(0, lastGood + 1) + "}");
  }
}

async function _runAiNutrScan(ings) {
  nutrShowState("progress");
  const bar = document.getElementById("nutr-progress-bar");
  const txt = document.getElementById("nutr-progress-text");
  const sub = document.getElementById("nutr-progress-sub");
  if (bar) bar.style.width = "5%";
  const model = getNutrModel();
  const apiKey = getAiKey(model);
  const BATCH = 25;
  const allAiMap = {};
  try {
    for (let i = 0; i < ings.length; i += BATCH) {
      const batch = ings.slice(i, i + BATCH);
      const pct = Math.round((i / ings.length) * 85 + 5);
      if (bar) bar.style.width = pct + "%";
      if (txt) txt.textContent = "AI estimating " + Math.min(i + BATCH, ings.length) + " of " + ings.length + " ingredients…";
      if (sub) sub.textContent = batch.map((x) => x.name).join(", ");
      const ingList = batch.map((x) => x.name).join("\n");
      const prompt =
        `You are a professional nutritionist. For each ingredient below, estimate the nutritional values per 100g.\n\n` +
        `Return ONLY valid JSON — no markdown, no explanation.\n\n` +
        `Format: {"ingredient name": {"kcal": 165, "protein": 31.0, "fat": 3.6, "carbs": 0.0, "fibre": 0.0, "salt": 0.09}, ...}\n\n` +
        `Rules:\n- kcal = kilocalories per 100g\n- protein, fat, carbs, fibre, salt all in grams per 100g\n` +
        `- salt = sodium × 2.5 (UK convention)\n- Use typical raw values unless name implies cooked\n` +
        `- Round to 1 decimal place\n- If completely unknown, omit that ingredient\n\nIngredients:\n` +
        ingList;
      const resultText = await window.electronAPI.callAi(model, prompt, apiKey, 4000);
      const batchMap = _parseAiNutrJson(resultText);
      Object.assign(allAiMap, batchMap);
    }
    if (bar) bar.style.width = "100%";
    if (txt) txt.textContent = "Processing results…";
    // Store in cache keyed by ingId
    ings.forEach((ing) => {
      let nutr = allAiMap[ing.name];
      if (!nutr) {
        const k = Object.keys(allAiMap).find(
          (k) => k.toLowerCase() === ing.name.toLowerCase(),
        );
        nutr = k ? allAiMap[k] : null;
      }
      if (nutr) _nutrResultsCache.ai[ing.id] = { ...nutr, source: "ai" };
    });
    _buildNutrSuggestions();
    setTimeout(_renderNutritionResults, 200);
  } catch (e) {
    nutrShowState("error");
    const errEl = document.getElementById("nutr-error-msg");
    if (errEl) errEl.textContent = "AI error: " + (e.message || String(e));
  }
}

function _buildNutrSuggestions() {
  const allIds = new Set([
    ...Object.keys(_nutrResultsCache.usda),
    ...Object.keys(_nutrResultsCache.ai),
  ]);
  // Preserve any choices the user already toggled
  const existingChoices = {};
  _nutrSuggestions.forEach((s) => { existingChoices[s.ingId] = s.choice; });
  _nutrSuggestions = [...allIds].map((id) => {
    const ing = state.ingredients.find((i) => i.id === id);
    if (!ing) return null;
    const usda = _nutrResultsCache.usda[id] || null;
    const ai = _nutrResultsCache.ai[id] || null;
    let choice = existingChoices[id];
    // If no choice yet, or chosen source no longer available, pick best available
    if (!choice || !(choice === "usda" ? usda : ai)) {
      choice = usda ? "usda" : ai ? "ai" : null;
    }
    return {
      ingId: id, name: ing.name, current: ing.nutrition,
      usda, ai, usdaFoodName: usda?.foodName || null,
      choice, matched: !!(usda || ai),
    };
  }).filter(Boolean);
  _nutrSuggestions.sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function nutrToggleChoice(idx, src) {
  if (_nutrSuggestions[idx]) _nutrSuggestions[idx].choice = src;
  _renderNutritionResults();
}

function nutrAddSourceScan(src) {
  _nutrSource = src;
  runNutritionScan();
}

function _renderNutritionResults() {
  nutrShowState("results");
  const matched = _nutrSuggestions.filter((s) => s.matched).length;
  const notMatched = _nutrSuggestions.filter((s) => !s.matched).length;
  const hasUsda = Object.keys(_nutrResultsCache.usda).length > 0;
  const hasAi = Object.keys(_nutrResultsCache.ai).length > 0;
  const summaryEl = document.getElementById("nutr-results-summary");
  if (summaryEl) {
    const parts = [];
    if (hasUsda) parts.push(`<span style="color:var(--blue);font-weight:700">USDA: ${Object.keys(_nutrResultsCache.usda).length}</span>`);
    if (hasAi) parts.push(`<span style="color:var(--accent);font-weight:700">AI: ${Object.keys(_nutrResultsCache.ai).length}</span>`);
    summaryEl.innerHTML =
      "<strong>" + matched + "</strong> matched (" + parts.join(" · ") + ")" +
      (notMatched
        ? ' · <span style="color:var(--accent)">' + notMatched + " not found</span>"
        : ' · <span style="color:var(--green)">all found ✓</span>');
  }
  // Show add-source buttons in the toolbar
  const addUsdaBtn = document.getElementById("nutr-add-usda-btn");
  const addAiBtn = document.getElementById("nutr-add-ai-btn");
  if (addUsdaBtn) addUsdaBtn.style.display = !hasUsda && getAiKey("usda") ? "" : "none";
  if (addAiBtn) addAiBtn.style.display = !hasAi && getActiveKey() ? "" : "none";

  const body = document.getElementById("nutr-results-body");
  if (!body) return;
  const fmt1 = (v) => (isNaN(v) ? "—" : Number(v).toFixed(1));

  const renderCells = (n) => [
    { l: "kcal",    v: Math.round(n.kcal    || 0), col: "var(--accent)" },
    { l: "protein", v: fmt1(n.protein) + "g",      col: "var(--green)" },
    { l: "fat",     v: fmt1(n.fat)     + "g" },
    { l: "carbs",   v: fmt1(n.carbs)   + "g" },
    { l: "fibre",   v: fmt1(n.fibre)   + "g" },
    { l: "salt",    v: Number(n.salt || 0).toFixed(2) + "g" },
  ].map((c) =>
    `<div style="text-align:center;min-width:54px">` +
    `<div style="font-size:13px;font-weight:700;color:${c.col || "var(--text-primary)"}">` + c.v + `</div>` +
    `<div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">` + c.l + `</div></div>`
  ).join("");

  const srcBadge = (src) => src === "usda"
    ? `<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;background:rgba(91,141,238,.15);color:var(--blue);border:1px solid rgba(91,141,238,.3)">USDA</span>`
    : `<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;background:var(--accent-bg);color:var(--accent);border:1px solid var(--accent-dim)">AI</span>`;

  body.innerHTML = _nutrSuggestions.map((s, idx) => {
    if (!s.matched) {
      return (
        `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;` +
        `border-radius:7px;background:var(--bg-card2);border:1px solid var(--border);opacity:.5">` +
        `<span style="font-size:16px">⚠️</span>` +
        `<div><div style="font-size:13px;font-weight:600;color:var(--text-secondary)">${escHtml(s.name)}</div>` +
        `<div style="font-size:11px;color:var(--text-muted)">Not found — skip or add manually</div></div></div>`
      );
    }
    const hasBoth = !!(s.usda && s.ai);
    const chosenData = s.choice === "usda" ? s.usda : s.ai;
    let valuesHtml;
    if (hasBoth) {
      const otherSrc = s.choice === "usda" ? "ai" : "usda";
      const otherData = s[otherSrc];
      const usdaActive = s.choice === "usda";
      const toggleHtml =
        `<div style="display:flex;gap:4px;margin-bottom:10px;align-items:center">` +
        `<span style="font-size:11px;color:var(--text-muted);margin-right:2px">Use:</span>` +
        `<button onclick="nutrToggleChoice(${idx},'usda')" style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:4px;` +
        `border:1px solid ${usdaActive ? "var(--blue)" : "var(--border)"};` +
        `background:${usdaActive ? "rgba(91,141,238,.15)" : "transparent"};` +
        `color:${usdaActive ? "var(--blue)" : "var(--text-muted)"};cursor:pointer">🏛 USDA</button>` +
        `<button onclick="nutrToggleChoice(${idx},'ai')" style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:4px;` +
        `border:1px solid ${!usdaActive ? "var(--accent)" : "var(--border)"};` +
        `background:${!usdaActive ? "var(--accent-bg)" : "transparent"};` +
        `color:${!usdaActive ? "var(--accent)" : "var(--text-muted)"};cursor:pointer">✨ AI</button>` +
        `</div>`;
      valuesHtml = toggleHtml +
        `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;margin-bottom:6px">` +
        renderCells(chosenData) +
        `<div style="font-size:10px;color:var(--text-muted);align-self:flex-end;padding-bottom:2px">per 100g</div></div>` +
        `<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;padding:5px 8px;` +
        `border-radius:5px;background:var(--bg-app);border:1px solid var(--border);opacity:.5">` +
        srcBadge(otherSrc) +
        `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;margin-left:4px">` +
        renderCells(otherData) + `</div></div>`;
    } else {
      valuesHtml =
        `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end">` +
        renderCells(chosenData) +
        `<div style="font-size:10px;color:var(--text-muted);align-self:flex-end;padding-bottom:2px">per 100g</div></div>`;
    }
    return (
      `<div style="display:flex;align-items:flex-start;gap:10px;padding:12px;` +
      `border-radius:7px;background:var(--bg-card2);border:1px solid var(--border)">` +
      `<input type="checkbox" class="nutr-check" data-idx="${idx}" checked ` +
      `style="width:14px;height:14px;cursor:pointer;accent-color:var(--accent);flex-shrink:0;margin-top:4px">` +
      `<div style="flex:1;min-width:0">` +
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">` +
      `<div style="font-size:13px;font-weight:700;color:var(--text-primary)">${escHtml(s.name)}</div>` +
      (!hasBoth ? srcBadge(s.choice) : "") +
      (s.usdaFoodName
        ? `<div style="font-size:11px;color:var(--text-muted);font-style:italic">→ ${escHtml(s.usdaFoodName)}</div>`
        : "") +
      (s.current
        ? `<span style="font-size:10px;color:var(--accent);padding:1px 6px;border-radius:3px;border:1px solid var(--accent-dim)">Overwrites existing</span>`
        : "") +
      `</div>` +
      valuesHtml +
      `</div></div>`
    );
  }).join("");
}

function nutrSelectAll(checked) {
  document.querySelectorAll(".nutr-check").forEach((cb) => { cb.checked = checked; });
}

function applyNutritionSuggestions() {
  const checks = document.querySelectorAll(".nutr-check");
  let applied = 0;
  checks.forEach((cb) => {
    if (!cb.checked) return;
    const idx = parseInt(cb.dataset.idx);
    const s = _nutrSuggestions[idx];
    if (!s || !s.choice) return;
    const nutrRaw = s.choice === "usda" ? s.usda : s.ai;
    if (!nutrRaw) return;
    const ing = state.ingredients.find((i) => i.id === s.ingId);
    if (!ing) return;
    const { foodName, ...nutrData } = nutrRaw;
    ing.nutrition = nutrData;
    applied++;
  });
  if (!applied) { showToast("No items selected", "error", 2000); return; }
  invalidateMaps();
  save();
  showToast("✓ Saved nutrition for " + applied + " ingredient" + (applied !== 1 ? "s" : ""), "success", 2500);
  document.getElementById("nutr-scan-modal").classList.add("hidden");
  if (state.activeRecipeId) renderRecipeEditor();
}

// ─── Allergen AI Review ────────────────────────────────────────

let _arAiSuggestions = []; // { ingId, name, current, suggested, added, removed }

function arShowTab(tab) {
  const isReport = tab === "report";
  document.getElementById("ar-panel-report").style.display = isReport
    ? "flex"
    : "none";
  document.getElementById("ar-panel-ai").style.display = isReport
    ? "none"
    : "flex";
  document.getElementById("ar-tab-report").style.borderBottomColor = isReport
    ? "var(--accent)"
    : "transparent";
  document.getElementById("ar-tab-report").style.color = isReport
    ? "var(--accent)"
    : "var(--text-muted)";
  document.getElementById("ar-tab-ai").style.borderBottomColor = !isReport
    ? "var(--accent)"
    : "transparent";
  document.getElementById("ar-tab-ai").style.color = !isReport
    ? "var(--accent)"
    : "var(--text-muted)";
  document.getElementById("ar-print-btn").style.display = isReport
    ? ""
    : "none";
}

function arResetToIdle() {
  document.getElementById("ar-ai-idle").style.display = "block";
  document.getElementById("ar-ai-progress").style.display = "none";
  document.getElementById("ar-ai-results").style.display = "none";
  document.getElementById("ar-ai-error").style.display = "none";
  _arAiSuggestions = [];
}

async function runAiAllergenReview() {
  const model = getActiveModel();
  const apiKey = getAiKey(model);
  if (!apiKey) {
    document.getElementById("ar-ai-no-key").style.display = "block";
    return;
  }
  document.getElementById("ar-ai-no-key").style.display = "none";
  document.getElementById("ar-ai-idle").style.display = "none";
  document.getElementById("ar-ai-error").style.display = "none";
  document.getElementById("ar-ai-progress").style.display = "block";
  document.getElementById("ar-ai-results").style.display = "none";

  const bar = document.getElementById("ar-ai-progress-bar");
  const txt = document.getElementById("ar-ai-progress-text");
  if (bar) bar.style.width = "10%";
  if (txt) txt.textContent = "Preparing ingredient list…";

  // Build ingredient list — deduplicated by name
  const ings = state.ingredients;
  const ingList = ings.map((i) => i.name).join("\n");

  const prompt = `You are a professional chef and food allergen expert. I will give you a list of ingredient names. For each ingredient, identify ALL allergens it may contain from the UK's 14 mandatory allergens.

UK 14 allergens: Celery, Cereals (Gluten), Crustaceans, Eggs, Fish, Lupin, Milk, Molluscs, Mustard, Nuts, Peanuts, Sesame, Soya, Sulphur Dioxide

Rules:
- Be thorough — consider the ingredient name, common variants, and typical processing methods
- "Nuts" covers: almonds, cashews, walnuts, pecans, pistachios, hazelnuts, macadamia, brazil nuts, pine nuts
- "Cereals (Gluten)" covers: wheat, rye, barley, oats, spelt, kamut
- Mayonnaise always contains Eggs; many sauces contain multiple allergens
- If the ingredient name is ambiguous, include allergens for the most common interpretation
- Packaging materials, containers, foil — return empty array []
- Return ONLY valid JSON, no markdown, no explanation

Format: {"ingredient name": ["Allergen1", "Allergen2"], ...}

Ingredients:
${ingList}`;

  try {
    if (bar) {
      setTimeout(() => {
        if (bar) bar.style.width = "40%";
      }, 500);
    }
    if (txt)
      txt.textContent = "AI is reviewing " + ings.length + " ingredients…";

    const resultText = await window.electronAPI.callAi(
      model,
      prompt,
      apiKey,
      8000,
    );

    if (bar) bar.style.width = "90%";
    if (txt) txt.textContent = "Processing results…";

    // Parse the JSON result
    const clean = resultText.replace(/```json|```/g, "").trim();
    const aiMap = JSON.parse(clean); // { "Ingredient Name": ["Allergen1", ...] }

    const validAllergens = new Set(ALLERGENS);
    _arAiSuggestions = [];

    ings.forEach((ing) => {
      // Find AI result — try exact match first, then case-insensitive
      let aiAllergens = aiMap[ing.name];
      if (!aiAllergens) {
        const key = Object.keys(aiMap).find(
          (k) => k.toLowerCase() === ing.name.toLowerCase(),
        );
        aiAllergens = key ? aiMap[key] : null;
      }
      if (!aiAllergens) return; // AI didn't return this ingredient

      // Filter to valid allergens only
      const suggested = aiAllergens.filter((a) => validAllergens.has(a));
      const current = ing.allergens || [];

      const added = suggested.filter((a) => !current.includes(a));
      const removed = current.filter((a) => !suggested.includes(a));

      // Only include if there's a difference
      if (added.length || removed.length) {
        _arAiSuggestions.push({
          ingId: ing.id,
          name: ing.name,
          current,
          suggested,
          added,
          removed,
        });
      }
    });

    if (bar) bar.style.width = "100%";
    setTimeout(() => renderAiAllergenResults(), 300);
  } catch (e) {
    document.getElementById("ar-ai-progress").style.display = "none";
    document.getElementById("ar-ai-error").style.display = "block";
    document.getElementById("ar-ai-error-msg").textContent =
      "Error: " + (e.message || String(e));
  }
}

function renderAiAllergenResults() {
  document.getElementById("ar-ai-progress").style.display = "none";
  const resultsWrap = document.getElementById("ar-ai-results");
  resultsWrap.style.display = "flex";

  const total = _arAiSuggestions.length;
  const addCount = _arAiSuggestions.reduce((s, x) => s + x.added.length, 0);
  const remCount = _arAiSuggestions.reduce((s, x) => s + x.removed.length, 0);

  const summaryEl = document.getElementById("ar-ai-results-summary");
  if (summaryEl) {
    if (total === 0) {
      summaryEl.innerHTML =
        '<span style="color:var(--green);font-weight:600">✓ All allergens look correct — no changes suggested</span>';
      document.getElementById("ar-ai-results-body").innerHTML = "";
      return;
    }
    summaryEl.innerHTML =
      `<strong>${total}</strong> ingredient${total !== 1 ? "s" : ""} with suggested changes · ` +
      (addCount
        ? `<span style="color:var(--red)">${addCount} allergen${addCount !== 1 ? "s" : ""} to add</span>`
        : "") +
      (addCount && remCount ? " · " : "") +
      (remCount
        ? `<span style="color:var(--accent)">${remCount} allergen${remCount !== 1 ? "s" : ""} to remove</span>`
        : "");
  }

  const body = document.getElementById("ar-ai-results-body");
  body.innerHTML = _arAiSuggestions
    .map((s, idx) => {
      const addedTags = s.added
        .map(
          (a) =>
            `<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:var(--red)">+${escHtml(a)}</span>`,
        )
        .join("");
      const removedTags = s.removed
        .map(
          (a) =>
            `<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(232,168,56,0.1);border:1px solid rgba(232,168,56,0.3);color:#8a5800;text-decoration:line-through">-${escHtml(a)}</span>`,
        )
        .join("");
      const currentTags = s.current.length
        ? s.current
            .map(
              (a) =>
                `<span style="font-size:11px;padding:2px 7px;border-radius:4px;background:var(--bg-card2);border:1px solid var(--border);color:var(--text-secondary)">${escHtml(a)}</span>`,
            )
            .join("")
        : '<span style="font-size:11px;color:var(--text-muted)">None set</span>';

      return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:7px;background:var(--bg-card2);border:1px solid var(--border)">
      <input type="checkbox" class="ar-suggestion-check" data-idx="${idx}" checked
        style="width:14px;height:14px;cursor:pointer;accent-color:var(--accent);flex-shrink:0;margin-top:3px" />
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:6px">${escHtml(s.name)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:5px">
          <span style="font-size:10px;color:var(--text-muted);width:52px;flex-shrink:0">Current:</span>
          <div style="display:flex;flex-wrap:wrap;gap:3px">${currentTags}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <span style="font-size:10px;color:var(--text-muted);width:52px;flex-shrink:0">Changes:</span>
          <div style="display:flex;flex-wrap:wrap;gap:3px">${addedTags}${removedTags}</div>
        </div>
      </div>
    </div>`;
    })
    .join("");
}

function arSelectAllSuggestions(checked) {
  document.querySelectorAll(".ar-suggestion-check").forEach((cb) => {
    cb.checked = checked;
  });
}

function applyAiAllergenReview() {
  const checked = [
    ...document.querySelectorAll(".ar-suggestion-check:checked"),
  ];
  if (!checked.length) {
    showToast("No changes selected", "error", 2000);
    return;
  }

  let updatedCount = 0;
  checked.forEach((cb) => {
    const idx = parseInt(cb.dataset.idx);
    const s = _arAiSuggestions[idx];
    if (!s) return;
    const ing = state.ingredients.find((i) => i.id === s.ingId);
    if (!ing) return;
    ing.allergens = s.suggested;
    updatedCount++;
  });

  save();
  renderIngredientLibrary();
  if (state.activeRecipeId) renderRecipeEditor();

  showToast(
    `✓ ${updatedCount} ingredient${updatedCount !== 1 ? "s" : ""} updated`,
    "success",
    2500,
  );

  // Refresh the report tab and switch to it
  renderAllergenReport();
  arShowTab("report");
  arResetToIdle();
}

// ─── Menu Engineering Matrix ───────────────────────────────────
function openMenuMatrix() {
  document.getElementById("menu-matrix-modal").classList.remove("hidden");
  renderMenuMatrix();
}

function renderMenuMatrix() {
  if (!state.recipes.length) return;

  // Calculate avg popularity (use a stored popularity score, default 50)
  const rows = state.recipes.map((r) => {
    const cpp = recipeTotalCost(r) / (r.portions || 1);
    const price = r.priceOverride || suggestPrice(cpp, state.activeGP);
    const gp = price > 0 ? ((price - cpp) / price) * 100 : 0;
    const popularity = r.popularity || 50;
    return { r, cpp, price, gp, popularity };
  });

  const avgGP = rows.reduce((s, x) => s + x.gp, 0) / rows.length;
  const avgPop = rows.reduce((s, x) => s + x.popularity, 0) / rows.length;

  const classify = (gp, pop) => {
    const highGP = gp >= avgGP,
      highPop = pop >= avgPop;
    if (highGP && highPop)
      return {
        label: "Star",
        color: "#22c55e",
        desc: "High GP, High Popularity",
      };
    if (highGP && !highPop)
      return {
        label: "Puzzle",
        color: "#f59e0b",
        desc: "High GP, Low Popularity",
      };
    if (!highGP && highPop)
      return {
        label: "Plow Horse",
        color: "#3b82f6",
        desc: "Low GP, High Popularity",
      };
    return { label: "Dog", color: "#ef4444", desc: "Low GP, Low Popularity" };
  };

  // Quadrant layout
  const quads = { Star: [], Puzzle: [], "Plow Horse": [], Dog: [] };
  rows.forEach((row) => {
    const cls = classify(row.gp, row.popularity);
    quads[cls.label].push({ ...row, cls });
  });

  const quadColors = {
    Star: "#22c55e",
    Puzzle: "#f59e0b",
    "Plow Horse": "#3b82f6",
    Dog: "#ef4444",
  };
  const quadDesc = {
    Star: "High GP & Popular — promote heavily",
    Puzzle: "High GP but unpopular — improve marketing",
    "Plow Horse": "Popular but low GP — review pricing",
    Dog: "Low GP & unpopular — consider removing",
  };

  let html = '<div class="matrix-grid">';
  ["Star", "Puzzle", "Plow Horse", "Dog"].forEach((label) => {
    const items = quads[label];
    html +=
      '<div class="matrix-quad" style="border-top:3px solid ' +
      quadColors[label] +
      '">' +
      '<div class="matrix-quad-header"><span class="matrix-quad-label" style="color:' +
      quadColors[label] +
      '">' +
      label +
      "</span>" +
      '<span class="matrix-quad-desc">' +
      quadDesc[label] +
      "</span></div>" +
      (items.length
        ? items
            .map(
              (x) =>
                '<div class="matrix-item">' +
                '<div style="display:flex;justify-content:space-between;align-items:center">' +
                '<span style="font-weight:600;font-size:13px">' +
                escHtml(x.r.name) +
                "</span>" +
                '<span class="cat-badge">' +
                escHtml(x.r.category) +
                "</span></div>" +
                '<div style="display:flex;gap:12px;margin-top:6px;font-size:12px">' +
                '<span style="color:var(--text-muted)">GP: <strong style="color:' +
                quadColors[label] +
                '">' +
                x.gp.toFixed(1) +
                "%</strong></span>" +
                '<span style="color:var(--text-muted)">Popularity: ' +
                '<input type="range" min="0" max="100" value="' +
                x.popularity +
                '" data-id="' +
                x.r.id +
                '" style="width:80px;vertical-align:middle" ' +
                'oninput="this.nextElementSibling.textContent=this.value" onchange="updatePopularity(\'' +
                x.r.id +
                '\',+this.value)" title="Drag to set popularity score"> ' +
                '<strong id="pop-val-' +
                x.r.id +
                '">' +
                x.popularity +
                "</strong></span></div>" +
                "</div>",
            )
            .join("")
        : '<div style="color:var(--text-muted);font-size:12px;padding:8px 0">None</div>') +
      "</div>";
  });
  html += "</div>";
  html +=
    '<div style="font-size:11px;color:var(--text-muted);margin-top:12px">Set popularity scores by dragging the sliders. Scores reflect your sales data.</div>';
  document.getElementById("menu-matrix-body").innerHTML = html;
}

function updatePopularity(id, val) {
  const r = state.recipes.find((x) => x.id === id);
  if (!r) return;
  r.popularity = val;
  save();
  // Re-render matrix after drag ends (slider stays in place, only quadrant assignment may change)
  renderMenuMatrix();
}

// ─── Seasonal Price Flags ──────────────────────────────────────
function renderSeasonalBadge(ing) {
  if (!ing.seasonal) return "";
  const now = new Date();
  const month = now.getMonth() + 1;
  const inSeason =
    ing.seasonStart && ing.seasonEnd
      ? ing.seasonStart <= ing.seasonEnd
        ? month >= ing.seasonStart && month <= ing.seasonEnd
        : month >= ing.seasonStart || month <= ing.seasonEnd
      : false;
  if (!inSeason)
    return '<span class="seasonal-badge out" title="Out of season">Off-Season</span>';
  return '<span class="seasonal-badge in" title="Currently in season">In Season</span>';
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function renderSeasonalFields(ing) {
  return (
    '<div style="margin-top:14px">' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
    '<label style="font-size:12px;font-weight:700;color:var(--text-secondary)">SEASONAL INGREDIENT</label>' +
    '<label class="toggle-switch"><input type="checkbox" id="ing-seasonal" ' +
    (ing && ing.seasonal ? "checked" : "") +
    ' onchange="toggleSeasonalFields(this.checked)">' +
    '<span class="toggle-slider"></span></label></div>' +
    '<div id="seasonal-fields" style="display:' +
    (ing && ing.seasonal ? "grid" : "none") +
    ';grid-template-columns:1fr 1fr;gap:8px">' +
    '<div class="form-group"><label>Season Start</label>' +
    '<select id="ing-season-start">' +
    MONTHS.map(
      (m, i) =>
        '<option value="' +
        (i + 1) +
        '"' +
        (ing && ing.seasonStart === i + 1 ? " selected" : "") +
        ">" +
        m +
        "</option>",
    ).join("") +
    "</select></div>" +
    '<div class="form-group"><label>Season End</label>' +
    '<select id="ing-season-end">' +
    MONTHS.map(
      (m, i) =>
        '<option value="' +
        (i + 1) +
        '"' +
        (ing && ing.seasonEnd === i + 1 ? " selected" : "") +
        ">" +
        m +
        "</option>",
    ).join("") +
    "</select></div>" +
    "</div></div>"
  );
}

function toggleSeasonalFields(checked) {
  const fields = document.getElementById("seasonal-fields");
  if (fields) fields.style.display = checked ? "grid" : "none";
}

// ─── Competitor Price Comparison ───────────────────────────────
function openCompetitorModal(recipeId) {
  const recipe = state.recipes.find((r) => r.id === recipeId);
  if (!recipe) return;
  if (!recipe.competitors) recipe.competitors = [];
  document.getElementById("competitor-modal-title").textContent =
    "Competitor Prices — " + recipe.name;
  document.getElementById("competitor-modal").dataset.recipeId = recipeId;
  renderCompetitorList(recipe);
  document.getElementById("competitor-modal").classList.remove("hidden");
}

function renderCompetitorList(recipe) {
  const cpp = recipeTotalCost(recipe) / (recipe.portions || 1);
  const ourPrice = recipe.priceOverride || suggestPrice(cpp, state.activeGP);
  const comps = recipe.competitors || [];

  let html =
    '<div style="margin-bottom:14px;padding:10px 14px;background:var(--bg-card2);border-radius:6px;border:1px solid var(--border)">' +
    '<div style="font-size:12px;color:var(--text-muted)">Our price</div>' +
    '<div style="font-size:20px;font-weight:800;color:var(--accent)">' +
    fmt(ourPrice) +
    "</div></div>";

  if (comps.length) {
    html +=
      '<table class="dash-table" style="width:100%;margin-bottom:12px">' +
      "<thead><tr><th>Competitor</th><th>Their Price</th><th>Difference</th><th></th></tr></thead><tbody>" +
      comps
        .map((c, i) => {
          const diff = ourPrice - c.price;
          const col =
            diff > 0
              ? "var(--green)"
              : diff < 0
                ? "var(--red)"
                : "var(--text-muted)";
          const label =
            diff > 0
              ? "We are " + fmt(diff) + " cheaper"
              : diff < 0
                ? "They are " + fmt(Math.abs(diff)) + " cheaper"
                : "Same price";
          return (
            '<tr><td style="font-weight:600">' +
            escHtml(c.name) +
            "</td>" +
            "<td>" +
            fmt(c.price) +
            "</td>" +
            '<td style="color:' +
            col +
            ';font-size:12px">' +
            label +
            "</td>" +
            '<td><button class="btn-icon danger" onclick="removeCompetitor(\'' +
            recipe.id +
            "'," +
            i +
            ')"><svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg></button></td></tr>'
          );
        })
        .join("") +
      "</tbody></table>";
  } else {
    html +=
      '<div style="color:var(--text-muted);font-size:13px;margin-bottom:12px">No competitor prices added yet.</div>';
  }

  html +=
    '<div style="display:flex;gap:8px;margin-top:8px">' +
    '<input type="text" id="comp-name-input" placeholder="Competitor name" style="flex:1;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);padding:7px 10px;border-radius:5px;outline:none;font-size:13px">' +
    '<input type="number" id="comp-price-input" placeholder="Price £" step="0.01" min="0" style="width:100px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);padding:7px 10px;border-radius:5px;outline:none;font-size:13px">' +
    '<button class="btn-primary" onclick="addCompetitor(\'' +
    recipe.id +
    "')\">Add</button></div>";

  document.getElementById("competitor-list").innerHTML = html;
}

function addCompetitor(recipeId) {
  const recipe = state.recipes.find((r) => r.id === recipeId);
  if (!recipe) return;
  const name = document.getElementById("comp-name-input").value.trim();
  const price = parseFloat(document.getElementById("comp-price-input").value);
  if (!name || isNaN(price)) {
    showToast("Enter a name and price", "error");
    return;
  }
  if (!recipe.competitors) recipe.competitors = [];
  recipe.competitors.push({ name, price });
  document.getElementById("comp-name-input").value = "";
  document.getElementById("comp-price-input").value = "";
  renderCompetitorList(recipe);
  save();
}

function removeCompetitor(recipeId, idx) {
  const recipe = state.recipes.find((r) => r.id === recipeId);
  if (!recipe) return;
  recipe.competitors.splice(idx, 1);
  renderCompetitorList(recipe);
  save();
}

// ─── Recipe Print Card ─────────────────────────────────────────

function addMethodStep() {
  const r = state.recipes.find((x) => x.id === state.activeRecipeId);
  if (!r) return;
  if (!r.methods) r.methods = [];
  r.methods.push("");
  save();
  renderRecipeEditor();
  // Focus the new step's textarea
  setTimeout(() => {
    const steps = document.querySelectorAll(".method-step-text");
    if (steps.length) steps[steps.length - 1].focus();
  }, 50);
}

function removeMethodStep(idx) {
  const r = state.recipes.find((x) => x.id === state.activeRecipeId);
  if (!r) return;
  if (!r.methods) return;
  r.methods.splice(idx, 1);
  save();
  renderRecipeEditor();
}

function updateMethodStep(idx, val) {
  const r = state.recipes.find((x) => x.id === state.activeRecipeId);
  if (!r) return;
  if (!r.methods) r.methods = [];
  r.methods[idx] = val;
  save();
}

async function printRecipeCard(id) {
  const recipe = state.recipes.find((r) => r.id === id);
  if (!recipe) return;
  const cpp = recipeTotalCost(recipe) / (recipe.portions || 1);
  const sellPrice = recipe.priceOverride || suggestPrice(cpp, state.activeGP);
  const vatRate = state.vatRate || 0;
  const gp = sellPrice > 0 ? ((sellPrice - cpp) / sellPrice) * 100 : 0;
  const allergens = recipeAllergens(recipe);
  const nutrition = recipeNutrition(recipe);
  const cur = state.currency || "£";
  const methods = recipe.methods || [];
  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Ingredients
  const ingRows = recipe.ingredients
    .map((ri) => {
      const ing = state.ingredients.find((i) => i.id === ri.ingId);
      if (!ing) return "";
      const qty = ri.qty;
      const unit = ri.recipeUnit || ing.unit;
      return `<tr>
      <td style="padding:5px 0;border-bottom:1px solid #f0f0f0;font-size:13px">${escHtml(ing.name)}</td>
      <td style="padding:5px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;font-weight:600;white-space:nowrap">${qty} ${escHtml(unit)}</td>
    </tr>`;
    })
    .join("");

  // Sub-recipes
  const subRecipeRows = (recipe.subRecipes || [])
    .map((sr) => {
      const subR = state.recipes.find((r) => r.id === sr.recipeId);
      if (!subR) return "";
      const unitLabel = subR.yieldUnit || "portions";
      return `<tr>
      <td style="padding:5px 0;border-bottom:1px solid #f0f0f0;font-size:13px">
        <span style="display:inline-block;font-size:9px;font-weight:700;background:#111;color:#fff;padding:1px 5px;border-radius:3px;margin-right:5px;vertical-align:middle">SUB</span>${escHtml(subR.name)}
      </td>
      <td style="padding:5px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;font-weight:600;white-space:nowrap">${sr.qty} ${escHtml(unitLabel)}</td>
    </tr>
    <tr><td colspan="2" style="padding:0 0 6px 16px">
      <table style="width:100%;border-collapse:collapse">
        ${(subR.ingredients || [])
          .map((ri) => {
            const ing = state.ingredients.find((i) => i.id === ri.ingId);
            if (!ing) return "";
            return `<tr>
            <td style="padding:2px 0;font-size:11px;color:#666">${escHtml(ing.name)}</td>
            <td style="padding:2px 0;text-align:right;font-size:11px;color:#666;white-space:nowrap">${ri.qty} ${escHtml(ri.recipeUnit || ing.unit)}</td>
          </tr>`;
          })
          .join("")}
      </table>
    </td></tr>`;
    })
    .join("");

  // Method steps
  const methodHtml = methods.length
    ? methods
        .map(
          (step, i) =>
            `<div style="display:flex;gap:12px;margin-bottom:10px;align-items:flex-start">
          <div style="min-width:24px;height:24px;background:#111;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px">${i + 1}</div>
          <div style="font-size:13px;line-height:1.55;color:#333">${escHtml(step)}</div>
        </div>`,
        )
        .join("")
    : recipe.notes
      ? `<p style="font-size:13px;line-height:1.6;color:#555;font-style:italic;margin:0">${escHtml(recipe.notes)}</p>`
      : '<p style="color:#aaa;font-size:12px">No method added</p>';

  // Nutrition
  const nutHtml = nutrition.kcal
    ? `<div style="display:flex;gap:0;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;font-size:12px">
        ${[
          ["Calories", Math.round(nutrition.kcal) + "kcal"],
          ["Protein", nutrition.protein.toFixed(1) + "g"],
          ["Fat", nutrition.fat.toFixed(1) + "g"],
          ["Carbs", nutrition.carbs.toFixed(1) + "g"],
        ]
          .map(
            ([l, v]) =>
              `<div style="flex:1;text-align:center;padding:8px 4px;border-right:1px solid #e0e0e0"><div style="font-size:14px;font-weight:700;color:#111">${v}</div><div style="color:#999;font-size:10px;text-transform:uppercase;letter-spacing:.5px">${l}</div></div>`,
          )
          .join("")}
      </div>`
    : "";

  // Photo
  const photoHtml = recipe.photo
    ? `<div style="width:220px;flex-shrink:0"><img src="${recipe.photo}" style="width:100%;height:160px;object-fit:cover;border-radius:8px;display:block"></div>`
    : "";

  // Time badges
  const timeBadges = [
    recipe.prepTime
      ? `<span style="background:#f0f0f0;padding:3px 10px;border-radius:20px;font-size:11px">⏱ Prep ${recipe.prepTime}min</span>`
      : "",
    recipe.cookTime
      ? `<span style="background:#f0f0f0;padding:3px 10px;border-radius:20px;font-size:11px">🔥 Cook ${recipe.cookTime}min</span>`
      : "",
    `<span style="background:#f0f0f0;padding:3px 10px;border-radius:20px;font-size:11px">🍽 ${recipe.portions || 1} portion${(recipe.portions || 1) !== 1 ? "s" : ""}</span>`,
  ]
    .filter(Boolean)
    .join(" ");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>${escHtml(recipe.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #111; }
    .page { max-width: 800px; margin: 0 auto; padding: 32px 36px; }
    /* Header */
    .header { display: flex; gap: 20px; align-items: flex-start; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 2px solid #111; }
    .header-info { flex: 1; min-width: 0; }
    .recipe-title { font-size: 28px; font-weight: 800; line-height: 1.1; margin-bottom: 4px; letter-spacing: -0.5px; }
    .recipe-category { font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #888; margin-bottom: 12px; }
    .time-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
    /* Pricing strip */
    .price-strip { display: flex; background: #111; border-radius: 8px; overflow: hidden; }
    .price-item { flex: 1; padding: 10px 12px; text-align: center; border-right: 1px solid #333; }
    .price-item:last-child { border-right: none; }
    .price-val { font-size: 18px; font-weight: 800; color: #fff; }
    .price-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-top: 2px; }
    /* Two-column body */
    .body-cols { display: flex; gap: 28px; margin-top: 20px; }
    .col-left { width: 240px; flex-shrink: 0; }
    .col-right { flex: 1; min-width: 0; }
    .section-heading { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; color: #999; border-bottom: 1px solid #e8e8e8; padding-bottom: 5px; margin-bottom: 10px; }
    /* Allergens */
    .allergen-bar { background: #fff8e1; border: 1px solid #ffe082; border-radius: 6px; padding: 8px 12px; font-size: 11px; line-height: 1.5; margin-top: 14px; }
    .allergen-bar strong { color: #b8860b; }
    /* Footer */
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e8e8e8; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #bbb; }
    @media print { body { -webkit-print-color-adjust: exact; } @page { size: A4; margin: 15mm; } .page { padding: 0; } }
  </style>
  </head><body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="header-info">
        <div class="recipe-title">${escHtml(recipe.name)}</div>
        <div class="recipe-category">${escHtml(recipe.category || "")}</div>
        <div class="time-badges">${timeBadges}</div>
        <!-- Pricing strip -->
        <div class="price-strip">
          <div class="price-item"><div class="price-val">${cur}${cpp.toFixed(2)}</div><div class="price-lbl">Food Cost</div></div>
          <div class="price-item"><div class="price-val">${cur}${sellPrice.toFixed(2)}</div><div class="price-lbl">Sell Price ex VAT</div></div>
          ${vatRate > 0 ? `<div class="price-item"><div class="price-val">${cur}${(sellPrice * (1 + vatRate / 100)).toFixed(2)}</div><div class="price-lbl">Inc ${vatRate}% VAT</div></div>` : ""}
          <div class="price-item"><div class="price-val">${gp.toFixed(1)}%</div><div class="price-lbl">GP</div></div>
          <div class="price-item"><div class="price-val">${cur}${(sellPrice - cpp).toFixed(2)}</div><div class="price-lbl">Profit/Portion</div></div>
        </div>
      </div>
      ${photoHtml}
    </div>

    <!-- Body: two columns -->
    <div class="body-cols">
      <!-- Left: Ingredients -->
      <div class="col-left">
        <div class="section-heading">Ingredients</div>
        <table style="width:100%;border-collapse:collapse">
          <tbody>${ingRows}</tbody>
        </table>
        ${subRecipeRows ? `<div style="margin-top:10px"><div class="section-heading">Components</div><table style="width:100%;border-collapse:collapse"><tbody>${subRecipeRows}</tbody></table></div>` : ""}
        <!-- Allergens -->
        <div class="allergen-bar">
          <strong>Allergens: </strong>
          ${allergens.length ? allergens.join(", ") : "None declared"}
        </div>
        ${nutHtml ? `<div style="margin-top:12px"><div class="section-heading">Nutrition per Portion</div>${nutHtml}</div>` : ""}
      </div>
      <!-- Right: Method -->
      <div class="col-right">
        <div class="section-heading">Method</div>
        ${methodHtml}
        ${recipe.notes && methods.length ? `<div style="margin-top:14px;padding-top:10px;border-top:1px solid #f0f0f0"><div class="section-heading">Notes</div><p style="font-size:12px;color:#666;font-style:italic;line-height:1.6">${escHtml(recipe.notes)}</p></div>` : ""}
      </div>
    </div>

    <div class="footer">
      <span>Printed ${dateStr}</span>
      <span>${escHtml(recipe.name)} · ${recipe.ingredients.length} ingredients${(recipe.subRecipes || []).length ? " · " + (recipe.subRecipes || []).length + " components" : ""}</span>
      <span>Recipe Costing App</span>
    </div>
  </div>
  <script>window.onload = () => window.print();<\/script>
  </body></html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  } else showToast("Allow popups to print", "error", 3000);
}

// ─── Allergen QR Cards ───────────────────────────────────────────
function _buildAllergenPageHtml(recipe) {
  const allergens = recipeAllergens(recipe);
  const dietTags = menuDietaryTags(recipe);
  const nutrition = recipeNutritionTotal(recipe);
  const cur = state.currency || '£';
  const portions = recipe.portions || 1;
  const cpp = recipeTotalCost(recipe) / portions;
  const sellPrice = recipe.priceOverride || suggestPrice(cpp, state.activeGP);
  const vatRate = state.vatRate || 0;
  const inclPrice = vatRate > 0 ? sellPrice * (1 + vatRate / 100) : sellPrice;

  const dietFullNames = {
    'GF': 'Gluten Free', 'NF': 'Nut Free', 'DF': 'Dairy Free',
    'EF': 'Egg Free', 'SF': 'Shellfish Free'
  };
  const dietColors = {
    'GF': '#059669', 'NF': '#8b5cf6', 'DF': '#2563eb',
    'EF': '#d97706', 'SF': '#0891b2'
  };

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + escHtml(recipe.name) + ' — Allergen Info</title>'
    + '<style>'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8f9fa;color:#1a1a2e;min-height:100vh;display:flex;justify-content:center;padding:20px}'
    + '.card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:420px;width:100%;overflow:hidden}'
    + '.header{background:#1a1a2e;color:#fff;padding:24px 20px;text-align:center}'
    + '.header h1{font-size:22px;font-weight:800;margin-bottom:4px}'
    + '.header .cat{font-size:12px;opacity:.7;text-transform:uppercase;letter-spacing:1px}'
    + '.price{text-align:center;padding:12px;background:#f0f0f5;font-size:18px;font-weight:800;color:#1a1a2e}'
    + '.section{padding:16px 20px}'
    + '.section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;margin-bottom:10px}'
    + '.diet-tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}'
    + '.diet-tag{padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;color:#fff}'
    + '.allergen-list{display:flex;flex-direction:column;gap:6px}'
    + '.allergen-item{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff8f0;border:1px solid #ffe0b2;border-radius:8px;font-size:13px;font-weight:600;color:#c85a00}'
    + '.allergen-item .icon{font-size:16px}'
    + '.safe{background:#f0fdf4;border-color:#bbf7d0;color:#166534}'
    + '.nut-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;text-align:center}'
    + '.nut-cell{padding:10px 4px;border-right:1px solid #e5e7eb}'
    + '.nut-cell:last-child{border-right:none}'
    + '.nut-val{font-size:16px;font-weight:800;color:#1a1a2e}'
    + '.nut-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#999;margin-top:2px}'
    + '.footer{text-align:center;padding:12px 20px;font-size:10px;color:#ccc;border-top:1px solid #f0f0f0}'
    + '</style></head><body><div class="card">'
    + '<div class="header"><h1>' + escHtml(recipe.name) + '</h1>'
    + '<div class="cat">' + escHtml(recipe.category || '') + '</div></div>'
    + (vatRate > 0 ? '<div class="price">' + cur + inclPrice.toFixed(2) + ' <span style="font-size:12px;font-weight:400;color:#888">inc. VAT</span></div>' : '')
    + '<div class="section">'
    + '<div class="section-title">Dietary Information</div>'
    + '<div class="diet-tags">'
    + dietTags.map(function(t) { return '<span class="diet-tag" style="background:' + (dietColors[t] || '#666') + '">' + t + ' — ' + (dietFullNames[t] || t) + '</span>'; }).join('')
    + '</div></div>'
    + '<div class="section" style="padding-top:0">'
    + '<div class="section-title">Allergens' + (allergens.length ? ' (' + allergens.length + ' present)' : '') + '</div>'
    + (allergens.length
      ? '<div class="allergen-list">' + allergens.map(function(a) {
          return '<div class="allergen-item"><span class="icon">⚠️</span>' + escHtml(a) + '</div>';
        }).join('') + '</div>'
      : '<div class="allergen-item safe"><span class="icon">✅</span>No allergens declared</div>')
    + '</div>'
    + (nutrition && nutrition.kcal
      ? '<div class="section" style="padding-top:0"><div class="section-title">Nutrition per Portion</div>'
        + '<div class="nut-grid">'
        + '<div class="nut-cell"><div class="nut-val">' + Math.round(nutrition.kcal) + '</div><div class="nut-lbl">Calories</div></div>'
        + '<div class="nut-cell"><div class="nut-val">' + nutrition.protein.toFixed(1) + 'g</div><div class="nut-lbl">Protein</div></div>'
        + '<div class="nut-cell"><div class="nut-val">' + nutrition.fat.toFixed(1) + 'g</div><div class="nut-lbl">Fat</div></div>'
        + '<div class="nut-cell"><div class="nut-val">' + nutrition.carbs.toFixed(1) + 'g</div><div class="nut-lbl">Carbs</div></div>'
        + '</div></div>'
      : '')
    + '<div class="footer">Please inform staff of any allergies before ordering</div>'
    + '</div></body></html>';
}

async function printAllergenQRCard(id) {
  const recipe = state.recipes.find(function(r) { return r.id === id; });
  if (!recipe) return;

  const allergens = recipeAllergens(recipe);
  const dietTags = menuDietaryTags(recipe);
  const nutrition = recipeNutritionTotal(recipe);

  // Build the data the QR encodes: a compact customer-facing page as data URI
  var pageHtml = _buildAllergenPageHtml(recipe);
  var dataUri = 'data:text/html;charset=utf-8,' + encodeURIComponent(pageHtml);

  // If the data URI is too large for QR (max ~4296 alphanumeric chars), fall back to text-only
  var qrContent, qrIsUrl = true;
  if (dataUri.length > 2800) {
    // Text fallback — compact allergen summary
    qrContent = recipe.name + '\n'
      + (recipe.category ? recipe.category + '\n' : '')
      + '\nALLERGENS: ' + (allergens.length ? allergens.join(', ') : 'None declared')
      + '\nDIETARY: ' + (dietTags.length ? dietTags.join(', ') : 'N/A')
      + (nutrition && nutrition.kcal ? '\nNUTRITION/PORTION: ' + Math.round(nutrition.kcal) + 'kcal | ' + nutrition.protein.toFixed(1) + 'g protein | ' + nutrition.fat.toFixed(1) + 'g fat | ' + nutrition.carbs.toFixed(1) + 'g carbs' : '')
      + '\n\nPlease inform staff of any allergies.';
    qrIsUrl = false;
  } else {
    qrContent = dataUri;
  }

  var qrDataUrl;
  try {
    qrDataUrl = await window.electronAPI.generateQR(qrContent, { width: 300, margin: 2 });
  } catch(e) {
    showToast('QR generation failed: ' + e.message, 'error', 3000);
    return;
  }

  var dietFullNames = { 'GF': 'Gluten Free', 'NF': 'Nut Free', 'DF': 'Dairy Free', 'EF': 'Egg Free', 'SF': 'Shellfish Free' };
  var dietColors = { 'GF': '#059669', 'NF': '#8b5cf6', 'DF': '#2563eb', 'EF': '#d97706', 'SF': '#0891b2' };

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + 'body{font-family:"Segoe UI",Arial,sans-serif;background:#fff;color:#1a1a2e}'
    + '.card{width:320px;margin:20px auto;border:2px solid #1a1a2e;border-radius:12px;overflow:hidden;page-break-inside:avoid}'
    + '.card-header{background:#1a1a2e;color:#fff;padding:14px 16px;text-align:center}'
    + '.card-header h2{font-size:18px;font-weight:800;margin-bottom:2px}'
    + '.card-header .cat{font-size:10px;opacity:.7;text-transform:uppercase;letter-spacing:1.5px}'
    + '.card-body{padding:14px 16px;text-align:center}'
    + '.qr-img{width:180px;height:180px;margin:0 auto 10px}'
    + '.scan-hint{font-size:10px;color:#999;margin-bottom:12px}'
    + '.diet-row{display:flex;justify-content:center;gap:4px;flex-wrap:wrap;margin-bottom:10px}'
    + '.diet-pill{padding:3px 8px;border-radius:12px;font-size:10px;font-weight:700;color:#fff}'
    + '.allergen-box{background:#fff8f0;border:1px solid #ffe0b2;border-radius:6px;padding:8px 10px;text-align:left;font-size:11px}'
    + '.allergen-box b{color:#c85a00}'
    + '.safe-box{background:#f0fdf4;border-color:#bbf7d0;color:#166534}'
    + '.card-footer{text-align:center;padding:8px 16px;border-top:1px solid #f0f0f0;font-size:9px;color:#bbb}'
    + '@media print{body{margin:0} .card{border:2px solid #1a1a2e;margin:10px auto}}'
    + '</style></head><body>'
    + '<div class="card">'
    + '<div class="card-header"><h2>' + escHtml(recipe.name) + '</h2>'
    + '<div class="cat">' + escHtml(recipe.category || '') + '</div></div>'
    + '<div class="card-body">'
    + '<img class="qr-img" src="' + qrDataUrl + '" alt="QR Code">'
    + '<div class="scan-hint">' + (qrIsUrl ? 'Scan for full allergen &amp; nutrition info' : 'Scan for allergen info') + '</div>'
    + '<div class="diet-row">'
    + dietTags.map(function(t) { return '<span class="diet-pill" style="background:' + (dietColors[t] || '#666') + '">' + t + '</span>'; }).join('')
    + '</div>'
    + (allergens.length
      ? '<div class="allergen-box"><b>⚠ Allergens:</b> ' + allergens.join(', ') + '</div>'
      : '<div class="allergen-box safe-box">✅ No allergens declared</div>')
    + '</div>'
    + '<div class="card-footer">Please inform staff of any allergies before ordering</div>'
    + '</div>'
    + '<script>window.onload=function(){window.print()}<\/script>'
    + '</body></html>';

  browserIPC.exportPDF(html);
}

async function printBatchAllergenQR() {
  var sellable = state.recipes.filter(function(r) { return !r.yieldQty; });
  if (!sellable.length) { showToast('No recipes to export', 'error'); return; }

  showToast('Generating QR codes for ' + sellable.length + ' recipes…', 'info', 3000);

  var dietFullNames = { 'GF': 'Gluten Free', 'NF': 'Nut Free', 'DF': 'Dairy Free', 'EF': 'Egg Free', 'SF': 'Shellfish Free' };
  var dietColors = { 'GF': '#059669', 'NF': '#8b5cf6', 'DF': '#2563eb', 'EF': '#d97706', 'SF': '#0891b2' };

  var cards = '';
  for (var i = 0; i < sellable.length; i++) {
    var recipe = sellable[i];
    var allergens = recipeAllergens(recipe);
    var dietTags = menuDietaryTags(recipe);
    var nutrition = recipeNutritionTotal(recipe);

    // QR content — text summary (batch mode always uses text for speed/size)
    var qrContent = recipe.name + '\n'
      + (recipe.category ? recipe.category + '\n' : '')
      + '\nALLERGENS: ' + (allergens.length ? allergens.join(', ') : 'None declared')
      + '\nDIETARY: ' + (dietTags.length ? dietTags.join(', ') : 'N/A')
      + (nutrition && nutrition.kcal ? '\nNUTRITION: ' + Math.round(nutrition.kcal) + 'kcal | P:' + nutrition.protein.toFixed(1) + 'g | F:' + nutrition.fat.toFixed(1) + 'g | C:' + nutrition.carbs.toFixed(1) + 'g' : '')
      + '\n\nPlease inform staff of any allergies.';

    var qrDataUrl;
    try {
      qrDataUrl = await window.electronAPI.generateQR(qrContent, { width: 240, margin: 1 });
    } catch(e) { continue; }

    cards += '<div class="card">'
      + '<div class="card-header"><h3>' + escHtml(recipe.name) + '</h3>'
      + '<div class="cat">' + escHtml(recipe.category || '') + '</div></div>'
      + '<div class="card-body">'
      + '<img class="qr-img" src="' + qrDataUrl + '">'
      + '<div class="scan-hint">Scan for allergen info</div>'
      + '<div class="diet-row">'
      + dietTags.map(function(t) { return '<span class="diet-pill" style="background:' + (dietColors[t] || '#666') + '">' + t + '</span>'; }).join('')
      + '</div>'
      + (allergens.length
        ? '<div class="allergen-box"><b>⚠</b> ' + allergens.join(', ') + '</div>'
        : '<div class="allergen-box safe-box">✅ No allergens</div>')
      + '</div></div>';
  }

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + 'body{font-family:"Segoe UI",Arial,sans-serif;background:#fff;color:#1a1a2e;padding:10px}'
    + '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}'
    + '.card{border:1.5px solid #1a1a2e;border-radius:10px;overflow:hidden;page-break-inside:avoid}'
    + '.card-header{background:#1a1a2e;color:#fff;padding:10px 12px;text-align:center}'
    + '.card-header h3{font-size:13px;font-weight:800;margin-bottom:1px}'
    + '.card-header .cat{font-size:9px;opacity:.7;text-transform:uppercase;letter-spacing:1px}'
    + '.card-body{padding:10px 12px;text-align:center}'
    + '.qr-img{width:120px;height:120px;margin:0 auto 6px;display:block}'
    + '.scan-hint{font-size:9px;color:#999;margin-bottom:8px}'
    + '.diet-row{display:flex;justify-content:center;gap:3px;flex-wrap:wrap;margin-bottom:6px}'
    + '.diet-pill{padding:2px 6px;border-radius:10px;font-size:9px;font-weight:700;color:#fff}'
    + '.allergen-box{font-size:10px;background:#fff8f0;border:1px solid #ffe0b2;border-radius:4px;padding:5px 8px;text-align:left}'
    + '.allergen-box b{color:#c85a00}'
    + '.safe-box{background:#f0fdf4;border-color:#bbf7d0;color:#166534}'
    + '@media print{body{padding:5mm} .grid{gap:8px} .card{break-inside:avoid}}'
    + '</style></head><body>'
    + '<div style="text-align:center;margin-bottom:14px"><h1 style="font-size:18px;font-weight:900">Allergen QR Cards</h1>'
    + '<div style="font-size:11px;color:#888">' + sellable.length + ' recipes · ' + new Date().toLocaleDateString('en-GB') + '</div></div>'
    + '<div class="grid">' + cards + '</div>'
    + '<script>window.onload=function(){window.print()}<\/script>'
    + '</body></html>';

  browserIPC.exportPDF(html);
}

// ─── Recipe Tags ──────────────────────────────────────────────
function handleTagInput(e, recipeId) {
  if (e.key !== "Enter" && e.key !== ",") return;
  e.preventDefault();
  const input = document.getElementById("tag-input");
  const tag = input.value.trim().replace(/,/g, "");
  if (!tag) return;
  const r = state.recipes.find((x) => x.id === recipeId);
  if (!r) return;
  if (!r.tags) r.tags = [];
  if (!r.tags.includes(tag)) {
    r.tags.push(tag);
    save();
    renderRecipeEditor();
  } else input.value = "";
}
function removeTag(recipeId, tag) {
  const r = state.recipes.find((x) => x.id === recipeId);
  if (!r) return;
  r.tags = (r.tags || []).filter((t) => t !== tag);
  save();
  renderRecipeEditor();
}

// ─── Recipe Lock ───────────────────────────────────────────────
function toggleRecipeLock(id) {
  const r = state.recipes.find((x) => x.id === id);
  if (!r) return;
  r.locked = !r.locked;
  save();
  renderRecipeEditor();
  renderSidebarRecipes();
  showToast(
    r.locked ? "🔒 Recipe locked" : "🔓 Recipe unlocked",
    "success",
    1500,
  );
}

// ─── Custom Recipe Categories ─────────────────────────────────
function openCategoryManager() {
  // Re-run the same canonical sync so manager always shows the clean list
  const usedRCats = [
    ...new Set(state.recipes.map((r) => r.category).filter(Boolean)),
  ];
  if (usedRCats.length > 0) {
    const merged = [];
    usedRCats.forEach((c) => {
      if (!merged.some((m) => m.toLowerCase() === c.toLowerCase()))
        merged.push(c);
    });
    state.recipeCategories = merged;
  }
  const usedICats = [
    ...new Set(state.ingredients.map((i) => i.category).filter(Boolean)),
  ];
  if (usedICats.length > 0) {
    const mergedI = [];
    usedICats.forEach((c) => {
      if (!mergedI.some((m) => m.toLowerCase() === c.toLowerCase()))
        mergedI.push(c);
    });
    // preserve empty ing cats
    (state.ingCategories || []).forEach((c) => {
      const inUse = state.ingredients.some(
        (i) => (i.category || "").toLowerCase() === c.toLowerCase(),
      );
      if (!inUse && !mergedI.some((m) => m.toLowerCase() === c.toLowerCase()))
        mergedI.push(c);
    });
    state.ingCategories = mergedI;
  }

  document.getElementById("category-manager-modal").classList.remove("hidden");
  renderCategoryManager("recipe");
  renderCategoryManager("ing");
}

function renderCategoryManager(type) {
  const list = document.getElementById("cat-manager-list-" + type);
  if (!list) return;
  const cats = type === "recipe" ? getRecipeCategories() : getIngCategories();
  const stateKey = type === "recipe" ? "recipeCategories" : "ingCategories";

  list.innerHTML = cats
    .map((c, idx) => {
      const inUse =
        type === "recipe"
          ? state.recipes.some(
              (r) => (r.category || "").toLowerCase() === c.toLowerCase(),
            )
          : state.ingredients.some(
              (i) => (i.category || "").toLowerCase() === c.toLowerCase(),
            );
      const usageCount =
        type === "recipe"
          ? state.recipes.filter(
              (r) => (r.category || "").toLowerCase() === c.toLowerCase(),
            ).length
          : state.ingredients.filter(
              (i) => (i.category || "").toLowerCase() === c.toLowerCase(),
            ).length;

      return `<div class="cat-manager-row" draggable="true" data-idx="${idx}" data-type="${type}"
      ondragstart="catDragStart(event,${idx},'${type}')"
      ondragover="catDragOver(event)"
      ondrop="catDrop(event,${idx},'${type}')"
      ondragend="catDragEnd(event)"
      style="cursor:default">
      <div style="display:flex;align-items:center;gap:8px;flex:1">
        <span class="cat-drag-handle" title="Drag to reorder" style="color:var(--text-muted);cursor:grab;font-size:14px;user-select:none">⠿</span>
        <input type="text" class="cat-rename-input" value="${escHtml(c)}"
          onblur="renameCategory('${type}',${idx},this.value)"
          onkeydown="if(event.key==='Enter')this.blur()"
          onclick="event.stopPropagation()"
          style="flex:1;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:13px;padding:5px 8px;border-radius:5px;outline:none" />
        ${inUse ? `<span style="font-size:10px;color:var(--text-muted);white-space:nowrap">${usageCount} in use</span>` : ""}
      </div>
      <button class="btn-icon danger btn-sm" onclick="deleteCategory('${type}',${idx})"
        title="${inUse ? "Cannot delete — in use by " + usageCount + " item(s). Reassign them first." : "Delete category"}"
        ${inUse ? 'style="opacity:0.35;cursor:not-allowed" disabled' : ""}>✕</button>
    </div>`;
    })
    .join("");
}

let _catDragSrc = null;
function catDragStart(e, idx, type) {
  _catDragSrc = idx;
  e.dataTransfer.effectAllowed = "move";
  e.currentTarget.style.opacity = "0.4";
}
function catDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.style.background = "var(--bg-hover)";
}
function catDrop(e, idx, type) {
  e.preventDefault();
  e.currentTarget.style.background = "";
  if (_catDragSrc === null || _catDragSrc === idx) return;
  const stateKey = type === "recipe" ? "recipeCategories" : "ingCategories";
  const cats = type === "recipe" ? getRecipeCategories() : getIngCategories();
  const moved = cats.splice(_catDragSrc, 1)[0];
  cats.splice(idx, 0, moved);
  state[stateKey] = cats;
  save();
  renderCategoryManager(type);
}
function catDragEnd(e) {
  _catDragSrc = null;
  document.querySelectorAll(".cat-manager-row").forEach((r) => {
    r.style.opacity = "";
    r.style.background = "";
  });
}

function renameCategory(type, idx, newName) {
  newName = newName.trim();
  if (!newName) {
    renderCategoryManager(type);
    return;
  }
  const cats = type === "recipe" ? getRecipeCategories() : getIngCategories();
  const stateKey = type === "recipe" ? "recipeCategories" : "ingCategories";
  const oldName = cats[idx];
  if (oldName === newName) return;
  if (
    cats.some((c) => c.toLowerCase() === newName.toLowerCase() && c !== oldName)
  ) {
    showToast("That name already exists", "error");
    renderCategoryManager(type);
    return;
  }

  // Update the category list
  state[stateKey][idx] = newName;

  // Update all existing items that used the old name
  if (type === "recipe") {
    state.recipes.forEach((r) => {
      if ((r.category || "").toLowerCase() === oldName.toLowerCase())
        r.category = newName;
    });
  } else {
    state.ingredients.forEach((i) => {
      if ((i.category || "").toLowerCase() === oldName.toLowerCase())
        i.category = newName;
    });
  }

  save();
  renderCategoryManager(type);
  showToast(`Renamed "${oldName}" → "${newName}"`, "success", 2000);
  if (state.activeRecipeId) renderRecipeEditor();
}

function deleteCategory(type, idx) {
  const cats = type === "recipe" ? getRecipeCategories() : getIngCategories();
  const stateKey = type === "recipe" ? "recipeCategories" : "ingCategories";
  const name = cats[idx];
  const inUse =
    type === "recipe"
      ? state.recipes.some(
          (r) => (r.category || "").toLowerCase() === name.toLowerCase(),
        )
      : state.ingredients.some(
          (i) => (i.category || "").toLowerCase() === name.toLowerCase(),
        );
  if (inUse) {
    showToast("Reassign all items before deleting", "error", 3000);
    return;
  }
  state[stateKey].splice(idx, 1);
  save();
  renderCategoryManager(type);
  showToast(`Deleted "${name}"`, "success", 1500);
}

function addCategory(type) {
  const inputId =
    type === "recipe" ? "new-recipe-cat-input" : "new-ing-cat-input";
  const input = document.getElementById(inputId);
  const name = input.value.trim();
  if (!name) return;
  const stateKey = type === "recipe" ? "recipeCategories" : "ingCategories";
  const existing =
    type === "recipe" ? getRecipeCategories() : getIngCategories();
  if (existing.some((c) => c.toLowerCase() === name.toLowerCase())) {
    showToast("Category already exists", "error");
    return;
  }
  if (!state[stateKey]) state[stateKey] = existing;
  state[stateKey].push(name);
  input.value = "";
  save();
  renderCategoryManager(type);
  showToast("Category added", "success", 1500);
}

// Keep old name for backward compat
function addCustomCategory() {
  addCategory("recipe");
}
function removeCustomCategory(name) {
  const idx = getRecipeCategories().indexOf(name);
  if (idx !== -1) deleteCategory("recipe", idx);
}

// ─── Bulk Price Update ─────────────────────────────────────────
function openBulkPriceModal() {
  document.getElementById("bulk-paste-modal").classList.remove("hidden");
  renderBulkPriceList();
}
function renderBulkPriceList() {
  const tbody = document.getElementById("bulk-price-tbody");
  tbody.innerHTML = state.ingredients
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((ing) => {
      const affected = state.recipes.filter(
        (r) =>
          r.ingredients.some((ri) => ri.ingId === ing.id) ||
          r.subRecipes?.some((sr) => {
            const sub = state.recipes.find((x) => x.id === sr.recipeId);
            return sub?.ingredients.some((ri) => ri.ingId === ing.id);
          }),
      ).length;
      return `<tr>
      <td style="font-weight:600">${escHtml(ing.name)}</td>
      <td><span class="cat-badge">${escHtml(ing.category)}</span></td>
      <td>${fmt(ing.packCost)} / ${ing.packSize}${ing.unit}</td>
      <td style="color:var(--text-muted);font-size:12px">${affected} recipe${affected !== 1 ? "s" : ""}</td>
      <td>
        <input type="number" class="bulk-price-input" data-id="${ing.id}"
          placeholder="${ing.packCost}" step="0.01" min="0"
          style="width:90px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:13px;padding:5px 8px;border-radius:5px;outline:none" />
      </td>
      <td style="color:var(--text-muted);font-size:11px">
        <span id="bulk-pct-${ing.id}"></span>
      </td>
    </tr>`;
    })
    .join("");

  // Wire inputs to show % change
  document.querySelectorAll(".bulk-price-input").forEach((input) => {
    input.addEventListener("input", () => {
      const id = input.dataset.id;
      const ing = state.ingredients.find((i) => i.id === id);
      const newVal = parseFloat(input.value);
      const span = document.getElementById("bulk-pct-" + id);
      if (!span || !ing) return;
      if (!newVal || newVal === ing.packCost) {
        span.textContent = "";
        return;
      }
      const pct = ((newVal - ing.packCost) / ing.packCost) * 100;
      span.textContent = (pct > 0 ? "+" : "") + pct.toFixed(1) + "%";
      span.style.color = pct > 0 ? "var(--red)" : "var(--green)";
    });
  });
}
function applyBulkPriceUpdate() {
  let updated = 0;
  document.querySelectorAll(".bulk-price-input").forEach((input) => {
    const id = input.dataset.id;
    const newVal = parseFloat(input.value);
    if (!newVal || isNaN(newVal)) return;
    const ing = state.ingredients.find((i) => i.id === id);
    if (!ing || newVal === ing.packCost) return;
    if (!ing.priceHistory) ing.priceHistory = [];
    ing.priceHistory.push({
      date: new Date().toISOString(),
      oldCost: ing.packCost,
      newCost: newVal,
      change: newVal - ing.packCost,
    });
    ing.packCost = newVal;
    updated++;
  });
  if (updated) {
    save();
    showToast(
      `Updated ${updated} ingredient price${updated !== 1 ? "s" : ""}`,
      "success",
      2500,
    );
    document.getElementById("bulk-paste-modal").classList.add("hidden");
    renderIngredientLibrary();
    if (state.activeRecipeId) renderRecipeEditor();
  } else {
    showToast("No prices changed", "error", 1500);
  }
}

// ─── Price Trend Chart ─────────────────────────────────────────
function openPriceTrendModal() {
  document.getElementById("price-trend-modal").classList.remove("hidden");
  const sel = document.getElementById("trend-ing-select");
  sel.innerHTML = state.ingredients
    .filter((i) => (i.priceHistory || []).length > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => `<option value="${i.id}">${escHtml(i.name)}</option>`)
    .join("");
  if (!sel.options.length) {
    document.getElementById("trend-chart-wrap").innerHTML =
      '<div style="color:var(--text-muted);padding:40px;text-align:center">No price history yet. Update ingredient costs to start tracking trends.</div>';
    return;
  }
  renderTrendChart();
}
function renderTrendChart() {
  const id = document.getElementById("trend-ing-select").value;
  const ing = state.ingredients.find((i) => i.id === id);
  if (!ing) return;
  const history = [
    {
      date: ing.priceHistory[0]?.date || new Date().toISOString(),
      newCost: ing.priceHistory[0]?.oldCost || ing.packCost,
    },
    ...(ing.priceHistory || []),
  ].slice(-20);
  if (history.length < 1) {
    document.getElementById("trend-chart-wrap").innerHTML =
      '<div style="color:var(--text-muted);padding:40px;text-align:center">No history for this ingredient yet.</div>';
    return;
  }

  const wrap = document.getElementById("trend-chart-wrap");
  const W = wrap.clientWidth || 600,
    H = 220;
  const pad = { t: 20, r: 20, b: 50, l: 56 };
  const cw = W - pad.l - pad.r,
    ch = H - pad.t - pad.b;

  const prices = history.map((h) => h.newCost);
  const minP = Math.min(...prices) * 0.95;
  const maxP = Math.max(...prices) * 1.05;
  const range = maxP - minP || 1;

  const pts = history.map((h, i) => {
    const x = pad.l + (i / Math.max(history.length - 1, 1)) * cw;
    const y = pad.t + (1 - (h.newCost - minP) / range) * ch;
    return [x, y, h];
  });

  const lineD = pts
    .map(
      (p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1),
    )
    .join(" ");
  const areaD =
    lineD +
    ` L${pts[pts.length - 1][0].toFixed(1)} ${(pad.t + ch).toFixed(1)} L${pad.l} ${(pad.t + ch).toFixed(1)} Z`;

  // Y axis labels
  const yLabels = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const val = minP + f * range;
      const y = pad.t + (1 - f) * ch;
      return `<text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text-muted)">£${val.toFixed(2)}</text>
            <line x1="${pad.l}" y1="${y}" x2="${pad.l + cw}" y2="${y}" stroke="var(--border)" stroke-dasharray="3"/>`;
    })
    .join("");

  // X axis labels (dates)
  const xLabels = pts
    .filter(
      (_, i) =>
        i === 0 ||
        i === pts.length - 1 ||
        pts.length <= 6 ||
        i % Math.ceil(pts.length / 5) === 0,
    )
    .map(
      ([x, , h]) =>
        `<text x="${x.toFixed(1)}" y="${pad.t + ch + 18}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${new Date(h.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</text>`,
    )
    .join("");

  // Dots and tooltips
  const dots = pts
    .map(
      ([x, y, h]) =>
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="var(--accent)" stroke="var(--bg-card)" stroke-width="2">
       <title>£${h.newCost.toFixed(2)} on ${new Date(h.date).toLocaleDateString("en-GB")}</title>
     </circle>`,
    )
    .join("");

  const pctChange =
    prices.length > 1
      ? ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100
      : 0;
  const trendCol =
    pctChange > 0
      ? "var(--red)"
      : pctChange < 0
        ? "var(--green)"
        : "var(--text-muted)";

  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700">${escHtml(ing.name)}</div>
      <div style="font-size:12px;color:${trendCol};font-weight:700">${pctChange > 0 ? "+" : ""}${pctChange.toFixed(1)}% since first record · Current: £${ing.packCost.toFixed(2)}</div>
    </div>
    <svg width="${W}" height="${H}" style="overflow:visible">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${yLabels}
      <path d="${areaD}" fill="url(#areaGrad)"/>
      <path d="${lineD}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
      ${dots}
      ${xLabels}
    </svg>`;
}

// ─── Menu Margin Heatmap ──────────────────────────────────────
function openMarginHeatmap() {
  document.getElementById("margin-heatmap-modal").classList.remove("hidden");
  renderMarginHeatmap();
}
function renderMarginHeatmap() {
  const wrap = document.getElementById("heatmap-wrap");
  if (!state.recipes.length) {
    wrap.innerHTML =
      '<div style="color:var(--text-muted);padding:40px;text-align:center">No recipes yet.</div>';
    return;
  }

  const cats = [...new Set(state.recipes.map((r) => r.category))].sort();
  const rows = state.recipes.map((r) => {
    const cpp = recipeTotalCost(r) / (r.portions || 1);
    const price = r.priceOverride || suggestPrice(cpp, state.activeGP);
    const gp = price > 0 ? ((price - cpp) / price) * 100 : 0;
    return { r, cpp, price, gp };
  });

  const gpVals = rows.map((r) => r.gp);
  const minGP = Math.min(...gpVals),
    maxGP = Math.max(...gpVals);

  function gpColor(gp) {
    if (gp >= 75)
      return {
        bg: "rgba(34,197,94,0.25)",
        border: "rgba(34,197,94,0.6)",
        text: "var(--green)",
      };
    if (gp >= 65)
      return {
        bg: "rgba(251,191,36,0.2)",
        border: "rgba(251,191,36,0.5)",
        text: "#d97706",
      };
    if (gp >= 55)
      return {
        bg: "rgba(249,115,22,0.2)",
        border: "rgba(249,115,22,0.5)",
        text: "#ea580c",
      };
    return {
      bg: "rgba(239,68,68,0.2)",
      border: "rgba(239,68,68,0.5)",
      text: "var(--red)",
    };
  }

  let html =
    '<div style="margin-bottom:12px;display:flex;gap:16px;flex-wrap:wrap;font-size:11px">' +
    '<span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;border-radius:2px;background:rgba(34,197,94,0.25);border:1px solid rgba(34,197,94,0.6);display:inline-block"></span>≥75% GP (Excellent)</span>' +
    '<span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;border-radius:2px;background:rgba(251,191,36,0.2);border:1px solid rgba(251,191,36,0.5);display:inline-block"></span>65–74% GP (Good)</span>' +
    '<span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;border-radius:2px;background:rgba(249,115,22,0.2);border:1px solid rgba(249,115,22,0.5);display:inline-block"></span>55–64% GP (Marginal)</span>' +
    '<span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;border-radius:2px;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.5);display:inline-block"></span>&lt;55% GP (Review)</span>' +
    "</div>";

  cats.forEach((cat) => {
    const catRows = rows.filter((r) => r.r.category === cat);
    html += `<div style="margin-bottom:18px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);font-weight:700;margin-bottom:8px">${escHtml(cat)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">`;
    catRows.forEach(({ r, gp, cpp, price }) => {
      const col = gpColor(gp);
      const tags = (r.tags || [])
        .slice(0, 2)
        .map(
          (t) =>
            `<span style="font-size:9px;background:var(--bg-card2);border-radius:2px;padding:1px 4px;color:var(--text-muted)">${escHtml(t)}</span>`,
        )
        .join("");
      html += `<div onclick="selectRecipe('${r.id}');document.getElementById('margin-heatmap-modal').classList.add('hidden')"
        style="background:${col.bg};border:1.5px solid ${col.border};border-radius:8px;padding:10px 12px;min-width:130px;max-width:180px;cursor:pointer;transition:transform .1s" onmouseenter="this.style.transform='scale(1.03)'" onmouseleave="this.style.transform=''">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escHtml(r.name)}">${escHtml(r.name)}</div>
        <div style="font-size:20px;font-weight:800;color:${col.text}">${gp.toFixed(1)}%</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${fmt(price)} sell · ${fmt(cpp)} cost</div>
        ${tags ? '<div style="margin-top:5px;display:flex;gap:3px;flex-wrap:wrap">' + tags + "</div>" : ""}
      </div>`;
    });
    html += "</div></div>";
  });

  wrap.innerHTML = html;
}

// ─── Theoretical vs Actual GP ─────────────────────────────────

function openSpecialsBoard() {
  const modal = document.getElementById("specials-board-modal");
  if (!modal) return;
  // Populate recipe checkboxes
  const list = document.getElementById("specials-recipe-list");
  list.innerHTML = state.recipes
    .filter((r) => !r.yieldQty)
    .map((r) => {
      const cpp = recipeTotalCost(r) / (r.portions || 1);
      const price = r.priceOverride || suggestPrice(cpp, state.activeGP);
      const gp = price > 0 ? ((price - cpp) / price) * 100 : 0;
      return `<label style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);cursor:pointer">
      <input type="checkbox" class="specials-check" value="${r.id}" style="accent-color:var(--accent);width:14px;height:14px;flex-shrink:0" />
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600">${escHtml(r.name)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${escHtml(r.category || "—")} · ${fmt(price)} · ${gp.toFixed(0)}% GP</div>
      </div>
    </label>`;
    })
    .join("");
  document.getElementById("specials-date").value =
    new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  modal.classList.remove("hidden");
}

function printSpecialsBoard() {
  const title =
    document.getElementById("specials-title").value || "Weekly Specials";
  const dateStr = document.getElementById("specials-date").value;
  const showGP = document.getElementById("specials-show-gp").checked;
  const showCost = document.getElementById("specials-show-cost").checked;
  const checks = [...document.querySelectorAll(".specials-check:checked")].map(
    (c) => c.value,
  );
  if (!checks.length) {
    showToast("Select at least one recipe", "error", 2000);
    return;
  }

  const rows = checks
    .map((id) => {
      const r = state.recipes.find((x) => x.id === id);
      if (!r) return "";
      const cpp = recipeTotalCost(r) / (r.portions || 1);
      const price = r.priceOverride || suggestPrice(cpp, state.activeGP);
      const gp = price > 0 ? ((price - cpp) / price) * 100 : 0;
      const allergens = recipeAllergens(r);
      return `<tr>
      <td style="padding:10px 14px;font-size:15px;font-weight:700;border-bottom:1px solid #e5e7eb">${escHtml(r.name)}</td>
      <td style="padding:10px 14px;color:#6b7280;font-size:13px;border-bottom:1px solid #e5e7eb">${escHtml(r.category || "")}</td>
      <td style="padding:10px 14px;font-size:15px;font-weight:700;color:#111;text-align:right;border-bottom:1px solid #e5e7eb">${fmt(price)}</td>
      ${showCost ? `<td style="padding:10px 14px;font-size:12px;color:#6b7280;text-align:right;border-bottom:1px solid #e5e7eb">${fmt(cpp)} cost</td>` : ""}
      ${showGP ? `<td style="padding:10px 14px;font-size:12px;font-weight:700;color:${gp >= 70 ? "#16a34a" : gp >= 55 ? "#d97706" : "#dc2626"};text-align:right;border-bottom:1px solid #e5e7eb">${gp.toFixed(0)}% GP</td>` : ""}
      <td style="padding:10px 14px;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb">${allergens.length ? "⚠ " + allergens.join(", ") : ""}</td>
    </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <title>${escHtml(title)}</title>
    <style>
      body{font-family:Georgia,serif;margin:0;padding:32px 40px;color:#111;background:#fff}
      h1{font-size:28px;font-weight:700;margin:0 0 4px;letter-spacing:-0.5px}
      .sub{font-size:14px;color:#6b7280;margin-bottom:24px}
      table{width:100%;border-collapse:collapse}
      th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#9ca3af;padding:6px 14px;border-bottom:2px solid #111}
      @media print{body{padding:20px}}
    </style></head><body>
    <h1>${escHtml(title)}</h1>
    <div class="sub">${escHtml(dateStr)}</div>
    <table>
      <thead><tr>
        <th>Dish</th><th>Category</th><th style="text-align:right">Price</th>
        ${showCost ? '<th style="text-align:right">Cost</th>' : ""}
        ${showGP ? '<th style="text-align:right">GP</th>' : ""}
        <th>Allergens</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:32px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px">
      Generated ${new Date().toLocaleDateString("en-GB")} · Recipe Costing App
    </div>
    <script>window.onload=()=>window.print();<\/script>
  </body></html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  } else showToast("Allow popups to print", "error", 3000);
}

function printAllergenSheet() {
  const recipes = state.recipes.filter((r) => !r.yieldQty);
  if (!recipes.length) {
    showToast("No recipes to print", "error", 2000);
    return;
  }

  const SHORT = {
    Celery: "CEL",
    "Cereals (Gluten)": "GLU",
    Crustaceans: "CRU",
    Eggs: "EGG",
    Fish: "FSH",
    Lupin: "LUP",
    Milk: "MLK",
    Molluscs: "MOL",
    Mustard: "MUS",
    Nuts: "NUT",
    Peanuts: "PNT",
    Sesame: "SES",
    Soya: "SOY",
    "Sulphur Dioxide": "SO2",
  };
  const cols = ALLERGENS;

  const headerRow = cols
    .map(
      (a) =>
        `<th style="width:30px;padding:3px 2px;font-size:9px;font-weight:700;text-align:center;border:1px solid #d1d5db;background:#f9fafb;writing-mode:vertical-lr;transform:rotate(180deg);height:70px;vertical-align:bottom">${escHtml(a)}</th>`,
    )
    .join("");

  const bodyRows = recipes
    .map((r) => {
      const allergens = recipeAllergens(r);
      const cells = cols
        .map((a) => {
          const has = allergens.includes(a);
          return `<td style="text-align:center;border:1px solid #d1d5db;padding:2px;background:${has ? "#1f2937" : "#fff"}">
        ${has ? '<span style="color:#fff;font-size:10px;font-weight:700">●</span>' : ""}
      </td>`;
        })
        .join("");
      return `<tr>
      <td style="padding:4px 8px;font-size:12px;font-weight:600;border:1px solid #d1d5db;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis">${escHtml(r.name)}</td>
      <td style="padding:4px 8px;font-size:11px;color:#6b7280;border:1px solid #d1d5db">${escHtml(r.category || "")}</td>
      ${cells}
    </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <title>Allergen Matrix</title>
    <style>
      body{font-family:Arial,sans-serif;margin:0;padding:20px;font-size:12px;color:#111}
      h1{font-size:18px;margin:0 0 4px;font-weight:700}
      .sub{font-size:11px;color:#6b7280;margin-bottom:16px}
      table{border-collapse:collapse;width:100%}
      .legend{margin-top:16px;font-size:10px;color:#6b7280;display:flex;gap:16px;align-items:center}
      @media print{body{padding:10px}@page{size:A4 landscape}}
    </style></head><body>
    <h1>Allergen Information Sheet</h1>
    <div class="sub">Generated ${new Date().toLocaleDateString("en-GB")} · All 14 major allergens (UK Food Information Regulations)</div>
    <table>
      <thead>
        <tr>
          <th style="text-align:left;padding:4px 8px;border:1px solid #d1d5db;background:#f9fafb;font-size:11px">Dish</th>
          <th style="text-align:left;padding:4px 8px;border:1px solid #d1d5db;background:#f9fafb;font-size:11px">Category</th>
          ${headerRow}
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div class="legend">
      <span><span style="background:#1f2937;color:#fff;padding:1px 6px;border-radius:2px">●</span> Contains allergen</span>
      <span>Always verify with your supplier. This sheet is generated from your recipe data.</span>
    </div>
    <script>window.onload=()=>window.print();<\/script>
  </body></html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  } else showToast("Allow popups to print", "error", 3000);
}

async function checkCompetitorPrice(recipeId) {
  const recipe = state.recipes.find((r) => r.id === recipeId);
  if (!recipe) return;
  const key = getAiKey("gemini-flash") || getAiKey("gemini-flash-lite") || "";
  if (!key) {
    showToast("Add your Google API key in Settings first", "error", 3000);
    return;
  }

  const cpp = recipeTotalCost(recipe) / (recipe.portions || 1);
  const vatRate = state.vatRate || 0;
  // My price — always stored ex-VAT, convert to inc-VAT for comparison
  const myPriceEx = recipe.priceOverride || suggestPrice(cpp, state.activeGP);
  const myPriceInc = myPriceEx * (1 + vatRate / 100);
  showToast("Checking market rates…", "success", 2000);

  try {
    const raw = await callGeminiText(
      `What is the typical restaurant menu price range (inclusive of VAT at 20%) for "${recipe.name}" ` +
        `(category: ${recipe.category || "main course"}) in the UK in 2025? ` +
        `Give me: low end price, mid range price, high end price (all inc VAT as shown on a menu), ` +
        `and a one-sentence note on what drives the variation. ` +
        `Reply ONLY with JSON: {"low":0,"mid":0,"high":0,"note":""}`,
    );
    const result = JSON.parse(raw);

    const modal = document.getElementById("competitor-quick-modal");
    if (!modal) return;

    const cur = state.currency || "£";
    document.getElementById("cq-title").textContent = recipe.name;
    // Show my price inc-VAT
    document.getElementById("cq-my-price").textContent = fmt(myPriceInc);
    const myPriceSubtitle = document.getElementById("cq-my-price-sub");
    if (myPriceSubtitle)
      myPriceSubtitle.textContent =
        vatRate > 0 ? `${fmt(myPriceEx)} ex VAT` : "";
    // Market prices from AI are already inc-VAT
    document.getElementById("cq-low").textContent = fmt(result.low);
    document.getElementById("cq-mid").textContent = fmt(result.mid);
    document.getElementById("cq-high").textContent = fmt(result.high);
    document.getElementById("cq-note").textContent = result.note;
    // Compare inc-VAT price to market
    const pos =
      myPriceInc < result.low
        ? "below market"
        : myPriceInc > result.high
          ? "above market"
          : "within market range";
    const posCol =
      myPriceInc < result.low
        ? "var(--red)"
        : myPriceInc > result.high
          ? "var(--accent)"
          : "var(--green)";
    document.getElementById("cq-position").innerHTML =
      `Your menu price of ${fmt(myPriceInc)} is <strong style="color:${posCol}">${pos}</strong>`;
    // Update column headers to show inc VAT
    const myHeader = document.getElementById("cq-my-header");
    const marketHeader = document.getElementById("cq-market-header");
    if (myHeader)
      myHeader.textContent = vatRate > 0 ? "MY PRICE (inc VAT)" : "MY PRICE";
    if (marketHeader)
      marketHeader.textContent =
        vatRate > 0 ? "MARKET RANGE (inc VAT)" : "MARKET RANGE";
    // Flush stale menu handlers then show
    document
      .querySelectorAll(".rh-more-menu")
      .forEach((m) => m.classList.add("hidden"));
    document.body.click();
    modal.classList.remove("hidden");
  } catch (e) {
    showToast("Market check failed: " + (e.message || e), "error", 5000);
  }
}

// Track VAT mode for set prices modal
let _sptVatMode = "ex"; // 'ex' or 'inc'

function setSptVatMode(mode) {
  _sptVatMode = mode;
  // Update toggle button styles
  document.querySelectorAll(".spt-vat-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });
  // Re-render all input values and GP cells
  const vatRate = state.vatRate || 0;
  document.querySelectorAll(".spt-price-input").forEach((input) => {
    const exPrice = parseFloat(input.dataset.exPrice);
    if (!exPrice) return;
    input.value =
      mode === "inc"
        ? (exPrice * (1 + vatRate / 100)).toFixed(2)
        : exPrice.toFixed(2);
    updateSetPriceRow(input);
  });
}

function openSetPricesModal() {
  const modal = document.getElementById("set-prices-modal");
  if (!modal) return;
  _sptVatMode = "ex";
  renderSetPricesTable();
  modal.classList.remove("hidden");
}

function renderSetPricesTable() {
  const tbody = document.getElementById("spt-tbody");
  if (!tbody) return;
  const cur = state.currency || "£";
  const vatRate = state.vatRate || 0;
  const target = getFoodCostTarget();

  // Update VAT toggle visibility
  const vatToggle = document.getElementById("spt-vat-toggle");
  if (vatToggle) vatToggle.style.display = vatRate > 0 ? "flex" : "none";
  // Reset toggle to ex
  document
    .querySelectorAll(".spt-vat-btn")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === _sptVatMode),
    );

  const rows = state.recipes
    .filter((r) => !r.yieldQty)
    .map((r) => {
      const cpp = recipeTotalCost(r) / (r.portions || 1);
      const suggested = suggestPrice(cpp, state.activeGP);
      // Existing price — always stored ex-VAT
      const exPrice = r.priceOverride || null;
      const displayPrice = exPrice
        ? _sptVatMode === "inc"
          ? (exPrice * (1 + vatRate / 100)).toFixed(2)
          : exPrice.toFixed(2)
        : "";
      const suggestedDisplay =
        _sptVatMode === "inc"
          ? (suggested * (1 + vatRate / 100)).toFixed(2)
          : suggested.toFixed(2);
      const gp = exPrice > 0 ? ((exPrice - cpp) / exPrice) * 100 : null;
      const fc = exPrice > 0 ? (cpp / exPrice) * 100 : null;
      const gpCol =
        fc === null
          ? "var(--text-muted)"
          : fc <= target
            ? "var(--green)"
            : fc <= target + 5
              ? "var(--accent)"
              : "var(--red)";
      const altPrice =
        exPrice > 0 && vatRate > 0
          ? _sptVatMode === "inc"
            ? `<span style="font-size:10px;color:var(--text-muted)">${cur}${exPrice.toFixed(2)} ex</span>`
            : `<span style="font-size:10px;color:var(--text-muted)">${cur}${(exPrice * (1 + vatRate / 100)).toFixed(2)} inc</span>`
          : "";
      return `<tr id="spt-row-${r.id}">
      <td style="padding:8px 12px;font-weight:600;font-size:13px">${escHtml(r.name)}</td>
      <td style="padding:8px 12px;font-size:11px;color:var(--text-muted)">${escHtml(r.category || "—")}</td>
      <td style="padding:8px 12px;font-size:13px;color:var(--text-muted);text-align:right">${cur}${cpp.toFixed(2)}</td>
      <td style="padding:8px 12px;font-size:12px;color:var(--text-muted);text-align:right">${cur}${suggestedDisplay}</td>
      <td style="padding:8px 6px;text-align:right">
        <div style="display:flex;align-items:center;gap:4px;justify-content:flex-end">
          <span style="font-size:12px;color:var(--text-muted)">${cur}</span>
          <input type="number" class="spt-price-input" data-id="${r.id}" data-cpp="${cpp.toFixed(4)}"
            data-ex-price="${exPrice || ""}"
            value="${displayPrice}" placeholder="${suggestedDisplay}"
            min="0" step="0.01"
            style="width:80px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);
                   font-family:var(--font);font-size:13px;font-weight:700;padding:5px 8px;
                   border-radius:var(--radius-sm);outline:none;text-align:right"
            oninput="updateSetPriceRow(this)"
            onkeydown="if(event.key==='Enter'||event.key==='Tab'){event.preventDefault();focusNextSptInput(this)}"
            onfocus="this.select()" />
        </div>
      </td>
      <td style="padding:8px 12px;text-align:right" id="spt-gp-${r.id}">
        ${
          gp !== null
            ? `<span style="font-size:13px;font-weight:700;color:${gpCol}">${gp.toFixed(1)}%</span>${altPrice ? "<br>" + altPrice : ""}`
            : `<span style="font-size:11px;color:var(--text-muted)">—</span>`
        }
      </td>
      <td style="padding:8px 6px;text-align:center">
        <button class="btn-secondary btn-sm" style="font-size:11px" onclick="applySptSuggestedPrice('${r.id}',${cpp.toFixed(4)})">Use ${cur}${suggestedDisplay}</button>
      </td>
    </tr>`;
    })
    .join("");
  tbody.innerHTML =
    rows ||
    '<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--text-muted)">No recipes yet</td></tr>';
  const first =
    tbody.querySelector(".spt-price-input:not([value])") ||
    tbody.querySelector(".spt-price-input");
  if (first) setTimeout(() => first.focus(), 50);
}

function updateSetPriceRow(input) {
  const id = input.dataset.id;
  const cpp = parseFloat(input.dataset.cpp);
  const displayPrice = parseFloat(input.value);
  const cell = document.getElementById("spt-gp-" + id);
  if (!cell) return;
  const cur = state.currency || "£";
  const vatRate = state.vatRate || 0;
  const target = getFoodCostTarget();
  if (!displayPrice || displayPrice <= 0) {
    cell.innerHTML =
      '<span style="font-size:11px;color:var(--text-muted)">—</span>';
    input.dataset.exPrice = "";
    return;
  }
  // Convert display price to ex-VAT for GP calculation
  const exPrice =
    _sptVatMode === "inc" ? displayPrice / (1 + vatRate / 100) : displayPrice;
  input.dataset.exPrice = exPrice.toFixed(4);
  const gp = ((exPrice - cpp) / exPrice) * 100;
  const fc = (cpp / exPrice) * 100;
  const col =
    fc <= target
      ? "var(--green)"
      : fc <= target + 5
        ? "var(--accent)"
        : "var(--red)";
  const altPrice =
    vatRate > 0
      ? _sptVatMode === "inc"
        ? `<br><span style="font-size:10px;color:var(--text-muted)">${cur}${exPrice.toFixed(2)} ex</span>`
        : `<br><span style="font-size:10px;color:var(--text-muted)">${cur}${(exPrice * (1 + vatRate / 100)).toFixed(2)} inc</span>`
      : "";
  cell.innerHTML = `<span style="font-size:13px;font-weight:700;color:${col}">${gp.toFixed(1)}%</span>${altPrice}`;
  input.style.borderColor =
    fc <= target
      ? "var(--green)"
      : fc <= target + 5
        ? "var(--accent)"
        : "var(--red)";
}

function focusNextSptInput(input) {
  const inputs = [...document.querySelectorAll(".spt-price-input")];
  const idx = inputs.indexOf(input);
  if (idx < inputs.length - 1) {
    inputs[idx + 1].focus();
    inputs[idx + 1].select();
  } else saveSetPrices();
}

function applySptSuggestedPrice(id, cpp) {
  const suggested = suggestPrice(cpp, state.activeGP);
  const vatRate = state.vatRate || 0;
  const displaySuggested =
    _sptVatMode === "inc" ? suggested * (1 + vatRate / 100) : suggested;
  const input = document.querySelector(`.spt-price-input[data-id="${id}"]`);
  if (input) {
    input.value = displaySuggested.toFixed(2);
    updateSetPriceRow(input);
    input.style.borderColor = "var(--green)";
  }
}

function applyAllSptSuggested() {
  document.querySelectorAll(".spt-price-input").forEach((input) => {
    const cpp = parseFloat(input.dataset.cpp);
    const suggested = suggestPrice(cpp, state.activeGP);
    const vatRate = state.vatRate || 0;
    const displaySuggested =
      _sptVatMode === "inc" ? suggested * (1 + vatRate / 100) : suggested;
    if (!input.value) {
      input.value = displaySuggested.toFixed(2);
      updateSetPriceRow(input);
    }
  });
}

function saveSetPrices() {
  let saved = 0;
  document.querySelectorAll(".spt-price-input").forEach((input) => {
    const id = input.dataset.id;
    const exPrice = parseFloat(input.dataset.exPrice);
    const recipe = state.recipes.find((r) => r.id === id);
    if (recipe && exPrice > 0) {
      recipe.priceOverride = Math.round(exPrice * 100) / 100; // store ex-VAT always
      recipe.priceOverrideVatMode = "ex";
      saved++;
    }
  });
  save();
  renderSidebarRecipes();
  renderHome();
  document.getElementById("set-prices-modal").classList.add("hidden");
  showToast(`✓ ${saved} price${saved !== 1 ? "s" : ""} saved`, "success", 2000);
}

function buildCompletionScore(recipe) {
  const checks = [
    { done: !!recipe.name && recipe.name !== "New Recipe", label: "Name" },
    { done: !!recipe.category, label: "Category" },
    { done: recipe.ingredients.length > 0, label: "Ingredients" },
    { done: !!(recipe.priceOverride || recipe.yieldQty), label: "Price" },
  ];
  const done = checks.filter((c) => c.done).length;
  const total = checks.length;
  if (done === total)
    return `<span class="recipe-complete-badge" title="Recipe complete ✓">✓ Complete</span>`;
  const missing = checks
    .filter((c) => !c.done)
    .map((c) => c.label)
    .join(", ");
  const col =
    done >= 4
      ? "var(--accent)"
      : done >= 2
        ? "var(--text-muted)"
        : "var(--red)";
  return `<span class="recipe-score-badge" title="Missing: ${escHtml(missing)}" style="color:${col}">${done}/${total}</span>`;
}

function buildWhatIfPanel(recipe, baseCpp) {
  const ings = recipe.ingredients
    .map((ri) => {
      const ing = state.ingredients.find((i) => i.id === ri.ingId);
      return ing ? { ing, ri } : null;
    })
    .filter(Boolean);
  if (!ings.length) return "";

  return `<div class="whatif-panel">
    <div class="whatif-header" onclick="toggleWhatIf()" style="cursor:pointer;user-select:none">
      <span style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px">🔮 What-if Modeller</span>
      <span id="whatif-chevron" style="font-size:11px;color:var(--text-muted)">▾</span>
    </div>
    <div id="whatif-body" style="display:none">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Slide an ingredient price to see the impact on this recipe's cost.</div>
      <select id="whatif-ing-sel" onchange="updateWhatIf()" style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:5px 8px;border-radius:4px;outline:none;margin-bottom:8px">
        ${ings.map(({ ing }) => `<option value="${ing.id}">${escHtml(ing.name)} — ${fmt(ing.packCost)}/${ing.packSize}${ing.unit}</option>`).join("")}
      </select>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:11px;color:var(--text-muted);width:20px">-50%</span>
        <input type="range" id="whatif-slider" min="-50" max="100" step="1" value="0"
          oninput="updateWhatIf()"
          style="flex:1;accent-color:var(--accent)" />
        <span style="font-size:11px;color:var(--text-muted);width:28px">+100%</span>
      </div>
      <div id="whatif-result" style="font-size:12px;padding:8px;background:var(--bg-card2);border-radius:4px;text-align:center">
        Move the slider to see impact
      </div>
    </div>
  </div>`;
}

function toggleWhatIf() {
  const body = document.getElementById("whatif-body");
  const chev = document.getElementById("whatif-chevron");
  if (!body) return;
  const open = body.style.display === "none";
  body.style.display = open ? "" : "none";
  if (chev) chev.textContent = open ? "▴" : "▾";
  if (open) updateWhatIf();
}

function updateWhatIf() {
  const sel = document.getElementById("whatif-ing-sel");
  const slider = document.getElementById("whatif-slider");
  const result = document.getElementById("whatif-result");
  if (!sel || !slider || !result) return;

  const ingId = sel.value;
  const pctChange = parseInt(slider.value);
  const ing = state.ingredients.find((i) => i.id === ingId);
  const recipe = getActiveRecipe();
  if (!ing || !recipe) return;

  // Calculate new cost with modified ingredient price
  const origCost = ing.packCost;
  const newCost = origCost * (1 + pctChange / 100);
  ing.packCost = newCost;
  const newTotalCost = recipeTotalCost(recipe);
  const newCpp = newTotalCost / (recipe.portions || 1);
  ing.packCost = origCost; // restore

  const origCpp = recipeTotalCost(recipe) / (recipe.portions || 1);
  const diff = newCpp - origCpp;
  const diffPct = origCpp > 0 ? (diff / origCpp) * 100 : 0;
  const price = recipe.priceOverride || suggestPrice(origCpp, state.activeGP);
  const newGP = price > 0 ? ((price - newCpp) / price) * 100 : 0;
  const gpDiff = newGP - (price > 0 ? ((price - origCpp) / price) * 100 : 0);

  const col =
    diff > 0 ? "var(--red)" : diff < 0 ? "var(--green)" : "var(--text-muted)";
  const sign = diff >= 0 ? "+" : "";
  const label =
    pctChange === 0
      ? "No change"
      : `${ing.name} ${pctChange > 0 ? "up" : "down"} ${Math.abs(pctChange)}%`;

  result.innerHTML =
    pctChange === 0
      ? `<span style="color:var(--text-muted)">Move the slider to see impact</span>`
      : `<div style="font-weight:600;color:${col}">${label}</div>
       <div style="margin-top:4px">Cost/portion: ${fmt(newCpp)} <span style="color:${col}">(${sign}${fmt(diff)})</span></div>
       <div>GP impact: <span style="color:${col}">${sign}${gpDiff.toFixed(1)}% → ${newGP.toFixed(1)}% GP</span></div>`;
}

function buildActualGPPanel(recipe) {
  if (!recipe.actualSales) return "";
  const s = recipe.actualSales;
  const cpp = recipeTotalCost(recipe) / (recipe.portions || 1);
  const totalFoodCost = cpp * s.covers;
  const actualGP =
    s.revenue > 0 ? ((s.revenue - totalFoodCost) / s.revenue) * 100 : 0;
  const actualProfit = s.revenue - totalFoodCost;
  const sellPrice = recipe.priceOverride || suggestPrice(cpp, state.activeGP);
  const theoreticGP =
    sellPrice > 0 ? ((sellPrice - cpp) / sellPrice) * 100 : state.activeGP;
  const diff = actualGP - theoreticGP;
  const col = diff >= 0 ? "var(--green)" : "var(--red)";
  const icon = diff >= 0 ? "▲" : "▼";
  const avgSell = s.covers > 0 ? s.revenue / s.covers : 0;
  const period = s.period || "this period";
  return `<div class="actual-gp-panel">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);margin-bottom:10px">📊 Actual vs Theoretical — ${escHtml(period)}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <div style="background:var(--bg-card2);border:1px solid var(--border);border-radius:6px;padding:8px;text-align:center">
        <div style="font-size:18px;font-weight:800;color:var(--accent)">${theoreticGP.toFixed(1)}%</div>
        <div style="font-size:10px;color:var(--text-muted)">Theoretical GP</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${fmt(sellPrice)} sell · ${fmt(cpp)} cost</div>
      </div>
      <div style="background:var(--bg-card2);border:1px solid var(--border);border-radius:6px;padding:8px;text-align:center">
        <div style="font-size:18px;font-weight:800;color:${col}">${actualGP.toFixed(1)}%</div>
        <div style="font-size:10px;color:var(--text-muted)">Actual GP</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${fmt(avgSell)} avg sell · ${fmt(cpp)} cost</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px">
      <div style="text-align:center;padding:6px;background:var(--bg-card2);border-radius:5px">
        <div style="font-size:14px;font-weight:700">${s.covers}</div>
        <div style="font-size:10px;color:var(--text-muted)">Covers</div>
      </div>
      <div style="text-align:center;padding:6px;background:var(--bg-card2);border-radius:5px">
        <div style="font-size:14px;font-weight:700">${fmt(s.revenue)}</div>
        <div style="font-size:10px;color:var(--text-muted)">Revenue</div>
      </div>
      <div style="text-align:center;padding:6px;background:var(--bg-card2);border-radius:5px">
        <div style="font-size:14px;font-weight:700;color:${col}">${fmt(actualProfit)}</div>
        <div style="font-size:10px;color:var(--text-muted)">Actual Profit</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:${diff >= 0 ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)"};border:1px solid ${diff >= 0 ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"};border-radius:5px">
      <span style="font-size:12px;color:var(--text-muted)">GP Variance</span>
      <span style="font-size:14px;font-weight:800;color:${col}">${icon} ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%</span>
      <button style="font-size:10px;background:none;border:none;color:var(--text-muted);cursor:pointer;padding:2px 6px" onclick="openActualSalesModal('${recipe.id}')">Edit</button>
    </div>
  </div>`;
}

// ─── Actual Sales Modal ────────────────────────────────────────
function openActualSalesModal(recipeId) {
  const recipe = state.recipes.find((r) => r.id === recipeId);
  if (!recipe) return;
  const s = recipe.actualSales || {};
  const cpp = recipeTotalCost(recipe) / (recipe.portions || 1);
  const sellPrice = recipe.priceOverride || suggestPrice(cpp, state.activeGP);

  document.getElementById("actual-sales-recipe-id").value = recipeId;
  document.getElementById("actual-sales-period").value = s.period || "";
  document.getElementById("actual-sales-covers").value = s.covers || "";
  document.getElementById("actual-sales-revenue").value = s.revenue || "";
  document.getElementById("actual-sales-modal").classList.remove("hidden");
  // Pre-fill hint
  document.getElementById("actual-sales-hint").textContent =
    "Theoretical: " +
    fmt(sellPrice) +
    " sell × covers = revenue. Cost/portion: " +
    fmt(cpp);
  updateActualSalesCalc();
}

function updateActualSalesCalc() {
  const recipeId = document.getElementById("actual-sales-recipe-id").value;
  const recipe = state.recipes.find((r) => r.id === recipeId);
  if (!recipe) return;
  const covers =
    parseFloat(document.getElementById("actual-sales-covers").value) || 0;
  const revenue =
    parseFloat(document.getElementById("actual-sales-revenue").value) || 0;
  const cpp = recipeTotalCost(recipe) / (recipe.portions || 1);
  const el = document.getElementById("actual-sales-live-calc");
  if (!covers || !revenue) {
    el.innerHTML = "";
    return;
  }
  const totalCost = cpp * covers;
  const profit = revenue - totalCost;
  const gp = revenue > 0 ? (profit / revenue) * 100 : 0;
  const theoreticGP =
    (recipe.priceOverride || suggestPrice(cpp, state.activeGP)) > 0
      ? (((recipe.priceOverride || suggestPrice(cpp, state.activeGP)) - cpp) /
          (recipe.priceOverride || suggestPrice(cpp, state.activeGP))) *
        100
      : state.activeGP;
  const diff = gp - theoreticGP;
  const col = diff >= 0 ? "var(--green)" : "var(--red)";
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px">
      <div style="text-align:center;padding:8px;background:var(--bg-card2);border-radius:6px">
        <div style="font-size:15px;font-weight:700">${fmt(revenue / covers)}</div>
        <div style="font-size:10px;color:var(--text-muted)">Avg Sell Price</div>
      </div>
      <div style="text-align:center;padding:8px;background:var(--bg-card2);border-radius:6px">
        <div style="font-size:15px;font-weight:700">${fmt(totalCost)}</div>
        <div style="font-size:10px;color:var(--text-muted)">Total Food Cost</div>
      </div>
      <div style="text-align:center;padding:8px;background:var(--bg-card2);border-radius:6px">
        <div style="font-size:15px;font-weight:700;color:${col}">${fmt(profit)}</div>
        <div style="font-size:10px;color:var(--text-muted)">Actual Profit</div>
      </div>
      <div style="text-align:center;padding:8px;background:${diff >= 0 ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)"};border:1px solid ${diff >= 0 ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"};border-radius:6px">
        <div style="font-size:15px;font-weight:800;color:${col}">${gp.toFixed(1)}%</div>
        <div style="font-size:10px;color:var(--text-muted)">Actual GP</div>
        <div style="font-size:10px;font-weight:700;color:${col}">${diff >= 0 ? "+" : ""}${diff.toFixed(1)}% vs theory</div>
      </div>
    </div>`;
}

function saveActualSales() {
  const recipeId = document.getElementById("actual-sales-recipe-id").value;
  const recipe = state.recipes.find((r) => r.id === recipeId);
  if (!recipe) return;
  const covers = parseFloat(
    document.getElementById("actual-sales-covers").value,
  );
  const revenue = parseFloat(
    document.getElementById("actual-sales-revenue").value,
  );
  const period = document.getElementById("actual-sales-period").value.trim();
  if (!covers || !revenue) {
    showToast("Enter covers and revenue", "error", 2000);
    return;
  }
  recipe.actualSales = {
    covers,
    revenue,
    period: period || "Last period",
    savedAt: new Date().toISOString(),
  };
  // Keep backward compat
  const cpp = recipeTotalCost(recipe) / (recipe.portions || 1);
  recipe.actualGP =
    revenue > 0 ? ((revenue - cpp * covers) / revenue) * 100 : null;
  save();
  document.getElementById("actual-sales-modal").classList.add("hidden");
  renderRecipeEditor();
  showToast("✓ Actual sales saved", "success", 2000);
}

function clearActualSales() {
  const recipeId = document.getElementById("actual-sales-recipe-id").value;
  const recipe = state.recipes.find((r) => r.id === recipeId);
  if (!recipe) return;
  recipe.actualSales = null;
  recipe.actualGP = null;
  save();
  document.getElementById("actual-sales-modal").classList.add("hidden");
  renderRecipeEditor();
  showToast("Actual sales cleared", "success", 2000);
}

// ─── JSON Backup Restore ───────────────────────────────────────
async function exportBackup() {
  const data = JSON.stringify(
    {
      ingredients: state.ingredients,
      recipes: state.recipes,
      suppliers: state.suppliers,
      sites: state.sites,
      activeSiteId: state.activeSiteId,
      activeGP: state.activeGP,
      foodCostTarget: state.foodCostTarget,
      recipeCategories: state.recipeCategories,
      ingCategories: state.ingCategories,
      darkMode: state.darkMode,
      currency: state.currency,
      vatRate: state.vatRate,
      locations: state.locations,
      activeLocationId: state.activeLocationId,
    },
    null,
    2,
  );
  const fileName =
    "recipe-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  if (false) {
    // Electron path not available in browser
  } else {
    // Browser fallback
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("✓ Backup downloaded", "success", 2000);
  }
}

function openRestoreModal() {
  document.getElementById("restore-modal").classList.remove("hidden");
  document.getElementById("restore-status").innerHTML = "";
  document.getElementById("restore-file-input").value = "";
  document.getElementById("restore-preview").classList.add("hidden");
  document.getElementById("restore-confirm-btn").classList.add("hidden");
}

function handleRestoreFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const recipes = (data.recipes || []).length;
      const ingredients = (data.ingredients || []).length;
      const suppliers = (data.suppliers || []).length;
      if (!recipes && !ingredients) {
        document.getElementById("restore-status").innerHTML =
          '<div class="restore-error">File doesn\'t look like a valid backup — no recipes or ingredients found.</div>';
        return;
      }
      document.getElementById("restore-preview").classList.remove("hidden");
      document.getElementById("restore-preview").innerHTML =
        `<div class="restore-preview-box">
          <div class="restore-stat"><span>${recipes}</span> recipes</div>
          <div class="restore-stat"><span>${ingredients}</span> ingredients</div>
          <div class="restore-stat"><span>${suppliers}</span> suppliers</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:8px;grid-column:1/-1">
            ⚠ This will replace all current data. Your current data will be saved as a backup first.
          </div>
        </div>`;
      document.getElementById("restore-confirm-btn").classList.remove("hidden");
      document.getElementById("restore-confirm-btn").dataset.json =
        e.target.result;
    } catch (err) {
      document.getElementById("restore-status").innerHTML =
        '<div class="restore-error">Could not read file — make sure it\'s a valid JSON backup.</div>';
    }
  };
  reader.readAsText(file);
}

async function confirmRestore() {
  const btn = document.getElementById("restore-confirm-btn");
  const json = btn.dataset.json;
  if (!json) return;
  // Save current data as emergency backup first
  await save();
  try {
    const data = JSON.parse(json);
    // Merge in all known fields, migrate missing ones
    state = { ...state, ...data };
    // Run migrations on restored data
    state.ingredients.forEach((i) => {
      if (!i.allergens) i.allergens = [];
      if (!i.nutrition) i.nutrition = {};
      if (!i.supplierId) i.supplierId = null;
      if (!i.priceHistory) i.priceHistory = [];
      if (i.seasonal === undefined) i.seasonal = false;
    });
    state.recipes.forEach((r) => {
      if (!r.versions) r.versions = [];
      if (!r.photo) r.photo = null;
      if (!r.priceOverride) r.priceOverride = null;
      if (!r.tags) r.tags = [];
      if (r.locked === undefined) r.locked = false;
      if (!r.yieldQty) r.yieldQty = null;
      if (!r.yieldUnit) r.yieldUnit = "";
      if (!r.competitors) r.competitors = [];
      if (r.popularity === undefined) r.popularity = 50;
    });
    if (!state.suppliers) state.suppliers = [];
    if (!state.sites) state.sites = [];
    if (!state.recipeCategories || !state.recipeCategories.length)
      state.recipeCategories = [...RECIPE_CATS_DEFAULT];
    if (!state.ingCategories || !state.ingCategories.length)
      state.ingCategories = [...ING_CATS_DEFAULT];

    await save();
    document.getElementById("restore-modal").classList.add("hidden");
    applyDarkMode(state.darkMode || false);
    renderSiteSelector();
    render();
    if (state.recipes.length > 0) selectRecipe(state.recipes[0].id);
    showToast(
      `✓ Restored ${state.recipes.length} recipes & ${state.ingredients.length} ingredients`,
      "success",
      4000,
    );
  } catch (err) {
    showToast("Restore failed: " + err.message, "error", 5000);
  }
}

// ─── Global Recipe Search ──────────────────────────────────────
let searchOpen = false;

function openSearch() {
  searchOpen = true;
  document.getElementById("search-overlay").classList.remove("hidden");
  document.getElementById("global-search-input").value = "";
  document.getElementById("search-results").innerHTML = "";
  document.getElementById("global-search-input").focus();
}

function closeSearch() {
  searchOpen = false;
  document.getElementById("search-overlay").classList.add("hidden");
}

function runGlobalSearch() {
  const q = document
    .getElementById("global-search-input")
    .value.toLowerCase()
    .trim();
  const results = document.getElementById("search-results");
  if (!q) {
    results.innerHTML = "";
    return;
  }

  const matches = [];

  state.recipes.forEach((r) => {
    const hits = [];
    // Name
    if (r.name.toLowerCase().includes(q))
      hits.push({ field: "name", text: r.name });
    // Category
    if (r.category.toLowerCase().includes(q))
      hits.push({ field: "category", text: r.category });
    // Tags
    (r.tags || []).forEach((t) => {
      if (t.toLowerCase().includes(q)) hits.push({ field: "tag", text: t });
    });
    // Notes
    if ((r.notes || "").toLowerCase().includes(q)) {
      const idx = r.notes.toLowerCase().indexOf(q);
      const snippet = r.notes.substring(Math.max(0, idx - 20), idx + 60).trim();
      hits.push({ field: "notes", text: "…" + snippet + "…" });
    }
    // Ingredients used
    r.ingredients.forEach((ri) => {
      const ing = state.ingredients.find((i) => i.id === ri.ingId);
      if (ing && ing.name.toLowerCase().includes(q))
        hits.push({ field: "ingredient", text: ing.name });
    });
    if (hits.length) matches.push({ r, hits });
  });

  // Also search ingredients library directly
  const ingMatches = state.ingredients
    .filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q),
    )
    .slice(0, 5);

  if (!matches.length && !ingMatches.length) {
    results.innerHTML =
      '<div style="color:var(--text-muted);padding:24px;text-align:center;font-size:13px">No results for "' +
      escHtml(q) +
      '"</div>';
    return;
  }

  let html = "";
  if (matches.length) {
    html +=
      '<div class="search-section-title">Recipes (' +
      matches.length +
      ")</div>";
    html += matches
      .map(({ r, hits }) => {
        const cost = recipeTotalCost(r) / (r.portions || 1);
        const price = r.priceOverride || suggestPrice(cost, state.activeGP);
        const hitBadges = [...new Set(hits.map((h) => h.field))]
          .map((f) => `<span class="search-hit-badge">${f}</span>`)
          .join("");
        const snippet = hits.find((h) => h.field !== "name")?.text || "";
        return `<div class="search-result-item" onclick="closeSearch();showView('recipes');selectRecipe('${r.id}')">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:700;font-size:14px">${escHtml(r.name)}</div>
          <div style="font-size:13px;color:var(--accent);font-weight:700">${fmt(price)}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;margin-top:4px;flex-wrap:wrap">
          <span class="cat-badge" style="font-size:10px">${escHtml(r.category)}</span>
          ${hitBadges}
          ${snippet ? `<span style="font-size:11px;color:var(--text-muted);font-style:italic">${escHtml(snippet.substring(0, 60))}</span>` : ""}
        </div>
      </div>`;
      })
      .join("");
  }

  if (ingMatches.length) {
    html +=
      '<div class="search-section-title" style="margin-top:12px">Ingredients (' +
      ingMatches.length +
      ")</div>";
    html += ingMatches
      .map(
        (i) =>
          `<div class="search-result-item" onclick="closeSearch();showView('ingredients');setTimeout(()=>{const s=document.getElementById('ing-search');if(s){s.value='${escHtml(i.name)}';renderIngredientLibrary();}},100)">
        <div style="font-weight:600">${escHtml(i.name)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${escHtml(i.category)} · ${fmt(costPerUnit(i))} / ${i.unit}</div>
      </div>`,
      )
      .join("");
  }

  results.innerHTML = html;
}

// ─── Keyboard Shortcuts Help ───────────────────────────────────
function openShortcutsHelp() {
  document.getElementById("shortcuts-modal").classList.remove("hidden");
}

// ─── Start ─────────────────────────────────────────────────────

// ─── Sidebar Resize ───────────────────────────────────────────────────────────
(function () {
  const STORAGE_KEY = "rc-sidebar-width";
  const sidebar = document.getElementById("sidebar");
  const handle = document.getElementById("sidebar-resize-handle");
  if (!sidebar || !handle) return;

  // Restore saved width
  const saved = parseInt(localStorage.getItem(STORAGE_KEY));
  if (saved && saved >= 180 && saved <= 420) {
    sidebar.style.width = saved + "px";
  }

  let startX = 0,
    startW = 0,
    dragging = false;

  handle.addEventListener("mousedown", function (e) {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    handle.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    const delta = e.clientX - startX;
    const newW = Math.min(420, Math.max(180, startW + delta));
    sidebar.style.width = newW + "px";
  });

  document.addEventListener("mouseup", function () {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    localStorage.setItem(STORAGE_KEY, sidebar.offsetWidth);
  });

  // Double-click handle to reset to default width
  handle.addEventListener("dblclick", function () {
    sidebar.style.width = "260px";
    localStorage.setItem(STORAGE_KEY, 260);
  });
})();

init();

// ═══════════════════════════════════════════════════════════════════════════
// TOOLS VIEW — Completion Tracker, AI Method Writer, Category Editor,
//              Kitchen Pricing & Ordering Sheet
// ═══════════════════════════════════════════════════════════════════════════

// ─── Render Tools view on showView ──────────────────────────────────────────
const _origShowView = showView;
showView = function (view) {
  _origShowView(view);
  if (view === "tools") renderToolsView();
};

function renderToolsView() {
  // Build live stats for cards
  const totalRecipes = state.recipes.length;
  const totalIngs = state.ingredients.length;
  const recipes = state.recipes;

  // GP stats
  const withGP = recipes.filter((r) => {
    const cpp = recipeTotalCost(r) / (r.portions || 1);
    const price = r.priceOverride || suggestPrice(cpp, state.activeGP);
    return price > 0;
  });
  const avgGP = withGP.length
    ? Math.round(
        withGP.reduce((s, r) => {
          const cpp = recipeTotalCost(r) / (r.portions || 1);
          const price = r.priceOverride || suggestPrice(cpp, state.activeGP);
          return s + ((price - cpp) / price) * 100;
        }, 0) / withGP.length,
      )
    : 0;
  const onTarget = recipes.filter((r) => {
    const cpp = recipeTotalCost(r) / (r.portions || 1);
    const price = r.priceOverride || suggestPrice(cpp, state.activeGP);
    return price > 0 && ((price - cpp) / price) * 100 >= (state.activeGP || 75);
  }).length;

  // Allergen stats
  const withAllergens = state.ingredients.filter(
    (i) => (i.allergens || []).length > 0,
  ).length;
  const recipesWithAllergens = recipes.filter((r) =>
    r.ingredients.some((ri) => {
      const ing = state.ingredients.find((i) => i.id === ri.ingId);
      return ing && (ing.allergens || []).length > 0;
    }),
  ).length;

  // Completion stats
  const noPrice = recipes.filter((r) => !(r.priceOverride > 0)).length;
  const noMethod = recipes.filter(
    (r) => !(r.methods || r.method || []).length,
  ).length;

  // Duplicate scan quick count
  const nameMap = {};
  state.ingredients.forEach((i) => {
    const key = i.name.toLowerCase().trim();
    nameMap[key] = (nameMap[key] || 0) + 1;
  });
  const dupeCount = Object.values(nameMap).filter((v) => v > 1).length;

  // Uncategorised ingredients
  const uncatCount = state.ingredients.filter(
    (i) => !i.category || i.category === "Other",
  ).length;

  // Supplier savings stats
  const _supSavings = (() => {
    let cheaperCount = 0;
    state.ingredients.forEach((i) => {
      if (!(i.altSuppliers || []).length || !i.packCost || !i.packSize) return;
      const yld = (i.yieldPct || 100) / 100;
      const primaryCpu = i.packCost / i.packSize / yld;
      for (const alt of i.altSuppliers) {
        if (!alt.packCost || !alt.packSize) continue;
        const altCpu = alt.packCost / alt.packSize / yld;
        if (altCpu < primaryCpu * 0.97) { cheaperCount++; break; }
      }
    });
    return cheaperCount;
  })();

  function toolCard(icon, title, desc, stat, statLabel, statColor, onclick) {
    const statHtml =
      stat !== null
        ? '<div style="display:flex;align-items:baseline;gap:6px;margin-top:auto;padding-top:12px;border-top:1px solid var(--border)">' +
          '<span style="font-size:20px;font-weight:800;color:' +
          (statColor || "var(--accent)") +
          '">' +
          stat +
          "</span>" +
          '<span style="font-size:11px;color:var(--text-muted)">' +
          statLabel +
          "</span>" +
          "</div>"
        : "";
    return (
      '<div class="card" onclick="' +
      onclick +
      '" ' +
      'style="padding:18px 20px;cursor:pointer;border:1px solid var(--border);transition:all .15s;display:flex;flex-direction:column;gap:10px;min-height:130px" ' +
      "onmouseenter=\"this.classList.add('tool-card-hover')\" " +
      "onmouseleave=\"this.classList.remove('tool-card-hover')\">" +
      '<div style="display:flex;align-items:center;gap:10px">' +
      '<div style="font-size:22px;flex-shrink:0">' +
      icon +
      "</div>" +
      '<div style="font-size:13px;font-weight:700;color:var(--text-primary)">' +
      title +
      "</div>" +
      "</div>" +
      '<div style="font-size:11px;color:var(--text-muted);line-height:1.6;flex:1">' +
      desc +
      "</div>" +
      statHtml +
      "</div>"
    );
  }

  const analysisGrid = document.getElementById("tools-analysis-grid");
  if (analysisGrid) {
    const gpColor =
      avgGP >= (state.activeGP || 75)
        ? "var(--green)"
        : avgGP >= 60
          ? "var(--accent)"
          : "var(--red)";
    analysisGrid.innerHTML =
      toolCard(
        "🎯",
        "Menu Engineering Matrix",
        "Plot every recipe by GP% and popularity — Stars, Puzzles, Plow Horses and Dogs",
        totalRecipes + " recipes",
        "plotted",
        "var(--accent)",
        "openMenuMatrix()",
      ) +
      toolCard(
        "🌡",
        "Margin Heatmap",
        "Colour-coded grid of every recipe by GP% — instantly spot what is performing",
        avgGP + "%",
        "avg GP across all recipes",
        gpColor,
        "openMarginHeatmap()",
      ) +
      toolCard(
        "⚠️",
        "Allergen Report",
        "Full cross-reference of all 14 allergens across every recipe — printable for compliance",
        recipesWithAllergens,
        "of " + totalRecipes + " recipes have allergens flagged",
        "var(--accent)",
        "openAllergenReport()",
      ) +
      toolCard(
        "🧮",
        "Reverse Cost Calculator",
        "Set a sell price and GP target — see the maximum food cost you can spend per portion",
        null,
        "",
        "",
        "openReverseCostCalc()",
      ) +
      toolCard(
        "🍽",
        "Menu Print",
        "Filter recipes by dietary profile (GF, NF, DF, EF, SF) and print a formatted menu card with prices",
        totalRecipes,
        "recipe" + (totalRecipes !== 1 ? "s" : "") + " available to print",
        "var(--accent)",
        "openMenuPrint()",
      ) +
      toolCard(
        "🥗",
        "Nutrition Scanner",
        "Populate kcal, protein, fat, carbs, fibre & salt for your ingredients — choose USDA database or AI",
        (() => {
          const withData = state.ingredients.filter(i => i.nutrition).length;
          return withData + " / " + state.ingredients.length;
        })(),
        "ingredients have nutrition data",
        state.ingredients.filter(i => i.nutrition).length === state.ingredients.length && state.ingredients.length > 0
          ? "var(--green)" : "var(--accent)",
        "openNutritionScanner()",
      ) +
      toolCard(
        "🏷",
        "Supplier Price Compare",
        "See every ingredient where a cheaper alternative supplier exists — switch in one click to save money",
        _supSavings > 0 ? _supSavings : "✓",
        _supSavings > 0
          ? "ingredient" + (_supSavings !== 1 ? "s" : "") + " with cheaper alt"
          : "All on best price",
        _supSavings > 0 ? "var(--accent)" : "var(--green)",
        "openSupplierSavingsPanel()",
      ) +
      toolCard(
        "📱",
        "Allergen QR Cards",
        "Generate printable QR code cards for each recipe — customers scan to see allergens, dietary info & nutrition",
        totalRecipes,
        "recipe" + (totalRecipes !== 1 ? "s" : "") + " ready",
        "var(--accent)",
        "printBatchAllergenQR()",
      );
  }

  const dataGrid = document.getElementById("tools-data-grid");
  if (dataGrid) {
    const dupeColor = dupeCount > 0 ? "var(--red)" : "var(--green)";
    const uncatColor = uncatCount > 5 ? "var(--accent)" : "var(--green)";
    const noPriceColor = noPrice > 0 ? "var(--accent)" : "var(--green)";
    dataGrid.innerHTML =
      toolCard(
        "🔍",
        "Duplicate Scanner",
        "Find and merge duplicate ingredients that may be inflating or splitting your cost data",
        dupeCount > 0 ? dupeCount : "✓",
        dupeCount > 0
          ? "possible duplicate" + (dupeCount !== 1 ? "s" : "") + " found"
          : "No duplicates found",
        dupeColor,
        "openDuplicateScanModal()",
      ) +
      toolCard(
        "✨",
        "AI Categorise",
        "Automatically categorise uncategorised ingredients using AI — saves bulk manual work",
        uncatCount,
        "ingredient" + (uncatCount !== 1 ? "s" : " ") + " uncategorised",
        uncatColor,
        "openAiCategoriseModal()",
      ) +
      toolCard(
        "💷",
        "Bulk Price Update",
        "Paste a list of ingredient names and prices to update many at once without opening each",
        noPrice,
        "recipe" + (noPrice !== 1 ? "s" : " ") + " without a sell price",
        noPriceColor,
        "openBulkPriceModal()",
      ) +
      toolCard(
        "📥",
        "Export to Excel",
        "Export all recipes with costing, GP% and allergens to a formatted Excel spreadsheet",
        totalRecipes,
        "recipe" + (totalRecipes !== 1 ? "s" : " ") + " ready to export",
        "var(--accent)",
        "exportAllRecipesExcel()",
      );
  }

  renderCompletionTracker();
  renderCategoryEditor();
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. AI METHOD WRITER
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// 1. RECIPE COMPLETION TRACKER
// ═══════════════════════════════════════════════════════════════════════════
var _trackerFilter = "all";
var _trackerSearch = "";

function renderCompletionTracker() {
  const container = document.getElementById("completion-tracker-content");
  if (!container) return;

  const sellable = state.recipes.filter((r) => !r.yieldQty);
  const stats = sellable.map((r) => {
    const hasPrice = !!(r.priceOverride && r.priceOverride > 0);
    const hasMethod = (r.methods || r.method || []).length > 0;
    const hasCost = r.ingredients.some((ri) => {
      const ing = state.ingredients.find((i) => i.id === ri.ingId);
      return ing && ing.packCost > 0 && ing.packSize > 0;
    });
    const hasAllergens = r.ingredients.some((ri) => {
      const ing = state.ingredients.find((i) => i.id === ri.ingId);
      return ing && (ing.allergens || []).length > 0;
    });
    const score = [hasPrice, hasMethod, hasCost].filter(Boolean).length;
    return { r, hasPrice, hasMethod, hasCost, hasAllergens, score };
  });

  const total = stats.length;
  const noPrice = stats.filter((s) => !s.hasPrice).length;
  const noMethod = stats.filter((s) => !s.hasMethod).length;
  const noCost = stats.filter((s) => !s.hasCost).length;
  const complete = stats.filter((s) => s.score === 3).length;

  // Tab filter
  let filtered = stats;
  if (_trackerFilter === "no-price")
    filtered = stats.filter((s) => !s.hasPrice);
  if (_trackerFilter === "no-method")
    filtered = stats.filter((s) => !s.hasMethod);
  if (_trackerFilter === "no-cost") filtered = stats.filter((s) => !s.hasCost);
  if (_trackerFilter === "incomplete")
    filtered = stats.filter((s) => s.score < 3);

  // Search filter on top of tab filter
  const q = (_trackerSearch || "").toLowerCase().trim();
  if (q)
    filtered = filtered.filter(
      (s) =>
        s.r.name.toLowerCase().includes(q) ||
        (s.r.category || "").toLowerCase().includes(q),
    );

  const btn = (val, label, count, col) =>
    `<button onclick="setTrackerFilter('${val}')" style="padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;border:1px solid ${_trackerFilter === val ? col : "var(--border)"};background:${_trackerFilter === val ? col + "22" : "var(--bg-card)"};color:${_trackerFilter === val ? col : "var(--text-secondary)"}">` +
    `${label} <span style="opacity:.7">${count}</span></button>`;

  const curSearch = escHtml(_trackerSearch || "");

  container.innerHTML =
    `<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">` +
    `<input type="text" id="tracker-search" value="${curSearch}" placeholder="Search by recipe name or category…"` +
    ` oninput="setTrackerSearch(this.value)"` +
    ` style="flex:1;min-width:180px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:13px;padding:6px 12px;border-radius:6px;outline:none" />` +
    (curSearch
      ? `<button onclick="setTrackerSearch('')" style="font-size:11px;padding:5px 10px;border-radius:6px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-muted);cursor:pointer">✕ Clear</button>`
      : "") +
    `</div>` +
    `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">` +
    btn("all", "All", total, "var(--accent)") +
    btn("incomplete", "Incomplete", total - complete, "var(--red)") +
    btn("no-price", "No Price", noPrice, "var(--accent)") +
    btn("no-method", "No Method", noMethod, "#a78bfa") +
    btn("no-cost", "Cost Issues", noCost, "var(--red)") +
    `</div>` +
    `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;overflow:hidden">` +
    `<table style="width:100%;border-collapse:collapse;font-size:12px">` +
    `<thead><tr style="background:var(--bg-app)">` +
    `<th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--text-muted)">` +
    `Recipe${filtered.length < total ? ` <span style="font-weight:400;color:var(--accent);text-transform:none">(${filtered.length} shown)</span>` : ""}</th>` +
    `<th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--text-muted)">Cost</th>` +
    `<th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--text-muted)">Price</th>` +
    `<th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--text-muted)">Method</th>` +
    `<th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--text-muted)">Allergens</th>` +
    `<th style="padding:8px 14px;text-align:right;font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--text-muted)">Action</th>` +
    `</tr></thead><tbody>` +
    filtered
      .map((s) => {
        const tick = (ok) =>
          ok
            ? `<span style="color:var(--green);font-size:14px">✓</span>`
            : `<span style="color:var(--red);font-size:14px">✗</span>`;
        const pct = Math.round((s.score / 3) * 100);
        const barCol =
          pct === 100
            ? "var(--green)"
            : pct >= 66
              ? "var(--accent)"
              : "var(--red)";
        return (
          `<tr style="border-top:1px solid var(--border)" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">` +
          `<td style="padding:9px 14px">` +
          `<div style="font-weight:600;color:var(--text-primary)">${escHtml(s.r.name)}</div>` +
          `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;display:flex;align-items:center;gap:6px">` +
          `${escHtml(s.r.category || "—")}` +
          `<div style="flex:1;max-width:60px;height:3px;background:var(--border);border-radius:2px">` +
          `<div style="width:${pct}%;height:100%;background:${barCol};border-radius:2px"></div>` +
          `</div>` +
          `<span style="color:${barCol}">${pct}%</span>` +
          `</div>` +
          `</td>` +
          `<td style="padding:9px 10px;text-align:center">${tick(s.hasCost)}</td>` +
          `<td style="padding:9px 10px;text-align:center">${tick(s.hasPrice)}</td>` +
          `<td style="padding:9px 10px;text-align:center">` +
          (s.hasMethod
            ? tick(true)
            : `<button onclick="openAIMethodWriter('${s.r.id}')" style="font-size:10px;padding:2px 7px;border-radius:4px;background:rgba(167,139,250,0.15);color:#a78bfa;border:1px solid rgba(167,139,250,0.4);cursor:pointer;white-space:nowrap">✨ Generate</button>`) +
          `</td>` +
          `<td style="padding:9px 10px;text-align:center">${s.hasAllergens ? tick(true) : '<span style="font-size:10px;color:var(--text-muted)">—</span>'}</td>` +
          `<td style="padding:9px 14px;text-align:right">` +
          `<button onclick="selectRecipe('${s.r.id}');showView('recipes')" style="font-size:11px;padding:3px 10px;border-radius:5px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-secondary);cursor:pointer">Open →</button>` +
          `</td>` +
          `</tr>`
        );
      })
      .join("") +
    `</tbody></table>` +
    (filtered.length === 0
      ? `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">${q ? `No recipes matching "<strong>${escHtml(q)}</strong>"` : '<span style="color:var(--green);font-weight:600">✓ All recipes complete!</span>'}</div>`
      : "") +
    `</div>`;
}

function renderCategoryEditor() {
  const container = document.getElementById("cat-editor-content");
  if (!container) return;

  const sellable = state.recipes.filter((r) => !r.yieldQty);
  const cats = {};
  sellable.forEach((r) => {
    const c = r.category || "⚠ No Category";
    if (!cats[c]) cats[c] = [];
    cats[c].push(r);
  });

  const registeredCats = getRecipeCategories ? getRecipeCategories() : [];

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${Object.entries(cats)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(
          ([cat, recipes]) => `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;overflow:hidden">
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-app);border-bottom:1px solid var(--border)">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;flex-shrink:0">${recipes.length} recipes</div>
            <input type="text" value="${escHtml(cat)}"
              onchange="bulkRenameCategory('${escHtml(cat)}', this.value)"
              style="flex:1;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:13px;font-weight:700;padding:4px 10px;border-radius:5px;outline:none"
              title="Edit category name — press Enter to apply" />
            <select onchange="bulkMoveCategory('${escHtml(cat)}', this.value); this.value=''"
              style="background:var(--bg-input);border:1px solid var(--border);color:var(--text-muted);font-size:11px;padding:3px 6px;border-radius:4px;outline:none;max-width:130px">
              <option value="">Merge into…</option>
              ${Object.keys(cats)
                .filter((c) => c !== cat)
                .map(
                  (c) => `<option value="${escHtml(c)}">${escHtml(c)}</option>`,
                )
                .join("")}
            </select>
          </div>
          <div style="max-height:160px;overflow-y:auto">
            ${recipes
              .map(
                (r) => `
              <div style="display:flex;align-items:center;gap:8px;padding:7px 14px;border-bottom:1px solid var(--border)">
                <input type="text" value="${escHtml(r.name)}"
                  onchange="renameRecipe('${r.id}', this.value)"
                  style="flex:1;background:transparent;border:none;color:var(--text-primary);font-family:var(--font);font-size:12px;outline:none;border-bottom:1px solid transparent"
                  onfocus="this.style.borderBottomColor='var(--accent)'"
                  onblur="this.style.borderBottomColor='transparent'"
                  title="Click to rename recipe" />
                <button onclick="selectRecipe('${r.id}');showView('recipes')" style="font-size:10px;padding:2px 7px;border-radius:4px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-muted);cursor:pointer;white-space:nowrap;flex-shrink:0">Open →</button>
              </div>`,
              )
              .join("")}
          </div>
        </div>
      `,
        )
        .join("")}
    </div>`;
}

function bulkRenameCategory(oldName, newName) {
  newName = newName.trim();
  if (!newName || newName === oldName) return;
  state.recipes.forEach((r) => {
    if (r.category === oldName) r.category = newName;
  });
  save();
  renderCategoryEditor();
  renderSidebarRecipes();
  showToast(`Category renamed to "${newName}"`, "success", 2000);
}

function bulkMoveCategory(fromCat, toCat) {
  if (!toCat || toCat === fromCat) return;
  state.recipes.forEach((r) => {
    if (r.category === fromCat) r.category = toCat;
  });
  save();
  renderCategoryEditor();
  renderSidebarRecipes();
  showToast(`Merged "${fromCat}" → "${toCat}"`, "success", 2000);
}

function renameRecipe(recipeId, newName) {
  newName = newName.trim();
  if (!newName) return;
  const r = state.recipes.find((x) => x.id === recipeId);
  if (r) {
    r.name = newName;
    save();
    renderSidebarRecipes();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. KITCHEN PRICING & ORDERING SHEET
// ═══════════════════════════════════════════════════════════════════════════
function openKitchenSheet() {
  const modal = document.getElementById("kitchen-sheet-modal");
  // Populate category checkboxes
  const cats = [
    ...new Set(
      state.recipes
        .filter((r) => !r.yieldQty)
        .map((r) => r.category || "Other"),
    ),
  ];
  const registeredOrder = getRecipeCategories ? getRecipeCategories() : [];
  const ordered = [
    ...registeredOrder.filter((c) => cats.includes(c)),
    ...cats.filter((c) => !registeredOrder.includes(c)),
  ];
  document.getElementById("ks-cat-checks").innerHTML = ordered
    .map(
      (c) => `
    <label style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:8px;cursor:pointer">
      <input type="checkbox" class="ks-cat-check" value="${escHtml(c)}" checked /> ${escHtml(c)}
    </label>`,
    )
    .join("");
  modal.classList.remove("hidden");
}

function exportKitchenSheet(format) {
  const title =
    document.getElementById("ks-title").value || "Kitchen Price & Order Sheet";
  const selectedCats = new Set(
    [...document.querySelectorAll(".ks-cat-check:checked")].map(
      (cb) => cb.value,
    ),
  );
  const showPrices = document.getElementById("ks-show-prices").checked;
  const showCosts = document.getElementById("ks-show-costs").checked;
  const showIngs = document.getElementById("ks-show-ings").checked;
  const vatRate = state.vatRate || 0;
  const date = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  let recipes = state.recipes.filter(
    (r) => !r.yieldQty && selectedCats.has(r.category),
  );
  const registeredOrder = getRecipeCategories ? getRecipeCategories() : [];
  const allCats = [...new Set(recipes.map((r) => r.category || "Other"))];
  const catOrder = [
    ...registeredOrder.filter((c) => allCats.includes(c)),
    ...allCats.filter((c) => !registeredOrder.includes(c)),
  ];

  if (format === "pdf")
    exportKitchenSheetPDF(title, recipes, catOrder, {
      showPrices,
      showCosts,
      showIngs,
      vatRate,
      date,
    });
  else
    exportKitchenSheetExcel(title, recipes, catOrder, {
      showPrices,
      showCosts,
      showIngs,
      vatRate,
      date,
    });
  document.getElementById("kitchen-sheet-modal").classList.add("hidden");
}

function exportKitchenSheetPDF(title, recipes, catOrder, opts) {
  const { showPrices, showCosts, showIngs, vatRate, date } = opts;
  const cur = state.currency || "£";
  const gp = state.activeGP || 75;

  let sections = "";
  for (const cat of catOrder) {
    const recs = recipes.filter((r) => r.category === cat);
    if (!recs.length) continue;
    sections += `<div class="ks-section">
      <div class="ks-cat">${cat}</div>
      <table class="ks-table">
        <thead><tr>
          <th style="width:${showIngs ? "25%" : "40%"}">Dish</th>
          ${showPrices ? `<th>Sell Price</th>${vatRate ? "<th>Inc VAT</th>" : ""}` : ""}
          ${showCosts ? "<th>Food Cost</th><th>GP%</th>" : ""}
          ${showIngs ? "<th>Ingredients / Order</th>" : ""}
          <th style="width:60px">Qty Ordered</th>
          <th style="width:60px">Qty Used</th>
        </tr></thead>
        <tbody>
          ${recs
            .map((r) => {
              const cpp = recipeTotalCost(r) / (r.portions || 1);
              const price =
                r.priceOverride && r.priceOverride > 0
                  ? r.priceOverride
                  : suggestPrice(cpp, gp);
              const actualGP =
                price > 0 ? (((price - cpp) / price) * 100).toFixed(0) : 0;
              const ings = showIngs
                ? r.ingredients
                    .map((ri) => {
                      const ing = state.ingredients.find(
                        (i) => i.id === ri.ingId,
                      );
                      return ing
                        ? `${ri.qty}${ri.recipeUnit || ing.unit} ${ing.name}`
                        : "";
                    })
                    .filter(Boolean)
                    .join(" · ")
                : "";
              return `<tr>
              <td style="font-weight:600">${escHtml(r.name)}</td>
              ${showPrices ? `<td class="num">${cur}${price.toFixed(2)}</td>${vatRate ? `<td class="num">${cur}${(price * (1 + vatRate / 100)).toFixed(2)}</td>` : ""}` : ""}
              ${showCosts ? `<td class="num">${cur}${cpp.toFixed(2)}</td><td class="num">${actualGP}%</td>` : ""}
              ${showIngs ? `<td style="font-size:9px;color:#666">${escHtml(ings)}</td>` : ""}
              <td></td><td></td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
  }

  // Build ingredient ordering section
  const allIngs = {};
  recipes.forEach((r) => {
    r.ingredients.forEach((ri) => {
      const ing = state.ingredients.find((i) => i.id === ri.ingId);
      if (!ing) return;
      if (!allIngs[ing.id])
        allIngs[ing.id] = {
          name: ing.name,
          unit: ri.recipeUnit || ing.unit,
          cat: ing.category,
          supplier: "",
          qty: 0,
        };
      allIngs[ing.id].qty += ri.qty;
      const sup = state.suppliers?.find((s) => s.id === ing.supplierId);
      if (sup) allIngs[ing.id].supplier = sup.name;
    });
  });
  const ingRows = Object.values(allIngs).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const orderSection = `<div class="ks-section" style="page-break-before:always">
    <div class="ks-cat">Order Sheet — All Ingredients</div>
    <table class="ks-table">
      <thead><tr><th>Ingredient</th><th>Category</th><th>Supplier</th><th>Total Qty Needed</th><th>Order Qty</th><th>✓</th></tr></thead>
      <tbody>${ingRows.map((i) => `<tr><td>${escHtml(i.name)}</td><td style="color:#666;font-size:10px">${escHtml(i.cat || "")}</td><td style="color:#666;font-size:10px">${escHtml(i.supplier)}</td><td class="num">${i.qty}${i.unit}</td><td></td><td style="text-align:center">□</td></tr>`).join("")}</tbody>
    </table>
  </div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:20px 28px;max-width:1000px;margin:0 auto}
    h1{font-size:20px;font-weight:700;margin-bottom:4px}
    .sub{font-size:11px;color:#666;margin-bottom:20px}
    .ks-section{margin-bottom:24px;break-inside:avoid}
    .ks-cat{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#666;padding:5px 0;border-bottom:2px solid #111;margin-bottom:6px}
    .ks-table{width:100%;border-collapse:collapse}
    .ks-table th{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:4px 8px;text-align:left;border-bottom:1px solid #ccc;background:#f5f5f5}
    .ks-table td{padding:5px 8px;border-bottom:1px solid #eee;vertical-align:top}
    .ks-table tr:last-child td{border-bottom:1px solid #999}
    .num{text-align:right;font-variant-numeric:tabular-nums}
    @media print{@page{margin:12mm}}
  </style></head><body>
  <h1>${escHtml(title)}</h1>
  <div class="sub">${date}</div>
  ${sections}${orderSection}
  </body></html>`;

  browserIPC.exportPDF(html);
}

async function exportKitchenSheetExcel(title, recipes, catOrder, opts) {
  const { showPrices, showCosts, showIngs, vatRate, date } = opts;
  const gp = state.activeGP || 75;
  const cur = state.currency || "£";

  let wb = XLSX.utils.book_new();

  // Sheet 1: Price list
  const pRows = [[title], [`Generated: ${date}`], []];
  const pHead = ["Category", "Dish"];
  if (showPrices) {
    pHead.push("Sell Price");
    if (vatRate) pHead.push("Inc VAT");
  }
  if (showCosts) pHead.push("Food Cost", "GP %");
  pRows.push(pHead);

  for (const cat of catOrder) {
    const recs = recipes.filter((r) => r.category === cat);
    if (!recs.length) continue;
    recs.forEach((r) => {
      const cpp = recipeTotalCost(r) / (r.portions || 1);
      const price =
        r.priceOverride && r.priceOverride > 0
          ? r.priceOverride
          : suggestPrice(cpp, gp);
      const row = [cat, r.name];
      if (showPrices) {
        row.push(Math.round(price * 100) / 100);
        if (vatRate)
          row.push(Math.round(price * (1 + vatRate / 100) * 100) / 100);
      }
      if (showCosts)
        row.push(
          Math.round(cpp * 100) / 100,
          Math.round((price > 0 ? ((price - cpp) / price) * 100 : 0) * 10) / 10,
        );
      pRows.push(row);
    });
    pRows.push([]);
  }

  const ws1 = XLSX.utils.aoa_to_sheet(pRows);
  ws1["!cols"] = [
    { wch: 16 },
    { wch: 32 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 8 },
  ];
  wb = XLSX.utils.book_append_sheet(wb, ws1, "Price List");

  // Sheet 2: Order sheet
  const allIngs = {};
  recipes.forEach((r) => {
    r.ingredients.forEach((ri) => {
      const ing = state.ingredients.find((i) => i.id === ri.ingId);
      if (!ing) return;
      if (!allIngs[ing.id])
        allIngs[ing.id] = {
          name: ing.name,
          unit: ri.recipeUnit || ing.unit,
          cat: ing.category || "",
          supplier: "",
          qty: 0,
          packSize: ing.packSize,
          packCost: ing.packCost,
        };
      allIngs[ing.id].qty += ri.qty;
      const sup = state.suppliers?.find((s) => s.id === ing.supplierId);
      if (sup) allIngs[ing.id].supplier = sup.name;
    });
  });

  const oRows = [
    ["Order Sheet — " + title],
    [`Generated: ${date}`],
    [],
    [
      "Ingredient",
      "Category",
      "Supplier",
      "Total Qty Needed",
      "Unit",
      "Pack Size",
      "Order Qty",
      "Received",
      "✓",
    ],
  ];
  Object.values(allIngs)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((i) => {
      oRows.push([
        i.name,
        i.cat,
        i.supplier,
        i.qty,
        i.unit,
        i.packSize || "",
        "",
        "",
        "",
      ]);
    });

  const ws2 = XLSX.utils.aoa_to_sheet(oRows);
  ws2["!cols"] = [
    { wch: 28 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 8 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 5 },
  ];
  wb = XLSX.utils.book_append_sheet(wb, ws2, "Order Sheet");

  const buf = new Uint8Array(
    XLSX.write(wb, { bookType: "xlsx", type: "array" }),
  );
  await browserIPC.saveExcel(
    buf,
    title.replace(/[^a-zA-Z0-9 ]/g, "_") + ".xlsx",
  );
  showToast("✓ Kitchen sheet exported", "success", 2000);
}

function setTrackerFilter(val) {
  _trackerFilter = val;
  renderCompletionTracker();
}

function setTrackerSearch(val) {
  _trackerSearch = val;
  renderCompletionTracker();
  setTimeout(() => {
    const inp = document.getElementById("tracker-search");
    if (inp) {
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  }, 10);
}

// ═══════════════════════════════════════════════════════════════════════════
// AI METHOD WRITER
// ═══════════════════════════════════════════════════════════════════════════
function openAIMethodWriter(recipeId) {
  const recipe = state.recipes.find((r) => r.id === recipeId);
  if (!recipe) return;
  const modal = document.getElementById("ai-method-modal");
  modal.dataset.recipeId = recipeId;
  document.getElementById("ai-method-recipe-name").textContent = recipe.name;
  document.getElementById("ai-method-result").innerHTML = "";
  document.getElementById("ai-method-apply-btn").classList.add("hidden");
  document.getElementById("ai-method-status").innerHTML = "";
  modal.classList.remove("hidden");
}

async function generateAIMethod() {
  const modal = document.getElementById("ai-method-modal");
  const recipeId = modal.dataset.recipeId;
  const recipe = state.recipes.find((r) => r.id === recipeId);
  if (!recipe) return;

  const statusEl = document.getElementById("ai-method-status");
  const resultEl = document.getElementById("ai-method-result");
  const applyBtn = document.getElementById("ai-method-apply-btn");

  const ingList = recipe.ingredients
    .map((ri) => {
      const ing = state.ingredients.find((i) => i.id === ri.ingId);
      return ing ? ri.qty + (ri.recipeUnit || ing.unit) + " " + ing.name : null;
    })
    .filter(Boolean);

  const subRecipeDetails = (recipe.subRecipes || [])
    .map((sr) => {
      const subR = state.recipes.find((r) => r.id === sr.recipeId);
      if (!subR) return null;
      const subIngs = (subR.ingredients || [])
        .map((ri) => {
          const ing = state.ingredients.find((i) => i.id === ri.ingId);
          return ing
            ? ri.qty + (ri.recipeUnit || ing.unit) + " " + ing.name
            : null;
        })
        .filter(Boolean);
      const unitLabel = subR.yieldQty
        ? subR.yieldQty + " " + (subR.yieldUnit || "portions")
        : (subR.portions || 1) + " portion(s)";
      const subSteps = (subR.method || [])
        .map((s, i) => i + 1 + ". " + (s.text || s.step || ""))
        .filter(Boolean)
        .join("; ");
      return (
        '"' +
        subR.name +
        '" (' +
        sr.qty +
        " " +
        unitLabel +
        " used) — contains: " +
        subIngs.join(", ") +
        (subSteps ? ". Steps: " + subSteps : "")
      );
    })
    .filter(Boolean);

  const existingSteps = (recipe.methods || recipe.method || [])
    .map(
      (s, i) =>
        i + 1 + ". " + (typeof s === "string" ? s : s.text || s.step || ""),
    )
    .filter(Boolean);

  const nl = "\n";
  let prompt =
    "You are a professional chef writing a kitchen method for a restaurant recipe card." +
    nl +
    nl;
  prompt += "RECIPE: " + recipe.name + nl;
  prompt += "CATEGORY: " + (recipe.category || "") + nl;
  prompt +=
    "PORTIONS: " +
    (recipe.portions || 1) +
    (recipe.scale > 1 ? " (scaled x" + recipe.scale + ")" : "") +
    nl;
  if (recipe.prepTime || recipe.cookTime)
    prompt +=
      "TIMES: " +
      [
        recipe.prepTime ? recipe.prepTime + " min prep" : "",
        recipe.cookTime ? recipe.cookTime + " min cook" : "",
      ]
        .filter(Boolean)
        .join(", ") +
      nl;
  if (recipe.tags && recipe.tags.length)
    prompt += "TAGS: " + recipe.tags.join(", ") + nl;
  if (recipe.notes) prompt += "CHEF NOTES: " + recipe.notes + nl;
  prompt +=
    nl + "MAIN INGREDIENTS:" + nl + ingList.map((i) => "- " + i).join(nl) + nl;
  if (subRecipeDetails.length)
    prompt +=
      nl +
      "PRE-PREPARED COMPONENTS:" +
      nl +
      subRecipeDetails.map((s) => "- " + s).join(nl) +
      nl;
  if (existingSteps.length)
    prompt +=
      nl +
      "EXISTING METHOD (improve or replace):" +
      nl +
      existingSteps.join(nl) +
      nl;
  prompt += nl + "Write clear, professional kitchen method steps." + nl;
  prompt += "Return ONLY a JSON array, no markdown, no explanation:" + nl;
  prompt +=
    '[{"step": "step text here"}, {"step": "step text here"}]' + nl + nl;
  prompt +=
    "Rules: 4-8 steps, reference sub-recipes by name, include temperatures (C) and timings, professional kitchen language, no quantities in steps, end with plating instruction.";

  statusEl.innerHTML =
    '<span style="color:var(--accent)">✨ Generating method with AI\u2026</span>';
  resultEl.innerHTML = "";
  applyBtn.classList.add("hidden");

  try {
    const key = getActiveKey();
    const model = getActiveModel();
    if (!key) throw new Error("No AI key set — add it in Settings → AI Models");

    const rawText = await window.electronAPI.callAi(model, prompt, key, 1000);
    const steps = JSON.parse(rawText.replace(/```json|```/g, "").trim());

    if (!Array.isArray(steps) || !steps.length)
      throw new Error("No steps returned");
    window._aiGeneratedSteps = steps;
    statusEl.innerHTML =
      '<span style="color:var(--green)">✓ Generated ' +
      steps.length +
      " steps — review and apply</span>";
    resultEl.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">' +
      steps
        .map(
          (s, i) =>
            '<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px">' +
            '<span style="font-size:11px;font-weight:700;color:var(--accent);flex-shrink:0;margin-top:1px">' +
            (i + 1) +
            "</span>" +
            '<div contenteditable="true" oninput="window._aiGeneratedSteps[' +
            i +
            '].step=this.textContent" style="flex:1;font-size:13px;color:var(--text-primary);outline:none;line-height:1.5">' +
            escHtml(s.step) +
            "</div>" +
            "</div>",
        )
        .join("") +
      "</div>";
    applyBtn.classList.remove("hidden");
  } catch (e) {
    statusEl.innerHTML =
      '<span style="color:var(--red)">Error: ' + escHtml(e.message) + "</span>";
  }
}

function applyAIMethod() {
  const modal = document.getElementById("ai-method-modal");
  const recipeId = modal.dataset.recipeId;
  const recipe = state.recipes.find((r) => r.id === recipeId);
  if (!recipe || !window._aiGeneratedSteps) return;
  // Save as recipe.methods (array of strings) — the format the recipe editor uses
  recipe.methods = window._aiGeneratedSteps
    .map((s) => s.step || s.text || "")
    .filter(Boolean);
  save();
  modal.classList.add("hidden");
  showToast('✓ Method applied to "' + recipe.name + '"', "success", 2500);
  if (!document.getElementById("view-tools").classList.contains("hidden"))
    renderCompletionTracker();
  if (state.activeRecipeId === recipeId) renderRecipeEditor();
}

// ─── Order Sheet ──────────────────────────────────────────────────────────────
// Per-session order quantities keyed by ingredient id
const _orderQtys = {};

const _collapsedOrderSuppliers = new Set();
function renderOrderSheet() {
  const cur = state.currency || "£";
  const ingredients = state.ingredients || [];
  const suppliers   = state.suppliers   || [];

  // Populate supplier filter
  const supSel = document.getElementById("os-supplier-filter");
  if (supSel) {
    const prev = supSel.value;
    supSel.innerHTML =
      '<option value="">All suppliers</option>' +
      suppliers
        .map(
          (s) =>
            `<option value="${s.id}"${s.id === prev ? " selected" : ""}>${escHtml(s.name)}</option>`
        )
        .join("") +
      `<option value="__none__"${prev === "__none__" ? " selected" : ""}>— No supplier assigned —</option>`;
  }

  // Populate category filter
  const catSel = document.getElementById("os-cat-filter");
  if (catSel) {
    const prevCat = catSel.value;
    const cats = [
      ...new Set(ingredients.map((i) => i.category).filter(Boolean)),
    ].sort();
    catSel.innerHTML =
      '<option value="">All categories</option>' +
      cats
        .map(
          (c) =>
            `<option value="${escHtml(c)}"${c === prevCat ? " selected" : ""}>${escHtml(c)}</option>`
        )
        .join("");
  }

  // Set date default to today if blank
  const dateEl = document.getElementById("os-date");
  if (dateEl && !dateEl.value) {
    dateEl.value = new Date().toISOString().slice(0, 10);
  }

  const supFilter = document.getElementById("os-supplier-filter")?.value || "";
  const catFilter = document.getElementById("os-cat-filter")?.value || "";
  const searchVal = (document.getElementById("os-search")?.value || "")
    .toLowerCase()
    .trim();

  // Filter ingredients
  let ings = ingredients.filter((ing) => {
    if (catFilter && ing.category !== catFilter) return false;
    if (searchVal && !ing.name.toLowerCase().includes(searchVal)) return false;
    if (supFilter === "__none__") return !ing.supplierId;
    if (supFilter) return ing.supplierId === supFilter;
    return true;
  });

  // Group by supplier
  const grouped = {};
  const noSup = "__none__";
  ings.forEach((ing) => {
    const key = ing.supplierId || noSup;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(ing);
  });

  // Supplier order: alphabetical matched suppliers, then no-supplier
  const supOrder = suppliers
    .filter((s) => grouped[s.id])
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => s.id);
  if (grouped[noSup]) supOrder.push(noSup);

  const container = document.getElementById("order-sheet-content");
  if (!container) return;

  if (!supOrder.length) {
    container.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
      <div style="font-size:40px;margin-bottom:12px">📦</div>
      <div style="font-size:15px;font-weight:600;margin-bottom:6px">No ingredients found</div>
      <div style="font-size:13px">Add ingredients in the Ingredient Library to build your order sheet.</div>
    </div>`;
    return;
  }

  let grandTotal = 0;
  supOrder.forEach((supId) => {
    (grouped[supId] || []).forEach((ing) => {
      grandTotal += (_orderQtys[ing.id] || 0) * (ing.packCost || 0);
    });
  });

  let html = "";
  supOrder.forEach((supId) => {
    const sup = suppliers.find((s) => s.id === supId);
    const supName = sup ? sup.name : "— No Supplier —";
    const supIngs = grouped[supId] || [];
    let supTotal = 0;
    supIngs.forEach((ing) => {
      supTotal += (_orderQtys[ing.id] || 0) * (ing.packCost || 0);
    });

    const osCollapsed = _collapsedOrderSuppliers.has(supId);
    html += `<div class="card" style="margin-bottom:20px;overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-sidebar);border-bottom:1px solid var(--border);cursor:pointer;user-select:none" onclick="toggleOrderSupplier('${supId}')">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:16px">🚚</span>
          <span style="font-weight:700;font-size:14px;color:var(--text-primary)">${escHtml(supName)}</span>
          ${sup?.phone ? `<span style="font-size:11px;color:var(--text-muted)">${escHtml(sup.phone)}</span>` : ""}
          ${sup?.email ? `<span style="font-size:11px;color:var(--text-muted)">${escHtml(sup.email)}</span>` : ""}
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div style="font-size:13px;font-weight:700;color:var(--accent)" id="sup-total-${supId}">${cur}${supTotal.toFixed(2)}</div>
          <span id="os-chev-${supId}" style="color:var(--text-muted);font-size:11px">${osCollapsed ? "&#9654;" : "&#9660;"}</span>
        </div>
      </div>
      <div id="os-body-${supId}"${osCollapsed ? ' style="display:none"' : ""}>
      <table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed">
        <colgroup>
          <col style="width:24%">
          <col style="width:12%">
          <col style="width:11%">
          <col style="width:11%">
          <col style="width:10%">
          <col style="width:13%">
          <col style="width:19%">
        </colgroup>
        <thead>
          <tr style="background:var(--bg-app)">
            <th style="text-align:left;padding:8px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);border-bottom:1px solid var(--border)">Ingredient</th>
            <th style="text-align:left;padding:8px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);border-bottom:1px solid var(--border)">Category</th>
            <th style="text-align:right;padding:8px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);border-bottom:1px solid var(--border)">Pack Size</th>
            <th style="text-align:right;padding:8px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);border-bottom:1px solid var(--border)">Pack Cost</th>
            <th style="text-align:center;padding:8px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);border-bottom:1px solid var(--border)">Order Qty</th>
            <th style="text-align:right;padding:8px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);border-bottom:1px solid var(--border)">Line Total</th>
            <th style="text-align:left;padding:8px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);border-bottom:1px solid var(--border)">Notes</th>
          </tr>
        </thead>
        <tbody>`;

    supIngs.forEach((ing, idx) => {
      const qty = _orderQtys[ing.id] || 0;
      const lineTotal = qty * (ing.packCost || 0);
      const rowBg = idx % 2 === 0 ? "" : "background:var(--bg-app)";
      html += `<tr style="${rowBg}">
        <td style="padding:9px 16px;color:var(--text-primary);font-weight:500">${escHtml(ing.name)}</td>
        <td style="padding:9px 10px">${ing.category ? `<span class="cat-badge" style="font-size:10px">${escHtml(ing.category)}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td style="padding:9px 10px;text-align:right;color:var(--text-secondary)">${ing.packSize ? ing.packSize + " " + escHtml(ing.unit || "") : "—"}</td>
        <td style="padding:9px 10px;text-align:right;color:var(--text-secondary)">${ing.packCost ? cur + ing.packCost.toFixed(2) : "—"}</td>
        <td style="padding:6px 10px;text-align:center">
          <input type="number" min="0" step="1" value="${qty}"
            data-ing-id="${ing.id}" data-sup-id="${supId}"
            onchange="updateOrderQty(this)"
            style="width:70px;text-align:center;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:13px;padding:4px 6px;border-radius:5px;outline:none">
        </td>
        <td style="padding:9px 16px;text-align:right;font-weight:600;color:${lineTotal > 0 ? "var(--accent)" : "var(--text-muted)"}" id="line-total-${ing.id}">${lineTotal > 0 ? cur + lineTotal.toFixed(2) : "—"}</td>
        <td style="padding:6px 10px">
          <input type="text" placeholder="e.g. call ahead" value="${escHtml(ing._orderNote || "")}"
            data-ing-id="${ing.id}"
            onchange="updateOrderNote(this)"
            style="width:100%;min-width:100px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:4px 8px;border-radius:5px;outline:none;box-sizing:border-box">
        </td>
      </tr>`;
    });

    html += `</tbody>
        <tfoot>
          <tr style="background:var(--bg-sidebar);border-top:2px solid var(--border)">
            <td colspan="5" style="padding:10px 16px;font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px">${escHtml(supName)} subtotal</td>
            <td style="padding:10px 16px;text-align:right;font-size:14px;font-weight:700;color:var(--accent)" id="sup-total-foot-${supId}">${cur}${supTotal.toFixed(2)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      </div>
    </div>`;
  });

  html += `<div style="display:flex;justify-content:flex-end;padding:16px 0">
    <div style="background:var(--bg-sidebar);border:1px solid var(--border);border-radius:var(--radius);padding:14px 24px;display:flex;align-items:center;gap:24px">
      <span style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)">Grand Total</span>
      <span style="font-size:22px;font-weight:800;color:var(--accent)" id="os-grand-total">${cur}${grandTotal.toFixed(2)}</span>
    </div>
  </div>`;

  container.innerHTML = html;
}

function toggleOrderSupplier(supId) {
  const body = document.getElementById("os-body-" + supId);
  const chev = document.getElementById("os-chev-" + supId);
  if (!body) return;
  const isOpen = body.style.display !== "none";
  body.style.display = isOpen ? "none" : "";
  if (isOpen) _collapsedOrderSuppliers.add(supId);
  else _collapsedOrderSuppliers.delete(supId);
  if (chev) chev.innerHTML = isOpen ? "&#9654;" : "&#9660;";
}

function updateOrderQty(input) {
  const ingId = input.dataset.ingId;
  const supId = input.dataset.supId;
  const qty   = Math.max(0, parseFloat(input.value) || 0);
  input.value = qty;
  _orderQtys[ingId] = qty;

  const ing = (state.ingredients || []).find((i) => i.id === ingId);
  const cur = state.currency || "£";
  const lineTotal = qty * (ing?.packCost || 0);
  const lineTotalEl = document.getElementById("line-total-" + ingId);
  if (lineTotalEl) {
    lineTotalEl.textContent = lineTotal > 0 ? cur + lineTotal.toFixed(2) : "—";
    lineTotalEl.style.color = lineTotal > 0 ? "var(--accent)" : "var(--text-muted)";
  }

  _recalcOrderTotals(cur, supId);
}

function _recalcOrderTotals(cur, supId) {
  const ingredients = state.ingredients || [];
  const suppliers   = state.suppliers   || [];

  const supIds = supId
    ? [supId]
    : [...new Set(ingredients.map((i) => i.supplierId || "__none__"))];

  supIds.forEach((sid) => {
    const supIngs = ingredients.filter((i) => (i.supplierId || "__none__") === sid);
    let supTotal = 0;
    supIngs.forEach((i) => { supTotal += (_orderQtys[i.id] || 0) * (i.packCost || 0); });
    const hdrEl  = document.getElementById("sup-total-" + sid);
    const footEl = document.getElementById("sup-total-foot-" + sid);
    if (hdrEl)  hdrEl.textContent  = cur + supTotal.toFixed(2);
    if (footEl) footEl.textContent = cur + supTotal.toFixed(2);
  });

  let grandTotal = 0;
  ingredients.forEach((i) => { grandTotal += (_orderQtys[i.id] || 0) * (i.packCost || 0); });
  const grandEl = document.getElementById("os-grand-total");
  if (grandEl) grandEl.textContent = cur + grandTotal.toFixed(2);
}

function updateOrderNote(input) {
  const ingId = input.dataset.ingId;
  const ing = (state.ingredients || []).find((i) => i.id === ingId);
  if (ing) ing._orderNote = input.value.trim();
}

function clearOrderQtys() {
  Object.keys(_orderQtys).forEach((k) => { _orderQtys[k] = 0; });
  (state.ingredients || []).forEach((i) => { delete i._orderNote; });
  renderOrderSheet();
}

async function exportOrderSheetExcel() {
  const cur         = state.currency || "£";
  const suppliers   = state.suppliers   || [];
  const ingredients = state.ingredients || [];
  const dateVal     = document.getElementById("os-date")?.value || new Date().toISOString().slice(0, 10);

  const grouped = {};
  ingredients.forEach((ing) => {
    const key = ing.supplierId || "__none__";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(ing);
  });

  const supOrder = suppliers
    .filter((s) => grouped[s.id])
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => s.id);
  if (grouped["__none__"]) supOrder.push("__none__");

  const rows = [["Order Sheet — " + dateVal], [""]];
  rows.push([
    "Supplier", "Ingredient", "Category",
    "Pack Size", "Unit",
    "Pack Cost (" + cur + ")", "Order Qty",
    "Line Total (" + cur + ")", "Notes",
  ]);

  let grandTotal = 0;
  supOrder.forEach((supId) => {
    const sup     = suppliers.find((s) => s.id === supId);
    const supIngs = grouped[supId] || [];
    let supTotal  = 0;
    supIngs.forEach((ing) => {
      const qty  = _orderQtys[ing.id] || 0;
      const line = qty * (ing.packCost || 0);
      supTotal += line;
      rows.push([
        sup ? sup.name : "— No Supplier —",
        ing.name,
        ing.category || "",
        ing.packSize || "",
        ing.unit || "",
        ing.packCost || 0,
        qty,
        line,
        ing._orderNote || "",
      ]);
    });
    grandTotal += supTotal;
    rows.push(["", "", "", "", "", "", (sup ? sup.name + " Subtotal" : "Subtotal"), supTotal, ""]);
    rows.push([""]);
  });

  rows.push(["", "", "", "", "", "", "GRAND TOTAL", grandTotal, ""]);

  // Build entirely in main process to avoid contextBridge buffer corruption
  await eAPI.buildAndSaveExcel([{ name: "Order Sheet", rows }], "order-sheet-" + dateVal + ".xlsx");
}

function printOrderSheet() {
  const dateVal   = document.getElementById("os-date")?.value || new Date().toISOString().slice(0, 10);
  const content   = document.getElementById("order-sheet-content");
  if (!content) return;
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Order Sheet</title>
  <style>
    body{font-family:system-ui,sans-serif;font-size:12px;color:#111;margin:20px}
    h1{font-size:18px;margin-bottom:4px}
    .date{color:#666;font-size:12px;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:11px}
    th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #333;padding:5px 8px;color:#555}
    td{padding:5px 8px;border-bottom:1px solid #ddd}
    input{border:1px solid #ccc;padding:2px 4px;font-size:11px;width:50px}
    @media print{input{border:none}body{margin:10mm}}
  </style></head><body>
  <h1>Order Sheet</h1>
  <div class="date">Date: ${dateVal}</div>
  ${content.innerHTML}
  </body></html>`;
  eAPI.exportPDF(html);
}
