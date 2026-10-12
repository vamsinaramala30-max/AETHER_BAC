import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const chunkCols: any = await prisma.$queryRaw`
      SELECT column_name, data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'document_chunks' 
      ORDER BY ordinal_position;
    `;
    console.log('document_chunks columns:', chunkCols.map((c: any) => `${c.column_name} (${c.data_type}/${c.udt_name})`));

    const docCols: any = await prisma.$queryRaw`
      SELECT column_name, data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'documents' 
      ORDER BY ordinal_position;
    `;
    console.log('documents columns:', docCols.map((c: any) => `${c.column_name} (${c.data_type}/${c.udt_name})`));

    const ext: any = await prisma.$queryRaw`
      SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
    `;
    console.log('vector extension:', ext);


  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
