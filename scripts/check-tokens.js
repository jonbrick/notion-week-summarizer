#!/usr/bin/env node

const { google } = require("googleapis");
const {
  createPersonalAuth,
  createWorkAuth,
  validateAuthConfig,
} = require("../src/utils/auth-utils");
require("dotenv").config();

async function checkTokenStatus(tokenType) {
  console.log(`🔍 Checking ${tokenType} calendar token status...`);

  // Validate configuration
  if (!validateAuthConfig(tokenType)) {
    console.log(`❌ ${tokenType} calendar configuration is incomplete`);
    return false;
  }

  try {
    // Create auth instance
    const auth =
      tokenType === "personal" ? createPersonalAuth() : createWorkAuth();

    // Test authentication
    const calendar = await auth.getCalendarService();
    const calendarList = await calendar.calendarList.list({ maxResults: 1 });

    console.log(`✅ ${tokenType} calendar token is valid`);
    console.log(
      `   Found ${calendarList.data.items?.length || 0} accessible calendars`
    );
    return true;
  } catch (error) {
    console.log(`❌ ${tokenType} calendar token is invalid or expired`);
    console.log(`   Error: ${error.message}`);

    if (error.message.includes("invalid_grant")) {
      console.log(`\n🔄 To refresh your token, run:`);
      console.log(`   node scripts/refresh-token.js --type=${tokenType}`);
    }

    return false;
  }
}

async function main() {
  console.log("🔍 Google Calendar Token Status Checker");
  console.log("=".repeat(40));

  const personalStatus = await checkTokenStatus("personal");
  console.log();
  const workStatus = await checkTokenStatus("work");

  console.log("\n📊 Summary:");
  console.log(
    `   Personal Calendar: ${personalStatus ? "✅ Valid" : "❌ Invalid"}`
  );
  console.log(`   Work Calendar: ${workStatus ? "✅ Valid" : "❌ Invalid"}`);

  if (!personalStatus || !workStatus) {
    console.log("\n🔄 To refresh expired tokens:");
    console.log("   node scripts/refresh-token.js --type=personal");
    console.log("   node scripts/refresh-token.js --type=work");
  } else {
    console.log(
      "\n✅ All tokens are valid! You can run your calendar scripts."
    );
  }
}

main().catch(console.error);
