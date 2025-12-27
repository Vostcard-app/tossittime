# Custom Domain Setup for tossittime.com

This guide explains how to configure your custom domain `tossittime.com` to work with your Netlify deployment.

## Overview

Once configured, your site will be accessible at:
- `https://tossittime.com`
- `https://www.tossittime.com` (if configured)

The Netlify domain (`tossittime.netlify.app`) will continue to work as well.

## Step 1: Add Custom Domain in Netlify

1. Log in to your Netlify account: https://app.netlify.com
2. Select your site (tossittime)
3. Go to **Site settings** → **Domain management**
4. Click **Add custom domain**
5. Enter `tossittime.com`
6. Click **Verify**
7. Netlify will provide DNS records that need to be configured

## Step 2: Configure DNS Records

You'll need to configure DNS records at your domain registrar (where you purchased `tossittime.com`).

### Option A: Using Netlify DNS (Recommended)

1. In Netlify, go to **Domain management** → **DNS**
2. Click **Add DNS provider**
3. Follow Netlify's instructions to update your domain's nameservers
4. Netlify will automatically configure all necessary DNS records

### Option B: Manual DNS Configuration

If you prefer to keep your current DNS provider, add these records:

1. **A Record** (for root domain):
   - **Name**: `@` (or leave blank)
   - **Type**: `A`
   - **Value**: Netlify's IP address (provided in Netlify dashboard)
   - **TTL**: 3600 (or default)

2. **CNAME Record** (for www subdomain):
   - **Name**: `www`
   - **Type**: `CNAME`
   - **Value**: `tossittime.netlify.app`
   - **TTL**: 3600 (or default)

**Note**: The exact IP address and values will be shown in your Netlify dashboard.

## Step 3: SSL Certificate

Netlify will automatically provision an SSL certificate for your custom domain:

1. After DNS records are configured, Netlify will detect the domain
2. SSL certificate provisioning starts automatically
3. This process can take a few minutes to a few hours
4. You'll see a notification in Netlify when the certificate is ready

## Step 4: Update Firebase Authorized Domains

You need to add your custom domain to Firebase's authorized domains:

1. Go to: https://console.firebase.google.com/project/tossittime/authentication/settings
2. Scroll to **"Authorized domains"** section
3. Click **"Add domain"**
4. Add:
   - `tossittime.com`
   - `www.tossittime.com`
5. Click **"Add"**

This ensures Firebase Authentication works on your custom domain.

## Step 5: Update Firebase API Key Restrictions (if applicable)

If you have API key restrictions configured:

1. Go to: https://console.cloud.google.com/apis/credentials?project=tossittime
2. Find your Firebase Web API key
3. Under **"Application restrictions"**, add:
   - `https://tossittime.com/*`
   - `https://www.tossittime.com/*`
4. Save the changes

## Step 6: Verify Domain Setup

1. Wait for DNS propagation (can take up to 48 hours, usually much faster)
2. Check DNS propagation: https://www.whatsmydns.net/#A/tossittime.com
3. Once DNS is propagated, visit: `https://tossittime.com`
4. You should see your site with a valid SSL certificate (🔒 icon in browser)

## Step 7: Set Primary Domain (Optional)

In Netlify:
1. Go to **Domain management**
2. Click the three dots next to `tossittime.com`
3. Select **"Set as primary domain"**
4. This makes `tossittime.com` the default domain for your site

## Troubleshooting

### Domain not resolving
- Check DNS propagation: https://www.whatsmydns.net/#A/tossittime.com
- Verify DNS records are correct at your registrar
- Wait up to 48 hours for full propagation (usually much faster)

### SSL certificate not provisioning
- Ensure DNS records are correctly configured
- Wait a few hours for certificate provisioning
- Check Netlify dashboard for any error messages
- Contact Netlify support if issues persist

### Firebase authentication not working
- Verify domain is added to Firebase authorized domains
- Check browser console for any error messages
- Ensure API key restrictions include your custom domain

### Site shows Netlify default page
- Verify the domain is correctly linked to your site in Netlify
- Check that DNS records point to Netlify
- Clear browser cache and try again

## Testing

After setup is complete:

1. Visit `https://tossittime.com` - should load your app
2. Visit `https://www.tossittime.com` - should load your app (if configured)
3. Test authentication (login/signup) - should work correctly
4. Verify SSL certificate is valid (🔒 icon in browser)

## Notes

- The Netlify domain (`tossittime.netlify.app`) will continue to work
- Both domains can be used simultaneously
- SSL certificates are automatically renewed by Netlify
- DNS changes may take time to propagate globally

