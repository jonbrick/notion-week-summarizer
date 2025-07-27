const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

/**
 * Enhanced Google Calendar authentication with better error handling
 */
class GoogleCalendarAuth {
  constructor(clientId, clientSecret, refreshToken, tokenType = "personal") {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.tokenType = tokenType;
    this.oauth2Client = null;
    this.lastTokenRefresh = null;
  }

  /**
   * Initialize the OAuth2 client
   */
  initialize() {
    this.oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      "urn:ietf:wg:oauth:2.0:oob"
    );

    if (this.refreshToken) {
      this.oauth2Client.setCredentials({
        refresh_token: this.refreshToken,
      });
    }

    return this.oauth2Client;
  }

  /**
   * Get authenticated OAuth2 client with error handling
   */
  async getAuthenticatedClient() {
    if (!this.oauth2Client) {
      this.initialize();
    }

    try {
      // Test the token by making a simple API call
      const calendar = google.calendar({
        version: "v3",
        auth: this.oauth2Client,
      });

      // Try to list calendars to test authentication
      await calendar.calendarList.list({ maxResults: 1 });

      return this.oauth2Client;
    } catch (error) {
      console.error(
        `❌ Authentication error for ${this.tokenType} calendar:`,
        error.message
      );

      if (
        error.message.includes("invalid_grant") ||
        error.message.includes("token_expired")
      ) {
        console.log(
          `🔄 Token expired for ${this.tokenType} calendar. Please refresh your tokens.`
        );
        this.printTokenRefreshInstructions();
      } else if (error.message.includes("invalid_client")) {
        console.log(
          `❌ Invalid client credentials for ${this.tokenType} calendar.`
        );
        this.printTokenRefreshInstructions();
      } else {
        console.log(
          `❌ Unexpected authentication error for ${this.tokenType} calendar:`,
          error.message
        );
      }

      throw error;
    }
  }

  /**
   * Print instructions for refreshing tokens
   */
  printTokenRefreshInstructions() {
    console.log("\n📋 To refresh your Google Calendar tokens:");
    console.log("1. Go to https://console.cloud.google.com/");
    console.log("2. Select your project");
    console.log("3. Go to APIs & Services > Credentials");
    console.log("4. Find your OAuth 2.0 Client ID");
    console.log("5. Download the client configuration");
    console.log("6. Run the token refresh script:");
    console.log(`   node scripts/refresh-token.js --type=${this.tokenType}`);
    console.log("\nOr manually generate new tokens:");
    console.log("1. Visit: https://developers.google.com/oauthplayground/");
    console.log("2. Set your OAuth 2.0 credentials");
    console.log("3. Select 'Google Calendar API v3'");
    console.log(
      "4. Select scopes: https://www.googleapis.com/auth/calendar.readonly"
    );
    console.log("5. Exchange authorization code for tokens");
    console.log("6. Copy the refresh token to your .env file\n");
  }

  /**
   * Create calendar service with authentication
   */
  async getCalendarService() {
    const auth = await this.getAuthenticatedClient();
    return google.calendar({ version: "v3", auth });
  }
}

/**
 * Create authentication instance for personal calendar
 */
function createPersonalAuth() {
  return new GoogleCalendarAuth(
    process.env.PERSONAL_GOOGLE_CLIENT_ID,
    process.env.PERSONAL_GOOGLE_CLIENT_SECRET,
    process.env.PERSONAL_GOOGLE_REFRESH_TOKEN,
    "personal"
  );
}

/**
 * Create authentication instance for work calendar
 */
function createWorkAuth() {
  return new GoogleCalendarAuth(
    process.env.WORK_GOOGLE_CLIENT_ID,
    process.env.WORK_GOOGLE_CLIENT_SECRET,
    process.env.WORK_GOOGLE_REFRESH_TOKEN,
    "work"
  );
}

/**
 * Enhanced calendar event fetching with better error handling
 */
async function fetchCalendarEventsWithAuth(
  authInstance,
  calendarId,
  startDate,
  endDate
) {
  try {
    const calendar = await authInstance.getCalendarService();

    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: `${startDate}T00:00:00Z`,
      timeMax: `${endDate}T23:59:59Z`,
      singleEvents: true,
      orderBy: "startTime",
    });

    return response.data.items || [];
  } catch (error) {
    console.error(
      `❌ Error fetching calendar events from ${calendarId}:`,
      error.message
    );

    // Return empty array instead of throwing to allow script to continue
    return [];
  }
}

/**
 * Check if all required environment variables are set
 */
function validateAuthConfig(tokenType) {
  const requiredVars = {
    personal: [
      "PERSONAL_GOOGLE_CLIENT_ID",
      "PERSONAL_GOOGLE_CLIENT_SECRET",
      "PERSONAL_GOOGLE_REFRESH_TOKEN",
    ],
    work: [
      "WORK_GOOGLE_CLIENT_ID",
      "WORK_GOOGLE_CLIENT_SECRET",
      "WORK_GOOGLE_REFRESH_TOKEN",
    ],
  };

  const vars = requiredVars[tokenType];
  const missing = vars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    console.error(
      `❌ Missing required environment variables for ${tokenType} calendar:`
    );
    missing.forEach((varName) => console.error(`   - ${varName}`));
    console.log(`\nPlease add these to your .env file and restart the script.`);
    return false;
  }

  return true;
}

module.exports = {
  GoogleCalendarAuth,
  createPersonalAuth,
  createWorkAuth,
  fetchCalendarEventsWithAuth,
  validateAuthConfig,
};
