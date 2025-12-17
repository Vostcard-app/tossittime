# Quick Start - Get Your Firebase Config

Since you're signed in, let's get your Firebase configuration values:

## Step 1: Get Firebase Config Values

1. In Firebase Console, click the **⚙️ gear icon** next to "Project Overview" (top left)
2. Click **"Project settings"**
3. Scroll down to **"Your apps"** section
4. Look for a web app (icon: `</>`)
   - **If you see one**: Click on it, then you'll see the config
   - **If you don't see one**: 
     - Click **"Add app"** button
     - Click the **Web** icon (`</>`)
     - Register app nickname: `TossItTime Web`
     - Click **"Register app"**
     - You'll see the config immediately

5. You'll see a code block that looks like this:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "tossittime.firebaseapp.com",
     projectId: "tossittime",
     storageBucket: "tossittime.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```

6. **Copy these 6 values** - you'll need them in the next step:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

## Step 2: Create .env File

Once you have the values, I'll help you create the `.env` file. Just paste the values here or tell me when you have them ready!

---

**Current URL to check**: https://console.firebase.google.com/project/tossittime/settings/general

