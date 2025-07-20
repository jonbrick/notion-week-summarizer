const { google } = require("googleapis");
require("dotenv").config();

console.log("🔧 Google Calendar Authentication Debugger\n");

// Check environment variables
function checkEnvironmentVariables() {
  console.log("1️⃣ Checking environment variables...");

  const requiredVars = [
    "PERSONAL_GOOGLE_CLIENT_ID",
    "PERSONAL_GOOGLE_CLIENT_SECRET",
    "PERSONAL_GOOGLE_REFRESH_TOKEN",
  ];

  const missing = [];
  const present = [];

  requiredVars.forEach((varName) => {
    if (process.env[varName]) {
      present.push(varName);
      // Show partial value for security
      const value = process.env[varName];
      const masked =
        value.substring(0, 8) + "..." + value.substring(value.length - 4);
      console.log(`   ✅ ${varName}: ${masked}`);
    } else {
      missing.push(varName);
      console.log(`   ❌ ${varName}: NOT SET`);
    }
  });

  if (missing.length > 0) {
    console.log(`\n❌ Missing environment variables: ${missing.join(", ")}`);
    return false;
  }

  console.log("✅ All required environment variables are set\n");
  return true;
}

// Test basic OAuth2 client creation
function testOAuth2Client() {
  console.log("2️⃣ Testing OAuth2 client creation...");

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.PERSONAL_GOOGLE_CLIENT_ID,
      process.env.PERSONAL_GOOGLE_CLIENT_SECRET,
      "urn:ietf:wg:oauth:2.0:oob"
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.PERSONAL_GOOGLE_REFRESH_TOKEN,
    });

    console.log("✅ OAuth2 client created successfully");
    return oauth2Client;
  } catch (error) {
    console.log("❌ Failed to create OAuth2 client:", error.message);
    return null;
  }
}

// Test token refresh
async function testTokenRefresh(oauth2Client) {
  console.log("\n3️⃣ Testing token refresh...");

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    console.log("✅ Successfully refreshed access token");
    console.log(`   Token type: ${credentials.token_type}`);
    console.log(
      `   Expires in: ${
        credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : "No expiry"
      }`
    );
    return true;
  } catch (error) {
    console.log("❌ Failed to refresh token:", error.message);
    console.log("   Error details:", error.response?.data || error);
    return false;
  }
}

// Test Calendar API access
async function testCalendarAPI(oauth2Client) {
  console.log("\n4️⃣ Testing Calendar API access...");

  try {
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const response = await calendar.calendarList.list({ maxResults: 3 });

    console.log("✅ Successfully accessed Calendar API");
    console.log(`   Found ${response.data.items?.length || 0} calendars`);

    if (response.data.items && response.data.items.length > 0) {
      console.log("   Sample calendars:");
      response.data.items.slice(0, 3).forEach((cal) => {
        console.log(`   - ${cal.summary} (${cal.id})`);
      });
    }

    return true;
  } catch (error) {
    console.log("❌ Failed to access Calendar API:", error.message);
    return false;
  }
}

// Generate new authorization URL
function generateAuthURL() {
  console.log("\n🔄 To generate a new refresh token, follow these steps:");
  console.log(
    "\n1. Go to Google Cloud Console: https://console.cloud.google.com/"
  );
  console.log("2. Select your project");
  console.log("3. Go to APIs & Services > Credentials");
  console.log("4. Find your OAuth 2.0 Client ID");
  console.log("5. Note down your Client ID and Client Secret");

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.PERSONAL_GOOGLE_CLIENT_ID,
      process.env.PERSONAL_GOOGLE_CLIENT_SECRET,
      "urn:ietf:wg:oauth:2.0:oob"
    );

    const scopes = ["https://www.googleapis.com/auth/calendar.readonly"];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "consent", // Force consent screen to get refresh token
    });

    console.log("\n6. Visit this URL to authorize the application:");
    console.log(`   ${authUrl}`);
    console.log("\n7. Copy the authorization code and run:");
    console.log("   node debug-google-auth.js --get-token YOUR_AUTH_CODE");
  } catch (error) {
    console.log("❌ Failed to generate auth URL:", error.message);
  }
}

// Exchange authorization code for tokens
async function exchangeCodeForTokens(authCode) {
  console.log("\n🔄 Exchanging authorization code for tokens...");

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.PERSONAL_GOOGLE_CLIENT_ID,
      process.env.PERSONAL_GOOGLE_CLIENT_SECRET,
      "urn:ietf:wg:oauth:2.0:oob"
    );

    const { tokens } = await oauth2Client.getToken(authCode);

    console.log("✅ Successfully obtained tokens!");
    console.log("\nAdd this to your .env file:");
    console.log(`PERSONAL_GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);

    // Test the new token
    oauth2Client.setCredentials(tokens);
    const testResult = await testCalendarAPI(oauth2Client);

    if (testResult) {
      console.log("\n✅ New token tested successfully!");
    }
  } catch (error) {
    console.log("❌ Failed to exchange code for tokens:", error.message);
  }
}

// Main debugging function
async function runDebug() {
  const args = process.argv.slice(2);

  // Check if user wants to exchange auth code
  if (args[0] === "--get-token" && args[1]) {
    await exchangeCodeForTokens(args[1]);
    return;
  }

  // Step 1: Check environment variables
  if (!checkEnvironmentVariables()) {
    console.log(
      "\n💡 Fix missing environment variables first, then re-run this script"
    );
    return;
  }

  // Step 2: Test OAuth2 client
  const oauth2Client = testOAuth2Client();
  if (!oauth2Client) {
    console.log("\n💡 Fix OAuth2 client creation first");
    return;
  }

  // Step 3: Test token refresh
  const refreshSuccess = await testTokenRefresh(oauth2Client);
  if (!refreshSuccess) {
    console.log(
      "\n💡 Token refresh failed - you need to generate a new refresh token"
    );
    generateAuthURL();
    return;
  }

  // Step 4: Test Calendar API
  const apiSuccess = await testCalendarAPI(oauth2Client);
  if (!apiSuccess) {
    console.log(
      "\n💡 Calendar API access failed - check your project settings"
    );
    return;
  }

  console.log(
    "\n🎉 All tests passed! Your Google Calendar authentication is working properly."
  );
  console.log("\n💡 If habits-pull.js is still failing, the issue might be:");
  console.log("   - Network connectivity");
  console.log("   - Specific calendar permissions");
  console.log("   - Rate limiting");
}

// Handle script execution
runDebug().catch((error) => {
  console.error("\n❌ Unexpected error:", error.message);
  process.exit(1);
});
