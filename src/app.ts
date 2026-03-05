import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import identifyRoutes from './routes/identifyRoutes';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: '*',
  }),
);
app.use(express.json());

app.use('/api', identifyRoutes);

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof Error) {
      res.status(500).json({
        message: err.message,
      });
      return;
    }

    res.status(500).json({
      message: 'Internal server error',
    });
  },
);

export default app;

