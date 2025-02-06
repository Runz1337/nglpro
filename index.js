const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
 // require node-fetch for API calls

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory "database"
let pagesDB = {};
let nextId = 1;

// Set up EJS view engine and static folder
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(bodyParser.urlencoded({ extended: true }));

// Default redirect: redirect "/" to "/create"
app.get('/', (req, res) => {
  res.send('notgonnalie');
});

// GET /create - display dashboard form and list of created pages
app.get('/createx', (req, res) => {
  res.render('create', { pages: pagesDB });
});

// POST /create - create a new page entry
app.post('/createx', (req, res) => {
  const { nglUrl, name } = req.body;
  if (!nglUrl || !name) {
    return res.status(400).send("Both NGL URL and NAME are required.");
  }
  // Create a new entry in the "database"
  pagesDB[name] = {
    id: nextId++,
    ngl: nglUrl,
    name: name,
    history: []  // tracking details will be stored here
  };
  res.redirect('/createx');
});

// POST /delete - delete a page entry (delete by name)
app.post('/delete', (req, res) => {
  const { name } = req.body;
  if (pagesDB[name]) {
    delete pagesDB[name];
  }
  res.redirect('/createx');
});

const UAParser = require('ua-parser-js');
function parseUserAgent(userAgent) {
  
  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  // Extract additional details
  const deviceDetails = {
      device_type: result.device?.type || "Unknown",  // Device type (e.g., mobile, tablet, desktop)
      brand: result.device?.vendor || "Unknown",     // Device brand (e.g., vivo, Samsung, etc.)
      model: result.device?.model || "Unknown",      // Device model (e.g., V2334, Galaxy S20, etc.)
      screen_resolution: "Unknown",                // Screen resolution (can be fetched from device)

      // Additional details from user-agent parsing
      browser: result.browser?.name || "Unknown",    // Browser name (e.g., Chrome, Firefox)
      browser_version: result.browser?.version || "Unknown",  // Browser version (e.g., 116.0.0.0)
      os: result.os?.name || "Unknown",              // Operating system (e.g., Android, Windows)
      os_version: result.os?.version || "Unknown",   // Operating system version (e.g., 14, 10)
      platform: result.platform?.name || "Unknown",  // Platform (e.g., Android, Windows, Desktop)
      engine: result.engine?.name || "Unknown", 
      raw: userAgent ,// Rendering engine (e.g., WebKit, Gecko)
  };

  return deviceDetails;
}

// GET /:name - tracking endpoint: enrich data, store, then redirect.
app.get('/:name', async (req, res, next) => {
  const pageName = req.params.name;
  // Skip if the URL ends with "/results" or is "create"
  if (pageName === 'createx' || req.path.endsWith('/results')) {
    return next();
  }
  const page = pagesDB[pageName];
  if (!page) {
    return res.status(404).send("Page not found");
  }

  // Extract the client's IP (using x-forwarded-for header if available)
  let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  // If multiple IPs are present, use the first one
  ip = ip.split(',')[0].trim();

  // Prepare the basic tracking details
  const now = new Date().toISOString();
  const formattedTimestamp = now.toLocaleString('en-IN', {
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit', 
    hour12: true
  });
  const parsedDevice = parseUserAgent(req.headers['user-agent']);
  const details = {
    timestamp: formattedTimestamp,
    ip_addresses: [ip],
    user_agent: {
      raw: req.headers['user-agent'] || 'Unknown',
      // You might use a library to parse these details properly:
      browser: "Chrome",          // sample data
      browser_version: "116.0.0.0", // sample data
      operating_system: "Windows 10", // sample data
      engine: "AppleWebKit",
      platform: "Desktop"
    },
    http_headers: {
      Host: req.headers.host,
      "User-Agent": req.headers['user-agent'],
      Accept: req.headers['accept'],
      "Accept-Encoding": req.headers['accept-encoding'],
      "Accept-Language": req.headers['accept-language'],
      "X-Forwarded-For": req.headers['x-forwarded-for'],
      "X-Forwarded-Proto": req.headers['x-forwarded-proto']
    },
    device_details: parsedDevice,
    location: {}  // will be populated below
  };

  // Fetch real location details from a GeoIP service
  try {
    // Use ipapi.co for free IP lookup. You can choose another provider if needed.
    const response = await fetch(`https://ipapi.co/${ip}/json/`);
    const data = await response.json();

    details.location = {
      ip: data.ip,
      country: data.country_name || "Unknown",
      region: data.region || "Unknown",
      city: data.city || "Unknown",
      postal: data.postal || "Unknown",
      latitude: data.latitude || "Unknown",
      longitude: data.longitude || "Unknown",
      timezone: data.timezone || "Unknown",
      organization: data.org || "Unknown"
    };
  } catch (error) {
    console.error("Error fetching GeoIP details:", error);
    details.location = {
      error: "Unable to fetch location details"
    };
  }

  // Save the tracking details to the page's history
  page.history.push(details);

  // Redirect to the configured NGL URL
  res.redirect(page.ngl);
});

// GET /:name/results - display the tracking history for this page.
app.get('/:name/results', (req, res) => {
  const pageName = req.params.name;
  const page = pagesDB[pageName];
  if (!page) {
    return res.status(404).send("Page not found");
  }
  res.render('results', { page });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
