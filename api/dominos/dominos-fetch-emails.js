export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Get date range from query params
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      throw new Error('Start date and end date are required');
    }

    // Get HelpScout credentials from environment variables
    const appId = process.env.HELPSCOUT_APP_ID;
    const appSecret = process.env.HELPSCOUT_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error('HelpScout credentials not configured');
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

    // Step 3: Get users to find "polling" user ID
    const usersResponse = await fetch('https://api.helpscout.net/v2/users', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
    });

    if (!usersResponse.ok) {
      throw new Error('Failed to fetch users');
    }

    const usersData = await usersResponse.json();
    const pollingUser = usersData._embedded.users.find(u => 
      u.firstName?.toLowerCase() === 'polling' || 
      u.email?.toLowerCase().includes('polling')
    );

    if (!pollingUser) {
      throw new Error('Polling user not found');
    }

    const userId = pollingUser.id;

    // Step 4: Build date range for query
    // Parse dates and set to start/end of day
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const modifiedSince = start.toISOString();
    const modifiedBefore = end.toISOString();

    // Step 5: Fetch conversations from BRTech mailbox assigned to polling user
    // Note: HelpScout API doesn't have a modifiedBefore parameter, so we'll filter in code
    const conversationsResponse = await fetch(
      `https://api.helpscout.net/v2/conversations?mailbox=${mailboxId}&assignedTo=${userId}&status=active&modifiedSince=${modifiedSince}&embed=threads`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
        },
      }
    );

    if (!conversationsResponse.ok) {
      throw new Error('Failed to fetch conversations');
    }

    const conversationsData = await conversationsResponse.json();
    const allConversations = conversationsData._embedded?.conversations || [];

    // Filter conversations to only include those within the date range
    const conversations = allConversations.filter(conv => {
      const modifiedAt = new Date(conv.userUpdatedAt || conv.createdAt);
      return modifiedAt >= start && modifiedAt <= end;
    });

    // Step 6: Parse emails for store numbers and IPs
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
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
