A secure, multi-interface demographic intelligence platform built with Node.js and Express. Accepts a name, calls three external classification APIs, applies demographic logic, stores the result in MongoDB, and exposes endpoints to create, retrieve, filter, search, and delete profiles. Authentication is handled via GitHub OAuth with PKCE, and access is enforced through role-based permissions across a REST API, CLI tool, and web portal.



## System Architecture

The platform is split into three repositories that all talk to the same backend:

insighta-backend — REST API, authentication, database, business logic
insighta-cli — globally installable CLI tool for power users
insighta-web — browser-based portal for non-technical users

All data lives in a single MongoDB database. The CLI and web portal both proxy requests through the backend. Authentication tokens are issued by the backend and consumed by both interfaces.



## Authentication Flow

Web Portal:
1. User visits the web portal and clicks Continue with GitHub
2. Web portal builds a GitHub OAuth URL with its own callback and redirects the user
3. GitHub redirects back to the web portal callback with a code
4. Web portal sends the code to the backend cli-callback endpoint
5. Backend exchanges the code with GitHub, retrieves user info, creates or updates the user, and returns access and refresh tokens
6. Web portal sets HTTP-only cookies and redirects to the dashboard

CLI:
1. User runs insighta login
2. CLI generates a state, code_verifier, and code_challenge (PKCE)
3. CLI starts a local server on port 9876 and opens GitHub in the browser
4. GitHub redirects to localhost:9876/callback with a code
5. CLI sends the code and code_verifier to the backend
6. Backend exchanges the code, issues tokens, and returns them to the CLI
7. CLI stores tokens at ~/.insighta/credentials.json and confirms login



## Token Handling Approach

Access token expires in 3 minutes. Refresh token expires in 5 minutes. Both are issued as a pair on every login and refresh.

The CLI auto-refreshes the access token using the stored refresh token when a 401 is received. If the refresh token is also expired, the user is prompted to log in again.

The web portal stores both tokens as HTTP-only cookies, inaccessible to JavaScript. The refresh endpoint invalidates the old refresh token immediately and issues a new pair on every use.



## Role Enforcement Logic

Every user is assigned a role on creation: analyst by default, admin by manual assignment.

Analysts can read and search profiles but cannot create or delete them.
Admins have full access including POST /api/profiles and DELETE /api/profiles/:id.

All /api/* endpoints require authentication. Role checks are applied as middleware before the route handler runs. If a user is inactive, all requests return 403 Forbidden regardless of role.



## Natural Language Parsing Approach

The search endpoint parses plain English queries using rule-based regex matching. No AI or LLMs are used.

Gender is detected from words like male, men, boys, female, women, girls.
Age group is detected from words like child, teenager, adult, senior, elderly.
The word young maps to ages 16 to 24 for filtering purposes only and is not a stored age group.
Age ranges are extracted from patterns like above 30, over 25, below 18, under 40.
Country is matched from patterns like from nigeria or in kenya by comparing against a full country name lookup map.

Queries that match none of these patterns return an Unable to interpret query error.



## Prerequisites

Node.js installed on your machine
npm
A MongoDB Atlas account and connection string



## Installation


# Clone the repository
git clone https://github.com/AbdulOlatunde/insighta-backend
cd insighta-backend

# Install dependencies
npm install


Create a `.env` file in the project root:


MONGO_URI=mongodb+srv://olatundeabdullah21:Olatunde23@cluster0.sjoaszq.mongodb.net/?appName=Cluster0
PORT=3000
JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
GITHUB_CLIENT_ID_WEB=Ov23libhXsjNNEJbbb6q
GITHUB_CLIENT_SECRET_WEB=your_web_client_secret
GITHUB_CLIENT_ID_CLI=Ov23lii6KoWGOStqrOjx
GITHUB_CLIENT_SECRET_CLI=your_cli_client_secret
BACKEND_URL=https://hng-genderize-production.up.railway.app
FRONTEND_URL=https://insighta-web-production-f647.up.railway.app
NODE_ENV=production


### Seed the database

Place `profiles.json` in the project root, then run:

npm run seed

### Running the server


# Development (auto-restarts on file changes)
npm run dev

# Production
node index.js


The server runs on `http://localhost:3000` by default.



## CLI Usage

Install and link the CLI globally:

cd insighta-cli
npm install
npm link

Available commands:

insighta login
insighta logout
insighta whoami

insighta profiles list
insighta profiles list --gender male
insighta profiles list --country NG --age-group adult
insighta profiles list --min-age 25 --max-age 40
insighta profiles list --sort-by age --order desc
insighta profiles list --page 2 --limit 20
insighta profiles get <id>
insighta profiles search "young males from nigeria"
insighta profiles create --name "Harriet Tubman"
insighta profiles export --format csv
insighta profiles export --format csv --gender male --country NG

Credentials are stored at ~/.insighta/credentials.json. Exported CSV files are saved to the current working directory.



## API Reference

All /api/* endpoints require the header:

X-API-Version: 1

Requests without this header return 400 Bad Request.

### 1. Create Profile
`POST /api/profiles` — Admin only

Accepts a name, calls Genderize, Agify, and Nationalize APIs, and stores the result.

### 2. Get All Profiles
`GET /api/profiles`

Supports filtering, sorting, and pagination.

Supported filters: gender, age_group, country_id, min_age, max_age, min_gender_probability, min_country_probability

Sorting: `sort_by=age|created_at|gender_probability` and `order=asc|desc`

Pagination: `page` (default: 1), `limit` (default: 10, max: 50)

Example:

GET /api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc&page=1&limit=10

### 3. Natural Language Search
`GET /api/profiles/search`

Parses plain English queries into filters.

Supports `page` and `limit` pagination parameters.

Unrecognised query:
{ "status": "error", "message": "Unable to interpret query" }

### 4. Export Profiles
`GET /api/profiles/export?format=csv`

Applies the same filters as GET /api/profiles and returns a CSV file.

### 5. Get Single Profile
`GET /api/profiles/:id`

### 6. Delete Profile
`DELETE /api/profiles/:id` — Admin only

Returns `204 No Content` on success with no response body.

### Auth Endpoints

GET /auth/github — Redirects to GitHub OAuth
GET /auth/github/callback — Handles OAuth callback for web portal
POST /auth/github/cli-callback — Handles OAuth token exchange for CLI
POST /auth/refresh — Refreshes access and refresh tokens
POST /auth/logout — Invalidates the refresh token
GET /auth/me — Returns the currently authenticated user



## Error Responses

All errors follow this structure:

{ "status": "error", "message": "<description of the error>" }

400 — Missing or empty parameter
422 — Invalid parameter type
401 — Authentication required or token expired
403 — Insufficient permissions or inactive account
404 — Profile not found
429 — Too many requests
502 — External API returned invalid response
500 — Internal server error



## Testing with Postman

### Create a profile
Method: `POST`
URL: `http://localhost:3000/api/profiles`
Headers: `X-API-Version: 1`, `Authorization: Bearer <token>`
Body — raw — JSON: `{ "name": "james" }`

### Get all profiles with filters

http://localhost:3000/api/profiles?gender=male&country_id=NG&sort_by=age&order=desc

### Natural language search

http://localhost:3000/api/profiles/search?q=young males from nigeria
http://localhost:3000/api/profiles/search?q=females above 30
http://localhost:3000/api/profiles/search?q=adult males from kenya

### Get single profile

http://localhost:3000/api/profiles/<id>

### Delete a profile
Method: `DELETE`
URL: `http://localhost:3000/api/profiles/<id>`



## Rate Limiting

Auth endpoints (/auth/*) are limited to 10 requests per minute.
All other endpoints are limited to 60 requests per minute per user.
Exceeded limits return 429 Too Many Requests.



## CORS

All responses include the header:

Access-Control-Allow-Origin: *

This allows the API to be called from any origin, including browser-based grading scripts and frontend clients.