import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import { db, transaction } from "./db.js";
import { requireRole } from "./middleware/auth.js";
import { csvEscape, isDate, isTime, required, toCsv } from "./utils.js";
import { seedDemoData } from "./seed.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 5000);
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const allowedOrigins = new Set([
  frontendUrl,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://care-sync-hub-frontend.vercel.app"
]);

seedDemoData();

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin) || origin.endsWith(".vercel.app")) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  }
}));
app.use(express.json());
app.use(morgan("dev"));

function doctorDetailsWhere() {
  return `
    SELECT d.id, d.specialization, d.qualification, d.room_number, d.rating,
           u.id AS user_id, u.name, u.email, u.phone
    FROM doctors d
    JOIN users u ON u.id = d.user_id
  `;
}

function validateAppointment(body) {
  const missing = required(body, ["patient_id", "doctor_id", "appointment_date", "start_time", "end_time", "reason"]);
  if (missing) return missing;
  if (!isDate(body.appointment_date)) return "appointment_date must use YYYY-MM-DD.";
  if (!isTime(body.start_time) || !isTime(body.end_time)) return "start_time and end_time must use HH:mm.";
  if (body.end_time <= body.start_time) return "end_time must be after start_time.";
  return null;
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", database: "sqlite" });
});

app.get("/", (_req, res) => {
  res.json({
    name: "CareSync Hub API",
    status: "ok",
    health: "/api/health"
  });
});

app.post("/api/seed-demo", requireRole("admin"), (_req, res) => {
  res.json({ message: "Seed data ready.", counts: seedDemoData() });
});

app.get("/api/users", requireRole("admin", "receptionist", "doctor"), (req, res) => {
  const { role, search } = req.query;
  const conditions = [];
  const params = [];
  if (role) {
    conditions.push("role = ?");
    params.push(role);
  }
  if (search) {
    conditions.push("(name LIKE ? OR email LIKE ? OR phone LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  res.json(db.prepare(`SELECT id, name, email, phone, role, created_at FROM users ${where} ORDER BY name`).all(...params));
});

app.post("/api/users", requireRole("admin", "receptionist"), (req, res) => {
  const missing = required(req.body, ["name", "email", "role"]);
  if (missing) return res.status(400).json({ message: missing });
  if (!["patient", "doctor", "receptionist", "admin"].includes(req.body.role)) {
    return res.status(400).json({ message: "Invalid role." });
  }
  try {
    const result = db.prepare("INSERT INTO users (name, email, phone, role) VALUES (?, ?, ?, ?)")
      .run(req.body.name, req.body.email, req.body.phone || null, req.body.role);
    res.status(201).json(db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid));
  } catch (error) {
    res.status(409).json({ message: "A user with this email already exists." });
  }
});

app.post("/api/doctors", requireRole("admin"), (req, res) => {
  const missing = required(req.body, ["name", "email", "specialization"]);
  if (missing) return res.status(400).json({ message: missing });

  try {
    const doctor = transaction(() => {
      const userId = db.prepare("INSERT INTO users (name, email, phone, role) VALUES (?, ?, ?, 'doctor')")
        .run(req.body.name, req.body.email, req.body.phone || null).lastInsertRowid;
      const doctorId = db.prepare(`
        INSERT INTO doctors (user_id, specialization, qualification, room_number, rating)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, req.body.specialization, req.body.qualification || null, req.body.room_number || null, req.body.rating || 0).lastInsertRowid;
      return db.prepare(`${doctorDetailsWhere()} WHERE d.id = ?`).get(doctorId);
    });
    res.status(201).json(doctor);
  } catch (error) {
    res.status(409).json({ message: "Doctor email already exists." });
  }
});

app.get("/api/doctors", (_req, res) => {
  const doctors = db.prepare(`${doctorDetailsWhere()} ORDER BY u.name`).all();
  const availability = db.prepare("SELECT * FROM availability WHERE doctor_id = ? AND is_active = 1 ORDER BY id");
  res.json(doctors.map((doctor) => ({ ...doctor, availability: availability.all(doctor.id) })));
});

app.post("/api/doctors/:id/availability", requireRole("admin", "doctor"), (req, res) => {
  const missing = required(req.body, ["day_of_week", "start_time", "end_time"]);
  if (missing) return res.status(400).json({ message: missing });
  if (!isTime(req.body.start_time) || !isTime(req.body.end_time) || req.body.end_time <= req.body.start_time) {
    return res.status(400).json({ message: "Availability times must be valid HH:mm values." });
  }
  const doctor = db.prepare("SELECT id FROM doctors WHERE id = ?").get(req.params.id);
  if (!doctor) return res.status(404).json({ message: "Doctor not found." });
  const result = db.prepare(`
    INSERT INTO availability (doctor_id, day_of_week, start_time, end_time, slot_minutes)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, req.body.day_of_week, req.body.start_time, req.body.end_time, req.body.slot_minutes || 30);
  res.status(201).json(db.prepare("SELECT * FROM availability WHERE id = ?").get(result.lastInsertRowid));
});

app.post("/api/appointments", requireRole("patient", "receptionist", "admin"), (req, res) => {
  const validation = validateAppointment(req.body);
  if (validation) return res.status(400).json({ message: validation });

  const patient = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'patient'").get(req.body.patient_id);
  const doctor = db.prepare("SELECT id FROM doctors WHERE id = ?").get(req.body.doctor_id);
  if (!patient) return res.status(400).json({ message: "patient_id must reference a patient user." });
  if (!doctor) return res.status(400).json({ message: "doctor_id must reference a doctor." });

  try {
    const result = db.prepare(`
      INSERT INTO appointments (patient_id, doctor_id, appointment_date, start_time, end_time, reason, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.body.patient_id,
      req.body.doctor_id,
      req.body.appointment_date,
      req.body.start_time,
      req.body.end_time,
      req.body.reason,
      req.body.status || "Pending",
      req.body.notes || null
    );
    res.status(201).json(db.prepare("SELECT * FROM appointments WHERE id = ?").get(result.lastInsertRowid));
  } catch (error) {
    res.status(409).json({ message: "This doctor already has an active appointment at that date and time." });
  }
});

app.get("/api/appointments", requireRole("admin", "receptionist", "doctor", "patient"), (req, res) => {
  const { doctor_id, patient_id, date, status, search } = req.query;
  const conditions = [];
  const params = [];
  if (doctor_id) {
    conditions.push("a.doctor_id = ?");
    params.push(doctor_id);
  }
  if (patient_id) {
    conditions.push("a.patient_id = ?");
    params.push(patient_id);
  }
  if (date) {
    conditions.push("a.appointment_date = ?");
    params.push(date);
  }
  if (status) {
    conditions.push("a.status = ?");
    params.push(status);
  }
  if (search) {
    conditions.push("(patient.name LIKE ? OR doctor_user.name LIKE ? OR a.reason LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  res.json(db.prepare(`
    SELECT a.*, patient.name AS patient_name, patient.email AS patient_email,
           doctor_user.name AS doctor_name, d.specialization
    FROM appointments a
    JOIN users patient ON patient.id = a.patient_id
    JOIN doctors d ON d.id = a.doctor_id
    JOIN users doctor_user ON doctor_user.id = d.user_id
    ${where}
    ORDER BY a.appointment_date DESC, a.start_time DESC
  `).all(...params));
});

app.put("/api/appointments/:id/status", requireRole("admin", "receptionist", "doctor"), (req, res) => {
  const allowed = ["Pending", "Confirmed", "In Progress", "Completed", "Cancelled", "Rescheduled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ message: "Invalid appointment status." });

  const appointment = db.prepare("SELECT * FROM appointments WHERE id = ?").get(req.params.id);
  if (!appointment) return res.status(404).json({ message: "Appointment not found." });

  if (["Completed", "Cancelled"].includes(appointment.status)) {
    return res.status(400).json({ message: "Completed or cancelled appointments cannot be changed." });
  }

  if (req.body.status === "In Progress" && appointment.status !== "Confirmed") {
    return res.status(400).json({ message: "Only confirmed appointments can move to In Progress." });
  }

  if (req.body.status === "Completed" && !["In Progress", "Confirmed"].includes(appointment.status)) {
    return res.status(400).json({ message: "Only confirmed or in-progress appointments can be completed." });
  }

  db.prepare("UPDATE appointments SET status = ?, notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(req.body.status, req.body.notes || null, req.params.id);
  res.json(db.prepare("SELECT * FROM appointments WHERE id = ?").get(req.params.id));
});

app.put("/api/appointments/:id/reschedule", requireRole("admin", "receptionist"), (req, res) => {
  const validation = validateAppointment({ ...req.body, patient_id: 1, doctor_id: 1, reason: "reschedule" });
  if (validation) return res.status(400).json({ message: validation });
  const current = db.prepare("SELECT * FROM appointments WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ message: "Appointment not found." });

  try {
    db.prepare(`
      UPDATE appointments
      SET appointment_date = ?, start_time = ?, end_time = ?, status = 'Rescheduled', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.body.appointment_date, req.body.start_time, req.body.end_time, req.params.id);
    res.json(db.prepare("SELECT * FROM appointments WHERE id = ?").get(req.params.id));
  } catch (error) {
    res.status(409).json({ message: "This doctor already has an active appointment at that date and time." });
  }
});

app.post("/api/medical-records", requireRole("doctor", "admin"), (req, res) => {
  const missing = required(req.body, ["patient_id", "doctor_id", "diagnosis", "visit_date"]);
  if (missing) return res.status(400).json({ message: missing });
  if (!isDate(req.body.visit_date)) return res.status(400).json({ message: "visit_date must use YYYY-MM-DD." });

  const record = transaction(() => {
    const recordId = db.prepare(`
      INSERT INTO medical_records (patient_id, doctor_id, appointment_id, diagnosis, symptoms, treatment, visit_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.body.patient_id,
      req.body.doctor_id,
      req.body.appointment_id || null,
      req.body.diagnosis,
      req.body.symptoms || null,
      req.body.treatment || null,
      req.body.visit_date
    ).lastInsertRowid;

    const insertPrescription = db.prepare(`
      INSERT INTO prescriptions (medical_record_id, medicine, dosage, instructions, duration_days)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const item of req.body.prescriptions || []) {
      if (item.medicine && item.dosage) {
        insertPrescription.run(recordId, item.medicine, item.dosage, item.instructions || null, item.duration_days || null);
      }
    }
    return db.prepare("SELECT * FROM medical_records WHERE id = ?").get(recordId);
  });

  res.status(201).json(record);
});

app.get("/api/patients/:id/history", requireRole("admin", "receptionist", "doctor", "patient"), (req, res) => {
  const patient = db.prepare("SELECT id, name, email, phone FROM users WHERE id = ? AND role = 'patient'").get(req.params.id);
  if (!patient) return res.status(404).json({ message: "Patient not found." });
  const records = db.prepare(`
    SELECT mr.*, doctor_user.name AS doctor_name, d.specialization
    FROM medical_records mr
    JOIN doctors d ON d.id = mr.doctor_id
    JOIN users doctor_user ON doctor_user.id = d.user_id
    WHERE mr.patient_id = ?
    ORDER BY mr.visit_date DESC
  `).all(req.params.id);
  const prescriptionStmt = db.prepare("SELECT * FROM prescriptions WHERE medical_record_id = ?");
  res.json({ patient, records: records.map((record) => ({ ...record, prescriptions: prescriptionStmt.all(record.id) })) });
});

app.get("/api/dashboard/summary", requireRole("admin", "receptionist", "doctor"), (_req, res) => {
  const summary = {
    totalAppointments: db.prepare("SELECT COUNT(*) AS count FROM appointments").get().count,
    activePatients: db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'patient'").get().count,
    completedConsultations: db.prepare("SELECT COUNT(*) AS count FROM appointments WHERE status = 'Completed'").get().count,
    pendingAppointments: db.prepare("SELECT COUNT(*) AS count FROM appointments WHERE status IN ('Pending', 'Confirmed', 'In Progress')").get().count,
    doctorWorkload: db.prepare(`
      SELECT d.id AS doctor_id, u.name AS doctor_name, d.specialization,
             COUNT(a.id) AS appointment_count,
             SUM(CASE WHEN a.status = 'Completed' THEN 1 ELSE 0 END) AS completed_count
      FROM doctors d
      JOIN users u ON u.id = d.user_id
      LEFT JOIN appointments a ON a.doctor_id = d.id
      GROUP BY d.id
      ORDER BY appointment_count DESC
    `).all()
  };
  res.json(summary);
});

app.get("/api/reports/appointments", requireRole("admin", "receptionist"), (req, res) => {
  req.query.status;
  const rows = db.prepare(`
    SELECT a.id, a.appointment_date, a.start_time, a.end_time, a.status,
           patient.name AS patient, doctor_user.name AS doctor, d.specialization, a.reason
    FROM appointments a
    JOIN users patient ON patient.id = a.patient_id
    JOIN doctors d ON d.id = a.doctor_id
    JOIN users doctor_user ON doctor_user.id = d.user_id
    ORDER BY a.appointment_date DESC, a.start_time DESC
  `).all();
  res.header("Content-Type", "text/csv");
  res.attachment("appointment-report.csv");
  res.send(rows.length ? toCsv(rows) : ["id", "appointment_date", "start_time", "end_time", "status", "patient", "doctor", "specialization", "reason"].map(csvEscape).join(","));
});

app.get("/api/reports/consultations", requireRole("admin", "doctor"), (_req, res) => {
  const rows = db.prepare(`
    SELECT mr.id, mr.visit_date, patient.name AS patient, doctor_user.name AS doctor,
           d.specialization, mr.diagnosis, mr.symptoms, mr.treatment
    FROM medical_records mr
    JOIN users patient ON patient.id = mr.patient_id
    JOIN doctors d ON d.id = mr.doctor_id
    JOIN users doctor_user ON doctor_user.id = d.user_id
    ORDER BY mr.visit_date DESC
  `).all();
  res.header("Content-Type", "text/csv");
  res.attachment("consultation-report.csv");
  res.send(rows.length ? toCsv(rows) : ["id", "visit_date", "patient", "doctor", "specialization", "diagnosis", "symptoms", "treatment"].map(csvEscape).join(","));
});

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` });
});

app.listen(port, () => {
  console.log(`CareSync Hub API running on http://localhost:${port}`);
});
