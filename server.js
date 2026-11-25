require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');

const Admin = require('./models/Admin');
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');

const app = express();

// Header keamanan dasar
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(cors());
app.use(express.json());

// Arahkan /admin ke admin.html secara eksplisit
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html']
}));

// Buat akun admin awal otomatis jika database masih kosong
async function seedDefaultAdmin() {
  const count = await Admin.countDocuments();
  if (count === 0) {
    const defaultPassword = process.env.ADMIN_KEY || 'admin123';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);
    await Admin.create({
      username: 'admin',
      passwordHash
    });
    console.log('Akun admin default dibuat (username: admin) dengan password ter-hash.');
  }
}

// Koneksi MongoDB
mongoose.connect(process.env.MONGO_URI, {
  family: 4,
  autoSelectFamily: false,
  connectTimeoutMS: 20000,
  serverSelectionTimeoutMS: 20000,
  socketTimeoutMS: 45000
})
  .then(async () => {
    console.log('Terhubung ke MongoDB');
    await seedDefaultAdmin();
  })
  .catch(err => console.error('Gagal koneksi MongoDB:', err));

// Endpoint API
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);

const wilayahServerCache = new Map();

app.use('/api/wilayah', async (req, res) => {
  const subPath = req.path.replace(/^\/+/, '');
  if (!/^[a-z0-9/]+\.json$/i.test(subPath)) {
    return res.status(400).json({ message: 'Path wilayah tidak valid' });
  }
  if (wilayahServerCache.has(subPath)) {
    return res.json(wilayahServerCache.get(subPath));
  }

  const ibnuxPath = subPath
    .replace(/^provinces\.json$/, 'provinsi.json')
    .replace(/^regencies\//, 'kabupaten/')
    .replace(/^districts\//, 'kecamatan/')
    .replace(/^villages\//, 'kelurahan/');

  const mirrors = [
    `https://cdn.jsdelivr.net/gh/emsifa/api-wilayah-indonesia@gh-pages/api/${subPath}`,
    `https://raw.githubusercontent.com/emsifa/api-wilayah-indonesia/gh-pages/api/${subPath}`,
    `https://cdn.jsdelivr.net/gh/ibnux/data-indonesia@master/${ibnuxPath}`,
    `https://raw.githubusercontent.com/ibnux/data-indonesia/master/${ibnuxPath}`,
    `https://emsifa.github.io/api-wilayah-indonesia/api/${subPath}`
  ];

  for (const url of mirrors) {
    try {
      const upstream = await fetch(url);
      if (upstream.ok) {
        const raw = await upstream.json();
        if (Array.isArray(raw) && raw.length) {
          const normalized = raw.map((item) => ({
            id: String(item.id),
            name: String(item.name || item.nama || '').toUpperCase()
          }));
          wilayahServerCache.set(subPath, normalized);
          return res.json(normalized);
        }
      }
    } catch (_) {}
  }

  res.status(502).json({ message: 'Gagal mengambil data wilayah' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
  console.log(`Halaman Admin: http://localhost:${PORT}/admin`);
});