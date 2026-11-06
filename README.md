# Rembrandts Tattoo System

Web-Based Tattoo Appointment and Project Management System for Rembrandts Tattoo.

## Included
- Customer registration/login (demo frontend)
- Appointment booking
- Admin dashboard
- Approve/reject appointments
- Tattoo project tracking
- Customer records
- Payment records: Cash/GCash, downpayment, balance
- Dashboard summary
- Node.js + Express backend
- MySQL database schema

## Requirements
- Node.js
- MySQL / XAMPP
- VS Code

## 1. Frontend
Open a terminal in `frontend`:
```bash
npm install
npm run dev
```
Open the URL shown by Vite, normally http://localhost:5173/

## 2. Backend
Open another terminal in `backend`:
```bash
npm install
npm run dev
```
Backend normally runs at http://localhost:5000

## 3. MySQL
Import `database/schema.sql` into MySQL/phpMyAdmin.

Default database:
`rembrandts_tattoo`

Then copy `backend/.env.example` to `backend/.env` and update the MySQL username/password if needed.

## Note
The frontend currently uses local state so it can be demonstrated immediately. The backend and SQL schema are included as the next integration layer. This keeps the project simple for a school thesis while leaving a clear path to connect React to the API.
