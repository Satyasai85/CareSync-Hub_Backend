# CareSync Hub Backend

Node.js + Express + SQLite API for the Hospital Appointment & Patient Management System.

## Setup

```bash
npm install
copy .env.example .env
npm run seed
npm run dev
```

Default API URL: `http://localhost:5000`

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | Express server port |
| `DATABASE_FILE` | SQLite database file path |
| `FRONTEND_URL` | Allowed CORS origin |

## Demo Roles

The API uses a simple `x-user-role` header for role-based access control.

Use one of: `admin`, `receptionist`, `doctor`, `patient`.

Seed users:

| Role | Email |
| --- | --- |
| Admin | `admin@caresync.test` |
| Receptionist | `reception@caresync.test` |
| Doctor | `neha.rao@caresync.test` |
| Patient | `aarav@caresync.test` |

## API Summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/doctors` | Create doctor profile |
| `GET` | `/api/doctors` | List doctors with availability |
| `POST` | `/api/doctors/:id/availability` | Add doctor availability |
| `POST` | `/api/appointments` | Create appointment |
| `GET` | `/api/appointments` | Fetch/search/filter appointments |
| `PUT` | `/api/appointments/:id/status` | Update appointment status |
| `PUT` | `/api/appointments/:id/reschedule` | Reschedule appointment |
| `POST` | `/api/medical-records` | Add consultation history and prescriptions |
| `GET` | `/api/patients/:id/history` | Get patient medical history |
| `GET` | `/api/dashboard/summary` | Hospital analytics summary |
| `GET` | `/api/reports/appointments` | Download appointment CSV report |
| `GET` | `/api/reports/consultations` | Download consultation CSV report |

## Validation And Business Rules

- Required fields are validated on every write endpoint.
- SQLite is initialized automatically from `src/schema.sql`.
- A partial unique index prevents active duplicate appointments for the same doctor, date, and start time.
- Appointment status flow prevents changing completed/cancelled appointments and restricts `In Progress`/`Completed` transitions.
- RBAC is enforced through `x-user-role`.
