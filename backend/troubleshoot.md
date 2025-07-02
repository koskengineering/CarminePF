# CarminePF Backend Troubleshooting

## Common Errors and Solutions

### 1. "The table `main.Config` does not exist in the current database"

**Cause**: Database tables haven't been created (missing migration)

**Solution for ConoHa VPS**:
```batch
fix-database.bat
```

**Or manually**:
```bash
# Run database migration to create tables
npx prisma migrate dev --name init

# Generate Prisma client
npx prisma generate
```

### 2. "Module '@prisma/client' has no exported member"

**Cause**: Prisma Client hasn't been generated

**Solution**:
```bash
npx prisma generate
```

### 3. "Prisma Client could not locate the Query Engine"

**Cause**: Wrong binary target for current platform

**Solution**: Already fixed in schema.prisma with multiple binary targets

### 4. Port 3000 already in use

**Solution**:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <process_id> /F

# Linux
lsof -ti:3000 | xargs kill -9
```

## Setup Steps for New Environment

### Windows (ConoHa VPS)
1. Clone repository
2. Run `fix-database.bat`
3. Start server: `npm run dev`

### Linux/WSL
1. Clone repository
2. Run setup commands:
   ```bash
   npm install
   npx prisma migrate dev
   npx prisma generate
   npm run dev
   ```

## Useful Commands

```bash
# Reset database completely
npx prisma migrate reset

# View database with GUI
npx prisma studio

# Check migration status
npx prisma migrate status

# Deploy migrations (production)
npx prisma migrate deploy
```