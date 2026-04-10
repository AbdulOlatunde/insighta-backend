A REST API built with Node.js and Express that classifies names by gender using the Genderize.io API. It processes the raw response and returns enriched, structured data including a confidence flag.

Tech Stack
Runtime: Node.js
Framework: Express.js
HTTP Client: Axios
Dev Tool: Nodemon

You should haveNode.js installed 
npm

Installation
bash# Clone the repository
git clone <your-repo-url>
cd Genderize-api

# Install dependencies

npm install
npm run dev

node index.js
The server runs on http://localhost:3000 by default.

API Reference
GET /api/classify
Classifies a given name by gender.
Success Response 200 OK
json{
  "status": "success",
  "data": {
    "name": "David",
    "gender": "male",
    "probability": 0.99,
    "sample_size": 3489607,
    "is_confident": true,
    "processed_at": "2026-04-10T12:00:00.000Z"
  }
}


Error Responses
All errors follow this structure:
json{
  "status": "error",
  "message": "<description of the error>"
}

Testing with Postman
Open Postman
Set method to GET
Enter the URL:

http://localhost:3000/api/classify?name=David

Click Send

You can replace David with any name to test different results.

CORS
All responses include the header:
Access-Control-Allow-Origin: *
This allows the API to be called from any origin, including browser-based grading scripts or frontend clients.
