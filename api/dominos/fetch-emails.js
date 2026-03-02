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
    // Use a broader date range - go back further than requested to catch more emails
    const broadStart = new Date(start);
    broadStart.setDate(broadStart.getDate() - 7); // Go back an extra week
    const broadModifiedSince = broadStart.toISOString().replace(/\.\d{3}Z$/, 'Z');
    
    const conversationsUrl = `https://api.helpscout.net/v2/conversations?mailbox=${mailboxId}&modifiedSince=${broadModifiedSince}&embed=threads&page=1&pageSize=100`;
    
    console.log('Fetching conversations from URL:', conversationsUrl);
    
    const conversationsResponse = await fetch(conversationsUrl, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
    });

    console.log('Conversations response status:', conversationsResponse.status);

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
    const allConversations = conversationsData._embedded?.conversations || [];

    console.log('Fetched conversations from API:', allConversations.length);

    // Filter conversations to only include those within the date range
    // Check multiple date fields because HelpScout tracks different timestamps
    const conversations = allConversations.filter(conv => {
      // Try multiple date fields to catch all relevant emails
      const dates = [
        conv.userUpdatedAt,
        conv.customerWaitingSince?.time,
        conv.createdAt,
        conv.modifiedAt
      ].filter(d => d); // Remove nulls
      
      // If any of these dates fall within our range, include the conversation
      return dates.some(dateStr => {
        const date = new Date(dateStr);
        return date >= start && date <= end;
      });
    });

    console.log('Conversations after date filter:', conversations.length);

    // Step 5: Parse emails for store numbers and IPs
    const parsedEmails = [];

    for (const conversation of conversations) {
      try {
        const subject = conversation.subject || '';
        const threads = conversation._embedded?.threads || [];
        
        // Get the first thread (original email)
        const firstThread = threads.find(t => t.type === 'customer') || threads[0];
        const body = firstThread?.body || '';

        // Parse store number from subject
        // Subject format: "Re: Dominos Store Update!!: New Store Network Created DomOSnet-Store4190"
        const storeMatch = subject.match(/Store(\d+)/i);
        const storeNumber = storeMatch ? storeMatch[1] : null;

        // Parse IP address from body
        // Body format: "Address : 100.78.114.2"
        const ipMatch = body.match(/Address\s*:\s*(\d+\.\d+\.\d+\.\d+)/i);
        const ipAddress = ipMatch ? ipMatch[1] : null;

        // Parse hostname from body
        // Body format: "Name : pulsebos4190.team.dominos.com"
        const hostnameMatch = body.match(/Name\s*:\s*([^\s\n]+)/i);
        const hostname = hostnameMatch ? hostnameMatch[1] : null;

        if (storeNumber || ipAddress) {
          parsedEmails.push({
            conversationId: conversation.id,
            store: storeNumber,
            ip: ipAddress,
            hostname: hostname,
            subject: subject,
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
