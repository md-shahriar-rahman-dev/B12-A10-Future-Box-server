import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import cors from 'cors';
import admin from 'firebase-admin';
import fs from 'fs';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ================== Firebase Admin ==================
const serviceAccount = JSON.parse(fs.readFileSync('./firebaseServiceAccount.json', 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// ================== MongoDB Atlas ==================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://assigment-ten:rGpocyaWmpBdTy5Z@cluster0.5q9kkgs.mongodb.net/?appName=Cluster0";
const client = new MongoClient(MONGO_URI);
await client.connect();
const db = client.db('assignmentTen_db'); // DB name
const habitsCollection = db.collection('habits');

// ================== Middleware ==================
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return res.status(401).send({ message: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).send({ message: 'Invalid token' });
  }
}

// ================== Helpers ==================
function calculateStreak(completionHistory = []) {
  if (!completionHistory.length) return 0;
  const sorted = completionHistory.map(d => new Date(d)).sort((a, b) => b - a);
  let streak = 0;
  let lastDate = new Date();
  lastDate.setHours(0, 0, 0, 0);

  for (let d of sorted) {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    const diffDays = Math.round((lastDate - date) / (1000 * 60 * 60 * 24));
    if (diffDays === 0 || diffDays === 1) {
      streak++;
      lastDate = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    } else break;
  }
  return streak;
}

// ================== Router ==================

const router = express.Router();


router.get('/', (req, res) => res.send({ message: 'API is running ' }));

// Add new habit
router.post('/habits', verifyFirebaseToken, async (req, res) => {
  try {
    const habit = {
      ...req.body,
      userEmail: req.user.email,
      userId: req.user.uid,
      createdAt: new Date(),
      completionHistory: [],
    };
    const result = await habitsCollection.insertOne(habit);
    res.status(201).send({ habit: { _id: result.insertedId, ...habit } });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

// Get latest habits
router.get('/habits/latest', async (req, res) => {
  try {
    const habits = await habitsCollection.find().sort({ createdAt: -1 }).limit(6).toArray();
    habits.forEach(h => (h.currentStreak = calculateStreak(h.completionHistory)));
    res.send({ habits });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

// Get public habits
router.get('/habits/public', async (req, res) => {
  try {
    const { search, categories } = req.query;
    const filter = {};
    if (search) filter.title = { $regex: search, $options: 'i' };
    if (categories) filter.category = { $in: categories.split(',') };
    const habits = await habitsCollection.find(filter).toArray();
    habits.forEach(h => (h.currentStreak = calculateStreak(h.completionHistory)));
    res.send({ habits });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

// Get my habits
router.get('/habits/my', verifyFirebaseToken, async (req, res) => {
  try {
    const habits = await habitsCollection.find({ userEmail: req.user.email }).toArray();
    habits.forEach(h => (h.currentStreak = calculateStreak(h.completionHistory)));
    res.send({ habits });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

// Get habit by ID
router.get('/habits/:id', async (req, res) => {
  try {
    const habit = await habitsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!habit) return res.status(404).send({ message: 'Habit not found' });
    habit.currentStreak = calculateStreak(habit.completionHistory);
    res.send({ habit });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

// Update habit
router.patch('/habits/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const habit = await habitsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!habit) return res.status(404).send({ message: 'Habit not found' });
    if (habit.userEmail !== req.user.email) return res.status(403).send({ message: 'Forbidden' });

    await habitsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: req.body });
    const updated = await habitsCollection.findOne({ _id: new ObjectId(req.params.id) });
    updated.currentStreak = calculateStreak(updated.completionHistory);
    res.send({ habit: updated });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

// Delete habit
router.delete('/habits/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const habit = await habitsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!habit) return res.status(404).send({ message: 'Habit not found' });
    if (habit.userEmail !== req.user.email) return res.status(403).send({ message: 'Forbidden' });

    await habitsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send({ message: 'Habit deleted' });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

// Mark habit complete
router.post('/habits/:id/complete', verifyFirebaseToken, async (req, res) => {
  try {
    const habit = await habitsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!habit) return res.status(404).send({ message: 'Habit not found' });
    if (habit.userEmail !== req.user.email) return res.status(403).send({ message: 'Forbidden' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const alreadyDone = habit.completionHistory.some(d => new Date(d).toDateString() === today.toDateString());

    if (!alreadyDone) {
      habit.completionHistory.push(today.toISOString());
      await habitsCollection.updateOne({ _id: habit._id }, { $set: { completionHistory: habit.completionHistory } });
    }

    habit.currentStreak = calculateStreak(habit.completionHistory);
    res.send({ habit });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});


app.use('/api', router);

// ================== Start Server ==================
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
app.get('/', (req, res) => {
  res.send('Server is running ✅');
});

