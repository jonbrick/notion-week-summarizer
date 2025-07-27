# Google Calendar Token Management

This document explains how to set up and manage Google Calendar authentication tokens for the notion-week-summarizer project.

## Why Tokens Expire

Google Calendar refresh tokens can expire for several reasons:

1. **Inactivity**: Tokens expire after 6 months of inactivity
2. **Security changes**: User password changes or security settings updates
3. **App changes**: OAuth app settings modifications
4. **Scope changes**: Changes to requested API permissions
5. **Token limits**: Google has limits on the number of refresh tokens per user/app combination

## Initial Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

### 2. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Choose "Desktop application" as the application type
4. Give it a name (e.g., "Notion Week Summarizer")
5. Download the client configuration file

### 3. Set Environment Variables

Add the following to your `.env` file:

```env
# Personal Calendar
PERSONAL_GOOGLE_CLIENT_ID=your_personal_client_id
PERSONAL_GOOGLE_CLIENT_SECRET=your_personal_client_secret
PERSONAL_GOOGLE_REFRESH_TOKEN=your_personal_refresh_token

# Work Calendar
WORK_GOOGLE_CLIENT_ID=your_work_client_id
WORK_GOOGLE_CLIENT_SECRET=your_work_client_secret
WORK_GOOGLE_REFRESH_TOKEN=your_work_refresh_token
```

## Getting Refresh Tokens

### Method 1: Using the Token Refresh Script (Recommended)

```bash
# Refresh personal calendar token
node scripts/refresh-token.js --type=personal

# Refresh work calendar token
node scripts/refresh-token.js --type=work
```

The script will:

1. Open a browser URL for authorization
2. Guide you through the OAuth flow
3. Automatically update your `.env` file with the new token
4. Test the token to ensure it works

### Method 2: Manual Token Generation

1. Visit [Google OAuth Playground](https://developers.google.com/oauthplayground/)
2. Click the settings icon (⚙️) in the top right
3. Check "Use your own OAuth credentials"
4. Enter your Client ID and Client Secret
5. Close settings
6. Select "Google Calendar API v3" from the left sidebar
7. Select these scopes:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events.readonly`
8. Click "Authorize APIs"
9. Sign in with your Google account
10. Click "Exchange authorization code for tokens"
11. Copy the refresh token to your `.env` file

## Token Expiration Symptoms

When tokens expire, you'll see errors like:

```
❌ Error fetching calendar events: invalid_grant
❌ Authentication error for personal calendar: invalid_grant
❌ Token expired for personal calendar. Please refresh your tokens.
```

## Enhanced Error Handling

The updated scripts now include:

1. **Better error messages**: Clear indication when tokens are expired
2. **Configuration validation**: Checks for missing environment variables
3. **Graceful degradation**: Scripts continue running even if calendar access fails
4. **Token refresh instructions**: Automatic guidance on how to fix expired tokens

## Troubleshooting

### Common Issues

1. **"invalid_grant" error**

   - Token has expired
   - Run the token refresh script: `node scripts/refresh-token.js --type=personal`

2. **"invalid_client" error**

   - Client ID or secret is incorrect
   - Check your `.env` file and Google Cloud Console

3. **"access_denied" error**

   - User denied permission
   - Try the authorization flow again

4. **"redirect_uri_mismatch" error**
   - OAuth app configuration issue
   - Check redirect URI settings in Google Cloud Console

### Prevention Tips

1. **Regular token refresh**: Refresh tokens every 3-4 months
2. **Monitor usage**: Check Google Cloud Console for API usage
3. **Test periodically**: Run scripts occasionally to catch expired tokens early
4. **Backup tokens**: Keep a backup of working tokens

## Security Best Practices

1. **Never commit tokens**: Ensure `.env` is in your `.gitignore`
2. **Use separate credentials**: Use different OAuth apps for personal and work calendars
3. **Limit scopes**: Only request the permissions you need
4. **Monitor access**: Regularly review app permissions in Google Account settings

## Script Usage

After setting up tokens, you can run:

```bash
# Personal calendar processing
node personal-cal-pull.js

# Work calendar processing
node work-cal-pull.js

# Combined processing
node collect-week.js
```

The scripts will now provide clear guidance if authentication fails and help you refresh tokens when needed.
