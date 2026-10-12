# 🚀 Deployment Guide: Supabase + Vercel

This guide walks you through deploying **Pomodoro Pro** to **Vercel** with **Supabase PostgreSQL** as the production cloud backend.

---

## 🗄️ Step 1: Set Up Supabase Backend

1. **Create a Supabase Project**:
   - Go to [https://supabase.com](https://supabase.com) and log in or create a free account.
   - Click **"New Project"**, name it (e.g. `pomodoro-pro`), choose a database password and region, then click **Create**.

2. **Run the Database Schema**:
   - In the Supabase Dashboard left sidebar, click on **SQL Editor**.
   - Open the SQL script located in:
     [`supabase/schema.sql`](file:///Users/sumitjambhale/.gemini/antigravity/scratch/pomodoro-app/supabase/schema.sql)
   - Copy the entire SQL content and paste it into the Supabase SQL Editor.
   - Click **Run** (or `Cmd + Enter`).
   - *This creates all tables (`tasks`, `chains`, `chain_items`, `notifications_log`), check constraints (1-45m timer, max 2 breaks, max 3-task chain, $\le 2\text{h}$ total duration), Row Level Security (RLS) policies, Realtime publications, and initial seed data.*

3. **Get Your API Credentials**:
   - Go to **Project Settings** (gear icon) > **API**.
   - Copy:
     - **Project URL** (e.g. `https://your-project-id.supabase.co`)
     - **Project API Keys** > `anon` `public` key (`eyJhbGciOi...`)

---

## ☁️ Step 2: Deploy to Vercel

### Method A: Deploy via GitHub (Recommended)

1. Initialize Git and commit the project:
   ```bash
   cd /Users/sumitjambhale/.gemini/antigravity/scratch/pomodoro-app
   git init
   git add .
   git commit -m "feat: Pomodoro Pro with Supabase and Vercel support"
   ```

2. Push to your GitHub repository:
   ```bash
   git remote add origin https://github.com/<your-username>/pomodoro-pro.git
   git branch -M main
   git push -u origin main
   ```

3. Import Project in Vercel:
   - Go to [https://vercel.com](https://vercel.com) and sign in.
   - Click **"Add New..."** > **"Project"**.
   - Select your `pomodoro-pro` repository and click **Import**.
   - In **Environment Variables**, add:
     - `SUPABASE_URL` = your Supabase Project URL
     - `SUPABASE_ANON_KEY` = your Supabase Anon Public Key
   - Click **Deploy**!

Your app will be live on an ultra-fast global edge network at `https://pomodoro-pro-<your-team>.vercel.app`.

---

### Method B: Deploy via Vercel CLI

1. Install Vercel CLI (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. Deploy directly from the project directory:
   ```bash
   cd /Users/sumitjambhale/.gemini/antigravity/scratch/pomodoro-app
   vercel
   ```

3. When prompted, link or create your project. To deploy to production with environment variables:
   ```bash
   vercel --prod --env SUPABASE_URL="https://your-id.supabase.co" --env SUPABASE_ANON_KEY="your-anon-key"
   ```

---

## ⚡ Step 3: Connect Supabase Directly in the App (One-Click)

Even without redeploying, you can connect your live Supabase project directly inside the application:

1. Open the running application at [http://localhost:3000](http://localhost:3000) or your Vercel URL.
2. In the top navigation bar, click the **"⚡ Cloud: Local SQLite"** badge.
3. Paste your **Supabase Project URL** and **Anon Key**.
4. Click **"Test Connection"** to verify access.
5. Click **"Connect & Sync"**.

The badge will turn green (**"🟢 Cloud: Supabase Live"**), and the app will immediately switch to live PostgreSQL with real-time websocket synchronization across all open devices!
