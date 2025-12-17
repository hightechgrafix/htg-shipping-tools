import { supabase } from "../_supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const { quantity, colorCount } = req.body || {};

  const qty = Number(quantity);
  const colors = Number(colorCount);

  // Deterministic input validation
  if (!Number.isInteger(qty) || qty <= 0) {
    return res.status(400).json({ error: "INVALID_QUANTITY" });
  }

  if (!Number.isInteger(colors) || colors <= 0) {
    return res.status(400).json({ error: "INVALID_COLOR_COUNT" });
  }

  const { data, error } = await supabase
    .from("screen_print_pricing_grid")
    .select("min_quantity,max_quantity,color_count,price_per_piece")
    .eq("active", true)
    .eq("color_count", colors)
    .lte("min_quantity", qty)
    .gte("max_quantity", qty);

  if (error) {
    return res.status(500).json({
      error: "DB_ERROR",
      details: error.message,
    });
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: "NO_MATCH" });
  }

  if (data.length > 1) {
    return res.status(409).json({
      error: "MULTIPLE_MATCHES",
      matches: data,
    });
  }

  const row = data[0];

  return res.status(200).json({
    quantity: qty,
    colorCount: colors,
    pricePerPiece: row.price_per_piece,
    band: {
      min: row.min_quantity,
      max: row.max_quantity,
    },
  });
}
