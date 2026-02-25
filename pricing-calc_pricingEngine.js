/**
 * HTG Quote Calculator - Pricing Engine
 * 
 * Core calculation logic for all decoration methods and charges.
 * All business rules confirmed with Cris on 2026-02-25.
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
// TODO: Replace with your actual Supabase URL and anon key
const supabase = createClient(
  process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL',
  process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'
);

// ============================================================================
// PRICE LOOKUP FUNCTIONS
// ============================================================================

/**
 * Look up screen print pricing based on colors and quantity
 * @param {number} colors - Total number of colors (including underbase if applicable)
 * @param {number} quantity - Quantity of this decoration
 * @returns {Promise<number>} Price per piece
 */
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

/**
 * Look up DTF pricing based on size category and quantity
 * @param {string} sizeCategory - 'sm', 'md', or 'lg'
 * @param {number} quantity - Quantity of this decoration
 * @returns {Promise<number>} Price per piece
 */
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

/**
 * Determine DTF size category from square inches
 * @param {number} sqInches - Design size in square inches
 * @returns {string} Size category: 'sm', 'md', or 'lg'
 */
function getDTFSizeCategory(sqInches) {
  if (sqInches < 36) return 'sm';
  if (sqInches < 150) return 'md';
  if (sqInches < 285) return 'lg';
  throw new Error('DTF design exceeds maximum size of 285 sq inches (15" x 19")');
}

/**
 * Look up embroidery pricing based on stitch count and quantity
 * @param {number} stitchCount - Number of stitches
 * @param {number} quantity - Quantity of this decoration
 * @returns {Promise<number>} Price per piece
 */
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
    // Over 10K stitches - calculate additional charge
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

/**
 * Calculate embroidery pricing for stitch counts over 10K
 * @param {number} stitchCount - Number of stitches
 * @param {number} quantity - Quantity of this decoration
 * @returns {Promise<number>} Price per piece
 */
async function lookupEmbroideryPriceOver10K(stitchCount, quantity) {
  // Get base price for 10K stitches
  const basePrice = await lookupEmbroideryPrice(10000, quantity);

  // Calculate additional stitches (in thousands)
  const additionalStitches = stitchCount - 10000;
  const additionalThousands = Math.ceil(additionalStitches / 1000);

  // Get per-1K price for this quantity tier
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

/**
 * Calculate screen print setup fees
 * @param {number} numScreens - Number of screens needed
 * @param {boolean} isReprint - Is this an exact reprint?
 * @returns {number} Total setup fee
 */
function calculateScreenPrintSetup(numScreens, isReprint = false) {
  const pricePerScreen = isReprint ? 10.00 : 20.00;
  return numScreens * pricePerScreen;
}

/**
 * Calculate DTF setup fees
 * @returns {number} Setup fee ($10 per location/design)
 */
function calculateDTFSetup() {
  return 10.00;
}

/**
 * Calculate embroidery digitizing fee
 * @param {number} stitchCount - Number of stitches
 * @param {number} quantity - Quantity of embroidery items
 * @returns {number} Digitizing fee (0 if 144+ pieces)
 */
function calculateDigitizingFee(stitchCount, quantity) {
  // Free digitizing on 144+ pieces
  if (quantity >= 144) {
    return 0;
  }

  // $5 per 1K stitches, minimum 5K
  const thousands = Math.max(5, Math.ceil(stitchCount / 1000));
  const fee = thousands * 5;

  // Max $75
  return Math.min(75, fee);
}

// ============================================================================
// ADDITIONAL CHARGES
// ============================================================================

/**
 * Calculate additional charges for item modifiers
 * @param {string} method - Decoration method
 * @param {Object} modifiers - Object with modifier flags
 * @returns {Promise<number>} Total additional charges per piece
 */
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

/**
 * Calculate miscellaneous charges
 * @param {string} method - Decoration method
 * @param {Object} miscCharges - Object with misc charge data
 * @returns {Promise<number>} Total miscellaneous charges
 */
async function calculateMiscCharges(method, miscCharges) {
  let total = 0;

  // PMS Matching (per color)
  if (miscCharges.pms_matching && miscCharges.pms_matching > 0) {
    total += 20.00 * miscCharges.pms_matching;
  }

  // Metallic (per location/piece) - handled in decoration calculation
  // Reflective (per location/piece) - handled in decoration calculation
  // Glitter (per location/piece) - handled in decoration calculation

  // Embroidery thread color changes
  if (method === 'embroidery' && miscCharges.thread_color_changes > 0) {
    total += 10.00 * miscCharges.thread_color_changes;
  }

  return total;
}

/**
 * Calculate personalization charges for embroidery
 * @param {number} quantity - Quantity of personalized items
 * @returns {Promise<number>} Total personalization cost
 */
async function calculatePersonalization(quantity) {
  // Find the appropriate tier
  const { data, error } = await supabase
    .from('pricing_calc_embroidery_personalization_pricing')
    .select('quantity, price')
    .lte('quantity', quantity)
    .order('quantity', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('Personalization pricing lookup error:', error);
    return quantity * 10.00; // Default to highest price
  }

  return quantity * parseFloat(data.price);
}

// ============================================================================
// MAIN DECORATION CALCULATION
// ============================================================================

/**
 * Calculate pricing for a single decoration
 * @param {Object} decoration - Decoration object with all specs
 * @returns {Promise<Object>} Pricing breakdown
 */
async function calculateDecoration(decoration) {
  const { method, quantity, specs, modifiers = {}, misc_charges = {} } = decoration;

  let basePrice = 0;
  let setupFees = 0;

  // 1. Get base price based on method
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

  // 2. Calculate additional charges (item modifiers)
  const additionalCharges = await calculateAdditionalCharges(method, modifiers);

  // 3. Calculate misc charges
  const miscTotal = await calculateMiscCharges(method, misc_charges);

  // 4. Calculate personalization (embroidery only)
  let personalizationTotal = 0;
  if (method === 'embroidery' && specs.personalization?.enabled) {
    personalizationTotal = await calculatePersonalization(specs.personalization.quantity);
  }

  // 5. Calculate totals
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

/**
 * Calculate shipping costs
 * @param {number} totalQuantity - Total number of items
 * @param {number} itemWeight - Weight per item in lbs
 * @param {number} numLocations - Number of shipping locations
 * @returns {Promise<Object>} Shipping cost breakdown
 */
async function calculateShipping(totalQuantity, itemWeight, numLocations = 1) {
  // Determine shipping level based on item weight
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

  // Calculate shipping cost per location
  const shippingCostPerLocation = Math.max(
    shippingMin,
    totalQuantity * shippingPerItem
  );

  const handlingCostPerLocation = Math.max(
    handlingMin,
    totalQuantity * handlingPerItem
  );

  const costPerLocation = shippingCostPerLocation + handlingCostPerLocation;

  // Total for all locations
  const totalCost = costPerLocation * numLocations;

  return {
    level: level,
    cost_per_location: costPerLocation,
    total_locations: numLocations,
    cost: totalCost,
    free_shipping_eligible: level === 1 // Level 1 items are eligible
  };
}

/**
 * Apply free shipping discount
 * @param {Object} shipping - Shipping calculation result
 * @param {number} orderTotal - Order subtotal (decorations only)
 * @param {number} numLocations - Number of shipping locations
 * @returns {Object} Adjusted shipping with discount applied
 */
function applyFreeShipping(shipping, orderTotal, numLocations = 1) {
  // Free shipping only applies to:
  // - Level 1 items
  // - Orders over $100
  // - Up to $200 discount
  // - First location only

  if (!shipping.free_shipping_eligible || orderTotal < 100 || numLocations === 0) {
    return {
      ...shipping,
      free_shipping_applied: false,
      discount_amount: 0
    };
  }

  // Calculate discount (max $200, applies to first location only)
  const maxDiscount = 200;
  const firstLocationCost = shipping.cost_per_location;
  const discountAmount = Math.min(maxDiscount, firstLocationCost);

  // New cost: remove discount from first location, keep other locations full price
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

/**
 * Calculate rush fees
 * @param {number} rushDays - Number of rush days (2, 3, 4, or 5)
 * @param {Array} decorations - Array of decoration objects
 * @returns {Promise<number>} Total rush fee
 */
async function calculateRushFees(rushDays, decorations) {
  if (!rushDays) return 0;

  // Get rush fee data
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

  // Calculate total pieces × locations
  let totalPieceLocations = 0;
  for (const decoration of decorations) {
    totalPieceLocations += decoration.quantity;
  }

  return baseFee + (totalPieceLocations * perPiecePerLocation);
}

// ============================================================================
// SPOILAGE INSURANCE
// ============================================================================

/**
 * Calculate spoilage insurance cost
 * @param {number} totalQuantity - Total order quantity
 * @returns {number} Insurance cost
 */
function calculateSpoilageInsurance(totalQuantity) {
  // $25 per 1,000 items (rounded up)
  const thousands = Math.ceil(totalQuantity / 1000);
  return thousands * 25;
}

// ============================================================================
// MAIN QUOTE CALCULATION
// ============================================================================

/**
 * Calculate complete quote with all charges
 * @param {Object} quoteData - Complete quote data structure
 * @returns {Promise<Object>} Complete quote with all pricing calculated
 */
async function calculateQuote(quoteData) {
  let decorationsTotal = 0;

  // Calculate each decoration
  for (let decoration of quoteData.decorations) {
    const pricing = await calculateDecoration(decoration);
    decoration.pricing = pricing;
    decorationsTotal += pricing.subtotal;
  }

  // Calculate shipping
  const shipping = await calculateShipping(
    quoteData.order.total_quantity,
    quoteData.order.item_weight || 0.5, // Default to Level 1 if not specified
    quoteData.order.shipping_locations || 1
  );

  // Apply free shipping discount
  const shippingWithDiscount = applyFreeShipping(
    shipping,
    decorationsTotal,
    quoteData.order.shipping_locations || 1
  );

  // Calculate rush fees
  const rushFees = await calculateRushFees(
    quoteData.order.rush_days,
    quoteData.decorations
  );

  // Calculate spoilage insurance
  const spoilage = quoteData.programs?.spoilage_insurance
    ? calculateSpoilageInsurance(quoteData.order.total_quantity)
    : 0;

  // Calculate "beyond 3 styles" charge
  let beyondStylesCharge = 0;
  if (quoteData.order.sku_count > 3) {
    beyondStylesCharge = (quoteData.order.sku_count - 3) * 1.50;
  }

  // Calculate grand total
  const grandTotal = decorationsTotal + 
                     shippingWithDiscount.cost + 
                     rushFees + 
                     spoilage +
                     beyondStylesCharge;

  // Update quote data with totals
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

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Main calculation
  calculateQuote,
  calculateDecoration,

  // Price lookups
  lookupScreenPrintPrice,
  lookupDTFPrice,
  lookupEmbroideryPrice,
  getDTFSizeCategory,

  // Setup fees
  calculateScreenPrintSetup,
  calculateDTFSetup,
  calculateDigitizingFee,

  // Additional charges
  calculateAdditionalCharges,
  calculateMiscCharges,
  calculatePersonalization,

  // Shipping
  calculateShipping,
  applyFreeShipping,

  // Other charges
  calculateRushFees,
  calculateSpoilageInsurance,

  // Supabase client (for direct queries if needed)
  supabase
};
