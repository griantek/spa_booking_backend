const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;


// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Appointment Schema and Model
const appointmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, unique: true, required: true },
  service: { type: String, required: true },
  time: { type: String, required: true },
  date: { type: String, required: true },
  notes: String,
});
const Appointment = mongoose.model("Appointment", appointmentSchema);

// Reminder Schema and Model
const reminderSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true }, // Reference to Appointment
  alertTime: { type: Date, required: true }, // Alert time
  status: { type: String, default: 'pending' } // Status of the reminder (e.g., pending, sent)
});

const Reminder = mongoose.model("Reminder", reminderSchema);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes

// Health Check
app.get("/", (req, res) => {
  res.status(200).send("API is working!");
});



// Helper function to generate an 8-character random alphanumeric token
function generateSimpleToken() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 8; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// In-memory storage for tokens (key-value store: token -> phone)
const tokenStore = {};  

// Updated /generate-token
app.get("/generate-token", (req, res) => {
  const { phone, name } = req.query;
  if (!phone || !name) {
    return res.status(400).json({ error: "Phone and Name are required" });
  }

  try {
    const token = generateSimpleToken(); // Generate a token
    tokenStore[token] = { phone, name }; // Store token with both phone and name
    res.json({ token });
  } catch (error) {
    console.error("Error generating token:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Updated /validate-token
app.get("/validate-token", (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Token is required" });

  try {
    const data = tokenStore[token]; // Retrieve phone and name using token
    if (!data) throw new Error("Token not found");
    res.json(data); // Respond with phone and name
  } catch (error) {
    console.error("Invalid token:", error);
    res.status(401).json({ error: "Invalid or expired token" });
  }
});


// Check if a phone number exists
app.get("/check-phone/:phone", async (req, res, next) => {
  try {
    const appointment = await Appointment.findOne({ phone: req.params.phone });
    if (appointment) {
      res.json({ exists: true, appointment });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    next(error); // Pass the error to centralized error handler
  }
});

// Submit or update a booking
app.post("/submit-booking", async (req, res, next) => {
  const { name, phone, service, time, date, notes } = req.body;

  if (!name || !phone || !service || !time || !date) {
    return res.status(400).json({ error: "All fields are required!" });
  }

  try {
    const appointment = await Appointment.findOneAndUpdate(
      { phone },
      { name, phone, service, time, date, notes },
      { upsert: true, new: true }
    );
    res.json({ message: "Appointment saved successfully!", appointment });

    const appointmentDateTime = new Date(`${date}T${time}`);
    console.log(appointmentDateTime)
    const alertTime = new Date(appointmentDateTime.getTime() - 60 * 60 * 1000);
    console.log(alertTime)

    await Reminder.create({
      appointmentId: appointment._id,
      alertTime:alertTime,
    });

  } catch (error) {
    next(error);
  }
});

// Modify an existing appointment
app.post("/modify-appointment", async (req, res, next) => {
  const { phone, name, service, time, date, notes } = req.body;

  try {
    const appointment = await Appointment.findOneAndUpdate(
      { phone },
      { name, service, time, date, notes },
      { new: true }
    );
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found!" });
    }
    res.json({ message: "Appointment updated successfully!", appointment });

    const appointmentDateTime = new Date(`${date}T${time}`);
    console.log(appointmentDateTime)
    const alertTime = new Date(appointmentDateTime.getTime() - 60 * 60 * 1000);
    console.log(alertTime)

    await Reminder.findOneAndUpdate(
      { appointmentId: appointment._id },
      { alertTime:alertTime, status: 'pending' },
      { new: true }
      
    );

  } catch (error) {
    next(error);
  }
});

// Cancel an appointment
app.post("/cancel-appointment", async (req, res, next) => {
  const { phone } = req.body;

  try {
    const result = await Appointment.findOneAndDelete({ phone });
    if (!result) {
      return res.status(404).json({ error: "Appointment not found!" });
    }
    await Reminder.deleteOne({ appointmentId: result._id });
    res.json({ message: "Appointment canceled successfully!" });
  } catch (error) {
    next(error);
  }
});

app.get("/appointment/:phone", async (req, res, next) => {
  const phone = req.params.phone;

  try {
    const appointment = await Appointment.findOne({ phone });
    if (appointment) {
      res.status(200).json(appointment); // Return the appointment details
    } else {
      res.status(404).json({ error: "Appointment not found!" }); // Handle not found
    }
  } catch (error) {
    next(error); // Pass the error to centralized error handler
  }
});

app.get("/confirmation", async (req, res) => {
  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ error: "Phone number is required!" });
  }
  try {
    const appointment = await Appointment.findOne({ phone });
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found!" });
    }
    res.json(appointment);
  } catch (error) {
    console.error("Error fetching appointment:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  console.error("Error occurred:", err.message);
  res.status(500).json({ error: "Internal Server Error" });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});