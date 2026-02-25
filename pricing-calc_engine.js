/**
 * HTG Quote Calculator - Browser Pricing Engine
 * Plain JavaScript for use in static HTML pages
 * No build step required - just include in your HTML
 */

// Supabase client will be initialized from the HTML page
let supabase;

// Initialize Supabase (call this from your HTML after loading Supabase SDK)
function initSupabase(supabaseUrl, supabaseKey) {
  supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
}

// ============================================================================
// PRICE LOOKUP FUNCTIONS
// ============================================================================

async function lookupScreenPrintPrice(colors, quantity) {
  const { data, error } = await supabase
    .from('pricing_calc_screen_print_pricing')
    .select('price')
    .eq('colors', colors)
    .lte('quantity_min', quantity)
    .or(`quantity_max.gte.${quantity},quantity_max.is.null`)
    .single();

  if (error) {
    console.error('Screen print pricing lookup error:', error);
    throw new Error(`Could not find screen print pricing for ${colors} colors at ${quantity} quantity`);
  }

  return parseFloat(data.price);
}

async function lookupDTFPrice(sizeCategory, quantity) {
  const { data, error } = await supabase
    .from('pricing_calc_dtf_pricing')
    .select('price')
    .eq('size_category', sizeCategory)
    .lte('quantity_min', quantity)
    .or(`quantity_max.gte.${quantity},quantity_max.is.null`)
    .single();

  if (error) {
    console.error('DTF pricing lookup error:', error);
    throw new Error(`Could not find DTF pricing for size ${sizeCategory} at ${quantity} quantity`);
  }

  return parseFloat(data.price);
}

function getDTFSizeCategory(sqInches) {
  if (sqInches < 36) return 'sm';
  if (sqInches < 150) return 'md';
  if (sqInches < 285) return 'lg';
  throw new Error('DTF design exceeds maximum size of 285 sq inches (15" x 19")');
}

async function lookupEmbroideryPrice(stitchCount, quantity) {
  // Determine stitch count tier
  let stitchTier;
  if (stitchCount <= 5000) stitchTier = 5000;
  else if (stitchCount <= 6000) stitchTier = 6000;
  else if (stitchCount <= 7000) stitchTier = 7000;
  else if (stitchCount <= 8000) stitchTier = 8000;
  else if (stitchCount <= 9000) stitchTier = 9000;
  else if (stitchCount <= 10000) stitchTier = 10000;
  else {
    return await lookupEmbroideryPriceOver10K(stitchCount, quantity);
  }

  const { data, error } = await supabase
    .from('pricing_calc_embroidery_pricing')
    .select('price')
    .eq('stitch_count_max', stitchTier)
    .lte('quantity_min', quantity)
    .or(`quantity_max.gte.${quantity},quantity_max.is.null`)
    .single();

  if (error) {
    console.error('Embroidery pricing lookup error:', error);
    throw new Error(`Could not find embroidery pricing for ${stitchCount} stitches at ${quantity} quantity`);
  }

  return parseFloat(data.price);
}

async function lookupEmbroideryPriceOver10K(stitchCount, quantity) {
  const basePrice = await lookupEmbroideryPrice(10000, quantity);
  const additionalStitches = stitchCount - 10000;
  const additionalThousands = Math.ceil(additionalStitches / 1000);

  const { data, error } = await supabase
    .from('pricing_calc_embroidery_additional_pricing')
    .select('price_per_1k_stitches')
    .lte('quantity_min', quantity)
    .or(`quantity_max.gte.${quantity},quantity_max.is.null`)
    .single();

  if (error) {
    console.error('Additional embroidery pricing lookup error:', error);
    throw new Error('Could not find additional stitch pricing');
  }

  const additionalCost = additionalThousands * parseFloat(data.price_per_1k_stitches);
  return basePrice + additionalCost;
}

// ============================================================================
// SETUP FEE CALCULATIONS
// ============================================================================

function calculateScreenPrintSetup(numScreens, isReprint = false) {
  const pricePerScreen = isReprint ? 10.00 : 20.00;
  return numScreens * pricePerScreen;
}

function calculateDTFSetup() {
  return 10.00;
}

function calculateDigitizingFee(stitchCount, quantity) {
  if (quantity >= 144) return 0;
  const thousands = Math.max(5, Math.ceil(stitchCount / 1000));
  const fee = thousands * 5;
  return Math.min(75, fee);
}

// ============================================================================
// ADDITIONAL CHARGES
// ============================================================================

async function calculateAdditionalCharges(method, modifiers) {
  let total = 0;

  for (const [modifier, enabled] of Object.entries(modifiers)) {
    if (!enabled) continue;

    const { data, error } = await supabase
      .from('pricing_calc_additional_charges')
      .select('price, price_type')
      .eq('charge_type', modifier)
      .or(`decoration_method.eq.${method},decoration_method.is.null`)
      .eq('active', true)
      .maybeSingle();

    if (error) {
      console.error('Additional charges lookup error:', error);
      continue;
    }

    if (data && data.price_type === 'per_location_piece') {
      total += parseFloat(data.price);
    }
  }

  return total;
}

async function calculateMiscCharges(method, miscCharges) {
  let total = 0;

  if (miscCharges.pms_matching && miscCharges.pms_matching > 0) {
    total += 20.00 * miscCharges.pms_matching;
  }

  if (method === 'embroidery' && miscCharges.thread_color_changes > 0) {
    total += 10.00 * miscCharges.thread_color_changes;
  }

  return total;
}

async function calculatePersonalization(quantity) {
  const { data, error } = await supabase
    .from('pricing_calc_embroidery_personalization_pricing')
    .select('quantity, price')
    .lte('quantity', quantity)
    .order('quantity', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('Personalization pricing lookup error:', error);
    return quantity * 10.00;
  }

  return quantity * parseFloat(data.price);
}

// ============================================================================
// MAIN DECORATION CALCULATION
// ============================================================================

async function calculateDecoration(decoration) {
  const { method, quantity, specs, modifiers = {}, misc_charges = {} } = decoration;

  let basePrice = 0;
  let setupFees = 0;

  switch (method) {
    case 'screen_print':
      basePrice = await lookupScreenPrintPrice(specs.colors, quantity);
      setupFees = calculateScreenPrintSetup(specs.screens || specs.colors, specs.is_reprint);
      break;

    case 'dtf':
      const sizeCategory = getDTFSizeCategory(specs.size_sq_inches);
      basePrice = await lookupDTFPrice(sizeCategory, quantity);
      setupFees = calculateDTFSetup();
      break;

    case 'embroidery':
      basePrice = await lookupEmbroideryPrice(specs.stitch_count, quantity);
      setupFees = calculateDigitizingFee(specs.stitch_count, quantity);
      break;

    default:
      throw new Error(`Unknown decoration method: ${method}`);
  }

  const additionalCharges = await calculateAdditionalCharges(method, modifiers);
  const miscTotal = await calculateMiscCharges(method, misc_charges);

  let personalizationTotal = 0;
  if (method === 'embroidery' && specs.personalization?.enabled) {
    personalizationTotal = await calculatePersonalization(specs.personalization.quantity);
  }

  const totalPerPiece = basePrice + additionalCharges;
  const subtotal = (totalPerPiece * quantity) + setupFees + miscTotal + personalizationTotal;

  return {
    base_per_piece: basePrice,
    additional_charges_per_piece: additionalCharges,
    total_per_piece: totalPerPiece,
    setup_fees: setupFees,
    misc_charges_total: miscTotal,
    personalization_total: personalizationTotal,
    subtotal: subtotal
  };
}

// ============================================================================
// SHIPPING CALCULATION
// ============================================================================

async function calculateShipping(totalQuantity, itemWeight, numLocations = 1) {
  const { data, error } = await supabase
    .from('pricing_calc_shipping_pricing')
    .select('*')
    .lte('weight_min', itemWeight)
    .or(`weight_max.gte.${itemWeight},weight_max.is.null`)
    .single();

  if (error) {
    console.error('Shipping pricing lookup error:', error);
    throw new Error('Could not find shipping pricing for item weight');
  }

  const level = data.level;
  const shippingMin = parseFloat(data.shipping_min);
  const shippingPerItem = parseFloat(data.shipping_per_item);
  const handlingMin = parseFloat(data.handling_min);
  const handlingPerItem = parseFloat(data.handling_per_item);

  const shippingCostPerLocation = Math.max(shippingMin, totalQuantity * shippingPerItem);
  const handlingCostPerLocation = Math.max(handlingMin, totalQuantity * handlingPerItem);
  const costPerLocation = shippingCostPerLocation + handlingCostPerLocation;
  const totalCost = costPerLocation * numLocations;

  return {
    level: level,
    cost_per_location: costPerLocation,
    total_locations: numLocations,
    cost: totalCost,
    free_shipping_eligible: level === 1
  };
}

function applyFreeShipping(shipping, orderTotal, numLocations = 1) {
  if (!shipping.free_shipping_eligible || orderTotal < 100 || numLocations === 0) {
    return {
      ...shipping,
      free_shipping_applied: false,
      discount_amount: 0
    };
  }

  const maxDiscount = 200;
  const firstLocationCost = shipping.cost_per_location;
  const discountAmount = Math.min(maxDiscount, firstLocationCost);

  const remainingLocations = numLocations - 1;
  const newCost = Math.max(0, firstLocationCost - discountAmount) + 
                  (shipping.cost_per_location * remainingLocations);

  return {
    ...shipping,
    cost: newCost,
    free_shipping_applied: true,
    discount_amount: discountAmount,
    customer_responsible_for: shipping.cost - newCost > maxDiscount ? 
      shipping.cost - newCost - maxDiscount : 0
  };
}

// ============================================================================
// RUSH FEE CALCULATION
// ============================================================================

async function calculateRushFees(rushDays, decorations) {
  if (!rushDays) return 0;

  const { data, error } = await supabase
    .from('pricing_calc_rush_fees')
    .select('*')
    .eq('days', rushDays)
    .single();

  if (error) {
    console.error('Rush fees lookup error:', error);
    throw new Error(`Could not find rush fees for ${rushDays} days`);
  }

  const baseFee = parseFloat(data.base_fee);
  const perPiecePerLocation = parseFloat(data.per_piece_per_location_fee);

  let totalPieceLocations = 0;
  for (const decoration of decorations) {
    totalPieceLocations += decoration.quantity;
  }

  return baseFee + (totalPieceLocations * perPiecePerLocation);
}

// ============================================================================
// SPOILAGE INSURANCE
// ============================================================================

function calculateSpoilageInsurance(totalQuantity) {
  const thousands = Math.ceil(totalQuantity / 1000);
  return thousands * 25;
}

// ============================================================================
// MAIN QUOTE CALCULATION
// ============================================================================

async function calculateQuote(quoteData) {
  let decorationsTotal = 0;

  for (let decoration of quoteData.decorations) {
    const pricing = await calculateDecoration(decoration);
    decoration.pricing = pricing;
    decorationsTotal += pricing.subtotal;
  }

  const shipping = await calculateShipping(
    quoteData.order.total_quantity,
    quoteData.order.item_weight || 0.5,
    quoteData.order.shipping_locations || 1
  );

  const shippingWithDiscount = applyFreeShipping(
    shipping,
    decorationsTotal,
    quoteData.order.shipping_locations || 1
  );

  const rushFees = await calculateRushFees(
    quoteData.order.rush_days,
    quoteData.decorations
  );

  const spoilage = quoteData.programs?.spoilage_insurance
    ? calculateSpoilageInsurance(quoteData.order.total_quantity)
    : 0;

  let beyondStylesCharge = 0;
  if (quoteData.order.sku_count > 3) {
    beyondStylesCharge = (quoteData.order.sku_count - 3) * 1.50;
  }

  const grandTotal = decorationsTotal + 
                     shippingWithDiscount.cost + 
                     rushFees + 
                     spoilage +
                     beyondStylesCharge;

  quoteData.totals = {
    decorations_subtotal: decorationsTotal,
    shipping: shippingWithDiscount,
    rush_fees: rushFees,
    spoilage_insurance: spoilage,
    beyond_styles_charge: beyondStylesCharge,
    grand_total: grandTotal
  };

  return quoteData;
}
