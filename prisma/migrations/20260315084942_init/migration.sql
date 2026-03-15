-- CreateTable
CREATE TABLE "CharacterPreset" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresetImage" (
    "id" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "filePath" TEXT,
    "imageData" TEXT,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PresetImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedBackground" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageData" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedBackground_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationRequest" (
    "id" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "background" TEXT,
    "backgroundImageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "tier" TEXT NOT NULL DEFAULT 'free',
    "credits" INTEGER NOT NULL DEFAULT 0,
    "tierUsedThisMonth" INTEGER NOT NULL DEFAULT 0,
    "tierResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifyToken" TEXT,
    "verifyTokenExp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedImage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "imageData" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CharacterPreset_alias_key" ON "CharacterPreset"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_verifyToken_key" ON "User"("verifyToken");

-- AddForeignKey
ALTER TABLE "PresetImage" ADD CONSTRAINT "PresetImage_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "CharacterPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationRequest" ADD CONSTRAINT "GenerationRequest_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "CharacterPreset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationRequest" ADD CONSTRAINT "GenerationRequest_backgroundImageId_fkey" FOREIGN KEY ("backgroundImageId") REFERENCES "SavedBackground"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedImage" ADD CONSTRAINT "GeneratedImage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "GenerationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
