jest.mock('../db', () => ({ connect: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
const pool = require('../db');
const { createClient } = require('@supabase/supabase-js');
const { guardarImagen } = require('./imagenes');
const url = 'https://ejemplo.supabase.co/storage/v1/object/public/kmiss-media/';
const bucket = { upload: jest.fn(), remove: jest.fn(), getPublicUrl: jest.fn() };
const conexion = { query: jest.fn(), release: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  conexion.query.mockReset();
  process.env.IMAGE_STORAGE = 'supabase';
  process.env.SUPABASE_URL = 'https://ejemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'solo-prueba';
  pool.connect.mockResolvedValue(conexion);
  createClient.mockReturnValue({ storage: { from: () => bucket } });
  bucket.upload.mockResolvedValue({ error: null });
  bucket.remove.mockResolvedValue({ error: null });
  bucket.getPublicUrl.mockReturnValue({ data: { publicUrl: url + 'productos/nueva.png' } });
});

test('confirma la URL antes de borrar la imagen anterior', async () => {
  conexion.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ imagen_url: url + 'productos/vieja.png' }] })
    .mockResolvedValueOnce({ rows: [{ id: 1, imagen_url: url + 'productos/nueva.png' }] }).mockResolvedValueOnce({});
  const resultado = await guardarImagen('productos', 1, { buffer: Buffer.from('png'), mimetype: 'image/png' });
  expect(resultado.id).toBe(1);
  expect(conexion.query.mock.calls[2][0]).toContain('imagen_datos=NULL');
  expect(conexion.query.mock.calls[3][0]).toBe('COMMIT');
  expect(bucket.remove).toHaveBeenCalledWith(['productos/vieja.png']);
  expect(conexion.release).toHaveBeenCalled();
});

test('si falla el UPDATE conserva la anterior y limpia el archivo nuevo', async () => {
  conexion.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ imagen_url: url + 'productos/vieja.png' }] })
    .mockRejectedValueOnce(new Error('fallo simulado de BD')).mockResolvedValueOnce({});
  await expect(guardarImagen('productos', 1, { buffer: Buffer.from('png'), mimetype: 'image/png' })).rejects.toThrow('fallo simulado');
  expect(conexion.query.mock.calls[3][0]).toBe('ROLLBACK');
  expect(bucket.remove).toHaveBeenCalledTimes(1);
  expect(bucket.remove).toHaveBeenCalledWith(['productos/nueva.png']);
});

test('no sube archivos si el registro no existe', async () => {
  conexion.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({});
  expect(await guardarImagen('noticias', 999, { buffer: Buffer.from('png'), mimetype: 'image/png' })).toBeUndefined();
  expect(bucket.upload).not.toHaveBeenCalled();
});
