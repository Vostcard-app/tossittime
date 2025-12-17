# URGENT: Fix API Key Error

## The Problem

You're seeing:
- `API key not valid. Please pass a valid API key.`
- `MutationObserver` errors (caused by Firebase Auth failing)

**Root Cause:** Environment variables are NOT set in Netlify, so the build is using placeholder/invalid values.

## IMMEDIATE FIX (5 minutes)

### Step 1: Go to Netlify Dashboard

1. Open: https://app.netlify.com/
2. Click on your **tossittime** site
3. Go to: **Site settings** (gear icon) → **Environment variables**

### Step 2: Add These 6 Variables

Click **"Add a variable"** for each one:

| Variable Name | Value |
|--------------|-------|
| `VITE_FIREBASE_API_KEY` | `AIzaSyDv9GV58Aneksy1ORoFhmt6FffKGiKO1A0` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `tossittime.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `tossittime` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `tossittime.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `218263308308` |
| `VITE_FIREBASE_APP_ID` | `1:218263308308:web:2837debce015071c887f01` |

**⚠️ CRITICAL:**
- Variable names MUST start with `VITE_`
- No spaces around the `=` sign
- Copy values exactly (no extra spaces or quotes)

### Step 3: Configure API Key Restrictions

1. Go to: https://console.cloud.google.com/apis/credentials?project=tossittime
2. Find your API key (starts with `AIzaSy...`)
3. Click to edit it
4. Under **"Application restrictions"**:
   - Select **"Websites"**
   - Add: `https://tossittime.netlify.app/*`
   - Add: `http://localhost:*`
5. Under **"API restrictions"**:
   - Select **"Restrict key"**
   - Enable:
     - ✅ Identity Toolkit API
     - ✅ Cloud Firestore API
     - ✅ Firebase Storage API
     - ✅ Firebase Installations API
6. Click **"Save"**

### Step 4: Redeploy

1. In Netlify, go to **Deploys**
2. Click **"Trigger deploy"** → **"Deploy site"**
3. Wait for build to complete (~2 minutes)

### Step 5: Test

1. Go to: https://tossittime.netlify.app
2. Open DevTools (F12) → Console
3. The API key error should be GONE
4. Try to sign in/sign up

## Why This Happens

When you build on Netlify:
- Vite looks for environment variables starting with `VITE_`
- If they don't exist, it uses `undefined` or empty strings
- Firebase tries to initialize with invalid config
- This causes the API key error and MutationObserver errors

## Verification

After adding variables and redeploying:

1. Check Netlify build log:
   - Go to Deploys → Latest deploy → Build log
   - Look for: `VITE_FIREBASE_API_KEY` in the output
   - Should NOT say `undefined`

2. Check browser console:
   - Should NOT see API key errors
   - Should NOT see MutationObserver errors
   - Firebase should initialize successfully

## Still Not Working?

1. **Wait 2-3 minutes** after saving API key restrictions (they need to propagate)

2. **Double-check variable names:**
   - Must be exactly: `VITE_FIREBASE_API_KEY` (not `FIREBASE_API_KEY`)
   - All 6 variables must be present

3. **Verify API key value:**
   - In Google Cloud Console, click "Show key"
   - Should match: `AIzaSyDv9GV58Aneksy1ORoFhmt6FffKGiKO1A0`

4. **Clear browser cache:**
   - Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

