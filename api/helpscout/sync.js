// HelpScout Data Sync Function
// Runs daily to pull sales team metrics from HelpScout API
// Now syncs per-mailbox for accurate filtering

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
  return data._embedded.users.filter(user => user.type === 'user');
}

  // Fetch company report (includes per-user breakdown for a mailbox)
  async function fetchCompanyReport(accessToken, mailboxId, startDate, endDate) {
    const start = `${startDate}T00:00:00Z`;
    const end = `${endDate}T23:59:59Z`;
    
    const url = `${HELPSCOUT_API_URL}/reports/company?mailboxes=${mailboxId}&start=${start}&end=${end}&viewBy=user`;
    
    console.log(`Fetching company report for mailbox ${mailboxId}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      console.error(`Failed to fetch company report for mailbox ${mailboxId}:`);
      console.error(`Status: ${response.status}`);
      console.error(`Response: ${responseText}`);
      return null;
    }

    const data = JSON.parse(responseText);
    
    // ADD THIS LINE TO SEE THE STRUCTURE
    console.log(`Company report structure:`, JSON.stringify(data, null, 2));
    
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

// Upsert daily metrics into database (now with mailbox_id)
async function upsertMetrics(userId, mailboxId, metricDate, metrics) {
  const { data, error } = await supabase
    .from('helpscout_daily_metrics')
    .upsert({
      helpscout_user_id: userId,
      mailbox_id: mailboxId,
      metric_date: metricDate,
      total_replies: metrics.totalReplies || 0,
      conversations_created: 0, // Not available in company report
      conversations_resolved: 0, // Not available in company report  
      customers_helped: metrics.customersHelped || 0,
      avg_response_time: null, // Not available in company report
      avg_first_response_time: null, // Not available in company report
      avg_resolution_time: null, // Not available in company report
      avg_handle_time: metrics.handleTime || null,
      resolved_on_first_reply: 0, // Not available in company report
      percent_resolved_first_reply: null, // Not available in company report
      avg_replies_to_resolve: null, // Not available in company report
      happiness_score: metrics.happinessScore || null,
      replies_per_day: metrics.totalReplies || 0, // Same as total for single day
      synced_at: new Date().toISOString(),
    }, {
      onConflict: 'helpscout_user_id,mailbox_id,metric_date',
    });

  if (error) {
    console.error(`Error upserting metrics for user ${userId} in mailbox ${mailboxId}:`, error);
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
  let metricsInserted = 0;

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

    // Fetch all users (to ensure user table is up to date)
    const users = await fetchHelpScoutUsers(accessToken);
    console.log(`✓ Found ${users.length} users`);

    for (const user of users) {
      await upsertUser(user);
      console.log(`✓ Synced user: ${user.firstName} ${user.lastName}`);
    }

    // Get yesterday's date for metrics
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const metricDate = yesterday.toISOString().split('T')[0];

    // Sync metrics for each mailbox
    for (const mailbox of mailboxes) {
      try {
        console.log(`\nFetching metrics for mailbox: ${mailbox.name}`);
        
        const report = await fetchCompanyReport(accessToken, mailbox.id, metricDate, metricDate);
        
        if (!report || !report.users || report.users.length === 0) {
          console.log(`No user data in report for mailbox ${mailbox.name}`);
          continue;
        }

        // Process each user's metrics in this mailbox
        for (const userMetrics of report.users) {
          try {
            const userId = userMetrics.user;  // Just the ID, not nested
            const userName = userMetrics.name;
            
            // Only insert if there's actual activity
            if (userMetrics.replies > 0 || userMetrics.closed > 0) {
              // Map the company report format to our database format
              const mappedMetrics = {
                totalReplies: userMetrics.replies || 0,
                customersHelped: userMetrics.customersHelped || 0,
                handleTime: userMetrics.handleTime || null,
                happinessScore: userMetrics.happinessScore || null,
                // Note: Company report doesn't include all the detailed metrics
                // We'll store what we have and set the rest to null
              };
              
              await upsertMetrics(userId, mailbox.id, metricDate, mappedMetrics);
              console.log(`  ✓ Synced metrics for ${userName} in ${mailbox.name}`);
              metricsInserted++;
            }
          } catch (userError) {
            console.error(`Error syncing user metrics:`, userError);
          }
        }
      } catch (mailboxError) {
        console.error(`Error syncing mailbox ${mailbox.name}:`, mailboxError);
      }
    }

    // Update sync log to success
    await supabase
      .from('helpscout_sync_log')
      .update({
        sync_completed_at: new Date().toISOString(),
        status: 'success',
        users_synced: metricsInserted,
      })
      .eq('id', syncLogId);

    console.log(`\n✓ Sync completed successfully! Inserted ${metricsInserted} metric records.`);

    return res.status(200).json({
      success: true,
      metricsInserted,
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
          users_synced: metricsInserted,
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