/**
 * HTG Quote Calculator - Pricing Validation Script
 * 
 * Use this script to validate our pricing engine against known quotes
 * from your existing ConvertCalculator system.
 * 
 * Usage: node scripts/validatePricing.js
 */

import { calculateQuote } from '../src/services/pricing-calc_pricingEngine.js';
import 'dotenv/config';

// ============================================================================
// SAMPLE VALIDATION QUOTES
// Replace these with actual quotes from your ConvertCalculator
// ============================================================================

const validationQuotes = [
  {
    name: "Example 1: Simple T-Shirt Order",
    convertCalcTotal: 508.00, // Replace with actual ConvertCalc total
    quote: {
      order: {
        total_quantity: 200,
        item_weight: 0.5,
        shipping_locations: 1,
        rush_days: null,
        sku_count: 1
      },
      decorations: [
        {
          method: 'screen_print',
          location: 'full_back',
          quantity: 200,
          specs: {
            colors: 4,
            screens: 4
          },
          modifiers: {},
          misc_charges: {}
        }
      ],
      programs: {
        spoilage_insurance: false
      }
    }
  },
  
  {
    name: "Example 2: Multi-Decoration with Rush",
    convertCalcTotal: 1176.00, // Replace with actual ConvertCalc total
    quote: {
      order: {
        total_quantity: 200,
        item_weight: 0.5,
        shipping_locations: 1,
        rush_days: 2,
        sku_count: 1
      },
      decorations: [
        {
          method: 'screen_print',
          location: 'full_back',
          quantity: 200,
          specs: {
            colors: 4,
            screens: 4
          },
          modifiers: {},
          misc_charges: {}
        },
        {
          method: 'embroidery',
          location: 'left_chest',
          quantity: 100,
          specs: {
            stitch_count: 5000
          },
          modifiers: {},
          misc_charges: {}
        }
      ],
      programs: {
        spoilage_insurance: true
      }
    }
  },

  // Add more validation quotes here from your ConvertCalc system
  
];

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

function formatCurrency(amount) {
  return `$${amount.toFixed(2)}`;
}

function calculateDifference(calculated, expected) {
  const diff = calculated - expected;
  const percentDiff = ((diff / expected) * 100).toFixed(2);
  return {
    amount: diff,
    percent: percentDiff,
    isMatch: Math.abs(diff) < 0.01 // Allow 1 cent rounding difference
  };
}

async function validateQuote(validationItem) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${validationItem.name}`);
  console.log('='.repeat(80));
  
  try {
    const result = await calculateQuote(validationItem.quote);
    const calculated = result.totals.grand_total;
    const expected = validationItem.convertCalcTotal;
    const diff = calculateDifference(calculated, expected);
    
    console.log('\n📊 Results:');
    console.log(`  Our Calculation:     ${formatCurrency(calculated)}`);
    console.log(`  ConvertCalc Total:   ${formatCurrency(expected)}`);
    console.log(`  Difference:          ${formatCurrency(diff.amount)} (${diff.percent}%)`);
    
    if (diff.isMatch) {
      console.log(`  Status:              ✅ MATCH`);
    } else {
      console.log(`  Status:              ❌ MISMATCH`);
      console.log('\n📋 Breakdown:');
      console.log(`  Decorations:         ${formatCurrency(result.totals.decorations_subtotal)}`);
      console.log(`  Shipping:            ${formatCurrency(result.totals.shipping.cost)}`);
      console.log(`  Rush Fees:           ${formatCurrency(result.totals.rush_fees)}`);
      console.log(`  Spoilage Insurance:  ${formatCurrency(result.totals.spoilage_insurance)}`);
      console.log(`  Beyond Styles:       ${formatCurrency(result.totals.beyond_styles_charge || 0)}`);
      
      // Show decoration breakdown
      console.log('\n  Decoration Details:');
      result.decorations.forEach((dec, idx) => {
        console.log(`    ${idx + 1}. ${dec.method} - ${dec.location} (${dec.quantity} qty)`);
        console.log(`       Base: ${formatCurrency(dec.pricing.base_per_piece)}/pc × ${dec.quantity} = ${formatCurrency(dec.pricing.base_per_piece * dec.quantity)}`);
        console.log(`       Setup: ${formatCurrency(dec.pricing.setup_fees)}`);
        console.log(`       Subtotal: ${formatCurrency(dec.pricing.subtotal)}`);
      });
    }
    
    return diff.isMatch;
    
  } catch (error) {
    console.log(`  Status:              ❌ ERROR`);
    console.log(`  Error:               ${error.message}`);
    return false;
  }
}

// ============================================================================
// RUN VALIDATION
// ============================================================================

async function runValidation() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║         HTG Quote Calculator - Pricing Validation                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  
  let passCount = 0;
  let failCount = 0;
  
  for (const validationItem of validationQuotes) {
    const passed = await validateQuote(validationItem);
    if (passed) {
      passCount++;
    } else {
      failCount++;
    }
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Tests:  ${validationQuotes.length}`);
  console.log(`Passed:       ${passCount} ✅`);
  console.log(`Failed:       ${failCount} ❌`);
  console.log(`Success Rate: ${((passCount / validationQuotes.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(80));
  
  if (failCount > 0) {
    console.log('\n⚠️  Some tests failed. Review the breakdowns above to identify discrepancies.');
    console.log('    Common causes:');
    console.log('    - Pricing table values differ from ConvertCalc');
    console.log('    - Business rule misunderstanding');
    console.log('    - Rounding differences');
    console.log('    - Missing modifiers or charges');
  } else {
    console.log('\n✅ All validation tests passed! The pricing engine matches ConvertCalc.');
  }
}

// ============================================================================
// INTERACTIVE MODE
// ============================================================================

async function interactiveValidation() {
  console.log('\n📝 Interactive Validation Mode');
  console.log('   Paste a quote structure below, or press Ctrl+C to use sample quotes.\n');
  
  // For now, just run the sample quotes
  // In the future, this could accept user input
  await runValidation();
}

// ============================================================================
// MAIN
// ============================================================================

if (process.argv.includes('--interactive')) {
  interactiveValidation();
} else {
  runValidation();
}
