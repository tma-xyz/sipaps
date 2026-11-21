const express = require('express');
const cors = require('cors');
const pool = require('./db');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = 3000;

//dashboard

app.get('/api/stats', async (req, res) => {
  try {
    const [alat, kategori, peminjaman, status, terbaru] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS total, COALESCE(SUM(stok), 0) AS total_unit
        FROM alat
      `),
      pool.query('SELECT COUNT(*) AS total FROM kategori_alat'),
      pool.query('SELECT COUNT(*) AS total FROM peminjaman'),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'Dipinjam'
            AND (tanggal_rencana_kembali IS NULL
            OR tanggal_rencana_kembali >= CURRENT_DATE)
          ) AS dipinjam,
          COUNT(*) FILTER (WHERE status = 'Dikembalikan') AS dikembalikan,
          COUNT(*) FILTER (
            WHERE status = 'Terlambat'
            OR (status != 'Dikembalikan'
            AND tanggal_rencana_kembali < CURRENT_DATE)
          ) AS terlambat
        FROM peminjaman
      `),
      pool.query(`
        SELECT
          p.id_peminjaman,
          p.id_alat,
          COALESCE(p.nama_alat, a.nama_alat, '-') AS nama_alat,
          p.nama_peminjam,
          p.kelas,
          TO_CHAR(p.tanggal_pinjam, 'YYYY-MM-DD') AS tanggal_pinjam,
          TO_CHAR(p.tanggal_rencana_kembali, 'YYYY-MM-DD') AS tanggal_rencana_kembali,
          TO_CHAR(p.tanggal_kembali, 'YYYY-MM-DD') AS tanggal_kembali,
          p.jumlah,
          CASE
            WHEN p.status != 'Dikembalikan'
              AND p.tanggal_rencana_kembali < CURRENT_DATE
            THEN 'Terlambat'
            ELSE p.status
          END AS status
        FROM peminjaman p
        LEFT JOIN alat a ON p.id_alat = a.id_alat
        ORDER BY p.id_peminjaman DESC
        LIMIT 5
      `)
    ]);

    res.json({
      total_alat: Number(alat.rows[0].total),
      total_unit_alat: Number(alat.rows[0].total_unit),
      total_kategori: Number(kategori.rows[0].total),
      total_peminjaman: Number(peminjaman.rows[0].total),
      dipinjam: Number(status.rows[0].dipinjam),
      dikembalikan: Number(status.rows[0].dikembalikan),
      terlambat: Number(status.rows[0].terlambat),
      latest_peminjaman: terbaru.rows
    });
  } catch (e) {
    console.error('Error stats:', e.message);
    res.status(500).json({
      message: 'Gagal mengambil statistik: ' + e.message
    });
  }
});

//kategori alat

app.get('/api/kategori_alat', async (req, res) => {
  try {
    const result = await pool.query(`
      select * from kategori_alat
    `);
    res.status(200).json(result.rows);
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ message: 'Gagal ambil kategori: ' + e.message });
  }
});

app.get('/api/kategori_alat/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'ID kategori alat harus bilangan bulat positif' });
  try {
    const result = await pool.query('SELECT * FROM kategori_alat WHERE id_kategori = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Kategori alat tidak ditemukan' });
    res.status(200).json(result.rows[0]);
  } catch (e) { res.status(500).json({ message: e.message }); }
});


app.post('/api/kategori_alat', async (req, res) => {
  const { nama_kategori, deskripsi } = req.body;
  const nameTrim = nama_kategori?.trim();
  const deskripsiTrim = deskripsi?.trim();
  if (!nameTrim || nameTrim === '' || !deskripsiTrim) return res.status(400).json({ message: 'Nama kategori wajib diisi' });
  try {
    const result = await pool.query('INSERT INTO kategori_alat (nama_kategori, deskripsi) VALUES ($1, $2) RETURNING *',
      [nameTrim.trim(), deskripsiTrim.trim()]);
    res.status(201).json(result.rows[0]);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/kategori_alat/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { nama_kategori, deskripsi } = req.body;
  const nameTrim = nama_kategori?.trim();
  const deskripsiTrim = deskripsi?.trim();
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'ID kategori alat tidak valid' });
  try {
    const result = await pool.query(
      `UPDATE kategori_alat SET nama_kategori=$1, deskripsi=$2 WHERE id_kategori=$3 RETURNING *`,
      [nameTrim, deskripsiTrim, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Kategori alat tidak ditemukan' });
    res.status(200).json({ message: 'Kategori alat berhasil diperbarui', data: result.rows[0] });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/kategori_alat/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: 'ID kategori alat tidak valid' });
  try {
    const result = await pool.query('DELETE FROM kategori_alat WHERE id_kategori=$1 RETURNING *', [id]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Kategori alat tidak ditemukan.' });
    return res.status(200).json({ message: 'Berhasil hapus data' });
  } catch (e) { return res.status(500).json({ message: e.message }); }
});

//alat

app.get('/api/alat', async (req, res) => {
  try {
    const result = await pool.query(`
      select * from alat
    `);
    res.status(200).json(result.rows);
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ message: 'Gagal ambil data alat : ' + e.message });
  }
});

app.get('/api/alat/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'ID kategori alat harus bilangan bulat positif' });
  try {
    const result = await pool.query('SELECT * FROM alat WHERE id_alat = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Data alat tidak ditemukan' });
    res.status(200).json(result.rows[0]);
  } catch (e) { res.status(500).json({ message: e.message }); }
});


app.post('/api/alat', async (req, res) => {
  const { id_kategori, nama_alat, kondisi, stok, lokasi } = req.body;
  const id_kategoriNum = Number(id_kategori);
  const nama_alatTrim = nama_alat?.trim();
  const kondisiTrim = kondisi?.trim();
  const stokNum = Number(stok);
  const lokasiTrim = lokasi?.trim();

  if (id_kategoriNum <= 0 || isNaN(id_kategoriNum) || id_kategoriNum < 0 || !nama_alatTrim || nama_alatTrim === '' || !nama_alatTrim || !kondisiTrim || kondisiTrim === '' || !kondisiTrim || stokNum <= 0 || isNaN(stokNum) || stokNum < 0 || !lokasiTrim || lokasiTrim === '' || !lokasiTrim)
    return res.status(400).json({ message: 'Nama alat wajib diisi' });
  try {
    const result = await pool.query('INSERT INTO alat (id_kategori, nama_alat, kondisi, stok, lokasi) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id_kategoriNum, nama_alatTrim.trim(), kondisiTrim.trim(), stokNum, lokasiTrim.trim()]);
    res.status(201).json(result.rows[0]);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/alat/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { id_alat, id_kategori, nama_alat, kondisi, stok, lokasi } = req.body;
  const id_alatNum = Number(id_alat);
  const id_kategoriNum = Number(id_kategori);
  const nama_alatTrim = nama_alat?.trim();
  const kondisiTrim = kondisi?.trim();
  const stokNum = Number(stok);
  const lokasiTrim = lokasi?.trim();

  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'ID kategori alat tidak valid' });
  try {
    const result = await pool.query(
      `UPDATE alat SET id_kategori=$1, nama_alat=$2, kondisi=$3, stok=$4, lokasi=$5 WHERE id_alat=$6 RETURNING *`,
      [id_kategoriNum, nama_alatTrim, kondisiTrim, stokNum, lokasiTrim, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Data alat tidak ditemukan' });
    res.status(200).json({ message: 'Data alat berhasil diperbarui', data: result.rows[0] });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/alat/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: 'ID data alat tidak valid' });
  try {
    const cek = await pool.query("SELECT * FROM peminjaman WHERE id_alat=$1 and tanggal_kembali IS NULL", [id]);
    if (cek.rowCount > 0) return res.status(400).json({ message: 'Data alat sedang dipinjam.' });

    const result = await pool.query(
      'DELETE FROM alat WHERE id_alat = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Data alat tidak ditemukan' });

    return res.status(200).json({ message: 'Berhasil hapus data' });
  } catch (e) { return res.status(500).json({ message: e.message }); }
});

//peminjaman

app.get('/api/peminjaman', async (req, res) => {
  try {
    const result = await pool.query(`
      select * from peminjaman
    `);
    res.status(200).json(result.rows);
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ message: 'Gagal ambil data Peminjaman : ' + e.message });
  }
});

app.get('/api/peminjaman/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'ID peminjaman harus bilangan bulat positif' });
  try {
    const result = await pool.query('SELECT * FROM peminjaman WHERE id_peminjaman = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Data peminjaman tidak ditemukan' });
    res.status(200).json(result.rows[0]);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/peminjaman', async (req, res) => {
  const { id_alat, nama_alat, nama_peminjam, kelas, tanggal_pinjam, tanggal_rencana_kembali, tanggal_kembali, jumlah, status } = req.body;

  if (!id_alat || !nama_alat || !nama_peminjam || !kelas || !tanggal_rencana_kembali || !jumlah)
    return res.status(400).json({ message: 'Data Peminjaman wajib diisi' });
  try {
    const result = await pool.query('INSERT INTO peminjaman (id_alat, nama_alat, nama_peminjam, kelas, tanggal_pinjam,tanggal_rencana_kembali, tanggal_kembali,jumlah, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [id_alat, nama_alat, nama_peminjam, kelas, tanggal_pinjam || new Date(), tanggal_rencana_kembali, tanggal_kembali, jumlah, status]);
    res.status(201).json(result.rows[0]);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/peminjaman/:id', async (req, res) => {
  const id = Number(req.params.id);
  let { id_alat, nama_alat, nama_peminjam, kelas, tanggal_pinjam,tanggal_rencana_kembali, tanggal_kembali, jumlah, status } = req.body;

  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'ID kategori alat tidak valid' });
  try {
    const result = await pool.query(
      `UPDATE peminjaman SET id_alat=$1,nama_alat=$2, nama_peminjam=$3, kelas=$4, tanggal_pinjam=$5,tanggal_rencana_kembali=$6, tanggal_kembali=$7, jumlah=$8, status=$9 WHERE id_peminjaman=$10 RETURNING *`,
      [id_alat,nama_alat, nama_peminjam, kelas, tanggal_pinjam,tanggal_rencana_kembali, tanggal_kembali = status === 'Dikembalikan' ? new Date() : null, jumlah, status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Data Peminjaman tidak ditemukan' });
    res.status(200).json({ message: 'Data Peminjaman berhasil diperbarui', data: result.rows[0] });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/peminjaman/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: 'ID data Peminjaman tidak valid' });
  try {
    const result = await pool.query('DELETE FROM peminjaman WHERE id_peminjaman=$1 RETURNING *', [id]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Data Peminjaman tidak ditemukan.' });
    return res.status(200).json({ message: 'Berhasil hapus data' });
  } catch (e) { return res.status(500).json({ message: e.message }); }
});

app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));