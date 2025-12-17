# Step-by-Step Firebase Setup for TossItTime

Follow these steps in order to get your app ready for login.

## Step 1: Sign in to Firebase Console

1. Go to: https://console.firebase.google.com/project/tossittime/overview
2. Sign in with your Google account if prompted

## Step 2: Get Your Firebase Configuration Values

1. In the Firebase Console, click the **gear icon (⚙️)** next to "Project Overview" in the left sidebar
2. Select **"Project settings"**
3. Scroll down to the **"Your apps"** section
4. Look for a web app (icon: `</>`). If you don't see one:
   - Click **"Add app"** → Select **Web** icon (`</>`)
   - Register app with nickname: `TossItTime Web`
   - Click **"Register app"**
5. You'll see a config object. **Copy these values** (you'll need them for Step 5):
   - `apiKey` (starts with `AIzaSy...`)
   - `authDomain` (looks like `tossittime.firebaseapp.com`)
   - `projectId` (should be `tossittime`)
   - `storageBucket` (looks like `tossittime.appspot.com`)
   - `messagingSenderId` (a number like `123456789`)
   - `appId` (looks like `1:123456789:web:abc123def456`)

**Keep this tab open** - you'll need these values later!

## Step 3: Enable Authentication (Email/Password)

1. In the left sidebar, click **"Authentication"**
2. Click **"Get started"** (if this is your first time)
3. Click the **"Sign-in method"** tab at the top
4. Click on **"Email/Password"**
5. Toggle **"Enable"** to ON
6. Click **"Save"**

✅ Authentication is now enabled!

## Step 4: Set Up Firestore Database

1. In the left sidebar, click **"Firestore Database"**
2. Click **"Create database"** (if you haven't created it yet)
3. Select **"Start in test mode"** (we'll add security rules in Step 6)
4. Choose a **location** close to you (e.g., `us-central1`, `us-east1`)
5. Click **"Enable"**
6. Wait for the database to be created (takes ~30 seconds)

✅ Firestore is now set up!

## Step 5: Set Up Storage

1. In the left sidebar, click **"Storage"**
2. Click **"Get started"** (if this is your first time)
3. Select **"Start in test mode"** (we'll add security rules in Step 7)
4. Use the same **location** as Firestore
5. Click **"Done"**

✅ Storage is now set up!

## Step 6: Create Your .env File

Now let's add your Firebase credentials to the project:

1. Open your terminal and navigate to the project:
   ```bash
   cd /Users/jaybond/Projects/tossittime-web
   ```

2. Create the `.env` file:
   ```bash
   cp .env.example .env
   ```

3. Open the `.env` file in your editor and replace the placeholder values with your actual Firebase config from Step 2:

   ```env
   VITE_FIREBASE_API_KEY=paste_your_apiKey_here
   VITE_FIREBASE_AUTH_DOMAIN=paste_your_authDomain_here
   VITE_FIREBASE_PROJECT_ID=paste_your_projectId_here
   VITE_FIREBASE_STORAGE_BUCKET=paste_your_storageBucket_here
   VITE_FIREBASE_MESSAGING_SENDER_ID=paste_your_messagingSenderId_here
   VITE_FIREBASE_APP_ID=paste_your_appId_here
   ```

   **Example** (replace with YOUR values):
   ```env
   VITE_FIREBASE_API_KEY=AIzaSyBFnR-0QZ6lIzgXfwEEXSt6lp6fKZt4fNc
   VITE_FIREBASE_AUTH_DOMAIN=tossittime.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=tossittime
   VITE_FIREBASE_STORAGE_BUCKET=tossittime.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
   VITE_FIREBASE_APP_ID=1:123456789:web:abc123def456
   ```

4. **Save the file**

✅ Your .env file is ready!

## Step 7: Set Up Firestore Security Rules

1. In Firebase Console, go to **"Firestore Database"** → **"Rules"** tab
2. Replace the existing rules with this:

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

3. Click **"Publish"**

✅ Firestore rules are set!

## Step 8: Set Up Storage Security Rules

1. In Firebase Console, go to **"Storage"** → **"Rules"** tab
2. Replace the existing rules with this:

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

3. Click **"Publish"**

✅ Storage rules are set!

## Step 9: Create Firestore Index

1. In Firebase Console, go to **"Firestore Database"** → **"Indexes"** tab
2. Click **"Create Index"**
3. Fill in:
   - **Collection ID**: `foodItems`
   - **Fields to index**:
     - Field: `userId`, Order: `Ascending`
     - Field: `expirationDate`, Order: `Ascending`
4. Click **"Create"**
5. Wait for the index to build (takes ~1-2 minutes)

✅ Index is being created!

## Step 10: Test Your Setup

1. In your terminal, make sure you're in the project directory:
   ```bash
   cd /Users/jaybond/Projects/tossittime-web
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open your browser to the URL shown (usually `http://localhost:5174`)

4. You should see the login page!

5. Test sign up:
   - Click **"Don't have an account? Sign up"**
   - Enter your email and a password (at least 6 characters)
   - Click **"Sign Up"**
   - You should be redirected to the dashboard!

6. Test sign in:
   - Sign out (if needed)
   - Enter your email and password
   - Click **"Sign In"**
   - You should be logged in!

## Troubleshooting

### "Missing Firebase environment variables" error
- Make sure `.env` file exists in `/Users/jaybond/Projects/tossittime-web/`
- Check that all variables start with `VITE_`
- Make sure there are no extra spaces or quotes around the values
- Restart the dev server after editing `.env`

### "Firebase: Error (auth/invalid-api-key)"
- Double-check your API key in `.env` matches the one from Firebase Console
- Make sure you copied the entire API key (it's long!)

### "Firebase: Error (auth/operation-not-allowed)"
- Go back to Step 3 and make sure Email/Password is enabled

### Can't see Firestore/Storage in sidebar
- Make sure you completed Steps 4 and 5
- Refresh the Firebase Console page

---

**You're all set!** 🎉 Your TossItTime app should now have working login functionality.

