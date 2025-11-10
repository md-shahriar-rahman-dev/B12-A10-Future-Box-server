import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import admin from "firebase-admin";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());
/ Initialize Firebase Admin
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
// --- MongoDB Connection ---
const uri = process.env.MONGO_URI || "mongodb+srv://assigment-ten:rGpocyaWmpBdTy5Z@cluster0.5q9kkgs.mongodb.net/?appName=Cluster0";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// --- Start Server ---
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
// --- Async DB Run ---

    // ✅ Ping
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Connected to MongoDB Atlas successfully!");

  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err);
  }
}
run();

// --- Listen on Port ---
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
