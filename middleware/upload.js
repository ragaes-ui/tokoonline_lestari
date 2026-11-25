const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const isExtValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const isMimeValid = allowedTypes.test(file.mimetype);

  if (isExtValid && isMimeValid) {
    cb(null, true);
  } else {
    cb(new Error('Format gambar harus JPG, PNG, atau WEBP!'));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Maksimal 5MB
  fileFilter
});

function getSupabaseConfig() {
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const bucket = process.env.SUPABASE_BUCKET || 'products';
  return { supabaseUrl, supabaseKey, bucket };
}

async function uploadToSupabase(file) {
  const { supabaseUrl, supabaseKey, bucket } = getSupabaseConfig();
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Konfigurasi SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diatur di .env');
  }

  const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
  const fileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const filePath = `products/${fileName}`;

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${filePath}`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
      'Content-Type': file.mimetype,
      'x-upsert': 'true'
    },
    body: file.buffer
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gagal upload ke Supabase: ${errBody || res.statusText}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${filePath}`;
}

async function deleteFromSupabase(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return;
  if (!imageUrl.includes('/storage/v1/object/public/')) return;

  const { supabaseUrl, supabaseKey, bucket: defaultBucket } = getSupabaseConfig();
  if (!supabaseUrl || !supabaseKey) return;

  try {
    const urlObj = new URL(imageUrl);
    const afterPublic = urlObj.pathname.split('/storage/v1/object/public/')[1];
    if (!afterPublic) return;

    const parts = afterPublic.split('/');
    const bucketName = parts.shift() || defaultBucket;
    const filePath = parts.join('/');
    if (!filePath) return;

    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    const deleteUrl = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucketName)}/${encodedPath}`;

    const res = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey
      }
    });

    if (!res.ok && res.status !== 404) {
      const errBody = await res.text();
      console.error('Gagal hapus file di Supabase:', res.status, errBody);
    }
  } catch (err) {
    console.error('Error deleteFromSupabase:', err.message);
  }
}

module.exports = {
  upload,
  uploadToSupabase,
  deleteFromSupabase
};