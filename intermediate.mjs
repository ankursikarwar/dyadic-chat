import express from 'express';
import path from 'path';
import fs from 'fs';

const __dirname = path.resolve();
const app = express();
const PORT = process.env.PORT || 3001;

// Load URLs configuration
let urls;
try {
  urls = JSON.parse(fs.readFileSync(path.join(__dirname, 'urls.json'), 'utf8'));
} catch (e) {
  console.error('[Intermediate] Failed to load urls.json, using defaults');
  urls = {
    mainWebsite: 'http://localhost:3000',
    intermediateWebsite: 'http://localhost:3001'
  };
}

// Storage file for tracking generated numbers
const STORAGE_FILE = path.join(__dirname, 'intermediate_storage.json');

// Initialize storage if it doesn't exist
function initStorage() {
  if (!fs.existsSync(STORAGE_FILE)) {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify({ usedNumbers: [] }, null, 2));
  }
}

// Load storage
function loadStorage() {
  try {
    const data = fs.readFileSync(STORAGE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error('[Intermediate] Failed to load storage, initializing new storage');
    return { usedNumbers: [] };
  }
}

// Save storage
function saveStorage(storage) {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2));
  } catch (e) {
    console.error('[Intermediate] Failed to save storage:', e);
  }
}

// Generate a unique random number
function generateUniqueNumber() {
  const storage = loadStorage();
  let randomNum;
  let attempts = 0;
  const maxAttempts = 1000;

  do {
    // Generate a random 6-digit number
    randomNum = Math.floor(100000 + Math.random() * 900000);
    attempts++;
    if (attempts > maxAttempts) {
      throw new Error('Failed to generate unique number after many attempts');
    }
  } while (storage.usedNumbers.includes(randomNum));

  storage.usedNumbers.push(randomNum);
  saveStorage(storage);

  return randomNum;
}

// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files (if needed in the future)
app.use(express.static(path.join(__dirname, 'public_intermediate')));

// Route 1: Generate random number and redirect to main website
// Expected: http://localhost:3001/
app.get('/', (req, res) => {
  // Generate unique random number
  const randomNum = generateUniqueNumber();

  console.log(`[Intermediate] Generated PID ${randomNum}`);

  // Redirect to main website with PID
  const mainUrl = `${urls.mainWebsite}?PID=${randomNum}`;
  console.log(`[Intermediate] Redirecting to: ${mainUrl}`);
  res.redirect(mainUrl);
});

// Route 2: Code display page (redirected from main website after completion)
// Expected: http://localhost:3001/code?PID=<random_number>
app.get('/code', (req, res) => {
  const pid = req.query.PID;

  if (!pid) {
    return res.status(400).send(`
      <html>
        <head><title>Error</title></head>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h1>Error</h1>
          <p>Missing PID parameter.</p>
        </body>
      </html>
    `);
  }

  // Verify that this PID was generated (exists in usedNumbers)
  const storage = loadStorage();
  if (!storage.usedNumbers.includes(parseInt(pid))) {
    return res.status(404).send(`
      <html>
        <head><title>Error</title></head>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h1>Error</h1>
          <p>PID not found. Please contact support.</p>
        </body>
      </html>
    `);
  }

  // Send HTML page with code
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Survey Code</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #f5f5f5;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 500px;
            width: 90%;
          }
          h1 {
            color: #333;
            margin-bottom: 30px;
          }
          .code-display {
            font-size: 32px;
            font-weight: bold;
            color: #0066cc;
            background: #f0f7ff;
            padding: 20px;
            border-radius: 8px;
            margin: 30px 0;
            letter-spacing: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Your code is ${pid}</h1>
          <div class="code-display">${pid}</div>
        </div>
      </body>
    </html>
  `);
});

// Start server
initStorage();
app.listen(PORT, () => {
  console.log(`[Intermediate] Server running on port ${PORT}`);
  console.log(`[Intermediate] Main website: ${urls.mainWebsite}`);
  console.log(`[Intermediate] Intermediate website: ${urls.intermediateWebsite}`);
});

