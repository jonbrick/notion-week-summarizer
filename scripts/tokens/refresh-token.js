#!/usr/bin/env node

const { google } = require("googleapis");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function refreshToken(tokenType = "personal") {
  console.log(`🔄 Google Calendar Token Refresh for ${tokenType} calendar`);
  console.log("=".repeat(50));

  // Get environment variables
  const clientId = process.env[`${tokenType.toUpperCase()}_GOOGLE_CLIENT_ID`];
  const clientSecret =
    process.env[`${tokenType.toUpperCase()}_GOOGLE_CLIENT_SECRET`];

  if (!clientId || !clientSecret) {
    console.error(
      `❌ Missing ${tokenType} Google OAuth credentials in environment variables`
    );
    console.log(
      `Please ensure ${tokenType.toUpperCase()}_GOOGLE_CLIENT_ID and ${tokenType.toUpperCase()}_GOOGLE_CLIENT_SECRET are set in your .env file`
    );
    return;
  }

  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "urn:ietf:wg:oauth:2.0:oob"
  );

  // Generate authorization URL
  const scopes = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events.readonly",
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent", // Force consent to get refresh token
  });

  console.log("\n📋 Follow these steps to refresh your token:");
  console.log("1. Open this URL in your browser:");
  console.log(`   ${authUrl}`);
  console.log("\n2. Sign in with your Google account");
  console.log("3. Grant permission to access your calendar");
  console.log("4. Copy the authorization code from the browser");
  console.log("\n5. Paste the authorization code below:");

  const authCode = await askQuestion("\nAuthorization code: ");

  if (!authCode.trim()) {
    console.log("❌ No authorization code provided");
    rl.close();
    return;
  }

  try {
    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(authCode);

    console.log("\n✅ Token refresh successful!");
    console.log("\n📋 New tokens:");
    console.log(`Access Token: ${tokens.access_token.substring(0, 20)}...`);
    console.log(`Refresh Token: ${tokens.refresh_token.substring(0, 20)}...`);
    console.log(
      `Expires In: ${
        tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : "N/A"
      }`
    );

    // Update .env file
    const envPath = path.join(__dirname, "..", "..", ".env");
    let envContent = "";

    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf8");
    }

    // Update or add the refresh token
    const tokenVarName = `${tokenType.toUpperCase()}_GOOGLE_REFRESH_TOKEN`;
    const tokenRegex = new RegExp(`^${tokenVarName}=.*$`, "m");

    if (tokenRegex.test(envContent)) {
      // Replace existing token
      envContent = envContent.replace(
        tokenRegex,
        `${tokenVarName}=${tokens.refresh_token}`
      );
    } else {
      // Add new token
      envContent += `\n${tokenVarName}=${tokens.refresh_token}`;
    }

    fs.writeFileSync(envPath, envContent);
    console.log(`\n✅ Updated .env file with new refresh token`);

    // Test the new token
    console.log("\n🧪 Testing new token...");
    oauth2Client.setCredentials(tokens);

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const calendarList = await calendar.calendarList.list({ maxResults: 1 });

    console.log(
      "✅ Token test successful! You can now use your calendar scripts."
    );
  } catch (error) {
    console.error("❌ Error refreshing token:", error.message);
    console.log("\nPossible issues:");
    console.log("- Authorization code expired (try again)");
    console.log("- Invalid client credentials");
    console.log("- Network connectivity issues");
  }

  rl.close();
}

// Parse command line arguments
const args = process.argv.slice(2);
let tokenType = "personal";

if (args.includes("--type=work")) {
  tokenType = "work";
} else if (args.includes("--type=personal")) {
  tokenType = "personal";
} else if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node scripts/refresh-token.js [--type=personal|work]");
  console.log("  --type=personal  Refresh personal calendar token (default)");
  console.log("  --type=work      Refresh work calendar token");
  console.log("  --help, -h       Show this help message");
  process.exit(0);
}

// Load environment variables
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

refreshToken(tokenType).catch(console.error);
