const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  name: { type: String, required: true },   // Contoh: "Merah - XL" atau "500gr"
  price: { type: Number, required: true },  // Harga khusus varian ini
  stock: { type: Number, default: 0 },       // Stok khusus varian ini
  minOrder: { type: Number, default: 1, min: 1 } // Minimal pembelian (pcs)
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, default: 'Umum' },
  description: { type: String, default: '' },
  imageUrl: { type: String, default: 'https://placehold.co/400x300?text=Produk' },
  variants: {
    type: [variantSchema],
    validate: {
      validator: function (arr) {
        return Array.isArray(arr) && arr.length > 0;
      },
      message: 'Produk minimal harus memiliki 1 varian'
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);