# MS Mobile Solutions — QC & Customer Management Website

A mobile- and desktop-friendly online QC receiving form with a server-side SQLite database, multiple staff logins, customer search/edit, repair status, and A4 PDF export.

## Included
- Admin and staff accounts (passwords stored as bcrypt hashes)
- Admin can create/disable users and can delete records
- Staff can create, view, search, and edit QC records
- Reusable customer QC form with physical checks and all parts tests
- Automatic balance calculation
- Browser-based A4 PDF export (`Save & Export A4 PDF` → choose “Save as PDF” in print dialog)
- Search by customer name, mobile number, serial number, or IMEI

## Run locally
1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Set a long random `SESSION_SECRET` and a strong `ADMIN_PASSWORD`.
4. Install and start:
   ```bash
   npm install
   npm start
   ```
5. Open `http://localhost:3000`.

Default initial admin username is `admin`; the password is whatever you set as `ADMIN_PASSWORD` in `.env`. Change it before putting the site online. The initial admin is created only when the database has no admin user.

## Deploy online (Render + persistent disk)
This app needs a persistent disk because it uses SQLite. Do not deploy it to an ephemeral filesystem.

1. Create a private Git repository and upload this project.
2. In Render, create a **Web Service** from the repository.
3. Set:
   - Build command: `npm install`
   - Start command: `npm start`
   - Node version: 20+
4. Add a persistent disk mounted at `/var/data` (at least 1 GB).
5. Add environment variables:
   - `NODE_ENV=production`
   - `DB_PATH=/var/data/ms-mobile-qc.sqlite`
   - `SESSION_SECRET` = a long random secret (32+ characters)
   - `ADMIN_USERNAME` = your chosen admin username
   - `ADMIN_PASSWORD` = a strong initial password
   - `ADMIN_NAME` = your name / shop admin name
6. Deploy and open the HTTPS URL provided by Render.
7. Sign in as admin, create individual staff logins under **Staff & Access**, and keep the initial admin password private. Set a strong unique password before deployment; never use the example password.

## Important security and backup notes
- Use HTTPS in production (Render provides it).
- Never share one login between multiple people. Create a separate account for each staff member.
- Use strong unique passwords and disable accounts when staff leave.
- Back up `/var/data/ms-mobile-qc.sqlite` regularly. The SQLite database contains customer phone numbers and device identifiers; restrict access and protect backups.
- The app is a starter system. Before storing large volumes of sensitive customer data, arrange a professional security review, automated off-site backups, and a tested restore procedure.
- For a production multi-instance deployment, migrate SQLite to managed PostgreSQL and use a shared session store.
