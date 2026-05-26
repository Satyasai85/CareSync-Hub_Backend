import { fileURLToPath } from "node:url";
import { db, transaction } from "./db.js";

function insertUser(name, email, role, phone) {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return existing.id;
  return db.prepare("INSERT INTO users (name, email, role, phone) VALUES (?, ?, ?, ?)")
    .run(name, email, role, phone).lastInsertRowid;
}

function upsertPatientProfile(userId, profile) {
  db.prepare(`
    INSERT INTO patient_profiles (user_id, age, gender, blood_group, address, emergency_contact, allergies)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      age = excluded.age,
      gender = excluded.gender,
      blood_group = excluded.blood_group,
      address = excluded.address,
      emergency_contact = excluded.emergency_contact,
      allergies = excluded.allergies
  `).run(
    userId,
    profile.age,
    profile.gender,
    profile.blood_group,
    profile.address,
    profile.emergency_contact,
    profile.allergies
  );
}

function insertAvailability(doctorId, day, startTime, endTime, slotMinutes) {
  const existing = db.prepare(`
    SELECT id FROM availability
    WHERE doctor_id = ? AND day_of_week = ? AND start_time = ? AND end_time = ? AND is_active = 1
  `).get(doctorId, day, startTime, endTime);
  if (existing) return existing.id;
  return db.prepare(`
    INSERT INTO availability (doctor_id, day_of_week, start_time, end_time, slot_minutes)
    VALUES (?, ?, ?, ?, ?)
  `).run(doctorId, day, startTime, endTime, slotMinutes).lastInsertRowid;
}

function insertAppointment(patientId, doctorId, date, startTime, endTime, reason, status, notes) {
  const existing = db.prepare(`
    SELECT id FROM appointments
    WHERE patient_id = ? AND doctor_id = ? AND appointment_date = ? AND start_time = ?
  `).get(patientId, doctorId, date, startTime);
  if (existing) return existing.id;
  return db.prepare(`
    INSERT INTO appointments
    (patient_id, doctor_id, appointment_date, start_time, end_time, reason, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(patientId, doctorId, date, startTime, endTime, reason, status, notes).lastInsertRowid;
}

function insertMedicalRecord(patientId, doctorId, appointmentId, diagnosis, symptoms, treatment, visitDate, prescriptions = []) {
  const existing = db.prepare(`
    SELECT id FROM medical_records
    WHERE patient_id = ? AND doctor_id = ? AND visit_date = ? AND diagnosis = ?
  `).get(patientId, doctorId, visitDate, diagnosis);
  const recordId = existing?.id || db.prepare(`
    INSERT INTO medical_records
    (patient_id, doctor_id, appointment_id, diagnosis, symptoms, treatment, visit_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(patientId, doctorId, appointmentId, diagnosis, symptoms, treatment, visitDate).lastInsertRowid;

  const insertPrescription = db.prepare(`
    INSERT INTO prescriptions (medical_record_id, medicine, dosage, instructions, duration_days)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const item of prescriptions) {
    const alreadySaved = db.prepare(`
      SELECT id FROM prescriptions
      WHERE medical_record_id = ? AND medicine = ? AND dosage = ?
    `).get(recordId, item.medicine, item.dosage);
    if (!alreadySaved) {
      insertPrescription.run(recordId, item.medicine, item.dosage, item.instructions, item.duration_days);
    }
  }

  return recordId;
}

export function seedDemoData() {
  transaction(() => {
    const admin = insertUser("Hospital Admin", "admin@caresync.test", "admin", "9000000001");
    const receptionist = insertUser("Riya Reception", "reception@caresync.test", "receptionist", "9000000002");
    const patientA = insertUser("Aarav Sharma", "aarav@caresync.test", "patient", "9000000003");
    const patientB = insertUser("Meera Nair", "meera@caresync.test", "patient", "9000000004");
    const patientC = insertUser("Kabir Menon", "kabir@caresync.test", "patient", "9000000007");
    const doctorUserA = insertUser("Dr. Neha Rao", "neha.rao@caresync.test", "doctor", "9000000005");
    const doctorUserB = insertUser("Dr. Vikram Iyer", "vikram.iyer@caresync.test", "doctor", "9000000006");

    upsertPatientProfile(patientA, {
      age: 42,
      gender: "Male",
      blood_group: "B+",
      address: "Indiranagar, Bengaluru",
      emergency_contact: "9000000013",
      allergies: "Penicillin"
    });
    upsertPatientProfile(patientB, {
      age: 35,
      gender: "Female",
      blood_group: "O+",
      address: "Kakkanad, Kochi",
      emergency_contact: "9000000014",
      allergies: "None"
    });
    upsertPatientProfile(patientC, {
      age: 28,
      gender: "Male",
      blood_group: "A-",
      address: "Anna Nagar, Chennai",
      emergency_contact: "9000000015",
      allergies: "Dust allergy"
    });

    const doctorStmt = db.prepare(`
      INSERT OR IGNORE INTO doctors (user_id, specialization, qualification, room_number, rating)
      VALUES (?, ?, ?, ?, ?)
    `);
    doctorStmt.run(doctorUserA, "Cardiology", "MD Cardiology", "A-101", 4.7);
    doctorStmt.run(doctorUserB, "Orthopedics", "MS Orthopedics", "B-204", 4.5);

    const doctorA = db.prepare("SELECT id FROM doctors WHERE user_id = ?").get(doctorUserA).id;
    const doctorB = db.prepare("SELECT id FROM doctors WHERE user_id = ?").get(doctorUserB).id;

    ["Monday", "Wednesday", "Friday"].forEach((day) => insertAvailability(doctorA, day, "09:00", "13:00", 30));
    ["Tuesday", "Thursday", "Saturday"].forEach((day) => insertAvailability(doctorB, day, "10:00", "14:00", 30));

    const appointmentA = insertAppointment(
      patientA,
      doctorA,
      "2026-05-27",
      "09:00",
      "09:30",
      "Chest discomfort review",
      "Confirmed",
      "Bring previous ECG report"
    );
    insertAppointment(patientC, doctorB, "2026-05-28", "10:30", "11:00", "Shoulder stiffness", "Pending", "First visit");

    insertMedicalRecord(
      patientB,
      doctorB,
      null,
      "Knee strain",
      "Pain after running",
      "Rest, ice pack, physiotherapy review",
      "2026-05-20",
      [{ medicine: "Ibuprofen", dosage: "400mg", instructions: "After food if pain persists", duration_days: 3 }]
    );
    insertMedicalRecord(
      patientA,
      doctorA,
      appointmentA,
      "Stable angina follow-up",
      "Mild chest tightness during exertion",
      "ECG review, lifestyle changes, repeat lipid profile",
      "2026-05-21",
      [{ medicine: "Aspirin", dosage: "75mg", instructions: "Once daily after dinner", duration_days: 30 }]
    );

    void admin;
    void receptionist;
  });

  return {
    users: db.prepare("SELECT COUNT(*) AS count FROM users").get().count,
    doctors: db.prepare("SELECT COUNT(*) AS count FROM doctors").get().count,
    appointments: db.prepare("SELECT COUNT(*) AS count FROM appointments").get().count,
    medicalRecords: db.prepare("SELECT COUNT(*) AS count FROM medical_records").get().count
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDemoData();
  console.log("Seed data ready.");
}
