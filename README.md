## Bitespeed Identity Reconciliation Backend

Backend service for the Bitespeed Identity Reconciliation task built with **Node.js**, **TypeScript**, **Express**, **PostgreSQL**, and **Prisma**.

### Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express
- **Database**: PostgreSQL
- **ORM**: Prisma

### Project Structure

- **`src/server.ts`**: Express app bootstrap and middleware
- **`src/routes/identifyRoutes.ts`**: `/identify` route definition
- **`src/controllers/identifyController.ts`**: HTTP layer and validation
- **`src/services/identityService.ts`**: Identity reconciliation business logic
- **`src/db/client.ts`**: Prisma client singleton
- **`src/models/contact.ts`**: TypeScript models and DTOs
- **`prisma/schema.prisma`**: Prisma schema and `Contact` model
- **`sql/create_contact_table.sql`**: Raw PostgreSQL DDL for the `Contact` table

### Environment Variables

Create a `.env` file in the project root:

```bash
DATABASE_URL="postgresql://<USER>:<PASSWORD>@<HOST>:<PORT>/<DB_NAME>?schema=public"
PORT=3000
NODE_ENV=development
```

### Installation

```bash
npm install
npx prisma generate
```

To initialize the database using Prisma migrations:

```bash
npx prisma migrate dev --name init
```

Or apply the raw SQL directly:

```bash
psql "<DATABASE_URL>" -f sql/create_contact_table.sql
```

### Running the Service

- **Development**:

```bash
npm run dev
```

The server runs on `http://localhost:3000` by default.

- **Production build**:

```bash
npm run build
npm start
```

### API

- **Endpoint**: `POST /api/identify`
- **Body (JSON)**:

```json
{
  "email": "optional string",
  "phoneNumber": "optional string"
}
```

At least one of `email` or `phoneNumber` must be provided.

#### Successful Response (HTTP 200)

```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["primary@example.com", "secondary@example.com"],
    "phoneNumbers": ["+911234567890"],
    "secondaryContactIds": [2, 3]
  }
}
```

#### Validation Error (HTTP 400)

```json
{
  "message": "Either email or phoneNumber must be provided"
}
```

### Identity Reconciliation Logic

- **No match** by email or phone:
  - Create a **primary** contact with the given email and/or phone.
- **Existing contacts** matching by email or phone:
  - All such contacts are treated as belonging to the same person.
  - The **oldest contact** (earliest `createdAt`) remains **primary**.
  - Any other primaries in the group become **secondary** and are linked to the oldest primary.
- **New information** (new combination of email/phone) for an existing person:
  - A new **secondary** contact is created, linked to the primary.

The response always:

- Returns the **primary contact id**.
- Aggregates all **unique emails** and **phone numbers**, with the primary's values first.
- Returns **all secondary contact ids** in the group.

### Example Requests

1. **First-time user**

```bash
curl -X POST http://localhost:3000/api/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com"}'
```

Sample response:

```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["alice@example.com"],
    "phoneNumbers": [],
    "secondaryContactIds": []
  }
}
```

2. **Same email, new phone**

```bash
curl -X POST http://localhost:3000/api/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "phoneNumber": "+911234567890"}'
```

Sample response:

```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["alice@example.com"],
    "phoneNumbers": ["+911234567890"],
    "secondaryContactIds": [2]
  }
}
```

3. **Different email, same phone (merging primaries)**

```bash
curl -X POST http://localhost:3000/api/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "alice.alt@example.com", "phoneNumber": "+911234567890"}'
```

If a newer primary exists that shares this email or phone, it will be converted to a secondary, and the response will contain the oldest contact as primary.

### Deploying on Render

1. **Create a new PostgreSQL instance** on Render.
2. **Create a new Web Service**:
   - Connect your GitHub repository containing this project.
   - Build command: `npm install && npx prisma generate && npm run build`
   - Start command: `npm start`
3. **Environment variables**:
   - `DATABASE_URL` from the Render PostgreSQL dashboard.
   - `PORT` (Render typically sets this automatically; in that case, remove `PORT` from `.env`).
4. **Migrations**:
   - Option 1: Use `prisma migrate deploy` in the build or a separate job.
   - Option 2: Run the SQL in `sql/create_contact_table.sql` against the Render database.

### Notes

- The service uses **Prisma** for data access but also ships a raw SQL script for direct PostgreSQL setup.
- Error handling returns JSON with a `message` field for both validation and server errors.

