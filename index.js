const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

//midleware
app.use(cors());




app.get('/', (req, res) => {
  res.send('Server is Running fine')
})





app.listen(port, () => {
  console.log(`listening on port ${port}`)
})