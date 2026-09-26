import express from 'express';
import cors from 'cors';
import session from 'express-session';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import staffTicketsRouter from './routes/staffTickets';
import categoriesRouter from './routes/categories';
import systemsRouter from './routes/relatedSystems';
import ticketsRouter from './routes/tickets';
import attachmentsRouter from './routes/attachments';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.warn(
    'SESSION_SECRET is not set - using an insecure development default. Set SESSION_SECRET in server/.env.'
  );
}

app.use(
  session({
    name: 'sid',
    secret: SESSION_SECRET || 'dev-only-insecure-secret-change-me',
    resave: false,
    saveUninitialized: false,
    rolling: true, // BR-06: 8h of INACTIVITY, not 8h from login - rolling resets the clock each request
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
  })
);

app.use('/api', healthRouter);
app.use('/api', authRouter);
app.use('/api', staffTicketsRouter);
app.use('/api', categoriesRouter);
app.use('/api', systemsRouter);
app.use('/api', ticketsRouter);
app.use('/api', attachmentsRouter);

export default app;