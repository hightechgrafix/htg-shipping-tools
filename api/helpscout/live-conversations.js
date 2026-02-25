// HelpScout Live Conversations
// Fetches current conversations waiting >2 hours

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const HELPSCOUT_API_URL = 'https://api.helpscout.net/v2';
const HELPSCOUT_APP_ID = process.env.HELPSCOUT_APP_ID;
const HELPSCOUT_APP_SECRET = process.env.HELPSCOUT_APP_SECRET;

// Get OAuth access token
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
    throw new Error('Failed to get access token');
  }

  const data = await response.json();
  return data.access_token;
}

// Fetch conversations with pagination
async function fetchConversations(accessToken, mailboxId, page = 1) {
  const url = `${HELPSCOUT_API_URL}/conversations?mailbox=${mailboxId}&status=active&page=${page}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    console.error(`Failed to fetch conversations: ${response.statusText}`);
    return null;
  }

  return await response.json();
}

// Main handler
module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();

    // Get all mailboxes
    const mailboxesResponse = await fetch(`${HELPSCOUT_API_URL}/mailboxes`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    const mailboxesData = await mailboxesResponse.json();
    const mailboxes = mailboxesData._embedded.mailboxes;

    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - (2 * 60 * 60 * 1000));

    let allConversations = [];

    // Fetch conversations from all mailboxes
    for (const mailbox of mailboxes) {
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= 10) { // Limit to 10 pages per mailbox
        const data = await fetchConversations(accessToken, mailbox.id, page);
        
        if (!data || !data._embedded || !data._embedded.conversations) {
          hasMore = false;
          break;
        }

        allConversations = allConversations.concat(data._embedded.conversations);

        // Check if there are more pages
        hasMore = data.page.number < data.page.totalPages;
        page++;
      }
    }

    // Filter and count conversations waiting >2 hours
    const counts = {
      unassigned: 0,
      byUser: {}
    };

    allConversations.forEach(conv => {
      // Check if conversation is waiting for reply
      if (conv.status !== 'active' || conv.state !== 'published') {
        return;
      }

      // Get the time of last customer message
      const userUpdatedAt = new Date(conv.userUpdatedAt);
      
      // Check if waiting >2 hours
      if (userUpdatedAt < twoHoursAgo) {
        if (!conv.assignee || !conv.assignee.id) {
          // Unassigned
          counts.unassigned++;
        } else {
          // Assigned to user
          const userId = conv.assignee.id;
          counts.byUser[userId] = (counts.byUser[userId] || 0) + 1;
        }
      }
    });

    return res.status(200).json({
      success: true,
      counts,
      timestamp: now.toISOString(),
    });

  } catch (error) {
    console.error('Error fetching live conversations:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};