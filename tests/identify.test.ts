import request from 'supertest';
import app from '../src/app';

// Mock prisma client
jest.mock('../src/db/client', () => {
  const contact = {
    findMany: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  };

  return {
    __esModule: true,
    default: { contact },
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const prisma = require('../src/db/client').default as {
  contact: {
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
};

describe('/api/identify', () => {
  beforeEach(() => {
    prisma.contact.findMany.mockReset();
    prisma.contact.create.mockReset();
    prisma.contact.updateMany.mockReset();
  });

  test('1. Creating a new primary contact', async () => {
    prisma.contact.findMany.mockResolvedValueOnce([]); // no matching contacts
    prisma.contact.create.mockResolvedValueOnce({
      id: 1,
      email: 'alice@example.com',
      phoneNumber: '+911234567890',
      linkedId: null,
      linkPrecedence: 'PRIMARY',
      createdAt: new Date('2023-01-01T00:00:00Z'),
      updatedAt: new Date('2023-01-01T00:00:00Z'),
      deletedAt: null,
    });

    const res = await request(app)
      .post('/api/identify')
      .send({ email: 'alice@example.com', phoneNumber: '+911234567890' });

    expect(res.status).toBe(200);
    expect(prisma.contact.create).toHaveBeenCalledTimes(1);
    expect(res.body.contact).toEqual({
      primaryContactId: 1,
      emails: ['alice@example.com'],
      phoneNumbers: ['+911234567890'],
      secondaryContactIds: [],
    });
  });

  test('2. Linking contacts using same phone number', async () => {
    // Existing primary with same phone
    const existingPrimary = {
      id: 1,
      email: 'primary@example.com',
      phoneNumber: '+911234567890',
      linkedId: null,
      linkPrecedence: 'PRIMARY' as const,
      createdAt: new Date('2023-01-01T00:00:00Z'),
      updatedAt: new Date('2023-01-01T00:00:00Z'),
      deletedAt: null,
    };

    // Call order:
    // 1) matchingContacts
    prisma.contact.findMany.mockResolvedValueOnce([existingPrimary]);

    // BFS neighbors (just returns the existing primary, no expansion)
    prisma.contact.findMany.mockResolvedValueOnce([existingPrimary]);

    // allRelated
    prisma.contact.findMany.mockResolvedValueOnce([existingPrimary]);

    // refreshed group (primary + any secondaries, here only primary)
    prisma.contact.findMany.mockResolvedValueOnce([existingPrimary]);

    const res = await request(app)
      .post('/api/identify')
      .send({ phoneNumber: '+911234567890' });

    expect(res.status).toBe(200);
    // No new contact is created because phone already exists
    expect(prisma.contact.create).not.toHaveBeenCalled();
    expect(res.body.contact.primaryContactId).toBe(1);
    expect(res.body.contact.phoneNumbers).toEqual(['+911234567890']);
  });

  test('3. Linking contacts using same email', async () => {
    const existingPrimary = {
      id: 1,
      email: 'user@example.com',
      phoneNumber: null,
      linkedId: null,
      linkPrecedence: 'PRIMARY' as const,
      createdAt: new Date('2023-01-01T00:00:00Z'),
      updatedAt: new Date('2023-01-01T00:00:00Z'),
      deletedAt: null,
    };

    prisma.contact.findMany.mockResolvedValueOnce([existingPrimary]); // matchingContacts
    prisma.contact.findMany.mockResolvedValueOnce([existingPrimary]); // BFS neighbors
    prisma.contact.findMany.mockResolvedValueOnce([existingPrimary]); // allRelated
    prisma.contact.findMany.mockResolvedValueOnce([existingPrimary]); // refreshed

    const res = await request(app)
      .post('/api/identify')
      .send({ email: 'user@example.com' });

    expect(res.status).toBe(200);
    expect(prisma.contact.create).not.toHaveBeenCalled();
    expect(res.body.contact.primaryContactId).toBe(1);
    expect(res.body.contact.emails).toEqual(['user@example.com']);
  });

  test('4. Converting primary contact into secondary', async () => {
    const olderPrimary = {
      id: 1,
      email: 'old@example.com',
      phoneNumber: '+911111111111',
      linkedId: null,
      linkPrecedence: 'PRIMARY' as const,
      createdAt: new Date('2023-01-01T00:00:00Z'),
      updatedAt: new Date('2023-01-01T00:00:00Z'),
      deletedAt: null,
    };

    const newerPrimary = {
      id: 2,
      email: 'new@example.com',
      phoneNumber: '+922222222222',
      linkedId: null,
      linkPrecedence: 'PRIMARY' as const,
      createdAt: new Date('2023-02-01T00:00:00Z'),
      updatedAt: new Date('2023-02-01T00:00:00Z'),
      deletedAt: null,
    };

    // Request that connects both by matching phone of older and email of newer
    // matchingContacts: both primaries match via email or phone
    prisma.contact.findMany.mockResolvedValueOnce([olderPrimary, newerPrimary]);

    // BFS neighbors
    prisma.contact.findMany.mockResolvedValueOnce([olderPrimary, newerPrimary]);

    // allRelated
    prisma.contact.findMany.mockResolvedValueOnce([olderPrimary, newerPrimary]);

    // refreshed after demotion: newerPrimary becomes SECONDARY linked to olderPrimary
    const demotedNewer = {
      ...newerPrimary,
      linkPrecedence: 'SECONDARY' as const,
      linkedId: olderPrimary.id,
    };
    prisma.contact.findMany.mockResolvedValueOnce([olderPrimary, demotedNewer]);

    // No new secondary created in this scenario (hasExact will be true for at least one field)

    const res = await request(app)
      .post('/api/identify')
      .send({
        email: 'new@example.com',
        phoneNumber: '+911111111111',
      });

    expect(res.status).toBe(200);

    // Newer primary should have been demoted
    expect(prisma.contact.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [2] } },
      data: {
        linkPrecedence: 'SECONDARY',
        linkedId: olderPrimary.id,
      },
    });

    expect(res.body.contact.primaryContactId).toBe(1);
    expect(res.body.contact.secondaryContactIds).toContain(2);
  });

  test('5. Returning correct consolidated response', async () => {
    const primary = {
      id: 1,
      email: 'primary@example.com',
      phoneNumber: '+911111111111',
      linkedId: null,
      linkPrecedence: 'PRIMARY' as const,
      createdAt: new Date('2023-01-01T00:00:00Z'),
      updatedAt: new Date('2023-01-01T00:00:00Z'),
      deletedAt: null,
    };
    const secondary1 = {
      id: 2,
      email: 'secondary1@example.com',
      phoneNumber: '+922222222222',
      linkedId: 1,
      linkPrecedence: 'SECONDARY' as const,
      createdAt: new Date('2023-02-01T00:00:00Z'),
      updatedAt: new Date('2023-02-01T00:00:00Z'),
      deletedAt: null,
    };
    const secondary2 = {
      id: 3,
      email: 'primary@example.com', // duplicate email
      phoneNumber: '+933333333333',
      linkedId: 1,
      linkPrecedence: 'SECONDARY' as const,
      createdAt: new Date('2023-03-01T00:00:00Z'),
      updatedAt: new Date('2023-03-01T00:00:00Z'),
      deletedAt: null,
    };

    prisma.contact.findMany.mockResolvedValueOnce([primary]); // matchingContacts
    prisma.contact.findMany.mockResolvedValueOnce([primary, secondary1, secondary2]); // BFS
    prisma.contact.findMany.mockResolvedValueOnce([primary, secondary1, secondary2]); // allRelated
    prisma.contact.findMany.mockResolvedValueOnce([primary, secondary1, secondary2]); // refreshed

    const res = await request(app)
      .post('/api/identify')
      .send({ email: 'primary@example.com' });

    expect(res.status).toBe(200);

    const contact = res.body.contact;
    expect(contact.primaryContactId).toBe(1);
    // Primary's email and phone first, no duplicates
    expect(contact.emails).toEqual(['primary@example.com', 'secondary1@example.com']);
    expect(contact.phoneNumbers).toEqual([
      '+911111111111',
      '+922222222222',
      '+933333333333',
    ]);
    // All secondaries included
    expect(contact.secondaryContactIds.sort()).toEqual([2, 3]);
  });

  test('6. Duplicate requests do not create extra contacts', async () => {
    const existingContact = {
      id: 1,
      email: 'dup@example.com',
      phoneNumber: '+911234567890',
      linkedId: null,
      linkPrecedence: 'PRIMARY' as const,
      createdAt: new Date('2023-01-01T00:00:00Z'),
      updatedAt: new Date('2023-01-01T00:00:00Z'),
      deletedAt: null,
    };

    // First call: contact exists and is in group
    prisma.contact.findMany
      .mockResolvedValueOnce([existingContact]) // matchingContacts
      .mockResolvedValueOnce([existingContact]) // BFS
      .mockResolvedValueOnce([existingContact]) // allRelated
      .mockResolvedValueOnce([existingContact]); // refreshed

    let res = await request(app)
      .post('/api/identify')
      .send({
        email: 'dup@example.com',
        phoneNumber: '+911234567890',
      });

    expect(res.status).toBe(200);
    expect(prisma.contact.create).not.toHaveBeenCalled();

    // Second call (duplicate request): same sequence of mocks
    prisma.contact.findMany
      .mockResolvedValueOnce([existingContact]) // matchingContacts
      .mockResolvedValueOnce([existingContact]) // BFS
      .mockResolvedValueOnce([existingContact]) // allRelated
      .mockResolvedValueOnce([existingContact]); // refreshed

    res = await request(app)
      .post('/api/identify')
      .send({
        email: 'dup@example.com',
        phoneNumber: '+911234567890',
      });

    expect(res.status).toBe(200);
    // Still no new contacts created
    expect(prisma.contact.create).not.toHaveBeenCalled();
    expect(res.body.contact.primaryContactId).toBe(1);
  });
});

