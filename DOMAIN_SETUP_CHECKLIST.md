# Domain Setup Checklist for tossittime.com

Follow these steps in order. Check off each item as you complete it.

## ✅ Step 1: Add Domain in Netlify Dashboard

- [ ] Go to https://app.netlify.com and log in
- [ ] Click on your **tossittime** site
- [ ] Go to **Site settings** → **Domain management** (left sidebar)
- [ ] Click **"Add custom domain"** button
- [ ] Enter: `tossittime.com`
- [ ] Click **"Verify"** or **"Add domain"**

**What happens next:**
- Netlify will show you DNS configuration options
- You'll see either "Use Netlify DNS" or "Configure DNS manually"
- **Note down the DNS values shown** (you'll need them in Step 2)

---

## ✅ Step 2: Configure DNS Records

**First, tell me: Where did you register tossittime.com?**
- [ ] GoDaddy
- [ ] Namecheap
- [ ] Google Domains
- [ ] Cloudflare
- [ ] Other: _______________

### Option A: Use Netlify DNS (Easiest - Recommended)

- [ ] In Netlify, click **"Use Netlify DNS"** or **"Add DNS provider"**
- [ ] Netlify will show you **nameservers** (looks like: `dns1.p01.nsone.net`)
- [ ] Copy all 4 nameservers shown
- [ ] Go to your domain registrar's website
- [ ] Find **DNS settings** or **Nameservers** section
- [ ] Replace existing nameservers with Netlify's nameservers
- [ ] Save changes
- [ ] **Skip to Step 3** (manual DNS not needed)

### Option B: Configure DNS Manually

If you prefer to keep your current DNS provider:

- [ ] In Netlify, note the **A record** IP address shown
- [ ] In Netlify, note the **CNAME** value (should be `tossittime.netlify.app`)
- [ ] Go to your domain registrar's DNS settings
- [ ] Add **A Record**:
  - **Name/Host**: `@` (or leave blank)
  - **Type**: `A`
  - **Value**: (IP address from Netlify)
  - **TTL**: `3600` (or default)
- [ ] Add **CNAME Record**:
  - **Name/Host**: `www`
  - **Type**: `CNAME`
  - **Value**: `tossittime.netlify.app`
  - **TTL**: `3600` (or default)
- [ ] Save all changes

---

## ✅ Step 3: Update Firebase Authorized Domains

- [ ] Go to: https://console.firebase.google.com/project/tossittime/authentication/settings
- [ ] Scroll down to **"Authorized domains"** section
- [ ] Click **"Add domain"** button
- [ ] Enter: `tossittime.com`
- [ ] Click **"Add"**
- [ ] Click **"Add domain"** again
- [ ] Enter: `www.tossittime.com`
- [ ] Click **"Add"**
- [ ] Verify both domains appear in the list

---

## ✅ Step 4: Update Firebase API Key Restrictions (If Applicable)

**Only do this if you have API key restrictions enabled:**

- [ ] Go to: https://console.cloud.google.com/apis/credentials?project=tossittime
- [ ] Find your **Firebase Web API key** (starts with `AIza...`)
- [ ] Click on it to edit
- [ ] Under **"Application restrictions"**, find **"HTTP referrers"**
- [ ] Click **"Add an item"**
- [ ] Add: `https://tossittime.com/*`
- [ ] Click **"Add an item"** again
- [ ] Add: `https://www.tossittime.com/*`
- [ ] Click **"Save"**

**Note:** If you don't have restrictions enabled, skip this step.

---

## ✅ Step 5: Wait for DNS Propagation

- [ ] DNS changes can take **15 minutes to 48 hours** (usually 1-2 hours)
- [ ] Check DNS propagation status: https://www.whatsmydns.net/#A/tossittime.com
- [ ] Wait until you see your Netlify IP address in most locations
- [ ] Netlify will automatically start SSL certificate provisioning once DNS resolves

---

## ✅ Step 6: Verify SSL Certificate

- [ ] Go back to Netlify: **Domain management**
- [ ] Look for `tossittime.com` in the domain list
- [ ] Wait for **"SSL certificate"** status to show **"Active"** or **"Ready"**
- [ ] This usually happens automatically within **1-2 hours** after DNS resolves
- [ ] You'll see a green checkmark or "Active" status when ready

---

## ✅ Step 7: Test Your Domain

- [ ] Open a new browser window (or incognito)
- [ ] Visit: `https://tossittime.com`
- [ ] Verify the site loads correctly
- [ ] Check for the **🔒 lock icon** in the address bar (SSL working)
- [ ] Test login/signup functionality
- [ ] Visit: `https://www.tossittime.com` (if configured)
- [ ] Verify it also works

---

## ✅ Step 8: Set Primary Domain (Optional)

- [ ] In Netlify **Domain management**
- [ ] Find `tossittime.com` in the list
- [ ] Click the **three dots** (⋯) next to it
- [ ] Select **"Set as primary domain"**
- [ ] This makes `tossittime.com` the default domain

---

## Troubleshooting

### Domain not resolving after 24 hours?
- Double-check DNS records are correct
- Verify nameservers are updated (if using Netlify DNS)
- Contact your domain registrar support

### SSL certificate not provisioning?
- Ensure DNS is fully propagated
- Wait a few more hours
- Check Netlify dashboard for error messages
- Contact Netlify support if needed

### Firebase authentication not working?
- Verify domains are added to Firebase authorized domains
- Check browser console for errors
- Ensure API key restrictions include your domain

### Site shows "Not Found" or default Netlify page?
- Verify domain is linked to correct site in Netlify
- Check DNS records point to Netlify
- Clear browser cache

---

## Need Help?

If you get stuck at any step, let me know:
1. Which step you're on
2. What error message you see (if any)
3. Screenshots are helpful!

