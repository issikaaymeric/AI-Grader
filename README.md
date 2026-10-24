# AI Grader

AI Grader is a full-stack application for submitting academic work, evaluating it against a grading system or rubric, and reviewing feedback.

## Project layout

- frontend/ — React + Vite web application.
- backend/ — FastAPI API, grading services, authentication, and Supabase integration.

## Backend setup

Use Python 3.11 or newer.

1. Create and activate a virtual environment from the backend directory.
2. Install dependencies:

   \`\`\`bash
   pip install -r requirements.txt
   \`\`\`

3. Create .env in backend/ and configure the required Supabase values:

   \`\`\`env
   SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   SUPABASE_SECRET_KEY=your_legacy_secret_if_used
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   SECRET_KEY=replace_with_a_long_random_secret
   \`\`\`

   Add the API key for the LLM provider you configure. Never commit real secrets.

4. Start the API from the backend directory:

   \`\`\`bash
   uvicorn main:app --reload
   \`\`\`

5. Open the interactive API documentation at http://127.0.0.1:8000/docs; check /health for a liveness response.

## Frontend setup

From the frontend directory:

\`\`\`bash
npm install
npm run dev
\`\`\`

Configure the frontend's API base URL and public Supabase settings using the environment variable names expected by the frontend source. Do not put service-role keys or other server secrets in frontend environment variables.

## Important notes

- Grading output is AI-generated and should be reviewed by a qualified instructor before final grades are issued.
- The history endpoint is authenticated and filters records by the signed-in user's ID.
- Prompt-injection text filtering is a defense-in-depth measure, not a guarantee. Treat submission content as untrusted data and keep grading instructions separate from student text.
- Before production deployment, run backend tests and the frontend production build, review database row-level security policies, and configure CORS for only the deployed frontend origins.
