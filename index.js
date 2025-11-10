import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import admin from "firebase-admin";
import fs from "fs";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin
const serviceAccount = JSON.parse(fs.readFileSync("./firebase-admin-key.json", "utf8"));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Firebase Token Verification Middleware
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access - No token" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.userEmail = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "Invalid or expired token" });
  }
};

// MongoDB setup
const uri = process.env.MONGO_URI || "mongodb+srv://assigment-ten:rGpocyaWmpBdTy5Z@cluster0.5q9kkgs.mongodb.net/?appName=Cluster0";const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  }
});

// Main route
app.get("/", (req, res) => {
  res.send("✅ Habit Hub Server is running successfully!");
});

async function run() {
  try {
    await client.connect();
    const db = client.db("habitHub_db");
    const habitsCollection = db.collection("habits");
    const usersCollection = db.collection("users");

    // ----------------- USERS -----------------
    app.post("/users", async (req, res) => {
      const user = req.body;
      const existing = await usersCollection.findOne({ email: user.email });
      if (existing) return res.send({ message: "User already exists" });
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // ----------------- HABITS -----------------
    app.get("/habits/api/latest", async (req, res) => {
      const habits = await habitsCollection.find({ isPublic: true })
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();
      res.send(habits);
    });

    app.get("/habits/api/public", async (req, res) => {
      const { category, search } = req.query;
      const query = {};
      if (category) query.category = category;
      if (search) query.title = { $regex: search, $options: "i" };
      const habits = await habitsCollection.find(query).toArray();
      res.send(habits);
    });

    app.get("/habits/api/my", verifyFirebaseToken, async (req, res) => {
      const email = req.userEmail;
      const habits = await habitsCollection.find({ userEmail: email }).toArray();
      res.send(habits);
    });

    app.post("/habits", verifyFirebaseToken, async (req, res) => {
      const habit = req.body;
      habit.createdAt = new Date();
      habit.completionHistory = [];
      habit.streak = 0;
      const result = await habitsCollection.insertOne(habit);
      res.send(result);
    });

    app.patch("/habits/:id", verifyFirebaseToken, async (req, res) => {
      const { id } = req.params;
      const updated = req.body;
      const result = await habitsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updated }
      );
      res.send(result);
    });

    app.delete("/habits/:id", verifyFirebaseToken, async (req, res) => {
      const { id } = req.params;
      const result = await habitsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.post("/habits/:id/complete", verifyFirebaseToken, async (req, res) => {
      const { id } = req.params;
      const today = new Date().toISOString().split("T")[0];
      const habit = await habitsCollection.findOne({ _id: new ObjectId(id) });
      const alreadyDone = habit.completionHistory?.some(
        (d) => d === today
      );
      if (alreadyDone) return res.send({ message: "Already marked complete today" });

      const result = await habitsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $push: { completionHistory: today } }
      );
      res.send(result);
    });

    console.log("✅ Connected to MongoDB successfully!");
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`🚀 Habit Hub server running on port ${port}`);
});
