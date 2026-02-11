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
    const { player_name, email, score, total_moves, total_time, levels_completed } = req.body || {};

    if (!player_name || score == null) {
      return res.status(400).json({ error: 'Missing player_name or score' });
    }

    // Basic validation
    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ error: 'Invalid score' });
    }

    // Insert score
    const { data, error } = await supabaseAdmin
      .from('htg_warehouse_leaderboard')
      .insert([{
        player_name,
        email: email || null,
        score,
        total_moves: total_moves || 0,
        total_time: total_time || 0,
        levels_completed: levels_completed || 40
      }])
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, row: data });
    
  } catch (e) {
    console.error('Submit score error:', e);
    return res.status(500).json({ error: String(e) });
  }
}