# How to Direct Traffic to timetouseit.com

This guide will walk you through setting up `timetouseit.com` to point to your Netlify-hosted site.

## Quick Start (3 Steps)

1. **Add domain in Netlify** (2 minutes)
2. **Configure DNS** (5 minutes)
3. **Update Firebase** (2 minutes)

---

## Step 1: Add Domain in Netlify Dashboard

1. Go to **https://app.netlify.com** and log in
2. Click on your **timetouseit** site (or the site that's currently deployed)
3. In the left sidebar, go to **Site settings** → **Domain management**
4. Click the **"Add custom domain"** button
5. Enter: `timetouseit.com` (without www or https://)
6. Click **"Verify"** or **"Add domain"**

**What happens next:**
- Netlify will show you DNS configuration options
- You'll see either "Use Netlify DNS" (recommended) or "Configure DNS manually"
- **Note down the DNS values shown** - you'll need them in Step 2

---

## Step 2: Configure DNS Records

You have two options. **Option A is recommended** (easiest).

### Option A: Use Netlify DNS (Recommended - Easiest)

Netlify will manage all DNS for you automatically.

1. **In Netlify Dashboard:**
   - After adding the domain, click **"Use Netlify DNS"** or **"Add DNS provider"**
   - Netlify will show you **4 nameservers** (they look like: `dns1.p01.nsone.net`)
   - **Copy all 4 nameservers**

2. **Go to your domain registrar** (where you bought timetouseit.com):
   - **GoDaddy**: Domain settings → Nameservers
   - **Namecheap**: Domain List → Manage → Nameservers
   - **Google Domains**: DNS → Name servers
   - **Cloudflare**: DNS → Nameservers
   - **Other**: Look for "DNS settings" or "Nameservers"

3. **Update nameservers:**
   - Replace existing nameservers with Netlify's 4 nameservers
   - Save changes
   - **That's it!** Netlify handles everything else automatically

4. **Wait 1-2 hours** for DNS to propagate. Netlify will automatically:
   - Detect when DNS is configured
   - Provision SSL certificate
   - Make your site live

---

### Option B: Configure DNS Manually

If you prefer to keep your current DNS provider:

1. **In Netlify Dashboard:**
   - After adding the domain, look for **"Configure DNS"** section
   - Note the **A record IP address** (looks like: `75.2.60.5`)
   - Note the **CNAME value** (should be: `your-site-name.netlify.app`)

2. **Go to your domain registrar's DNS settings:**
   - Find "DNS Records" or "Advanced DNS" section

3. **Add A Record** (for root domain):
   - **Name/Host**: `@` (or leave blank, or enter `timetouseit.com`)
   - **Type**: `A`
   - **Value**: (IP address from Netlify)
   - **TTL**: `3600` (or default)

4. **Add CNAME Record** (for www subdomain - optional):
   - **Name/Host**: `www`
   - **Type**: `CNAME`
   - **Value**: `your-site-name.netlify.app` (from Netlify)
   - **TTL**: `3600` (or default)

5. **Save all changes**

6. **Wait 1-2 hours** for DNS propagation. Check status at:
   - https://www.whatsmydns.net/#A/timetouseit.com

---

## Step 3: Update Firebase Authorized Domains

**Important:** This ensures Firebase Authentication works on your custom domain.

1. Go to: **https://console.firebase.google.com/project/tossittime/authentication/settings**
   - (Replace `tossittime` with your actual Firebase project ID if different)

2. Scroll down to **"Authorized domains"** section

3. Click **"Add domain"**

4. Add these domains (one at a time):
   - `timetouseit.com`
   - `www.timetouseit.com` (if you configured www)

5. Click **"Add"** after each one

6. Verify both domains appear in the authorized domains list

---

## Step 4: Update Firebase API Key Restrictions (If Applicable)

**Only do this if you have API key restrictions enabled:**

1. Go to: **https://console.cloud.google.com/apis/credentials?project=tossittime**
   - (Replace `tossittime` with your actual project ID)

2. Find your **Firebase Web API key** (starts with `AIza...`)

3. Click on it to edit

4. Under **"Application restrictions"**, find **"HTTP referrers"**

5. Click **"Add an item"** and add:
   - `https://timetouseit.com/*`
   - `https://www.timetouseit.com/*` (if configured)

6. Click **"Save"**

**Note:** If you don't have restrictions enabled, skip this step.

---

## Step 5: Wait and Verify

1. **Wait for DNS propagation** (usually 1-2 hours, can take up to 48 hours)
   - Check status: https://www.whatsmydns.net/#A/timetouseit.com
   - You should see Netlify's IP address in most locations

2. **Check SSL certificate in Netlify:**
   - Go to **Domain management**
   - Look for `timetouseit.com`
   - Wait for SSL status to show **"Active"** (usually 1-2 hours after DNS resolves)

3. **Test your site:**
   - Visit: `https://timetouseit.com`
   - Should load your site with a 🔒 lock icon (SSL working)
   - Test login/signup to verify Firebase works

---

## Step 6: Set Primary Domain (Optional)

Make `timetouseit.com` the default domain:

1. In Netlify **Domain management**
2. Find `timetouseit.com` in the list
3. Click the **three dots** (⋯) next to it
4. Select **"Set as primary domain"**

---

## Troubleshooting

### Domain not resolving after 24 hours?
- Double-check DNS records are correct
- Verify nameservers are updated (if using Netlify DNS)
- Check DNS propagation: https://www.whatsmydns.net/#A/timetouseit.com
- Contact your domain registrar support

### SSL certificate not provisioning?
- Ensure DNS is fully propagated first
- Wait a few more hours (can take up to 24 hours)
- Check Netlify dashboard for any error messages
- Contact Netlify support if needed

### Firebase authentication not working?
- Verify domains are added to Firebase authorized domains
- Check browser console for errors
- Ensure API key restrictions include your domain (if restrictions are enabled)

### Site shows "Not Found" or default Netlify page?
- Verify domain is linked to correct site in Netlify
- Check DNS records point to Netlify
- Clear browser cache and try again
- Try incognito/private browsing mode

---

## Quick Reference

- **Netlify Dashboard**: https://app.netlify.com
- **Firebase Console**: https://console.firebase.google.com
- **DNS Check**: https://www.whatsmydns.net/#A/timetouseit.com
- **Your Netlify site**: Check your Netlify dashboard for the exact site name

---

## Need Help?

If you get stuck:
1. Tell me which step you're on
2. What error message you see (if any)
3. Screenshots are helpful!
