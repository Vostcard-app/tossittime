# Netlify Deployment Guide for TossItTime

This guide will help you deploy your TossItTime app to Netlify.

## Prerequisites

1. **Firebase Project Setup**
   - Create a Firebase project at https://console.firebase.google.com/
   - Enable Authentication (Email/Password)
   - Create a Firestore database
   - Enable Storage
   - Get your Firebase configuration values

2. **GitHub Repository**
   - Your code should be in a GitHub repository
   - Make sure all changes are committed and pushed

## Step 1: Set Up Firebase

### 1.1 Create Firebase Project
1. Go to https://console.firebase.google.com/
2. Click "Add project"
3. Enter project name: "TossItTime" (or your preferred name)
4. Follow the setup wizard
5. Enable Google Analytics (optional)

### 1.2 Enable Authentication
1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Enable **Email/Password** provider
3. Click "Save"

### 1.3 Create Firestore Database
1. Go to **Firestore Database**
2. Click "Create database"
3. Start in **production mode** (we'll add rules)
4. Choose a location (closest to your users)
5. Click "Enable"

### 1.4 Set Firestore Security Rules
1. Go to **Firestore Database** > **Rules**
2. Paste the following rules:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Food items - users can only access their own
    match /foodItems/{itemId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
    
    // User settings - users can only access their own
    match /userSettings/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
3. Click "Publish"

### 1.5 Enable Storage
1. Go to **Storage**
2. Click "Get started"
3. Start in **production mode**
4. Use the same location as Firestore
5. Click "Done"

### 1.6 Set Storage Security Rules
1. Go to **Storage** > **Rules**
2. Paste the following rules:
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
3. Click "Publish"

### 1.7 Create Firestore Index
1. Go to **Firestore Database** > **Indexes**
2. Click "Create index"
3. Collection ID: `foodItems`
4. Add fields:
   - `userId` (Ascending)
   - `expirationDate` (Ascending)
5. Click "Create"

### 1.8 Get Firebase Configuration
1. Go to **Project Settings** (gear icon) > **General**
2. Scroll to "Your apps"
3. If no web app exists, click "Add app" > Web (</> icon)
4. Register app (name it "TossItTime Web")
5. Copy the Firebase configuration values:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

## Step 2: Deploy to Netlify

### 2.1 Connect Repository to Netlify

**Option A: Via Netlify Dashboard (Recommended)**
1. Go to https://app.netlify.com/
2. Sign in with your GitHub account
3. Click "Add new site" > "Import an existing project"
4. Choose "GitHub" as your Git provider
5. Authorize Netlify to access your repositories
6. Select your `tossittime-web` repository
7. Click "Next"

**Option B: Via Netlify CLI**
```bash
npm install -g netlify-cli
netlify login
netlify init
```

### 2.2 Configure Build Settings

Netlify should auto-detect these from `netlify.toml`, but verify:

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Node version:** 18 or higher (set in Netlify dashboard if needed)

### 2.3 Add Environment Variables

1. In Netlify dashboard, go to your site
2. Navigate to **Site settings** > **Environment variables**
3. Click "Add a variable"
4. Add each of these variables with your Firebase values:

```
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

**Important:** Replace the placeholder values with your actual Firebase configuration values from Step 1.8.

### 2.4 Deploy

1. After adding environment variables, Netlify will automatically trigger a new deployment
2. Or manually trigger: **Deploys** > **Trigger deploy** > **Deploy site**
3. Wait for the build to complete
4. Your site will be live at: `https://your-site-name.netlify.app`

## Step 3: Custom Domain (Optional)

1. Go to **Site settings** > **Domain management**
2. Click "Add custom domain"
3. Enter your domain name
4. Follow the DNS configuration instructions
5. Netlify will automatically provision SSL certificates

## Step 4: PWA Icons (Required for PWA)

The app expects PWA icons. Create and add them:

1. Create icons in these sizes:
   - `icon-192.png` (192x192)
   - `icon-512.png` (512x512)
   - `icon-192-maskable.png` (192x192, maskable)
   - `icon-512-maskable.png` (512x512, maskable)

2. Place them in `public/icons/` directory

3. You can use tools like:
   - [PWA Asset Generator](https://github.com/elegantapp/pwa-asset-generator)
   - [RealFaviconGenerator](https://realfavicongenerator.net/)

4. Commit and push the icons

5. Netlify will rebuild automatically

## Troubleshooting

### Build Fails
- Check that all environment variables are set correctly
- Verify Node.js version (should be 18+)
- Check build logs in Netlify dashboard

### Firebase Connection Issues
- Verify all environment variables match your Firebase project
- Check Firebase console for any service restrictions
- Ensure Firestore and Storage are enabled

### PWA Not Working
- Verify icons are in `public/icons/` directory
- Check browser console for service worker errors
- Ensure site is served over HTTPS (Netlify does this automatically)

### Authentication Not Working
- Verify Email/Password authentication is enabled in Firebase
- Check Firestore security rules are published
- Ensure `VITE_FIREBASE_AUTH_DOMAIN` matches your Firebase project

## Continuous Deployment

Once connected, Netlify will automatically deploy:
- Every push to your main branch
- Pull requests (as preview deployments)

You can configure branch settings in **Site settings** > **Build & deploy** > **Continuous Deployment**.

## Support

For issues:
- Check Netlify build logs
- Check Firebase console for errors
- Review browser console for runtime errors


