// Sales Service using Express API
// Each sale document structure suggestion:
// { productId: string, date: 'YYYY-MM-DD', units: number, pricePerUnit: number }

const API_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

export async function recordSale({ productId, units, pricePerUnit, date }) {
  if (!productId || units == null) throw new Error('productId and units required');
  const saleDateObj = date ? new Date(date) : new Date();
  const saleDate = saleDateObj.toISOString().slice(0,10);
  const numericUnits = Number(units);
  const numericPrice = Number(pricePerUnit) || 0;
  try {
    const response = await fetch(`${API_URL}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, units: numericUnits, pricePerUnit: numericPrice, date: saleDate })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Failed to record sale');
    }
    const data = await response.json();
    // Expect data.success true and data.data contains created sale
    return data.data; // return created sale object
  } catch (e) {
    console.error('Error recording sale:', e);
    throw e;
  }
}

export async function fetchSalesForProduct(productId, { days = 30 } = {}) {
  const response = await fetch(`${API_URL}/api/sales/product/${productId}`);
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Failed to fetch sales');
  }
  const result = await response.json();
  const rows = result.data || [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days + 1);
  return rows
    .filter(r => new Date(r.date) >= cutoff)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Real-time subscription is not supported by the REST API. Provide a simple polling fallback.
export function subscribeSalesForProduct(productId, { days = 60, onData, onError } = {}) {
  let cancelled = false;
  const fetchAndNotify = async () => {
    try {
      const rows = await fetchSalesForProduct(productId, { days });
      if (!cancelled) onData && onData(rows);
    } catch (e) {
      if (!cancelled) onError && onError(e);
    }
  };
  // Initial fetch
  fetchAndNotify();
  // Poll every 30 seconds
  const intervalId = setInterval(fetchAndNotify, 30000);
  return () => { cancelled = true; clearInterval(intervalId); };
}

export function aggregateDaily(salesRows) {
  const map = new Map();
  salesRows.forEach(r => {
    const key = r.date;
    const current = map.get(key) || 0;
    map.set(key, current + Number(r.units || 0));
  });
  return Array.from(map.entries())
    .map(([date, units]) => ({ date, units }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export async function seedSalesForProduct(product, { days = 30, maxUnitsPerDay = 12 } = {}) {
  // This utility is no longer needed in production; keep as no-op to avoid Firestore writes.
  console.warn('seedSalesForProduct is disabled in production migration.');
  return { seeded: 0, skipped: true };
}

export async function fetchDailyAggregates({ days = 30 } = {}) {
  const response = await fetch(`${API_URL}/api/sales-daily`);
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Failed to fetch daily aggregates');
  }
  const result = await response.json();
  const rows = result.data || [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days + 1);
  return rows.filter(r => new Date(r.date) >= cutoff);
}

export async function fetchAllSales({ days = 30 } = {}) {
  const response = await fetch(`${API_URL}/api/sales`);
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Failed to fetch all sales');
  }
  const result = await response.json();
  const rows = result.data || [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days + 1);
  return rows.filter(r => new Date(r.date) >= cutoff);
}

export function subscribeAllSales({ days = 30, onData, onError } = {}) {
  let cancelled = false;
  const fetchAndNotify = async () => {
    try {
      const rows = await fetchAllSales({ days });
      if (!cancelled) onData && onData(rows);
    } catch (e) {
      if (!cancelled) onError && onError(e);
    }
  };
  fetchAndNotify();
  const intervalId = setInterval(fetchAndNotify, 30000);
  return () => { cancelled = true; clearInterval(intervalId); };
}

export function groupSalesByDateWithRevenue(sales, productsMap) {
  const map = new Map();
  sales.forEach(s => {
    const key = s.date;
    const prod = productsMap.get(s.productId);
    const unitPrice = s.pricePerUnit || (prod ? prod.sellingPrice || prod.price || 0 : 0);
    const existing = map.get(key) || { date: key, revenue: 0, units: 0 };
    existing.revenue += Number(unitPrice) * Number(s.units || 0);
    existing.units += Number(s.units || 0);
    map.set(key, existing);
  });
  return Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function rankTopProducts(sales, productsMap, topN = 5) {
  const totals = new Map();
  sales.forEach(s => {
    totals.set(s.productId, (totals.get(s.productId) || 0) + Number(s.units || 0));
  });
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([productId, units]) => ({ productId, units, name: productsMap.get(productId)?.name || productId }));
}














// ------------------------------------------------------------
// Electronics Inventory & Sales Seeding
// ------------------------------------------------------------
// Seeds a realistic electronics catalog plus 90 days of synthetic sales
// data so that analytics & AI forecast have enough history.
// Guarded by a localStorage flag on caller side to avoid duplicates.

const ELECTRONICS_DATA = [
  { name: 'Smartphone A14 Pro', sku: 'ELEC-SP-A14', cost: 52000, price: 64999, stockLevel: 120, brand: 'TechNova', subCategory: 'Smartphones' },
  { name: 'Smartphone X9 Lite', sku: 'ELEC-SP-X9L', cost: 18000, price: 22999, stockLevel: 200, brand: 'Futura', subCategory: 'Smartphones' },
  { name: '4K LED TV 55" Quantum', sku: 'ELEC-TV-55Q', cost: 38000, price: 52999, stockLevel: 60, brand: 'ViewMax', subCategory: 'Television' },
  { name: 'Noise Cancelling Headphones Z3', sku: 'ELEC-HP-Z3', cost: 4800, price: 7999, stockLevel: 300, brand: 'AudioSphere', subCategory: 'Audio' },
  { name: 'Bluetooth Speaker Pulse Mini', sku: 'ELEC-SPK-PM', cost: 1500, price: 2999, stockLevel: 250, brand: 'AudioSphere', subCategory: 'Audio' },
  { name: 'Gaming Laptop GTX 4060', sku: 'ELEC-LAP-G4060', cost: 78000, price: 99999, stockLevel: 35, brand: 'GearCore', subCategory: 'Computers' },
  { name: 'Ultrabook AirLite 14', sku: 'ELEC-LAP-AL14', cost: 52000, price: 69999, stockLevel: 70, brand: 'GearCore', subCategory: 'Computers' },
  { name: 'Smartwatch Fit Pulse 2', sku: 'ELEC-SW-FP2', cost: 3200, price: 5499, stockLevel: 180, brand: 'WristIQ', subCategory: 'Wearables' },
  { name: 'Tablet 11" MediaPlus', sku: 'ELEC-TAB-MP11', cost: 14000, price: 19999, stockLevel: 90, brand: 'Futura', subCategory: 'Tablets' },
  { name: 'Wireless Mouse ErgoWave', sku: 'ELEC-ACC-EWM', cost: 450, price: 999, stockLevel: 400, brand: 'PeriphX', subCategory: 'Accessories' },
  { name: 'Mechanical Keyboard K87 RGB', sku: 'ELEC-ACC-K87', cost: 2100, price: 4499, stockLevel: 150, brand: 'PeriphX', subCategory: 'Accessories' },
  { name: 'Wi-Fi 6 Router DualBand AX', sku: 'ELEC-NET-AX6', cost: 3100, price: 5999, stockLevel: 110, brand: 'NetSphere', subCategory: 'Networking' }
];

export async function seedElectronicsInventoryAndSales({ days = 90 } = {}) {
  // 1. Load existing inventory
  const invSnap = await getDocs(collection(db, COLLECTIONS.INVENTORY));
  const existing = [];
  invSnap.forEach(d => existing.push({ id: d.id, ...d.data() }));
  const existingElectronics = existing.filter(i => (i.category || i.productCategory) === 'Electronics');

  // If already seeded (≥6 electronics products) just seed missing sales history
  const createdIds = [];
  if (existingElectronics.length < 6) {
    for (const item of ELECTRONICS_DATA) {
      // Skip if SKU exists
      if (existing.some(e => e.sku === item.sku)) continue;
      const docRef = await addDoc(collection(db, COLLECTIONS.INVENTORY), {
        productName: item.name,
        name: item.name,
        sku: item.sku,
        stockLevel: item.stockLevel,
        expiryDate: '2030-12-31',
        brand: item.brand,
        category: 'Electronics',
        subCategory: item.subCategory,
        quantity: item.stockLevel,
        unitOfMeasure: 'units',
        description: `${item.brand} ${item.subCategory} - Premium quality ${item.name}`,
        price: item.cost,               // treat price as cost (legacy field)
        cost: item.cost,
        sellingPrice: item.price,
        status: item.stockLevel > 50 ? 'In Stock' : 'Low Stock',
        createdAt: Timestamp.now()
      });
      createdIds.push(docRef.id);
    }
  }

  // Reload after possible creation
  const finalSnap = await getDocs(collection(db, COLLECTIONS.INVENTORY));
  const finalList = [];
  finalSnap.forEach(d => finalList.push({ id: d.id, ...d.data() }));
  const electronicsFinal = finalList.filter(i => (i.category || i.productCategory) === 'Electronics');

  // 2. Ensure each electronics product has ≥30 days sales; if not seed using existing seeding util
  for (const product of electronicsFinal) {
    try {
      const hist = await fetchSalesForProduct(product.id, { days });
      if (hist.length < 30) {
        await seedSalesForProduct({ ...product, sellingPrice: product.sellingPrice || product.price }, { days, maxUnitsPerDay: 25 });
      }
    } catch (e) {
      console.warn('Electronics sales seed failed for', product.id, e);
    }
  }

  return { created: createdIds.length, electronicsCount: electronicsFinal.length };
}

// ------------------------------------------------------------
// Data Purge & Diversified Reseeding
// ------------------------------------------------------------
// Completely remove all sales & daily aggregate documents.
export async function purgeAllSalesData() {
  const collections = [COLLECTIONS.SALES, COLLECTIONS.SALES_DAILY];
  for (const collName of collections) {
    let snap = await getDocs(collection(db, collName));
    while (!snap.empty) {
      const batch = writeBatch(db);
      let count = 0;
      snap.forEach(d => {
        if (count < 450) { // Firestore batch safety margin
          batch.delete(doc(db, collName, d.id));
          count++;
        }
      });
      await batch.commit();
      snap = await getDocs(collection(db, collName));
    }
  }
  return { purged: true };
}

// Helper: consistent hash -> number for seeding randomness
function hashString(str='') {
  let h = 0;
  for (let i=0;i<str.length;i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return h >>> 0; // unsigned
}

// Simple seeded RNG (LCG)
function rngFactory(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xFFFFFFFF;
  };
}

// Create diversified sales history so each product yields different AI forecast characteristics.
// Patterns included: trend (up/down/flat), seasonality strength, random spikes, volatility.
export async function diversifySalesHistory({ days = 60, maxUnits = 40 } = {}) {
  const invSnap = await getDocs(collection(db, COLLECTIONS.INVENTORY));
  const products = [];
  invSnap.forEach(d => products.push({ id: d.id, ...d.data() }));
  const today = new Date();
  let totalWrites = 0;
  for (const p of products) {
    // Build deterministic rng per product so re-runs are stable but cross-product differs
    const seed = hashString(p.id + (p.sku || '')); 
    const rand = rngFactory(seed);
    // Determine product pattern
    const base = 2 + Math.floor(rand() * 6); // 2-7 base units
    const volatility = 0.3 + rand() * 0.9;   // noise multiplier
    const trendDir = rand() < 0.33 ? -1 : (rand() < 0.66 ? 0 : 1); // -1,0,1
    const trendStrength = trendDir === 0 ? 0 : (0.01 + rand() * 0.04); // daily % change
    const seasonalityStrength = 0.2 + rand() * 0.6; // weekend boost magnitude
    const spikeChance = 0.02 + rand() * 0.05; // chance of big spike per day
    const priceFactor = Math.max(0.4, Math.min(1.2, (p.sellingPrice || p.price || 1000) / 50000));
    // Iterate days
    let level = base;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const weekday = d.getDay();
      const weekendBoost = (weekday === 5 || weekday === 6) ? (1 + seasonalityStrength) : 1;
      // Apply trend
      if (trendDir !== 0 && i !== days - 1) {
        level = level * (1 + trendStrength * trendDir);
      }
      // Baseline units calculation
      let units = level * weekendBoost * priceFactor;
      // Random noise
      const noise = 1 - volatility/2 + rand() * volatility; // ~ (1 - v/2) to (1 + v/2)
      units *= noise;
      // Occasional spike
      if (rand() < spikeChance) {
        units *= (3 + rand() * 4); // 3x - 7x spike
      }
      units = Math.round(Math.min(maxUnits, Math.max(0, units)));
      if (units <= 0) continue;
      await recordSale({
        productId: p.id,
        units,
        pricePerUnit: Number(p.sellingPrice || p.price || 0),
        date: d.toISOString().slice(0,10)
      });
      totalWrites++;
    }
  }
  return { diversified: true, products: products.length, salesInserted: totalWrites };
}

// ------------------------------------------------------------
// Patterned AI Demo Items (each with distinct demand signature)
// ------------------------------------------------------------
// Creates a curated set of products that purposely exhibit different
// trends so AI recommendations differ clearly between them.
export async function addAIDemoItemsAndSales({ days = 70 } = {}) {
  const PATTERN_ITEMS = [
    { name: 'High Growth Gadget', sku: 'AI-HIGH-GROW', base: 3, category: 'Electronics', sellingPrice: 8999, pattern: 'growth' },
    { name: 'Declining Accessory', sku: 'AI-DECL-ACC', base: 10, category: 'Accessories', sellingPrice: 1299, pattern: 'decline' },
    { name: 'Weekend Boom Speaker', sku: 'AI-WKND-SPK', base: 6, category: 'Audio', sellingPrice: 4599, pattern: 'weekend' },
    { name: 'Spiky Gaming Mouse', sku: 'AI-SPIKE-MOU', base: 4, category: 'Gaming', sellingPrice: 2499, pattern: 'spiky' },
    { name: 'Stable Essential Cable', sku: 'AI-STABLE-CBL', base: 8, category: 'Accessories', sellingPrice: 399, pattern: 'stable' },
    { name: 'Seasonal Smartwatch', sku: 'AI-SEAS-WATCH', base: 5, category: 'Wearables', sellingPrice: 10999, pattern: 'seasonal' }
  ];

  // Load existing inventory to avoid duplicates
  const invSnap = await getDocs(collection(db, COLLECTIONS.INVENTORY));
  const existing = [];
  invSnap.forEach(d => existing.push({ id: d.id, ...d.data() }));

  // Map SKU -> id if already exists
  const skuMap = new Map();
  existing.forEach(p => skuMap.set(p.sku, p.id));

  const created = [];
  for (const item of PATTERN_ITEMS) {
    if (skuMap.has(item.sku)) continue; // already present
    const docRef = await addDoc(collection(db, COLLECTIONS.INVENTORY), {
      productName: item.name,
      name: item.name,
      sku: item.sku,
      stockLevel: 500,
      expiryDate: '2030-12-31',
      brand: 'AI Demo',
      category: 'Electronics',
      subCategory: item.category,
      quantity: 500,
      unitOfMeasure: 'units',
      description: `${item.pattern} demand pattern demo product`,
      price: Math.round(item.sellingPrice * 0.6),
      cost: Math.round(item.sellingPrice * 0.6),
      sellingPrice: item.sellingPrice,
      status: 'In Stock',
      patternType: item.pattern,
      createdAt: Timestamp.now()
    });
    skuMap.set(item.sku, docRef.id);
    created.push({ ...item, id: docRef.id });
  }

  // Refresh full list of created (existing + new) pattern items
  const allPattern = PATTERN_ITEMS.map(pi => ({ ...pi, id: skuMap.get(pi.sku) }));
  const today = new Date();
  let salesCount = 0;
  for (const p of allPattern) {
    // Skip if already has ≥30 days of sales to avoid overwriting
    const hist = await fetchSalesForProduct(p.id, { days });
    if (hist.length >= 30) continue;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const weekday = d.getDay();
      let unitsBase = p.base;
      switch (p.pattern) {
        case 'growth':
          unitsBase = p.base * (1 + ( (days - i) / days) * 2); // up to 3x by end
          break;
        case 'decline':
          unitsBase = p.base * (1 + ( i / days) * 2); // higher earlier -> declines
          break;
        case 'weekend':
          unitsBase = p.base * (weekday === 5 || weekday === 6 ? 4 : 0.6);
          break;
        case 'spiky':
          unitsBase = p.base * (Math.random() < 0.1 ? 10 : 0.8 + Math.random()*0.6);
          break;
        case 'stable':
          unitsBase = p.base * (0.9 + Math.random()*0.2);
          break;
        case 'seasonal':
          // weekly sinusoidal pattern
          const phase = ( (days - i) / 7 ) * Math.PI * 2;
            unitsBase = p.base * (1.2 + Math.sin(phase) * 0.8);
          break;
        default:
          unitsBase = p.base;
      }
      const units = Math.max(0, Math.round(unitsBase));
      if (!units) continue;
      await recordSale({
        productId: p.id,
        units,
        pricePerUnit: p.sellingPrice,
        date: d.toISOString().slice(0,10)
      });
      salesCount++;
    }
  }
  return { created: created.length, totalPatternItems: allPattern.length, salesInserted: salesCount };
}

// ------------------------------------------------------------
// Purge demo inventory items (electronics & AI demo pattern items)
// ------------------------------------------------------------
// Deletes items whose SKU prefixes match demo sets to clean environment.
export async function purgeDemoInventory() {
  const demoPrefixes = ['ELEC-', 'AI-HIGH-GROW', 'AI-DECL-ACC', 'AI-WKND-SPK', 'AI-SPIKE-MOU', 'AI-STABLE-CBL', 'AI-SEAS-WATCH'];
  const invSnap = await getDocs(collection(db, COLLECTIONS.INVENTORY));
  const targets = [];
  invSnap.forEach(d => {
    const sku = d.data().sku || '';
    if (demoPrefixes.some(p => sku.startsWith(p))) targets.push(d.id);
  });
  if (!targets.length) return { deleted: 0 };
  let deleted = 0;
  // Firestore batch deletion in chunks
  for (let i = 0; i < targets.length; i += 400) {
    const batch = writeBatch(db);
    targets.slice(i, i+400).forEach(id => batch.delete(doc(db, COLLECTIONS.INVENTORY, id)));
    await batch.commit();
    deleted += Math.min(400, targets.length - i);
  }
  return { deleted };
}

