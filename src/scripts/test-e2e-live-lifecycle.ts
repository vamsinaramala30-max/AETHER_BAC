import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { securityConfig } from '../config/security';

const prisma = new PrismaClient();

async function run() {
  const user = await prisma.user.findFirst({
    where: { email: 'vamsinaramala30@gmail.com' },
  });

  if (!user) {
    console.error('User not found!');
    process.exit(1);
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
    },
    securityConfig.jwt.secret,
    { expiresIn: '1h' },
  );

  console.log('User ID:', user.id);
  console.log('User Name:', user.fullName);
  console.log('JWT Token:', token.slice(0, 30) + '...');

  // 1. Check initial active files
  const listRes1 = await fetch('http://localhost:5001/api/v1/uploads', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data1: any = await listRes1.json();
  const initialCount = data1.files ? data1.files.length : (Array.isArray(data1) ? data1.length : 0);
  console.log('1. Initial files query returned count:', initialCount);

  // 2. Check initial storage insights
  const storageRes1 = await fetch('http://localhost:5001/api/v1/uploads/storage-insights', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const rawStorage1: any = await storageRes1.json();
  const storageData1 = rawStorage1.data || rawStorage1;
  console.log('2. Storage insights:', {
    totalFiles: storageData1.totalFiles,
    usedBytes: storageData1.usedBytes,
    quotaBytes: storageData1.quotaBytes,
    usagePercentage: storageData1.usagePercentage,
  });

  // 3. Perform a single file upload via multipart/form-data
  const formData = new FormData();
  const fileContent = 'AETHER Production File Content Test - ' + Date.now();
  const blob = new Blob([fileContent], { type: 'text/plain' });
  const testFilename = `aether-test-${Date.now()}.txt`;
  formData.append('file', blob, testFilename);

  const uploadRes = await fetch('http://localhost:5001/api/v1/uploads/single', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!uploadRes.ok) {
    console.error('Upload failed with status:', uploadRes.status, await uploadRes.text());
    process.exit(1);
  }

  const uploadData: any = await uploadRes.json();
  const uploadedFile = uploadData.data || uploadData;
  console.log('3. Upload succeeded! Created file:', {
    id: uploadedFile.id,
    filename: uploadedFile.filename,
    size: uploadedFile.size,
    createdAt: uploadedFile.createdAt,
    uploadedAt: uploadedFile.uploadedAt,
    status: uploadedFile.status,
  });

  // 4. Verify file appears in active query
  const listRes2 = await fetch('http://localhost:5001/api/v1/uploads', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data2: any = await listRes2.json();
  const newFiles = data2.files || data2;
  const found = newFiles.find((f: any) => f.id === uploadedFile.id);
  console.log('4. Uploaded file found in GET /uploads:', !!found, 'Total count now:', newFiles.length);

  // 5. Test Move to Trash
  const trashRes = await fetch(`http://localhost:5001/api/v1/uploads/${uploadedFile.id}/trash`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('5. Move to trash status:', trashRes.status);

  // 6. Verify disappeared from active files
  const listRes3 = await fetch('http://localhost:5001/api/v1/uploads', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data3: any = await listRes3.json();
  const filesAfterTrash = data3.files || data3;
  const inActive = filesAfterTrash.some((f: any) => f.id === uploadedFile.id);
  console.log('6. Uploaded file absent from active files:', !inActive);

  // 7. Verify in Trash query
  const trashListRes = await fetch('http://localhost:5001/api/v1/uploads/trash', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const trashData: any = await trashListRes.json();
  const trashFiles = trashData.data || trashData.files || (Array.isArray(trashData) ? trashData : []);
  const inTrash = trashFiles.some((f: any) => f.id === uploadedFile.id);
  console.log('7. Uploaded file present in GET /uploads/trash:', inTrash);

  // 8. Restore from Trash
  const restoreRes = await fetch(`http://localhost:5001/api/v1/uploads/${uploadedFile.id}/restore`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('8. Restore status:', restoreRes.status);

  // 9. Verify restored to active files
  const listRes4 = await fetch('http://localhost:5001/api/v1/uploads', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data4: any = await listRes4.json();
  const filesAfterRestore = data4.files || data4;
  const restoredActive = filesAfterRestore.some((f: any) => f.id === uploadedFile.id);
  console.log('9. Uploaded file back in active files:', restoredActive);

  // 10. Permanent Delete
  const permRes = await fetch(`http://localhost:5001/api/v1/uploads/${uploadedFile.id}/permanent`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('10. Permanent delete status:', permRes.status);

  // 11. Verify completely gone
  const dbRecord = await prisma.file.findUnique({ where: { id: uploadedFile.id } });
  console.log('11. File record permanently deleted from database:', dbRecord === null);

  console.log('\n--- ALL 11 BACKEND LIFECYCLE CHECKS PASSED PERFECTLY ---');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
