const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const authAdmin = require('../middleware/authAdmin');
const { upload, uploadToSupabase, deleteFromSupabase } = require('../middleware/upload');

// GET semua produk
router.get('/', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST tambah produk baru + upload foto ke Supabase (Admin)
router.post('/', authAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, category, description } = req.body;
    const variants = typeof req.body.variants === 'string'
      ? JSON.parse(req.body.variants)
      : req.body.variants;

    let imageUrl = '';
    if (req.file) {
      imageUrl = await uploadToSupabase(req.file);
    }

    const product = new Product({
      name,
      category: category || 'Umum',
      description,
      imageUrl,
      variants
    });

    const savedProduct = await product.save();
    res.status(201).json(savedProduct);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT edit produk + ganti foto di Supabase jika ada file baru (Admin)
router.put('/:id', authAdmin, upload.single('image'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Produk tidak ditemukan' });

    const { name, category, description } = req.body;
    const variants = typeof req.body.variants === 'string'
      ? JSON.parse(req.body.variants)
      : req.body.variants;

    product.name = name;
    product.category = category || 'Umum';
    product.description = description;
    product.variants = variants;

    if (req.file) {
      if (product.imageUrl) {
        await deleteFromSupabase(product.imageUrl);
      }
      product.imageUrl = await uploadToSupabase(req.file);
    }

    const updatedProduct = await product.save();
    res.json(updatedProduct);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE hapus foto produk saja di Supabase & kosongkan imageUrl (Admin)
router.delete('/:id/image', authAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Produk tidak ditemukan' });

    if (!product.imageUrl) {
      return res.status(400).json({ message: 'Produk ini tidak memiliki foto' });
    }

    await deleteFromSupabase(product.imageUrl);
    product.imageUrl = '';
    await product.save();

    res.json({ message: 'Foto produk berhasil dihapus dari Supabase', product });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE hapus produk beserta fotonya di Supabase (Admin)
router.delete('/:id', authAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (product && product.imageUrl) {
      await deleteFromSupabase(product.imageUrl);
    }
    res.json({ message: 'Produk berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST checkout pembeli -> Validasi Min. Order & Kurangi Stok Otomatis
router.post('/checkout', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Keranjang belanja kosong.' });
    }

    const productMap = new Map();

    for (const item of items) {
      let product = productMap.get(item.productId);
      if (!product) {
        product = await Product.findById(item.productId);
        if (!product) {
          return res.status(404).json({ message: `Produk "${item.name}" sudah tidak tersedia.` });
        }
        productMap.set(item.productId, product);
      }

      const variant = product.variants.id(item.variantId);
      if (!variant) {
        return res.status(404).json({ message: `Varian "${item.variantName}" pada ${product.name} tidak ditemukan.` });
      }

      if (variant.stock < item.qty) {
        return res.status(400).json({
          message: `Stok "${product.name} (${variant.name})" tidak mencukupi. Tersisa: ${variant.stock} pcs.`
        });
      }

      const minOrder = variant.minOrder || 1;
      const effectiveMin = variant.stock < minOrder ? variant.stock : minOrder;
      if (item.qty < effectiveMin) {
        return res.status(400).json({
          message: `Minimal pembelian "${product.name} (${variant.name})" adalah ${effectiveMin} pcs.`
        });
      }

      variant.stock -= item.qty;
    }

    for (const product of productMap.values()) {
      await product.save();
    }

    res.json({ success: true, message: 'Stok berhasil diperbarui.' });
  } catch (err) {
    res.status(500).json({ message: 'Terjadi kesalahan saat memproses pesanan: ' + err.message });
  }
});

module.exports = router;