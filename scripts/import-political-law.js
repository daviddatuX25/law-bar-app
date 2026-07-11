const fs = require('fs');
const path = require('path');
const http = require('http');

const subjectId = 'political-law';
const mdPath = path.join(__dirname, '..', 'pipeline', 'political-law-shapes-triggers-flashcards.md');
const markdown = fs.readFileSync(mdPath, 'utf8');

const postData = JSON.stringify({ subjectId, markdown });

const options = {
  hostname: 'localhost',
  port: 3005,
  path: '/api/import',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('RESPONSE:', JSON.parse(body));
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(postData);
req.end();
