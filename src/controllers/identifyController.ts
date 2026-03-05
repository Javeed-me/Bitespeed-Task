import { Request, Response, NextFunction } from 'express';
import { identifyContact } from '../services/identityService';
import { IdentifyRequest } from '../models/contact';

export async function postIdentify(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, phoneNumber } = req.body as IdentifyRequest;

    const normalizedEmail =
      typeof email === 'string' ? email : undefined;
    const normalizedPhone =
      typeof phoneNumber === 'string' ? phoneNumber : undefined;

    if (
      (normalizedEmail == null || normalizedEmail.trim() === '') &&
      (normalizedPhone == null || normalizedPhone.trim() === '')
    ) {
      res.status(400).json({
        message: 'Either email or phoneNumber must be provided',
      });
      return;
    }

    const result = await identifyContact({
      email: normalizedEmail,
      phoneNumber: normalizedPhone,
    });

    res.status(200).json({ contact: result });
  } catch (error) {
    next(error);
  }
}

