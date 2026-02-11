import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, level, code, discount } = req.body || {};
    
    if (!email || !level || !code || !discount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if email already claimed this level
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('htg_warehouse_coupons')
      .select('id')
      .eq('email', email)
      .eq('level', level)
      .maybeSingle();

    if (existingErr && existingErr.code !== 'PGRST116') {
      return res.status(500).json({ error: existingErr.message });
    }

    if (existing) {
      return res.status(409).json({ error: 'Already claimed', alreadyClaimed: true });
    }

    // Insert coupon
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    const { data, error } = await supabaseAdmin
      .from('htg_warehouse_coupons')
      .insert([{
        email,
        level,
        code,
        discount,
        expires_at: expiresAt.toISOString(),
        redeemed: false
      }])
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, coupon: data });
    
  } catch (e) {
    console.error('Claim coupon error:', e);
    return res.status(500).json({ error: String(e) });
  }
}