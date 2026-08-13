import express from 'express';
import cors from 'cors';

const app = express();

app.use(cors());
app.use(express.json());

// Endpoint Health Check requis par le sujet
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'TokTickIT API'
  });
});

export default app;
