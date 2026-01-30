const { createClient } = require("@supabase/supabase-js");


const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    // Only allow GET
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // 1️⃣ Require Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Missing Authorization header" });
    }

    const token = authHeader.replace("Bearer ", "");

    // 2️⃣ Validate Supabase session
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token);

    if (userError || !userData?.user) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const userId = userData.user.id;

    // 3️⃣ Verify admin via admins table
    const { data: adminRow, error: adminError } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("id", userId)
      .single();

    if (adminError || !adminRow) {
      return res.status(403).json({ error: "Admin access required" });
    }

    // 4️⃣ List users (Supabase Auth)
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 100,
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({
      users: data.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
      })),
    });
  } catch (err) {
    console.error("list-users error:", err);
    res.status(500).json({ error: "Unexpected server error" });
  }
}
