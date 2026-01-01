import express from 'express';
import serverless from 'serverless-http';

const app = express();

// routes...
app.get('/api', (req, res) => res.send('Server is running ✅'));

// export for Vercel
export default serverless(app);
