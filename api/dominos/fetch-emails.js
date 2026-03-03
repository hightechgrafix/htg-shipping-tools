export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Get date range from query params
    const { startDate, endDate } = req.query;

    console.log('Received request with dates:', { startDate, endDate });

    if (!startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Start date and end date are required',
        received: { startDate, endDate }
      });
    }

    // Get HelpScout credentials from environment variables
    const appId = process.env.HELPSCOUT_APP_ID;
    const appSecret = process.env.HELPSCOUT_APP_SECRET;

    console.log('Environment check:', { 
      hasAppId: !!appId, 
      hasAppSecret: !!appSecret 
    });

    if (!appId || !appSecret) {
      return res.status(500).json({ 
        success: false, 
        error: 'HelpScout credentials not configured',
        details: 'Missing HELPSCOUT_APP_ID or HELPSCOUT_APP_SECRET environment variables'
      });
    }

    // Step 1: Get access token
    const tokenResponse = await fetch('https://api.helpscout.net/v2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: appId,
        client_secret: appSecret,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get access token');
    }

    const { access_token } = await tokenResponse.json();

    // Step 2: Get list of mailboxes to find "BRTech" ID
    const mailboxesResponse = await fetch('https://api.helpscout.net/v2/mailboxes', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
    });

    if (!mailboxesResponse.ok) {
      throw new Error('Failed to fetch mailboxes');
    }

    const mailboxesData = await mailboxesResponse.json();
    const brtechMailbox = mailboxesData._embedded.mailboxes.find(m => m.name === 'BRTech');

    if (!brtechMailbox) {
      throw new Error('BRTech mailbox not found');
    }

    const mailboxId = brtechMailbox.id;

    console.log('Found BRTech mailbox:', mailboxId);

    // Step 3: Build date range for query
    // Parse dates and set to start/end of day
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 0);

    // Format dates without milliseconds for HelpScout API
    // HelpScout wants: yyyy-MM-dd'T'HH:mm:ss'Z' (no milliseconds)
    const modifiedSince = start.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const modifiedBefore = end.toISOString().replace(/\.\d{3}Z$/, 'Z');

    console.log('Date range:', { modifiedSince, modifiedBefore });

    // Step 4: Fetch conversations from BRTech mailbox
    // Fetch ALL conversations with pagination
    let allConversations = [];
    let page = 1;
    let hasMorePages = true;
    
    while (hasMorePages && page <= 10) { // Max 10 pages (250 emails) to avoid infinite loops
      const conversationsUrl = `https://api.helpscout.net/v2/conversations?mailbox=${mailboxId}&embed=threads&sortField=modifiedAt&sortOrder=desc&page=${page}`;
      
      console.log(`Fetching page ${page} from:`, conversationsUrl);
      
      const conversationsResponse = await fetch(conversationsUrl, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
        },
      });

      console.log(`Page ${page} response status:`, conversationsResponse.status);

      if (!conversationsResponse.ok) {
        const errorText = await conversationsResponse.text();
        console.error('Conversations API error:', errorText);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch conversations',
          details: {
            status: conversationsResponse.status,
            statusText: conversationsResponse.statusText,
            body: errorText,
            url: conversationsUrl
          }
        });
      }

      const conversationsData = await conversationsResponse.json();
      const pageConversations = conversationsData._embedded?.conversations || [];
      
      allConversations = allConversations.concat(pageConversations);
      
      // Check if there are more pages
      const pageInfo = conversationsData.page;
      hasMorePages = pageInfo && pageInfo.number < pageInfo.totalPages;
      page++;
      
      console.log(`Fetched ${pageConversations.length} conversations on page ${page - 1}. Total so far: ${allConversations.length}`);
    }

    const conversations = allConversations;

    console.log('Fetched conversations from API:', conversations.length);
    console.log('Date range requested:', { startDate, endDate, start, end });

    // TEMPORARILY DISABLED: Not filtering by date to debug
    // We'll return ALL conversations and let you see what dates they actually have

    // Step 5: Parse emails for store numbers and IPs
    const parsedEmails = [];

    for (const conversation of conversations) {
      try {
        const subject = conversation.subject || '';
        const threads = conversation._embedded?.threads || [];
        
        // Parse store number from subject first
        const storeMatch = subject.match(/Store(\d+)/i);
        const storeNumber = storeMatch ? storeMatch[1] : null;

        // Look through ALL threads to find the IP address
        // (sometimes replies come before the original email in the thread list)
        let ipAddress = null;
        let hostname = null;

        for (const thread of threads) {
          const body = thread?.body || '';
          
          // Parse IP address from body
          const ipMatch = body.match(/Address\s*:\s*(\d+\.\d+\.\d+\.\d+)/i);
          if (ipMatch && !ipAddress) {
            ipAddress = ipMatch[1];
          }

          // Parse hostname from body (allow HTML tags after it)
          const hostnameMatch = body.match(/Name\s*:\s*([^\s\n<]+)/i);
          if (hostnameMatch && !hostname) {
            hostname = hostnameMatch[1];
          }

          // If we found both, we can stop looking
          if (ipAddress && hostname) {
            break;
          }
        }

        if (storeNumber || ipAddress) {
          parsedEmails.push({
            conversationId: conversation.id,
            store: storeNumber,
            ip: ipAddress,
            hostname: hostname,
            subject: subject,
            createdAt: conversation.createdAt,
          });
        }
      } catch (parseError) {
        console.error('Error parsing conversation:', parseError);
        // Continue with next conversation
      }
    }

    return res.status(200).json({
      success: true,
      emails: parsedEmails,
      total: parsedEmails.length,
      dateRange: {
        start: startDate,
        end: endDate,
      },
    });

  } catch (error) {
    console.error('Error in fetch-emails:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack,
      timestamp: new Date().toISOString()
    });
  }
}
