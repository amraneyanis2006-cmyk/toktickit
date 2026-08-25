import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health';
import categoriesRouter from './routes/categories';
import systemsRouter from './routes/relatedSystems';
import requestersRouter from './routes/requesters';
import ticketsRouter from './routes/tickets';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', healthRouter);
app.use('/api', categoriesRouter);
app.use('/api', systemsRouter);
app.use('/api', requestersRouter);
app.use('/api', ticketsRouter);

export default app;
