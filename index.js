// index.js (server)
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

const PORT = process.env.PORT || 5000;

// ================== Firebase Admin ==================
const serviceAccount = JSON.parse(fs.readFileSync('./firebaseServiceAccount.json', 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// ================== MongoDB Atlas ==================
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5q9kkgs.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: '1',
    strict: true,
    deprecationErrors: true,
  },
});

await client.connect();

const db = client.db('assignmentTen_db');
const habitsCollection = db.collection('habits');
const usersCollection = db.collection('users');


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

// ================== Helper Function ==================

 
function calculateStreak(completionHistory = []) {
  if (!completionHistory || completionHistory.length === 0) return 0;

 
  const uniqueDates = Array.from(new Set(completionHistory.map(d => {
    const dt = new Date(d);
    dt.setHours(0,0,0,0);
    return dt.getTime();
  })));

  uniqueDates.sort((a,b) => b - a); // descending

  const today = new Date();
  today.setHours(0,0,0,0);
  const todayTs = today.getTime();

  let streak = 0;
  let expectedTs = todayTs;

  for (let ts of uniqueDates) {
    if (ts === expectedTs) {
      streak++;
      expectedTs = expectedTs - (24 * 60 * 60 * 1000); // previous day
    } else if (ts < expectedTs) {
    
      if (streak === 0) {
    
        if (streak === 0) {
 
          streak = 1;
          expectedTs = ts - (24 * 60 * 60 * 1000);
        } else break;
      } else break;
    } else {
      continue;
    }
  }

  return streak;
}

// ================== ROUTES ==================
const router = express.Router();

router.get('/', (req, res) => res.send({ message: 'API is running ✅' }));

// Save user 
router.post('/users', async (req, res) => {
  try {
    const { uid, email, displayName, photoURL } = req.body;
    if (!email) return res.status(400).send({ message: 'Email required' });
    const existing = await usersCollection.findOne({ email });
    if (existing) return res.send({ message: 'User already exists' });
    const result = await usersCollection.insertOne({ uid, email, displayName, photoURL, createdAt: new Date() });
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

// Add new habit
router.post('/habits', verifyFirebaseToken, async (req, res) => {
  try {
    const habit = {
      ...req.body,
      userEmail: req.user.email,
      userId: req.user.uid,
      userName: req.user.name || req.user.displayName || '',
      imageUrl: req.body.imageUrl || req.body.image || '',
      createdAt: new Date(),
      completionHistory: [],
    };
    const result = await habitsCollection.insertOne(habit);
    const out = { _id: result.insertedId, ...habit };
    out.currentStreak = calculateStreak(out.completionHistory);
    res.status(201).send({ habit: out });
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

// day.
router.post('/habits/:id/complete', verifyFirebaseToken, async (req, res) => {
  try {
    const habitId = new ObjectId(req.params.id);
    const habit = await habitsCollection.findOne({ _id: habitId });
    if (!habit) return res.status(404).send({ message: 'Habit not found' });

   
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayIso = today.toISOString();

    const alreadyDone = (habit.completionHistory || []).some(d => {
      const dt = new Date(d);
      dt.setHours(0,0,0,0);
      return dt.getTime() === today.getTime();
    });

    if (alreadyDone) {
   
      habit.currentStreak = calculateStreak(habit.completionHistory);
      return res.status(200).send({ message: 'Already marked complete today', habit });
    }


    await habitsCollection.updateOne(
      { _id: habitId },
      { $push: { completionHistory: todayIso } }
    );

    const updated = await habitsCollection.findOne({ _id: habitId });
    updated.currentStreak = calculateStreak(updated.completionHistory);
    res.send({ habit: updated });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

app.use('/api', router);

// ================== Start Server ==================
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
app.get('/', (req, res) => res.send('Server is running ✅'));
