// cPanel / Phusion Passenger entry point.
//
// cPanel's "Setup Node.js App" defaults the Application Startup File to `app.js`.
// This file simply boots the real server in src/server.js (which calls app.listen
// on process.env.PORT — Passenger sets that for you). See docs/DEPLOYMENT.md.
import './src/server.js';
