# Namecheap DNS Setup for tossittime.com

This guide is specifically for configuring your domain with Namecheap to work with Netlify.

## Step 1: Add Domain in Netlify (Do This First)

1. Go to https://app.netlify.com
2. Click on your **tossittime** site
3. Go to **Site settings** → **Domain management**
4. Click **"Add custom domain"**
5. Enter: `tossittime.com`
6. Click **"Verify"** or **"Add domain"**

**After adding the domain, Netlify will show you DNS options. Choose one:**

---

## Option A: Use Netlify DNS (Recommended - Easiest)

This is the easiest method. Netlify manages all DNS for you.

### Steps:

1. **In Netlify Dashboard:**
   - After adding the domain, click **"Use Netlify DNS"** or **"Add DNS provider"**
   - Netlify will show you **4 nameservers** (they look like: `dns1.p01.nsone.net`)
   - **Copy all 4 nameservers** - you'll need them in the next step

2. **In Namecheap:**
   - Go to https://www.namecheap.com and log in
   - Go to **Domain List** (top menu)
   - Find **tossittime.com** and click **"Manage"**
   - Scroll down to **"Nameservers"** section
   - Select **"Custom DNS"** (instead of "Namecheap BasicDNS")
   - You'll see 2-4 nameserver fields
   - **Replace** the existing nameservers with Netlify's 4 nameservers:
     - Paste nameserver 1 in field 1
     - Paste nameserver 2 in field 2
     - Paste nameserver 3 in field 3
     - Paste nameserver 4 in field 4
   - Click **"✓" (checkmark)** or **"Save"** to save changes

3. **Wait for DNS Propagation:**
   - Changes can take 15 minutes to 48 hours (usually 1-2 hours)
   - Netlify will automatically detect when DNS is configured
   - SSL certificate will be provisioned automatically

4. **Done!** Netlify now manages all DNS records automatically.

---

## Option B: Manual DNS Configuration (Keep Namecheap DNS)

If you prefer to keep using Namecheap's DNS instead of Netlify's:

### Steps:

1. **In Netlify Dashboard:**
   - After adding the domain, look for **"Configure DNS"** or **"DNS settings"**
   - Note the **A record IP address** (looks like: `75.2.60.5` - this is just an example)
   - Note the **CNAME value** (should be: `tossittime.netlify.app`)

2. **In Namecheap:**
   - Go to https://www.namecheap.com and log in
   - Go to **Domain List** → **tossittime.com** → **"Manage"**
   - Click on **"Advanced DNS"** tab
   - Scroll down to **"Host Records"** section

3. **Add A Record for Root Domain:**
   - Click **"Add New Record"**
   - **Type**: Select **"A Record"**
   - **Host**: Enter `@` (this represents the root domain)
   - **Value**: Enter the IP address from Netlify (from Step 1)
   - **TTL**: Select **"Automatic"** or **"30 min"**
   - Click **"✓" (checkmark)** to save

4. **Add CNAME Record for www:**
   - Click **"Add New Record"** again
   - **Type**: Select **"CNAME Record"**
   - **Host**: Enter `www`
   - **Value**: Enter `tossittime.netlify.app`
   - **TTL**: Select **"Automatic"** or **"30 min"**
   - Click **"✓" (checkmark)** to save

5. **Remove Old Records (if any):**
   - If you see any old A or CNAME records pointing elsewhere, delete them
   - Only keep the new records you just added

6. **Wait for DNS Propagation:**
   - Changes can take 15 minutes to 48 hours (usually 1-2 hours)
   - Check propagation: https://www.whatsmydns.net/#A/tossittime.com
   - Netlify will automatically provision SSL once DNS resolves

---

## Step 2: Update Firebase Authorized Domains

**Important:** Do this regardless of which DNS option you chose.

1. Go to: https://console.firebase.google.com/project/tossittime/authentication/settings
2. Scroll to **"Authorized domains"** section
3. Click **"Add domain"**
4. Enter: `tossittime.com`
5. Click **"Add"**
6. Click **"Add domain"** again
7. Enter: `www.tossittime.com`
8. Click **"Add"**

---

## Step 3: Verify Everything Works

1. **Check DNS Propagation:**
   - Visit: https://www.whatsmydns.net/#A/tossittime.com
   - Wait until you see your Netlify IP address in most locations

2. **Check SSL Certificate:**
   - Go to Netlify → **Domain management**
   - Look for `tossittime.com`
   - Wait for SSL status to show **"Active"** (usually 1-2 hours after DNS resolves)

3. **Test Your Site:**
   - Visit: `https://tossittime.com`
   - Should load your site with a 🔒 lock icon
   - Test login/signup to verify Firebase works

---

## Namecheap-Specific Tips

- **Nameserver changes** in Namecheap can take up to 24 hours to fully propagate
- **DNS record changes** usually propagate faster (1-2 hours)
- If you don't see changes after 2 hours, try:
  - Clearing your browser cache
  - Using a different browser or incognito mode
  - Checking from a different network/device

---

## Troubleshooting

### "Domain not verified" in Netlify
- Make sure you entered `tossittime.com` exactly (no www, no http://)
- Wait a few minutes and refresh the Netlify page

### DNS not resolving after 24 hours
- Double-check nameservers are correct (if using Option A)
- Verify A/CNAME records are correct (if using Option B)
- Contact Namecheap support if needed

### SSL certificate not provisioning
- Ensure DNS is fully propagated first
- Wait a few more hours
- Check Netlify dashboard for any error messages

---

## Quick Reference: Namecheap Navigation

- **Domain List**: Top menu → "Domain List"
- **Manage Domain**: Click "Manage" next to your domain
- **Nameservers**: Scroll down on the domain management page
- **Advanced DNS**: Click "Advanced DNS" tab for manual DNS records

