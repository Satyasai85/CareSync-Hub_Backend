# CareSync Hub Backend

Node.js, Express, and SQLite API for the Hospital Appointment & Patient Management System.

## Live Links

- Backend API: `https://caresync-hub-backend.onrender.com`
- Frontend app: `https://care-sync-hub-frontend.vercel.app`
- GitHub repository: `https://github.com/Satyasai85/CareSync-Hub_Backend`

## Setup

```bash
npm install
copy .env.example .env
npm run seed
npm run dev
```

Default local API URL: `http://localhost:5000`

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | Express server port |
| `DATABASE_FILE` | SQLite database file path |
| `FRONTEND_URL` | Allowed production CORS origin |
| `DEMO_PASSWORD` | Password accepted by seeded demo logins |

## Demo Login

The app includes a demo login endpoint and continues to enforce role-based APIs through the `x-user-role` header.

Password for every seeded account: `demo123`

| Role | Email |
| --- | --- |
| Admin | `admin@caresync.test` |
| Receptionist | `reception@caresync.test` |
| Doctor | `neha.rao@caresync.test` |
| Patient | `aarav@caresync.test` |

## API Summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/login` | Demo login by email and password |
| `GET` | `/api/users?role=patient` | List users and patient profile fields |
| `POST` | `/api/users` | Register patients and create staff users |
| `POST` | `/api/doctors` | Create doctor profile |
| `GET` | `/api/doctors` | List doctors with deduplicated availability |
| `POST` | `/api/doctors/:id/availability` | Add doctor availability |
| `POST` | `/api/appointments` | Create appointment |
| `GET` | `/api/appointments` | Search/filter appointments by doctor, patient, date, status, or text |
| `PUT` | `/api/appointments/:id/status` | Update consultation/booking status |
| `PUT` | `/api/appointments/:id/reschedule` | Reschedule appointment |
| `POST` | `/api/medical-records` | Add diagnosis, visit history, and prescriptions |
| `GET` | `/api/patients/:id/history` | Get patient profile and medical history |
| `GET` | `/api/dashboard/summary` | Appointment, patient, consultation, and workload metrics |
| `GET` | `/api/reports/appointments` | Download appointment CSV report |
| `GET` | `/api/reports/consultations` | Download consultation CSV report |

## Database Design

SQLite is initialized automatically from `src/schema.sql`.

- `users`: shared identity table for patients, doctors, receptionists, and admins.
- `patient_profiles`: patient demographics, emergency contact, and allergy details.
- `doctors`: doctor profile linked to a `users` row.
- `availability`: active doctor working slots and consultation timings.
- `appointments`: booking records with status workflow and audit timestamps.
- `medical_records`: patient visit history, diagnosis, symptoms, and treatment.
- `prescriptions`: medicines linked to a medical record.

## Validation And Rules

- Required fields, date format, time format, and patient age are validated.
- Appointment end time must be after start time.
- New appointments must be inside the doctor's active availability.
- Overlapping active appointments for the same doctor are rejected.
- Receptionists/admins can confirm, reschedule, or cancel bookings.
- Doctors/admins can create consultation records; linked appointments are marked completed.
- Completed or cancelled appointments cannot be changed or rescheduled.

## Deployment

`render.yaml` is included for Render deployment with persistent SQLite disk storage.
