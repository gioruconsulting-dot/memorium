# Memorium — Environment Setup Guide

**Purpose**: Step-by-step instructions to set up your development environment before starting BUILD-PLAN.md  
**Time**: ~30 minutes  
**When to use**: Before Step 1 of BUILD-PLAN.md, or when setting up on a new machine

---

## Prerequisites Checklist

Before you start, verify you have:

- ✅ **MacBook Air M4** (16GB RAM) — you're good
- ✅ **Internet connection** — for downloading tools and API access
- ✅ **Terminal app** — use built-in Terminal or iTerm2
- ✅ **Text editor / IDE** — VS Code recommended (free)
- ✅ **Credit card** (for Anthropic API, $5 free credit) — no charge if under $5/month

---

## Step 1: Install Node.js

**What**: JavaScript runtime (needed for Next.js)  
**Version**: v25.8.1 (you already have this)

### Verify Installation

Open Terminal and run:
```bash
node -v
```

Should output: `v25.8.1` (or similar)

If not installed or wrong version:
1. Download from https://nodejs.org/
2. Choose "LTS" version (long-term support)
3. Run installer, follow prompts
4. Restart Terminal
5. Verify: `node -v`

---

## Step 2: Install Git

**What**: Version control (track code changes, push to GitHub)  
**Version**: Any recent version works

### Verify Installation

```bash
git --version
```

Should output: `git version 2.x.x`

If not installed:
1. Git is pre-installed on macOS
2. If missing, install Xcode Command Line Tools:
   ```bash
   xcode-select --install
   ```
3. Follow prompts, wait for install (~5 minutes)
4. Verify: `git --version`

### Configure Git (First Time Only)

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

---

## Step 3: Install VS Code (Optional but Recommended)

**What**: Code editor with excellent Next.js support  
**Alternative**: Use any editor you prefer (Cursor, Zed, Sublime, etc.)

### Download & Install

1. Go to https://code.visualstudio.com/
2. Download for macOS (Apple Silicon)
3. Drag to Applications folder
4. Open VS Code
5. Install recommended extensions:
   - **ES7+ React/Redux/React-Native snippets** (code completion)
   - **Tailwind CSS IntelliSense** (Tailwind autocomplete)
   - **Prettier** (code formatting)

---

## Step 4: Create GitHub Account

**What**: Host your code online (required for Vercel deployment)  
**Cost**: Free

### Sign Up

1. Go to https://github.com/
2. Click "Sign up"
3. Choose free plan
4. Verify email

### Set Up SSH Key (Optional, Recommended)

Makes git push easier (no password every time):

```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your.email@example.com"

# Press Enter to accept default location
# Press Enter twice to skip passphrase (or set one)

# Copy public key to clipboard
pbcopy < ~/.ssh/id_ed25519.pub

# Add to GitHub:
# 1. Go to github.com/settings/keys
# 2. Click "New SSH key"
# 3. Paste key (Cmd+V)
# 4. Click "Add SSH key"
```

Test connection:
```bash
ssh -T git@github.com
```

Should say: `Hi [username]! You've successfully authenticated`

---

## Step 5: Get Anthropic API Key

**What**: Access Claude AI for question generation  
**Cost**: ~$0.78/year for your usage (first $5 free)

### Create Account & Get Key

1. Go to https://console.anthropic.com/
2. Sign up (email or Google)
3. Navigate to "API Keys" in sidebar
4. Click "Create Key"
5. Name it "Memorium Development"
6. Copy the key (starts with `sk-ant-...`)
7. **SAVE IT SOMEWHERE SAFE** (you can't see it again)

**Important**: Never share this key or commit it to git.

---

## Step 6: Create Turso Account & Database

**What**: Serverless SQLite database  
**Cost**: Free (9GB storage, 1B row reads/month)

### Sign Up

1. Go to https://turso.tech/
2. Click "Sign up" (use GitHub OAuth for easy login)
3. Verify email

### Create Database

In Terminal:

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Restart terminal or run:
export PATH="$HOME/.turso:$PATH"

# Verify installation
turso --version

# Login to Turso
turso auth login
# Follow browser prompts to authorize

# Create database
turso db create memorium

# Get database URL
turso db show memorium --url

# Copy output (looks like: libsql://memorium-[username].turso.io)
```

### Get Auth Token

```bash
turso db tokens create memorium

# Copy output (long token starting with `eyJ...`)
```

**Save both**:
- Database URL: `libsql://...`
- Auth token: `eyJ...`

---

## Step 7: Create Vercel Account

**What**: Hosting platform for Next.js (free tier)  
**Cost**: Free (100GB bandwidth/month)

### Sign Up

1. Go to https://vercel.com/signup
2. Sign up with GitHub (easiest option)
3. Authorize Vercel to access GitHub
4. No credit card needed for free tier

### Install Vercel CLI (Optional, for Local Testing)

```bash
npm install -g vercel

# Login
vercel login
# Follow prompts, authorize in browser
```

---

## Step 8: Create Project Directory

**What**: Folder for your Memorium code  
**Location**: Your choice (e.g., `~/Projects/memorium`)

### Create Directory

```bash
# Create Projects folder (if doesn't exist)
mkdir -p ~/Projects

# Navigate to Projects
cd ~/Projects

# Create Memorium folder
mkdir memorium

# Navigate into it
cd memorium

# Verify you're in the right place
pwd
# Should output: /Users/[your-username]/Projects/memorium
```

---

## Step 9: Set Up Environment Variables

**What**: Store secret keys locally (not committed to git)  
**When**: After Step 1 of BUILD-PLAN.md (Next.js project created)

### Create `.env.local` File

In your project root (`~/Projects/memorium`), create a file named `.env.local`:

```bash
# Create file
touch .env.local

# Open in VS Code
code .env.local
```

Add this content (replace with your actual values):

```bash
# Anthropic API Key (from Step 5)
ANTHROPIC_API_KEY=sk-ant-api03-...

# Turso Database URL (from Step 6)
TURSO_DATABASE_URL=libsql://memorium-[username].turso.io

# Turso Auth Token (from Step 6)
TURSO_AUTH_TOKEN=eyJ...
```

Save file (Cmd+S).

### Verify `.env.local` is in `.gitignore`

When you create Next.js project (BUILD-PLAN.md Step 1), it auto-generates `.gitignore` with `.env.local` included. Verify:

```bash
# After creating Next.js project, check:
cat .gitignore | grep env

# Should see:
# .env*.local
```

If not there, add it:
```bash
echo ".env*.local" >> .gitignore
```

---

## Step 10: Verify Everything Works

### Quick System Check

Run these commands in Terminal:

```bash
# Node.js installed?
node -v
# Should output: v25.8.1

# npm installed?
npm -v
# Should output: 10.x.x

# Git installed?
git --version
# Should output: git version 2.x.x

# Turso CLI installed?
turso --version
# Should output: turso version x.x.x

# Vercel CLI installed? (optional)
vercel --version
# Should output: Vercel CLI x.x.x

# GitHub SSH connection? (if you set up SSH)
ssh -T git@github.com
# Should output: Hi [username]!
```

### Test Anthropic API Key

Create a test file `test-api.js`:

```javascript
// test-api.js
const API_KEY = 'sk-ant-...'; // Your actual key

async function test() {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Say hello!' }]
    })
  });
  
  if (response.ok) {
    const data = await response.json();
    console.log('✓ API key works!');
    console.log('Response:', data.content[0].text);
  } else {
    console.log('✗ API key failed');
    console.log('Status:', response.status);
  }
}

test();
```

Run:
```bash
node test-api.js
```

Should output:
```
✓ API key works!
Response: Hello! How can I help you today?
```

If error, verify your API key is correct in `.env.local`.

Delete test file:
```bash
rm test-api.js
```

### Test Turso Connection

```bash
# List databases
turso db list

# Should see: memorium

# Connect to database (interactive shell)
turso db shell memorium

# In shell, run:
SELECT 1 as test;

# Should output: 1

# Exit shell
.quit
```

---

## Common Setup Issues

### Issue 1: Node.js Wrong Version

**Problem**: `node -v` shows wrong version  
**Solution**: Use `nvm` (Node Version Manager) to switch versions:

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart terminal

# Install Node v25
nvm install 25

# Use Node v25
nvm use 25

# Verify
node -v
```

### Issue 2: Git Push Asks for Password

**Problem**: Every `git push` requires GitHub password  
**Solution**: Set up SSH key (see Step 4 above)

### Issue 3: Turso CLI Not Found

**Problem**: `turso: command not found`  
**Solution**: Add to PATH manually:

```bash
# Add to ~/.zshrc (or ~/.bashrc if using bash)
echo 'export PATH="$HOME/.turso:$PATH"' >> ~/.zshrc

# Reload shell
source ~/.zshrc

# Verify
turso --version
```

### Issue 4: API Key Invalid

**Problem**: Test script says "API key failed"  
**Solutions**:
1. Verify key starts with `sk-ant-api03-`
2. Check for extra spaces when copying
3. Generate new key at console.anthropic.com
4. Wait 1 minute (new keys take ~30 seconds to activate)

### Issue 5: Can't Create Turso Database

**Problem**: `turso db create` fails  
**Solutions**:
1. Verify you're logged in: `turso auth login`
2. Check internet connection
3. Try different database name (no special characters)

---

## Environment Summary

After completing this setup, you should have:

✅ Node.js v25.8.1 installed  
✅ Git configured with GitHub  
✅ VS Code (or preferred editor) installed  
✅ GitHub account created  
✅ Anthropic API key saved  
✅ Turso database created with URL + token  
✅ Vercel account created  
✅ `.env.local` file ready (but empty until Next.js project created)  

---

## Next Steps

1. **Create Claude Project** (if not already done):
   - Upload PRODUCT-SPEC.md, TECH-ARCHITECTURE.md, DATA-MODEL.md, SCOPE.md, BUILD-PLAN.md, API-INTEGRATION.md, ENVIRONMENT-SETUP.md
   - Add custom instructions (see main conversation)

2. **Start BUILD-PLAN.md Step 1**:
   - Open new conversation in Claude Project
   - Say: "Let's start with Step 1 from BUILD-PLAN.md"
   - Follow steps sequentially

---

## Quick Reference: Essential Commands

```bash
# Navigate to project
cd ~/Projects/memorium

# Start dev server
npm run dev

# Open in browser
open http://localhost:3000

# Git commands
git status                  # See changes
git add .                   # Stage all changes
git commit -m "message"     # Commit with message
git push                    # Push to GitHub

# Turso commands
turso db list               # List databases
turso db shell memorium     # Open database shell
turso db show memorium      # Show database info

# Vercel commands
vercel                      # Deploy to preview
vercel --prod               # Deploy to production
vercel env ls               # List environment variables
```

---

## Troubleshooting Contact Points

If you're truly stuck:

1. **Node.js issues**: https://nodejs.org/en/docs/
2. **Git issues**: https://docs.github.com/
3. **Turso issues**: https://docs.turso.tech/ or Discord (link on turso.tech)
4. **Vercel issues**: https://vercel.com/docs or Discord
5. **Anthropic API issues**: https://docs.anthropic.com/ or support@anthropic.com

---

**You're ready!** Proceed to BUILD-PLAN.md Step 1.
