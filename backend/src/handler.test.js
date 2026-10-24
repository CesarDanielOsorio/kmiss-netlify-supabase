const request = require('supertest');
const jwt = require('jsonwebtoken');
jest.mock('./db', () => ({ query: jest.fn(), connect: jest.fn() }));
process.env.JWT_SECRET = 'clave-solo-para-pruebas';
const pool = require('./db');
const app = require('./app');
const { handler } = require('./handler');

test('la aplicación exportada conserva health y protege rutas privadas', async () => {
  expect((await request(app).get('/api/health')).status).toBe(200);
  expect((await request(app).get('/api/pacientes')).status).toBe(401);
  expect(pool.query).not.toHaveBeenCalled();
});

test.each(['/api/health', '/.netlify/functions/api/api/health'])('la función reconoce %s', async (path) => {
  const context = {};
  const respuesta = await handler({
    httpMethod: 'GET', path, headers: {}, queryStringParameters: {},
    requestContext: {}, body: null, isBase64Encoded: false,
  }, context);
  expect(respuesta.statusCode).toBe(200);
  expect(JSON.parse(respuesta.body).estado).toBe('ok');
  expect(context.callbackWaitsForEmptyEventLoop).toBe(false);
});

test('Netlify conserva multipart binario y devuelve la imagen guardada', async () => {
  process.env.IMAGE_STORAGE = 'postgres';
  pool.query.mockResolvedValueOnce({ rows: [{ id: 1, imagen_url: '/api/media/productos/1' }] });
  const token = jwt.sign({ id: 1, rol: 'administrador' }, process.env.JWT_SECRET);
  const boundary = 'prueba-kmiss';
  const datos = Buffer.from([0, 255, 137, 80, 78, 71]);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="imagen"; filename="foto.png"\r\nContent-Type: image/png\r\n\r\n`),
    datos, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const respuesta = await handler({
    httpMethod: 'POST', path: '/.netlify/functions/api/api/productos/1/imagen',
    headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
    queryStringParameters: {}, requestContext: {}, body: body.toString('base64'), isBase64Encoded: true,
  }, {});
  expect(respuesta.statusCode).toBe(200);
  expect(JSON.parse(respuesta.body).id).toBe(1);
  expect(pool.query.mock.calls.at(-1)[1][1]).toEqual(datos);
});

test('rechaza cargas mayores de 4 MB antes de guardar datos', async () => {
  const token = jwt.sign({ id: 1, rol: 'administrador' }, process.env.JWT_SECRET);
  const respuesta = await request(app).post('/api/servicios/1/imagen')
    .set('Authorization', `Bearer ${token}`)
    .attach('imagen', Buffer.alloc(4 * 1024 * 1024 + 1), { filename: 'foto.png', contentType: 'image/png' });
  expect(respuesta.status).toBe(413);
});
