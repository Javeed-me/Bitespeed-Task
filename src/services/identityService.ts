import prisma from '../db/client';
import { IdentifyRequest, IdentifyResponseContact } from '../models/contact';

function normalize(value?: string | null): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function identifyContact(
  payload: IdentifyRequest,
): Promise<IdentifyResponseContact> {
  const email = normalize(payload.email);
  const phoneNumber = normalize(payload.phoneNumber);
  if (!email && !phoneNumber) {
    throw new Error('Either email or phoneNumber must be provided');
  }

  const matchingContacts = await prisma.contact.findMany({
    where: {
      OR: [
        email ? { email } : undefined,
        phoneNumber ? { phoneNumber } : undefined,
      ].filter(Boolean) as object[],
    },
    orderBy: { createdAt: 'asc' },
  });

  if (matchingContacts.length === 0) {
    const created = await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkPrecedence: 'PRIMARY',
      },
    });

    return {
      primaryContactId: created.id,
      emails: created.email ? [created.email] : [],
      phoneNumbers: created.phoneNumber ? [created.phoneNumber] : [],
      secondaryContactIds: [],
    };
  }

  const visitedIds = new Set<number>();
  const queue: number[] = [];

  matchingContacts.forEach((c) => {
    if (!visitedIds.has(c.id)) {
      visitedIds.add(c.id);
      queue.push(c.id);
    }
    if (c.linkedId && !visitedIds.has(c.linkedId)) {
      visitedIds.add(c.linkedId);
      queue.push(c.linkedId);
    }
  });

  while (queue.length > 0) {
    const batch = queue.splice(0, queue.length);
    const neighbors = await prisma.contact.findMany({
      where: {
        OR: [
          { id: { in: batch } },
          { linkedId: { in: batch } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    neighbors.forEach((c) => {
      if (!visitedIds.has(c.id)) {
        visitedIds.add(c.id);
        queue.push(c.id);
      }
      if (c.linkedId && !visitedIds.has(c.linkedId)) {
        visitedIds.add(c.linkedId);
        queue.push(c.linkedId);
      }
    });
  }

  const allRelated = await prisma.contact.findMany({
    where: { id: { in: Array.from(visitedIds) } },
    orderBy: { createdAt: 'asc' },
  });

  if (allRelated.length === 0) {
    const created = await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkPrecedence: 'PRIMARY',
      },
    });

    return {
      primaryContactId: created.id,
      emails: created.email ? [created.email] : [],
      phoneNumbers: created.phoneNumber ? [created.phoneNumber] : [],
      secondaryContactIds: [],
    };
  }

  const primaries = allRelated.filter(
    (c) => c.linkPrecedence === 'PRIMARY',
  );

  const primaryContact =
    primaries.length > 0
      ? primaries.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        )[0]
      : allRelated[0];

  const otherPrimaryIds = primaries
    .filter((c) => c.id !== primaryContact.id)
    .map((c) => c.id);

  if (otherPrimaryIds.length > 0) {
    await prisma.contact.updateMany({
      where: { id: { in: otherPrimaryIds } },
      data: {
        linkPrecedence: 'SECONDARY',
        linkedId: primaryContact.id,
      },
    });
  }

  await prisma.contact.updateMany({
    where: {
      linkedId: { in: otherPrimaryIds },
    },
    data: {
      linkedId: primaryContact.id,
    },
  });

  const refreshed = await prisma.contact.findMany({
    where: {
      OR: [
        { id: primaryContact.id },
        { linkedId: primaryContact.id },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });

  const hasExact = refreshed.some((c) => {
    if (email && phoneNumber) {
      return c.email === email && c.phoneNumber === phoneNumber;
    }
    if (email && !phoneNumber) {
      return c.email === email;
    }
    if (!email && phoneNumber) {
      return c.phoneNumber === phoneNumber;
    }
    return false;
  });

  let finalContacts = refreshed;

  if (!hasExact) {
    const createdSecondary = await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkPrecedence: 'SECONDARY',
        linkedId: primaryContact.id,
      },
    });

    finalContacts = [...refreshed, createdSecondary];
  }

  const primary = finalContacts.find(
    (c) => c.id === primaryContact.id,
  )!;

  const emailSet = new Set<string>();
  const phoneSet = new Set<string>();

  const emails: string[] = [];
  const phoneNumbers: string[] = [];

  if (primary.email) {
    emailSet.add(primary.email);
    emails.push(primary.email);
  }

  if (primary.phoneNumber) {
    phoneSet.add(primary.phoneNumber);
    phoneNumbers.push(primary.phoneNumber);
  }

  finalContacts
    .filter((c) => c.id !== primary.id)
    .forEach((c) => {
      if (c.email && !emailSet.has(c.email)) {
        emailSet.add(c.email);
        emails.push(c.email);
      }
      if (c.phoneNumber && !phoneSet.has(c.phoneNumber)) {
        phoneSet.add(c.phoneNumber);
        phoneNumbers.push(c.phoneNumber);
      }
    });

  const secondaryContactIds = finalContacts
    .filter((c) => c.id !== primary.id)
    .map((c) => c.id)
    .sort((a, b) => a - b);

  return {
    primaryContactId: primary.id,
    emails,
    phoneNumbers,
    secondaryContactIds,
  };
}

