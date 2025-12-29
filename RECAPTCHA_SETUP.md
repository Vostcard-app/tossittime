# reCAPTCHA Setup Guide for TossItTime

This guide explains how to enable reCAPTCHA v2 (visible checkbox widget) for the registration form using Firebase's RecaptchaVerifier.

## Overview

TossItTime uses Firebase's `RecaptchaVerifier` which integrates with Firebase Authentication. This uses **reCAPTCHA Enterprise** which is automatically managed by Firebase - no separate Google reCAPTCHA site keys are needed.

## Step 1: Enable reCAPTCHA in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **tossittime**
3. Navigate to **Authentication** → **Settings** (gear icon in the top right)
4. Scroll down to the **reCAPTCHA Enterprise** section
5. Click **"Enable reCAPTCHA Enterprise"** or **"Get started"**
6. Follow the prompts to enable reCAPTCHA Enterprise for your project

## Step 2: Configure Authorized Domains

1. In Firebase Console, go to **Authentication** → **Settings**
2. Scroll to **"Authorized domains"** section
3. Ensure these domains are listed:
   - `localhost` (for local development - should be there by default)
   - `tossittime.com` (your production domain)
   - `www.tossittime.com` (if you use www)
   - `tossittime.netlify.app` (your Netlify subdomain)
4. If any are missing, click **"Add domain"** and add them

## Step 3: Verify API Key Configuration

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials?project=tossittime)
2. Find your Firebase Web API key (starts with `AIzaSy...`)
3. Click on it to edit
4. Under **"API restrictions"**, make sure these APIs are enabled:
   - ✅ **Identity Toolkit API** (required for authentication and reCAPTCHA)
   - ✅ **Cloud Firestore API**
   - ✅ **Firebase Installations API**
5. Under **"Application restrictions"** → **"Websites"**, ensure your domains are listed:
   - `https://tossittime.com/*`
   - `https://www.tossittime.com/*`
   - `https://tossittime.netlify.app/*`
   - `http://localhost:*`
6. Click **"Save"**

## Step 4: Test reCAPTCHA

1. Start your development server:
   ```bash
   npm run dev
   ```
2. Navigate to the registration page (`/login` and click "Sign up")
3. You should see a reCAPTCHA checkbox widget appear below the terms checkbox
4. Try registering - the reCAPTCHA should verify when you check the box

## Troubleshooting

### reCAPTCHA widget doesn't appear

**Possible causes:**
- reCAPTCHA Enterprise not enabled in Firebase Console
- Domain not in authorized domains list
- API key restrictions blocking the request

**Solutions:**
1. Verify reCAPTCHA Enterprise is enabled (Step 1)
2. Check authorized domains include your domain (Step 2)
3. Check browser console for errors
4. Verify API key has Identity Toolkit API enabled (Step 3)

### "reCAPTCHA verification failed" error

**Possible causes:**
- Domain not authorized
- API key restrictions
- Network issues

**Solutions:**
1. Add your domain to authorized domains in Firebase Console
2. Check API key restrictions allow your domain
3. Check browser console for specific error messages
4. Try in an incognito window to rule out extension conflicts

### reCAPTCHA loads but verification fails

**Possible causes:**
- reCAPTCHA Enterprise not fully enabled
- Domain mismatch

**Solutions:**
1. Wait a few minutes after enabling reCAPTCHA Enterprise (can take time to propagate)
2. Verify the exact domain matches in authorized domains (including www vs non-www)
3. Clear browser cache and try again

## How It Works

- Firebase's `RecaptchaVerifier` automatically handles reCAPTCHA Enterprise integration
- No separate site keys or secret keys needed
- reCAPTCHA is verified automatically when user checks the box
- The verification happens client-side before account creation
- Firebase manages all the reCAPTCHA Enterprise configuration

## Notes

- reCAPTCHA Enterprise is a paid Firebase service, but has a free tier
- The free tier includes generous usage limits for most applications
- If you exceed free tier limits, you'll be charged per verification
- Check Firebase Console → Billing for usage and limits

## Verification

After completing the setup:

1. ✅ reCAPTCHA Enterprise enabled in Firebase Console
2. ✅ Authorized domains configured
3. ✅ API key has Identity Toolkit API enabled
4. ✅ reCAPTCHA widget appears on registration form
5. ✅ Registration works with reCAPTCHA verification

If all checkboxes are complete, reCAPTCHA should be working!

