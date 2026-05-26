import { db, transaction } from "./db.js";

function insertUser(name, email, role, phone) {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return existing.id;
  return db.prepare("INSERT INTO users (name, email, role, phone) VALUES (?, ?, ?, ?)").run(name, email, role, phone).lastInsertRowid;
}

transaction(() => {
  const admin = insertUser("Hospital Admin", "admin@caresync.test", "admin", "9000000001");
  const receptionist = insertUser("Riya Reception", "reception@caresync.test", "receptionist", "9000000002");
  const patientA = insertUser("Aarav Sharma", "aarav@caresync.test", "patient", "9000000003");
  const patientB = insertUser("Meera Nair", "meera@caresync.test", "patient", "9000000004");
  const doctorUserA = insertUser("Dr. Neha Rao", "neha.rao@caresync.test", "doctor", "9000000005");
  const doctorUserB = insertUser("Dr. Vikram Iyer", "vikram.iyer@caresync.test", "doctor", "9000000006");

  const doctorStmt = db.prepare(`
    INSERT OR IGNORE INTO doctors (user_id, specialization, qualification, room_number, rating)
    VALUES (?, ?, ?, ?, ?)
  `);
  doctorStmt.run(doctorUserA, "Cardiology", "MD Cardiology", "A-101", 4.7);
  doctorStmt.run(doctorUserB, "Orthopedics", "MS Orthopedics", "B-204", 4.5);

  const doctorA = db.prepare("SELECT id FROM doctors WHERE user_id = ?").get(doctorUserA).id;
  const doctorB = db.prepare("SELECT id FROM doctors WHERE user_id = ?").get(doctorUserB).id;

  const availabilityStmt = db.prepare(`
    INSERT OR IGNORE INTO availability (doctor_id, day_of_week, start_time, end_time, slot_minutes)
    VALUES (?, ?, ?, ?, ?)
  `);
  ["Monday", "Wednesday", "Friday"].forEach((day) => availabilityStmt.run(doctorA, day, "09:00", "13:00", 30));
  ["Tuesday", "Thursday", "Saturday"].forEach((day) => availabilityStmt.run(doctorB, day, "10:00", "14:00", 30));

  db.prepare(`
    INSERT OR IGNORE INTO appointments
    (patient_id, doctor_id, appointment_date, start_time, end_time, reason, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(patientA, doctorA, "2026-05-27", "09:00", "09:30", "Chest discomfort review", "Confirmed", "Bring previous ECG report");

  db.prepare(`
    INSERT OR IGNORE INTO medical_records
    (patient_id, doctor_id, appointment_id, diagnosis, symptoms, treatment, visit_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(patientB, doctorB, null, "Knee strain", "Pain after running", "Rest, ice pack, physiotherapy review", "2026-05-20");

  void admin;
  void receptionist;
});

console.log("Seed data ready.");
