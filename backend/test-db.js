const pool = require('./db');

async function testProducts() {
  try {
    const result = await pool.query(
      'SELECT * FROM kategori_alat'
    );

    console.log('Jumlah data yang ditampilkan:', result.rows.length);
    console.table(result.rows);
  } catch (error) {
    console.error('Gagal membaca tabel products.');
    console.error(error.message);
  } finally {
    await pool.end();
  }
}

testProducts();