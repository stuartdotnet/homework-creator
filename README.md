# Homework Creator

A simple web app that generates fun, personalised homework for children using Azure AI Foundry.

---

## Quick Start

### 1. Install Node.js

Download and install from [nodejs.org](https://nodejs.org) (LTS version).

### 2. Set up Azure AI Foundry

1. Go to [ai.azure.com](https://ai.azure.com) and sign in with your Microsoft account
2. Click **New project** → give it a name (e.g. `homework-creator`)
3. In your project, go to **Deployments** → **Deploy model** → choose **gpt-4o** (or any chat model)
4. Give the deployment a name (e.g. `gpt-4o`) and deploy
5. Go to **Settings** → **Keys and Endpoint** — copy your endpoint URL and API key

### 3. Configure the app

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
VITE_FOUNDRY_ENDPOINT=https://your-project.openai.azure.com
VITE_FOUNDRY_API_KEY=your-api-key
VITE_FOUNDRY_DEPLOYMENT=gpt-4o
```

### 4. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## How It Works

1. Fill in the child's name, grade, age, and interests
2. Select which subjects to include
3. Click **Generate Homework**
4. The app calls Azure AI Foundry and generates a tailored 30-minute homework set
5. Toggle between the student view (no answers) and parent/teacher view (answers + hints)

---

## Adding More Subjects

Edit `src/lib/buildPrompt.js` — add a new entry to `SUBJECT_CONFIGS` and add it to the `SUBJECTS` array in `src/App.jsx`.

---

## Building for Production

```bash
npm run build
```

The `dist/` folder can be deployed to any static host (Netlify, Vercel, Azure Static Web Apps, etc.).

> **Note:** For a public deployment, move the API call to a backend function so your API key is not exposed to browsers.
