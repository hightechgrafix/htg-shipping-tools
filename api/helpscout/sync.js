// HelpScout Data Sync Function
// Runs daily to pull sales team metrics from HelpScout API

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service key (bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// HelpScout API configuration
const HELPSCOUT_API_URL = 'https://api.helpscout.net/v2';
const HELPSCOUT_APP_ID = process.env.HELPSCOUT_APP_ID;
const HELPSCOUT_APP_SECRET = process.env.HELPSCOUT_APP_SECRET;

// Get OAuth access token from HelpScout
async function getAccessToken() {
  const response = await fetch('https://api.helpscout.net/v2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: HELPSCOUT_APP_ID,
      client_secret: HELPSCOUT_APP_SECRET,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Fetch all mailboxes
async function fetchMailboxes(accessToken) {
  const response = await fetch(`${HELPSCOUT_API_URL}/mailboxes`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch mailboxes: ${response.statusText}`);
  }

  const data = await response.json();
  return data._embedded.mailboxes;
}

// Fetch all active users from HelpScout
async function fetchHelpScoutUsers(accessToken) {
  const response = await fetch(`${HELPSCOUT_API_URL}/users`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch users: ${response.statusText}`);
  }

  const data = await response.json();
  return data._embedded.users.filter(user => user.type === 'user'); // Only real users, not system users
}

// Fetch user metrics for a specific date range
async function fetchUserMetrics(accessToken, userId, startDate, endDate) {
  const start = `${startDate}T00:00:00Z`;
  const end = `${endDate}T23:59:59Z`;
  
  const url = `${HELPSCOUT_API_URL}/reports/user?user=${userId}&start=${start}&end=${end}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const responseText = await response.text();
  
  if (!response.ok) {
    console.error(`Failed to fetch metrics for user ${userId}:`);
    console.error(`Status: ${response.status}`);
    console.error(`Response: ${responseText}`);
    return null;
  }

  const data = JSON.parse(responseText);
  return data;
}

// Upsert mailbox into database
async function upsertMailbox(mailbox) {
  const { data, error } = await supabase
    .from('helpscout_mailboxes')
    .upsert({
      mailbox_id: mailbox.id,
      name: mailbox.name,
      email: mailbox.email,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'mailbox_id',
    });

  if (error) {
    console.error(`Error upserting mailbox ${mailbox.id}:`, error);
    throw error;
  }

  return data;
}

// Upsert user into database
async function upsertUser(user) {
  const { data, error } = await supabase
    .from('helpscout_users')
    .upsert({
      helpscout_user_id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      role: user.role,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'helpscout_user_id',
    });

  if (error) {
    console.error(`Error upserting user ${user.id}:`, error);
    throw error;
  }

  return data;
}

// Upsert daily metrics into database
async function upsertMetrics(userId, metricDate, metrics) {
  const current = metrics.current;
  
  const { data, error } = await supabase
    .from('helpscout_daily_metrics')
    .upsert({
      helpscout_user_id: userId,
      metric_date: metricDate,
      total_replies: current.totalReplies || 0,
      conversations_created: current.conversationsCreated || 0,
      conversations_resolved: current.resolved || 0,
      customers_helped: current.customersHelped || 0,
      avg_response_time: current.responseTime || null,
      avg_first_response_time: current.averageFirstResponseTime || null,
      avg_resolution_time: current.resolutionTime || null,
      avg_handle_time: current.handleTime || null,
      resolved_on_first_reply: current.resolvedOnFirstReply || 0,
      percent_resolved_first_reply: current.percentResolvedOnFirstReply || null,
      avg_replies_to_resolve: current.repliesToResolve || null,
      happiness_score: current.happinessScore || null,
      replies_per_day: current.repliesPerDay || null,
      synced_at: new Date().toISOString(),
    }, {
      onConflict: 'helpscout_user_id,metric_date',
    });

  if (error) {
    console.error(`Error upserting metrics for user ${userId}:`, error);
    throw error;
  }

  return data;
}

// Log sync operation
async function logSync(status, usersSynced = 0, errorMessage = null) {
  const syncId = await supabase
    .from('helpscout_sync_log')
    .insert({
      sync_started_at: new Date().toISOString(),
      sync_completed_at: status === 'running' ? null : new Date().toISOString(),
      status,
      users_synced: usersSynced,
      error_message: errorMessage,
    })
    .select('id')
    .single();

  return syncId.data?.id;
}

// Main handler
module.exports = async function handler(req, res) {
  console.log('Starting HelpScout sync...');
  
  let syncLogId;
  let usersSynced = 0;

  try {
    // Create sync log entry
    syncLogId = await logSync('running');

    // Get access token
    const accessToken = await getAccessToken();
    console.log('✓ Got access token');

    // Fetch and store mailboxes
    const mailboxes = await fetchMailboxes(accessToken);
    console.log(`✓ Found ${mailboxes.length} mailboxes`);

    for (const mailbox of mailboxes) {
      await upsertMailbox(mailbox);
      console.log(`✓ Synced mailbox: ${mailbox.name}`);
    }

    // Fetch all users
    const users = await fetchHelpScoutUsers(accessToken);
    console.log(`✓ Found ${users.length} users`);

    // Get yesterday's date for metrics
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const metricDate = yesterday.toISOString().split('T')[0];

    // Sync each user
    for (const user of users) {
      try {
        // Upsert user info
        await upsertUser(user);
        console.log(`✓ Synced user: ${user.firstName} ${user.lastName}`);

        // Fetch and upsert metrics for yesterday
        const metrics = await fetchUserMetrics(accessToken, user.id, metricDate, metricDate);
        
        if (metrics) {
          await upsertMetrics(user.id, metricDate, metrics);
          console.log(`✓ Synced metrics for ${user.firstName} ${user.lastName}`);
          usersSynced++;
        }
      } catch (userError) {
        console.error(`Error syncing user ${user.id}:`, userError);
      }
    }

    // Update sync log to success
    await supabase
      .from('helpscout_sync_log')
      .update({
        sync_completed_at: new Date().toISOString(),
        status: 'success',
        users_synced: usersSynced,
      })
      .eq('id', syncLogId);

    console.log(`✓ Sync completed successfully! Synced ${usersSynced} users.`);

    return res.status(200).json({
      success: true,
      usersSynced,
      message: 'Sync completed successfully',
    });

  } catch (error) {
    console.error('Sync failed:', error);

    if (syncLogId) {
      await supabase
        .from('helpscout_sync_log')
        .update({
          sync_completed_at: new Date().toISOString(),
          status: 'failed',
          users_synced: usersSynced,
          error_message: error.message,
        })
        .eq('id', syncLogId);
    }

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};