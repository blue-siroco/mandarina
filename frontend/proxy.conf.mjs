// Proxy del dev server. API_TARGET elige a quién habla el frontend:
// el backend real (por defecto) o el mock (`http://mock-api:4000`).
const target = process.env.API_TARGET ?? 'http://backend:4000';

export default {
  '/api': { target, secure: false },
  '/ws': { target, ws: true, secure: false },
};
