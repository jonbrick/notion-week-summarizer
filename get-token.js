const { google } = require("googleapis");
require("dotenv").config();

async function getAccessToken() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.WORK_GOOGLE_CLIENT_ID,
    process.env.WORK_GOOGLE_CLIENT_SECRET,
    "urn:ietf:wg:oauth:2.0:oob"
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.WORK_GOOGLE_REFRESH_TOKEN,
  });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    console.log("🎯 ACCESS TOKEN (copy this for Postman):");
    console.log(credentials.access_token);
    console.log("\n⏰ Expires at:", new Date(credentials.expiry_date));
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

getAccessToken();
