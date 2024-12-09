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

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes

// Health Check
app.get("/", (req, res) => {
  res.status(200).send("API is working!");
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
