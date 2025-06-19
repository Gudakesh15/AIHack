const axios = require('axios');
const logger = require('./logger');

class VapiIntegration {
  constructor() {
    this.vapiPrivateKey = process.env.VAPI_PRIVATE_KEY;
    this.vapiPublicKey = process.env.VAPI_PUBLIC_KEY;
    this.assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
    this.vapiBaseUrl = 'https://api.vapi.ai';
    this.activeSessions = new Map(); // Store active web call sessions
  }

  // Create a web call session using existing assistant
  async createWebCall(userId, context = null) {
    try {
      if (!this.assistantId) {
        throw new Error('Vapi configuration missing: NEXT_PUBLIC_VAPI_ASSISTANT_ID required');
      }

      // Use the hardcoded working demo link
      const webCallUrl = 'https://vapi.ai?demo=true&shareKey=5c317485-cc0b-4cdd-a348-9d6bdf52481c&assistantId=65ddde5c-1355-45df-b944-cf0266e5f4c1';
      
      // Generate a session ID for tracking
      const sessionId = `telegram-${userId}-${Date.now()}`;

      // Store session info
      this.activeSessions.set(userId, {
        callId: sessionId,
        assistantId: this.assistantId,
        webCallUrl: webCallUrl,
        created: Date.now(),
        context: context
      });

      logger.info('Vapi web call URL provided', {
        userId,
        assistantId: this.assistantId,
        hasContext: !!context,
        sessionId: sessionId
      });

      return {
        callId: sessionId,
        webCallUrl: webCallUrl,
        assistantId: this.assistantId
      };

    } catch (error) {
      logger.error('Error creating Vapi web call', { 
        error: error.message,
        userId 
      });
      throw error;
    }
  }

  // Create an actual phone call to user's phone number
  async createPhoneCall(userId, phoneNumber, context = null) {
    try {
      if (!this.vapiPrivateKey || !this.assistantId) {
        throw new Error('Vapi configuration missing: VAPI_PRIVATE_KEY and NEXT_PUBLIC_VAPI_ASSISTANT_ID required for phone calls');
      }

      // You would need a Vapi phone number ID for this to work
      // This requires setting up a phone number in your Vapi dashboard
      const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
      
      if (!phoneNumberId) {
        throw new Error('Phone calling requires VAPI_PHONE_NUMBER_ID - set up a phone number in Vapi dashboard first');
      }

      const callConfig = {
        assistant: {
          assistantId: this.assistantId
        },
        phoneNumberId: phoneNumberId,
        customer: {
          number: phoneNumber
        },
        metadata: {
          userId: userId,
          source: 'telegram',
          context: context ? JSON.stringify(context) : null,
          timestamp: new Date().toISOString()
        }
      };

      logger.info('Creating Vapi phone call', {
        userId,
        assistantId: this.assistantId,
        phoneNumber: phoneNumber.substring(0, 8) + '***', // Log partial number for privacy
        hasContext: !!context
      });

      const response = await axios.post(`${this.vapiBaseUrl}/call`, callConfig, {
        headers: {
          'Authorization': `Bearer ${this.vapiPrivateKey}`,
          'Content-Type': 'application/json'
        }
      });

      // Store session info
      this.activeSessions.set(userId, {
        callId: response.data.id,
        assistantId: this.assistantId,
        phoneNumber: phoneNumber,
        created: Date.now(),
        context: context
      });

      logger.info('Vapi phone call created successfully', { 
        callId: response.data.id,
        userId,
        phoneNumber: phoneNumber.substring(0, 8) + '***'
      });

      return {
        callId: response.data.id,
        phoneNumber: phoneNumber,
        assistantId: this.assistantId
      };

    } catch (error) {
      logger.error('Error creating Vapi phone call', { 
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        userId 
      });
      throw error;
    }
  }

  // Get active session for user
  getActiveSession(userId) {
    return this.activeSessions.get(userId);
  }

  // Clear session
  clearSession(userId) {
    this.activeSessions.delete(userId);
  }

  // Clean up old sessions (older than 2 hours)
  cleanupOldSessions() {
    const now = Date.now();
    for (const [userId, session] of this.activeSessions.entries()) {
      if (now - session.created > 7200000) { // 2 hours
        this.activeSessions.delete(userId);
        logger.debug('Cleaned up old web session', { userId, callId: session.callId });
      }
    }
  }

  // Handle webhook events from Vapi web calls (optional)
  handleWebhookEvent(event) {
    logger.info('Vapi web webhook event received', { 
      type: event.message?.type,
      callId: event.message?.call?.id 
    });

    switch (event.message?.type) {
      case 'status-update':
        return this.handleStatusUpdate(event.message);
      case 'transcript':
        return this.handleTranscript(event.message);
      case 'call-ended':
        return this.handleCallEnded(event.message);
      default:
        logger.debug('Unhandled web webhook event type', { type: event.message?.type });
        return null;
    }
  }

  handleStatusUpdate(message) {
    const { call } = message;
    logger.info('Web call status update', { 
      callId: call.id, 
      status: call.status 
    });
    
    return {
      type: 'status',
      callId: call.id,
      status: call.status,
      metadata: call.metadata
    };
  }

  handleTranscript(message) {
    logger.info('Web call transcript received', { 
      callId: message.call.id,
      role: message.role,
      transcript: message.transcript?.substring(0, 100) + '...'
    });

    return {
      type: 'transcript',
      callId: message.call.id,
      role: message.role,
      transcript: message.transcript
    };
  }

  handleCallEnded(message) {
    const { call } = message;
    logger.info('Web call ended', { 
      callId: call.id,
      duration: call.duration,
      endedReason: call.endedReason 
    });
    
    // Clean up session when call ends
    if (call.metadata?.userId) {
      this.clearSession(call.metadata.userId);
    }
    
    return {
      type: 'call-ended',
      callId: call.id,
      duration: call.duration,
      endedReason: call.endedReason,
      metadata: call.metadata,
      summary: call.summary
    };
  }

  // Format web call link for Telegram
  formatWebCallMessage(webCallUrl, context) {
    const contextSummary = context ? 'with your conversation context' : 'for general crypto discussion';
    
    return `🎙️ **Voice Call Ready!**\n\n` +
           `Your AI strategist is ready to talk ${contextSummary}.\n\n` +
           `**Click to start voice conversation:**\n` +
           `${webCallUrl}\n\n` +
           `**What to expect:**\n` +
           `• Natural voice conversation in your browser\n` +
           `• No downloads or apps needed\n` +
           `• Personalized crypto strategy advice\n` +
           `• 10-15 minute conversation\n\n` +
           `*💡 Tip: Use headphones for best audio quality!*`;
  }

  // Check if Vapi is properly configured
  isConfigured() {
    return !!this.assistantId;
  }

  // Create alternative message for mobile users with troubleshooting
  formatMobileTroubleshootingMessage() {
    return `📱 **Mobile Voice Call Troubleshooting**\n\n` +
           `If the voice call didn't work on your phone, try:\n\n` +
           `**Option 1: Switch Browser**\n` +
           `• Copy link and paste in Chrome/Safari\n` +
           `• Don't use Telegram's built-in browser\n\n` +
           `**Option 2: Desktop Alternative**\n` +
           `• Open the link on a computer instead\n` +
           `• Desktop browsers work more reliably\n\n` +
           `**Option 3: Phone Call (if available)**\n` +
           `• We could add phone calling instead\n` +
           `• Would require a phone number setup\n\n` +
           `**Still having issues?**\n` +
           `• Check microphone permissions\n` +
           `• Ensure stable internet connection\n` +
           `• Try incognito/private browsing mode\n\n` +
           `*Let me know if you need help with any of these options!*`;
  }

  // Format phone call success message
  formatPhoneCallMessage(phoneNumber, context) {
    const contextSummary = context ? 'with your conversation context' : 'for general crypto discussion';
    
    return `📞 **Phone Call Initiated!**\n\n` +
           `Your AI strategist is calling you now ${contextSummary}.\n\n` +
           `📱 **Calling:** ${phoneNumber}\n\n` +
           `**What to expect:**\n` +
           `• Your phone will ring in a few seconds\n` +
           `• Answer to start talking with your AI strategist\n` +
           `• Natural conversation about crypto strategy\n` +
           `• 10-15 minute consultation\n\n` +
           `*💡 Use speaker phone or headphones for best experience!*`;
  }

  // Verify assistant exists and is properly configured
  async verifyAssistant() {
    try {
      const response = await axios.get(`${this.vapiBaseUrl}/assistant/${this.assistantId}`, {
        headers: {
          'Authorization': `Bearer ${this.vapiPrivateKey}`,
          'Content-Type': 'application/json'
        }
      });

      logger.info('Assistant verification successful', {
        assistantId: this.assistantId,
        name: response.data.name,
        status: response.data.status || 'active'
      });

      return response.data;
    } catch (error) {
      logger.error('Assistant verification failed', {
        assistantId: this.assistantId,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }
}

module.exports = VapiIntegration; 