const multer = require('multer');

const almacenamiento = multer.memoryStorage();

function filtroArchivo(req, file, cb) {
  const nombreValido = /\.(xlsx|xls)$/i.test(file.originalname);
  if (nombreValido) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos Excel (.xlsx o .xls)'));
  }
}

const upload = multer({
  storage: almacenamiento,
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB: margen para multipart y Base64 en Netlify
  fileFilter: filtroArchivo,
});

module.exports = upload;
