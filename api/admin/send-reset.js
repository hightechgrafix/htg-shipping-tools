const { createClient } = require("@supabase/supabase-js");

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Missing Authorization header" });
    }

    const token = authHeader.replace("Bearer ", "");

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token);

    if (userError || !userData?.user) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const adminId = userData.user.id;

    // Verify admin
    const { data: adminRow } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("id", adminId)
      .single();

    if (!adminRow) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }

    // 🔐 Trigger Supabase password reset email
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("send-reset error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
