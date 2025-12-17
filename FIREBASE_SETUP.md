# Firebase Setup for TossItTime

To enable login functionality, you need to configure Firebase. Follow these steps:

## Option 1: Create a New Firebase Project (Recommended)

1. **Go to Firebase Console**: https://console.firebase.google.com/
2. **Click "Add project"** (or select an existing project)
3. **Enter project name**: `tossittime` (or your preferred name)
4. **Follow the setup wizard** (you can skip Google Analytics for now)

### Enable Required Services

#### Authentication
1. Go to **Authentication** → **Get started**
2. Click **Sign-in method** tab
3. Enable **Email/Password** provider
4. Click **Save**

#### Firestore Database
1. Go to **Firestore Database** → **Create database**
2. Start in **test mode** (we'll update rules later)
3. Choose a location close to you
4. Click **Enable**

#### Storage
1. Go to **Storage** → **Get started**
2. Start in **test mode** (we'll update rules later)
3. Use the same location as Firestore
4. Click **Done**

### Get Your Firebase Config

1. Go to **Project Settings** (gear icon) → **General** tab
2. Scroll down to **Your apps** section
3. Click the **Web** icon (`</>`) to add a web app
4. Register app with nickname: `TossItTime Web`
5. **Copy the config values** (they look like this):

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### Create .env File

Create a `.env` file in the project root with:

```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

Replace the placeholder values with your actual Firebase config values.

### Set Up Security Rules

#### Firestore Rules
Go to **Firestore Database** → **Rules** and paste:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /foodItems/{itemId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
    match /userSettings/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

#### Storage Rules
Go to **Storage** → **Rules** and paste:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /foodItems/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Create Firestore Index

1. Go to **Firestore Database** → **Indexes**
2. Click **Create Index**
3. Collection ID: `foodItems`
4. Add fields:
   - `userId` (Ascending)
   - `expirationDate` (Ascending)
5. Click **Create**

## Option 2: Use Existing Firebase Project

If you already have a Firebase project you want to use:

1. Go to **Project Settings** → **General**
2. Scroll to **Your apps** → find your web app
3. Click the settings icon → **Config**
4. Copy the config values
5. Create `.env` file as shown above
6. Make sure **Authentication** (Email/Password) is enabled
7. Make sure **Firestore** and **Storage** are enabled

## Verify Setup

After creating your `.env` file, run:

```bash
npm run dev
```

The app should start without Firebase configuration errors. If you see errors, check:
- All environment variables are set correctly
- No typos in variable names
- Values don't have extra quotes or spaces

## Test Login

1. Start the dev server: `npm run dev`
2. Navigate to the login page
3. Click "Don't have an account? Sign up"
4. Create a test account with your email
5. You should be redirected to the dashboard after signup

## Troubleshooting

### "Missing Firebase environment variables" error
- Make sure `.env` file exists in the project root
- Check that all variables start with `VITE_`
- Restart the dev server after creating/editing `.env`

### "Firebase: Error (auth/invalid-api-key)"
- Verify your API key is correct
- Check Firebase Console → Project Settings → General → Your apps
- Make sure you copied the entire API key

### "Firebase: Error (auth/operation-not-allowed)"
- Go to Authentication → Sign-in method
- Make sure Email/Password is enabled

### Can't access Firestore/Storage
- Check that Firestore Database is created
- Check that Storage is enabled
- Verify security rules are set correctly

