# Firebase Cloud Functions

This directory contains Firebase Cloud Functions for the TimeToUseIt app.

## Functions

### `populateUserEmails`

Populates missing email addresses and usernames for users by fetching them from Firebase Auth.

**Usage:**
- Called from the admin panel
- Requires admin authentication
- Takes an array of user IDs
- Returns statistics about the migration

**Deployment:**

1. Install dependencies:
```bash
cd functions
npm install
```

2. Build the functions:
```bash
npm run build
```

3. Deploy to Firebase:
```bash
firebase deploy --only functions
```

Or from the project root:
```bash
firebase deploy --only functions:populateUserEmails
```

## Development

To test functions locally:
```bash
npm run serve
```

This will start the Firebase emulators.
