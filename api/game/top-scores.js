import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('htg_warehouse_leaderboard')
      .select('player_name, score, total_moves, total_time, levels_completed, completed_at')
      .order('score', { ascending: false })
      .limit(10);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, scores: data });
    
  } catch (e) {
    console.error('Top scores error:', e);
    return res.status(500).json({ error: String(e) });
  }
}