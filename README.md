# Lucas Fitness Dashboard

A personal fitness dashboard pulling from Google Sheets (Strava + Fitbit data).

## Setup

### 1. Clone and install

```bash
git clone https://github.com/PatrickBLucas/peloton-dashboard.git
cd peloton-dashboard
npm install
```

### 2. Configure your Google OAuth Client ID

```bash
cp .env.example .env
```

Edit `.env` and paste your Client ID from Google Cloud Console.

### 3. Run locally

```bash
npm start
```

Open http://localhost:3000, sign in with your Google account.

### 4. Deploy to GitHub Pages

```bash
npm run deploy
```

This builds the app and pushes it to the `gh-pages` branch automatically.
Your app will be live at: https://PatrickBLucas.github.io/peloton-dashboard

## Google Cloud Setup (one time)

1. Go to console.cloud.google.com
2. Create a project, enable Google Sheets API
3. Create OAuth 2.0 credentials (Web application type)
4. Add authorized origins:
   - http://localhost:3000
   - https://PatrickBLucas.github.io
5. Add authorized redirect URI:
   - https://PatrickBLucas.github.io/peloton-dashboard
6. Add yourself as a test user under OAuth consent screen
7. Copy the Client ID into your .env file

## Data Sources (Google Sheet)

Sheet ID: `1hJ_bHtAyoPoDr2QN1098L0frfIrh6aM-ykhlHtcnOgs`

Tabs used:
- **Strava Data** - workout activity (auto-synced)
- **Peloton Log** - detailed ride metrics (auto-synced)
- **Fitbit Data** - daily health data (auto-synced)
- **Weight** - daily weigh-ins
- **Stats At A Glance** - computed aggregates
- **P. Lucas Master** - 10-8 monthly tracker

## GitHub Actions (optional auto-deploy)

Create `.github/workflows/deploy.yml` to auto-deploy on every push to main.
