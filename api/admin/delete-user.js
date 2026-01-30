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

    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ error: "User ID required" });
    }

    // Guardrail: prevent deleting yourself (server-side)
    if (userId === adminId) {
      return res.status(400).json({ error: "Cannot delete yourself" });
    }

    // Delete user from Supabase Auth
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Optional: clean up admins table
    await supabaseAdmin.from("admins").delete().eq("id", userId);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("delete-user error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
