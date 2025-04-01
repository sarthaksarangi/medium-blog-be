/*
  Warnings:

  - A unique constraint covering the columns `[postId]` on the table `Image` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "description" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Image_postId_key" ON "Image"("postId");
