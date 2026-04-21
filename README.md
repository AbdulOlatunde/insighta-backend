A REST API built with Node.js and Express that accepts a name, calls three external classification APIs, applies demographic logic, stores the result in MongoDB, and exposes endpoints to create, retrieve, filter, search, and delete profiles.



## Prerequisites

 Node.js installed on your machine
 npm
 A MongoDB Atlas account and connection string



## Installation


# Clone the repository
git clone <https://github.com/AbdulOlatunde/hng-genderize>
cd Genderize-api

# Install dependencies
npm install


Create a `.env` file in the project root:


MONGO_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/genderize
PORT=3000


### Seed the database

Place `profiles.json` in the project root, then run:

npm run seed

### Running the server


# Development (auto-restarts on file changes)
npm run dev

# Production
node index.js


The server runs on `http://localhost:3000` by default.

## API Reference

### 1. Create Profile
`POST /api/profiles`

Accepts a name, calls Genderize, Agify, and Nationalize APIs, and stores the result.

*

### 2. Get All Profiles
`GET /api/profiles`

Supports filtering, sorting, and pagination.


**Sorting:** `sort_by=age|created_at|gender_probability` and `order=asc|desc`

**Pagination:** `page` (default: 1), `limit` (default: 10, max: 50)

**Example:**

GET /api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc&page=1&limit=10


### 3. Natural Language Search
`GET /api/profiles/search`

Parses plain English queries into filters.

 |
Supports `page` and `limit` pagination parameters.



**Unrecognised query:**
{ "status": "error", "message": "Unable to interpret query" }



### 4. Get Single Profile
`GET /api/profiles/:id`



### 5. Delete Profile
`DELETE /api/profiles/:id`

Returns `204 No Content` on success with no response body.


## Error Responses

All errors follow this structure:


{ "status": "error", "message": "<description of the error>" }




## Testing with Postman

### Create a profile
 Method: `POST`
 URL: `http://localhost:3000/api/profiles`
 Body -raw - JSON: `{ "name": "james" }`

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



## CORS

All responses include the header


Access-Control-Allow-Origin


This allows the API to be called from any origin, including browser-based grading scripts and frontend clients.