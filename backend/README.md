# CarminePF Backend

## Quick Setup (Windows)

After cloning or pulling the repository, run:

```batch
setup-prisma.bat
```

This will:
1. Install npm dependencies
2. Generate Prisma Client
3. Run database migrations

## Manual Setup

If the batch file doesn't work, run these commands manually:

```bash
# Install dependencies
npm install

# Generate Prisma Client
npx prisma generate

# Run migrations (for new database)
npx prisma migrate dev

# Or deploy migrations (for existing database)
npx prisma migrate deploy
```

## Common Issues

### "Module '@prisma/client' has no exported member" Error

This occurs when Prisma Client hasn't been generated. Solution:

```bash
npx prisma generate
```

### Build Errors

Make sure to run these commands in order:
1. `npm install`
2. `npx prisma generate`
3. `npm run build`

## Development

```bash
# Start development server with hot reload
npm run dev
```

## Production

```bash
# Build for production
npm run build

# Start production server
npm run start:prod
```