# Workon Web (React + Vite)

## Local
`cp .env.example .env` then `npm i && npm run dev` (http://localhost:5173).
Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon key only), `VITE_API_URL` (your API base, no trailing slash).

## Deploy on Vercel
Import repo. Framework: Vite. Build: `npm run build`. Output: `dist`.
Add the three env vars, with `VITE_API_URL` set to your Render URL. Redeploy after changing env vars.
Then add the Vercel URL to `CLIENT_ORIGIN` on Render.
